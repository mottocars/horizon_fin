const pool = require('../../../config/db');
const { ErroApi } = require('./erros');
const {
  PREFIXO_CHAVE,
  PREFIXO_TOKEN,
  TOKEN_MINUTOS,
  gerarSegredo,
  hashSegredo,
  usuarioPodeUsarApi,
  usuarioTemTela,
  SQL_USUARIO,
} = require('../comum');

// Autenticação da API pública em dois passos:
//   1. POST /v1/auth/token com o cabeçalho X-Api-Key (chave gerada em Integrações > API Horizon)
//      → token temporário (15 min);
//   2. demais rotas com Authorization: Bearer <token>.
// O token é opaco (não é o JWT do sistema): não abre nenhuma outra rota do Horizon. A cada
// chamada confere de novo a chave (revogada/vencida) e o dono (ativo e com a empresa da chave);
// cada grupo de endpoints confere ainda a tela do sistema dele (exigirTelaApi) — tirar a tela
// do usuário corta aquele grupo na hora.

function semPermissao() {
  return new ErroApi(403, 'SEM_PERMISSAO', 'O usuário dono da chave está inativo ou não tem mais acesso à empresa da chave.');
}

function conferirChave(chave) {
  if (chave.revogada_em) throw new ErroApi(401, 'CHAVE_REVOGADA', 'Esta chave de API foi revogada.');
  if (new Date(chave.expira_em) <= new Date()) {
    throw new ErroApi(401, 'CHAVE_EXPIRADA', 'Esta chave de API expirou. Gere outra em Integrações > API Horizon.');
  }
}

async function carregarDono(chave) {
  const { rows } = await pool.query(SQL_USUARIO, [chave.usuario_id]);
  if (!usuarioPodeUsarApi(rows[0], chave.empresa_id)) throw semPermissao();
  return rows[0];
}

// Limpeza dos tokens vencidos — no máximo uma vez por minuto, na emissão de um token novo.
let ultimaLimpeza = 0;
async function limparTokensVencidos() {
  if (Date.now() - ultimaLimpeza < 60 * 1000) return;
  ultimaLimpeza = Date.now();
  await pool.query("DELETE FROM api_horizon_tokens WHERE expira_em < NOW() - INTERVAL '1 hour'");
  await pool.query("DELETE FROM api_horizon_requisicoes WHERE criado_em < NOW() - INTERVAL '365 days'");
}

async function emitirToken(req, res, next) {
  try {
    const chaveInformada = String(req.get('x-api-key') || '').trim();
    if (!chaveInformada) {
      throw new ErroApi(401, 'CHAVE_AUSENTE', 'Informe a chave de API no cabeçalho X-Api-Key.');
    }
    if (!chaveInformada.startsWith(PREFIXO_CHAVE)) {
      throw new ErroApi(401, 'CHAVE_INVALIDA', 'Chave de API inválida.');
    }

    const { rows } = await pool.query(
      `SELECT id, usuario_id, empresa_id, pode_inativar, expira_em, revogada_em
       FROM api_horizon_chaves WHERE chave_hash = $1`,
      [hashSegredo(chaveInformada)]
    );
    const chave = rows[0];
    if (!chave) throw new ErroApi(401, 'CHAVE_INVALIDA', 'Chave de API inválida.');
    req.apiHorizon = { chaveId: chave.id, usuarioId: chave.usuario_id };
    conferirChave(chave);
    await carregarDono(chave);

    const token = gerarSegredo(PREFIXO_TOKEN);
    const { rows: emitido } = await pool.query(
      `INSERT INTO api_horizon_tokens (token_hash, chave_id, ip, expira_em)
       VALUES ($1, $2, $3, NOW() + make_interval(mins => $4))
       RETURNING to_char(expira_em AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00' AS expira_em`,
      [hashSegredo(token), chave.id, req.ip, TOKEN_MINUTOS]
    );
    await pool.query('UPDATE api_horizon_chaves SET ultimo_uso_em = NOW() WHERE id = $1', [chave.id]);
    limparTokensVencidos().catch((err) => console.error('[api-horizon] limpeza:', err.message));

    res.set('Cache-Control', 'no-store');
    res.json({
      token,
      tipo: 'Bearer',
      expiraEm: emitido[0].expira_em,
      expiraEmSegundos: TOKEN_MINUTOS * 60,
      escopos: chave.pode_inativar ? ['leitura', 'notas:inativar'] : ['leitura'],
    });
  } catch (err) {
    next(err);
  }
}

async function exigirToken(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      throw new ErroApi(401, 'TOKEN_AUSENTE', 'Informe o token no cabeçalho Authorization: Bearer <token>.');
    }

    const { rows } = await pool.query(
      `SELECT t.expira_em AS token_expira_em, k.id, k.usuario_id, k.empresa_id, k.pode_inativar, k.expira_em, k.revogada_em
       FROM api_horizon_tokens t
       JOIN api_horizon_chaves k ON k.id = t.chave_id
       WHERE t.token_hash = $1`,
      [hashSegredo(token)]
    );
    const linha = rows[0];
    if (!linha) throw new ErroApi(401, 'TOKEN_INVALIDO', 'Token inválido.');
    req.apiHorizon = { chaveId: linha.id, usuarioId: linha.usuario_id };
    if (new Date(linha.token_expira_em) <= new Date()) {
      throw new ErroApi(401, 'TOKEN_EXPIRADO', 'Token expirado. Gere outro em POST /v1/auth/token.');
    }
    conferirChave(linha);
    const dono = await carregarDono(linha);

    req.apiHorizon = {
      chaveId: linha.id,
      usuarioId: dono.id,
      empresaId: linha.empresa_id,
      podeInativar: linha.pode_inativar,
      dono,
    };
    pool
      .query(
        "UPDATE api_horizon_chaves SET ultimo_uso_em = NOW() WHERE id = $1 AND (ultimo_uso_em IS NULL OR ultimo_uso_em < NOW() - INTERVAL '1 minute')",
        [linha.id]
      )
      .catch(() => {});
    next();
  } catch (err) {
    next(err);
  }
}

// Tela do sistema exigida por um grupo de endpoints (ex.: Notas fiscais → Espião NFe / NFSe).
function exigirTelaApi(tela, nomeTela) {
  return (req, res, next) => {
    if (usuarioTemTela(req.apiHorizon?.dono, tela)) return next();
    return next(
      new ErroApi(403, 'SEM_PERMISSAO', `O usuário dono da chave não tem acesso à tela ${nomeTela}, exigida por este endpoint.`)
    );
  };
}

function exigirEscopoInativar(req, res, next) {
  if (req.apiHorizon?.podeInativar) return next();
  return next(
    new ErroApi(403, 'ESCOPO_INSUFICIENTE', 'Esta chave não tem a permissão "Inativar notas" (escopo notas:inativar).')
  );
}

module.exports = { emitirToken, exigirToken, exigirTelaApi, exigirEscopoInativar };
