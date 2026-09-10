const { z } = require('zod');
const authService = require('./auth.service');

const loginSchema = z.object({
  username: z.string().min(1),
  senha: z.string().min(1),
});

async function login(req, res, next) {
  try {
    const { username, senha } = loginSchema.parse(req.body);
    const result = await authService.login(username, senha);
    res.json(result);
  } catch (err) {
    if (err.issues) {
      err.status = 400;
      err.expose = true;
      err.message = 'Dados inválidos.';
    }
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      const err = new Error('refreshToken é obrigatório.');
      err.status = 400;
      err.expose = true;
      throw err;
    }
    const result = authService.refresh(refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res) {
  res.status(204).send();
}

module.exports = { login, refresh, logout };
