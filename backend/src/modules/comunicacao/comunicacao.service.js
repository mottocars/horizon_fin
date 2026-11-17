const pool = require('../../config/db');

const SELECT_TEMPLATE = `
  SELECT id, empresa_id, nome, descricao, assunto, corpo, enviar_boleto, clusters, em_massa, criado_em, atualizado_em
  FROM comunicacao_templates
`;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// Template fixo de "Comunicação em massa" (pedido do usuário, 17/11): 1 por
// empresa, já montado, sempre o primeiro da lista, só editável (assunto e
// corpo) — não se cria outro nem se exclui. É o texto que sai quando vários
// títulos do MESMO cliente são cobrados juntos na Rotina (arrastar na coluna
// do canal, ver regua-cobranca-historico/cobrancaEmMassa.service.js). Sem
// boleto e sem clusters: nunca aparece pra ser escolhido numa etapa da Régua
// (ver reguaCobranca.service.js::garantirTemplateElegivel). Variáveis
// próprias: @lista_titulos, @quantidade_titulos e @valor_total, além de
// @nome_cliente e @centro_custo.
const TEMPLATE_EM_MASSA_PADRAO = {
  nome: 'Comunicação em massa',
  descricao: 'Usado quando vários títulos do mesmo cliente são cobrados juntos na Rotina. Sem boleto.',
  assunto: 'Parcelas em aberto — @centro_custo',
  corpo: [
    'Olá, @nome_cliente!',
    '',
    'Identificamos @quantidade_titulos parcelas em aberto referentes ao empreendimento @centro_custo e reunimos todas nesta única mensagem:',
    '',
    '@lista_titulos',
    '',
    'Total em aberto: @valor_total',
    '',
    'Por favor, entre em contato conosco para regularizar. Se o pagamento já foi feito, desconsidere esta mensagem.',
  ].join('\n'),
};

// Cria o template em massa da empresa se ainda não existir (o índice único
// parcial garante 1 só, mesmo com 2 chamadas ao mesmo tempo).
async function garantirTemplateEmMassa(empresaId) {
  await pool.query(
    `INSERT INTO comunicacao_templates (empresa_id, nome, descricao, assunto, corpo, enviar_boleto, clusters, em_massa)
     VALUES ($1, $2, $3, $4, $5, FALSE, '{}', TRUE)
     ON CONFLICT (empresa_id) WHERE em_massa DO NOTHING`,
    [empresaId, TEMPLATE_EM_MASSA_PADRAO.nome, TEMPLATE_EM_MASSA_PADRAO.descricao, TEMPLATE_EM_MASSA_PADRAO.assunto, TEMPLATE_EM_MASSA_PADRAO.corpo]
  );
}

async function getTemplateEmMassa(empresaId) {
  await garantirTemplateEmMassa(empresaId);
  const { rows } = await pool.query(`${SELECT_TEMPLATE} WHERE empresa_id = $1 AND em_massa`, [empresaId]);
  return rows[0];
}

async function listTemplates(empresaId) {
  await garantirTemplateEmMassa(empresaId);
  const { rows } = await pool.query(`${SELECT_TEMPLATE} WHERE empresa_id = $1 ORDER BY em_massa DESC, nome ASC`, [empresaId]);
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

// No template em massa só assunto e corpo mudam — nome, descrição, boleto e
// clusters são fixos (ver TEMPLATE_EM_MASSA_PADRAO).
const CAMPOS_EDITAVEIS_EM_MASSA = new Set(['assunto', 'corpo']);

async function atualizarTemplate(id, dados = {}) {
  const { rows: atuais } = await pool.query('SELECT em_massa FROM comunicacao_templates WHERE id = $1', [id]);
  if (atuais.length === 0) return null;
  const emMassa = atuais[0].em_massa;

  const campos = [];
  const params = [];
  for (const [chave, coluna] of Object.entries(CAMPOS_ATUALIZAVEIS)) {
    if (dados[chave] === undefined) continue;
    if (emMassa && !CAMPOS_EDITAVEIS_EM_MASSA.has(chave)) continue;
    params.push(chave === 'nome' ? dados[chave] || 'Novo template' : dados[chave]);
    campos.push(`${coluna} = $${params.length}`);
  }
  if (emMassa && dados.corpo !== undefined && !String(dados.corpo).trim()) {
    throw badRequest('O corpo da mensagem em massa não pode ficar vazio.');
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
  const { rows } = await pool.query('SELECT em_massa FROM comunicacao_templates WHERE id = $1', [id]);
  if (rows[0]?.em_massa) {
    throw badRequest('O template de Comunicação em massa não pode ser excluído — só editado.');
  }
  const { rowCount } = await pool.query('DELETE FROM comunicacao_templates WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = {
  TEMPLATE_EM_MASSA_PADRAO,
  garantirTemplateEmMassa,
  getTemplateEmMassa,
  listTemplates,
  criarTemplate,
  atualizarTemplate,
  removerTemplate,
};
