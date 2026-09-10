const { z } = require('zod');
const service = require('./rotinas.service');

const empresaIdSchema = z.coerce.number().int().positive('Selecione uma empresa.');
const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const billIdSchema = z.coerce.number().int().positive('Parcela inválida.');
const installmentIdSchema = z.coerce.number().int().positive('Parcela inválida.');
const usuarioIdSchema = z.coerce.number().int().positive('Usuário inválido.').optional();

// Mesmo preprocess de gestaoParcelas.controller.js::costCenterIdsSchema —
// aceita `?cost_center_ids=1,2,3` ou repetido.
const costCenterIdsSchema = z.preprocess((val) => {
  if (val === undefined || val === '') return [];
  const bruto = Array.isArray(val) ? val : String(val).split(',');
  return bruto.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
}, z.array(z.number().int().positive()));

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function listRotinas(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const dataInicio = dataSchema.parse(req.query.data_inicio);
    const dataFim = dataSchema.parse(req.query.data_fim);
    if (dataFim < dataInicio) throw badRequest('A data final não pode ser anterior à data inicial.');
    const costCenterIds = costCenterIdsSchema.parse(req.query.cost_center_ids);
    const usuarioIdFiltro = usuarioIdSchema.parse(req.query.usuario_id);

    const usuarioAlvoId = await service.resolverUsuarioAlvo(empresaId, req.user.id, usuarioIdFiltro);
    const centros = await service.listRotinas(empresaId, usuarioAlvoId, { dataInicio, dataFim, costCenterIds });
    res.json({ centros, usuario_id: usuarioAlvoId });
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

// Marcar o check não passa por aqui — abre o mesmo formulário de
// "Registrar observação" do Histórico de Etapas (POST
// /regua-cobranca-historico/registros, com o canal certo), porque marcar
// sem pedir a observação de verdade não bastava (ver
// RegistrarComunicacaoModal.jsx). Só sobra desmarcar aqui — pra Ligação
// sempre, e pra WhatsApp/E-mail também quando "Ativar Comunicação
// Automática" está desligada (ver reguaCobranca.service.js::
// getComunicacaoAutomatica).
const canalSchema = z.enum(['whatsapp', 'email', 'ligacao'], {
  errorMap: () => ({ message: 'Canal inválido.' }),
});

const desmarcarCanalSchema = z.object({
  bill_id: billIdSchema,
  installment_id: installmentIdSchema,
  data: dataSchema,
  canal: canalSchema,
});

async function desmarcarCanal(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.query.empresa_id);
    const dados = desmarcarCanalSchema.parse(req.query);
    await service.desmarcarCanal(empresaId, {
      billId: dados.bill_id,
      installmentId: dados.installment_id,
      data: dados.data,
      canal: dados.canal,
    });
    res.json({ realizado: false });
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = { listRotinas, desmarcarCanal };
