const { z } = require('zod');
const service = require('./dfcMascaras.service');
const pool = require('../../config/db');
const { carimbar, mudancas, txt, rotulo, rotuloConta } = require('../dfc-versoes/carimbo');

// Versões da DFC: o carimbo de cada alteração (aba Versões › Máscaras). A máscara como estava antes, lida no public.
async function mascaraAntes(id) {
  const { rows } = await pool.base.query('SELECT * FROM dfc_mascaras WHERE id = $1', [id]);
  return rows[0] || null;
}
const ORIGENS = (l) => (l && l.length ? l.map((o) => rotulo('origemProjecao')(o)).join(', ') : '(nenhuma)');
const TIPOS = (l) => (l && l.length ? l.join(', ') : '(nenhum)');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const idSchema = z.coerce.number().int().positive('Máscara inválida.');

const descricaoSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome da máscara.')
  .max(150, 'Máximo de 150 caracteres.');

// `descricoes` (lista) em vez de uma só: colar várias linhas de uma vez no campo de criar
// (ver DfcMascarasTab.jsx) cria todas numa chamada, na ordem em que vieram.
const createSchema = z.object({
  parent_id: z.union([z.null(), z.coerce.number().int().positive()]).optional().default(null),
  descricoes: z.array(descricaoSchema).min(1, 'Informe o nome da máscara.').max(200),
});

// Campos parciais — ao menos um. O tipo de detalhamento (e a conta/origens do TIPO_PARCELA) é validado
// no service (só nível 2, conta analítica da empresa, conta em uma máscara só).
const updateSchema = z
  .object({
    descricao: descricaoSchema.optional(),
    tipo_detalhamento: z.enum(['PLANO_CONTAS', 'TIPO_PARCELA']).optional(),
    parcela_conta_sienge_id: z.union([z.null(), z.coerce.number().int().positive()]).optional(),
    parcela_origens: z.array(z.enum(service.ORIGENS_PARCELA)).max(3).optional(),
    parcela_tipos: z.array(z.string().trim().min(1).max(20)).max(100).optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined), 'Nada para alterar.');

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
    const pai = parentId ? await mascaraAntes(parentId) : null;
    await carimbar(req, {
      descricao: `Criou ${descricoes.length === 1 ? 'a máscara' : `${descricoes.length} máscaras`} ${descricoes.map((d) => `"${d}"`).join(', ')}${
        pai ? ` (nível 2, dentro de "${pai.descricao}")` : ' (nível 1)'
      }.`,
      detalhes: { ids: criadas.map((c) => c.id), parent_id: parentId },
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
    const antes = await mascaraAntes(id);
    const item = await service.update(id, empresaId, campos);
    if (!item) throw erro(404, 'Máscara não encontrada.');
    const partes = mudancas(antes, item, {
      descricao: ['Nome'],
      tipo_detalhamento: ['Detalhamento', rotulo('detalhamento')],
      parcela_origens: ['Tipo Projeção', ORIGENS],
      parcela_tipos: ['Tipos de parcela', TIPOS],
    });
    if (antes && String(antes.parcela_conta_sienge_id ?? '') !== String(item.parcela_conta_sienge_id ?? '')) {
      const conta = async (v) => (v ? rotuloConta(empresaId, v) : '(vazio)');
      partes.push(`Conta: ${await conta(antes.parcela_conta_sienge_id)} → ${await conta(item.parcela_conta_sienge_id)}`);
    }
    if (partes.length) {
      await carimbar(req, {
        descricao: `Máscara ${txt(antes?.descricao ?? item.descricao)}: ${partes.join('; ')}.`,
        detalhes: { id, antes, depois: item },
        chave: `mascara:${id}`,
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
    const antes = await mascaraAntes(id);
    const ok = await service.remove(id, empresaId);
    if (!ok) throw erro(404, 'Máscara não encontrada.');
    await carimbar(req, {
      descricao: `Excluiu a máscara ${txt(antes?.descricao)}${antes?.parent_id ? '' : ' (nível 1, com as de nível 2 dentro dela)'}.`,
      detalhes: { id, antes },
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
    const arvore = await service.reordenar(empresaId, estrutura);
    await carimbar(req, { descricao: 'Reordenou as máscaras (arrastar e soltar).', chave: 'mascaras:ordem' });
    res.json(arvore);
  } catch (err) {
    tratar(err, next);
  }
}

async function tiposParcela(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.tiposParcela(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, create, update, remove, reordenar, tiposParcela };
