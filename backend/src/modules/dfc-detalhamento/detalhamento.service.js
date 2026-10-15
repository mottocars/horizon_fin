const pool = require('../../config/db');
const dfcAging = require('../dfc-aging/dfcAging.service');
const dfcEmpresarial = require('../dfc-empresarial/dfcEmpresarial.service');
const projecaoCef = require('../dfc-projecao-cef/projecaoCef.service');
const motor = require('../dfc-projecao-cef/projecaoCef.motor');

// DFC Construtoras > DFC: "Detalhamento" de um valor da grade (pedido do usuário) — clique no valor
// de uma conta (último nível), num mês, no Realizado ou no Projetado. Mostra tudo que compõe o valor:
// - Realizado: os lançamentos do extrato bancário (com o rateio de cada um) que somam na célula.
// - Projetado: o valor da última versão salva do Orçamento, por centro de custo e origem, com o
//   rastreio de cada fonte — digitado (HORIZON - INFORMADO, com o histórico), parcelas do Aging,
//   Orçamento Empresarial espalhado pela ficha de desembolso e, na Projeção CEF, a conta inteira do
//   motor (parâmetros, unidades do Geral, avanço da obra, passo a passo até o valor).
//
// A resposta é montada em "blocos" genéricos que a janela só desenha (DetalhamentoModal.jsx):
// - campos: [{ rotulo, valor, formato }] em grade;
// - passos: a conta, linha a linha: [{ op ('+', '−', '×', '=' ou null), rotulo, nota, valor, formato, destaque }];
// - tabela: colunas [{ chave, rotulo, formato }], linhas, total (opcional);
// - nota: texto corrido.
// Formatos: moeda, pct (fração: 0,25 = 25%), data, mes, int, texto.

const ROTULO_ORIGEM = {
  CEF_NOVO_REGISTRO: 'Projeção CEF · Novo Registro',
  CEF_MEDICAO: 'Projeção CEF · Medição',
  CEF_CREDITO_PJ: 'Projeção CEF · Crédito PJ',
  CEF_JUROS: 'Projeção CEF · Juros',
  CEF_AMORTIZACAO: 'Projeção CEF · Amortização',
  SIENGE_ORCAMENTO_EMPRESARIAL: 'Orçamento Empresarial (Sienge)',
  SIENGE_AGING: 'Aging (Sienge)',
  HORIZON_ORCAMENTO_INFORMADO: 'Horizon · Informado',
};

const ROTULO_FONTE_AVANCO = { CAIXA: 'Caixa (DCD)', PREVISION: 'Prevision', MANUAL: 'Avanço manual' };

const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const col = (chave, rotulo, formato = 'texto') => ({ chave, rotulo, formato });
const campo = (rotulo, valor, formato = 'texto') => ({ rotulo, valor, formato });
const passo = (op, rotulo, valor, formato = 'moeda', extra = {}) => ({ op, rotulo, valor, formato, ...extra });
const somaDe = (linhas, chave) => r2(linhas.reduce((t, l) => t + Number(l[chave] || 0), 0));
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (m) => (m ? `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}` : '—');
const dataBr = (d) => (d ? String(d instanceof Date ? d.toISOString() : d).slice(0, 10).split('-').reverse().join('/') : '—');
const iso = (d) => (d ? (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)) : null);

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Filtro de centros (os que somam na célula; `semCentro` = lançamento sem centro de custo).
function filtroCentros(alias, indice) {
  return `(${alias}.centro_id = ANY($${indice}::int[]) OR ($${indice + 1}::boolean AND ${alias}.centro_id IS NULL))`;
}

async function nomesCentros(empresaId) {
  const { rows } = await pool.query('SELECT sienge_id, name, codigo_contrato_caixa FROM centros_custo_sienge WHERE empresa_id = $1', [
    empresaId,
  ]);
  return new Map(rows.map((r) => [r.sienge_id, r]));
}

// ─── Realizado ────────────────────────────────────────────────────────────────────────────────
// Os lançamentos do extrato (contas com "Projeta DFC") já achatados por rateio na sincronização
// (sie_extrato_contas_rateio) — a mesma base que a grade soma (dfc-saldos::realizado).
async function realizado(empresaId, { mes, natureza, lado, centros, semCentro }, centrosInfo) {
  const { rows } = await pool.query(
    `SELECT r.id AS rateio_id, r.centro_id, r.percentual, r.valor AS valor_dfc,
            e.registro_id, e.id AS id_sienge, to_char(e.date, 'YYYY-MM-DD') AS data, e.numero_conta,
            c.nome AS conta_nome, c.banco_nome, e.statement_origin, e.statement_type, e.bill_id, e.installment_number,
            e.document_id, e.document_number, e.description, e.value, e.type
       FROM sie_extrato_contas_rateio r
       JOIN sie_extrato_contas e ON e.registro_id = r.registro_id
       JOIN contas_bancarias_sienge c
         ON c.empresa_id = r.empresa_id AND c.company_id = r.company_id AND c.numero_conta = r.numero_conta AND c.projeta_dfc
      WHERE r.empresa_id = $1 AND r.mes = $2::date
        AND (CASE WHEN $3::int IS NULL THEN r.natureza_id IS NULL ELSE r.natureza_id = $3::int END)
        AND (CASE WHEN $4 = 'E' THEN r.valor >= 0 ELSE r.valor < 0 END)
        AND ${filtroCentros('r', 5)}
      ORDER BY e.date, e.id, r.id`,
    [empresaId, `${mes}-01`, natureza, lado, centros, semCentro]
  );
  // Um grupo por centro de custo (pedido do usuário), do maior valor pro menor.
  const porCentro = new Map();
  rows.forEach((r) => {
    if (!porCentro.has(r.centro_id)) porCentro.set(r.centro_id, []);
    porCentro.get(r.centro_id).push(r);
  });
  const grupos = [...porCentro.entries()].map(([centroId, doCentro]) => {
    const linhas = doCentro.map((r) => {
      const sinal = Number(r.valor_dfc) < 0 ? -1 : 1;
      return {
        data: r.data,
        conta_bancaria: r.conta_nome || r.numero_conta,
        titulo: r.bill_id ? `${r.bill_id}${r.installment_number ? `/${r.installment_number}` : ''}` : '—',
        documento: [r.document_id?.trim(), r.document_number?.trim()].filter(Boolean).join(' ') || '—',
        descricao: r.description?.trim() || r.statement_type || '—',
        valor_lancamento: r2(Math.abs(Number(r.value)) * sinal),
        percentual: Number(r.percentual) / 100,
        valor: r2(r.valor_dfc),
      };
    });
    const valor = r2(doCentro.reduce((t, r) => t + Number(r.valor_dfc), 0));
    const titulos = new Set(doCentro.filter((r) => r.bill_id).map((r) => `${r.statement_origin}|${r.bill_id}`)).size;
    const blocos = [
      {
        tipo: 'tabela',
        titulo: 'Lançamentos do extrato',
        busca: true,
        colunas: [
          col('data', 'Data', 'data'),
          col('conta_bancaria', 'Conta bancária'),
          col('titulo', 'Título/Parc.'),
          col('documento', 'Documento'),
          col('descricao', 'Favorecido / Descrição'),
          col('valor_lancamento', 'Lançamento', 'moeda'),
          col('percentual', 'Rateio', 'pct'),
          col('valor', 'No DFC', 'moeda'),
        ],
        linhas,
        total: { valor },
      },
    ];
    if (natureza === null) {
      blocos.push({
        tipo: 'nota',
        texto:
          'Lançamentos que vieram do Sienge sem natureza financeira (sem rateio no extrato) e sem outro lançamento do mesmo título na mesma data para herdar a classificação.',
      });
    }
    return {
      chave: `centro|${centroId ?? 'sem'}`,
      titulo: centroId === null ? 'Sem centro de custo' : centrosInfo.get(centroId)?.name || `Centro ${centroId}`,
      subtitulo: `${doCentro.length} ${doCentro.length === 1 ? 'lançamento' : 'lançamentos'} · ${titulos} ${titulos === 1 ? 'título' : 'títulos'}`,
      valor,
      blocos,
      avisos: [],
    };
  });
  grupos.sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));

  return { total: r2(rows.reduce((t, r) => t + Number(r.valor_dfc), 0)), grupos };
}

// ─── Projetado: uma fonte por origem ──────────────────────────────────────────────────────────

// HORIZON - INFORMADO: o valor digitado na aba Orçamentos e o histórico dele nas versões.
async function informado(empresaId, centroId, conta, mes) {
  const { rows: atual } = await pool.query(
    `SELECT i.valor, i.atualizado_em, u.nome AS usuario
       FROM dfc_orcamento_informado i LEFT JOIN usuarios u ON u.id = i.usuario_id
      WHERE i.empresa_id = $1 AND i.centro_id = $2 AND i.sienge_id = $3 AND i.mes = $4::date`,
    [empresaId, centroId, conta, `${mes}-01`]
  );
  const { rows: historico } = await pool.query(
    `SELECT v.numero AS versao, v.criado_em, l.tipo, l.valor_anterior, l.valor_novo, l.fonte_descricao,
            COALESCE(ur.nome, '—') AS responsavel, l.responsavel_em
       FROM dfc_orcamento_log l
       JOIN dfc_orcamento_versoes v ON v.id = l.versao_id
       LEFT JOIN usuarios ur ON ur.id = l.responsavel_id
      WHERE l.empresa_id = $1 AND l.centro_id = $2 AND l.sienge_id = $3 AND l.mes = $4::date
      ORDER BY v.numero DESC, l.id DESC`,
    [empresaId, centroId, conta, `${mes}-01`]
  );
  const linha = atual[0];
  const valor = linha?.valor === null || linha?.valor === undefined ? 0 : r2(linha.valor);
  const TIPOS = { INCLUSAO: 'Inclusão', ALTERACAO: 'Alteração', EXCLUSAO: 'Exclusão' };
  return {
    valor,
    resumo: 'Valor digitado à mão na aba Orçamentos.',
    blocos: [
      {
        tipo: 'campos',
        itens: [
          campo('Valor digitado hoje', linha && linha.valor !== null ? r2(linha.valor) : null, 'moeda'),
          campo('Digitado por', linha ? linha.usuario || 'Sem usuário (carga direta)' : '—'),
          campo('Em', linha?.atualizado_em ? new Date(linha.atualizado_em).toISOString() : null, 'datahora'),
        ],
      },
      {
        tipo: 'tabela',
        titulo: 'Histórico nas versões do Orçamento',
        vazio: 'Ainda não entrou em nenhuma versão salva.',
        colunas: [
          col('versao', 'Versão', 'int'),
          col('criado_em', 'Salva em', 'datahora'),
          col('tipo', 'Movimento'),
          col('valor_anterior', 'Anterior', 'moeda'),
          col('valor_novo', 'Novo', 'moeda'),
          col('responsavel', 'Digitado por'),
        ],
        linhas: historico.map((h) => ({
          ...h,
          tipo: TIPOS[h.tipo] || h.tipo,
          valor_anterior: h.valor_anterior === null ? null : Number(h.valor_anterior),
          valor_novo: h.valor_novo === null ? null : Number(h.valor_novo),
          criado_em: new Date(h.criado_em).toISOString(),
        })),
      },
    ],
  };
}

// SIENGE - AGING: as parcelas do contas a receber / a pagar que vencem no mês, no rateio da
// natureza × centro — a mesma conta de dfc-aging::aging, parcela a parcela.
const PESSOA = { receber: 'client_name', pagar: 'creditor_name' };
async function aging(empresaId, centroId, conta, mes) {
  const linhas = [];
  const bases = [];
  for (const tipo of ['receber', 'pagar']) {
    const t = dfcAging.TIPOS[tipo];
    const { rows } = await pool.query(
      `SELECT i.bill_id, i.installment_id, i.document_identification_id AS doc, i.document_number, i.${PESSOA[tipo]} AS pessoa,
              to_char(i.issue_date, 'YYYY-MM-DD') AS emissao, to_char(i.due_date, 'YYYY-MM-DD') AS vencimento,
              i.original_amount, i.discount_amount, i.tax_amount, i.balance_amount,
              ${t.valor} AS valor_parcela, COALESCE(cat.financial_category_rate, 0) AS rateio
         FROM ${t.categorias} cat
         JOIN ${t.parcelas} i ON i.empresa_id = cat.empresa_id AND i.bill_id = cat.bill_id AND i.installment_id = cat.installment_id
        WHERE cat.empresa_id = $1 AND cat.cost_center_id = $2 AND cat.financial_category_id = $3::text
          AND i.due_date >= $4::date AND i.due_date < ($4::date + INTERVAL '1 month') AND ${t.filtro}
        ORDER BY i.due_date, i.bill_id, i.installment_id`,
      [empresaId, centroId, String(conta), `${mes}-01`]
    );
    const { rows: base } = await pool.query(`SELECT MAX(atualizado_em) AS em FROM ${t.parcelas} WHERE empresa_id = $1`, [empresaId]);
    if (rows.length) bases.push({ tipo, em: base[0].em });
    rows.forEach((r) => {
      const bruto = (Number(r.valor_parcela) * Number(r.rateio)) / 100;
      linhas.push({
        lado: tipo === 'receber' ? 'A receber' : 'A pagar',
        titulo: `${r.bill_id}/${r.installment_id}`,
        documento: [r.doc?.trim(), r.document_number?.trim()].filter(Boolean).join(' ') || '—',
        pessoa: r.pessoa || '—',
        emissao: r.emissao,
        vencimento: r.vencimento,
        original: Number(r.original_amount || 0),
        desconto: Number(r.discount_amount || 0),
        taxas: Number(r.tax_amount || 0),
        valor_parcela: r2(r.valor_parcela),
        saldo: r.balance_amount === null ? null : Number(r.balance_amount),
        rateio: Number(r.rateio) / 100,
        valor: r2(bruto * t.sinal),
        _bruto: bruto * t.sinal,
      });
    });
  }
  // Mesmo arredondamento do Aging: soma tudo e arredonda no fim.
  const valor = r2(linhas.reduce((t, l) => t + l._bruto, 0));
  linhas.forEach((l) => delete l._bruto);
  const tipos = [...new Set(linhas.map((l) => l.lado))];
  return {
    valor,
    resumo: `${linhas.length} ${linhas.length === 1 ? 'parcela' : 'parcelas'} com vencimento em ${rotuloMes(mes)}.`,
    blocos: [
      {
        tipo: 'campos',
        itens: [
          campo('Parcelas', linhas.length, 'int'),
          campo('Títulos', new Set(linhas.map((l) => l.titulo.split('/')[0])).size, 'int'),
          ...bases.map((b) => campo(`Base do contas a ${b.tipo} atualizada em`, b.em ? new Date(b.em).toISOString() : null, 'datahora')),
          campo('Total', valor, 'moeda'),
        ],
      },
      {
        tipo: 'tabela',
        titulo: 'Parcelas',
        busca: true,
        colunas: [
          ...(tipos.length > 1 ? [col('lado', 'Tipo')] : []),
          col('titulo', 'Título/Parc.'),
          col('documento', 'Documento'),
          col('pessoa', tipos.includes('A receber') && tipos.length === 1 ? 'Cliente' : 'Credor / Cliente'),
          col('emissao', 'Emissão', 'data'),
          col('vencimento', 'Vencimento', 'data'),
          col('original', 'Original', 'moeda'),
          col('desconto', 'Desconto', 'moeda'),
          col('taxas', 'Taxas', 'moeda'),
          col('valor_parcela', 'Valor parcela', 'moeda'),
          col('saldo', 'Saldo aberto', 'moeda'),
          col('rateio', 'Rateio', 'pct'),
          col('valor', 'No DFC', 'moeda'),
        ],
        linhas,
        total: { valor },
      },
      {
        tipo: 'nota',
        texto:
          'Valor da parcela: a receber = original − desconto + taxas; a pagar = original + desconto − taxas, lançado negativo (saída). Cada parcela cai no mês do vencimento, pelo % do rateio da natureza no centro de custo. Previsões financeiras (documento PREVISÃO) não entram.',
      },
    ],
  };
}

// SIENGE - EMPRESARIAL DESEMBOLSO: o valor orçado de cada mês (última versão de cada orçamento) sai
// inteiro depois do prazo médio de desembolso da natureza — o que cai neste mês é o orçado de
// (mês − deslocamento). Refaz dfc-empresarial::valores.
async function empresarial(empresaId, centroId, conta, mes) {
  const { rows: fichas } = await pool.query(
    `SELECT prazo_medio, titulos, periodo_de, periodo_ate, calculado_em, ficha FROM dfc_desembolso_fichas
      WHERE empresa_id = $1 AND sienge_id = $2`,
    [empresaId, conta]
  );
  const ficha = fichas[0] || null;
  const deslocamento = dfcEmpresarial.deslocamentoDe(ficha);
  const k = deslocamento ?? 0;
  const mesOrcado = dfcEmpresarial.somarMeses(mes, -k);
  const { rows } = await pool.query(
    `WITH ultima AS (${dfcEmpresarial.SQL_ULTIMA_VERSAO})
     SELECT u.id AS orcamento, u.description, u.version_number, SUM(v.total_price) AS valor
       FROM ultima u
       JOIN sie_business_budget_categorias c ON c.registro_id = u.registro_id
       JOIN sie_business_budget_valores v ON v.categoria_id = c.categoria_id
      WHERE u.cost_center_id = $2 AND c.id = $3::text AND v.mes = $4::date
        AND COALESCE(v.total_price, 0) <> 0 AND COALESCE(c.type, '') <> 'T'
      GROUP BY 1, 2, 3 ORDER BY 1`,
    [empresaId, centroId, String(conta), `${mesOrcado}-01`]
  );
  const linhas = rows.map((r) => ({
    orcamento: `${r.orcamento}${r.description ? ` — ${r.description}` : ''}`,
    versao: r.version_number,
    valor_orcado: r2(r.valor),
    valor: -r2(r.valor),
  }));
  const orcado = r2(rows.reduce((t, r) => t + Number(r.valor), 0));
  const valor = -orcado;
  const prazo = ficha?.prazo_medio === null || ficha?.prazo_medio === undefined ? null : Number(ficha.prazo_medio);
  const blocos = [
    {
      tipo: 'passos',
      titulo: 'Como chegou no valor',
      itens: [
        passo(null, 'Prazo médio de desembolso da natureza', deslocamento === null ? 'sem prazo médio' : `${prazo.toLocaleString('pt-BR')} dias`, 'texto', {
          nota: deslocamento === null ? 'natureza sem ficha ou sem títulos nos últimos 12 meses' : `÷ 30, arredondado = ${k} ${k === 1 ? 'mês' : 'meses'}`,
        }),
        passo(null, `Orçado em ${rotuloMes(mesOrcado)}`, orcado, 'moeda', {
          nota: k === 0 ? 'sai no próprio mês' : `sai ${k} ${k === 1 ? 'mês' : 'meses'} depois, em ${rotuloMes(mes)}`,
        }),
        passo('=', `Saída em ${rotuloMes(mes)}`, valor, 'moeda', { destaque: true }),
      ],
    },
    {
      tipo: 'tabela',
      titulo: `Orçamento Empresarial de ${rotuloMes(mesOrcado)}`,
      vazio: `Nada orçado em ${rotuloMes(mesOrcado)}.`,
      colunas: [col('orcamento', 'Orçamento'), col('versao', 'Versão', 'int'), col('valor_orcado', 'Orçado', 'moeda'), col('valor', 'No DFC', 'moeda')],
      linhas,
      total: { valor_orcado: orcado, valor },
    },
  ];
  if (ficha) {
    blocos.push({
      tipo: 'campos',
      titulo: 'Ficha de desembolso',
      itens: [
        campo('Prazo médio', prazo === null ? null : `${prazo.toLocaleString('pt-BR')} dias`),
        campo('Títulos analisados', ficha.titulos, 'int'),
        campo('Período dos títulos', `${dataBr(ficha.periodo_de)} a ${dataBr(ficha.periodo_ate)}`),
        campo('Ficha calculada em', ficha.calculado_em ? new Date(ficha.calculado_em).toISOString() : null, 'datahora'),
      ],
    });
  }
  blocos.push({
    tipo: 'nota',
    texto:
      'O valor orçado no Orçamento Empresarial do Sienge (última versão de cada orçamento) sai inteiro depois do prazo médio de desembolso da natureza (dias da emissão ao vencimento dos títulos do contas a pagar dos últimos 12 meses), em meses: prazo ÷ 30, arredondado. Saída de caixa — valor negativo.',
  });
  return {
    valor,
    resumo: `Orçado em ${rotuloMes(mesOrcado)}${k ? ` + ${k} ${k === 1 ? 'mês' : 'meses'} de prazo médio` : ''}.`,
    blocos,
    avisos: deslocamento === null ? ['Natureza sem prazo médio de desembolso: o orçado sai no próprio mês.'] : [],
  };
}

// ─── Projeção CEF: rastreio completo ──────────────────────────────────────────────────────────
// Refaz o motor (projecaoCef.motor) com a versão dos Parâmetros da última atualização da obra, as
// unidades do Geral e o avanço de hoje, e mostra a conta do mês passo a passo. Compara com a
// projeção gravada (o que o Orçamento usa): se Geral/Avanços mudaram depois, avisa.
async function cef(empresaId, centroId, origem, mes, centrosInfo) {
  const { coluna, sinal } = projecaoCef.SAIDAS[origem];
  const rastro = await projecaoCef.rastrear(empresaId, centroId);
  if (!rastro) {
    const { rows: gravadas } = await pool.query(
      `SELECT ${coluna} AS valor FROM dfc_projecao_cef WHERE empresa_id = $1 AND sienge_id = $2 AND mes = $3::date`,
      [empresaId, centroId, `${mes}-01`]
    );
    return {
      valor: gravadas[0] ? r2(Number(gravadas[0].valor) * sinal) : 0,
      resumo: 'Projeção CEF sem execução registrada para esta obra.',
      blocos: [{ tipo: 'nota', texto: 'Não foi possível refazer a conta: a obra não tem Projeção CEF atualizada ou está sem Código Contrato Caixa.' }],
      avisos: ['Sem rastreio: atualize a Projeção CEF da obra.'],
    };
  }
  const { exec, versao, p, mapa, cenario, fontes, unidades, porUnidade, linhas } = rastro;
  const contrato = rastro.obra.contrato;
  const gravadaLinha = rastro.gravadas.get(mes);
  const gravada = gravadaLinha ? r2(Number(gravadaLinha[coluna]) * sinal) : 0;
  const idx = linhas.findIndex((l) => l.mes === mes);
  const linha = linhas[idx];
  const anterior = idx > 0 ? linhas[idx - 1] : null;
  const recalculado = linha ? r2(linha[coluna] * sinal) : 0;
  const primeiroMes = linhas[0]?.mes;
  const dm = motor.mesDe(p.dataDemandaMinima);

  const avisos = [];
  if (Math.abs(recalculado - gravada) >= 0.01) {
    avisos.push(
      `A projeção gravada (atualizada em ${dataBr(exec.atualizado_em)}${exec.usuario ? ` por ${exec.usuario}` : ''}) dá ${gravada.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}; refazendo hoje com os mesmos Parâmetros dá ${recalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — o Geral ou os Avanços mudaram depois. Atualize a Projeção CEF da obra. O rastreio abaixo é o de hoje.`
    );
  }

  const blocos = [
    {
      tipo: 'campos',
      titulo: `Parâmetros — versão ${versao.versao}${versao.criado_por_nome ? ` (${versao.criado_por_nome}, ${dataBr(versao.criado_em)})` : ''}`,
      itens: [
        campo('CTO', p.cto, 'moeda'),
        campo('Teto do financiamento PJ', p.tetoPj, 'moeda'),
        campo('% Amortização PJ', p.amortPj, 'pct'),
        campo('Taxa de juros ao mês', p.taxaJuros, 'pct4'),
        campo('Data da Demanda Mínima', iso(p.dataDemandaMinima), 'data'),
        campo('Ciclo', `${rotuloMes(motor.mesDe(p.dataInicio))} a ${rotuloMes(motor.mesDe(p.dataFim))}`),
        campo('Assinatura → registro', `${p.prazoRegistro} ${p.prazoRegistro === 1 ? 'mês' : 'meses'}`),
        campo('Unidades no Geral', unidades.length, 'int'),
      ],
    },
  ];

  if (!linha) {
    blocos.push({ tipo: 'nota', texto: `${rotuloMes(mes)} está fora do ciclo da projeção (${rotuloMes(primeiroMes)} a ${rotuloMes(linhas[linhas.length - 1]?.mes)}).` });
    return { valor: gravada, resumo: 'Mês fora do ciclo da projeção.', blocos, avisos };
  }

  // Unidade -> linha da tabela (dados do Geral + o que o motor calculou).
  const unidade = (u, c) => ({
    unidade: u.contrato_unidade || '—',
    mutuario: u.nome_mutuario || '—',
    assinatura: iso(u.data_assinatura),
    registro: c.regMes,
    situacao: u.data_registro ? `Registrada em ${dataBr(u.data_registro)}` : `Projetada (assinatura + ${p.prazoRegistro} m)`,
    terreno: Number(u.valor_terreno || 0),
    fgts: Number(u.valor_fgts || 0),
    a_vista: Number(u.valor_terreno || 0) + Number(u.valor_fgts || 0),
    financiamento: Number(u.valor_financiamento || 0),
    subsidio: Number(u.valor_subsidio || 0),
    vgf_medicao: c.vgfMedicao,
    pct_obra: c.regMes && mapa.has(c.regMes) ? mapa.get(c.regMes) : 0,
    medicao_registro: c.totalNovoRegistro - (Number(u.valor_terreno || 0) + Number(u.valor_fgts || 0)),
    novo_registro: c.totalNovoRegistro,
    amortiza: c.statusDm ? 'Não (assinada até a DM)' : 'Sim',
  });
  const doMes = unidades.map((u, i) => [u, porUnidade[i]]).filter(([, c]) => c.regMes === mes).map(([u, c]) => unidade(u, c));
  const fonteAvanco = (m) => {
    const f = fontes.get(m);
    return f ? `${ROTULO_FONTE_AVANCO[f.fonte] || f.fonte}${f.repetido ? ' — sem valor no mês, repete o anterior' : ''}` : '—';
  };
  const passosAvanco = () => [
    passo(null, anterior ? `% obra acumulado em ${rotuloMes(anterior.mes)}` : '% obra acumulado antes do ciclo', anterior ? anterior.pct_obra_executada : 0, 'pct', {
      nota: anterior ? fonteAvanco(anterior.mes) : 'início do ciclo (0%)',
    }),
    passo(null, `% obra acumulado em ${rotuloMes(mes)}`, linha.pct_obra_executada, 'pct', { nota: fonteAvanco(mes) }),
    passo('=', 'Avanço da obra no mês', linha.delta_pct_obra_mes, 'pct', { destaque: true }),
  ];
  const colunasUnidade = (extra) => [col('unidade', 'Unidade'), col('mutuario', 'Mutuário'), col('assinatura', 'Assinatura', 'data'), col('registro', 'Registro', 'mes'), col('situacao', 'Situação'), ...extra];
  const notaDinheiro = sinal < 0 ? [passo('=', 'No fluxo de caixa (saída)', recalculado, 'moeda', { destaque: true })] : [];

  if (origem === 'CEF_NOVO_REGISTRO') {
    const aVista = somaDe(doMes, 'a_vista');
    const medicao = somaDe(doMes, 'medicao_registro');
    blocos.push({
      tipo: 'passos',
      titulo: 'Como chegou no valor',
      itens: [
        passo(null, `Unidades com registro em ${rotuloMes(mes)}`, doMes.length, 'int'),
        passo('+', 'À vista: Σ (terreno + FGTS)', aVista),
        passo('+', 'Medição no registro: Σ VGF medição × % obra no mês do registro', medicao),
        passo('=', 'Novo Registro', linha.novo_registro, 'moeda', { destaque: true }),
      ],
    });
    blocos.push({
      tipo: 'tabela',
      titulo: `Unidades registradas em ${rotuloMes(mes)}`,
      vazio: 'Nenhuma unidade registrada neste mês.',
      colunas: colunasUnidade([
        col('terreno', 'Terreno', 'moeda'),
        col('fgts', 'FGTS', 'moeda'),
        col('a_vista', 'À vista', 'moeda'),
        col('financiamento', 'Financiamento', 'moeda'),
        col('subsidio', 'Subsídio', 'moeda'),
        col('vgf_medicao', 'VGF medição', 'moeda'),
        col('pct_obra', '% obra', 'pct'),
        col('medicao_registro', 'Medição', 'moeda'),
        col('novo_registro', 'Novo registro', 'moeda'),
      ]),
      linhas: doMes,
      total: Object.fromEntries(['terreno', 'fgts', 'a_vista', 'financiamento', 'subsidio', 'vgf_medicao', 'medicao_registro', 'novo_registro'].map((k) => [k, somaDe(doMes, k)])),
    });
    blocos.push({
      tipo: 'nota',
      texto: `VGF medição = financiamento − terreno + subsídio. % obra = % acumulado da obra no mês do registro (aba Avanços: ${{ CAIXA_PREVISION: 'Caixa até o mês anterior ao atual, Prevision daí em diante', CAIXA: 'Caixa até o mês anterior ao atual, manual daí em diante', PREVISION: 'Prevision', MANUAL: 'avanço manual', SEM_DADOS: 'sem avanço' }[cenario]}). Unidade sem registro no Geral é projetada para a assinatura + ${p.prazoRegistro} meses. O primeiro contrato do Geral (o da construtora) não entra.`,
    });
  } else if (origem === 'CEF_MEDICAO' || origem === 'CEF_CREDITO_PJ') {
    // VGF medição acumulado: unidades registradas em meses do ciclo antes deste (o motor só acumula
    // dentro do ciclo — igual à planilha).
    const registradas = unidades
      .map((u, i) => [u, porUnidade[i]])
      .filter(([, c]) => c.regMes && c.regMes >= primeiroMes && c.regMes < mes)
      .map(([u, c]) => unidade(u, c))
      .sort((a, b) => a.registro.localeCompare(b.registro));
    const foraDoCiclo = porUnidade.filter((c) => c.regMes && c.regMes < primeiroMes).length;
    const cumO = registradas.reduce((t, u) => t + u.vgf_medicao, 0);
    const passosMedicao = [
      ...passosAvanco(),
      passo(null, `VGF medição acumulado dos registrados até ${rotuloMes(anterior?.mes || mes)}`, cumO, 'moeda', {
        nota: `${registradas.length} ${registradas.length === 1 ? 'unidade' : 'unidades'} — tabela abaixo`,
      }),
      passo('=', 'Medição = VGF medição acumulado × avanço do mês', linha.medicao, 'moeda', { destaque: true }),
    ];
    if (origem === 'CEF_MEDICAO') {
      blocos.push({ tipo: 'passos', titulo: 'Como chegou no valor', itens: passosMedicao });
    } else {
      const cumCred = linhas.slice(0, idx).reduce((t, l) => t + l.credito_pj, 0);
      const itens = [...passosAvanco()];
      let bruto;
      if (mes <= dm) {
        itens.push(passo(null, `Até o mês da Demanda Mínima (${rotuloMes(dm)}) não há liberação`, 0, 'moeda'));
        bruto = 0;
      } else if (mes === motor.somarMeses(dm, 1)) {
        itens.push(passo(null, '1º mês após a Demanda Mínima: Teto PJ', p.tetoPj));
        itens.push(passo('×', 'Avanço da obra no mês', linha.delta_pct_obra_mes, 'pct'));
        bruto = p.tetoPj * linha.delta_pct_obra_mes;
        itens.push(passo('=', 'Crédito calculado', bruto));
      } else {
        itens.push(passo(null, 'CTO × avanço da obra no mês', p.cto * linha.delta_pct_obra_mes, 'moeda', { nota: `${p.cto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} × avanço` }));
        itens.push(passo('−', 'Medição do mês (VGF medição acumulado × avanço)', linha.medicao, 'moeda', { nota: `${cumO.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} × avanço` }));
        bruto = p.cto * linha.delta_pct_obra_mes - linha.medicao;
        itens.push(passo('=', 'Crédito calculado', bruto));
      }
      if (bruto < 0) itens.push(passo(null, 'Negativo vira zero', 0));
      const disponivel = p.tetoPj - cumCred;
      itens.push(passo(null, `Crédito PJ já liberado até ${rotuloMes(anterior?.mes || mes)}`, cumCred, 'moeda', { nota: `teto ${p.tetoPj.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` }));
      itens.push(passo(null, 'Saldo do teto disponível', Math.max(disponivel, 0)));
      if (Math.max(bruto, 0) > disponivel + 0.005) itens.push(passo(null, 'Crédito limitado ao saldo do teto', Math.max(disponivel, 0)));
      itens.push(passo('=', 'Crédito PJ', linha.credito_pj, 'moeda', { destaque: true }));
      blocos.push({ tipo: 'passos', titulo: 'Como chegou no valor', itens });
      // O avanço já está no bloco de cima: aqui só a conta da medição.
      if (mes > motor.somarMeses(dm, 1)) {
        blocos.push({ tipo: 'passos', titulo: 'Medição do mês (entra no cálculo acima)', itens: passosMedicao.slice(passosAvanco().length) });
      }
    }
    if (origem === 'CEF_MEDICAO' || mes > motor.somarMeses(dm, 1)) {
      blocos.push({
        tipo: 'tabela',
        titulo: `VGF medição acumulado — unidades registradas de ${rotuloMes(primeiroMes)} a ${rotuloMes(anterior?.mes || mes)}`,
        vazio: 'Nenhuma unidade registrada antes deste mês dentro do ciclo.',
        busca: registradas.length > 15,
        colunas: colunasUnidade([
          col('financiamento', 'Financiamento', 'moeda'),
          col('terreno', 'Terreno', 'moeda'),
          col('subsidio', 'Subsídio', 'moeda'),
          col('vgf_medicao', 'VGF medição', 'moeda'),
        ]),
        linhas: registradas,
        total: Object.fromEntries(['financiamento', 'terreno', 'subsidio', 'vgf_medicao'].map((k) => [k, somaDe(registradas, k)])),
      });
    }
    blocos.push({
      tipo: 'nota',
      texto: `VGF medição = financiamento − terreno + subsídio, de cada unidade já registrada. Avanço da obra pela aba Avanços.${
        foraDoCiclo ? ` ${foraDoCiclo} ${foraDoCiclo === 1 ? 'unidade registrada' : 'unidades registradas'} antes do início do ciclo não ${foraDoCiclo === 1 ? 'entra' : 'entram'} no acumulado (como na planilha).` : ''
      }${origem === 'CEF_CREDITO_PJ' ? ' Crédito PJ: zero até o mês da Demanda Mínima; no mês seguinte, Teto PJ × avanço; depois, CTO × avanço − medição; nunca negativo e travado no teto do financiamento PJ.' : ''}`,
    });
  } else if (origem === 'CEF_JUROS') {
    const saldoAnterior = anterior ? anterior.saldo_devedor_pj : 0;
    blocos.push({
      tipo: 'passos',
      titulo: 'Como chegou no valor',
      itens: [
        passo(null, `Saldo devedor PJ no fim de ${rotuloMes(anterior?.mes || mes)}`, saldoAnterior, 'moeda', { nota: anterior ? 'evolução abaixo' : 'início do ciclo' }),
        passo('×', 'Taxa de juros ao mês', p.taxaJuros, 'pct4'),
        passo('=', 'Juros', linha.juros, 'moeda', { destaque: !notaDinheiro.length }),
        ...notaDinheiro,
      ],
    });
    let saldo = 0;
    const evolucao = linhas.slice(0, idx).map((l) => {
      const linhaSaldo = { mes: l.mes, saldo_anterior: saldo, credito: l.credito_pj, amortizacao: l.amortizacao ? -l.amortizacao : 0, saldo: l.saldo_devedor_pj };
      saldo = l.saldo_devedor_pj;
      return linhaSaldo;
    }).filter((l) => l.saldo_anterior || l.credito || l.amortizacao || l.saldo);
    blocos.push({
      tipo: 'tabela',
      titulo: 'Evolução do saldo devedor PJ',
      vazio: 'Sem saldo devedor antes deste mês.',
      colunas: [col('mes', 'Mês', 'mes'), col('saldo_anterior', 'Saldo anterior', 'moeda'), col('credito', '+ Crédito PJ', 'moeda'), col('amortizacao', '− Amortização', 'moeda'), col('saldo', '= Saldo devedor', 'moeda')],
      linhas: evolucao,
      total: { credito: somaDe(evolucao, 'credito'), amortizacao: somaDe(evolucao, 'amortizacao') },
    });
    blocos.push({
      tipo: 'nota',
      texto: 'Juros do mês = saldo devedor PJ do mês anterior × taxa de juros ao mês. O saldo devedor sobe com o Crédito PJ liberado e desce com a Amortização (os juros são pagos no mês, não entram no saldo). Saída de caixa — negativo no fluxo.',
    });
  } else if (origem === 'CEF_AMORTIZACAO') {
    blocos.push({
      tipo: 'passos',
      titulo: 'Como chegou no valor',
      itens: [
        passo(null, `Novo Registro de ${rotuloMes(mes)}`, linha.novo_registro, 'moeda', { nota: `${doMes.length} ${doMes.length === 1 ? 'unidade' : 'unidades'}` }),
        passo('−', `Que não amortiza (assinatura até a Demanda Mínima, ${dataBr(p.dataDemandaMinima)})`, linha.novo_registro_nao_amortizacao),
        passo('=', 'Base da amortização', linha.novo_registro - linha.novo_registro_nao_amortizacao),
        passo('×', '% Amortização PJ', p.amortPj, 'pct'),
        passo('=', 'Amortização', linha.amortizacao, 'moeda', { destaque: !notaDinheiro.length }),
        ...notaDinheiro,
      ],
    });
    blocos.push({
      tipo: 'tabela',
      titulo: `Unidades registradas em ${rotuloMes(mes)}`,
      vazio: 'Nenhuma unidade registrada neste mês.',
      colunas: colunasUnidade([col('a_vista', 'À vista', 'moeda'), col('medicao_registro', 'Medição', 'moeda'), col('novo_registro', 'Novo registro', 'moeda'), col('amortiza', 'Amortiza?')]),
      linhas: doMes,
      total: Object.fromEntries(['a_vista', 'medicao_registro', 'novo_registro'].map((k) => [k, somaDe(doMes, k)])),
    });
    blocos.push({
      tipo: 'nota',
      texto: 'Amortização = (Novo Registro do mês − parte das unidades assinadas até a Data da Demanda Mínima) × % Amortização PJ. Novo registro de cada unidade = terreno + FGTS + VGF medição × % obra no mês do registro. Saída de caixa — negativo no fluxo.',
    });
  }

  return {
    valor: gravada,
    resumo: `Obra ${centrosInfo.get(centroId)?.name || centroId} · contrato Caixa ${contrato} · projeção atualizada em ${dataBr(exec.atualizado_em)}${exec.usuario ? ` por ${exec.usuario}` : ''}.`,
    blocos,
    avisos,
  };
}

async function projetado(empresaId, { mes, natureza, lado, centros, semCentro }, centrosInfo) {
  if (natureza === null) return { total: 0, versao: null, grupos: [] };
  const { rows } = await pool.query(
    `SELECT o.centro_id, o.valor, o.origem
       FROM dfc_orcamento_valores o
      WHERE o.empresa_id = $1 AND o.sienge_id = $2 AND o.mes = $3::date
        AND (CASE WHEN $4 = 'E' THEN o.valor > 0 ELSE o.valor < 0 END)
        AND ${filtroCentros('o', 5)}
      ORDER BY abs(o.valor) DESC`,
    [empresaId, natureza, `${mes}-01`, lado, centros, semCentro]
  );
  const { rows: versoes } = await pool.query(
    `SELECT v.numero, v.criado_em, u.nome AS usuario FROM dfc_orcamento_versoes v LEFT JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.empresa_id = $1 ORDER BY v.numero DESC LIMIT 1`,
    [empresaId]
  );
  const versao = versoes[0] || null;

  const grupos = [];
  for (const r of rows) {
    const valorVersao = r2(r.valor);
    let fonte;
    if (r.origem === 'HORIZON_ORCAMENTO_INFORMADO') fonte = await informado(empresaId, r.centro_id, natureza, mes);
    else if (r.origem === 'SIENGE_AGING') fonte = await aging(empresaId, r.centro_id, natureza, mes);
    else if (r.origem === 'SIENGE_ORCAMENTO_EMPRESARIAL') fonte = await empresarial(empresaId, r.centro_id, natureza, mes);
    else if (r.origem in projecaoCef.SAIDAS) fonte = await cef(empresaId, r.centro_id, r.origem, mes, centrosInfo);
    else fonte = { valor: valorVersao, blocos: [{ tipo: 'nota', texto: 'Origem sem detalhamento.' }] };
    const avisos = [...(fonte.avisos || [])];
    if (Math.abs(fonte.valor - valorVersao) >= 0.01) {
      avisos.unshift(
        `Hoje a fonte dá ${fonte.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (diferença de ${r2(fonte.valor - valorVersao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). O DFC mostra a versão ${versao?.numero ?? '—'} do Orçamento — salve uma nova versão para trazer o valor de hoje. O detalhamento abaixo é o da fonte hoje.`
      );
    }
    grupos.push({
      chave: `${r.centro_id}|${r.origem}`,
      titulo: centrosInfo.get(r.centro_id)?.name || `Centro ${r.centro_id}`,
      origem: r.origem,
      subtitulo: ROTULO_ORIGEM[r.origem] || r.origem,
      resumo: fonte.resumo || null,
      valor: valorVersao,
      valor_fonte: fonte.valor,
      blocos: fonte.blocos,
      avisos,
    });
  }
  return {
    total: r2(rows.reduce((t, r) => t + Number(r.valor), 0)),
    versao: versao ? { numero: versao.numero, criado_em: versao.criado_em, usuario: versao.usuario } : null,
    grupos,
  };
}

// Entrada da rota. `natureza` null = "Sem natureza" (só no Realizado).
async function detalhar(empresaId, filtro) {
  const centrosInfo = await nomesCentros(empresaId);
  const { rows: contas } =
    filtro.natureza === null
      ? { rows: [] }
      : await pool.query('SELECT sienge_id, name FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id = $2', [empresaId, filtro.natureza]);
  if (filtro.natureza !== null && !contas.length) throw erro(404, 'Conta não encontrada no plano financeiro.');
  const corpo = filtro.tipo === 'R' ? await realizado(empresaId, filtro, centrosInfo) : await projetado(empresaId, filtro, centrosInfo);
  return {
    tipo: filtro.tipo,
    mes: filtro.mes,
    lado: filtro.lado,
    conta: filtro.natureza === null ? { sienge_id: null, name: 'Lançamentos sem natureza no Sienge' } : contas[0],
    ...corpo,
  };
}

module.exports = { detalhar };
