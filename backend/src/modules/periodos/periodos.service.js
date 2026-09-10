const pool = require('../../config/db');

async function list(empresaId) {
  const params = [];
  let where = '';
  if (empresaId) {
    params.push(empresaId);
    where = 'WHERE p.empresa_id = $1';
  }

  const { rows } = await pool.query(
    `SELECT p.id, p.empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social,
            p.data_inicio, p.data_fim, u.nome AS criado_por_nome, p.criado_em,
            COALESCE(
              (SELECT array_agg(op.operacao ORDER BY op.operacao) FROM periodo_operacoes op WHERE op.periodo_id = p.id),
              ARRAY[]::varchar[]
            ) AS operacoes
     FROM periodos p
     JOIN empresas e ON e.id = p.empresa_id
     LEFT JOIN usuarios u ON u.id = p.criado_por_usuario_id
     ${where}
     ORDER BY p.criado_em DESC`,
    params
  );
  return rows;
}

async function create({ empresa_id, data_inicio, data_fim, operacoes }, usuarioId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO periodos (empresa_id, data_inicio, data_fim, criado_por_usuario_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, empresa_id, data_inicio, data_fim, criado_em`,
      [empresa_id, data_inicio, data_fim, usuarioId]
    );
    const periodo = rows[0];

    for (const operacao of operacoes) {
      await client.query(
        `INSERT INTO periodo_operacoes (periodo_id, operacao) VALUES ($1, $2)`,
        [periodo.id, operacao]
      );
    }

    await client.query('COMMIT');
    return { ...periodo, operacoes };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getById(id) {
  const { rows } = await pool.query(
    `SELECT p.id, p.empresa_id, p.data_inicio, p.data_fim,
            COALESCE(
              (SELECT array_agg(op.operacao ORDER BY op.operacao) FROM periodo_operacoes op WHERE op.periodo_id = p.id),
              ARRAY[]::varchar[]
            ) AS operacoes
     FROM periodos p
     WHERE p.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function isUltimoDaEmpresa(id, empresaId) {
  const { rows } = await pool.query(
    `SELECT id FROM periodos WHERE empresa_id = $1 ORDER BY id DESC LIMIT 1`,
    [empresaId]
  );
  return rows[0]?.id === Number(id);
}

async function getUltimoPeriodo(empresaId) {
  const { rows } = await pool.query(
    `SELECT data_inicio, data_fim FROM periodos WHERE empresa_id = $1 ORDER BY id DESC LIMIT 1`,
    [empresaId]
  );
  return rows[0] || null;
}

function normalizarData(data) {
  const d = new Date(data);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// O range do período (data_inicio a data_fim) não delimita QUAIS meses podem
// ser editados — delimita QUANDO (data de hoje) a edição manual é permitida.
// Fora do range de um período existente, nada pode ser editado. Sem nenhum
// período cadastrado para a empresa, não há restrição vinda daqui.
async function estaDentroDoPeriodoAberto(empresaId) {
  const periodo = await getUltimoPeriodo(empresaId);
  if (!periodo) return true;

  const hoje = normalizarData(new Date());
  const inicio = normalizarData(periodo.data_inicio);
  const fim = normalizarData(periodo.data_fim);
  return hoje >= inicio && hoje <= fim;
}

function permissaoNegada() {
  const err = new Error('Só é possível editar ou excluir o último período aberto de cada empresa.');
  err.status = 400;
  err.expose = true;
  return err;
}

async function update(id, { data_inicio, data_fim, operacoes }) {
  const periodo = await getById(id);
  if (!periodo) return null;

  const ehUltimo = await isUltimoDaEmpresa(id, periodo.empresa_id);
  if (!ehUltimo) throw permissaoNegada();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE periodos SET data_inicio = $1, data_fim = $2 WHERE id = $3
       RETURNING id, empresa_id, data_inicio, data_fim, criado_em`,
      [data_inicio, data_fim, id]
    );

    await client.query('DELETE FROM periodo_operacoes WHERE periodo_id = $1', [id]);
    for (const operacao of operacoes) {
      await client.query(
        `INSERT INTO periodo_operacoes (periodo_id, operacao) VALUES ($1, $2)`,
        [id, operacao]
      );
    }

    await client.query('COMMIT');
    return { ...rows[0], operacoes };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function remove(id) {
  const periodo = await getById(id);
  if (!periodo) return false;

  const ehUltimo = await isUltimoDaEmpresa(id, periodo.empresa_id);
  if (!ehUltimo) throw permissaoNegada();

  const { rowCount } = await pool.query('DELETE FROM periodos WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { list, create, getById, update, remove, estaDentroDoPeriodoAberto };
