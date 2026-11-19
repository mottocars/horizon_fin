const { z } = require('zod');
const pool = require('../../config/db');
const service = require('./orcamento.service');
const c = require('../dre-versoes/carimbo');

// Carimbo (aba Versões): o orçamento da obra de um mês de início, categoria a categoria.
async function nomesCategorias(empresaId) {
  const { rows } = await pool.query('SELECT id, nome FROM dre_categorias_orcamento WHERE empresa_id = $1', [empresaId]);
  return new Map(rows.map((r) => [Number(r.id), r.nome]));
}
const doMes = (lista, data) => lista.find((o) => o.data_inicio.slice(0, 7) === String(data).slice(0, 7))?.valores || null;
const total = (valores) => Object.values(valores || {}).reduce((s, v) => s + Number(v || 0), 0);

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');

// Aceita 'YYYY-MM-DD' (o <input type="date"> manda isso) e 'YYYY-MM' (o <input type="month">
// manda isso) — o serviço normaliza pro dia 1 de qualquer um dos dois.
const dataInicioSchema = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Data de início inválida.');

const salvarSchema = z.object({
  data_inicio: dataInicioSchema,
  itens: z
    .array(
      z.object({
        categoria_id: z.coerce.number().int().positive(),
        valor: z.coerce.number().finite('Valor inválido.'),
      })
    )
    .min(1, 'Informe ao menos uma categoria.'),
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
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    res.json(await service.listPorCentroCusto(empresaId, siengeId));
  } catch (err) {
    tratar(err, next);
  }
}

async function vigentes(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.listVigentesPorEmpresa(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

async function salvar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const { data_inicio, itens } = salvarSchema.parse(req.body);
    const antes = doMes(await service.listPorCentroCusto(empresaId, siengeId), data_inicio);
    await service.salvar(empresaId, siengeId, data_inicio, itens);
    const lista = await service.listPorCentroCusto(empresaId, siengeId);
    const depois = doMes(lista, data_inicio);
    const nomes = await nomesCategorias(empresaId);
    const rot = await c.rotuloCentro(empresaId, siengeId);
    if (!antes) {
      await c.carimbar(req, {
        descricao: `Criou o orçamento de ${rot} a partir de ${c.mesBR(data_inicio)}: total ${c.moeda(total(depois))}.`,
        detalhes: { centro_id: siengeId, data_inicio, depois },
      });
    } else {
      const partes = Object.keys(depois || {})
        .filter((k) => Number(antes[k] ?? 0) !== Number(depois[k] ?? 0))
        .map((k) => `${nomes.get(Number(k)) || `categoria ${k}`} ${c.moeda(antes[k] ?? 0)} → ${c.moeda(depois[k])}`);
      if (partes.length) {
        await c.carimbar(req, {
          descricao: `Orçamento de ${rot} a partir de ${c.mesBR(data_inicio)}: ${partes.join('; ')}.`,
          detalhes: { centro_id: siengeId, data_inicio, antes, depois },
          chave: `orcamento:${siengeId}:${String(data_inicio).slice(0, 7)}`,
        });
      }
    }
    res.json(lista);
  } catch (err) {
    tratar(err, next);
  }
}

async function remover(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const dataInicio = dataInicioSchema.parse(req.params.dataInicio);
    const antes = doMes(await service.listPorCentroCusto(empresaId, siengeId), dataInicio);
    const ok = await service.remover(empresaId, siengeId, dataInicio);
    if (!ok) throw erro(404, 'Orçamento não encontrado.');
    await c.carimbar(req, {
      descricao: `Excluiu o orçamento de ${await c.rotuloCentro(empresaId, siengeId)} a partir de ${c.mesBR(dataInicio)} (total ${c.moeda(total(antes))}).`,
      detalhes: { centro_id: siengeId, data_inicio: dataInicio, antes },
    });
    res.json({ ok: true });
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, vigentes, salvar, remover };
