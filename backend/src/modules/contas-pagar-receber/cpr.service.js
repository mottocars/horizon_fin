const pool = require('../../config/db');

// Cadastros › Contas Pagar / Receber (database/migrations/2026-11-10-contas-pagar-receber.sql):
// títulos a pagar e a receber lançados no Horizon. Um título (cpr_titulos) tem parcelas (cpr_parcelas:
// vencimento, valor e a baixa) e um rateio por centro de custo e plano de contas (cpr_rateios), com os
// centros e naturezas dos cadastros da empresa. A soma das parcelas e a soma do rateio fecham com o
// valor do título. Título com parcela baixada não muda nem sai: estorna a baixa antes.
// Tipo de documento "Projeção PLS CEF": o formulário dele ainda vai ser criado — por ora não grava.

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const agora = () => new Date();
const centavos = (v) => Math.round(Number(v) * 100);
const moeda = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MSG_PLS_CEF = 'A Projeção PLS CEF ainda não está disponível.';
const MSG_BAIXADO = 'Título com parcela baixada: estorne a baixa para alterar ou excluir.';

// Fornecedores (credores) e clientes da empresa: o cadastro da origem e, para quem não está nele, o nome
// que veio nos títulos (mesma lista do painel de filtros do Aging List).
// Colunas: id, nome, ordem (1 = cadastro, 2 = nome do título).
const SQL_FORNECEDORES = `
  SELECT c.credor_id::bigint AS id, c.nome, 1 AS ordem
    FROM sienge_credores_cache c JOIN integracoes_sienge i ON i.tenant = c.tenant AND i.empresa_id = $1
  UNION ALL SELECT DISTINCT creditor_id::bigint, creditor_name, 2 FROM sie_outcome WHERE empresa_id = $1 AND creditor_id IS NOT NULL`;
const SQL_CLIENTES = `
  SELECT id::bigint AS id, COALESCE(NULLIF(name, ''), social_name) AS nome, 1 AS ordem FROM sie_customers WHERE empresa_id = $1
  UNION ALL SELECT DISTINCT client_id::bigint, client_name, 2 FROM sie_income WHERE empresa_id = $1 AND client_id IS NOT NULL`;

// Um nome por código (o do cadastro primeiro), sem espaços nas pontas, em ordem alfabética.
function pessoas(rows) {
  const m = new Map();
  rows
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .forEach((r) => {
      const nome = r.nome?.trim();
      if (r.id !== null && nome && !m.has(String(r.id))) m.set(String(r.id), nome);
    });
  return [...m.entries()].map(([id, nome]) => ({ id: Number(id), nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Centros de custo e plano de contas (só as contas analíticas) da empresa, fornecedores e clientes.
async function opcoes(empresaId) {
  const [centros, naturezas, fornecedores, clientes] = await Promise.all([
    pool.query(
      `SELECT sienge_id AS id, COALESCE(NULLIF(apelido, ''), name) AS nome, natureza
         FROM centros_custo_sienge WHERE empresa_id = $1 ORDER BY sienge_id`,
      [empresaId]
    ),
    pool.query(
      `SELECT sienge_id::text AS id, name AS nome, fl_ativa = 'N' AS inativa
         FROM planos_financeiros_sienge WHERE empresa_id = $1 AND tp_conta IS DISTINCT FROM 'T' ORDER BY sienge_id::text`,
      [empresaId]
    ),
    pool.query(SQL_FORNECEDORES, [empresaId]),
    pool.query(SQL_CLIENTES, [empresaId]),
  ]);
  return {
    centros: centros.rows,
    naturezas: naturezas.rows,
    fornecedores: pessoas(fornecedores.rows),
    clientes: pessoas(clientes.rows),
  };
}

// Parcelas com vencimento no período (uma linha por parcela), com o título e o resumo do rateio.
async function listar(empresaId, inicio, fim) {
  const { rows } = await pool.query(
    `SELECT p.id AS parcela_id, p.numero, p.vencimento, p.valor, p.data_baixa, p.valor_baixa,
            t.id AS titulo_id, t.tipo, t.tipo_documento, t.pessoa_nome, t.documento, t.historico,
            (SELECT count(*)::int FROM cpr_parcelas x WHERE x.titulo_id = t.id) AS total_parcelas,
            r.centros
       FROM cpr_parcelas p
       JOIN cpr_titulos t ON t.id = p.titulo_id
       LEFT JOIN LATERAL (
         SELECT array_agg(DISTINCT COALESCE(NULLIF(c.apelido, ''), c.name, ra.centro_id::text)) AS centros
           FROM cpr_rateios ra
           LEFT JOIN centros_custo_sienge c ON c.empresa_id = t.empresa_id AND c.sienge_id = ra.centro_id
          WHERE ra.titulo_id = t.id
       ) r ON TRUE
      WHERE t.empresa_id = $1 AND p.vencimento BETWEEN $2 AND $3
      ORDER BY p.vencimento, t.id, p.numero`,
    [empresaId, inicio, fim]
  );
  return rows.map((r) => ({
    ...r,
    valor: Number(r.valor),
    valor_baixa: r.valor_baixa === null ? null : Number(r.valor_baixa),
    centros: r.centros || [],
  }));
}

async function buscarTitulo(db, empresaId, id) {
  const { rows } = await db.query('SELECT * FROM cpr_titulos WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
  return rows[0] || null;
}

async function temBaixa(db, tituloId) {
  const { rows } = await db.query('SELECT 1 FROM cpr_parcelas WHERE titulo_id = $1 AND data_baixa IS NOT NULL LIMIT 1', [tituloId]);
  return Boolean(rows[0]);
}

// O título com as parcelas, o rateio e quem criou/alterou.
async function obter(empresaId, id) {
  const t = await buscarTitulo(pool, empresaId, id);
  if (!t) throw erro(404, 'Título não encontrado nesta empresa.');
  const [{ rows: parcelas }, { rows: rateios }, { rows: usuarios }] = await Promise.all([
    pool.query(
      `SELECT p.id, p.numero, p.vencimento, p.valor, p.data_baixa, p.valor_baixa, u.nome AS baixado_por
         FROM cpr_parcelas p LEFT JOIN usuarios u ON u.id = p.baixado_por
        WHERE p.titulo_id = $1 ORDER BY p.numero`,
      [id]
    ),
    pool.query('SELECT centro_id, natureza_id, percentual, valor FROM cpr_rateios WHERE titulo_id = $1 ORDER BY id', [id]),
    pool.query('SELECT id, nome FROM usuarios WHERE id = ANY($1::int[])', [[t.criado_por, t.alterado_por].filter(Boolean)]),
  ]);
  const nome = (uid) => usuarios.find((u) => u.id === uid)?.nome || null;
  return {
    id: t.id,
    tipo: t.tipo,
    tipo_documento: t.tipo_documento,
    pessoa_id: t.pessoa_id === null ? null : Number(t.pessoa_id),
    pessoa_nome: t.pessoa_nome,
    documento: t.documento || '',
    data_emissao: t.data_emissao,
    historico: t.historico || '',
    valor: Number(t.valor),
    parcelas: parcelas.map((p) => ({ ...p, valor: Number(p.valor), valor_baixa: p.valor_baixa === null ? null : Number(p.valor_baixa) })),
    rateios: rateios.map((r) => ({ ...r, percentual: Number(r.percentual), valor: Number(r.valor) })),
    baixado: parcelas.some((p) => p.data_baixa),
    criado_por: nome(t.criado_por),
    criado_em: t.criado_em,
    alterado_por: nome(t.alterado_por),
    atualizado_em: t.atualizado_em,
  };
}

// Confere o título contra os cadastros da empresa e devolve o que vai ser gravado: o nome do
// fornecedor/cliente, as parcelas numeradas por vencimento e o rateio com o percentual.
async function validar(empresaId, d) {
  if (d.tipo_documento === 'PROJECAO_PLS_CEF') throw erro(400, MSG_PLS_CEF);
  const total = centavos(d.valor);

  const sqlPessoa = d.tipo === 'PAGAR' ? SQL_FORNECEDORES : SQL_CLIENTES;
  const { rows: pessoa } = await pool.query(
    `SELECT nome FROM (${sqlPessoa}) p WHERE id = $2 AND NULLIF(trim(nome), '') IS NOT NULL ORDER BY ordem LIMIT 1`,
    [empresaId, d.pessoa_id]
  );
  if (!pessoa[0]) throw erro(400, d.tipo === 'PAGAR' ? 'Fornecedor não encontrado nesta empresa.' : 'Cliente não encontrado nesta empresa.');

  const somaParcelas = d.parcelas.reduce((s, p) => s + centavos(p.valor), 0);
  if (somaParcelas !== total) {
    throw erro(400, `A soma das parcelas (R$ ${moeda(somaParcelas / 100)}) não fecha com o valor do título (R$ ${moeda(total / 100)}).`);
  }
  const parcelas = d.parcelas
    .map((p, i) => ({ ...p, i }))
    .sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : a.i - b.i))
    .map((p, i) => ({ numero: i + 1, vencimento: p.vencimento, valor: centavos(p.valor) / 100 }));

  const somaRateio = d.rateios.reduce((s, r) => s + centavos(r.valor), 0);
  if (somaRateio !== total) {
    throw erro(400, `A soma do rateio (R$ ${moeda(somaRateio / 100)}) não fecha com o valor do título (R$ ${moeda(total / 100)}).`);
  }
  const pares = new Set();
  for (const r of d.rateios) {
    const chave = `${r.centro_id}|${r.natureza_id}`;
    if (pares.has(chave)) throw erro(400, 'O rateio tem o mesmo centro de custo e plano de contas em duas linhas — junte-as numa só.');
    pares.add(chave);
  }
  const centrosIds = [...new Set(d.rateios.map((r) => r.centro_id))];
  const naturezasIds = [...new Set(d.rateios.map((r) => String(r.natureza_id)))];
  const [{ rows: cc }, { rows: nat }] = await Promise.all([
    pool.query('SELECT sienge_id FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])', [empresaId, centrosIds]),
    pool.query(
      "SELECT sienge_id::text AS id FROM planos_financeiros_sienge WHERE empresa_id = $1 AND tp_conta IS DISTINCT FROM 'T' AND sienge_id::text = ANY($2::text[])",
      [empresaId, naturezasIds]
    ),
  ]);
  if (cc.length !== centrosIds.length) throw erro(400, 'Centro de custo não encontrado no cadastro da empresa.');
  if (nat.length !== naturezasIds.length) throw erro(400, 'Plano de contas não encontrado no cadastro da empresa (só contas analíticas).');
  const rateios = d.rateios.map((r) => ({
    centro_id: r.centro_id,
    natureza_id: String(r.natureza_id),
    valor: centavos(r.valor) / 100,
    percentual: Math.round((centavos(r.valor) / total) * 100 * 1e6) / 1e6,
  }));

  return { pessoa_nome: pessoa[0].nome.trim(), parcelas, rateios };
}

async function transacao(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function gravarFilhos(db, tituloId, parcelas, rateios) {
  await db.query('DELETE FROM cpr_parcelas WHERE titulo_id = $1', [tituloId]);
  await db.query('DELETE FROM cpr_rateios WHERE titulo_id = $1', [tituloId]);
  for (const p of parcelas) {
    await db.query('INSERT INTO cpr_parcelas (titulo_id, numero, vencimento, valor) VALUES ($1, $2, $3, $4)', [tituloId, p.numero, p.vencimento, p.valor]);
  }
  for (const r of rateios) {
    await db.query('INSERT INTO cpr_rateios (titulo_id, centro_id, natureza_id, percentual, valor) VALUES ($1, $2, $3, $4, $5)', [
      tituloId,
      r.centro_id,
      r.natureza_id,
      r.percentual,
      r.valor,
    ]);
  }
}

// `d`: { tipo 'PAGAR'|'RECEBER', tipo_documento, pessoa_id, documento, data_emissao, historico, valor,
// parcelas: [{ vencimento, valor }], rateios: [{ centro_id, natureza_id, valor }] }.
async function criar(empresaId, d, usuarioId) {
  const v = await validar(empresaId, d);
  const id = await transacao(async (db) => {
    const quando = agora();
    const { rows } = await db.query(
      `INSERT INTO cpr_titulos (empresa_id, tipo, tipo_documento, pessoa_id, pessoa_nome, documento, data_emissao, historico, valor,
                                criado_por, alterado_por, criado_em, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $11) RETURNING id`,
      [empresaId, d.tipo, d.tipo_documento, d.pessoa_id, v.pessoa_nome, d.documento || null, d.data_emissao, d.historico || null, d.valor, usuarioId, quando]
    );
    await gravarFilhos(db, rows[0].id, v.parcelas, v.rateios);
    return rows[0].id;
  });
  return obter(empresaId, id);
}

async function alterar(empresaId, id, d, usuarioId) {
  const atual = await buscarTitulo(pool, empresaId, id);
  if (!atual) throw erro(404, 'Título não encontrado nesta empresa.');
  if (await temBaixa(pool, id)) throw erro(409, MSG_BAIXADO);
  const v = await validar(empresaId, d);
  await transacao(async (db) => {
    await db.query(
      `UPDATE cpr_titulos SET tipo = $3, tipo_documento = $4, pessoa_id = $5, pessoa_nome = $6, documento = $7, data_emissao = $8,
              historico = $9, valor = $10, alterado_por = $11, atualizado_em = $12
        WHERE empresa_id = $1 AND id = $2`,
      [empresaId, id, d.tipo, d.tipo_documento, d.pessoa_id, v.pessoa_nome, d.documento || null, d.data_emissao, d.historico || null, d.valor, usuarioId, agora()]
    );
    await gravarFilhos(db, id, v.parcelas, v.rateios);
  });
  return obter(empresaId, id);
}

async function excluir(empresaId, id) {
  const atual = await buscarTitulo(pool, empresaId, id);
  if (!atual) throw erro(404, 'Título não encontrado nesta empresa.');
  if (await temBaixa(pool, id)) throw erro(409, MSG_BAIXADO);
  await pool.query('DELETE FROM cpr_titulos WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
  return { ok: true };
}

async function buscarParcela(empresaId, parcelaId) {
  const { rows } = await pool.query(
    `SELECT p.* FROM cpr_parcelas p JOIN cpr_titulos t ON t.id = p.titulo_id WHERE t.empresa_id = $1 AND p.id = $2`,
    [empresaId, parcelaId]
  );
  if (!rows[0]) throw erro(404, 'Parcela não encontrada nesta empresa.');
  return rows[0];
}

// Baixa (pagamento ou recebimento) de uma parcela: data e valor.
async function baixar(empresaId, parcelaId, { data_baixa, valor_baixa }, usuarioId) {
  const p = await buscarParcela(empresaId, parcelaId);
  if (p.data_baixa) throw erro(409, 'Esta parcela já está baixada.');
  await pool.query('UPDATE cpr_parcelas SET data_baixa = $2, valor_baixa = $3, baixado_por = $4, baixado_em = $5 WHERE id = $1', [
    parcelaId,
    data_baixa,
    valor_baixa,
    usuarioId,
    agora(),
  ]);
  return { ok: true };
}

async function estornar(empresaId, parcelaId) {
  const p = await buscarParcela(empresaId, parcelaId);
  if (!p.data_baixa) throw erro(409, 'Esta parcela não está baixada.');
  await pool.query('UPDATE cpr_parcelas SET data_baixa = NULL, valor_baixa = NULL, baixado_por = NULL, baixado_em = NULL WHERE id = $1', [parcelaId]);
  return { ok: true };
}

// Projeção PLS CEF › Avanços: a curva S diária do Prevision do centro (prevision_dashboard_scurve.expected,
// acumulado de 0 a 1 → %), na visão primária/secundária escolhida no cadastro do centro — a mesma fonte do
// avanço Prevision da DFC Construtoras › Avanços (lá somado por mês; os acumulados batem). Como na DFC, só
// vale com o "Código Prevision" preenchido.
async function avancoPrevisto(empresaId, centroId) {
  const { rows: c } = await pool.query(
    `SELECT sienge_id, COALESCE(NULLIF(apelido, ''), name) AS nome, codigo_prevision, prevision_primary_view
       FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2`,
    [empresaId, centroId]
  );
  if (!c[0]) throw erro(404, 'Centro de custo não encontrado nesta empresa.');
  const temPrevision = Boolean(c[0].codigo_prevision && String(c[0].codigo_prevision).trim());
  const { rows } = temPrevision
    ? await pool.query(
        `SELECT data, expected FROM prevision_dashboard_scurve
          WHERE empresa_id = $1 AND sienge_id = $2 AND primary_view = $3 ORDER BY data`,
        [empresaId, centroId, c[0].prevision_primary_view]
      )
    : { rows: [] };
  return {
    centro_id: c[0].sienge_id,
    centro_nome: c[0].nome,
    tem_prevision: temPrevision,
    pontos: rows.map((r) => ({ data: r.data, previsto: Math.round(Number(r.expected) * 10000) / 100 })),
  };
}

// Contrato Caixa do centro (centros_custo_sienge.codigo_contrato_caixa) — liga o centro ao DCD
// (dcd_contratos.numero_contrato) e ao Geral dos Empreendimentos (extrato_empreendimentos.contrato_empreendimento).
async function centroComContrato(empresaId, centroId) {
  const { rows } = await pool.query(
    `SELECT sienge_id, COALESCE(NULLIF(apelido, ''), name) AS nome, NULLIF(trim(codigo_contrato_caixa), '') AS contrato
       FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2`,
    [empresaId, centroId]
  );
  if (!rows[0]) throw erro(404, 'Centro de custo não encontrado nesta empresa.');
  return rows[0];
}

// Projeção PLS CEF › Documentos: o último DCD e o último Geral dos Empreendimentos importados no Portal das
// Construtoras para o contrato Caixa do centro (cada importação substitui a anterior do mesmo contrato), com
// quando e quem importou.
async function documentosPls(empresaId, centroId) {
  const c = await centroComContrato(empresaId, centroId);
  if (!c.contrato) return { centro_id: c.sienge_id, centro_nome: c.nome, contrato: null, dcd: null, geral: null };
  const [{ rows: dcd }, { rows: geral }] = await Promise.all([
    pool.query(
      `SELECT d.nome_empreendimento, d.arquivo_original, d.arquivo_armazenado IS NOT NULL AS tem_arquivo,
              d.importado_em, d.atualizado_em, u.nome AS enviado_por
         FROM dcd_contratos d LEFT JOIN usuarios u ON u.id = d.enviado_por_usuario_id
        WHERE d.empresa_id = $1 AND d.numero_contrato = $2`,
      [empresaId, c.contrato]
    ),
    pool.query(
      `SELECT g.nome_empreendimento, g.arquivo_original, g.arquivo_armazenado IS NOT NULL AS tem_arquivo,
              g.importado_em, g.atualizado_em, u.nome AS enviado_por
         FROM extrato_empreendimentos g LEFT JOIN usuarios u ON u.id = g.enviado_por_usuario_id
        WHERE g.empresa_id = $1 AND g.contrato_empreendimento = $2`,
      [empresaId, c.contrato]
    ),
  ]);
  return { centro_id: c.sienge_id, centro_nome: c.nome, contrato: c.contrato, dcd: dcd[0] || null, geral: geral[0] || null };
}

// Projeção PLS CEF › Cabeçalho: o que o centro (obra) traz pronto para projetar o recebimento da Caixa — uma
// projeção curta, da última liberação anterior à Data Previsão Medição até ela. Fontes da Projeção CEF da DFC
// (dfc-projecao-cef): o DCD e o Geral do contrato Caixa da obra.
// - Última liberação: a parcela mais recente do cronograma de liberação do DCD com status LP (paga — não LR),
//   fora as parcelas 285, EX e TEX (só as numeradas), ANTERIOR à Data Previsão Medição (`dataMedicao`; sem ela,
//   a mais recente de todas); o avanço liberado é o % acumulado do físico-financeiro nessa parcela.
// - CTO, teto PJ e Demanda Mínima: do mesmo lugar que preenche os Parâmetros da DFC (fonteFixos — DCD), sem
//   depender de haver versão de Parâmetros.
// - Crédito PJ já liberado: soma de "Financiamento Construtora" das parcelas LP anteriores à medição (o saldo do
//   teto PJ).
// - Unidades do Geral (sem o 1º contrato, o da construtora): só as já registradas (data de registro do Geral).
//   Registradas até a data da última liberação = base da Medição; registradas depois dela = Novo Registro
//   (pedido do usuário: projeção curta, sem projetar registro por assinatura + prazo).
async function cabecalhoPls(empresaId, centroId, dataMedicao = null) {
  const projecaoCef = require('../dfc-projecao-cef/projecaoCef.service');
  const parametrosService = require('../dfc-parametros/dfcParametros.service');
  const c = await centroComContrato(empresaId, centroId);
  const contrato = c.contrato;

  const [{ rows: lib }, { rows: cred }, { rows: envios }, { fixos }, { rows: contasCef }, config] = await Promise.all([
    contrato
      ? pool.query(
          `SELECT parcela, data_parcela FROM dcd_cronograma_liberacao
            WHERE empresa_id = $1 AND numero_contrato = $2 AND status = 'LP' AND parcela ~ '^[0-9]+$' AND parcela NOT IN ('285', 'EX', 'TEX')
              AND ($3::date IS NULL OR data_parcela < $3::date)
            ORDER BY data_parcela DESC, parcela DESC LIMIT 1`,
          [empresaId, contrato, dataMedicao]
        )
      : { rows: [] },
    contrato
      ? pool.query(
          `SELECT COALESCE(SUM(financiamento_construtora), 0) AS total FROM dcd_cronograma_liberacao
            WHERE empresa_id = $1 AND numero_contrato = $2 AND status = 'LP'
              AND ($3::date IS NULL OR data_parcela < $3::date)`,
          [empresaId, contrato, dataMedicao]
        )
      : { rows: [{ total: 0 }] },
    contrato
      ? pool.query(
          `SELECT (SELECT importado_em FROM dcd_contratos WHERE empresa_id = $1 AND numero_contrato = $2) AS dcd,
                  (SELECT importado_em FROM extrato_empreendimentos WHERE empresa_id = $1 AND contrato_empreendimento = $2) AS geral`,
          [empresaId, contrato]
        )
      : { rows: [{ dcd: null, geral: null }] },
    parametrosService.fonteFixos(empresaId, centroId),
    // Contas do plano da DFC com as Origens Projeção CEF — do plano próprio do centro, se ele tiver versão,
    // senão do Global (mesma escolha de dfc-projecao-cef/orcamento): sugestão de plano de contas da aba Rateios.
    pool.query(
      `SELECT origem_projecao, sienge_id::text AS conta FROM dfc_plano_contas_centro
        WHERE empresa_id = $1 AND centro_id = $2 AND origem_projecao IN ('CEF_NOVO_REGISTRO', 'CEF_MEDICAO', 'CEF_CREDITO_PJ')
          AND EXISTS (SELECT 1 FROM dfc_plano_contas_versoes v WHERE v.empresa_id = $1 AND v.centro_id = $2)
       UNION ALL
       SELECT origem_projecao, sienge_id::text FROM dfc_plano_contas
        WHERE empresa_id = $1 AND origem_projecao IN ('CEF_NOVO_REGISTRO', 'CEF_MEDICAO', 'CEF_CREDITO_PJ')
          AND NOT EXISTS (SELECT 1 FROM dfc_plano_contas_versoes v WHERE v.empresa_id = $1 AND v.centro_id = $2)`,
      [empresaId, centroId]
    ),
    obterConfiguracoes(empresaId),
  ]);

  const ultima = lib[0] || null;
  let avancoLiberado = null;
  if (ultima) {
    const { rows: ff } = await pool.query(
      `SELECT percentual_acumulado FROM dcd_cronograma_fisico_financeiro
        WHERE empresa_id = $1 AND numero_contrato = $2 AND parcela = $3 ORDER BY id DESC LIMIT 1`,
      [empresaId, contrato, ultima.parcela]
    );
    avancoLiberado = ff[0] ? Number(ff[0].percentual_acumulado) : null;
  }

  let unidades = null;
  if (contrato) {
    const lista = await projecaoCef.unidadesGeral(empresaId, contrato);
    const dLib = ultima ? String(ultima.data_parcela).slice(0, 10) : null;
    const novo = () => ({ qtd: 0, vgf_medicao: 0, terreno_fgts: 0 });
    const registradas = novo();
    const aposLiberacao = novo();
    let semRegistro = 0;
    lista.forEach((u) => {
      if (!u.data_registro) {
        semRegistro += 1;
        return;
      }
      const alvo = dLib && String(u.data_registro).slice(0, 10) <= dLib ? registradas : aposLiberacao;
      const n = (v) => Number(v || 0);
      alvo.qtd += 1;
      alvo.vgf_medicao += n(u.valor_financiamento) - n(u.valor_terreno) + n(u.valor_subsidio);
      alvo.terreno_fgts += n(u.valor_terreno) + n(u.valor_fgts);
    });
    const r2 = (o) => ({ qtd: o.qtd, vgf_medicao: Math.round(o.vgf_medicao * 100) / 100, terreno_fgts: Math.round(o.terreno_fgts * 100) / 100 });
    // Sem liberação no DCD não há corte: só o total e quantas ainda não têm registro.
    unidades = { total: lista.length, sem_registro: semRegistro, registradas: dLib ? r2(registradas) : null, apos_liberacao: dLib ? r2(aposLiberacao) : null };
  }

  return {
    centro_id: c.sienge_id,
    contrato,
    ultima_liberacao: ultima && { data: ultima.data_parcela, parcela: ultima.parcela },
    avanco_liberado: avancoLiberado,
    credito_pj_liberado: Math.round(Number(cred[0].total) * 100) / 100,
    envio_dcd: envios[0].dcd,
    envio_geral: envios[0].geral,
    parametros: {
      cto: fixos.cto ?? null,
      valor_financiamento_pj: fixos.valor_financiamento_pj ?? null,
      data_demanda_minima: fixos.data_demanda_minima ?? null,
    },
    unidades,
    // Padrão da aba Configurações da tela; sem ele, a conta da Origem Projeção CEF do plano da DFC.
    contas_sugeridas: {
      novo_registro: config.contas.novo_registro || contasCef.find((r) => r.origem_projecao === 'CEF_NOVO_REGISTRO')?.conta || null,
      medicao: config.contas.medicao || contasCef.find((r) => r.origem_projecao === 'CEF_MEDICAO')?.conta || null,
      credito_pj: config.contas.credito_pj || contasCef.find((r) => r.origem_projecao === 'CEF_CREDITO_PJ')?.conta || null,
    },
  };
}

// Aba Configurações: plano de contas padrão de cada classificação da Projeção PLS CEF, por empresa
// (cpr_configuracoes — database/migrations/2026-11-10-contas-pagar-receber-configuracoes.sql).
const CLASSIFICACOES = { novo_registro: 'conta_novo_registro', medicao: 'conta_medicao', credito_pj: 'conta_credito_pj' };

async function obterConfiguracoes(empresaId) {
  const { rows } = await pool.query(
    `SELECT c.*, u.nome AS atualizado_por_nome FROM cpr_configuracoes c LEFT JOIN usuarios u ON u.id = c.atualizado_por WHERE c.empresa_id = $1`,
    [empresaId]
  );
  const r = rows[0] || {};
  return {
    contas: Object.fromEntries(Object.entries(CLASSIFICACOES).map(([k, col]) => [k, r[col] || null])),
    atualizado_em: r.atualizado_em || null,
    atualizado_por: r.atualizado_por_nome || null,
  };
}

// `contas`: { novo_registro, medicao, credito_pj } (sienge_id da conta analítica ou null).
async function salvarConfiguracoes(empresaId, contas, usuarioId) {
  const ids = [...new Set(Object.values(contas).filter(Boolean).map(String))];
  if (ids.length) {
    const { rows } = await pool.query(
      "SELECT sienge_id::text AS id FROM planos_financeiros_sienge WHERE empresa_id = $1 AND tp_conta IS DISTINCT FROM 'T' AND sienge_id::text = ANY($2::text[])",
      [empresaId, ids]
    );
    if (rows.length !== ids.length) throw erro(400, 'Plano de contas não encontrado no cadastro da empresa (só contas analíticas).');
  }
  await pool.query(
    `INSERT INTO cpr_configuracoes (empresa_id, conta_novo_registro, conta_medicao, conta_credito_pj, atualizado_por, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (empresa_id) DO UPDATE SET conta_novo_registro = EXCLUDED.conta_novo_registro, conta_medicao = EXCLUDED.conta_medicao,
       conta_credito_pj = EXCLUDED.conta_credito_pj, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = EXCLUDED.atualizado_em`,
    [empresaId, contas.novo_registro || null, contas.medicao || null, contas.credito_pj || null, usuarioId, agora()]
  );
  return obterConfiguracoes(empresaId);
}

module.exports = {
  obterConfiguracoes,
  salvarConfiguracoes,
  opcoes,
  listar,
  obter,
  criar,
  alterar,
  excluir,
  baixar,
  estornar,
  avancoPrevisto,
  centroComContrato,
  documentosPls,
  cabecalhoPls,
  MSG_PLS_CEF,
};
