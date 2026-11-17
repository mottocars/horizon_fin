const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const pool = require('../../config/db');
const { ErroApi } = require('../api-horizon/v1/erros');
const { validarLogo } = require('./verificacoes');
const { verificarESalvar } = require('./parceiros.service');
const {
  PREFIXO_CLIENT_ID,
  PREFIXO_SECRET_TEMPORARIO,
  PREFIXO_SECRET_OFICIAL,
  gerarSegredo,
  hashSegredo,
  primeiroNome,
  telefoneMascarado,
  enviarWhatsapp,
  registrarEvento,
} = require('./comum');

// Rotas públicas dos Parceiros, na API Horizon (api.horizonhub.com.br/v1 — montadas em
// api-horizon/v1/v1.routes.js, com os limites por IP de lá):
//   POST /parceiros/solicitacoes                  → formulário "Quero ser um Parceiro": confere os
//                                                   dados e manda o código por WhatsApp;
//   POST /parceiros/solicitacoes/reenviar-codigo  → manda outro código (1 por minuto, até 5);
//   POST /parceiros/solicitacoes/confirmar        → código certo: a solicitação vai para aprovação
//                                                   (Cadastros › Parceiros);
//   POST /parceiros/client-secret                 → troca o client_secret temporário (6 dias,
//                                                   uso único) pelo oficial, mostrado uma vez só.
// O identificador da solicitação pendente vai no corpo (não na URL), para não ficar no registro
// de chamadas.

const CODIGO_VALIDADE_MIN = 10;
const INTERVALO_REENVIO_S = 60;
const MAX_TENTATIVAS = 5;
const MAX_ENVIOS = 5;
const MAX_SOLICITACOES_POR_TELEFONE_HORA = 3;

function invalido(mensagem, campo) {
  return new ErroApi(400, 'DADOS_INVALIDOS', mensagem, campo ? { campo } : undefined);
}

const semWhatsappOficial = () =>
  new ErroApi(503, 'WHATSAPP_INDISPONIVEL', 'O envio do código por WhatsApp não está disponível no momento. Tente de novo mais tarde.');
const semWhatsappNoNumero = () =>
  new ErroApi(400, 'TELEFONE_SEM_WHATSAPP', 'Este celular não tem WhatsApp (ou está incorreto). Confira o DDD e o número.', { campo: 'telefone' });

// https, domínio de verdade (não IP, não localhost), sem usuário/senha na URL.
function urlSegura(rotulo) {
  return z
    .string({ required_error: `Informe a ${rotulo}.` })
    .trim()
    .min(1, `Informe a ${rotulo}.`)
    .max(500, `A ${rotulo} pode ter no máximo 500 caracteres.`)
    .superRefine((valor, ctx) => {
      let u;
      try {
        u = new URL(valor);
      } catch {
        ctx.addIssue({ code: 'custom', message: `A ${rotulo} não é um endereço válido.` });
        return;
      }
      if (u.protocol !== 'https:') ctx.addIssue({ code: 'custom', message: `A ${rotulo} precisa começar com https://.` });
      else if (u.username || u.password) ctx.addIssue({ code: 'custom', message: `A ${rotulo} não pode ter usuário e senha.` });
      else if (!u.hostname.includes('.') || /^[\d.]+$/.test(u.hostname) || u.hostname.startsWith('[')) {
        ctx.addIssue({ code: 'custom', message: `A ${rotulo} precisa usar um domínio (não um IP).` });
      }
    });
}

const solicitacaoSchema = z.object({
  responsavel: z.object({
    nome: z.string({ required_error: 'Informe o nome do responsável técnico.' }).trim().min(3, 'Informe o nome do responsável técnico.').max(120, 'Nome com no máximo 120 caracteres.'),
    email: z.string({ required_error: 'Informe o e-mail.' }).trim().toLowerCase().email('E-mail inválido.').max(160, 'E-mail com no máximo 160 caracteres.'),
    telefone: z.string({ required_error: 'Informe o telefone com DDD.' }),
  }),
  aplicativo: z.object({
    nome: z.string({ required_error: 'Informe o nome do aplicativo.' }).trim().min(2, 'Informe o nome do aplicativo.').max(22, 'O nome do aplicativo pode ter no máximo 22 caracteres.'),
    descricao: z.string({ required_error: 'Informe a descrição.' }).trim().min(20, 'Descreva o aplicativo em pelo menos 20 caracteres.').max(140, 'A descrição pode ter no máximo 140 caracteres.'),
    urlAbertura: urlSegura('URL de abertura'),
    urlCallback: urlSegura('URL de retorno (callback)'),
    logo: z.string({ required_error: 'Envie a logomarca.' }).min(1, 'Envie a logomarca.'),
  }),
  website: z.string().optional(), // campo-isca: gente não preenche
});

// Celular com DDD → 55 + DDD + número (formato da Z-API).
function telefoneZapi(bruto) {
  const d = String(bruto || '').replace(/\D/g, '').replace(/^0+/, '');
  const semDdi = d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
  if (semDdi.length !== 10 && semDdi.length !== 11) return null;
  if (Number(semDdi.slice(0, 2)) < 11) return null;
  return `55${semDdi}`;
}

function lerLogo(dataUri) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUri);
  if (!m) throw invalido('A logomarca precisa ser um arquivo PNG.', 'logo');
  const buffer = Buffer.from(m[1], 'base64');
  const { erro, info } = validarLogo(buffer);
  if (erro) throw invalido(erro, 'logo');
  return { buffer, info };
}

function campoDoErro(issue) {
  const caminho = issue.path.join('.');
  return (
    {
      'responsavel.nome': 'nome',
      'responsavel.email': 'email',
      'responsavel.telefone': 'telefone',
      'aplicativo.nome': 'appNome',
      'aplicativo.descricao': 'descricao',
      'aplicativo.urlAbertura': 'urlAbertura',
      'aplicativo.urlCallback': 'urlCallback',
      'aplicativo.logo': 'logo',
    }[caminho] || caminho
  );
}

function rota(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err.issues) return next(invalido(err.issues[0].message, campoDoErro(err.issues[0])));
      next(err);
    }
  };
}

async function mandarCodigo({ telefone, nome, appNome }) {
  const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const pn = primeiroNome(nome);
  const mensagem = [
    `Olá${pn ? `, ${pn}` : ''}!`,
    `Seu código para confirmar a solicitação de parceria do aplicativo *${appNome}* no Horizon é:`,
    '',
    `${codigo}`,
    '',
    `Digite-o no formulário de parceria. Ele vale por ${CODIGO_VALIDADE_MIN} minutos.`,
    '',
    'Se não foi você que pediu, ignore esta mensagem.',
  ].join('\n');
  await enviarWhatsapp(telefone, mensagem, { aoFaltar: semWhatsappOficial, aoSemWhatsapp: semWhatsappNoNumero });
  return bcrypt.hash(codigo, 10);
}

// POST /parceiros/solicitacoes
const solicitar = rota(async (req, res) => {
  const corpo = solicitacaoSchema.parse(req.body || {});
  // Robô preencheu o campo escondido: responde como se tivesse dado certo e não manda nada.
  if (corpo.website) {
    return res.status(201).json({ solicitacao: crypto.randomBytes(24).toString('base64url'), telefone: '(••) •••••-••••', validadeMinutos: CODIGO_VALIDADE_MIN, reenviarEmSegundos: INTERVALO_REENVIO_S });
  }
  const telefone = telefoneZapi(corpo.responsavel.telefone);
  if (!telefone) throw invalido('Informe o celular com DDD, por exemplo (31) 99999-9999.', 'telefone');
  const { buffer: logo, info } = lerLogo(corpo.aplicativo.logo);

  await pool.query("DELETE FROM parceiros_verificacoes WHERE criado_em < NOW() - INTERVAL '1 day'");
  const { rows: recentes } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM parceiros_verificacoes WHERE telefone = $1 AND criado_em > NOW() - INTERVAL '1 hour'",
    [telefone]
  );
  if (recentes[0].n >= MAX_SOLICITACOES_POR_TELEFONE_HORA) {
    throw new ErroApi(429, 'LIMITE_EXCEDIDO', 'Muitas solicitações para este celular. Aguarde uma hora e tente de novo.');
  }

  const codigoHash = await mandarCodigo({ telefone, nome: corpo.responsavel.nome, appNome: corpo.aplicativo.nome });
  const token = crypto.randomBytes(24).toString('base64url');
  const dados = {
    responsavel: { nome: corpo.responsavel.nome, email: corpo.responsavel.email },
    aplicativo: {
      nome: corpo.aplicativo.nome,
      descricao: corpo.aplicativo.descricao,
      urlAbertura: corpo.aplicativo.urlAbertura,
      urlCallback: corpo.aplicativo.urlCallback,
      logoLargura: info.largura,
      logoAltura: info.altura,
    },
  };
  await pool.query(
    `INSERT INTO parceiros_verificacoes (token, dados, logo, telefone, codigo_hash, expira_em, ip)
     VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(mins => $6), $7)`,
    [token, dados, logo, telefone, codigoHash, CODIGO_VALIDADE_MIN, String(req.ip || '').slice(0, 64)]
  );
  res.status(201).json({
    solicitacao: token,
    telefone: telefoneMascarado(telefone),
    validadeMinutos: CODIGO_VALIDADE_MIN,
    reenviarEmSegundos: INTERVALO_REENVIO_S,
  });
});

const tokenSchema = z.object({ solicitacao: z.string({ required_error: 'Solicitação não informada.' }).min(10, 'Solicitação não informada.').max(64) });

function solicitacaoNaoEncontrada() {
  return new ErroApi(404, 'SOLICITACAO_NAO_ENCONTRADA', 'Solicitação não encontrada ou expirada. Preencha o formulário de novo.');
}

// POST /parceiros/solicitacoes/reenviar-codigo
const reenviarCodigo = rota(async (req, res) => {
  const { solicitacao } = tokenSchema.parse(req.body || {});
  const { rows } = await pool.query(
    `SELECT telefone, dados, envios,
            CEIL(EXTRACT(EPOCH FROM (enviado_em + make_interval(secs => $2) - NOW())))::int AS aguardar
     FROM parceiros_verificacoes WHERE token = $1 AND criado_em > NOW() - INTERVAL '1 day'`,
    [solicitacao, INTERVALO_REENVIO_S]
  );
  const v = rows[0];
  if (!v) throw solicitacaoNaoEncontrada();
  if (v.aguardar > 0) throw new ErroApi(429, 'AGUARDE', `Aguarde ${v.aguardar}s para pedir um novo código.`);
  if (v.envios >= MAX_ENVIOS) throw new ErroApi(429, 'LIMITE_EXCEDIDO', 'Você já pediu o código muitas vezes. Preencha o formulário de novo mais tarde.');
  const codigoHash = await mandarCodigo({ telefone: v.telefone, nome: v.dados.responsavel.nome, appNome: v.dados.aplicativo.nome });
  await pool.query(
    `UPDATE parceiros_verificacoes
     SET codigo_hash = $2, tentativas = 0, envios = envios + 1, enviado_em = NOW(), expira_em = NOW() + make_interval(mins => $3)
     WHERE token = $1`,
    [solicitacao, codigoHash, CODIGO_VALIDADE_MIN]
  );
  res.json({ telefone: telefoneMascarado(v.telefone), validadeMinutos: CODIGO_VALIDADE_MIN, reenviarEmSegundos: INTERVALO_REENVIO_S });
});

// POST /parceiros/solicitacoes/confirmar
const confirmar = rota(async (req, res) => {
  const { solicitacao } = tokenSchema.parse(req.body || {});
  const codigo = String(req.body?.codigo || '').replace(/\D/g, '');
  if (codigo.length !== 6) throw invalido('Digite o código de 6 números que chegou no WhatsApp.', 'codigo');

  // Conta a tentativa antes de comparar (num UPDATE só): chamadas em paralelo não passam do limite.
  const { rows } = await pool.query(
    `UPDATE parceiros_verificacoes SET tentativas = tentativas + 1
     WHERE token = $1 AND tentativas < $2 AND criado_em > NOW() - INTERVAL '1 day'
     RETURNING codigo_hash, tentativas, expira_em < NOW() AS expirado`,
    [solicitacao, MAX_TENTATIVAS]
  );
  const v = rows[0];
  if (!v) {
    const { rows: existe } = await pool.query('SELECT 1 FROM parceiros_verificacoes WHERE token = $1', [solicitacao]);
    if (!existe[0]) throw solicitacaoNaoEncontrada();
    throw invalido('Você errou o código muitas vezes. Peça um novo código.', 'codigo');
  }
  if (v.expirado) throw invalido('O código expirou. Peça um novo código.', 'codigo');
  if (!(await bcrypt.compare(codigo, v.codigo_hash))) {
    const restantes = MAX_TENTATIVAS - v.tentativas;
    throw invalido(
      restantes > 0 ? `Código incorreto. ${restantes === 1 ? 'Resta 1 tentativa' : `Restam ${restantes} tentativas`}.` : 'Código incorreto. Peça um novo código.',
      'codigo'
    );
  }

  const cliente = await pool.connect();
  let parceiroId;
  try {
    await cliente.query('BEGIN');
    // DELETE ... RETURNING: duas confirmações ao mesmo tempo não criam dois parceiros.
    const { rows: apagados } = await cliente.query('DELETE FROM parceiros_verificacoes WHERE token = $1 RETURNING dados, logo, telefone, ip', [solicitacao]);
    if (!apagados[0]) throw solicitacaoNaoEncontrada();
    const { dados, logo, telefone, ip } = apagados[0];
    const { rows: criados } = await cliente.query(
      `INSERT INTO parceiros (responsavel_nome, responsavel_email, responsavel_telefone, telefone_confirmado_em,
                              app_nome, app_descricao, logo, logo_largura, logo_altura, logo_tamanho,
                              url_abertura, url_callback, ip_solicitacao)
       VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        dados.responsavel.nome,
        dados.responsavel.email,
        telefone,
        dados.aplicativo.nome,
        dados.aplicativo.descricao,
        logo,
        dados.aplicativo.logoLargura,
        dados.aplicativo.logoAltura,
        logo.length,
        dados.aplicativo.urlAbertura,
        dados.aplicativo.urlCallback,
        ip,
      ]
    );
    parceiroId = criados[0].id;
    await registrarEvento(cliente, parceiroId, 'SOLICITADO', 'Solicitação enviada pelo formulário de parceria (celular confirmado pelo WhatsApp).');
    await cliente.query('COMMIT');
  } catch (err) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }

  // As verificações automáticas rodam em segundo plano (acessam as URLs do parceiro).
  setImmediate(() => verificarESalvar(parceiroId).catch((err) => console.error('[parceiros] verificação:', err.message)));
  res.status(201).json({ protocolo: parceiroId, status: 'em_analise' });
});

// POST /parceiros/client-secret
const trocaSchema = z.object({
  clientId: z.string({ required_error: 'Informe o clientId.' }).trim().min(1, 'Informe o clientId.').max(60),
  clientSecretTemporario: z.string({ required_error: 'Informe o clientSecretTemporario.' }).trim().min(1, 'Informe o clientSecretTemporario.').max(100),
});

function credenciaisInvalidas() {
  return new ErroApi(401, 'CREDENCIAIS_INVALIDAS', 'clientId ou clientSecretTemporario inválido.');
}

const trocarSecret = rota(async (req, res) => {
  const { clientId, clientSecretTemporario } = trocaSchema.parse(req.body || {});
  if (!clientId.startsWith(PREFIXO_CLIENT_ID) || !clientSecretTemporario.startsWith(PREFIXO_SECRET_TEMPORARIO)) throw credenciaisInvalidas();

  const { rows } = await pool.query(
    `SELECT id, status, secret_temporario_hash, secret_temporario_usado_em,
            secret_temporario_expira_em <= NOW() AS expirado
     FROM parceiros WHERE client_id = $1`,
    [clientId]
  );
  const p = rows[0];
  const hash = hashSegredo(clientSecretTemporario);
  const confere =
    p?.secret_temporario_hash && crypto.timingSafeEqual(Buffer.from(p.secret_temporario_hash, 'hex'), Buffer.from(hash, 'hex'));
  if (!confere) throw credenciaisInvalidas();
  if (p.status === 'SUSPENSO') throw new ErroApi(403, 'PARCEIRO_SUSPENSO', 'Este parceiro está suspenso. Fale com o Horizon.');
  if (p.status !== 'APROVADO') throw new ErroApi(403, 'PARCEIRO_NAO_APROVADO', 'Este parceiro não está aprovado.');
  if (p.secret_temporario_usado_em) {
    throw new ErroApi(401, 'SECRET_TEMPORARIO_USADO', 'Este client_secret temporário já foi usado. Peça ao Horizon um novo client_secret temporário.');
  }
  if (p.expirado) {
    throw new ErroApi(401, 'SECRET_TEMPORARIO_EXPIRADO', 'Este client_secret temporário expirou. Peça ao Horizon um novo client_secret temporário.');
  }

  const secretOficial = gerarSegredo(PREFIXO_SECRET_OFICIAL);
  // Uso único: só passa quem ainda encontrar o temporário sem uso (chamadas em paralelo).
  const { rows: atualizados } = await pool.query(
    `UPDATE parceiros
     SET secret_oficial_hash = $3, secret_oficial_gerado_em = NOW(), secret_temporario_usado_em = NOW(), atualizado_em = NOW()
     WHERE id = $1 AND secret_temporario_hash = $2 AND secret_temporario_usado_em IS NULL AND status = 'APROVADO'
     RETURNING to_char(secret_oficial_gerado_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00' AS secret_oficial_gerado_em`,
    [p.id, hash, hashSegredo(secretOficial)]
  );
  if (!atualizados[0]) {
    throw new ErroApi(401, 'SECRET_TEMPORARIO_USADO', 'Este client_secret temporário já foi usado. Peça ao Horizon um novo client_secret temporário.');
  }
  await registrarEvento(null, p.id, 'SECRET_OFICIAL', `client_secret oficial gerado pelo parceiro (IP ${String(req.ip || '').replace(/^::ffff:/, '')}).`);
  res.json({
    clientId,
    clientSecret: secretOficial,
    geradoEm: atualizados[0].secret_oficial_gerado_em,
    aviso: 'Guarde o clientSecret em local seguro agora: ele não é mostrado de novo.',
  });
});

module.exports = { solicitar, reenviarCodigo, confirmar, trocarSecret };
