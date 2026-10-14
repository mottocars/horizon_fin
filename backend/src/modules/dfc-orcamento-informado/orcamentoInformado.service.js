const pool = require('../../config/db');

const ORIGEM = 'HORIZON_ORCAMENTO_INFORMADO';
const MAX_MESES = 240;

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// 'AAAA-MM' de cada mês entre os dois, inclusive.
function mesesEntre(de, ate) {
  const meses = [];
  let [ano, mes] = de.split('-').map(Number);
  const [anoFim, mesFim] = ate.split('-').map(Number);
  while ((ano < anoFim || (ano === anoFim && mes <= mesFim)) && meses.length <= MAX_MESES) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

// Valores informados da empresa: [{ centro_id, sienge_id, mes: 'AAAA-MM', valor }].
async function list(empresaId) {
  const { rows } = await pool.query(
    `SELECT centro_id, sienge_id, to_char(mes, 'YYYY-MM') AS mes, valor
       FROM dfc_orcamento_informado WHERE empresa_id = $1`,
    [empresaId]
  );
  return rows.map((r) => ({ ...r, valor: Number(r.valor) }));
}

// Só aceita valor em centro com "Projeta DFC" e em conta com Origem Projeção "HORIZON - INFORMADO"
// (e "Projeta DFC" marcado) no plano que o centro usa — o próprio, se tiver, senão o Global.
async function exigirContaInformada(empresaId, centroId, siengeId) {
  const { rows: centro } = await pool.query(
    'SELECT projeta_dfc FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, centroId]
  );
  if (!centro[0]) throw erro(404, 'Centro de custo não encontrado nesta empresa.');
  if (!centro[0].projeta_dfc) throw erro(400, 'Centro de custo sem "Projeta DFC" (aba Centros Custos).');

  const { rows: versao } = await pool.query(
    'SELECT 1 FROM dfc_plano_contas_versoes WHERE empresa_id = $1 AND centro_id = $2',
    [empresaId, centroId]
  );
  const { rows: conta } = versao[0]
    ? await pool.query(
        `SELECT origem_projecao, projeta_dfc FROM dfc_plano_contas_centro
          WHERE empresa_id = $1 AND centro_id = $2 AND sienge_id = $3`,
        [empresaId, centroId, siengeId]
      )
    : await pool.query('SELECT origem_projecao, projeta_dfc FROM dfc_plano_contas WHERE empresa_id = $1 AND sienge_id = $2', [
        empresaId,
        siengeId,
      ]);
  if (conta[0]?.origem_projecao !== ORIGEM || conta[0]?.projeta_dfc === false) {
    throw erro(400, 'Só dá pra informar valor em conta com Origem Projeção "HORIZON - INFORMADO" (aba Plano Contas).');
  }
}

// Grava (ou apaga, com valor null / 0) o valor de um mês.
async function salvar(empresaId, { centro_id: centroId, sienge_id: siengeId, mes, valor }, usuarioId) {
  await exigirContaInformada(empresaId, centroId, siengeId);
  if (valor === null || valor === 0) {
    await pool.query(
      'DELETE FROM dfc_orcamento_informado WHERE empresa_id = $1 AND centro_id = $2 AND sienge_id = $3 AND mes = $4',
      [empresaId, centroId, siengeId, `${mes}-01`]
    );
    return { centro_id: centroId, sienge_id: siengeId, mes, valor: null };
  }
  await pool.query(
    `INSERT INTO dfc_orcamento_informado (empresa_id, centro_id, sienge_id, mes, valor, usuario_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (empresa_id, centro_id, sienge_id, mes)
     DO UPDATE SET valor = EXCLUDED.valor, usuario_id = EXCLUDED.usuario_id, atualizado_em = NOW()`,
    [empresaId, centroId, siengeId, `${mes}-01`, valor, usuarioId]
  );
  return { centro_id: centroId, sienge_id: siengeId, mes, valor };
}

// "Replicar valor até": grava `valor` em cada mês de `de` até `ate` (inclusive), por cima do que
// houver. Devolve os meses gravados.
async function replicar(empresaId, { centro_id: centroId, sienge_id: siengeId, de, ate, valor }, usuarioId) {
  if (ate < de) throw erro(400, 'A data final precisa ser igual ou depois do mês de origem.');
  const meses = mesesEntre(de, ate);
  if (meses.length > MAX_MESES) throw erro(400, `Replique no máximo ${MAX_MESES} meses de uma vez.`);
  await exigirContaInformada(empresaId, centroId, siengeId);
  await pool.query(
    `INSERT INTO dfc_orcamento_informado (empresa_id, centro_id, sienge_id, mes, valor, usuario_id)
     SELECT $1, $2, $3, (m || '-01')::date, $5, $6 FROM unnest($4::text[]) AS m
     ON CONFLICT (empresa_id, centro_id, sienge_id, mes)
     DO UPDATE SET valor = EXCLUDED.valor, usuario_id = EXCLUDED.usuario_id, atualizado_em = NOW()`,
    [empresaId, centroId, siengeId, meses, valor, usuarioId]
  );
  return { centro_id: centroId, sienge_id: siengeId, meses, valor };
}

module.exports = { list, salvar, replicar };
