const { z } = require('zod');
const service = require('./demonstrativo.service');
const poc = require('./poc.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const dataSchema = (rotulo) => z.string({ required_error: `Informe a ${rotulo}.` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${rotulo} inválida.`);
const querySchema = z
  .object({
    de: dataSchema('data início'),
    ate: dataSchema('data fim'),
    // ?centro=1&centro=5 (ou centro[]=): vazio = todos os centros com "Realiza DRE".
    centro: z.preprocess((v) => (v === undefined ? [] : [].concat(v)), z.array(z.coerce.number().int().positive()).max(500)),
  })
  .refine((q) => q.de <= q.ate, { message: 'A data início não pode ser depois da data fim.' });

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

async function calcular(req, res, next) {
  try {
    const q = querySchema.parse({ ...req.query, centro: req.query.centro ?? req.query['centro[]'] });
    res.json(await service.calcular(empresaIdSchema.parse(req.params.empresaId), { de: q.de, ate: q.ate, centros: q.centro }));
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    return next(err);
  }
}

// Aba POC: o rastreio da POC por obra (mesmos filtros da DRE).
async function rastrearPoc(req, res, next) {
  try {
    const q = querySchema.parse({ ...req.query, centro: req.query.centro ?? req.query['centro[]'] });
    res.json(await poc.rastrear(empresaIdSchema.parse(req.params.empresaId), { de: q.de, ate: q.ate, centros: q.centro }));
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    return next(err);
  }
}

// Projetado SALVO (só versão) pra a DRE dos dashboards — esta rota é liberada pra quem lê o dashboard
// Econômico Financeiro; os rascunhos ficam só na tela DRE (dre-projecoes/projetado, fonte 'atual').
// ?de&ate&centro=…&versao=N (sem versão: a última salva).
async function projetadoVersao(req, res, next) {
  try {
    const q = querySchema.parse({ ...req.query, centro: req.query.centro ?? req.query['centro[]'] });
    const versao = req.query.versao ? z.coerce.number().int().positive().parse(req.query.versao) : null;
    // Lazy: dre-projecoes usa este módulo (o motor) — o require no topo seria circular.
    const projecoes = require('../dre-projecoes/dreProjecoes.service');
    res.json(
      await projecoes.projetado(empresaIdSchema.parse(req.params.empresaId), { fonte: 'versao', numero: versao, de: q.de, ate: q.ate, centros: q.centro })
    );
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    return next(err);
  }
}

module.exports = { calcular, rastrearPoc, projetadoVersao };
