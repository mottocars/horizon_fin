const pool = require('../../config/db');
const dfcAging = require('../dfc-aging/dfcAging.service');
const { SAIDAS } = require('../dfc-projecao-cef/projecaoCef.service');
const dfcEmpresarial = require('../dfc-empresarial/dfcEmpresarial.service');
const dfcMascaras = require('../dfc-mascaras/dfcMascaras.service');
const { regrasParcela } = require('../dfc-mascaras/regrasParcela');

// DFC Construtoras > Orçamentos: versões, consolidado e log (pedido do usuário).
//
// O Orçamento mostra o CONSOLIDADO (dfc_orcamento_valores) — os valores da última versão salva. As
// fontes continuam mudando por conta própria (valor digitado em "HORIZON - INFORMADO", Projeção
// CEF, Aging do Sienge, plano de contas), mas isso só chega no Orçamento em "Salvar Versão", que
// recalcula os valores atuais de todas as fontes (`valoresAtuais`), compara com o consolidado e
// grava a diferença — cada valor que entrou, mudou ou saiu ganha uma linha em dfc_orcamento_log,
// com quem fez a mudança na origem e quando.
//
// Tipo de parcela (`tipo_parcela`, '' = o de sempre): a conta assumida por máscaras detalhadas por tipo de
// parcela (aba Máscaras — dfc-mascaras/regrasParcela.js) sai do plano de contas e recebe as origens das
// máscaras, um valor por tipo de parcela (Projeção CEF no único tipo da máscara CEF; Aging a receber pelo
// tipo de cada parcela). Cada valor é centro × conta × tipo × mês.

const ORIGEM_INFORMADO = 'HORIZON_ORCAMENTO_INFORMADO';
// De onde veio o valor informado (dfc_orcamento_informado.via) -> como aparece no log da versão.
const FONTE_INFORMADO = {
  TELA: 'Digitado na aba Projeções',
  MCP: 'Informado pelo Claude (conector MCP)',
  PLANILHA: 'Importado da Planilha Orçamentária',
};
const LIMPO_INFORMADO = {
  TELA: 'Valor limpo na aba Projeções',
  MCP: 'Valor limpo pelo Claude (conector MCP)',
  PLANILHA: 'Valor limpo pela Planilha Orçamentária',
};
const ORIGEM_AGING = 'SIENGE_AGING';
const ROTULO_AGING = { receber: 'Aging a receber (Sienge)', pagar: 'Aging a pagar (Sienge)' };
const ORIGEM_EMPRESARIAL = dfcEmpresarial.ORIGEM;

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Sem tipo de parcela, a chave de sempre (centro|conta|mês); com tipo, ele vai no fim.
const chaveDe = (centroId, siengeId, mes, tipo = '') => `${centroId}|${siengeId}|${mes}${tipo ? `|${tipo}` : ''}`;

// Períodos que a nova versão altera (escolha da janela "Nova versão"): 'todos' recalcula inclusive os
// meses passados; 'atual_em_diante' só do mês atual (Brasília) em diante — os meses anteriores ficam
// travados com os valores da última versão salva.
const PERIODOS = ['todos', 'atual_em_diante'];
const mesAtualBrasilia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
// Versões da DFC (dfc-versoes): o "atual em diante" é do mês seguinte ao corte da versão (o primeiro mês sem
// realizado); fora de uma versão, o mês atual.
function primeiroMesProjetado() {
  const corte = require('../dfc-versoes/contexto').dfcAtual()?.corte;
  if (!corte) return mesAtualBrasilia();
  const [a, m] = corte.slice(0, 7).split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}
const aPartirDe = (periodos) => (periodos === 'atual_em_diante' ? primeiroMesProjetado() : null);

// Meses travados: antes de `mes`, vale o consolidado (o que estiver nas fontes é ignorado).
function travarAntesDe(atual, cons, mes) {
  if (!mes) return atual;
  const travado = new Map([...atual].filter(([, v]) => v.mes >= mes));
  cons.forEach((v, chave) => {
    if (v.mes < mes) travado.set(chave, { ...v });
  });
  return travado;
}
const centavos = (v) => Math.round(Number(v) * 100);
const arredondar = (v) => Math.round(Number(v) * 100) / 100;

// Plano de contas que cada centro com "Projeta DFC" usa (o próprio, se tiver, senão o Global):
// Map centro -> Map conta -> { origem, projeta }. Conta sem linha = sem origem e Projeta DFC marcado.
async function planos(db, empresaId) {
  const { rows: centros } = await db.query(
    `SELECT c.sienge_id,
            EXISTS (SELECT 1 FROM dfc_plano_contas_versoes v WHERE v.empresa_id = c.empresa_id AND v.centro_id = c.sienge_id) AS proprio
       FROM centros_custo_sienge c WHERE c.empresa_id = $1 AND c.projeta_dfc`,
    [empresaId]
  );
  const { rows: global } = await db.query(
    'SELECT sienge_id, origem_projecao, projeta_dfc FROM dfc_plano_contas WHERE empresa_id = $1',
    [empresaId]
  );
  const { rows: proprios } = await db.query(
    'SELECT centro_id, sienge_id, origem_projecao, projeta_dfc FROM dfc_plano_contas_centro WHERE empresa_id = $1',
    [empresaId]
  );
  const conta = (r) => ({ origem: r.origem_projecao, projeta: r.projeta_dfc });
  const planoGlobal = new Map(global.map((r) => [r.sienge_id, conta(r)]));
  const porCentro = new Map();
  proprios.forEach((r) => {
    if (!porCentro.has(r.centro_id)) porCentro.set(r.centro_id, new Map());
    porCentro.get(r.centro_id).set(r.sienge_id, conta(r));
  });
  return new Map(centros.map((c) => [c.sienge_id, c.proprio ? porCentro.get(c.sienge_id) || new Map() : planoGlobal]));
}

// Última execução com sucesso de uma rotina do Monitor (quem disparou e quando; agendada = sem pessoa).
async function ultimaExecucao(db, empresaId, rotina) {
  const { rows } = await db.query(
    `SELECT usuario_id, finalizado_em, origem FROM monitor_integracoes_execucoes
      WHERE empresa_id = $1 AND rotina = $2 AND status = 'sucesso'
      ORDER BY finalizado_em DESC LIMIT 1`,
    [empresaId, rotina]
  );
  return rows[0] || null;
}

// Valores de hoje de todas as fontes, só nas contas que valem no plano de cada centro (origem
// certa e "Projeta DFC" marcado). Map chave -> { centro_id, sienge_id, mes, valor, origem, fonte,
// fonte_descricao, responsavel_id, responsavel_em }. Também devolve o contexto pra atribuir as
// exclusões e os avisos.
async function valoresAtuais(db, empresaId) {
  const [plano, mascaras] = await Promise.all([planos(db, empresaId), dfcMascaras.list(empresaId, db)]);
  const regras = regrasParcela(mascaras);
  const contaDoCentro = (centroId, siengeId) => plano.get(centroId)?.get(siengeId) || null;
  const vale = (centroId, siengeId, origem) => {
    const c = contaDoCentro(centroId, siengeId);
    return Boolean(c) && c.origem === origem && c.projeta !== false;
  };
  const valores = new Map();
  // `daMascara`: valor das origens de uma máscara por tipo de parcela (com `tipo_parcela`). A conta
  // assumida por máscaras não recebe mais nada pelo plano de contas.
  const somar = (centroId, siengeId, mes, valor, { daMascara = false, tipo_parcela: tipo = '', ...info }) => {
    if (!valor) return;
    if (!daMascara && regras.assumida(siengeId)) return;
    const chave = chaveDe(centroId, siengeId, mes, tipo);
    const atual = valores.get(chave);
    if (!atual) {
      valores.set(chave, { centro_id: centroId, sienge_id: siengeId, tipo_parcela: tipo, mes, valor: arredondar(valor), ...info });
      return;
    }
    // Duas fontes no mesmo valor (Aging a receber + a pagar na mesma conta, ou CEF - NOVO REGISTRO +
    // CEF - MEDIÇÃO no mesmo tipo de parcela): soma, e o responsável é a mudança mais recente.
    atual.valor = arredondar(atual.valor + valor);
    atual.fonte_descricao =
      atual.origem === ORIGEM_AGING && info.origem === ORIGEM_AGING
        ? 'Aging a receber e a pagar (Sienge)'
        : atual.fonte_descricao === info.fonte_descricao
          ? atual.fonte_descricao
          : `${atual.fonte_descricao} + ${info.fonte_descricao}`;
    if ((info.responsavel_em || 0) > (atual.responsavel_em || 0)) {
      atual.responsavel_id = info.responsavel_id;
      atual.responsavel_em = info.responsavel_em;
    }
  };

  // 1) Digitados na aba (HORIZON - INFORMADO). Linha com valor NULL = limpo (guarda quem limpou).
  const { rows: informados } = await db.query(
    `SELECT centro_id, sienge_id, to_char(mes, 'YYYY-MM') AS mes, valor, usuario_id, atualizado_em, via
       FROM dfc_orcamento_informado WHERE empresa_id = $1`,
    [empresaId]
  );
  const informadosLimpos = new Map();
  informados.forEach((r) => {
    if (r.valor === null) {
      informadosLimpos.set(chaveDe(r.centro_id, r.sienge_id, r.mes), r);
      return;
    }
    if (!vale(r.centro_id, r.sienge_id, ORIGEM_INFORMADO)) return;
    somar(r.centro_id, r.sienge_id, r.mes, Number(r.valor), {
      origem: ORIGEM_INFORMADO,
      fonte: 'MANUAL',
      fonte_descricao: FONTE_INFORMADO[r.via] || FONTE_INFORMADO.TELA,
      responsavel_id: r.usuario_id,
      responsavel_em: r.atualizado_em,
    });
  });

  // 2) Projeção CEF: cada saída na conta com a origem CEF correspondente no plano do centro.
  const { rows: cef } = await db.query(
    `SELECT p.sienge_id AS centro_id, to_char(p.mes, 'YYYY-MM') AS mes, p.novo_registro, p.medicao, p.credito_pj,
            p.juros, p.amortizacao, e.usuario_id, e.atualizado_em, e.versao_parametros
       FROM dfc_projecao_cef p
       LEFT JOIN dfc_projecao_cef_execucao e ON e.empresa_id = p.empresa_id AND e.sienge_id = p.sienge_id
      WHERE p.empresa_id = $1`,
    [empresaId]
  );
  const contaCefPorCentro = new Map(); // centro -> origem CEF -> conta
  plano.forEach((contas, centroId) => {
    const porOrigem = {};
    contas.forEach((c, siengeId) => {
      // Origem CEF usada por uma máscara por tipo de parcela fica com a máscara (não lança no plano).
      if (c.origem in SAIDAS && c.projeta !== false && !regras.cefPorOrigem.has(c.origem)) porOrigem[c.origem] = siengeId;
    });
    contaCefPorCentro.set(centroId, porOrigem);
  });
  const execucoesCef = new Map();
  cef.forEach((r) => {
    execucoesCef.set(r.centro_id, r);
    const porOrigem = contaCefPorCentro.get(r.centro_id);
    if (!porOrigem) return;
    Object.entries(SAIDAS).forEach(([origem, { coluna, sinal }]) => {
      const conta = porOrigem[origem];
      if (conta === undefined) return;
      somar(r.centro_id, conta, r.mes, Number(r[coluna]) * sinal, {
        origem,
        fonte: 'INTEGRACAO',
        fonte_descricao: `Projeção CEF${r.versao_parametros ? ` (Parâmetros v${r.versao_parametros})` : ''}`,
        responsavel_id: r.usuario_id,
        responsavel_em: r.atualizado_em,
      });
    });
    // Máscaras por tipo de parcela com origem CEF: na conta da máscara, no único tipo dela (só centros
    // com "Projeta DFC").
    if (!plano.has(r.centro_id)) return;
    regras.cef.forEach((m) =>
      m.origens.forEach((origem) => {
        const { coluna, sinal } = SAIDAS[origem];
        somar(r.centro_id, m.conta, r.mes, Number(r[coluna]) * sinal, {
          daMascara: true,
          tipo_parcela: m.tipo,
          origem,
          fonte: 'INTEGRACAO',
          fonte_descricao: `Projeção CEF${r.versao_parametros ? ` (Parâmetros v${r.versao_parametros})` : ''}`,
          responsavel_id: r.usuario_id,
          responsavel_em: r.atualizado_em,
        });
      })
    );
  });

  // 3) Aging do Sienge (a receber e a pagar) — já filtrado pelo plano em dfc-aging.
  const bases = {};
  const execucoesAging = {};
  for (const tipo of ['receber', 'pagar']) {
    const [{ valores: aging, base }, exec] = await Promise.all([
      dfcAging.aging(empresaId, tipo),
      ultimaExecucao(db, empresaId, dfcAging.TIPOS[tipo].rotina),
    ]);
    bases[tipo] = base;
    execucoesAging[tipo] = exec;
    aging.forEach((v) => {
      somar(v.centro_id, v.conta, v.mes, v.valor, {
        origem: ORIGEM_AGING,
        fonte: 'INTEGRACAO',
        fonte_descricao: `${ROTULO_AGING[tipo]}${exec?.origem === 'agendada' ? ' — atualização agendada' : ''}`,
        responsavel_id: exec?.usuario_id ?? null,
        responsavel_em: exec?.finalizado_em ?? base.atualizado_em ?? null,
      });
    });
  }

  // 3b) Aging a receber das máscaras por tipo de parcela (SIENGE - AGING): por tipo de cada parcela.
  if (regras.aging.length) {
    const exec = execucoesAging.receber;
    (await dfcAging.agingPorTipo(empresaId, regras.aging)).forEach((v) => {
      somar(v.centro_id, v.conta, v.mes, v.valor, {
        daMascara: true,
        tipo_parcela: v.tipo_parcela,
        origem: ORIGEM_AGING,
        fonte: 'INTEGRACAO',
        fonte_descricao: `${ROTULO_AGING.receber} por tipo de parcela${exec?.origem === 'agendada' ? ' — atualização agendada' : ''}`,
        responsavel_id: exec?.usuario_id ?? null,
        responsavel_em: exec?.finalizado_em ?? bases.receber?.atualizado_em ?? null,
      });
    });
  }

  // 4) Orçamento Empresarial do Sienge (última versão), deslocado pelo prazo médio de desembolso de
  //    cada natureza — já filtrado pelo plano em dfc-empresarial.
  const [empresarial, execEmpresarial] = await Promise.all([
    dfcEmpresarial.valores(empresaId),
    ultimaExecucao(db, empresaId, dfcEmpresarial.ROTINA),
  ]);
  const versoesEmpresarial = [...new Set(empresarial.versoes.map((v) => v.version_number))].filter((v) => v !== null);
  empresarial.valores.forEach((v) => {
    somar(v.centro_id, v.conta, v.mes, v.valor, {
      origem: ORIGEM_EMPRESARIAL,
      fonte: 'INTEGRACAO',
      fonte_descricao: `Orçamento Empresarial (Sienge)${
        versoesEmpresarial.length === 1 ? ` v${versoesEmpresarial[0]}` : ''
      } no prazo médio de desembolso da natureza${execEmpresarial?.origem === 'agendada' ? ' — atualização agendada' : ''}`,
      responsavel_id: execEmpresarial?.usuario_id ?? null,
      responsavel_em: execEmpresarial?.finalizado_em ?? empresarial.base.atualizado_em ?? null,
    });
  });

  return {
    valores,
    contexto: {
      contaDoCentro,
      regras,
      informadosLimpos,
      execucoesCef,
      execucoesAging,
      bases,
      empresarial: { base: empresarial.base, semCronograma: empresarial.sem_cronograma, execucao: execEmpresarial },
    },
  };
}

// Consolidado (última versão salva): Map chave -> { centro_id, sienge_id, mes, valor, origem }.
async function consolidado(db, empresaId) {
  const { rows } = await db.query(
    `SELECT centro_id, sienge_id, tipo_parcela, to_char(mes, 'YYYY-MM') AS mes, valor, origem
       FROM dfc_orcamento_valores WHERE empresa_id = $1`,
    [empresaId]
  );
  return new Map(rows.map((r) => [chaveDe(r.centro_id, r.sienge_id, r.mes, r.tipo_parcela), { ...r, valor: Number(r.valor) }]));
}

// Quem tirou um valor do Orçamento (ele está no consolidado e não está mais nas fontes).
function responsavelExclusao(anterior, contexto, salvoPor, agora) {
  const { centro_id: centroId, sienge_id: siengeId, mes, origem, tipo_parcela: tipo = '' } = anterior;
  // Conta que passou a ser de máscaras por tipo de parcela: o valor de sempre (sem tipo) sai.
  if (!tipo && contexto.regras.assumida(siengeId)) {
    return {
      origem,
      fonte: 'PLANO',
      fonte_descricao: 'Conta passou a ser detalhada por tipo de parcela (aba Máscaras)',
      responsavel_id: salvoPor,
      responsavel_em: agora,
    };
  }
  // Valor de um tipo de parcela que saiu (tipo, origem ou conta mudou na máscara, ou a base mudou).
  if (tipo && !(origem in SAIDAS) && origem !== ORIGEM_AGING) {
    return { origem, fonte: 'PLANO', fonte_descricao: 'Máscara por tipo de parcela alterada', responsavel_id: salvoPor, responsavel_em: agora };
  }
  const conta = tipo ? { origem, projeta: true } : contexto.contaDoCentro(centroId, siengeId);
  const contaAindaVale = Boolean(conta) && conta.origem === origem && conta.projeta !== false;
  if (!contaAindaVale) {
    return {
      origem,
      fonte: 'PLANO',
      fonte_descricao: 'Conta tirada do Orçamento no Plano Contas (Origem Projeção ou Projeta DFC) ou centro sem Projeta DFC',
      responsavel_id: salvoPor,
      responsavel_em: agora,
    };
  }
  if (origem === ORIGEM_INFORMADO) {
    const limpo = contexto.informadosLimpos.get(chaveDe(centroId, siengeId, mes));
    return {
      origem,
      fonte: 'MANUAL',
      fonte_descricao: LIMPO_INFORMADO[limpo?.via] || LIMPO_INFORMADO.TELA,
      responsavel_id: limpo?.usuario_id ?? salvoPor,
      responsavel_em: limpo?.atualizado_em ?? agora,
    };
  }
  if (origem in SAIDAS) {
    const exec = contexto.execucoesCef.get(centroId);
    return {
      origem,
      fonte: 'INTEGRACAO',
      fonte_descricao: 'Projeção CEF',
      responsavel_id: exec?.usuario_id ?? salvoPor,
      responsavel_em: exec?.atualizado_em ?? agora,
    };
  }
  if (origem === ORIGEM_EMPRESARIAL) {
    const exec = contexto.empresarial?.execucao;
    return {
      origem,
      fonte: 'INTEGRACAO',
      fonte_descricao: 'Orçamento Empresarial (Sienge)',
      responsavel_id: exec?.usuario_id ?? null,
      responsavel_em: exec?.finalizado_em ?? agora,
    };
  }
  if (origem === ORIGEM_AGING) {
    const execs = Object.entries(contexto.execucoesAging).filter(([, e]) => e);
    const [tipo, exec] = execs.sort((a, b) => new Date(b[1].finalizado_em) - new Date(a[1].finalizado_em))[0] || [];
    return {
      origem,
      fonte: 'INTEGRACAO',
      fonte_descricao: tipo ? ROTULO_AGING[tipo] : 'Aging (Sienge)',
      responsavel_id: exec?.usuario_id ?? null,
      responsavel_em: exec?.finalizado_em ?? agora,
    };
  }
  return { origem, fonte: 'PLANO', fonte_descricao: 'Origem sem valores', responsavel_id: salvoPor, responsavel_em: agora };
}

// Diferença entre as fontes de hoje e o consolidado: [{ chave, tipo, anterior, novo, info }].
function diferencas(atual, cons, contexto, salvoPor = null, agora = new Date()) {
  const lista = [];
  atual.forEach((novo, chave) => {
    const anterior = cons.get(chave);
    if (!anterior) lista.push({ chave, tipo: 'INCLUSAO', anterior: null, novo, info: novo });
    else if (centavos(anterior.valor) !== centavos(novo.valor)) lista.push({ chave, tipo: 'ALTERACAO', anterior, novo, info: novo });
  });
  cons.forEach((anterior, chave) => {
    if (!atual.has(chave)) {
      lista.push({ chave, tipo: 'EXCLUSAO', anterior, novo: null, info: responsavelExclusao(anterior, contexto, salvoPor, agora) });
    }
  });
  return lista;
}

function contar(lista) {
  const n = (f) => lista.filter(f).length;
  return {
    total: lista.length,
    inclusoes: n((d) => d.tipo === 'INCLUSAO'),
    alteracoes: n((d) => d.tipo === 'ALTERACAO'),
    exclusoes: n((d) => d.tipo === 'EXCLUSAO'),
    manuais: n((d) => d.info.fonte === 'MANUAL'),
    integracao: n((d) => d.info.fonte === 'INTEGRACAO'),
    plano: n((d) => d.info.fonte === 'PLANO'),
  };
}

async function ultimaVersao(db, empresaId) {
  const { rows } = await db.query(
    `SELECT v.id, v.numero, v.criado_em, v.valores, v.inclusoes, v.alteracoes, v.exclusoes, u.nome AS usuario
       FROM dfc_orcamento_versoes v LEFT JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.empresa_id = $1 ORDER BY v.numero DESC LIMIT 1`,
    [empresaId]
  );
  return rows[0] || null;
}

const semChave = ({ centro_id, sienge_id, tipo_parcela = '', mes, valor }) => ({ centro_id, sienge_id, tipo_parcela, mes, valor });

async function listarVersoes(empresaId) {
  const { rows } = await pool.query(
    `SELECT v.numero, v.criado_em, v.valores, v.inclusoes, v.alteracoes, v.exclusoes, u.nome AS usuario
       FROM dfc_orcamento_versoes v LEFT JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.empresa_id = $1 ORDER BY v.numero DESC`,
    [empresaId]
  );
  return rows;
}

// Valores de uma versão salva antiga, remontados pelo log: pra cada valor, o último registro até
// aquela versão (EXCLUSAO = não estava mais lá).
async function valoresDaVersao(empresaId, numero) {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (l.centro_id, l.sienge_id, l.tipo_parcela, l.mes)
              l.centro_id, l.sienge_id, l.tipo_parcela, to_char(l.mes, 'YYYY-MM') AS mes, l.tipo, l.valor_novo AS valor, l.origem
         FROM dfc_orcamento_log l
         JOIN dfc_orcamento_versoes v ON v.id = l.versao_id
        WHERE l.empresa_id = $1 AND v.numero <= $2
        ORDER BY l.centro_id, l.sienge_id, l.tipo_parcela, l.mes, v.numero DESC, l.id DESC
     ) x WHERE tipo <> 'EXCLUSAO'`,
    [empresaId, numero]
  );
  return rows.map((r) => ({
    centro_id: r.centro_id,
    sienge_id: r.sienge_id,
    tipo_parcela: r.tipo_parcela,
    mes: r.mes,
    valor: Number(r.valor),
    origem: r.origem,
  }));
}

// Uma versão salva (filtro "Versão" da aba): `numero` ou, sem ele, a última. Devolve também a lista
// de versões pro filtro.
async function orcamento(empresaId, numero = null) {
  const versoes = await listarVersoes(empresaId);
  const versao = numero ? versoes.find((v) => v.numero === numero) : versoes[0];
  if (numero && !versao) throw erro(404, `A versão ${numero} não existe.`);
  let valores = [];
  if (versao) {
    valores =
      versao.numero === versoes[0].numero
        ? [...(await consolidado(pool, empresaId)).values()].map((v) => ({ ...semChave(v), origem: v.origem }))
        : await valoresDaVersao(empresaId, versao.numero);
  }
  return { versoes, versao: versao || null, valores };
}

// "Nova versão": os valores de hoje de todas as bases (Projeção CEF, Aging do Sienge, digitados em
// HORIZON - INFORMADO) — o que "Salvar Versão" vai gravar —, os da última versão (pra comparar) e o
// que muda em relação a ela.
// `periodos`: ver PERIODOS — com 'atual_em_diante', os meses anteriores vêm da última versão.
async function rascunho(empresaId, { periodos = 'todos' } = {}) {
  const [{ valores: fontes, contexto }, cons, versao] = await Promise.all([
    valoresAtuais(pool, empresaId),
    consolidado(pool, empresaId),
    ultimaVersao(pool, empresaId),
  ]);
  const travadoAntes = aPartirDe(periodos);
  const atual = travarAntesDe(fontes, cons, travadoAntes);
  const avisos = Object.entries(contexto.bases)
    .filter(([, base]) => !base.parcelas)
    .map(
      ([tipo]) =>
        `A base do contas a ${tipo} do Sienge ainda não foi carregada — o Aging a ${tipo} fica sem valores. Atualize em Nova versão.`
    );
  if (!contexto.empresarial.base.registros) {
    avisos.push(
      'A base do Orçamento Empresarial do Sienge ainda não foi carregada — as naturezas EMPRESARIAL DESEMBOLSO ficam sem valores. Atualize em Nova versão.'
    );
  }
  if (contexto.empresarial.semCronograma.length) {
    const { rows } = await pool.query(
      'SELECT sienge_id, name FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id = ANY($2::int[]) ORDER BY sienge_id',
      [empresaId, contexto.empresarial.semCronograma]
    );
    avisos.push(
      `Sem prazo médio de desembolso (natureza sem títulos nos últimos 12 meses) — o Orçamento Empresarial sai no próprio mês orçado: ${rows
        .map((r) => `${r.sienge_id} ${r.name}`)
        .join(', ')}.`
    );
  }
  return {
    gerado_em: new Date(),
    versao_base: versao ? versao.numero : null,
    periodos,
    a_partir_de: travadoAntes,
    valores: [...atual.values()].map(semChave),
    valores_versao: [...cons.values()].map(semChave),
    pendencias: contar(diferencas(atual, cons, contexto)),
    avisos,
  };
}

// "Gerar orçamento" (antes "Salvar Versão" — versões da DFC, 25/11/2026): consolida as fontes de hoje no Orçamento
// da versão aberta da DFC e grava o log do que mudou; o registro da geração (dfc_orcamento_versoes) fica ligado à
// versão da DFC (dfc_versao_id) e o Orçamento só fica cravado ao salvar a versão da DFC. Nada mudou = não grava.
// `origem` (conector MCP "DFC CONSTRUTORAS (ALTERA ORÇAMENTO)"): grava só as mudanças daquela origem
// (HORIZON - INFORMADO); as pendências das outras fontes continuam pendentes para a próxima versão.
// `periodos` (ver PERIODOS): com 'atual_em_diante', os meses anteriores ao atual não mudam.
async function salvarVersao(empresaId, usuarioId, { origem = null, periodos = 'todos' } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Uma gravação de versão por empresa de cada vez.
    await client.query('SELECT pg_advisory_xact_lock(73110, $1)', [empresaId]);
    const agora = new Date();
    const [{ valores: fontes, contexto }, cons, anterior] = await Promise.all([
      valoresAtuais(client, empresaId),
      consolidado(client, empresaId),
      ultimaVersao(client, empresaId),
    ]);
    const travadoAntes = aPartirDe(periodos);
    const atual = travarAntesDe(fontes, cons, travadoAntes);
    const lista = diferencas(atual, cons, contexto, usuarioId, agora).filter((d) => !origem || (d.info.origem === origem && d.info.fonte === 'MANUAL'));
    if (!lista.length) {
      throw erro(
        409,
        origem
          ? 'Não há valores informados pendentes de salvar.'
          : anterior
            ? `O Orçamento já está igual às bases${
                travadoAntes ? ` do mês ${travadoAntes.slice(5, 7)}/${travadoAntes.slice(0, 4)} em diante (os meses anteriores estão travados)` : ''
              } — não há o que gerar.`
            : 'Ainda não há nenhum valor nas bases para gerar o Orçamento.'
      );
    }
    const resumo = contar(lista);
    const numero = (anterior?.numero || 0) + 1;
    const totalValores = origem ? cons.size + resumo.inclusoes - resumo.exclusoes : atual.size;
    const { rows } = await client.query(
      `INSERT INTO dfc_orcamento_versoes (empresa_id, numero, usuario_id, criado_em, valores, inclusoes, alteracoes, exclusoes, dfc_versao_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        empresaId,
        numero,
        usuarioId,
        agora,
        totalValores,
        resumo.inclusoes,
        resumo.alteracoes,
        resumo.exclusoes,
        require('../dfc-versoes/contexto').dfcAtual()?.versao?.id ?? null,
      ]
    );
    const versaoId = rows[0].id;

    const gravar = lista.filter((d) => d.novo).map((d) => d.novo);
    if (gravar.length) {
      await client.query(
        `INSERT INTO dfc_orcamento_valores (empresa_id, centro_id, sienge_id, tipo_parcela, mes, valor, origem, versao_id)
         SELECT $1, x.centro_id, x.sienge_id, COALESCE(x.tipo_parcela, ''), (x.mes || '-01')::date, x.valor, x.origem, $2
           FROM json_to_recordset($3::json) AS x(centro_id int, sienge_id int, tipo_parcela text, mes text, valor numeric, origem text)
         ON CONFLICT (empresa_id, centro_id, sienge_id, tipo_parcela, mes)
         DO UPDATE SET valor = EXCLUDED.valor, origem = EXCLUDED.origem, versao_id = EXCLUDED.versao_id`,
        [empresaId, versaoId, JSON.stringify(gravar)]
      );
    }
    const apagar = lista.filter((d) => !d.novo).map((d) => d.anterior);
    if (apagar.length) {
      await client.query(
        `DELETE FROM dfc_orcamento_valores v
          USING json_to_recordset($2::json) AS x(centro_id int, sienge_id int, tipo_parcela text, mes text)
          WHERE v.empresa_id = $1 AND v.centro_id = x.centro_id AND v.sienge_id = x.sienge_id
            AND v.tipo_parcela = COALESCE(x.tipo_parcela, '') AND v.mes = (x.mes || '-01')::date`,
        [empresaId, JSON.stringify(apagar)]
      );
    }

    const log = lista.map((d) => {
      const base = d.novo || d.anterior;
      return {
        centro_id: base.centro_id,
        sienge_id: base.sienge_id,
        tipo_parcela: base.tipo_parcela || '',
        mes: base.mes,
        tipo: d.tipo,
        valor_anterior: d.anterior ? d.anterior.valor : null,
        valor_novo: d.novo ? d.novo.valor : null,
        origem: d.info.origem,
        fonte: d.info.fonte,
        fonte_descricao: d.info.fonte_descricao,
        responsavel_id: d.info.responsavel_id ?? null,
        responsavel_em: d.info.responsavel_em ? new Date(d.info.responsavel_em).toISOString() : null,
      };
    });
    await client.query(
      `INSERT INTO dfc_orcamento_log (empresa_id, centro_id, sienge_id, tipo_parcela, mes, versao_id, tipo, valor_anterior, valor_novo,
                                      origem, fonte, fonte_descricao, responsavel_id, responsavel_em)
       SELECT $1, x.centro_id, x.sienge_id, x.tipo_parcela, (x.mes || '-01')::date, $2, x.tipo, x.valor_anterior, x.valor_novo,
              x.origem, x.fonte, x.fonte_descricao, x.responsavel_id, x.responsavel_em
         FROM json_to_recordset($3::json) AS x(centro_id int, sienge_id int, tipo_parcela text, mes text, tipo text, valor_anterior numeric,
              valor_novo numeric, origem text, fonte text, fonte_descricao text, responsavel_id int, responsavel_em timestamptz)`,
      [empresaId, versaoId, JSON.stringify(log)]
    );

    await client.query('COMMIT');
    return { numero, criado_em: agora, valores: totalValores, periodos, a_partir_de: travadoAntes, ...resumo };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Log de alterações de um valor (centro × conta × mês, e o tipo de parcela — '' = o de sempre), da
// versão mais nova pra mais antiga, e o que está pendente nele (mudou na fonte e ainda não foi salvo).
async function log(empresaId, centroId, siengeId, mes, tipo = '') {
  const { rows } = await pool.query(
    `SELECT l.id, l.tipo, l.valor_anterior, l.valor_novo, l.origem, l.fonte, l.fonte_descricao, l.responsavel_em,
            ur.nome AS responsavel, v.numero AS versao, v.criado_em AS versao_em, uv.nome AS versao_por
       FROM dfc_orcamento_log l
       JOIN dfc_orcamento_versoes v ON v.id = l.versao_id
       LEFT JOIN usuarios ur ON ur.id = l.responsavel_id
       LEFT JOIN usuarios uv ON uv.id = v.usuario_id
      WHERE l.empresa_id = $1 AND l.centro_id = $2 AND l.sienge_id = $3 AND l.mes = $4 AND l.tipo_parcela = $5
      ORDER BY v.numero DESC, l.id DESC`,
    [empresaId, centroId, siengeId, `${mes}-01`, tipo]
  );
  const numero = (v) => (v === null ? null : Number(v));
  const historico = rows.map((r) => ({ ...r, valor_anterior: numero(r.valor_anterior), valor_novo: numero(r.valor_novo) }));

  const [{ valores: atual, contexto }, cons] = await Promise.all([valoresAtuais(pool, empresaId), consolidado(pool, empresaId)]);
  const chave = chaveDe(centroId, siengeId, mes, tipo);
  const soEste = (mapa) => new Map(mapa.has(chave) ? [[chave, mapa.get(chave)]] : []);
  const [d] = diferencas(soEste(atual), soEste(cons), contexto);
  let pendente = null;
  if (d) {
    const { rows: u } = d.info.responsavel_id
      ? await pool.query('SELECT nome FROM usuarios WHERE id = $1', [d.info.responsavel_id])
      : { rows: [] };
    pendente = {
      tipo: d.tipo,
      valor_anterior: d.anterior ? d.anterior.valor : null,
      valor_novo: d.novo ? d.novo.valor : null,
      origem: d.info.origem,
      fonte: d.info.fonte,
      fonte_descricao: d.info.fonte_descricao,
      responsavel: u[0]?.nome || null,
      responsavel_em: d.info.responsavel_em || null,
    };
  }
  return { historico, pendente };
}

// O que mudou nas fontes e ainda não foi salvo, só de uma origem (prévia do "Salvar Versão" do
// conector MCP): [{ tipo, centro_id, sienge_id, mes, valor_anterior, valor_novo, responsavel_id, responsavel_em }].
async function pendenciasDaOrigem(empresaId, origem) {
  const [{ valores: atual, contexto }, cons] = await Promise.all([valoresAtuais(pool, empresaId), consolidado(pool, empresaId)]);
  return diferencas(atual, cons, contexto)
    .filter((d) => d.info.origem === origem && d.info.fonte === 'MANUAL')
    .map((d) => {
      const base = d.novo || d.anterior;
      return {
        tipo: d.tipo,
        centro_id: base.centro_id,
        sienge_id: base.sienge_id,
        tipo_parcela: base.tipo_parcela || '',
        mes: base.mes,
        valor_anterior: d.anterior ? d.anterior.valor : null,
        valor_novo: d.novo ? d.novo.valor : null,
        fonte_descricao: d.info.fonte_descricao,
        responsavel_id: d.info.responsavel_id ?? null,
        responsavel_em: d.info.responsavel_em ?? null,
      };
    });
}

module.exports = { PERIODOS, orcamento, rascunho, salvarVersao, log, pendenciasDaOrigem };
