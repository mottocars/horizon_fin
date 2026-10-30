const { z } = require('zod');
const service = require('./financeiro.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const anoSchema = z.coerce.number().int().min(1990, 'Exercício inválido.').max(2100, 'Exercício inválido.');

// Lista na query string separada por vírgula ("R,P"); vazio = sem filtro. Valor vazio dentro da lista
// ("5,,9" ou só ",") = lançamentos sem aquele campo.
const listaSchema = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === '' ? [] : v.split(',')));

const lancamentosSchema = z.object({
  origem: listaSchema,
  documento: listaSchema,
  centro: listaSchema,
  natureza: listaSchema,
  busca: z.string().trim().max(100).optional().default(''),
  pagina: z.coerce.number().int().min(1).optional().default(1),
  por_pagina: z.coerce.number().int().min(10).max(500).optional().default(100),
});

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

function tratar(err, next) {
  if (err.issues) return next(erro(400, err.issues[0].message));
  return next(err);
}

async function exercicios(req, res, next) {
  try {
    res.json(await service.exercicios(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

// GET /:empresaId/exercicios/:ano/lancamentos?origem=R,P,E&documento=&centro=&natureza=&busca=&pagina=&por_pagina=
async function lancamentos(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const ano = anoSchema.parse(req.params.ano);
    const q = lancamentosSchema.parse(req.query);
    res.json(
      await service.lancamentos(
        empresaId,
        ano,
        { origens: q.origem, documentos: q.documento, centros: q.centro, naturezas: q.natureza, busca: q.busca },
        { pagina: q.pagina, porPagina: q.por_pagina }
      )
    );
  } catch (err) {
    tratar(err, next);
  }
}

async function filtros(req, res, next) {
  try {
    res.json(await service.opcoesFiltros(empresaIdSchema.parse(req.params.empresaId), anoSchema.parse(req.params.ano)));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { exercicios, lancamentos, filtros };
