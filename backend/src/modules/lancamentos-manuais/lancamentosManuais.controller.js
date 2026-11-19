const { z } = require('zod');
const service = require('./lancamentosManuais.service');
const c = require('../dre-versoes/carimbo');

// Carimbo (aba Versões) dos lançamentos criados à mão na aba Financeiro.
const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');
const resumoManual = (l) =>
  `"${l.historico}" (${l.tipo === 'ENTRADA' ? 'entrada' : 'saída'} de ${c.moeda(l.valor)} em ${dataBR(l.data)}, centro ${l.centro_id}, natureza ${l.natureza_id}${
    l.documento ? `, documento ${l.documento}` : ''
  })`;
const CAMPOS_MANUAL = {
  tipo: ['Tipo'],
  data: ['Data', dataBR],
  documento: ['Documento'],
  historico: ['Histórico'],
  centro_id: ['Centro'],
  natureza_id: ['Natureza'],
  valor: ['Valor', c.moeda],
};

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const idSchema = z.coerce.number().int().positive('Lançamento inválido.');

const lancamentoSchema = z.object({
  tipo: z.enum(['ENTRADA', 'SAIDA'], { errorMap: () => ({ message: 'Informe se é entrada ou saída.' }) }),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data.'),
  documento: z.string().trim().max(50).optional().default(''),
  historico: z.string().trim().min(1, 'Informe o histórico.').max(255, 'Histórico com no máximo 255 caracteres.'),
  centro_id: z.coerce.number({ invalid_type_error: 'Escolha o centro de custo.' }).int().positive('Escolha o centro de custo.'),
  natureza_id: z.coerce.string().trim().min(1, 'Escolha a natureza.').max(20),
  valor: z.coerce.number({ invalid_type_error: 'Valor inválido.' }).positive('O valor precisa ser maior que zero.').max(1e13),
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

async function opcoes(req, res, next) {
  try {
    res.json(await service.opcoes(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function obter(req, res, next) {
  try {
    res.json(await service.obter(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.id)));
  } catch (err) {
    tratar(err, next);
  }
}

async function criar(req, res, next) {
  try {
    const l = await service.criar(empresaIdSchema.parse(req.params.empresaId), lancamentoSchema.parse(req.body || {}), req.user.id);
    await c.carimbar(req, { descricao: `Criou o lançamento manual ${l.id}: ${resumoManual(l)}.`, detalhes: { id: l.id } });
    res.status(201).json(l);
  } catch (err) {
    tratar(err, next);
  }
}

async function alterar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const antes = await service.obter(empresaId, id);
    const l = await service.alterar(empresaId, id, lancamentoSchema.parse(req.body || {}), req.user.id);
    const partes = c.mudancas({ ...antes, valor: Number(antes.valor) }, { ...l, valor: Number(l.valor) }, CAMPOS_MANUAL);
    if (partes.length) await c.carimbar(req, { descricao: `Alterou o lançamento manual ${id} "${antes.historico}": ${partes.join('; ')}.`, detalhes: { id } });
    res.json(l);
  } catch (err) {
    tratar(err, next);
  }
}

async function excluir(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const antes = await service.obter(empresaId, id);
    const r = await service.excluir(empresaId, id, req.user.id);
    await c.carimbar(req, { descricao: `Excluiu o lançamento manual ${id}: ${resumoManual(antes)}.`, detalhes: { id } });
    res.json(r);
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { opcoes, obter, criar, alterar, excluir };
