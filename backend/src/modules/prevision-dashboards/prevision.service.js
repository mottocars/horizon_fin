const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const previsionApi = require('./prevision-api.client');
const { verificarCancelamento } = require('../../utils/execucaoCancelavel');
const { bloquearSeEmpresaModelo, ehEmpresaModelo } = require('../../utils/empresaModelo');

const PRIMARY_VALUES = [true, false];
const DIA = 86400000;

// Avanço de um dia vindo da API: número ou 0 (dia sem valor não soma nada).
const numero = (valor) => {
  const n = Number(valor);
  return valor != null && Number.isFinite(n) ? n : 0;
};
// 4 casas, como as colunas numeric(12,4) — a soma dos dias que dá 0,99999999 grava 1,0000.
const arred = (v) => Math.round(v * 10000) / 10000;
const hojeBrasilia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const ultimoDiaDoMes = (mes) => new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).toISOString().slice(0, 10);
const diasEntre = (de, ate) => Math.round((Date.parse(ate) - Date.parse(de)) / DIA);

async function getIntegracaoAtiva(empresaId) {
  await bloquearSeEmpresaModelo(empresaId); // empresa modelo: Prevision simulado
  const { rows } = await pool.query(
    'SELECT id, api_key_enc, company_id FROM integracoes_prevision WHERE empresa_id = $1 AND ativo = TRUE',
    [empresaId]
  );
  return rows[0] || null;
}

async function listarProjetos(empresaId) {
  if (await ehEmpresaModelo(empresaId)) {
    // empresa modelo: os projetos "do Prevision" são as obras que já têm curva S
    const { rows } = await pool.query(
      `SELECT DISTINCT g.project_id AS codigo, c.name AS nome FROM prevision_dashboard_general_info g
       JOIN centros_custo_sienge c ON c.empresa_id = g.empresa_id AND c.sienge_id = g.sienge_id WHERE g.empresa_id = $1 ORDER BY 2`,
      [empresaId]
    );
    return rows;
  }
  const integracao = await getIntegracaoAtiva(empresaId);
  if (!integracao) {
    const err = new Error('Esta empresa não possui uma integração Prevision ativa configurada.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const apiKey = decrypt(integracao.api_key_enc);
  const projetos = await previsionApi.fetchProjects(apiKey);
  return projetos
    .map((p) => ({ codigo: p.id, nome: p.name }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function listCentrosComPrevision(empresaId) {
  const { rows } = await pool.query(
    `SELECT sienge_id, name, codigo_prevision
     FROM centros_custo_sienge
     WHERE empresa_id = $1 AND codigo_prevision IS NOT NULL AND codigo_prevision != ''`,
    [empresaId]
  );
  return rows;
}

// O avanço diário do Prevision (o de CADA dia, não acumulado) vira as três tabelas de sempre:
// - curva S (prevision_dashboard_scurve): o acumulado dia a dia de base, previsto e realizado — dela o
//   Avanço das Obras tira as visões Diária, Semanal e Mensal, e o Cronograma a data em que a base chega a
//   100%. O realizado dos dias depois da última medição é 0, então o acumulado repete o último valor;
// - mensal (prevision_dashboard_monthly_progress): a soma dos dias de cada mês, datada no último dia do
//   mês — o avanço do mês da DFC › Avanços (Projeção CEF) e da Curva de Obras;
// - resumo (prevision_dashboard_general_info): início e fim = 1º e último dia da curva, realizado
//   acumulado, previsto acumulado na data da última medição (como o Prevision informava), IDP (só na
//   primária: a API nova só tem o dela). Atraso e custo não vêm na API nova e ficam vazios.
function montarAvanco(daily, { hoje, idp }) {
  const dias = daily.progress
    .filter((p) => typeof p?.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(p.date))
    .map((p) => ({ data: p.date.slice(0, 10), base: numero(p.base), expected: numero(p.expected), realized: numero(p.realized) }))
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  if (!dias.length) return null;

  const medicao = daily.lastMeasuredIn ? String(daily.lastMeasuredIn).slice(0, 10) : null;
  const scurve = [];
  const meses = new Map();
  let base = 0;
  let expected = 0;
  let realized = 0;
  let previstoNaMedicao = 0;
  let previstoHoje = 0;
  for (const d of dias) {
    base += d.base;
    expected += d.expected;
    realized += d.realized;
    if (scurve.length && scurve[scurve.length - 1].data === d.data) scurve.pop(); // dia repetido: fica o acumulado com os dois
    scurve.push({ data: d.data, base: arred(base), expected: arred(expected), realized: arred(realized) });
    if (medicao && d.data <= medicao) previstoNaMedicao = expected;
    if (d.data <= hoje) previstoHoje = expected;

    const mes = d.data.slice(0, 7);
    if (!meses.has(mes)) meses.set(mes, { data: ultimoDiaDoMes(mes), base: 0, expected: 0, realized: 0 });
    const m = meses.get(mes);
    m.base += d.base;
    m.expected += d.expected;
    m.realized += d.realized;
  }

  const inicio = dias[0].data;
  const fim = dias[dias.length - 1].data;
  return {
    scurve,
    monthly: [...meses.values()].map((m) => ({ data: m.data, base: arred(m.base), expected: arred(m.expected), realized: arred(m.realized) })),
    generalInfo: {
      start_at: inicio,
      end_at: fim,
      days_since_start: Math.max(0, diasEntre(inicio, hoje)),
      days_to_end: Math.max(0, diasEntre(hoje, fim)),
      idp,
      realized: arred(realized),
      expected: arred(medicao ? previstoNaMedicao : previstoHoje),
      last_measurement: medicao,
    },
  };
}

// Regrava a obra × visão (o que já tinha dela sai). As tabelas de pacotes e pavimentos
// (prevision_dashboard_work_packages / floor_evolution) não vêm na API nova e nenhuma tela usa: ficam como estão.
async function persistAvanco(client, { empresaId, siengeId, projectId, companyId, primary, avanco }) {
  const chave = [empresaId, siengeId, primary];
  const onde = 'WHERE empresa_id = $1 AND sienge_id = $2 AND primary_view = $3';
  await client.query(`DELETE FROM prevision_dashboard_monthly_progress ${onde}`, chave);
  await client.query(`DELETE FROM prevision_dashboard_scurve ${onde}`, chave);
  await client.query(`DELETE FROM prevision_dashboard_general_info ${onde}`, chave);

  const g = avanco.generalInfo;
  await client.query(
    `INSERT INTO prevision_dashboard_general_info
       (empresa_id, sienge_id, project_id, company_id, primary_view, start_at, end_at,
        days_since_start, days_to_end, delay, idp, cost, realized, expected, realized_cost, last_measurement)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,NULL,$11,$12,NULL,$13)`,
    [empresaId, siengeId, String(projectId), companyId, primary, g.start_at, g.end_at, g.days_since_start, g.days_to_end,
      g.idp, g.realized, g.expected, g.last_measurement]
  );

  const colunas = (linhas) => [linhas.map((l) => l.data), linhas.map((l) => l.base), linhas.map((l) => l.expected), linhas.map((l) => l.realized)];
  await client.query(
    `INSERT INTO prevision_dashboard_scurve (empresa_id, sienge_id, primary_view, data, base, expected, realized)
     SELECT $1, $2, $3, d, b, e, r FROM unnest($4::date[], $5::numeric[], $6::numeric[], $7::numeric[]) AS t(d, b, e, r)`,
    [...chave, ...colunas(avanco.scurve)]
  );
  await client.query(
    `INSERT INTO prevision_dashboard_monthly_progress (empresa_id, sienge_id, primary_view, data, base, expected, realized)
     SELECT $1, $2, $3, d, b, e, r FROM unnest($4::date[], $5::numeric[], $6::numeric[], $7::numeric[]) AS t(d, b, e, r)`,
    [...chave, ...colunas(avanco.monthly)]
  );

  return { generalInfo: 1, scurve: avanco.scurve.length, monthly: avanco.monthly.length };
}

// Busca o avanço diário de cada obra com Código Prevision (visão primária e secundária) e regrava as
// tabelas prevision_dashboard_* — a base do avanço previsto (DFC Construtoras › Avanços), das curvas do
// Avanço das Obras e da curva S de base dos atrasos (Cronogramas Obras). Cada obra × visão grava na
// própria transação: a que falhar mantém os dados anteriores. `onProgress({ texto, paginaAtual,
// totalPaginas })`: andamento (Monitor de Integrações).
async function sincronizar(empresaId, onProgress) {
  if (await ehEmpresaModelo(empresaId)) {
    const { rows } = await pool.query('SELECT COUNT(DISTINCT sienge_id)::int n FROM prevision_dashboard_general_info WHERE empresa_id = $1', [empresaId]);
    return { total_centros: rows[0].n, sucesso: rows[0].n, falha: 0, detalhes: [], simulado: true };
  }
  const integracao = await getIntegracaoAtiva(empresaId);
  if (!integracao) {
    const err = new Error('Esta empresa não possui uma integração Prevision ativa configurada.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const apiKey = decrypt(integracao.api_key_enc);
  previsionApi.tokenRest(apiKey); // token antigo: para aqui, com a mensagem de cadastrar o novo
  const companyId = previsionApi.companyIdDoToken(apiKey) || integracao.company_id || null;
  if (companyId && companyId !== integracao.company_id) {
    await pool.query('UPDATE integracoes_prevision SET company_id = $1 WHERE id = $2', [companyId, integracao.id]);
  }

  const centros = await listCentrosComPrevision(empresaId);
  if (centros.length === 0) {
    const err = new Error(
      'Nenhum centro de custo desta empresa tem um Código Prevision cadastrado.'
    );
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const hoje = hojeBrasilia();
  const resultado = [];
  const total = centros.length * PRIMARY_VALUES.length;
  let feitos = 0;
  for (const centro of centros) {
    for (const primary of PRIMARY_VALUES) {
      verificarCancelamento();
      onProgress?.({ texto: `Buscando ${centro.name} no Prevision`, paginaAtual: ++feitos, totalPaginas: total });
      const falha = (erro) => resultado.push({ sienge_id: centro.sienge_id, nome: centro.name, primary, sucesso: false, erro });
      const params = { apiKey, projectId: centro.codigo_prevision, primary };

      let avanco;
      try {
        const daily = await previsionApi.fetchDailyProgress(params);
        // O IDP é complemento (só o MCP Obra 360º usa) e só existe o da primária: se falhar, a curva
        // grava sem ele.
        let idp = null;
        if (daily && primary) {
          try {
            idp = await previsionApi.fetchIdp(params);
          } catch (err) {
            if (err.cancelada) throw err;
          }
        }
        avanco = daily && montarAvanco(daily, { hoje, idp });
      } catch (err) {
        if (err.cancelada) throw err;
        falha(err.message);
        continue;
      }

      verificarCancelamento();
      if (!avanco) {
        // Obra sem curva no Prevision (ainda sem planejamento): não é erro e não apaga o que houver.
        resultado.push({ sienge_id: centro.sienge_id, nome: centro.name, primary, sucesso: true, sem_curva: true });
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const totais = await persistAvanco(client, {
          empresaId,
          siengeId: centro.sienge_id,
          projectId: centro.codigo_prevision,
          companyId,
          primary,
          avanco,
        });
        await client.query('COMMIT');
        resultado.push({ sienge_id: centro.sienge_id, nome: centro.name, primary, sucesso: true, ...totais });
      } catch (err) {
        await client.query('ROLLBACK');
        falha(err.message);
      } finally {
        client.release();
      }
    }
  }

  return {
    total_centros: centros.length,
    sucesso: resultado.filter((r) => r.sucesso).length,
    falha: resultado.filter((r) => !r.sucesso).length,
    detalhes: resultado,
  };
}

module.exports = { sincronizar, listarProjetos, montarAvanco };
