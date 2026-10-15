const pool = require('../../config/db');
const dfcAging = require('../dfc-aging/dfcAging.service');
const { SAIDAS } = require('../dfc-projecao-cef/projecaoCef.service');
const dfcEmpresarial = require('../dfc-empresarial/dfcEmpresarial.service');

// DFC Construtoras > Orçamentos: versões, consolidado e log (pedido do usuário).
//
// O Orçamento mostra o CONSOLIDADO (dfc_orcamento_valores) — os valores da última versão salva. As
// fontes continuam mudando por conta própria (valor digitado em "HORIZON - INFORMADO", Projeção
// CEF, Aging do Sienge, plano de contas), mas isso só chega no Orçamento em "Salvar Versão", que
// recalcula os valores atuais de todas as fontes (`valoresAtuais`), compara com o consolidado e
// grava a diferença — cada valor que entrou, mudou ou saiu ganha uma linha em dfc_orcamento_log,
// com quem fez a mudança na origem e quando.

const ORIGEM_INFORMADO = 'HORIZON_ORCAMENTO_INFORMADO';
const ORIGEM_AGING = 'SIENGE_AGING';
const ROTULO_AGING = { receber: 'Aging a receber (Sienge)', pagar: 'Aging a pagar (Sienge)' };
const ORIGEM_EMPRESARIAL = dfcEmpresarial.ORIGEM;

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const chaveDe = (centroId, siengeId, mes) => `${centroId}|${siengeId}|${mes}`;
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
  const plano = await planos(db, empresaId);
  const contaDoCentro = (centroId, siengeId) => plano.get(centroId)?.get(siengeId) || null;
  const vale = (centroId, siengeId, origem) => {
    const c = contaDoCentro(centroId, siengeId);
    return Boolean(c) && c.origem === origem && c.projeta !== false;
  };
  const valores = new Map();
  const somar = (centroId, siengeId, mes, valor, info) => {
    if (!valor) return;
    const chave = chaveDe(centroId, siengeId, mes);
    const atual = valores.get(chave);
    if (!atual) {
      valores.set(chave, { centro_id: centroId, sienge_id: siengeId, mes, valor: arredondar(valor), ...info });
      return;
    }
    // Duas fontes na mesma conta (só acontece com o Aging a receber + a pagar): soma, e o
    // responsável é a mudança mais recente.
    atual.valor = arredondar(atual.valor + valor);
    atual.fonte_descricao = 'Aging a receber e a pagar (Sienge)';
    if ((info.responsavel_em || 0) > (atual.responsavel_em || 0)) {
      atual.responsavel_id = info.responsavel_id;
      atual.responsavel_em = info.responsavel_em;
    }
  };

  // 1) Digitados na aba (HORIZON - INFORMADO). Linha com valor NULL = limpo (guarda quem limpou).
  const { rows: informados } = await db.query(
    `SELECT centro_id, sienge_id, to_char(mes, 'YYYY-MM') AS mes, valor, usuario_id, atualizado_em, via_mcp
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
      fonte_descricao: r.via_mcp ? 'Informado pelo Claude (conector MCP)' : 'Digitado na aba Orçamentos',
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
      if (c.origem in SAIDAS && c.projeta !== false) porOrigem[c.origem] = siengeId;
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
    `SELECT centro_id, sienge_id, to_char(mes, 'YYYY-MM') AS mes, valor, origem
       FROM dfc_orcamento_valores WHERE empresa_id = $1`,
    [empresaId]
  );
  return new Map(rows.map((r) => [chaveDe(r.centro_id, r.sienge_id, r.mes), { ...r, valor: Number(r.valor) }]));
}

// Quem tirou um valor do Orçamento (ele está no consolidado e não está mais nas fontes).
function responsavelExclusao(anterior, contexto, salvoPor, agora) {
  const { centro_id: centroId, sienge_id: siengeId, mes, origem } = anterior;
  const conta = contexto.contaDoCentro(centroId, siengeId);
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
      fonte_descricao: limpo?.via_mcp ? 'Valor limpo pelo Claude (conector MCP)' : 'Valor limpo na aba Orçamentos',
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

const semChave = ({ centro_id, sienge_id, mes, valor }) => ({ centro_id, sienge_id, mes, valor });

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
       SELECT DISTINCT ON (l.centro_id, l.sienge_id, l.mes)
              l.centro_id, l.sienge_id, to_char(l.mes, 'YYYY-MM') AS mes, l.tipo, l.valor_novo AS valor
         FROM dfc_orcamento_log l
         JOIN dfc_orcamento_versoes v ON v.id = l.versao_id
        WHERE l.empresa_id = $1 AND v.numero <= $2
        ORDER BY l.centro_id, l.sienge_id, l.mes, v.numero DESC, l.id DESC
     ) x WHERE tipo <> 'EXCLUSAO'`,
    [empresaId, numero]
  );
  return rows.map((r) => ({ centro_id: r.centro_id, sienge_id: r.sienge_id, mes: r.mes, valor: Number(r.valor) }));
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
        ? [...(await consolidado(pool, empresaId)).values()].map(semChave)
        : await valoresDaVersao(empresaId, versao.numero);
  }
  return { versoes, versao: versao || null, valores };
}

// "Nova versão": os valores de hoje de todas as bases (Projeção CEF, Aging do Sienge, digitados em
// HORIZON - INFORMADO) — o que "Salvar Versão" vai gravar —, os da última versão (pra comparar) e o
// que muda em relação a ela.
async function rascunho(empresaId) {
  const [{ valores: atual, contexto }, cons, versao] = await Promise.all([
    valoresAtuais(pool, empresaId),
    consolidado(pool, empresaId),
    ultimaVersao(pool, empresaId),
  ]);
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
    valores: [...atual.values()].map(semChave),
    valores_versao: [...cons.values()].map(semChave),
    pendencias: contar(diferencas(atual, cons, contexto)),
    avisos,
  };
}

// "Salvar Versão": consolida as fontes de hoje numa versão nova e grava o log do que mudou. Nada
// mudou = não cria versão (mesmo critério dos Parâmetros).
// `origem` (conector MCP "DFC CONSTRUTORAS (ALTERA ORÇAMENTO)"): grava só as mudanças daquela origem
// (HORIZON - INFORMADO); as pendências das outras fontes continuam pendentes para a próxima versão.
async function salvarVersao(empresaId, usuarioId, { origem = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Uma gravação de versão por empresa de cada vez.
    await client.query('SELECT pg_advisory_xact_lock(73110, $1)', [empresaId]);
    const agora = new Date();
    const [{ valores: atual, contexto }, cons, anterior] = await Promise.all([
      valoresAtuais(client, empresaId),
      consolidado(client, empresaId),
      ultimaVersao(client, empresaId),
    ]);
    const lista = diferencas(atual, cons, contexto, usuarioId, agora).filter((d) => !origem || (d.info.origem === origem && d.info.fonte === 'MANUAL'));
    if (!lista.length) {
      throw erro(
        409,
        origem
          ? 'Não há valores informados pendentes de salvar.'
          : anterior
            ? `Nada mudou desde a versão ${anterior.numero} — não há o que salvar.`
            : 'Ainda não há nenhum valor no Orçamento pra salvar.'
      );
    }
    const resumo = contar(lista);
    const numero = (anterior?.numero || 0) + 1;
    const totalValores = origem ? cons.size + resumo.inclusoes - resumo.exclusoes : atual.size;
    const { rows } = await client.query(
      `INSERT INTO dfc_orcamento_versoes (empresa_id, numero, usuario_id, criado_em, valores, inclusoes, alteracoes, exclusoes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [empresaId, numero, usuarioId, agora, totalValores, resumo.inclusoes, resumo.alteracoes, resumo.exclusoes]
    );
    const versaoId = rows[0].id;

    const gravar = lista.filter((d) => d.novo).map((d) => d.novo);
    if (gravar.length) {
      await client.query(
        `INSERT INTO dfc_orcamento_valores (empresa_id, centro_id, sienge_id, mes, valor, origem, versao_id)
         SELECT $1, x.centro_id, x.sienge_id, (x.mes || '-01')::date, x.valor, x.origem, $2
           FROM json_to_recordset($3::json) AS x(centro_id int, sienge_id int, mes text, valor numeric, origem text)
         ON CONFLICT (empresa_id, centro_id, sienge_id, mes)
         DO UPDATE SET valor = EXCLUDED.valor, origem = EXCLUDED.origem, versao_id = EXCLUDED.versao_id`,
        [empresaId, versaoId, JSON.stringify(gravar)]
      );
    }
    const apagar = lista.filter((d) => !d.novo).map((d) => d.anterior);
    if (apagar.length) {
      await client.query(
        `DELETE FROM dfc_orcamento_valores v
          USING json_to_recordset($2::json) AS x(centro_id int, sienge_id int, mes text)
          WHERE v.empresa_id = $1 AND v.centro_id = x.centro_id AND v.sienge_id = x.sienge_id AND v.mes = (x.mes || '-01')::date`,
        [empresaId, JSON.stringify(apagar)]
      );
    }

    const log = lista.map((d) => {
      const base = d.novo || d.anterior;
      return {
        centro_id: base.centro_id,
        sienge_id: base.sienge_id,
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
      `INSERT INTO dfc_orcamento_log (empresa_id, centro_id, sienge_id, mes, versao_id, tipo, valor_anterior, valor_novo,
                                      origem, fonte, fonte_descricao, responsavel_id, responsavel_em)
       SELECT $1, x.centro_id, x.sienge_id, (x.mes || '-01')::date, $2, x.tipo, x.valor_anterior, x.valor_novo,
              x.origem, x.fonte, x.fonte_descricao, x.responsavel_id, x.responsavel_em
         FROM json_to_recordset($3::json) AS x(centro_id int, sienge_id int, mes text, tipo text, valor_anterior numeric,
              valor_novo numeric, origem text, fonte text, fonte_descricao text, responsavel_id int, responsavel_em timestamptz)`,
      [empresaId, versaoId, JSON.stringify(log)]
    );

    await client.query('COMMIT');
    return { numero, criado_em: agora, valores: totalValores, ...resumo };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Log de alterações de um valor (centro × conta × mês), da versão mais nova pra mais antiga, e o
// que está pendente nele (mudou na fonte e ainda não foi salvo).
async function log(empresaId, centroId, siengeId, mes) {
  const { rows } = await pool.query(
    `SELECT l.id, l.tipo, l.valor_anterior, l.valor_novo, l.origem, l.fonte, l.fonte_descricao, l.responsavel_em,
            ur.nome AS responsavel, v.numero AS versao, v.criado_em AS versao_em, uv.nome AS versao_por
       FROM dfc_orcamento_log l
       JOIN dfc_orcamento_versoes v ON v.id = l.versao_id
       LEFT JOIN usuarios ur ON ur.id = l.responsavel_id
       LEFT JOIN usuarios uv ON uv.id = v.usuario_id
      WHERE l.empresa_id = $1 AND l.centro_id = $2 AND l.sienge_id = $3 AND l.mes = $4
      ORDER BY v.numero DESC, l.id DESC`,
    [empresaId, centroId, siengeId, `${mes}-01`]
  );
  const numero = (v) => (v === null ? null : Number(v));
  const historico = rows.map((r) => ({ ...r, valor_anterior: numero(r.valor_anterior), valor_novo: numero(r.valor_novo) }));

  const [{ valores: atual, contexto }, cons] = await Promise.all([valoresAtuais(pool, empresaId), consolidado(pool, empresaId)]);
  const chave = chaveDe(centroId, siengeId, mes);
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
        mes: base.mes,
        valor_anterior: d.anterior ? d.anterior.valor : null,
        valor_novo: d.novo ? d.novo.valor : null,
        fonte_descricao: d.info.fonte_descricao,
        responsavel_id: d.info.responsavel_id ?? null,
        responsavel_em: d.info.responsavel_em ?? null,
      };
    });
}

module.exports = { orcamento, rascunho, salvarVersao, log, pendenciasDaOrigem };
