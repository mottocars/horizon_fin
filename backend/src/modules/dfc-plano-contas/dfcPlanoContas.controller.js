const { z } = require('zod');
const service = require('./dfcPlanoContas.service');

// Opções fixas da "Origem Projeção" (pedido do usuário) — mesma lista do CHECK da tabela e de
// frontend/src/pages/Operacoes/DfcConstrutoras/DfcPlanoContasTab.jsx (ORIGENS_PROJECAO).
const ORIGENS = [
  'CEF_NOVO_REGISTRO',
  'CEF_MEDICAO',
  'CEF_CREDITO_PJ',
  'CEF_JUROS',
  'CEF_AMORTIZACAO',
  'SIENGE_ORCAMENTO_EMPRESARIAL',
  'SIENGE_AGING',
  'HORIZON_ORCAMENTO_INFORMADO',
];

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Conta inválida.');
const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

// Os dois campos sempre juntos (a linha inteira vem do estado da tela).
const updateSchema = z.object({
  mascara_id: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable()),
  origem_projecao: z.preprocess(
    emptyToNull,
    z.enum(ORIGENS, { errorMap: () => ({ message: 'Origem da projeção inválida.' }) }).nullable()
  ),
  // true = a origem CEF já estava em outra conta e o usuário confirmou transferir pra esta.
  transferir: z.boolean().optional().default(false),
});

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// `centro` (query ou corpo): versão própria do centro de custo; sem ele, o plano Global.
const centroSchema = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? null : v),
  z.coerce.number().int().positive('Centro de custo inválido.').nullable()
);

function tratar(err, next) {
  if (err.issues) return next(erro(400, err.issues[0].message));
  return next(err);
}

async function list(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.list(empresaId, centroSchema.parse(req.query.centro)));
  } catch (err) {
    tratar(err, next);
  }
}

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const { transferir, ...dados } = updateSchema.parse(req.body);
    const centroId = centroSchema.parse(req.body?.centro);
    res.json(await service.update(empresaId, siengeId, dados, { transferir, centroId }));
  } catch (err) {
    // Origem CEF em uso em outra conta: devolve qual é, pra tela perguntar se transfere.
    if (err.codigo === 'ORIGEM_CEF_EM_USO') {
      return res.status(409).json({ message: err.message, codigo: err.codigo, conta: err.conta });
    }
    tratar(err, next);
  }
}

async function listVersoes(req, res, next) {
  try {
    res.json(await service.listVersoes(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function criarVersao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const centroId = z.coerce.number().int().positive('Escolha o centro de custo.').parse(req.body?.centro_id);
    res.status(201).json(await service.criarVersao(empresaId, centroId, req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function excluirVersao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const centroId = z.coerce.number().int().positive('Centro de custo inválido.').parse(req.params.centroId);
    res.json(await service.excluirVersao(empresaId, centroId));
  } catch (err) {
    tratar(err, next);
  }
}

async function listTodas(req, res, next) {
  try {
    res.json(await service.listTodas(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function resumo(req, res, next) {
  try {
    res.json(await service.resumo(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, update, listVersoes, criarVersao, excluirVersao, listTodas, resumo };
