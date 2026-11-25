const { z } = require('zod');
const service = require('./dfcPlanoContas.service');
const excel = require('./dfcPlanoContas.excel');
const pool = require('../../config/db');
const { carimbar, mudancas, sn, rotulo, rotuloConta, rotuloCentro, nomeMascara } = require('../dfc-versoes/carimbo');

// Versões da DFC: a classificação da conta antes da alteração (Global ou do plano próprio do centro), no public.
async function classificacaoAntes(empresaId, siengeId, centroId) {
  const { rows } = centroId
    ? await pool.base.query(
        'SELECT mascara_id, origem_projecao, projeta_dfc FROM dfc_plano_contas_centro WHERE empresa_id = $1 AND centro_id = $2 AND sienge_id = $3',
        [empresaId, centroId, siengeId]
      )
    : await pool.base.query('SELECT mascara_id, origem_projecao, projeta_dfc FROM dfc_plano_contas WHERE empresa_id = $1 AND sienge_id = $2', [
        empresaId,
        siengeId,
      ]);
  return rows[0] || { mascara_id: null, origem_projecao: null, projeta_dfc: true };
}

// Opções fixas da "Origem Projeção" (pedido do usuário) — mesma lista do CHECK da tabela e de
// frontend/src/pages/Operacoes/DfcConstrutoras/DfcPlanoContasTab.jsx (ORIGENS_PROJECAO).
const ORIGENS = [
  'CEF_NOVO_REGISTRO',
  'CEF_MEDICAO',
  'CEF_CREDITO_PJ',
  'CEF_JUROS',
  'CEF_AMORTIZACAO',
  'SIENGE_ORCAMENTO_EMPRESARIAL',
  'SIENGE_AGING',
  'HORIZON_ORCAMENTO_INFORMADO',
];

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Conta inválida.');
const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

// Os campos sempre juntos (a linha inteira vem do estado da tela).
const updateSchema = z.object({
  mascara_id: z.preprocess(emptyToNull, z.coerce.number().int().positive().nullable()),
  origem_projecao: z.preprocess(
    emptyToNull,
    z.enum(ORIGENS, { errorMap: () => ({ message: 'Origem da projeção inválida.' }) }).nullable()
  ),
  // "Projeta DFC": desmarcada, a conta some do Orçamento dos centros que usam o plano.
  projeta_dfc: z.boolean().optional().default(true),
  // true = a origem CEF já estava em outra conta e o usuário confirmou transferir pra esta.
  transferir: z.boolean().optional().default(false),
});

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// `centro` (query ou corpo): versão própria do centro de custo; sem ele, o plano Global.
const centroSchema = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? null : v),
  z.coerce.number().int().positive('Centro de custo inválido.').nullable()
);

function tratar(err, next) {
  if (err.issues) return next(erro(400, err.issues[0].message));
  return next(err);
}

async function list(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.list(empresaId, centroSchema.parse(req.query.centro)));
  } catch (err) {
    tratar(err, next);
  }
}

async function update(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const { transferir, ...dados } = updateSchema.parse(req.body);
    const centroId = centroSchema.parse(req.body?.centro);
    const antes = await classificacaoAntes(empresaId, siengeId, centroId);
    const salvo = await service.update(empresaId, siengeId, dados, { transferir, centroId, usuarioId: req.user.id });
    const partes = mudancas(antes, salvo, { origem_projecao: ['Origem Projeção', rotulo('origemProjecao')], projeta_dfc: ['Projeta DFC', sn] });
    if (String(antes.mascara_id ?? '') !== String(salvo.mascara_id ?? '')) {
      partes.unshift(`Máscara DFC: ${await nomeMascara(antes.mascara_id)} → ${await nomeMascara(salvo.mascara_id)}`);
    }
    if (partes.length) {
      const plano = centroId ? `plano próprio de ${await rotuloCentro(empresaId, centroId)}` : 'plano Global';
      await carimbar(req, {
        descricao: `Conta ${await rotuloConta(empresaId, siengeId)} (${plano}): ${partes.join('; ')}${
          salvo.origem_retirada_de ? `; a origem saiu da conta ${await rotuloConta(empresaId, salvo.origem_retirada_de)}` : ''
        }.`,
        detalhes: { sienge_id: siengeId, centro_id: centroId, antes, depois: salvo },
        chave: `plano:${centroId || 'global'}:${siengeId}`,
      });
    }
    res.json(salvo);
  } catch (err) {
    // Origem CEF em uso em outra conta: devolve qual é, pra tela perguntar se transfere.
    if (err.codigo === 'ORIGEM_CEF_EM_USO') {
      return res.status(409).json({ message: err.message, codigo: err.codigo, conta: err.conta });
    }
    tratar(err, next);
  }
}

async function listVersoes(req, res, next) {
  try {
    res.json(await service.listVersoes(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function criarVersao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const centroId = z.coerce.number().int().positive('Escolha o centro de custo.').parse(req.body?.centro_id);
    // De onde começa o plano novo: 'global', 'branco' ou o id do centro cujo plano próprio copiar.
    const copiarDe = z
      .union([z.enum(['global', 'branco']), z.coerce.number().int().positive()], {
        errorMap: () => ({ message: 'Escolha se o plano começa em branco ou copiando outro plano.' }),
      })
      .parse(req.body?.copiar_de);
    if (copiarDe === centroId) throw Object.assign(new Error('Escolha outro plano pra copiar.'), { status: 400, expose: true });
    const criado = await service.criarVersao(empresaId, centroId, req.user.id, copiarDe);
    await carimbar(req, {
      descricao: `Criou o plano de contas próprio de ${await rotuloCentro(empresaId, centroId)} (${
        copiarDe === 'global' ? 'copiando o Global' : copiarDe === 'branco' ? 'em branco' : `copiando o plano de ${await rotuloCentro(empresaId, copiarDe)}`
      }).`,
      detalhes: { centro_id: centroId, copiar_de: copiarDe },
    });
    res.status(201).json(criado);
  } catch (err) {
    tratar(err, next);
  }
}

async function excluirVersao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const centroId = z.coerce.number().int().positive('Centro de custo inválido.').parse(req.params.centroId);
    const r = await service.excluirVersao(empresaId, centroId);
    await carimbar(req, {
      descricao: `Excluiu o plano de contas próprio de ${await rotuloCentro(empresaId, centroId)} (o centro volta a usar o Global).`,
      detalhes: { centro_id: centroId },
    });
    res.json(r);
  } catch (err) {
    tratar(err, next);
  }
}

async function listTodas(req, res, next) {
  try {
    res.json(await service.listTodas(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function resumo(req, res, next) {
  try {
    res.json(await service.resumo(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

// GET /:empresaId/excel?centro= — o .xlsx espelho da tabela do plano aberto (sem centro = Global).
async function exportarExcel(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { buffer, nome } = await excel.gerar(empresaId, centroSchema.parse(req.query.centro), req.user.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="plano-de-contas-dfc.xlsx"; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.end(buffer);
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, update, listVersoes, criarVersao, excluirVersao, listTodas, resumo, exportarExcel };
