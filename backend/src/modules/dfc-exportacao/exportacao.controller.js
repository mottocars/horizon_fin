const { z } = require('zod');
const excel = require('./exportacao.excel');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.');
const filtroSchema = z.object({
  inicio: mes,
  fim: mes,
  centros: z
    .string()
    .regex(/^(\d+(,\d+)*)?$/, 'Centros inválidos.')
    .optional()
    .default(''),
});

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// GET /:empresaId/excel?inicio=AAAA-MM&fim=AAAA-MM&centros=1,2 — o .xlsx do que está filtrado na aba DFC.
async function excelDfc(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const f = filtroSchema.parse(req.query);
    if (f.fim < f.inicio) throw erro(400, 'O mês final precisa ser igual ou depois do inicial.');
    const centros = f.centros ? f.centros.split(',').map(Number) : [];
    const { buffer, nome } = await excel.gerar(empresaId, { inicio: f.inicio, fim: f.fim, centros }, req.user.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="fluxo-de-caixa.xlsx"; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.end(buffer);
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    return next(err);
  }
}

module.exports = { excelDfc };
