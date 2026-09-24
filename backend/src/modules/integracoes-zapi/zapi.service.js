const pool = require('../../config/db');
const { encrypt, decrypt } = require('../../utils/crypto');

const ZAPI_BASE_URL = 'https://api.z-api.io';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;
  const conditions = ['(e.razao_social ILIKE $1 OR z.nome_conexao ILIKE $1 OR z.instance_id ILIKE $1)'];
  const params = [searchTerm];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`z.ativo = $${params.length}`);
  }

  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`z.empresa_id = ANY($${params.length}::int[])`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT z.id, z.nome_conexao, z.instance_id, z.ativo, z.criado_em, z.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_zapi z
     JOIN empresas e ON e.id = z.empresa_id
     ${whereClause}
     ORDER BY z.criado_em DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM integracoes_zapi z
     JOIN empresas e ON e.id = z.empresa_id
     ${whereClause}`,
    params
  );

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: countRows[0].total,
      totalPages: Math.max(1, Math.ceil(countRows[0].total / limit)),
    },
  };
}

async function getById(id) {
  const { rows } = await pool.query(
    `SELECT z.id, z.nome_conexao, z.instance_id, z.ativo, z.criado_em, z.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_zapi z
     JOIN empresas e ON e.id = z.empresa_id
     WHERE z.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create({ empresa_id, nome_conexao, instance_id, instance_token, client_token }) {
  const instanceTokenEnc = encrypt(instance_token);
  const clientTokenEnc = encrypt(client_token);
  const { rows } = await pool.query(
    `INSERT INTO integracoes_zapi (empresa_id, nome_conexao, instance_id, instance_token_enc, client_token_enc)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, empresa_id, nome_conexao, instance_id, ativo, criado_em, atualizado_em`,
    [empresa_id, nome_conexao, instance_id, instanceTokenEnc, clientTokenEnc]
  );
  return rows[0];
}

// `instance_token`/`client_token` só entram no UPDATE quando informados de
// novo — mesmo espírito de sienge.service.js::update com `password` (editar
// sem preencher de novo mantém o token/senha já salvo).
async function update(id, { empresa_id, nome_conexao, instance_id, instance_token, client_token }) {
  const campos = ['empresa_id = $1', 'nome_conexao = $2', 'instance_id = $3'];
  const params = [empresa_id, nome_conexao, instance_id];

  if (instance_token) {
    params.push(encrypt(instance_token));
    campos.push(`instance_token_enc = $${params.length}`);
  }
  if (client_token) {
    params.push(encrypt(client_token));
    campos.push(`client_token_enc = $${params.length}`);
  }

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE integracoes_zapi SET ${campos.join(', ')} WHERE id = $${params.length}
     RETURNING id, empresa_id, nome_conexao, instance_id, ativo, criado_em, atualizado_em`,
    params
  );
  return rows[0] || null;
}

async function setAtivo(id, ativo) {
  const { rows } = await pool.query(
    `UPDATE integracoes_zapi SET ativo = $1 WHERE id = $2
     RETURNING id, empresa_id, nome_conexao, instance_id, ativo, criado_em, atualizado_em`,
    [ativo, id]
  );
  return rows[0] || null;
}

// Só pra uso interno do envio de verdade — nunca exposto pela API pro
// frontend (que só vê os campos de listagem/edição via getById, sem os
// tokens). Descriptografa na hora, não guarda em memória além do escopo
// desta chamada.
async function getCredenciais(id) {
  const { rows } = await pool.query(
    'SELECT instance_id, instance_token_enc, client_token_enc, ativo FROM integracoes_zapi WHERE id = $1',
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    instanceId: row.instance_id,
    instanceToken: decrypt(row.instance_token_enc),
    clientToken: decrypt(row.client_token_enc),
    ativo: row.ativo,
  };
}

// Só dígitos, com DDI 55 (Brasil) na frente quando faltar — os números
// chegam do Sienge formatados tipo "(31)998832751" (sem DDI), então
// completa antes de mandar pra Z-API (formato exigido: DDI+DDD+NÚMERO, só
// números — ver https://developer.z-api.io/message/send-text).
function normalizarTelefone(numero) {
  const digitos = String(numero || '').replace(/\D/g, '');
  if (!digitos) return null;
  return digitos.startsWith('55') ? digitos : `55${digitos}`;
}

// Confere se o telefone tem WhatsApp de verdade ANTES de tentar enviar —
// pega de propósito o motivo mais comum de "a mensagem não chegou":
// telefone errado ou sem WhatsApp. GET .../phone-exists/{phone} (sem
// corpo), resposta real testada: 200 sempre, {exists, phone, lid}, mesmo
// pra número que não existe (exists: false, phone/lid null) — não é um
// erro HTTP, é o campo `exists` que conta.
async function verificarNumeroExiste(credenciais, phone) {
  const url = `${ZAPI_BASE_URL}/instances/${credenciais.instanceId}/token/${credenciais.instanceToken}/phone-exists/${phone}`;
  let resposta;
  try {
    resposta = await fetch(url, { headers: { 'Client-Token': credenciais.clientToken } });
  } catch {
    // Se a própria checagem falhar (rede etc.), não é motivo pra travar o
    // envio por causa disso — segue e deixa o erro de verdade, se houver,
    // vir do send-text/send-document normalmente.
    return true;
  }
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok || !corpo) return true;
  return corpo.exists !== false;
}

// Resolve a conexão + valida + normaliza o telefone + confere se tem
// WhatsApp de verdade — mesma checagem pros 2 tipos de envio (texto e
// documento), então fica num lugar só.
async function prepararEnvio(integracaoId, telefone) {
  const credenciais = await getCredenciais(integracaoId);
  if (!credenciais) throw badRequest('Conexão Z-API não encontrada.');
  if (!credenciais.ativo) throw badRequest('A conexão Z-API configurada para este cluster está inativa.');

  const phone = normalizarTelefone(telefone);
  if (!phone) throw badRequest('O cliente não tem telefone cadastrado para receber o WhatsApp.');

  const existe = await verificarNumeroExiste(credenciais, phone);
  if (!existe) {
    throw badRequest(
      'Este número de telefone não tem WhatsApp (ou está incorreto) — confira o telefone cadastrado para o cliente antes de enviar.'
    );
  }

  return { credenciais, phone };
}

// POST genérico pra qualquer endpoint de envio da Z-API, com o
// Client-Token da conexão no header de segurança (obrigatório quando a
// conta Z-API tem o token de segurança ativado, e inofensivo quando não
// tem) — mesmo tratamento de erro pros 2 tipos de envio.
async function postZapi(credenciais, endpoint, payload, mensagemErroPadrao) {
  const url = `${ZAPI_BASE_URL}/instances/${credenciais.instanceId}/token/${credenciais.instanceToken}/${endpoint}`;
  let resposta;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Client-Token': credenciais.clientToken },
      body: JSON.stringify(payload),
    });
  } catch {
    throw badRequest('Não foi possível conectar à Z-API para enviar o WhatsApp.');
  }

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw badRequest(corpo?.error || corpo?.message || mensagemErroPadrao);
  }
  return corpo;
}

// Envio de verdade de 1 mensagem de texto — POST .../send-text.
// `integracaoId` é o `zapi_integracao_id` configurado pro cluster desta
// etapa em Configurações Globais (ver reguaCobranca.service.js — quem
// chama já resolveu qual conexão usar antes de chegar aqui).
async function enviarMensagemTexto(integracaoId, { telefone, mensagem }) {
  const { credenciais, phone } = await prepararEnvio(integracaoId, telefone);
  return postZapi(credenciais, 'send-text', { phone, message: mensagem }, 'A Z-API recusou o envio do WhatsApp.');
}

// Envio de 1 documento com a mensagem do template virando a legenda
// (`caption`) dele — POST .../send-document/{extensao} (a Z-API tem um endpoint por tipo de
// arquivo). O `document` vai em base64 direto no corpo (a Z-API aceita URL pública OU base64;
// usamos base64 porque nem todo arquivo de origem é público de verdade — ex.: o boleto do
// Sienge, ver boletoSienge.js, ou o relatório de saldos gerado na hora). Padrão = PDF (o caso de
// hoje, o boleto — ver regua-cobranca-historico/boletoSienge.js); outros chamadores informam
// `extensao`/`mimeType`/`nomeArquivo` pro tipo de arquivo deles (ex.: xlsx).
async function enviarDocumento(
  integracaoId,
  { telefone, documentoBase64, legenda, extensao = 'pdf', mimeType = 'application/pdf', nomeArquivo = 'boleto.pdf' }
) {
  const { credenciais, phone } = await prepararEnvio(integracaoId, telefone);
  return postZapi(
    credenciais,
    `send-document/${extensao}`,
    { phone, document: `data:${mimeType};base64,${documentoBase64}`, fileName: nomeArquivo, caption: legenda },
    'A Z-API recusou o envio do documento.'
  );
}

module.exports = { list, getById, create, update, setAtivo, enviarMensagemTexto, enviarDocumento };
