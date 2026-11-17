const pool = require('../../config/db');
const { verificarParceiro } = require('./verificacoes');
const {
  PREFIXO_SECRET_TEMPORARIO,
  SECRET_TEMPORARIO_DIAS,
  gerarClientId,
  gerarSegredo,
  hashSegredo,
  primeiroNome,
  telefoneFormatado,
  enviarWhatsapp,
  registrarEvento,
  mensagemCredenciais,
} = require('./comum');
const { urlConectar } = require('./oidc');

// Cadastros › Parceiros (aprovar, recusar, suspender, reativar, novo client_secret temporário,
// verificações automáticas) e a Loja de aplicativos do topo (parceiros aprovados).
// O pedido em si chega pelo formulário público — ver parceiros.publico.js.

function erro(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

const semWhatsappOficial = () => erro(503, 'A conexão de WhatsApp "Comunicação Oficial" não está ativa.');

const COLUNAS = `
  p.id, p.status, p.responsavel_nome, p.responsavel_email, p.responsavel_telefone, p.telefone_confirmado_em,
  p.app_nome, p.app_descricao, p.logo_largura, p.logo_altura, p.logo_tamanho, p.url_abertura, p.url_callback,
  p.verificacoes, p.verificado_em, p.client_id,
  p.secret_temporario_gerado_em, p.secret_temporario_expira_em, p.secret_temporario_usado_em,
  p.secret_oficial_gerado_em, p.motivo, p.criado_em, p.atualizado_em`;

function formatar(p) {
  return {
    ...p,
    telefone_formatado: telefoneFormatado(p.responsavel_telefone),
    secret_temporario_vencido: Boolean(p.secret_temporario_expira_em && new Date(p.secret_temporario_expira_em) <= new Date()),
  };
}

async function listar({ status } = {}) {
  const params = [];
  let filtro = '';
  if (status) {
    params.push(status);
    filtro = 'WHERE p.status = $1';
  }
  const { rows } = await pool.query(`SELECT ${COLUNAS} FROM parceiros p ${filtro} ORDER BY p.criado_em DESC`, params);
  return rows.map(formatar);
}

async function carregar(id) {
  const { rows } = await pool.query(`SELECT ${COLUNAS} FROM parceiros p WHERE p.id = $1`, [id]);
  if (!rows[0]) throw erro(404, 'Parceiro não encontrado.');
  return rows[0];
}

async function obter(id) {
  const p = await carregar(id);
  const { rows: eventos } = await pool.query(
    `SELECT e.id, e.tipo, e.detalhe, e.criado_em, u.nome AS usuario_nome
     FROM parceiros_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
     WHERE e.parceiro_id = $1 ORDER BY e.criado_em DESC, e.id DESC`,
    [id]
  );
  return { ...formatar(p), eventos };
}

async function logo(id, { soAprovado = false } = {}) {
  const { rows } = await pool.query(
    `SELECT logo FROM parceiros WHERE id = $1 ${soAprovado ? "AND status = 'APROVADO'" : ''}`,
    [id]
  );
  return rows[0]?.logo || null;
}

async function verificarESalvar(id) {
  const { rows } = await pool.query('SELECT * FROM parceiros WHERE id = $1', [id]);
  if (!rows[0]) throw erro(404, 'Parceiro não encontrado.');
  const itens = await verificarParceiro(rows[0]);
  await pool.query('UPDATE parceiros SET verificacoes = $2, verificado_em = NOW() WHERE id = $1', [id, JSON.stringify(itens)]);
  return { verificacoes: itens };
}

// Gera o client_secret temporário (e o client_id, se ainda não houver), grava e manda por
// WhatsApp. Se o WhatsApp falhar, a operação continua valendo e as credenciais voltam para quem
// clicou repassar por outro meio (só nesse caso aparecem na tela).
async function emitirCredenciais(cliente, p, usuarioId, { novo, revogarOficial = false }) {
  const clientId = p.client_id || gerarClientId();
  const secretTemporario = gerarSegredo(PREFIXO_SECRET_TEMPORARIO);
  const { rows } = await cliente.query(
    `UPDATE parceiros
     SET client_id = $2, secret_temporario_hash = $3, secret_temporario_gerado_em = NOW(),
         secret_temporario_expira_em = NOW() + make_interval(days => $4), secret_temporario_usado_em = NULL,
         ${revogarOficial ? 'secret_oficial_hash = NULL, secret_oficial_gerado_em = NULL,' : ''}
         atualizado_em = NOW()
     WHERE id = $1
     RETURNING secret_temporario_expira_em`,
    [p.id, clientId, hashSegredo(secretTemporario), SECRET_TEMPORARIO_DIAS]
  );
  const expiraEm = rows[0].secret_temporario_expira_em;
  await registrarEvento(
    cliente,
    p.id,
    'SECRET_TEMPORARIO',
    `client_secret temporário gerado (vale ${SECRET_TEMPORARIO_DIAS} dias)${revogarOficial ? '; o client_secret oficial anterior foi revogado' : ''}.`,
    usuarioId
  );
  return { clientId, secretTemporario, expiraEm, novo };
}

async function enviarCredenciais(p, cred, usuarioId) {
  try {
    await enviarWhatsapp(p.responsavel_telefone, mensagemCredenciais(p, cred), { aoFaltar: semWhatsappOficial });
    return { whatsapp: { enviado: true, telefone: telefoneFormatado(p.responsavel_telefone) } };
  } catch (err) {
    await registrarEvento(null, p.id, 'WHATSAPP_FALHOU', `As credenciais não foram enviadas por WhatsApp: ${err.message}`, usuarioId);
    return {
      whatsapp: { enviado: false, telefone: telefoneFormatado(p.responsavel_telefone), erro: err.message },
      credenciais: { client_id: cred.clientId, client_secret_temporario: cred.secretTemporario, expira_em: cred.expiraEm },
    };
  }
}

async function emTransacao(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

async function travar(cliente, id) {
  const { rows } = await cliente.query('SELECT * FROM parceiros WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw erro(404, 'Parceiro não encontrado.');
  return rows[0];
}

async function aprovar(id, usuarioId) {
  let p;
  const cred = await emTransacao(async (cliente) => {
    p = await travar(cliente, id);
    if (!['EM_ANALISE', 'RECUSADO'].includes(p.status)) throw erro(409, 'Só dá para aprovar uma solicitação em análise ou recusada.');
    await cliente.query("UPDATE parceiros SET status = 'APROVADO', motivo = NULL, atualizado_em = NOW() WHERE id = $1", [id]);
    await registrarEvento(cliente, id, 'APROVADO', 'Parceiro aprovado.', usuarioId);
    return emitirCredenciais(cliente, p, usuarioId, { novo: false });
  });
  return enviarCredenciais(p, cred, usuarioId);
}

async function novoSecretTemporario(id, usuarioId, { revogarOficial = false } = {}) {
  let p;
  const cred = await emTransacao(async (cliente) => {
    p = await travar(cliente, id);
    if (p.status !== 'APROVADO') throw erro(409, 'Só dá para gerar credenciais de um parceiro aprovado (reative antes, se estiver suspenso).');
    return emitirCredenciais(cliente, p, usuarioId, { novo: true, revogarOficial });
  });
  return enviarCredenciais(p, cred, usuarioId);
}

async function recusar(id, usuarioId, motivo) {
  const p = await emTransacao(async (cliente) => {
    const atual = await travar(cliente, id);
    if (atual.status !== 'EM_ANALISE') throw erro(409, 'Só dá para recusar uma solicitação em análise.');
    await cliente.query("UPDATE parceiros SET status = 'RECUSADO', motivo = $2, atualizado_em = NOW() WHERE id = $1", [id, motivo || null]);
    await registrarEvento(cliente, id, 'RECUSADO', motivo ? `Motivo: ${motivo}` : null, usuarioId);
    return atual;
  });
  // Avisa o responsável (falha no WhatsApp não desfaz a recusa).
  const pn = primeiroNome(p.responsavel_nome);
  const mensagem = [
    `Olá${pn ? `, ${pn}` : ''}!`,
    `A solicitação de parceria do aplicativo *${p.app_nome}* no Horizon não foi aprovada.`,
    ...(motivo ? ['', `Motivo: ${motivo}`] : []),
    '',
    'Se quiser, ajuste o que for preciso e envie uma nova solicitação.',
  ].join('\n');
  try {
    await enviarWhatsapp(p.responsavel_telefone, mensagem, { aoFaltar: semWhatsappOficial });
    return { whatsapp: { enviado: true, telefone: telefoneFormatado(p.responsavel_telefone) } };
  } catch (err) {
    await registrarEvento(null, id, 'WHATSAPP_FALHOU', `O aviso da recusa não foi enviado por WhatsApp: ${err.message}`, usuarioId);
    return { whatsapp: { enviado: false, telefone: telefoneFormatado(p.responsavel_telefone), erro: err.message } };
  }
}

async function suspender(id, usuarioId, motivo) {
  await emTransacao(async (cliente) => {
    const p = await travar(cliente, id);
    if (p.status !== 'APROVADO') throw erro(409, 'Só dá para suspender um parceiro aprovado.');
    await cliente.query("UPDATE parceiros SET status = 'SUSPENSO', motivo = $2, atualizado_em = NOW() WHERE id = $1", [id, motivo || null]);
    await registrarEvento(cliente, id, 'SUSPENSO', motivo ? `Motivo: ${motivo}` : null, usuarioId);
  });
  return {};
}

async function reativar(id, usuarioId) {
  await emTransacao(async (cliente) => {
    const p = await travar(cliente, id);
    if (p.status !== 'SUSPENSO') throw erro(409, 'Só dá para reativar um parceiro suspenso.');
    await cliente.query("UPDATE parceiros SET status = 'APROVADO', motivo = NULL, atualizado_em = NOW() WHERE id = $1", [id]);
    await registrarEvento(cliente, id, 'REATIVADO', null, usuarioId);
  });
  return {};
}

// ─── Loja de aplicativos (topo) e aplicativos instalados (menu lateral) ─────
// Por usuário: instalado (ícone no menu lateral) e conectado (o parceiro já recebeu a identidade dele
// pelo Login com Horizon — ver oidc.js; até lá o aplicativo abre na página com o botão Conectar).
// url_conectar = URL de abertura + iss (início do Login com Horizon).
async function loja(usuarioId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.app_nome AS nome, p.app_descricao AS descricao,
            p.responsavel_nome, p.responsavel_email, p.responsavel_telefone,
            (i.usuario_id IS NOT NULL) AS instalado
     FROM parceiros p
     LEFT JOIN parceiros_instalacoes i ON i.parceiro_id = p.id AND i.usuario_id = $1
     WHERE p.status = 'APROVADO' ORDER BY p.app_nome`,
    [usuarioId]
  );
  return rows.map(({ responsavel_telefone: tel, ...r }) => ({ ...r, responsavel_telefone: telefoneFormatado(tel) }));
}

// Menu lateral: na ordem de instalação (o último instalado fica embaixo).
async function instalados(usuarioId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.app_nome AS nome
     FROM parceiros_instalacoes i JOIN parceiros p ON p.id = i.parceiro_id AND p.status = 'APROVADO'
     WHERE i.usuario_id = $1 ORDER BY i.instalado_em, p.id`,
    [usuarioId]
  );
  return rows;
}

async function instalar(usuarioId, id) {
  const { rowCount } = await pool.query(
    `INSERT INTO parceiros_instalacoes (usuario_id, parceiro_id)
     SELECT $1, id FROM parceiros WHERE id = $2 AND status = 'APROVADO'
     ON CONFLICT (usuario_id, parceiro_id) DO NOTHING`,
    [usuarioId, id]
  );
  if (!rowCount) {
    const { rows } = await pool.query(`SELECT 1 FROM parceiros WHERE id = $1 AND status = 'APROVADO'`, [id]);
    if (!rows.length) throw naoEncontrado('Aplicativo não disponível na loja.');
  }
  return instalados(usuarioId);
}

async function desinstalar(usuarioId, id) {
  await pool.query('DELETE FROM parceiros_instalacoes WHERE usuario_id = $1 AND parceiro_id = $2', [usuarioId, id]);
  return instalados(usuarioId);
}

// Página /aplicativos/:id (o aplicativo aberto dentro do Horizon).
async function aplicativo(usuarioId, id) {
  const { rows } = await pool.query(
    `SELECT p.id, p.app_nome AS nome, p.url_abertura, i.conectado_em
     FROM parceiros_instalacoes i JOIN parceiros p ON p.id = i.parceiro_id AND p.status = 'APROVADO'
     WHERE i.usuario_id = $1 AND i.parceiro_id = $2`,
    [usuarioId, id]
  );
  if (!rows.length) throw naoEncontrado('Aplicativo não instalado ou indisponível.');
  const { url_abertura: abertura, conectado_em: conectadoEm, ...r } = rows[0];
  return { ...r, conectado: Boolean(conectadoEm), url_conectar: urlConectar(abertura) };
}

function naoEncontrado(message) {
  const err = new Error(message);
  err.status = 404;
  err.expose = true;
  return err;
}

module.exports = {
  listar,
  obter,
  logo,
  verificarESalvar,
  aprovar,
  novoSecretTemporario,
  recusar,
  suspender,
  reativar,
  loja,
  instalados,
  instalar,
  desinstalar,
  aplicativo,
};
