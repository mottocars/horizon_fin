const { z } = require('zod');
const service = require('./dreCentros.service');
const agrupadores = require('../dre-agrupadores/agrupadores.service');
const c = require('../dre-versoes/carimbo');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');

const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

// Corpo parcial: só o que vier muda. `natureza` = o Tipo (Obra / Administrativo) — a MESMA coluna do
// cadastro que a aba Centros Custos da DFC grava (centros_custo_sienge.natureza): mudar aqui muda lá.
const updateSchema = z.object({
  realiza_dre: z.boolean({ invalid_type_error: 'Realiza DRE inválido.' }).optional(),
  natureza: z
    .preprocess(
      emptyToNull,
      z.enum(['OBRA', 'ADMINISTRATIVO'], { errorMap: () => ({ message: 'Escolha Obra ou Administrativo.' }) }).nullable()
    )
    .optional(),
});

const ordemSchema = z.object({
  ordem: z.array(z.coerce.number().int().positive('Centro de custo inválido.')).max(2000),
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

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const corpo = req.body || {};
    const dados = updateSchema.parse(corpo);
    const patch = {};
    if (dados.realiza_dre !== undefined) patch.realiza_dre = dados.realiza_dre;
    if ('natureza' in corpo) patch.natureza = dados.natureza ?? null;
    if (!Object.keys(patch).length) throw erro(400, 'Nada para alterar.');
    const antes = (await service.list(empresaId)).find((x) => Number(x.sienge_id) === siengeId);
    // Centro dentro de agrupador: o Realiza DRE é o do agrupador (decisão do usuário).
    if (antes?.agrupador_id && 'realiza_dre' in patch && Boolean(patch.realiza_dre) !== Boolean(antes.realiza_dre)) {
      throw erro(400, 'Este centro está num agrupador: o Realiza DRE é o do agrupador.');
    }
    const item = await service.update(empresaId, siengeId, patch);
    if (!item) throw erro(404, 'Centro de custo não encontrado.');
    // Carimbo (aba Versões): um por campo — a natureza marca `campo` pra excluir a versão saber o que voltar.
    const rot = `${siengeId} - ${(item.apelido || '').trim() || item.name}`;
    if (antes && 'realiza_dre' in patch && Boolean(antes.realiza_dre) !== Boolean(item.realiza_dre)) {
      await c.carimbar(req, {
        descricao: `${rot}: Realiza DRE ${c.sn(antes.realiza_dre)} → ${c.sn(item.realiza_dre)}.`,
        detalhes: { centro_id: siengeId, campo: 'realiza_dre', antes: antes.realiza_dre, depois: item.realiza_dre },
      });
    }
    if (antes && 'natureza' in patch && (antes.natureza || null) !== (item.natureza || null)) {
      const tipo = c.rotulo('natureza');
      await c.carimbar(req, {
        descricao: `${rot}: Tipo ${tipo(antes.natureza)} → ${tipo(item.natureza)} (o Tipo é o mesmo da DFC).`,
        detalhes: { centro_id: siengeId, campo: 'natureza', antes: antes.natureza, depois: item.natureza },
      });
    }
    res.json(item);
  } catch (err) {
    tratar(err, next);
  }
}

async function reordenar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { ordem } = ordemSchema.parse(req.body || {});
    const antes = (await service.list(empresaId)).filter((x) => x.realiza_dre).map((x) => Number(x.sienge_id));
    const depois = await service.reordenar(empresaId, ordem);
    const naDre = depois.filter((x) => x.realiza_dre);
    if (antes.join(',') !== naDre.map((x) => Number(x.sienge_id)).join(',')) {
      await c.carimbar(req, {
        descricao: `Reordenou os centros de custo: ${naDre.map((x) => `${x.sienge_id} - ${(x.apelido || '').trim() || x.name}`).join(', ')}.`,
        detalhes: { antes, depois: naDre.map((x) => Number(x.sienge_id)) },
      });
    }
    res.json(depois);
  } catch (err) {
    tratar(err, next);
  }
}

// ------------------------------------------------------------------------------------- agrupadores
// (dre-agrupadores/agrupadores.service.js: um agrupador junta centros numa obra só na DRE.)

const agrupadorIdSchema = z.coerce.number().int().positive('Agrupador inválido.');
const agrupadorSchema = z.object({
  nome: z.string({ invalid_type_error: 'Nome inválido.' }).optional(),
  realiza_dre: z.boolean({ invalid_type_error: 'Realiza DRE inválido.' }).optional(),
});
const nuloSeVazio = (v) => (v === '' || v === undefined ? null : v);
const moverSchema = z.object({
  agrupador_id: z.preprocess(nuloSeVazio, z.coerce.number().int().positive('Agrupador inválido.').nullable()),
  projecao_fica: z.preprocess(nuloSeVazio, z.coerce.number().int().positive('Centro inválido.').nullable()).optional(),
});

const rotuloCentro = (x) => `${x.id ?? x.sienge_id} - ${(x.apelido || '').trim() || x.nome || x.name}`;

async function nomesDosCentros(empresaId, ids) {
  if (!ids || !ids.length) return '';
  const lista = await service.list(empresaId);
  return ids
    .map((id) => lista.find((x) => Number(x.sienge_id) === Number(id)))
    .filter(Boolean)
    .map(rotuloCentro)
    .join(', ');
}

// As unidades da DRE (agrupadores e centros fora de agrupador, com Realiza DRE), na ordem — os filtros de centro.
async function unidades(req, res, next) {
  try {
    res.json(await agrupadores.unidades(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function listAgrupadores(req, res, next) {
  try {
    res.json(await agrupadores.listarAgrupadores(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function criarAgrupador(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { nome } = agrupadorSchema.parse(req.body || {});
    const g = await agrupadores.criar(empresaId, { nome });
    await c.carimbar(req, { descricao: `Criou o agrupador "${g.nome}".`, detalhes: { agrupador_id: g.id, nome: g.nome } });
    res.status(201).json(g);
  } catch (err) {
    tratar(err, next);
  }
}

async function atualizarAgrupador(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = agrupadorIdSchema.parse(req.params.agrupadorId);
    const patch = agrupadorSchema.parse(req.body || {});
    if (patch.nome === undefined && patch.realiza_dre === undefined) throw erro(400, 'Nada para alterar.');
    const { antes, depois } = await agrupadores.atualizar(empresaId, id, patch);
    if (patch.nome !== undefined && antes.nome !== depois.nome) {
      await c.carimbar(req, {
        descricao: `Renomeou o agrupador "${antes.nome}" para "${depois.nome}".`,
        detalhes: { agrupador_id: id, antes: antes.nome, depois: depois.nome },
      });
    }
    if (patch.realiza_dre !== undefined && Boolean(antes.realiza_dre) !== Boolean(depois.realiza_dre)) {
      const nomes = await nomesDosCentros(empresaId, depois.centros);
      await c.carimbar(req, {
        descricao: `Agrupador "${depois.nome}": Realiza DRE ${c.sn(antes.realiza_dre)} → ${c.sn(depois.realiza_dre)}${nomes ? ` (vale para ${nomes})` : ''}.`,
        detalhes: { agrupador_id: id, campo: 'realiza_dre', antes: antes.realiza_dre, depois: depois.realiza_dre, centros: depois.centros },
      });
    }
    res.json(depois);
  } catch (err) {
    tratar(err, next);
  }
}

async function excluirAgrupador(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const id = agrupadorIdSchema.parse(req.params.agrupadorId);
    const g = await agrupadores.excluir(empresaId, id);
    const nomes = await nomesDosCentros(empresaId, g.centros);
    await c.carimbar(req, {
      descricao: `Excluiu o agrupador "${g.nome}"${
        nomes ? ` (${nomes} ${g.centros.length === 1 ? 'voltou a ser centro' : 'voltaram a ser centros'} fora de agrupador)` : ''
      }.`,
      detalhes: { agrupador_id: id, nome: g.nome, centros: g.centros },
    });
    res.json({ ok: true });
  } catch (err) {
    tratar(err, next);
  }
}

// Põe o centro num agrupador (ou tira, com agrupador_id null). 409 com `escolher_projecao` quando o centro e o
// agrupador têm projeção — a tela pergunta qual fica e manda de novo com `projecao_fica`. Devolve os centros e
// os agrupadores atualizados.
async function moverCentro(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const { agrupador_id: agrupadorId, projecao_fica: projecaoFica } = moverSchema.parse(req.body || {});
    const antes = (await service.list(empresaId)).find((x) => Number(x.sienge_id) === siengeId);
    let r;
    try {
      r = await agrupadores.mover(empresaId, siengeId, agrupadorId, { projecaoFica });
    } catch (e) {
      if (e.status === 409 && e.dados) return res.status(409).json({ message: e.message, ...e.dados });
      throw e;
    }
    const centros = await service.list(empresaId);
    if (r.de || r.para) {
      const rot = rotuloCentro(r.centro);
      const partes = [];
      if (r.de && r.para) partes.push(`${rot} passou do agrupador "${r.de.nome}" para "${r.para.nome}"`);
      else if (r.para) partes.push(`${rot} entrou no agrupador "${r.para.nome}"`);
      else partes.push(`${rot} saiu do agrupador "${r.de.nome}"`);
      const depois = centros.find((x) => Number(x.sienge_id) === siengeId);
      if (antes && depois && Boolean(antes.realiza_dre) !== Boolean(depois.realiza_dre)) {
        partes.push(`Realiza DRE ${c.sn(antes.realiza_dre)} → ${c.sn(depois.realiza_dre)} (o do agrupador)`);
      }
      if (r.projecao_descartada) partes.push(`a projeção de ${r.projecao_descartada.centro} foi descartada (ficou a outra)`);
      if (r.projecao_movida) partes.push('a projeção do agrupador passou para o novo centro principal');
      await c.carimbar(req, {
        descricao: `${partes.join('; ')}.`,
        detalhes: { centro_id: siengeId, campo: 'agrupador', antes: r.de ? r.de.id : null, depois: r.para ? r.para.id : null },
      });
    }
    res.json({ centros, agrupadores: await agrupadores.listarAgrupadores(empresaId) });
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = {
  list,
  update,
  reordenar,
  unidades,
  listAgrupadores,
  criarAgrupador,
  atualizarAgrupador,
  excluirAgrupador,
  moverCentro,
};
