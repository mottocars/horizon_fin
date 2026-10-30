const { z } = require('zod');
const service = require('./financeiro.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const anoSchema = z.coerce.number().int().min(1990, 'Exercício inválido.').max(2100, 'Exercício inválido.');

// Lista na query string como parâmetro repetido (`centro[]=5&centro[]=9` — o que o axios manda pra um
// array; nome de cliente/fornecedor pode ter vírgula); vazio = sem filtro. Valor vazio dentro da lista
// = lançamentos sem aquele campo.
const listaSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]));
const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
  .optional();

const lancamentosSchema = z.object({
  origem: listaSchema,
  documento: listaSchema,
  centro: listaSchema,
  natureza: listaSchema,
  contraparte: listaSchema,
  mes: listaSchema,
  de: dataSchema,
  ate: dataSchema,
  busca: z.string().trim().max(100).optional().default(''),
  pagina: z.coerce.number().int().min(1).optional().default(1),
  por_pagina: z.coerce.number().int().min(10).max(5000).optional().default(100),
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

// GET /:empresaId/exercicios/:ano/lancamentos?origem[]=&documento[]=&centro[]=&natureza[]=&contraparte[]=&mes[]=&de=&ate=&busca=&pagina=&por_pagina=
async function lancamentos(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const ano = anoSchema.parse(req.params.ano);
    const q = lancamentosSchema.parse(req.query);
    res.json(
      await service.lancamentos(
        empresaId,
        ano,
        {
          origens: q.origem,
          documentos: q.documento,
          centros: q.centro,
          naturezas: q.natureza,
          contrapartes: q.contraparte,
          meses: q.mes,
          de: q.de,
          ate: q.ate,
          busca: q.busca,
        },
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
