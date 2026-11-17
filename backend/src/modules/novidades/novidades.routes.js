const { Router } = require('express');
const multer = require('multer');
const authMiddleware = require('../../middlewares/auth.middleware');
const controller = require('./novidades.controller');

// Dois routers, montados em server.js:
//   /api/novidades        → Cadastros › Novidades (exige a tela);
//   /api/minhas-novidades → qualquer usuário logado: as novidades que ele pode
//                           ver (janela ao entrar e botão "Novidades" do topo).
// O GIF explicativo vai junto no cadastro (multipart, campo `arquivo`, até 10 MB).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const cadastro = Router();
cadastro.use(authMiddleware);
// /opcoes antes de /:id (senão a rota curinga pega a palavra como id).
cadastro.get('/opcoes/empresas', controller.opcoesEmpresas);
cadastro.get('/opcoes/empresas/:empresaId/usuarios', controller.opcoesUsuarios);
cadastro.get('/', controller.listar);
cadastro.post('/', upload.single('arquivo'), controller.criar);
cadastro.get('/:id', controller.obter);
cadastro.put('/:id', upload.single('arquivo'), controller.atualizar);
cadastro.delete('/:id', controller.excluir);
cadastro.get('/:id/midia', controller.midiaCadastro);
cadastro.get('/:id/vistas', controller.vistas);

const minhas = Router();
minhas.use(authMiddleware);
minhas.get('/', controller.minhas);
minhas.post('/:id/vista', controller.marcarVista);
minhas.get('/:id/midia', controller.minhaMidia);

module.exports = { cadastro, minhas };
