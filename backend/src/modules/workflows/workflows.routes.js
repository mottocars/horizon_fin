const { Router } = require('express');
const { z } = require('zod');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const service = require('./workflows.service');

// Operações > Workflows:
//   GET    /:empresaId                -> os workflows da empresa (com a última execução)
//   GET    /:empresaId/opcoes         -> gatilhos, modelos, conexões Z-API e usuários da empresa
//   GET    /:empresaId/execucoes      -> o histórico de execuções
//   POST   /:empresaId                { nome, gatilho, acao }
//   PUT    /:empresaId/:id            { nome, gatilho, acao }
//   PUT    /:empresaId/:id/ativo      { ativo }
//   DELETE /:empresaId/:id

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const idSchema = z.coerce.number().int().positive('Workflow inválido.');

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
router.get('/:empresaId/opcoes', rota((req, empresaId) => service.opcoes(empresaId)));
router.get('/:empresaId/execucoes', rota((req, empresaId) => service.execucoes(empresaId)));
router.post('/:empresaId', rota((req, empresaId) => service.criar(empresaId, req.body || {}, req.user.id)));
router.put('/:empresaId/:id/ativo', rota((req, empresaId) => service.definirAtivo(empresaId, idSchema.parse(req.params.id), req.body?.ativo, req.user.id)));
router.put('/:empresaId/:id', rota((req, empresaId) => service.atualizar(empresaId, idSchema.parse(req.params.id), req.body || {}, req.user.id)));
router.delete('/:empresaId/:id', rota((req, empresaId) => service.excluir(empresaId, idSchema.parse(req.params.id))));

module.exports = router;
