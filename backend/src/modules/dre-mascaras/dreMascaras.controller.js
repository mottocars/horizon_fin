const { z } = require('zod');
const pool = require('../../config/db');
const service = require('./dreMascaras.service');
const c = require('../dre-versoes/carimbo');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const idSchema = z.coerce.number().int().positive('Máscara inválida.');

const descricaoSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome da máscara.')
  .max(150, 'Máximo de 150 caracteres.');

// `descricoes` (lista) em vez de uma só: colar várias linhas de uma vez no campo de criar
// (ver MascarasTab.jsx) cria todas numa chamada, na ordem em que vieram.
const createSchema = z.object({
  parent_id: z.union([z.null(), z.coerce.number().int().positive()]).optional().default(null),
  descricoes: z.array(descricaoSchema).min(1, 'Informe o nome da máscara.').max(200),
});

// Parcial: renomear manda só `descricao`; marcar/desmarcar manda só a marcação (tipo_poc, origem
// e calculo null limpam). Se o cálculo é da origem, quem confere é o service.
const updateSchema = z
  .object({
    descricao: descricaoSchema.optional(),
    totalizadora: z.boolean().optional(),
    realiza_poc: z.boolean().optional(),
    tipo_poc: z.enum(['RECEITA', 'DESPESA'], { errorMap: () => ({ message: 'Tipo POC inválido.' }) }).nullable().optional(),
    // '=' (IGUAL) fica de fora: é automático com totalizadora (ver service).
    icone: z
      .enum(['MAIS', 'MENOS', 'MAIS_MENOS'], { errorMap: () => ({ message: 'Ícone inválido.' }) })
      .nullable()
      .optional(),
    origem: z
      .enum(Object.keys(service.CALCULOS_POR_ORIGEM), { errorMap: () => ({ message: 'Origem inválida.' }) })
      .nullable()
      .optional(),
    calculo: z
      .enum(Object.values(service.CALCULOS_POR_ORIGEM).flat(), { errorMap: () => ({ message: 'Cálculo inválido.' }) })
      .nullable()
      .optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined), { message: 'Nada para alterar.' });

// A estrutura inteira, já na ordem final: nível 1 na ordem do array e, em `filhos`, os ids de
// nível 2 de cada um. Por construção não dá pra mandar 3 níveis.
const ordemSchema = z.object({
  estrutura: z.array(
    z.object({
      id: idSchema,
      filhos: z.array(idSchema).default([]),
    })
  ),
});

// Histórico do Imposto Fixo: mês de início 'AAAA-MM' e alíquota em % (0 a 100, até 4 casas).
const historicoSchema = z.object({
  inicio: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Informe o mês/ano de início.'),
  aliquota: z.coerce
    .number({ invalid_type_error: 'Informe a alíquota.' })
    .min(0, 'A alíquota não pode ser negativa.')
    .max(100, 'A alíquota vai até 100%.')
    .refine((v) => Math.abs(v * 10000 - Math.round(v * 10000)) < 1e-6, { message: 'A alíquota aceita até 4 casas decimais.' }),
});

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// ------------------------------------------------------------------ carimbo (aba Versões)
async function mascara(empresaId, id) {
  const { rows } = await pool.query(
    `SELECT m.id, m.parent_id, m.descricao, m.totalizadora, m.realiza_poc, m.tipo_poc, m.icone, m.origem, m.calculo, m.imposto_base,
            p.descricao AS pai
       FROM dre_mascaras m LEFT JOIN dre_mascaras p ON p.id = m.parent_id
      WHERE m.id = $1 AND m.empresa_id = $2`,
    [id, empresaId]
  );
  return rows[0] || null;
}
const nomeM = (m) => `"${m?.descricao ?? '?'}"`;
const CAMPOS_MASCARA = {
  totalizadora: ['Totaliza', c.sn],
  realiza_poc: ['% POC', c.sn],
  tipo_poc: ['Tipo POC', c.rotulo('tipoPoc')],
  icone: ['Ícone', c.rotulo('icone')],
  origem: ['Origem', c.rotulo('origem')],
  calculo: ['Cálculo', c.rotulo('calculo')],
};
async function historicoPorId(id) {
  const { rows } = await pool.query(
    "SELECT to_char(inicio, 'YYYY-MM') AS inicio, aliquota::float AS aliquota FROM dre_mascaras_imposto_historico WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}
const pctBR = (v) => `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;

function tratar(err, next) {
  if (err.issues) return next(erro(400, err.issues[0].message));
  return next(err);
}

async function list(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.list(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

async function create(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { parent_id: parentId, descricoes } = createSchema.parse(req.body);
    const criadas = await service.create(empresaId, { parentId, descricoes });
    const pai = parentId ? await mascara(empresaId, parentId) : null;
    await c.carimbar(req, {
      descricao: `Criou ${criadas.length > 1 ? 'as máscaras' : 'a máscara'} ${criadas.map(nomeM).join(', ')} ${
        pai ? `(nível 2, dentro de ${nomeM(pai)})` : '(nível 1)'
      }.`,
      detalhes: { criadas: criadas.map((m) => ({ id: m.id, descricao: m.descricao })), parent_id: parentId },
    });
    res.status(201).json(criadas);
  } catch (err) {
    tratar(err, next);
  }
}

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const campos = updateSchema.parse(req.body);
    const antes = await mascara(empresaId, id);
    const item = await service.update(id, empresaId, campos);
    if (!item) throw erro(404, 'Máscara não encontrada.');
    const partes = c.mudancas(antes, item, CAMPOS_MASCARA);
    const renomeou = antes && antes.descricao !== item.descricao;
    if (renomeou || partes.length) {
      const inicio = renomeou ? `Renomeou a máscara ${nomeM(antes)} para ${nomeM(item)}` : `Alterou a máscara ${nomeM(item)}`;
      await c.carimbar(req, {
        descricao: partes.length ? `${inicio}${renomeou ? ' e alterou' : ''}: ${partes.join('; ')}.` : `${inicio}.`,
        detalhes: { id, antes, depois: item },
      });
    }
    res.json(item);
  } catch (err) {
    tratar(err, next);
  }
}

async function remove(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const antes = await mascara(empresaId, id);
    const { rows: filhas } = await pool.query('SELECT descricao FROM dre_mascaras WHERE parent_id = $1 ORDER BY ordem', [id]);
    const ok = await service.remove(id, empresaId);
    if (!ok) throw erro(404, 'Máscara não encontrada.');
    await c.carimbar(req, {
      descricao: `Excluiu a máscara ${nomeM(antes)}${antes?.pai ? ` (de ${c.txt(antes.pai)})` : ''}${
        filhas.length ? ` e as de nível 2 dentro dela: ${filhas.map(nomeM).join(', ')}` : ''
      }.`,
      detalhes: { antes, filhas: filhas.map((x) => x.descricao) },
    });
    res.json({ ok: true });
  } catch (err) {
    tratar(err, next);
  }
}

async function reordenar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { estrutura } = ordemSchema.parse(req.body);
    const antes = await service.list(empresaId);
    const depois = await service.reordenar(empresaId, estrutura);
    // O que mudou de grupo e a ordem nova do nível 1 / dos grupos que só mudaram de ordem.
    const ondeAntes = new Map();
    antes.forEach((r) => {
      ondeAntes.set(r.id, { pai: null });
      r.filhos.forEach((x) => ondeAntes.set(x.id, { pai: r.id, paiNome: r.descricao }));
    });
    const ids = (lista) => lista.map((r) => r.id).join(',');
    const partes = [];
    if (ids(antes) !== ids(depois)) partes.push(`nível 1 na ordem ${depois.map(nomeM).join(', ')}`);
    depois.forEach((r) => {
      r.filhos.forEach((x) => {
        const a = ondeAntes.get(x.id);
        if (a && a.pai !== r.id) partes.push(`${nomeM(x)} passou ${a.pai ? `de ${c.txt(a.paiNome)}` : 'do nível 1'} para ${nomeM(r)}`);
      });
      const r0 = antes.find((x) => x.id === r.id);
      const mesmas = r0 && r0.filhos.length === r.filhos.length && r0.filhos.every((x) => r.filhos.some((y) => y.id === x.id));
      if (mesmas && ids(r0.filhos) !== ids(r.filhos)) partes.push(`dentro de ${nomeM(r)}: ${r.filhos.map(nomeM).join(', ')}`);
    });
    if (partes.length) await c.carimbar(req, { descricao: `Reordenou as máscaras — ${partes.join('; ')}.` });
    res.json(depois);
  } catch (err) {
    tratar(err, next);
  }
}

async function listHistorico(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const historico = await service.listHistorico(empresaId, id);
    if (!historico) throw erro(404, 'Máscara não encontrada.');
    res.json(historico);
  } catch (err) {
    tratar(err, next);
  }
}

async function createHistorico(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const campos = historicoSchema.parse(req.body);
    const historico = await service.createHistorico(empresaId, id, campos);
    if (!historico) throw erro(404, 'Máscara não encontrada.');
    const m = await mascara(empresaId, id);
    await c.carimbar(req, {
      descricao: `Imposto ${nomeM(m)}: nova alíquota de ${pctBR(campos.aliquota)} a partir de ${c.mesBR(campos.inicio)}.`,
      detalhes: { mascara_id: id, ...campos },
    });
    res.status(201).json(historico);
  } catch (err) {
    tratar(err, next);
  }
}

async function removeHistorico(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const historicoId = z.coerce.number().int().positive('Histórico inválido.').parse(req.params.historicoId);
    const antes = await historicoPorId(historicoId);
    const historico = await service.removeHistorico(empresaId, id, historicoId);
    if (!historico) throw erro(404, 'Histórico não encontrado.');
    const m = await mascara(empresaId, id);
    await c.carimbar(req, {
      descricao: `Imposto ${nomeM(m)}: excluiu a alíquota de ${antes ? pctBR(antes.aliquota) : '?'} a partir de ${c.mesBR(antes?.inicio)}.`,
      detalhes: { mascara_id: id, antes },
    });
    res.json(historico);
  } catch (err) {
    tratar(err, next);
  }
}

// Base do Imposto Fixo: quais linhas de nível 2 acima dele entram (GET mostra as opções; PUT grava).
const baseSchema = z.object({
  mascaraIds: z.array(z.coerce.number().int().positive()).min(1, 'Marque ao menos uma linha para a base do imposto.'),
});

async function getImpostoBase(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const base = await service.getImpostoBase(empresaId, id);
    if (!base) throw erro(404, 'Máscara não encontrada.');
    res.json(base);
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    return next(err);
  }
}

async function setImpostoBase(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = idSchema.parse(req.params.id);
    const { mascaraIds } = baseSchema.parse(req.body);
    const antes = await service.getImpostoBase(empresaId, id);
    const base = await service.setImpostoBase(empresaId, id, mascaraIds);
    if (!base) throw erro(404, 'Máscara não encontrada.');
    const naBase = (b) => new Set((b?.opcoes || []).filter((o) => o.na_base).map((o) => o.id));
    const a = naBase(antes);
    const d = naBase(base);
    const nome = (oid) => nomeM(base.opcoes.find((o) => o.id === oid));
    const entraram = [...d].filter((x) => !a.has(x)).map(nome);
    const sairam = [...a].filter((x) => !d.has(x)).map(nome);
    if (entraram.length || sairam.length) {
      const m = await mascara(empresaId, id);
      const partes = [entraram.length ? `entrou ${entraram.join(', ')}` : '', sairam.length ? `saiu ${sairam.join(', ')}` : ''].filter(Boolean);
      await c.carimbar(req, {
        descricao: `Base do imposto ${nomeM(m)}: ${partes.join('; ')}${base.todas ? ' (agora todas as linhas acima)' : ''}.`,
        detalhes: { mascara_id: id, antes: [...a], depois: [...d] },
      });
    }
    res.json(base);
  } catch (err) {
    if (err.issues) return next(erro(400, err.issues[0].message));
    return next(err);
  }
}

module.exports = { list, create, update, remove, reordenar, listHistorico, createHistorico, removeHistorico, getImpostoBase, setImpostoBase };
