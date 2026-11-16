const { Router } = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const authMiddleware = require('../../middlewares/auth.middleware');
const { paramEmpresa } = require('../../middlewares/acesso.middleware');
const controller = require('./formularios.controller');

// Três routers, montados em server.js:
//   /api/formularios          → Cadastros › Formulários (exige a tela), sempre dentro de uma empresa
//                               (/:empresaId/..., conferida contra as empresas do usuário);
//   /api/meus-formularios     → qualquer usuário logado: formulários privados pendentes e envio da resposta;
//   /api/publico/formularios  → link público, sem login.

const cadastro = Router();
cadastro.use(authMiddleware);
cadastro.param('empresaId', paramEmpresa);
// /opcoes/usuarios antes de /:id (senão a rota curinga pega a palavra como id).
cadastro.get('/:empresaId/opcoes/usuarios', controller.usuarios);
cadastro.get('/:empresaId', controller.listar);
cadastro.post('/:empresaId', controller.criar);
cadastro.get('/:empresaId/:id', controller.obter);
cadastro.put('/:empresaId/:id', controller.salvar);
cadastro.patch('/:empresaId/:id/status', controller.alterarStatus);
cadastro.post('/:empresaId/:id/duplicar', controller.duplicar);
cadastro.post('/:empresaId/:id/novo-link', controller.novoLink);
cadastro.put('/:empresaId/:id/logo-central', controller.salvarLogoCentral);
cadastro.delete('/:empresaId/:id/logo-central', controller.removerLogoCentral);
cadastro.delete('/:empresaId/:id', controller.excluir);
cadastro.get('/:empresaId/:id/respostas', controller.resultados);
cadastro.delete('/:empresaId/:id/respostas/:respostaId', controller.excluirResposta);

const meus = Router();
meus.use(authMiddleware);
meus.get('/pendentes', controller.pendentes);
meus.post('/:id/respostas', controller.responder);

// Envio pelo link público: por IP + formulário — trava robô enchendo a pesquisa sem atrapalhar
// várias pessoas do mesmo escritório (mesmo IP) respondendo.
const limiteEnvioPublico = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `form:${ipKeyGenerator(req.ip)}:${req.params.token}`,
  handler: (req, res) => res.status(429).json({ message: 'Muitas respostas em pouco tempo. Aguarde alguns minutos e tente novamente.' }),
});

const publico = Router();
publico.get('/:token', controller.obterPublico);
publico.post('/:token/respostas', limiteEnvioPublico, controller.responderPublico);

module.exports = { cadastro, meus, publico };
