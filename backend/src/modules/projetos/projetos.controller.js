const { z } = require('zod');
const service = require('./projetos.service');
const saldosService = require('../saldo-contas-bancarias/saldos.service');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) return false;
  const [a, m, d] = texto.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const idSchema = z.coerce.number().int().positive();

const cardSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione a empresa.'),
  assunto: z.string().trim().min(1, 'Informe o assunto.').max(200, 'Assunto muito longo (até 200 caracteres).'),
  descricao: z.string().trim().max(20000, 'Descrição muito longa.').optional().default(''),
  data_inicio: z.string().refine(dataValida, 'Informe a data de início.'),
  data_fim: z.string().refine(dataValida, 'Informe a data fim esperada.'),
  responsavel_id: z.coerce.number().int().positive('Selecione o responsável.'),
});

const listarSchema = z.object({
  visao: z.enum(['minhas', 'equipe']).default('minhas'),
  empresa_id: z.coerce.number().int().positive().optional(),
});

function tratar(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err.issues) return next(badRequest(err.issues[0].message));
      next(err);
    }
  };
}

const listar = tratar(async (req, res) => {
  const q = listarSchema.parse(req.query);
  if (q.empresa_id) await saldosService.assertAcessoEmpresa(req.user.id, q.empresa_id);
  res.json(await service.listar(req.user.id, { visao: q.visao, empresaId: q.empresa_id }));
});

const responsaveis = tratar(async (req, res) => {
  const empresaId = idSchema.parse(req.query.empresa_id);
  await saldosService.assertAcessoEmpresa(req.user.id, empresaId);
  res.json(await service.responsaveisElegiveis(empresaId));
});

const obter = tratar(async (req, res) => res.json(await service.obter(idSchema.parse(req.params.id), req.user.id)));

const criar = tratar(async (req, res) => res.status(201).json(await service.criar(req.user.id, cardSchema.parse(req.body))));

const atualizar = tratar(async (req, res) =>
  res.json(await service.atualizar(idSchema.parse(req.params.id), req.user.id, cardSchema.parse(req.body)))
);

const excluir = tratar(async (req, res) => {
  await service.excluir(idSchema.parse(req.params.id), req.user.id);
  res.status(204).end();
});

const mover = tratar(async (req, res) => {
  const { status } = z.object({ status: z.string() }).parse(req.body);
  res.json(await service.mover(idSchema.parse(req.params.id), req.user.id, status));
});

const comentar = tratar(async (req, res) => {
  const { texto } = z
    .object({ texto: z.string().trim().min(1, 'Escreva o comentário.').max(5000, 'Comentário muito longo.') })
    .parse(req.body);
  res.status(201).json(await service.comentar(idSchema.parse(req.params.id), req.user.id, texto));
});

const finalizar = tratar(async (req, res) => res.json(await service.finalizar(idSchema.parse(req.params.id), req.user.id)));

const excluirComentario = tratar(async (req, res) =>
  res.json(await service.excluirComentario(idSchema.parse(req.params.id), idSchema.parse(req.params.comentarioId), req.user.id))
);

const anexar = tratar(async (req, res) => res.status(201).json(await service.anexar(idSchema.parse(req.params.id), req.user.id, req.files)));

const baixarAnexo = tratar(async (req, res) => {
  const { caminho, nome, mime } = await service.arquivoDoAnexo(idSchema.parse(req.params.id), idSchema.parse(req.params.anexoId), req.user.id);
  res.setHeader('Content-Type', mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`);
  res.sendFile(caminho);
});

const excluirAnexo = tratar(async (req, res) =>
  res.json(await service.excluirAnexo(idSchema.parse(req.params.id), idSchema.parse(req.params.anexoId), req.user.id))
);

module.exports = { listar, responsaveis, obter, criar, atualizar, excluir, mover, finalizar, comentar, excluirComentario, anexar, baixarAnexo, excluirAnexo };
