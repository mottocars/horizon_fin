const { Router } = require('express');
const { z } = require('zod');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const service = require('./dreVersoes.service');

// Operações > DRE Construtoras > aba Versões (qualquer usuário com acesso à tela abre, edita e salva):
//   GET    /:empresaId                         -> { limite, proximo_corte, aberta, publicada, versoes }
//   GET    /:empresaId/publicada               -> cabeçalho do dashboard (versão, responsável, aprovador, colaboradores)
//   GET    /:empresaId/:numero/alteracoes      -> o carimbo de cada alteração da versão
//   POST   /:empresaId/abrir { origem }        -> NOVA (Gerar nova versão) ou EDICAO (Editar última versão)
//   POST   /:empresaId/salvar                  -> salva a versão aberta
//   DELETE /:empresaId/aberta                  -> exclui a versão aberta (tudo volta ao da última salva)

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const numeroSchema = z.coerce.number().int().positive('Versão inválida.');
const origemSchema = z.enum(['NOVA', 'EDICAO'], { errorMap: () => ({ message: 'Escolha Gerar nova versão ou Editar última versão.' }) });

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
// Antes de '/:numero' (senão "publicada" seria lido como número). Também pro dashboard (só leitura).
router.get('/:empresaId/publicada', rota((req, empresaId) => service.cabecalhoPublicada(empresaId)));
router.get('/:empresaId/:numero/alteracoes', rota((req, empresaId) => service.alteracoes(empresaId, numeroSchema.parse(req.params.numero))));
router.post('/:empresaId/abrir', rota((req, empresaId) => service.abrir(empresaId, origemSchema.parse(req.body?.origem), req.user.id)));
router.post('/:empresaId/salvar', rota((req, empresaId) => service.salvar(empresaId, req.user.id)));
router.delete('/:empresaId/aberta', rota((req, empresaId) => service.excluir(empresaId, req.user.id)));

module.exports = router;
