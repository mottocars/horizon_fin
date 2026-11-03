const { z } = require('zod');
const excel = require('./exportacao.excel');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const data = (rotulo) => z.string({ required_error: `Informe a ${rotulo}.` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${rotulo} inválida.`);
const filtroSchema = z
  .object({
    de: data('data início'),
    ate: data('data fim'),
    centros: z
      .string()
      .regex(/^(\d+(,\d+)*)?$/, 'Centros inválidos.')
      .optional()
      .default(''),
  })
  .refine((q) => q.de <= q.ate, { message: 'A data início não pode ser depois da data fim.' });

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// GET /:empresaId/excel?de=AAAA-MM-DD&ate=AAAA-MM-DD&centros=1,2 — o .xlsx de auditoria da DRE do que
// está filtrado na aba DRE (sem centros = todos com "Realiza DRE").
async function excelDre(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const f = filtroSchema.parse(req.query);
    const centros = f.centros ? f.centros.split(',').map(Number) : [];
    const { buffer, nome } = await excel.gerar(empresaId, { de: f.de, ate: f.ate, centros }, req.user.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="dre-auditoria.xlsx"; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.end(buffer);
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    return next(err);
  }
}

module.exports = { excelDre };
