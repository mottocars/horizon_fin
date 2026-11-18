const { z } = require('zod');
const service = require('./reformaTributaria.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const centroIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');

const percentual = (rotulo) => z.coerce.number({ invalid_type_error: `${rotulo}: informe um número.` }).min(0, `${rotulo}: não pode ser negativo.`).max(100, `${rotulo}: no máximo 100%.`);
const valor = (rotulo) => z.coerce.number({ invalid_type_error: `${rotulo}: informe um número.` }).min(0, `${rotulo}: não pode ser negativo.`);
const opcional = (schema) => z.union([schema, z.null()]).optional().transform((v) => (v === undefined ? null : v));

const configSchema = z.object({
  aliquotas: z.record(
    z.string().regex(/^20\d{2}$/, 'Ano inválido.'),
    z.object({ cbs: percentual('CBS'), ibs: percentual('IBS') })
  ),
  reducao_imoveis: percentual('Redução dos imóveis'),
  redutor_residencial: valor('Redutor social da unidade residencial'),
  redutor_lote: valor('Redutor social do lote'),
  ret_ibs_cbs: percentual('RET — IBS/CBS'),
  ret_irpj_csll: percentual('RET — IRPJ/CSLL'),
});

const centroSchema = z.object({
  regime: z.enum(['RET', 'REGULAR'], { errorMap: () => ({ message: 'Escolha o regime da obra.' }) }),
  valor_terreno: opcional(valor('Valor do terreno')),
  unidades_residenciais: opcional(z.coerce.number().int('Unidades residenciais: número inteiro.').min(0)),
  lotes: opcional(z.coerce.number().int('Lotes: número inteiro.').min(0)),
  perc_custo_credito: opcional(percentual('Custo que gera crédito')),
  irpj_csll: opcional(percentual('IRPJ/CSLL')),
});

function tratar(err, next) {
  if (err.issues) {
    const e = new Error(err.issues[0].message);
    e.status = 400;
    e.expose = true;
    return next(e);
  }
  return next(err);
}

const rota = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req, empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
};

module.exports = {
  impacto: rota((req, empresaId) => {
    const centros = String(req.query.centros || '')
      .split(',')
      .filter(Boolean)
      .map((x) => centroIdSchema.parse(x));
    const ano = /^\d{4}$/.test(String(req.query.ano || '')) ? Number(req.query.ano) : null;
    return service.impacto(empresaId, { centros, ano });
  }),
  listarCentros: rota((req, empresaId) => service.listarCentros(empresaId)),
  salvarCentro: rota((req, empresaId) =>
    service.salvarCentro(empresaId, centroIdSchema.parse(req.params.centroId), centroSchema.parse(req.body || {}), req.user.id)
  ),
  limparCentro: rota((req, empresaId) => service.limparCentro(empresaId, centroIdSchema.parse(req.params.centroId))),
  obterConfiguracoes: rota((req, empresaId) => service.obterConfiguracoes(empresaId)),
  salvarConfiguracoes: rota((req, empresaId) => service.salvarConfiguracoes(empresaId, configSchema.parse(req.body || {}), req.user.id)),
  restaurarConfiguracoes: rota((req, empresaId) => service.restaurarConfiguracoes(empresaId)),
};
