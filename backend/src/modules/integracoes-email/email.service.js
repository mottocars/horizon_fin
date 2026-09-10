const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const pool = require('../../config/db');
const { encrypt, decrypt } = require('../../utils/crypto');

// Log em arquivo (não só console) pra sobreviver ao terminal fechar — um
// "mandei mas não chegou" só dá pra investigar de verdade com a resposta
// real do servidor SMTP (accepted/rejected/response/messageId) na hora do
// envio, e isso se perde no scroll do terminal se não for persistido.
const LOG_PATH = path.join(__dirname, '../../../logs/email-envios.log');
function logEnvio(dados) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${JSON.stringify(dados)}\n`);
  } catch {
    // Log é só um extra de diagnóstico — falha ao gravar não pode derrubar o envio.
  }
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;
  const conditions = ['(e.razao_social ILIKE $1 OR m.nome_conexao ILIKE $1 OR m.email ILIKE $1 OR m.host ILIKE $1)'];
  const params = [searchTerm];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`m.ativo = $${params.length}`);
  }

  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`m.empresa_id = ANY($${params.length}::int[])`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT m.id, m.nome_conexao, m.driver, m.host, m.porta, m.encriptacao, m.email, m.ativo, m.criado_em, m.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_email m
     JOIN empresas e ON e.id = m.empresa_id
     ${whereClause}
     ORDER BY m.criado_em DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM integracoes_email m
     JOIN empresas e ON e.id = m.empresa_id
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
    `SELECT m.id, m.nome_conexao, m.driver, m.host, m.porta, m.encriptacao, m.email, m.ativo, m.criado_em, m.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social, e.cnpj AS empresa_cnpj
     FROM integracoes_email m
     JOIN empresas e ON e.id = m.empresa_id
     WHERE m.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function create({ empresa_id, nome_conexao, driver, host, porta, encriptacao, email, senha }) {
  const senhaEnc = encrypt(senha);
  const { rows } = await pool.query(
    `INSERT INTO integracoes_email (empresa_id, nome_conexao, driver, host, porta, encriptacao, email, senha_enc)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, empresa_id, nome_conexao, driver, host, porta, encriptacao, email, ativo, criado_em, atualizado_em`,
    [empresa_id, nome_conexao, driver, host, porta, encriptacao, email, senhaEnc]
  );
  return rows[0];
}

// `senha` só entra no UPDATE quando informada de novo — mesmo espírito de
// sienge.service.js::update com `password` (editar sem preencher de novo
// mantém a senha já salva).
async function update(id, { empresa_id, nome_conexao, driver, host, porta, encriptacao, email, senha }) {
  const campos = [
    'empresa_id = $1',
    'nome_conexao = $2',
    'driver = $3',
    'host = $4',
    'porta = $5',
    'encriptacao = $6',
    'email = $7',
  ];
  const params = [empresa_id, nome_conexao, driver, host, porta, encriptacao, email];

  if (senha) {
    params.push(encrypt(senha));
    campos.push(`senha_enc = $${params.length}`);
  }

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE integracoes_email SET ${campos.join(', ')} WHERE id = $${params.length}
     RETURNING id, empresa_id, nome_conexao, driver, host, porta, encriptacao, email, ativo, criado_em, atualizado_em`,
    params
  );
  return rows[0] || null;
}

async function setAtivo(id, ativo) {
  const { rows } = await pool.query(
    `UPDATE integracoes_email SET ativo = $1 WHERE id = $2
     RETURNING id, empresa_id, nome_conexao, driver, host, porta, encriptacao, email, ativo, criado_em, atualizado_em`,
    [ativo, id]
  );
  return rows[0] || null;
}

// Só pra uso interno do envio de verdade — nunca exposto pela API pro
// frontend (que só vê os campos de listagem/edição via getById, sem a
// senha). Mesmo padrão de zapi.service.js::getCredenciais.
async function getCredenciais(id) {
  const { rows } = await pool.query(
    'SELECT host, porta, encriptacao, email, senha_enc, ativo FROM integracoes_email WHERE id = $1',
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    host: row.host,
    porta: row.porta,
    encriptacao: row.encriptacao,
    email: row.email,
    senha: decrypt(row.senha_enc),
    ativo: row.ativo,
  };
}

// `secure`/`requireTLS` do nodemailer não mapeiam 1:1 com "tls/ssl/none" do
// formulário — `ssl` é TLS implícito desde a conexão (porta 465, de
// praxe); `tls` é STARTTLS (conexão em texto puro que vira TLS depois do
// handshake, porta 587, de praxe) — `requireTLS: true` faz falhar em vez
// de silenciosamente continuar sem criptografia se o servidor não suportar
// STARTTLS. `none` não força nada (raro, só existe pra servidor interno
// sem criptografia nenhuma).
function opcoesEncriptacao(encriptacao) {
  if (encriptacao === 'ssl') return { secure: true };
  if (encriptacao === 'tls') return { secure: false, requireTLS: true };
  return { secure: false };
}

function criarTransportador(credenciais) {
  return nodemailer.createTransport({
    host: credenciais.host,
    port: credenciais.porta,
    ...opcoesEncriptacao(credenciais.encriptacao),
    auth: { user: credenciais.email, pass: credenciais.senha },
  });
}

// Envio de verdade de 1 e-mail — chamada pelo registro manual de e-mail na
// Rotina do dia (ver historicoCliente.service.js::registrarObservacao,
// mesmo espírito de zapi.service.js::enviarMensagemTexto/enviarDocumento).
// `anexoBase64`/`anexoNomeArquivo` são opcionais: o boleto, quando o
// template da etapa pede (`template_enviar_boleto`), vai por aqui.
async function enviarEmail(integracaoId, { destinatario, assunto, corpo, anexoBase64, anexoNomeArquivo }) {
  const credenciais = await getCredenciais(integracaoId);
  if (!credenciais) throw badRequest('Conexão de e-mail não encontrada.');
  if (!credenciais.ativo) throw badRequest('A conexão de e-mail configurada para este cluster está inativa.');

  const transportador = criarTransportador(credenciais);
  const mensagem = {
    from: credenciais.email,
    to: destinatario,
    subject: assunto,
    text: corpo,
  };
  if (anexoBase64) {
    mensagem.attachments = [
      { filename: anexoNomeArquivo || 'boleto.pdf', content: Buffer.from(anexoBase64, 'base64') },
    ];
  }

  let info;
  try {
    info = await transportador.sendMail(mensagem);
  } catch (err) {
    logEnvio({ destinatario, assunto, erro: err.message, code: err.code });
    throw badRequest(err.message || 'Não foi possível enviar o e-mail.');
  }

  // `sendMail` sem exceção só garante que o servidor de envio ACEITOU a
  // mensagem — não que ela chegou de verdade na caixa do destinatário
  // (isso é responsabilidade do servidor de e-mail dele, invisível daqui
  // pra frente). Ainda assim, vale registrar a resposta de verdade do
  // servidor SMTP — é o único jeito de investigar depois um "mandei mas não
  // chegou": se o próprio destinatário aparecer em `rejected`, o servidor
  // recusou na hora, e isso SIM é um erro de verdade (a mensagem nunca
  // saiu) — trata como falha, não sucesso.
  logEnvio({
    destinatario,
    assunto,
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
    envelope: info.envelope,
  });
  if (info.rejected && info.rejected.length > 0) {
    throw badRequest(`O servidor de e-mail recusou o destinatário: ${info.rejected.join(', ')}`);
  }

  return info;
}

// Traduz os códigos de erro mais comuns do nodemailer/SMTP pra uma
// mensagem que faz sentido pra quem está cadastrando a integração — sem
// isso, um erro de autenticação e um host errado voltavam com a mesma
// letra miúda de exceção de rede, difícil de agir em cima.
function traduzirErroSmtp(err) {
  if (err.code === 'EAUTH') return 'Usuário ou senha incorretos.';
  if (err.code === 'ENOTFOUND' || err.code === 'EDNS') return 'Host não encontrado — confira o endereço digitado.';
  if (err.code === 'ECONNECTION' || err.code === 'ESOCKET' || err.code === 'ECONNREFUSED') {
    return 'Não foi possível conectar ao servidor — confira o host e a porta.';
  }
  if (err.code === 'ETIMEDOUT') return 'A conexão expirou (timeout) — confira o host e a porta.';
  return err.message || 'Não foi possível conectar ao servidor de e-mail.';
}

// Testa a conexão SMTP de verdade, sem enviar nenhum e-mail — `verify()`
// do nodemailer só abre a conexão + autentica e fecha. Pensada pra rodar
// ANTES de salvar (formulário de Integrações > E-mail, ver
// EmailForm.jsx), por isso recebe os campos crus em vez de um id — quando
// a senha vier em branco (editando sem trocar), busca a senha já salva
// pelo `id` informado, mesmo espírito de "editar sem repreencher mantém a
// senha atual" já usado no `update`.
async function testarConexao({ id, host, porta, encriptacao, email, senha }) {
  let senhaFinal = senha;
  if (!senhaFinal) {
    if (!id) throw badRequest('Informe a senha para testar a conexão.');
    const credenciaisAtuais = await getCredenciais(id);
    if (!credenciaisAtuais) throw badRequest('Conexão não encontrada.');
    senhaFinal = credenciaisAtuais.senha;
  }

  const transportador = criarTransportador({ host, porta, encriptacao, email, senha: senhaFinal });
  try {
    await transportador.verify();
  } catch (err) {
    throw badRequest(traduzirErroSmtp(err));
  }
  return { ok: true };
}

module.exports = { list, getById, create, update, setAtivo, enviarEmail, testarConexao };
