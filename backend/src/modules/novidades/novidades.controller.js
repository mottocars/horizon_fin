const { z } = require('zod');
const service = require('./novidades.service');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

const idSchema = z.coerce.number().int().positive('Novidade inválida.');

// O cadastro chega em multipart (o GIF vai junto): os campos vêm num JSON em `dados`.
const dadosSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome.').max(150, 'Nome com no máximo 150 caracteres.'),
  descricao: z.string().trim().min(1, 'Informe a descrição.').max(5000, 'Descrição com no máximo 5.000 caracteres.'),
  publico: z.enum(['TODOS', 'EMPRESAS']),
  // A partir de quando aparece (AAAA-MM-DD) e se quem for cadastrado depois também vê.
  exibir_a_partir: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data de exibição.'),
  novos_usuarios: z.boolean().default(true),
  empresas: z
    .array(
      z.object({
        empresa_id: z.coerce.number().int().positive(),
        todos_usuarios: z.boolean(),
        usuario_ids: z.array(z.coerce.number().int().positive()).default([]),
      })
    )
    .default([]),
});

const TIPOS_MIDIA = ['image/gif', 'image/png', 'image/jpeg', 'image/webp'];

function lerDados(req) {
  let bruto;
  try {
    bruto = JSON.parse(req.body?.dados || '{}');
  } catch {
    throw badRequest('Dados inválidos.');
  }
  return dadosSchema.parse(bruto);
}

function lerArquivo(req) {
  if (!req.file) return undefined;
  if (!TIPOS_MIDIA.includes(req.file.mimetype)) throw badRequest('Envie um GIF (ou PNG, JPG, WEBP).');
  // multer entrega o nome em latin1 (ver saldos.controller.js).
  const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  return { ...req.file, originalname };
}

function rota(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err.issues) return next(badRequest(err.issues[0].message));
      next(err);
    }
  };
}

function enviarMidia(res, m) {
  if (!m) return res.status(404).json({ message: 'Sem GIF.' });
  res.setHeader('Content-Type', m.midia_tipo || 'image/gif');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.send(m.midia);
}

// ─── para quem vê ──────────────────────────────────────────────────────────
const minhas = rota(async (req, res) => res.json(await service.minhasNovidades(req.user)));
const marcarVista = rota(async (req, res) => {
  await service.marcarVista(req.user, idSchema.parse(req.params.id));
  res.status(204).send();
});
const minhaMidia = rota(async (req, res) => enviarMidia(res, await service.midiaParaUsuario(req.user, idSchema.parse(req.params.id))));

// ─── cadastro ──────────────────────────────────────────────────────────────
const listar = rota(async (req, res) => res.json(await service.listar(req.user)));
const obter = rota(async (req, res) => res.json(await service.obter(req.user, idSchema.parse(req.params.id))));
const criar = rota(async (req, res) => res.status(201).json(await service.salvar(req.user, null, lerDados(req), lerArquivo(req))));
const atualizar = rota(async (req, res) =>
  res.json(await service.salvar(req.user, idSchema.parse(req.params.id), lerDados(req), lerArquivo(req)))
);
const excluir = rota(async (req, res) => {
  await service.excluir(req.user, idSchema.parse(req.params.id));
  res.status(204).send();
});
const vistas = rota(async (req, res) => res.json(await service.vistas(req.user, idSchema.parse(req.params.id))));
const midiaCadastro = rota(async (req, res) => enviarMidia(res, await service.midiaCadastro(req.user, idSchema.parse(req.params.id))));
const opcoesEmpresas = rota(async (req, res) => res.json(await service.opcoesEmpresas(req.user)));
const opcoesUsuarios = rota(async (req, res) =>
  res.json(await service.opcoesUsuarios(req.user, z.coerce.number().int().positive('Empresa inválida.').parse(req.params.empresaId)))
);

module.exports = { minhas, marcarVista, minhaMidia, listar, obter, vistas, criar, atualizar, excluir, midiaCadastro, opcoesEmpresas, opcoesUsuarios };
