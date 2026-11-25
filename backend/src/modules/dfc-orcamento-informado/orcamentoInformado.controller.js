const { z } = require('zod');
const service = require('./orcamentoInformado.service');
const { carimbar, rotuloCentro, rotuloConta, mesBR, moeda } = require('../dfc-versoes/carimbo');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const mesSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.');
const idSchema = (rotulo) => z.coerce.number().int().positive(`${rotulo} inválido.`);
const valorSchema = z.coerce
  .number({ invalid_type_error: 'Valor inválido.' })
  .finite('Valor inválido.')
  .refine((v) => Math.abs(v) < 1e15, 'Valor grande demais.')
  .transform((v) => Math.round(v * 100) / 100);

const salvarSchema = z.object({
  centro_id: idSchema('Centro de custo'),
  sienge_id: idSchema('Conta'),
  mes: mesSchema,
  valor: z.union([z.null(), valorSchema]),
});

const replicarSchema = z.object({
  centro_id: idSchema('Centro de custo'),
  sienge_id: idSchema('Conta'),
  de: mesSchema,
  ate: mesSchema,
  valor: valorSchema,
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

async function list(req, res, next) {
  try {
    res.json(await service.list(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function salvar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const dados = salvarSchema.parse(req.body);
    const r = await service.salvar(empresaId, dados, req.user.id);
    // Versões da DFC: o carimbo (aba Versões › Projeções) — um por centro × conta (os meses digitados em seguida juntam).
    await carimbar(req, {
      descricao: `HORIZON - INFORMADO: ${await rotuloCentro(empresaId, dados.centro_id)} · conta ${await rotuloConta(empresaId, dados.sienge_id)} — ${mesBR(
        dados.mes
      )} = ${dados.valor === null || dados.valor === 0 ? '(vazio)' : moeda(dados.valor)}.`,
      detalhes: dados,
      chave: `informado:${dados.centro_id}:${dados.sienge_id}:${dados.mes}`,
    });
    res.json(r);
  } catch (err) {
    tratar(err, next);
  }
}

async function replicar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const dados = replicarSchema.parse(req.body);
    const r = await service.replicar(empresaId, dados, req.user.id);
    await carimbar(req, {
      descricao: `HORIZON - INFORMADO: ${await rotuloCentro(empresaId, dados.centro_id)} · conta ${await rotuloConta(empresaId, dados.sienge_id)} — replicou ${moeda(
        dados.valor
      )} de ${mesBR(dados.de)} até ${mesBR(dados.ate)}.`,
      detalhes: dados,
    });
    res.json(r);
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, salvar, replicar };
