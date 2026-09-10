const { z } = require('zod');
const service = require('./historicoCliente.service');

const empresaIdSchema = z.coerce.number().int().positive('Selecione uma empresa.');
const billIdSchema = z.coerce.number().int().positive('Parcela inválida.');
const installmentIdSchema = z.coerce.number().int().positive('Parcela inválida.');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function getHistorico(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const billId = billIdSchema.parse(req.params.billId);
    const installmentId = installmentIdSchema.parse(req.params.installmentId);

    const resultado = await service.getHistoricoParcela(empresaId, billId, installmentId);
    res.json(resultado);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

const registrarSchema = z.object({
  bill_id: z.coerce.number().int().positive('Parcela inválida.'),
  installment_id: z.coerce.number().int().positive('Parcela inválida.'),
  data_registro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
  descricao: z.string().trim().max(2000).optional(),
  // Opcional: só a Rotina do dia usa isso hoje, pra marcar o check de
  // "Ligação realizada" já registrando a observação de verdade da ligação
  // (ver rotinas.service.js). O formulário do Histórico de Etapas continua
  // sem seletor de canal — uma observação registrada por lá fica sem canal
  // (NULL), igual sempre foi.
  canal: z.enum(['whatsapp', 'email', 'ligacao']).optional(),
});

async function registrarObservacao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const data = registrarSchema.parse(req.body);
    const result = await service.registrarObservacao(empresaId, {
      billId: data.bill_id,
      installmentId: data.installment_id,
      dataRegistro: data.data_registro,
      descricao: data.descricao,
      canal: data.canal,
      usuarioId: req.user?.id,
      arquivos: req.files || [],
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

const anexoIdSchema = z.coerce.number().int().positive('Anexo inválido.');

async function downloadAnexo(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const anexoId = anexoIdSchema.parse(req.params.anexoId);
    const anexo = await service.getAnexo(empresaId, anexoId);
    if (!anexo) return next(badRequest('Anexo não encontrado.'));
    res.download(anexo.caminhoAbsoluto, anexo.nomeOriginal);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = { getHistorico, registrarObservacao, downloadAnexo };
