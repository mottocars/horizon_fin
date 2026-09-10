const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../../config/db');
const env = require('../../config/env');

async function login(username, senha) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.email, u.username, u.senha_hash, u.avatar_url, u.ativo, u.permissao,
            u.telas_permitidas, u.primeiro_acesso,
            COALESCE(array_agg(ue.empresa_id) FILTER (WHERE ue.empresa_id IS NOT NULL), '{}') AS empresa_ids
     FROM usuarios u
     LEFT JOIN usuarios_empresas ue ON ue.usuario_id = u.id
     WHERE u.username = $1
     GROUP BY u.id`,
    [username]
  );
  const usuario = rows[0];

  if (!usuario || !usuario.ativo) {
    const err = new Error('Usuário ou senha inválidos.');
    err.status = 401;
    err.expose = true;
    throw err;
  }

  const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
  if (!senhaValida) {
    const err = new Error('Usuário ou senha inválidos.');
    err.status = 401;
    err.expose = true;
    throw err;
  }

  const token = jwt.sign({ sub: usuario.id }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });
  const refreshToken = jwt.sign({ sub: usuario.id }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });

  return {
    token,
    refreshToken,
    user: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      username: usuario.username,
      avatar_url: usuario.avatar_url,
      permissao: usuario.permissao,
      empresa_ids: usuario.empresa_ids,
      telas_permitidas: usuario.telas_permitidas,
      primeiro_acesso: usuario.primeiro_acesso,
    },
  };
}

function refresh(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
    const token = jwt.sign({ sub: payload.sub }, env.jwt.secret, {
      expiresIn: env.jwt.expiresIn,
    });
    return { token };
  } catch (err) {
    const e = new Error('Refresh token inválido ou expirado.');
    e.status = 401;
    e.expose = true;
    throw e;
  }
}

module.exports = { login, refresh };
