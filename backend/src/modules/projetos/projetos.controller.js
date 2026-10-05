const { z } = require('zod');
const service = require('./projetos.service');
const planos = require('./planos.service');
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
  // Micro tarefa de um plano de voo (opcional): a macro tarefa.
  macro_id: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().positive().nullable()).default(null),
});

const texto = (rotulo, max) => z.string().trim().min(1, `Informe ${rotulo}.`).max(max, `${rotulo[0].toUpperCase()}${rotulo.slice(1)} muito longo.`);

const planoSchema = z.object({
  nome: texto('o nome do plano de voo', 150),
  membros: z.array(z.coerce.number().int().positive()).default([]),
});
const planoNovoSchema = planoSchema.extend({ empresa_id: z.coerce.number().int().positive('Selecione a empresa.') });
const macroSchema = z.object({ nome: texto('o nome da macro tarefa', 150) });

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

const devolver = tratar(async (req, res) => res.json(await service.devolver(idSchema.parse(req.params.id), req.user.id)));

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

// ─── Planos de voo ───
const listarPlanos = tratar(async (req, res) => {
  const { empresa_id } = listarSchema.pick({ empresa_id: true }).parse(req.query);
  if (empresa_id) await saldosService.assertAcessoEmpresa(req.user.id, empresa_id);
  res.json(await planos.listar(req.user.id, { empresaId: empresa_id }));
});
const opcoesPlanos = tratar(async (req, res) => {
  const empresaId = idSchema.parse(req.query.empresa_id);
  await saldosService.assertAcessoEmpresa(req.user.id, empresaId);
  res.json(await planos.opcoes(req.user.id, empresaId));
});
const obterPlano = tratar(async (req, res) => res.json(await planos.obter(idSchema.parse(req.params.id), req.user.id)));
const criarPlano = tratar(async (req, res) => res.status(201).json(await planos.criar(req.user.id, planoNovoSchema.parse(req.body))));
const atualizarPlano = tratar(async (req, res) =>
  res.json(await planos.atualizar(idSchema.parse(req.params.id), req.user.id, planoSchema.parse(req.body)))
);
const excluirPlano = tratar(async (req, res) => {
  await planos.excluir(idSchema.parse(req.params.id), req.user.id);
  res.status(204).end();
});
const criarMacro = tratar(async (req, res) =>
  res.status(201).json(await planos.criarMacro(idSchema.parse(req.params.id), req.user.id, macroSchema.parse(req.body).nome))
);
const renomearMacro = tratar(async (req, res) =>
  res.json(await planos.renomearMacro(idSchema.parse(req.params.id), idSchema.parse(req.params.macroId), req.user.id, macroSchema.parse(req.body).nome))
);
const excluirMacro = tratar(async (req, res) =>
  res.json(await planos.excluirMacro(idSchema.parse(req.params.id), idSchema.parse(req.params.macroId), req.user.id))
);
const ordenarMacros = tratar(async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.coerce.number().int().positive()) }).parse(req.body);
  res.json(await planos.ordenarMacros(idSchema.parse(req.params.id), req.user.id, ids));
});

module.exports = {
  listarPlanos,
  opcoesPlanos,
  obterPlano,
  criarPlano,
  atualizarPlano,
  excluirPlano,
  criarMacro,
  renomearMacro,
  excluirMacro,
  ordenarMacros,
  listar, responsaveis, obter, criar, atualizar, excluir, mover, finalizar, devolver, comentar, excluirComentario, anexar, baixarAnexo, excluirAnexo };
