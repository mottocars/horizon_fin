const pool = require('../../config/db');
const fluxoService = require('../dfc-fluxo/fluxo.service');
const dfcSaldos = require('../dfc-saldos/dfcSaldos.service');
const dfcAging = require('../dfc-aging/dfcAging.service');
const dfcEmpresarial = require('../dfc-empresarial/dfcEmpresarial.service');
const projecaoCef = require('../dfc-projecao-cef/projecaoCef.service');

// Dados da exportação Excel da aba DFC (pedido do usuário): o fluxo de caixa filtrado (empresa,
// período, centros), os saldos das contas, a base do Realizado (extrato × rateio), a base do
// Projetado (o que compõe cada valor da versão do Orçamento, fonte a fonte) e o rastreio da Projeção
// CEF de cada obra. As planilhas só desenham (planilhas/*.js).

const ROTULO_ORIGEM = {
  CEF_NOVO_REGISTRO: 'CEF - NOVO REGISTRO',
  CEF_MEDICAO: 'CEF - MEDIÇÃO',
  CEF_CREDITO_PJ: 'CEF - CRÉDITO PJ',
  CEF_JUROS: 'CEF - JUROS',
  CEF_AMORTIZACAO: 'CEF - AMORTIZAÇÃO',
  SIENGE_ORCAMENTO_EMPRESARIAL: 'SIENGE - EMPRESARIAL DESEMBOLSO',
  SIENGE_AGING: 'SIENGE - AGING',
  HORIZON_ORCAMENTO_INFORMADO: 'HORIZON - INFORMADO',
};
const COMPONENTE_CEF = {
  CEF_NOVO_REGISTRO: 'Novo Registro',
  CEF_MEDICAO: 'Medição',
  CEF_CREDITO_PJ: 'Crédito PJ',
  CEF_JUROS: 'Juros',
  CEF_AMORTIZACAO: 'Amortização',
};
const ORIGEM_EXTRATO = { CP: 'Contas a pagar', CR: 'Contas a receber', BC: 'Bancário', CX: 'Caixa' };
const PESSOA = { receber: 'client_name', pagar: 'creditor_name' };

const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const chave = (centro, conta, mes) => `${centro}|${conta}|${mes}`;

async function centrosInfo(empresaId) {
  const { rows } = await pool.query('SELECT sienge_id, name, codigo_contrato_caixa FROM centros_custo_sienge WHERE empresa_id = $1', [
    empresaId,
  ]);
  return new Map(rows.map((r) => [r.sienge_id, r]));
}

// Classificação comum às duas bases: máscaras e conta.
function classificacao(cls, centroId, natureza, lado) {
  const c = cls.classificar(centroId, natureza);
  if (!c) return null;
  const conta = cls.conta(natureza);
  return {
    n1: c.n1,
    n2: c.n2,
    mascara_n1: cls.nomeMascara[c.n1],
    mascara_n2: cls.nomeMascara[c.n2],
    lado: lado === 'E' ? 'Entrada' : 'Saída',
    natureza_codigo: conta.codigo,
    natureza: conta.name,
    natureza_id: natureza,
  };
}

// ─── Realizado: extrato das contas com "Projeta DFC" × rateio, nos meses realizados ──────────────
async function baseRealizado(empresaId, fluxo, centros) {
  const meses = fluxo.meses.filter((m) => m <= fluxo.mesAtual);
  if (!meses.length) return [];
  const { rows } = await pool.query(
    `SELECT r.centro_id, r.natureza_id, r.percentual, r.valor, to_char(r.mes, 'YYYY-MM') AS mes,
            to_char(e.date, 'YYYY-MM-DD') AS data, e.id AS id_sienge, e.numero_conta, c.nome AS conta_nome,
            c.company_name, e.statement_origin, e.bill_id, e.installment_number, e.document_id, e.document_number,
            e.description, e.statement_type, e.value
       FROM sie_extrato_contas_rateio r
       JOIN sie_extrato_contas e ON e.registro_id = r.registro_id
       JOIN contas_bancarias_sienge c
         ON c.empresa_id = r.empresa_id AND c.company_id = r.company_id AND c.numero_conta = r.numero_conta AND c.projeta_dfc
      WHERE r.empresa_id = $1 AND r.mes BETWEEN $2::date AND $3::date
        AND ($4::int[] IS NULL OR r.centro_id = ANY($4::int[]))
      ORDER BY r.mes, e.date, e.id, r.id`,
    [empresaId, `${meses[0]}-01`, `${meses[meses.length - 1]}-01`, fluxo.filtro ? [...fluxo.filtro] : null]
  );
  const linhas = [];
  rows.forEach((r) => {
    const valor = Number(r.valor);
    if (!valor) return;
    const cls = classificacao(fluxo.classificador, r.centro_id, r.natureza_id, valor >= 0 ? 'E' : 'S');
    if (!cls) return; // fora do fluxo (sem natureza / sem Máscara DFC), como na tela
    const sinal = valor < 0 ? -1 : 1;
    linhas.push({
      mes: r.mes,
      data: r.data,
      empresa: r.company_name || '',
      conta_bancaria: `${r.conta_nome || ''} (${r.numero_conta})`.trim(),
      centro: centros.get(r.centro_id)?.name || `Centro ${r.centro_id}`,
      ...cls,
      origem: ORIGEM_EXTRATO[r.statement_origin] || r.statement_origin || '',
      titulo: r.bill_id ? `${r.bill_id}${r.installment_number ? `/${r.installment_number}` : ''}` : '',
      documento: [r.document_id?.trim(), r.document_number?.trim()].filter(Boolean).join(' '),
      favorecido: r.description?.trim() || r.statement_type || '',
      valor_lancamento: r2(Math.abs(Number(r.value)) * sinal),
      percentual: Number(r.percentual) / 100,
      valor,
      id_sienge: r.id_sienge ? Number(r.id_sienge) : null,
    });
  });
  return linhas;
}

// ─── Projetado: cada valor da versão do Orçamento, aberto fonte a fonte ──────────────────────────
async function baseProjetado(empresaId, fluxo, centros) {
  const { meses } = fluxo;
  if (!meses.length || !fluxo.versao) return { linhas: [], celulas: [] };
  const filtroCentros = fluxo.filtro ? [...fluxo.filtro] : null;
  const { rows: valores } = await pool.query(
    `SELECT centro_id, sienge_id, to_char(mes, 'YYYY-MM') AS mes, valor, origem
       FROM dfc_orcamento_valores
      WHERE empresa_id = $1 AND mes BETWEEN $2::date AND $3::date
        AND ($4::int[] IS NULL OR centro_id = ANY($4::int[]))`,
    [empresaId, `${meses[0]}-01`, `${meses[meses.length - 1]}-01`, filtroCentros]
  );
  // Células que entram no fluxo (mesmo classificador da tela).
  const celulas = new Map();
  valores.forEach((v) => {
    const valor = Number(v.valor);
    if (!valor) return;
    const cls = classificacao(fluxo.classificador, v.centro_id, v.sienge_id, valor > 0 ? 'E' : 'S');
    if (!cls) return;
    celulas.set(chave(v.centro_id, v.sienge_id, v.mes), { ...v, valor, cls, itens: [] });
  });
  const porOrigem = (origem) => [...celulas.values()].filter((c) => c.origem === origem);
  const centrosDe = (lista) => [...new Set(lista.map((c) => c.centro_id))];
  const de = `${meses[0]}-01`;
  const ate = `${fluxo.somarMeses(meses[meses.length - 1], 1)}-01`;

  // HORIZON - INFORMADO
  const informados = porOrigem('HORIZON_ORCAMENTO_INFORMADO');
  if (informados.length) {
    const { rows } = await pool.query(
      `SELECT i.centro_id, i.sienge_id, to_char(i.mes, 'YYYY-MM') AS mes, i.valor, i.atualizado_em, u.nome AS usuario
         FROM dfc_orcamento_informado i LEFT JOIN usuarios u ON u.id = i.usuario_id
        WHERE i.empresa_id = $1 AND i.valor IS NOT NULL AND i.mes >= $2::date AND i.mes < $3::date`,
      [empresaId, de, ate]
    );
    rows.forEach((r) => {
      const c = celulas.get(chave(r.centro_id, r.sienge_id, r.mes));
      if (!c || c.origem !== 'HORIZON_ORCAMENTO_INFORMADO') return;
      c.itens.push({
        fonte: 'Informado (aba Orçamentos)',
        descricao: `Digitado por ${r.usuario || 'carga direta (sem usuário)'}`,
        emissao: r.atualizado_em,
        valor_base: Number(r.valor),
        valor: Number(r.valor),
      });
    });
  }

  // SIENGE - AGING: parcelas que vencem no mês, no rateio natureza × centro.
  const agings = porOrigem('SIENGE_AGING');
  if (agings.length) {
    for (const tipo of ['receber', 'pagar']) {
      const t = dfcAging.TIPOS[tipo];
      const { rows } = await pool.query(
        `SELECT cat.cost_center_id::int AS centro_id, cat.financial_category_id AS conta, to_char(i.due_date, 'YYYY-MM') AS mes,
                i.bill_id, i.installment_id, i.document_identification_id AS doc, i.document_number, i.${PESSOA[tipo]} AS pessoa,
                to_char(i.issue_date, 'YYYY-MM-DD') AS emissao, to_char(i.due_date, 'YYYY-MM-DD') AS vencimento,
                i.balance_amount, ${t.valor} AS valor_parcela, COALESCE(cat.financial_category_rate, 0) AS rateio
           FROM ${t.categorias} cat
           JOIN ${t.parcelas} i ON i.empresa_id = cat.empresa_id AND i.bill_id = cat.bill_id AND i.installment_id = cat.installment_id
          WHERE cat.empresa_id = $1 AND cat.cost_center_id = ANY($2::bigint[])
            AND i.due_date >= $3::date AND i.due_date < $4::date AND ${t.filtro}
          ORDER BY i.due_date, i.bill_id, i.installment_id`,
        [empresaId, centrosDe(agings), de, ate]
      );
      rows.forEach((r) => {
        const c = celulas.get(chave(r.centro_id, Number(r.conta), r.mes));
        if (!c || c.origem !== 'SIENGE_AGING') return;
        const valor = (Number(r.valor_parcela) * Number(r.rateio) * t.sinal) / 100;
        if (!valor) return;
        c.itens.push({
          fonte: tipo === 'pagar' ? 'Aging a pagar' : 'Aging a receber',
          referencia: `${r.bill_id}/${r.installment_id}`,
          documento: [r.doc?.trim(), r.document_number?.trim()].filter(Boolean).join(' '),
          descricao: r.pessoa || '',
          emissao: r.emissao,
          vencimento: r.vencimento,
          valor_base: r2(Number(r.valor_parcela) * t.sinal),
          percentual: Number(r.rateio) / 100,
          saldo_aberto: r.balance_amount === null ? null : Number(r.balance_amount),
          valor,
        });
      });
    }
  }

  // SIENGE - EMPRESARIAL DESEMBOLSO: orçado do mês (última versão) deslocado pelo prazo médio.
  const empresariais = porOrigem(dfcEmpresarial.ORIGEM);
  if (empresariais.length) {
    const { rows: fichas } = await pool.query('SELECT sienge_id, prazo_medio, ficha FROM dfc_desembolso_fichas WHERE empresa_id = $1', [
      empresaId,
    ]);
    const prazo = new Map(fichas.map((f) => [f.sienge_id, { k: dfcEmpresarial.deslocamentoDe(f), dias: f.prazo_medio }]));
    const { rows } = await pool.query(
      `WITH ultima AS (${dfcEmpresarial.SQL_ULTIMA_VERSAO})
       SELECT u.cost_center_id::int AS centro_id, c.id AS conta, to_char(v.mes, 'YYYY-MM') AS mes_orcado,
              u.id AS orcamento, u.description, u.version_number, SUM(v.total_price) AS valor
         FROM ultima u
         JOIN sie_business_budget_categorias c ON c.registro_id = u.registro_id
         JOIN sie_business_budget_valores v ON v.categoria_id = c.categoria_id
        WHERE u.cost_center_id = ANY($2::bigint[]) AND v.mes IS NOT NULL
          AND COALESCE(v.total_price, 0) <> 0 AND COALESCE(c.type, '') <> 'T'
        GROUP BY 1, 2, 3, 4, 5, 6`,
      [empresaId, centrosDe(empresariais)]
    );
    rows.forEach((r) => {
      const conta = Number(r.conta);
      const p = prazo.get(conta);
      const k = p?.k ?? 0;
      const c = celulas.get(chave(r.centro_id, conta, fluxo.somarMeses(r.mes_orcado, k)));
      if (!c || c.origem !== dfcEmpresarial.ORIGEM) return;
      c.itens.push({
        fonte: 'Orçamento Empresarial',
        referencia: `Orçamento ${r.orcamento}${r.version_number !== null ? ` v${r.version_number}` : ''}`,
        descricao: r.description || '',
        mes_orcado: r.mes_orcado,
        prazo: p?.dias === null || p?.dias === undefined ? null : Number(p.dias),
        deslocamento: k,
        valor_base: Number(r.valor),
        valor: -Number(r.valor),
      });
    });
  }

  // Projeção CEF: o valor gravado da obra no mês (o dossiê fica na aba da obra).
  const cefs = [...celulas.values()].filter((c) => c.origem in projecaoCef.SAIDAS);
  if (cefs.length) {
    const { rows } = await pool.query(
      `SELECT sienge_id AS centro_id, to_char(mes, 'YYYY-MM') AS mes, novo_registro, medicao, credito_pj, juros, amortizacao
         FROM dfc_projecao_cef WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])`,
      [empresaId, centrosDe(cefs)]
    );
    const gravada = new Map(rows.map((r) => [`${r.centro_id}|${r.mes}`, r]));
    cefs.forEach((c) => {
      const { coluna, sinal } = projecaoCef.SAIDAS[c.origem];
      const g = gravada.get(`${c.centro_id}|${c.mes}`);
      if (!g) return;
      c.itens.push({
        fonte: `Projeção CEF · ${COMPONENTE_CEF[c.origem]}`,
        referencia: centros.get(c.centro_id)?.codigo_contrato_caixa ? `Contrato ${centros.get(c.centro_id).codigo_contrato_caixa}` : '',
        descricao: `Projeção CEF da obra ${centros.get(c.centro_id)?.name || c.centro_id}`,
        valor: Number(g[coluna]) * sinal,
        dossie: c.centro_id,
      });
    });
  }

  // Linhas: os itens de cada célula e, se a fonte de hoje não bater com a versão, o ajuste.
  const versao = fluxo.versao.numero;
  const linhas = [];
  celulas.forEach((c) => {
    const comum = {
      mes: c.mes,
      centro: centros.get(c.centro_id)?.name || `Centro ${c.centro_id}`,
      ...c.cls,
      origem: ROTULO_ORIGEM[c.origem] || c.origem,
      origem_id: c.origem,
    };
    c.itens.forEach((i) => linhas.push({ ...comum, ...i }));
    const fonte = c.itens.reduce((t, i) => t + i.valor, 0);
    const diferenca = r2(c.valor - fonte);
    if (Math.abs(diferenca) >= 0.01) {
      linhas.push({
        ...comum,
        fonte: `Ajuste para a versão ${versao}`,
        descricao: c.itens.length ? 'A fonte mudou depois da versão salva' : 'A fonte não tem mais este valor',
        valor: diferenca,
        observacao: `Versão ${versao}: ${c.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · fonte hoje: ${r2(fonte).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
        })}`,
        ajuste: true,
      });
    }
  });
  const ordemMascara = new Map();
  fluxo.classificador.mascaras.forEach((g, i) => {
    ordemMascara.set(g.id, i * 1000);
    g.filhos.forEach((f, j) => ordemMascara.set(f.id, i * 1000 + j + 1));
  });
  linhas.sort(
    (a, b) =>
      a.mes.localeCompare(b.mes) ||
      ordemMascara.get(a.n2) - ordemMascara.get(b.n2) ||
      a.lado.localeCompare(b.lado) ||
      String(a.natureza_id).localeCompare(String(b.natureza_id)) ||
      a.centro.localeCompare(b.centro) ||
      Number(Boolean(a.ajuste)) - Number(Boolean(b.ajuste)) ||
      String(a.vencimento || '').localeCompare(String(b.vencimento || ''))
  );
  return { linhas, celulas: [...celulas.values()] };
}

// ─── Projeção CEF: rastreio de cada obra com valor CEF no filtro ──────────────────────────────────
async function obrasCef(empresaId, celulas) {
  const ids = [...new Set(celulas.filter((c) => c.origem in projecaoCef.SAIDAS).map((c) => c.centro_id))];
  const obras = [];
  for (const id of ids) {
    const rastro = await projecaoCef.rastrear(empresaId, id);
    if (!rastro) continue;
    obras.push(rastro);
  }
  return obras;
}

async function dados(empresaId, { inicio, fim, centros = [] }) {
  const [fluxo, infoCentros] = await Promise.all([fluxoService.montar(empresaId, { inicio, fim, centros }), centrosInfo(empresaId)]);
  fluxo.somarMeses = fluxoService.somarMeses;
  const mesesSaldos = fluxo.meses.filter((m) => m <= fluxo.mesAtual);
  const [realizado, projetado, saldos] = await Promise.all([
    baseRealizado(empresaId, fluxo, infoCentros),
    baseProjetado(empresaId, fluxo, infoCentros),
    // Abertura de cada mês até o atual (o extrato vai até o início do mês atual).
    mesesSaldos.length ? dfcSaldos.saldosPorConta(empresaId, mesesSaldos) : [],
  ]);
  const obras = await obrasCef(empresaId, projetado.celulas);
  return { fluxo, centros: infoCentros, realizado, projetado: projetado.linhas, saldos, mesesSaldos, obras, ROTULO_ORIGEM, COMPONENTE_CEF };
}

// Só o fluxo e as bases (MCP do DFC — ferramenta de lançamentos), sem saldos nem dossiês da CEF.
async function bases(empresaId, { inicio, fim, centros = [] }) {
  const [fluxo, infoCentros] = await Promise.all([fluxoService.montar(empresaId, { inicio, fim, centros }), centrosInfo(empresaId)]);
  fluxo.somarMeses = fluxoService.somarMeses;
  const [realizado, projetado] = await Promise.all([baseRealizado(empresaId, fluxo, infoCentros), baseProjetado(empresaId, fluxo, infoCentros)]);
  return { fluxo, realizado, projetado: projetado.linhas };
}

module.exports = { dados, bases, ROTULO_ORIGEM };
