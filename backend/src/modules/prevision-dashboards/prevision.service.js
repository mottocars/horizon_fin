const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const previsionApi = require('./prevision-api.client');

const PRIMARY_VALUES = [true, false];

function parseDate(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
}

function toNumeroOuNull(valor) {
  if (valor === null || valor === undefined || typeof valor === 'boolean') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

async function getIntegracaoAtiva(empresaId) {
  const { rows } = await pool.query(
    'SELECT id, api_key_enc, company_id FROM integracoes_prevision WHERE empresa_id = $1 AND ativo = TRUE',
    [empresaId]
  );
  return rows[0] || null;
}

async function getOrFetchCompanyId(integracao, apiKey) {
  if (integracao.company_id) return integracao.company_id;
  const companyId = await previsionApi.fetchCompanyId(apiKey);
  await pool.query('UPDATE integracoes_prevision SET company_id = $1 WHERE id = $2', [
    companyId,
    integracao.id,
  ]);
  return companyId;
}

async function listarProjetos(empresaId) {
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

function extrairSecoes(apiData) {
  const dashboard = apiData.detailedDashboard || apiData.detailed_dashboard || apiData;
  return {
    scurve: dashboard.sCurve || dashboard.s_curve || {},
    monthly: dashboard.monthlyProgress || dashboard.monthly_progress || {},
    generalInfo: dashboard.generalInfo || dashboard.general_info || {},
    packages: apiData.workPackageEvolution || apiData.work_package_evolution || [],
    floors: apiData.floorEvolution || apiData.floor_evolution || [],
  };
}

async function persistDashboard(client, { empresaId, siengeId, projectId, companyId, primary, apiData }) {
  const { scurve, monthly, generalInfo, packages, floors } = extrairSecoes(apiData);

  await client.query(
    'DELETE FROM prevision_dashboard_floor_evolution WHERE empresa_id = $1 AND sienge_id = $2 AND primary_view = $3',
    [empresaId, siengeId, primary]
  );
  await client.query(
    'DELETE FROM prevision_dashboard_work_packages WHERE empresa_id = $1 AND sienge_id = $2 AND primary_view = $3',
    [empresaId, siengeId, primary]
  );
  await client.query(
    'DELETE FROM prevision_dashboard_monthly_progress WHERE empresa_id = $1 AND sienge_id = $2 AND primary_view = $3',
    [empresaId, siengeId, primary]
  );
  await client.query(
    'DELETE FROM prevision_dashboard_scurve WHERE empresa_id = $1 AND sienge_id = $2 AND primary_view = $3',
    [empresaId, siengeId, primary]
  );
  await client.query(
    'DELETE FROM prevision_dashboard_general_info WHERE empresa_id = $1 AND sienge_id = $2 AND primary_view = $3',
    [empresaId, siengeId, primary]
  );

  let totais = { generalInfo: 0, scurve: 0, monthly: 0, packages: 0, floors: 0 };

  if (generalInfo && Object.keys(generalInfo).length > 0) {
    await client.query(
      `INSERT INTO prevision_dashboard_general_info
         (empresa_id, sienge_id, project_id, company_id, primary_view, start_at, end_at,
          days_since_start, days_to_end, delay, idp, cost, realized, expected,
          realized_cost, last_measurement)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        empresaId,
        siengeId,
        projectId,
        companyId,
        primary,
        parseDate(generalInfo.start_at),
        parseDate(generalInfo.end_at),
        toNumeroOuNull(generalInfo.days_since_start),
        toNumeroOuNull(generalInfo.days_to_end),
        toNumeroOuNull(generalInfo.delay),
        toNumeroOuNull(generalInfo.idp),
        toNumeroOuNull(generalInfo.cost),
        toNumeroOuNull(generalInfo.realized),
        toNumeroOuNull(generalInfo.expected),
        toNumeroOuNull(generalInfo.realized_cost),
        generalInfo.last_measurement ?? null,
      ]
    );
    totais.generalInfo = 1;
  }

  const datasScurve = scurve.dates || [];
  for (let i = 0; i < datasScurve.length; i++) {
    await client.query(
      `INSERT INTO prevision_dashboard_scurve (empresa_id, sienge_id, primary_view, data, base, expected, realized, measured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        empresaId,
        siengeId,
        primary,
        parseDate(datasScurve[i]),
        toNumeroOuNull(scurve.base?.[i]),
        toNumeroOuNull(scurve.expected?.[i]),
        toNumeroOuNull(scurve.realized?.[i]),
        toNumeroOuNull(scurve.measured?.[i]),
      ]
    );
    totais.scurve++;
  }

  const datasMonthly = monthly.dates || [];
  for (let i = 0; i < datasMonthly.length; i++) {
    await client.query(
      `INSERT INTO prevision_dashboard_monthly_progress (empresa_id, sienge_id, primary_view, data, base, expected, realized)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        empresaId,
        siengeId,
        primary,
        parseDate(datasMonthly[i]),
        toNumeroOuNull(monthly.base?.[i]),
        toNumeroOuNull(monthly.expected?.[i]),
        toNumeroOuNull(monthly.realized?.[i]),
      ]
    );
    totais.monthly++;
  }

  for (const p of packages) {
    await client.query(
      `INSERT INTO prevision_dashboard_work_packages
         (empresa_id, sienge_id, primary_view, service_id, nome, posicao, cor, custo_total, custo_base,
          data_inicio_base, data_fim_base, data_inicio_prevista, data_fim_prevista,
          base, previsto, realizado, idp, duracao_base, duracao_prevista, atraso, delta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        empresaId,
        siengeId,
        primary,
        p.service_id ?? null,
        p.name ?? null,
        toNumeroOuNull(p.position),
        p.color ?? null,
        toNumeroOuNull(p.total_cost),
        toNumeroOuNull(p.base_cost),
        parseDate(p.base_start_at),
        parseDate(p.base_end_at),
        parseDate(p.expected_start_at),
        parseDate(p.expected_end_at),
        toNumeroOuNull(p.base),
        toNumeroOuNull(p.expected),
        toNumeroOuNull(p.realized),
        toNumeroOuNull(p.idp),
        toNumeroOuNull(p.base_duration),
        toNumeroOuNull(p.expected_duration),
        toNumeroOuNull(p.delay),
        toNumeroOuNull(p.delta),
      ]
    );
    totais.packages++;
  }

  for (const f of floors) {
    await client.query(
      `INSERT INTO prevision_dashboard_floor_evolution
         (empresa_id, sienge_id, primary_view, floor_id, nome, posicao, grupo_replicacao, custo_total, custo_base,
          data_inicio_base, data_fim_base, data_inicio_prevista, data_fim_prevista,
          base, previsto, realizado, idp, duracao_base, duracao_prevista, atraso, delta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [
        empresaId,
        siengeId,
        primary,
        f.floor_id ?? null,
        f.name ?? null,
        toNumeroOuNull(f.position),
        f.replication_group ?? null,
        toNumeroOuNull(f.total_cost),
        toNumeroOuNull(f.base_cost),
        parseDate(f.base_start_at),
        parseDate(f.base_end_at),
        parseDate(f.expected_start_at),
        parseDate(f.expected_end_at),
        toNumeroOuNull(f.base),
        toNumeroOuNull(f.expected),
        toNumeroOuNull(f.realized),
        toNumeroOuNull(f.idp),
        toNumeroOuNull(f.base_duration),
        toNumeroOuNull(f.expected_duration),
        toNumeroOuNull(f.delay),
        toNumeroOuNull(f.delta),
      ]
    );
    totais.floors++;
  }

  return totais;
}

async function sincronizar(empresaId) {
  const integracao = await getIntegracaoAtiva(empresaId);
  if (!integracao) {
    const err = new Error('Esta empresa não possui uma integração Prevision ativa configurada.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const apiKey = decrypt(integracao.api_key_enc);
  const companyId = await getOrFetchCompanyId(integracao, apiKey);

  const centros = await listCentrosComPrevision(empresaId);
  if (centros.length === 0) {
    const err = new Error(
      'Nenhum centro de custo desta empresa tem um Código Prevision cadastrado.'
    );
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const resultado = [];
  for (const centro of centros) {
    for (const primary of PRIMARY_VALUES) {
      let apiData;
      try {
        apiData = await previsionApi.fetchDashboard({
          apiKey,
          companyId,
          projectId: centro.codigo_prevision,
          primary,
        });
      } catch (err) {
        resultado.push({
          sienge_id: centro.sienge_id,
          nome: centro.name,
          primary,
          sucesso: false,
          erro: err.message,
        });
        continue;
      }

      if (!apiData) {
        resultado.push({
          sienge_id: centro.sienge_id,
          nome: centro.name,
          primary,
          sucesso: false,
          erro: 'A API do Prevision não retornou dados para este projeto.',
        });
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const totais = await persistDashboard(client, {
          empresaId,
          siengeId: centro.sienge_id,
          projectId: centro.codigo_prevision,
          companyId,
          primary,
          apiData,
        });
        await client.query('COMMIT');
        resultado.push({ sienge_id: centro.sienge_id, nome: centro.name, primary, sucesso: true, ...totais });
      } catch (err) {
        await client.query('ROLLBACK');
        resultado.push({
          sienge_id: centro.sienge_id,
          nome: centro.name,
          primary,
          sucesso: false,
          erro: err.message,
        });
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

module.exports = { sincronizar, listarProjetos };
