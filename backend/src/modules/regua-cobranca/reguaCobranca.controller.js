const { z } = require('zod');
const service = require('./reguaCobranca.service');
const distribuicao = require('./distribuicao.service');
const { ehAdministradorDaTela } = require('../../middlewares/acesso.middleware');
const T = require('../../config/telas');

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
    const apenasAtribuidos = req.query.apenas_atribuidos === 'true';
    const responsaveis = await service.listResponsaveis(empresaId, { apenasAtribuidos });
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

const comunicacaoAutomaticaSchema = z.object({
  tipo: z.enum(service.TIPOS_COMUNICACAO, { errorMap: () => ({ message: 'Tipo de comunicação inválido.' }) }),
});

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
    const { tipo } = comunicacaoAutomaticaSchema.parse(req.body);
    const resultado = await service.salvarComunicacaoAutomatica(empresaId, tipo);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

// "Tipos de Pagamentos para Cobrança" (Configurações Globais): a tela manda
// sempre a lista inteira do lado direito.
const tiposPagamentoSchema = z.object({
  descricoes: z.array(z.string().trim().min(1).max(255)).max(500),
});

async function getTiposPagamento(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    res.json(await service.getTiposPagamento(empresaId));
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function salvarTiposPagamento(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const { descricoes } = tiposPagamentoSchema.parse(req.body);
    res.json(await service.salvarTiposPagamento(empresaId, descricoes, req.user.id));
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

// ─── Distribuição da Rotina (Configurações Globais) ────────────────────────
// Ler é livre pra quem tem a tela; mexer na equipe, no modo ou redistribuir
// muda o trabalho de todo mundo — só Master e Administrador da tela Gestão
// de Cobranças (nível marcado no cadastro do usuário).
function exigirGestor(req) {
  if (!ehAdministradorDaTela(req.user, T.COBRANCAS)) {
    const err = new Error('Só Master e Administrador da Gestão de Cobranças podem alterar a distribuição da Rotina.');
    err.status = 403;
    err.expose = true;
    throw err;
  }
}

const usuarioIdParamSchema = z.coerce.number().int().positive('Usuário inválido.');
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');

const configDistribuicaoSchema = z.object({
  modo: z.enum(distribuicao.MODOS, { errorMap: () => ({ message: 'Tipo de distribuição inválido.' }) }).optional(),
  dias_liberacao: z.coerce
    .number({ invalid_type_error: 'Informe os dias de liberação.' })
    .int('Use um número inteiro de dias.')
    .min(1, 'A liberação precisa ser de pelo menos 1 dia.')
    .max(365, 'A liberação pode ser de no máximo 365 dias.')
    .optional(),
});

// Envolve os handlers da distribuição: valida empresa, converte erro do zod
// em 400 e devolve o painel atualizado (a tela sempre redesenha a partir dele).
function rotaDistribuicao(fn, { escrita = true } = {}) {
  return async (req, res, next) => {
    try {
      const empresaId = empresaIdSchema.parse(req.query.empresa_id);
      if (escrita) exigirGestor(req);
      const extra = await fn(req, empresaId);
      res.json({ ...(await distribuicao.getPainel(empresaId)), ...(extra || {}) });
    } catch (err) {
      if (err.issues) return next(badRequest(err.issues[0].message));
      next(err);
    }
  };
}

const getDistribuicao = rotaDistribuicao(async () => null, { escrita: false });

// Só o modo/liberação — leve, pra quem só precisa saber se a régua está em
// "Responsável por etapa" ou "Distribuição automática" (tabela de etapas,
// aba Rotinas), sem montar o painel inteiro.
async function getConfigDistribuicao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    res.json(await distribuicao.getConfig(empresaId));
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

const salvarConfigDistribuicao = rotaDistribuicao(async (req, empresaId) => {
  const dados = configDistribuicaoSchema.parse(req.body);
  await distribuicao.salvarConfig(empresaId, { modo: dados.modo, diasLiberacao: dados.dias_liberacao }, req.user.id);
});

const adicionarParticipante = rotaDistribuicao(async (req, empresaId) => {
  const usuarioId = usuarioIdParamSchema.parse(req.body?.usuario_id);
  await distribuicao.adicionarParticipante(empresaId, usuarioId, req.user.id);
});

const removerParticipante = rotaDistribuicao(async (req, empresaId) => {
  await distribuicao.removerParticipante(empresaId, usuarioIdParamSchema.parse(req.params.usuarioId), req.user.id);
});

const pausarParticipante = rotaDistribuicao(async (req, empresaId) => {
  const ate = req.body?.ate ? dataSchema.parse(req.body.ate) : null;
  await distribuicao.pausarParticipante(empresaId, usuarioIdParamSchema.parse(req.params.usuarioId), ate, req.user.id);
});

const substituirParticipante = rotaDistribuicao(async (req, empresaId) => {
  const para = usuarioIdParamSchema.parse(req.body?.para_usuario_id);
  await distribuicao.substituirParticipante(empresaId, usuarioIdParamSchema.parse(req.params.usuarioId), para, req.user.id);
});

// "Distribuir agora" (incremental, igual à execução do Monitor) ou
// "Redistribuir hoje" (refaz o dia; `equilibrar` repassa parte das carteiras).
const distribuirHoje = rotaDistribuicao(async (req, empresaId) => {
  const redistribuir = Boolean(req.body?.redistribuir);
  const { resumo } = await distribuicao.distribuirDia(empresaId, {
    redistribuir,
    equilibrar: redistribuir && Boolean(req.body?.equilibrar),
    usuarioId: req.user.id,
  });
  return { resultado: resumo };
});

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
  getComunicacaoAutomatica,
  salvarComunicacaoAutomatica,
  getTiposPagamento,
  salvarTiposPagamento,
  getDistribuicao,
  getConfigDistribuicao,
  salvarConfigDistribuicao,
  adicionarParticipante,
  removerParticipante,
  pausarParticipante,
  substituirParticipante,
  distribuirHoje,
};
