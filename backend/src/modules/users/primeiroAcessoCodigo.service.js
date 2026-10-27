const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../../config/db');
const zapiService = require('../integracoes-zapi/zapi.service');

// Verificação do celular no primeiro acesso: o usuário informa o celular,
// pede o código e recebe por WhatsApp um código de 6 dígitos, que precisa
// informar pra concluir. O envio sai sempre da conexão Z-API "Comunicação
// Oficial" da HORIZON (a administradora master do sistema), não de uma
// conexão da empresa do usuário — ele ainda nem entrou no sistema.

const CNPJ_HORIZON = '62009822000190';
const NOME_CONEXAO = 'Comunicação Oficial';
const VALIDADE_MINUTOS = 10;
const INTERVALO_REENVIO_SEGUNDOS = 60;
const MAX_TENTATIVAS = 5;
const VALIDACAO_VALE_MINUTOS = 30;

function erro(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

// DDI 55 + DDD + número, só dígitos (formato da Z-API). Monta o DDI aqui em
// vez de usar a normalização do zapi.service ("completa o 55 se faltar"),
// que confundiria um DDD 55 com o DDI.
function telefoneZapi(ddd, numero) {
  return `55${String(ddd).replace(/\D/g, '')}${String(numero).replace(/\D/g, '')}`;
}

async function conexaoOficialId() {
  const { rows } = await pool.query(
    `SELECT z.id
     FROM integracoes_zapi z
     JOIN empresas e ON e.id = z.empresa_id
     WHERE e.cnpj = $1 AND z.nome_conexao = $2 AND z.ativo
     ORDER BY z.id
     LIMIT 1`,
    [CNPJ_HORIZON, NOME_CONEXAO]
  );
  return rows[0]?.id || null;
}

async function enviarCodigo(usuarioId, { telefone_ddd, telefone_numero }) {
  const telefone = telefoneZapi(telefone_ddd, telefone_numero);

  // Um pedido por minuto — evita disparar vários WhatsApps com cliques
  // repetidos (e mandar código pra números aleatórios em sequência).
  const { rows: pendente } = await pool.query(
    `SELECT CEIL(EXTRACT(EPOCH FROM (enviado_em + make_interval(secs => $2) - NOW())))::int AS aguardar
     FROM usuarios_codigos_verificacao
     WHERE usuario_id = $1`,
    [usuarioId, INTERVALO_REENVIO_SEGUNDOS]
  );
  const aguardar = pendente[0]?.aguardar || 0;
  if (aguardar > 0) throw erro(429, `Aguarde ${aguardar}s para pedir um novo código.`);

  const integracaoId = await conexaoOficialId();
  if (!integracaoId) {
    throw erro(
      503,
      'O envio do código por WhatsApp não está disponível no momento. Fale com o administrador do sistema.'
    );
  }

  const { rows: usuarios } = await pool.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]);
  const primeiroNome = String(usuarios[0]?.nome || '').trim().split(/\s+/)[0];
  const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const mensagem = [
    `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! Seu código de verificação do Horizon Fin é *${codigo}*.`,
    '',
    `Informe-o na tela de primeiro acesso para concluir seu cadastro. Ele vale por ${VALIDADE_MINUTOS} minutos.`,
    '',
    'Se não foi você que pediu, ignore esta mensagem.',
  ].join('\n');

  // Envia antes de gravar: se a Z-API recusar, não fica um código pendente
  // que o usuário nunca recebeu (nem conta o intervalo de reenvio).
  try {
    await zapiService.enviarMensagemTexto(integracaoId, { telefone, mensagem });
  } catch (err) {
    if (err.code === 'SEM_WHATSAPP') {
      throw erro(400, 'Este celular não tem WhatsApp (ou está incorreto). Confira o DDD e o número.');
    }
    throw err;
  }

  const codigoHash = await bcrypt.hash(codigo, 10);
  await pool.query(
    `INSERT INTO usuarios_codigos_verificacao (usuario_id, telefone, codigo_hash, tentativas, enviado_em, expira_em)
     VALUES ($1, $2, $3, 0, NOW(), NOW() + make_interval(mins => $4))
     ON CONFLICT (usuario_id) DO UPDATE
     SET telefone = EXCLUDED.telefone, codigo_hash = EXCLUDED.codigo_hash, tentativas = 0,
         enviado_em = EXCLUDED.enviado_em, expira_em = EXCLUDED.expira_em, validado_em = NULL`,
    [usuarioId, telefone, codigoHash, VALIDADE_MINUTOS]
  );

  return { validade_minutos: VALIDADE_MINUTOS, reenviar_em_segundos: INTERVALO_REENVIO_SEGUNDOS };
}

// Passo "Validar" da tela: confere o código e marca o celular como
// confirmado (`validado_em`) — só depois disso a tela libera a nova senha.
// Tem que ser o código do mesmo celular informado — trocar o número depois
// de pedir o código exige pedir outro. A tentativa é contada antes de
// comparar (num UPDATE só), pra requisições em paralelo não passarem do
// limite.
async function validarCodigo(usuarioId, { telefone_ddd, telefone_numero, codigo }) {
  const telefone = telefoneZapi(telefone_ddd, telefone_numero);
  const { rows } = await pool.query(
    `UPDATE usuarios_codigos_verificacao
     SET tentativas = tentativas + 1
     WHERE usuario_id = $1 AND telefone = $2 AND tentativas < $3
     RETURNING codigo_hash, tentativas, expira_em < NOW() AS expirado`,
    [usuarioId, telefone, MAX_TENTATIVAS]
  );
  const registro = rows[0];

  if (!registro) {
    const { rows: pendente } = await pool.query(
      'SELECT telefone FROM usuarios_codigos_verificacao WHERE usuario_id = $1',
      [usuarioId]
    );
    if (!pendente[0]) throw erro(400, 'Peça o código de verificação no seu celular antes de validar.');
    if (pendente[0].telefone !== telefone) {
      throw erro(400, 'O celular foi alterado depois do envio do código. Peça um novo código para o número informado.');
    }
    throw erro(400, 'Você errou o código muitas vezes. Peça um novo código.');
  }
  if (registro.expirado) throw erro(400, 'O código de verificação expirou. Peça um novo código.');

  if (!(await bcrypt.compare(codigo, registro.codigo_hash))) {
    const restantes = MAX_TENTATIVAS - registro.tentativas;
    throw erro(
      400,
      restantes > 0
        ? `Código de verificação incorreto. ${restantes === 1 ? 'Resta 1 tentativa' : `Restam ${restantes} tentativas`}.`
        : 'Código de verificação incorreto. Peça um novo código.'
    );
  }

  await pool.query('UPDATE usuarios_codigos_verificacao SET validado_em = NOW() WHERE usuario_id = $1', [usuarioId]);
  return { validado: true };
}

// Conferido no "Concluir": o celular gravado tem que ser o mesmo que foi
// validado, e há pouco tempo (a tela fica aberta, mas não indefinidamente).
async function exigirCelularValidado(usuarioId, { telefone_ddd, telefone_numero }) {
  const { rows } = await pool.query(
    `SELECT telefone, validado_em < NOW() - make_interval(mins => $2) AS vencido
     FROM usuarios_codigos_verificacao
     WHERE usuario_id = $1 AND validado_em IS NOT NULL`,
    [usuarioId, VALIDACAO_VALE_MINUTOS]
  );
  const registro = rows[0];
  if (!registro) throw erro(400, 'Valide seu celular com o código enviado por WhatsApp antes de concluir.');
  if (registro.telefone !== telefoneZapi(telefone_ddd, telefone_numero)) {
    throw erro(400, 'O celular foi alterado depois da validação. Valide o novo número.');
  }
  if (registro.vencido) throw erro(400, 'A validação do celular expirou. Peça um novo código.');
}

async function descartarCodigo(usuarioId) {
  await pool.query('DELETE FROM usuarios_codigos_verificacao WHERE usuario_id = $1', [usuarioId]);
}

module.exports = { enviarCodigo, validarCodigo, exigirCelularValidado, descartarCodigo };
