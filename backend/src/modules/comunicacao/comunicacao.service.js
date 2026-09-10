const pool = require('../../config/db');

const SELECT_TEMPLATE = `
  SELECT id, empresa_id, nome, descricao, assunto, corpo, enviar_boleto, clusters, criado_em, atualizado_em
  FROM comunicacao_templates
`;

async function listTemplates(empresaId) {
  const { rows } = await pool.query(`${SELECT_TEMPLATE} WHERE empresa_id = $1 ORDER BY nome ASC`, [empresaId]);
  return rows;
}

async function criarTemplate(empresaId, dados = {}) {
  const { rows } = await pool.query(
    `INSERT INTO comunicacao_templates (empresa_id, nome, descricao, assunto, corpo, enviar_boleto, clusters)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      empresaId,
      dados.nome || 'Novo template',
      dados.descricao || '',
      dados.assunto || '',
      dados.corpo || '',
      dados.enviar_boleto ?? false,
      dados.clusters || [],
    ]
  );
  const { rows: criado } = await pool.query(`${SELECT_TEMPLATE} WHERE id = $1`, [rows[0].id]);
  return criado[0];
}

const CAMPOS_ATUALIZAVEIS = {
  nome: 'nome',
  descricao: 'descricao',
  assunto: 'assunto',
  corpo: 'corpo',
  enviar_boleto: 'enviar_boleto',
  clusters: 'clusters',
};

async function atualizarTemplate(id, dados = {}) {
  const campos = [];
  const params = [];
  for (const [chave, coluna] of Object.entries(CAMPOS_ATUALIZAVEIS)) {
    if (dados[chave] === undefined) continue;
    params.push(chave === 'nome' ? dados[chave] || 'Novo template' : dados[chave]);
    campos.push(`${coluna} = $${params.length}`);
  }
  if (campos.length === 0) {
    const { rows } = await pool.query(`${SELECT_TEMPLATE} WHERE id = $1`, [id]);
    return rows[0] || null;
  }

  params.push(id);
  const { rowCount } = await pool.query(
    `UPDATE comunicacao_templates SET ${campos.join(', ')} WHERE id = $${params.length}`,
    params
  );
  if (rowCount === 0) return null;

  const { rows } = await pool.query(`${SELECT_TEMPLATE} WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function removerTemplate(id) {
  const { rowCount } = await pool.query('DELETE FROM comunicacao_templates WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { listTemplates, criarTemplate, atualizarTemplate, removerTemplate };
