const { z } = require('zod');
const service = require('./cronogramaConfig.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');

// Regra fixa pede os meses; planejamento pede o sistema. Canal e conexão andam juntos.
const configSchema = z
  .object({
    atrasoRegra: z.enum(['FIXA', 'PLANEJAMENTO']).nullable(),
    atrasoMeses: z.union([z.null(), z.coerce.number().int('Informe um número inteiro de meses.').min(1, 'Informe pelo menos 1 mês.').max(600)]),
    atrasoSistema: z.enum(['PREVISION']).nullable(),
    comunicarCanal: z.enum(['WHATSAPP', 'EMAIL']).nullable(),
    conexaoId: z.union([z.null(), z.coerce.number().int().positive()]),
    usuarioIds: z.array(z.coerce.number().int().positive()).max(500).default([]),
  })
  .superRefine((c, ctx) => {
    if (c.atrasoRegra === 'FIXA' && c.atrasoMeses === null) {
      ctx.addIssue({ code: 'custom', message: 'Na regra fixa, informe com quantos meses de obra ela conta como atrasada.' });
    }
    if (c.atrasoRegra === 'PLANEJAMENTO' && c.atrasoSistema === null) {
      ctx.addIssue({ code: 'custom', message: 'No planejamento, escolha o sistema.' });
    }
    if (c.conexaoId !== null && c.comunicarCanal === null) {
      ctx.addIssue({ code: 'custom', message: 'Escolha o canal da conexão.' });
    }
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

async function getConfig(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.getConfig(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

async function salvarConfig(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const dados = configSchema.parse(req.body);
    res.json(await service.salvarConfig(empresaId, dados, req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { getConfig, salvarConfig };
