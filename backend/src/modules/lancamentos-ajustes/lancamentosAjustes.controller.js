const { z } = require('zod');
const service = require('./lancamentosAjustes.service');
const c = require('../dre-versoes/carimbo');

// Carimbo (aba Versões): qual lançamento e a linha de rateio (centro × natureza × valor) antes e depois.
const ORIGEM = { R: 'Título a receber', P: 'Título a pagar', E: 'Movimento do extrato' };
function nomeLancamento(o) {
  const doc = [o.documento, o.numero].filter(Boolean).join(' ');
  return `${ORIGEM[o.origem] || o.origem} ${o.chave}${doc ? ` (${doc})` : ''}${o.contraparte ? ` — ${o.contraparte}` : ''}`;
}
const linhaTxt = (l) =>
  l ? `${l.centro_id} ${l.centro_nome || ''} × ${l.natureza_id} ${l.natureza_nome || ''} ${c.moeda(l.valor)}`.replace(/\s+/g, ' ').trim() : '(vazio)';

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const origemSchema = z.enum(['R', 'P', 'E'], {
  errorMap: () => ({ message: 'Origem inválida (R = a receber, P = a pagar, E = movimento).' }),
});
const chaveSchema = z.coerce.number().int().positive('Lançamento inválido.');
// Linha de rateio original na query string: `centro` e `natureza` — vazios = a linha sem aquele campo.
const centroOriginalSchema = z.preprocess(
  (v) => (v === undefined || v === '' ? null : v),
  z.coerce.number().int().positive('Centro inválido.').nullable()
);
const naturezaOriginalSchema = z.preprocess((v) => (v === undefined || v === '' ? null : String(v).trim()), z.string().max(20).nullable());

const ajusteSchema = z.object({
  centro_id: z.coerce.number({ invalid_type_error: 'Escolha o centro de custo.' }).int().positive('Escolha o centro de custo.'),
  natureza_id: z.coerce.string().trim().min(1, 'Escolha a natureza.').max(20),
  valor: z.coerce.number({ invalid_type_error: 'Valor inválido.' }).positive('O valor precisa ser maior que zero.').max(1e13),
  observacao: z.string().trim().max(1000).optional().default(''),
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

function linha(req) {
  return [
    empresaIdSchema.parse(req.params.empresaId),
    origemSchema.parse(req.params.origem),
    chaveSchema.parse(req.params.chave),
    centroOriginalSchema.parse(req.query.centro),
    naturezaOriginalSchema.parse(req.query.natureza),
  ];
}

async function obter(req, res, next) {
  try {
    res.json(await service.obter(...linha(req)));
  } catch (err) {
    tratar(err, next);
  }
}

async function salvar(req, res, next) {
  try {
    const args = linha(req);
    const antes = await service.obter(...args);
    const r = await service.salvar(...args, ajusteSchema.parse(req.body || {}), req.user.id);
    const depois = await service.obter(...args);
    await c.carimbar(req, {
      descricao: `Ajustou ${nomeLancamento(depois)} — linha ${linhaTxt(depois.linha)}: ${linhaTxt(antes.ajuste || antes.linha)} → ${linhaTxt(depois.ajuste)}.`,
      detalhes: { origem: args[1], chave: args[2], linha: depois.linha, antes: antes.ajuste, depois: depois.ajuste },
    });
    res.json(r);
  } catch (err) {
    tratar(err, next);
  }
}

async function restaurar(req, res, next) {
  try {
    const args = linha(req);
    const antes = await service.obter(...args);
    const r = await service.restaurar(...args, req.user.id);
    await c.carimbar(req, {
      descricao: `Desfez o ajuste de ${nomeLancamento(antes)} — a linha volta ao original do Sienge: ${linhaTxt(antes.ajuste)} → ${linhaTxt(antes.linha)}.`,
      detalhes: { origem: args[1], chave: args[2], linha: antes.linha, antes: antes.ajuste },
    });
    res.json(r);
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { obter, salvar, restaurar };
