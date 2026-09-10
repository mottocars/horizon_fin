const { z } = require('zod');
const service = require('./reguaCobranca.service');

const empresaIdSchema = z.coerce.number().int().positive('Selecione uma empresa.');
const clusterSchema = z.enum(service.CLUSTERS_VALIDOS, {
  errorMap: () => ({ message: 'Cluster inválido.' }),
});

const criarEtapaSchema = z.object({
  empresa_id: empresaIdSchema,
  cluster: clusterSchema,
  nome: z.string().max(150).optional(),
  dias: z.coerce.number().int().nullable().optional(),
  canal_whatsapp: z.boolean().optional(),
  canal_email: z.boolean().optional(),
  canal_ligacao: z.boolean().optional(),
  template_id: z.coerce.number().int().positive().nullable().optional(),
  responsavel_usuario_id: z.coerce.number().int().positive().nullable().optional(),
  ativa: z.boolean().optional(),
  rotina_habilitada: z.boolean().optional(),
});

const atualizarEtapaSchema = z.object({
  nome: z.string().max(150).optional(),
  dias: z.coerce.number().int().nullable().optional(),
  canal_whatsapp: z.boolean().optional(),
  canal_email: z.boolean().optional(),
  canal_ligacao: z.boolean().optional(),
  template_id: z.coerce.number().int().positive().nullable().optional(),
  responsavel_usuario_id: z.coerce.number().int().positive().nullable().optional(),
  ativa: z.boolean().optional(),
  rotina_habilitada: z.boolean().optional(),
});

const parametroDisparoSchema = z.object({
  horario: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido — use HH:MM.'),
  zapi_integracao_id: z.coerce.number().int().positive().nullable().optional(),
  email_integracao_id: z.coerce.number().int().positive().nullable().optional(),
});

const dataSistemaSchema = z
  .object({
    usar_data_real: z.boolean(),
    data_ficticia: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
      .nullable()
      .optional(),
  })
  .refine((d) => d.usar_data_real || d.data_ficticia, {
    message: 'Informe a data fictícia.',
    path: ['data_ficticia'],
  });

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function getResumo(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const resumo = await service.getResumo(empresaId);
    res.json(resumo);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listResponsaveis(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const responsaveis = await service.listResponsaveis(empresaId);
    res.json(responsaveis);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listEtapas(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const cluster = clusterSchema.parse(req.query.cluster);
    const etapas = await service.listEtapas(empresaId, cluster);
    res.json(etapas);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function criarEtapa(req, res, next) {
  try {
    const { empresa_id: empresaId, cluster, ...dados } = criarEtapaSchema.parse(req.body);
    const etapa = await service.criarEtapa(empresaId, cluster, dados);
    res.status(201).json(etapa);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function atualizarEtapa(req, res, next) {
  try {
    const dados = atualizarEtapaSchema.parse(req.body);
    const etapa = await service.atualizarEtapa(req.params.id, dados);
    if (!etapa) return res.status(404).json({ message: 'Etapa não encontrada.' });
    res.json(etapa);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function removerEtapa(req, res, next) {
  try {
    const removida = await service.removerEtapa(req.params.id);
    if (!removida) return res.status(404).json({ message: 'Etapa não encontrada.' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function listParametrosDisparo(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const parametros = await service.listParametrosDisparo(empresaId);
    res.json(parametros);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function salvarParametroDisparo(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const cluster = clusterSchema.parse(req.query.cluster);
    const dados = parametroDisparoSchema.parse(req.body);
    const resultado = await service.salvarParametroDisparo(empresaId, cluster, dados);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getDataSistema(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const dataSistema = await service.getDataSistema(empresaId);
    res.json(dataSistema);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function salvarDataSistema(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const dados = dataSistemaSchema.parse(req.body);
    const resultado = await service.salvarDataSistema(empresaId, dados);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

const comunicacaoAutomaticaSchema = z.object({ ativa: z.boolean() });

async function getComunicacaoAutomatica(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const resultado = await service.getComunicacaoAutomatica(empresaId);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function salvarComunicacaoAutomatica(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const { ativa } = comunicacaoAutomaticaSchema.parse(req.body);
    const resultado = await service.salvarComunicacaoAutomatica(empresaId, ativa);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = {
  getResumo,
  listResponsaveis,
  listEtapas,
  criarEtapa,
  atualizarEtapa,
  removerEtapa,
  listParametrosDisparo,
  salvarParametroDisparo,
  getDataSistema,
  salvarDataSistema,
  getComunicacaoAutomatica,
  salvarComunicacaoAutomatica,
};
