const { Router } = require('express');
const { z } = require('zod');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const service = require('./matrizAlcadas.service');

// Cadastros > Matriz de Alçadas:
//   GET /:empresaId                          -> { classificacoes: [{ id, rotulo, usuarios (elegíveis), itens: [{ id, rotulo, usuario }] }] }
//   PUT /:empresaId/:classificacao/:item { usuario_id | null } -> grava (null limpa)

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const usuarioSchema = z.union([z.null(), z.coerce.number().int().positive()], { errorMap: () => ({ message: 'Usuário inválido.' }) });

const rota = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req, empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    if (err.issues) {
      const e = new Error(err.issues[0].message);
      e.status = 400;
      e.expose = true;
      return next(e);
    }
    return next(err);
  }
};

const router = Router();
router.use(authMiddleware);
router.param('empresaId', paramEmpresa);
router.get('/:empresaId', rota((req, empresaId) => service.listar(empresaId)));
router.put(
  '/:empresaId/:classificacao/:item',
  rota((req, empresaId) =>
    service.salvar(empresaId, req.params.classificacao, req.params.item, usuarioSchema.parse(req.body?.usuario_id ?? null), req.user.id)
  )
);

module.exports = router;
