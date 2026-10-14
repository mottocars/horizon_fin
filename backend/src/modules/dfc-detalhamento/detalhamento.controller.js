const { z } = require('zod');
const service = require('./detalhamento.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
// `natureza`: conta do plano ou "sem" (lançamento sem natureza — só no Realizado). `centros`: os
// centros que somam na célula, separados por vírgula; "sem" = lançamento sem centro de custo.
const filtroSchema = z.object({
  tipo: z.enum(['R', 'P'], { message: 'Tipo inválido.' }),
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.'),
  lado: z.enum(['E', 'S'], { message: 'Lado inválido.' }),
  natureza: z.union([z.literal('sem'), z.coerce.number().int().positive()], { message: 'Conta inválida.' }),
  centros: z.string().regex(/^(\d+|sem)(,(\d+|sem))*$/, 'Centros inválidos.'),
});

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// GET /:empresaId?tipo=R|P&mes=AAAA-MM&lado=E|S&natureza=<conta|sem>&centros=1,2,sem
async function detalhar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const f = filtroSchema.parse(req.query);
    const lista = f.centros.split(',');
    res.json(
      await service.detalhar(empresaId, {
        tipo: f.tipo,
        mes: f.mes,
        lado: f.lado,
        natureza: f.natureza === 'sem' ? null : f.natureza,
        centros: lista.filter((c) => c !== 'sem').map(Number),
        semCentro: lista.includes('sem'),
      })
    );
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    return next(err);
  }
}

module.exports = { detalhar };
