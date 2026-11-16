const { Router } = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./formularios.controller');

// Três routers, montados em server.js:
//   /api/formularios          → Cadastros › Formulários (exige a tela);
//   /api/meus-formularios     → qualquer usuário logado: formulários privados pendentes e envio da resposta;
//   /api/publico/formularios  → link público, sem login.

const cadastro = Router();
cadastro.use(authMiddleware);
// /opcoes/usuarios antes de /:id (senão a rota curinga pega a palavra como id).
cadastro.get('/opcoes/usuarios', controller.usuarios);
cadastro.get('/', controller.listar);
cadastro.post('/', controller.criar);
cadastro.get('/:id', controller.obter);
cadastro.put('/:id', controller.salvar);
cadastro.patch('/:id/status', controller.alterarStatus);
cadastro.post('/:id/duplicar', controller.duplicar);
cadastro.post('/:id/novo-link', controller.novoLink);
cadastro.delete('/:id', controller.excluir);
cadastro.get('/:id/respostas', controller.resultados);
cadastro.delete('/:id/respostas/:respostaId', controller.excluirResposta);

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
