const { z } = require('zod');
const service = require('./cobrancaAcesso.service');

const empresaIdSchema = z.coerce.number().int().positive('Selecione uma empresa.');
const salvarSchema = z.object({
  empresa_id: empresaIdSchema,
  usuario_ids: z.array(z.coerce.number().int().positive()).default([]),
});

function tratar(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err.issues) return res.status(400).json({ message: err.issues[0].message });
      next(err);
    }
  };
}

// O próprio usuário: é Administrador da Gestão de Cobranças nesta empresa? (decide as abas da tela)
const meuAcesso = tratar(async (req, res) => {
  const empresaId = empresaIdSchema.parse(req.query.empresa_id);
  res.json({ administrador: await service.ehAdministradorCobranca(req.user, empresaId) });
});

const getAdministradores = tratar(async (req, res) => {
  res.json(await service.getAdministradores(empresaIdSchema.parse(req.query.empresa_id)));
});

const salvarAdministradores = tratar(async (req, res) => {
  const { empresa_id: empresaId, usuario_ids: ids } = salvarSchema.parse(req.body);
  res.json(await service.salvarAdministradores(empresaId, ids, req.user));
});

module.exports = { meuAcesso, getAdministradores, salvarAdministradores };
