const { z } = require('zod');
const service = require('./motorRisco.service');

// Os 5 indicadores do score são fixos (não dá pra criar/remover indicador
// pela tela) — só a escala (nota_0/nota_100) e o peso de cada um mudam entre
// versões. Ver MotorRiscoTab.jsx no frontend.
const INDICADORES = ['pct_em_dia', 'atraso_medio', 'maior_atraso', 'reincidencia', 'relacionamento'];

const empresaIdSchema = z.coerce.number().int().positive('Selecione uma empresa.');

const indicadorSchema = z.object({
  indicador: z.enum(INDICADORES, { errorMap: () => ({ message: 'Indicador inválido.' }) }),
  nota_0: z.coerce.number(),
  nota_100: z.coerce.number(),
  peso: z.coerce.number().int().min(0).max(100),
});

const criarVersaoSchema = z
  .object({
    empresa_id: empresaIdSchema,
    tolerancia_dias: z.coerce.number().int().min(0).max(15),
    janela_observacao_meses: z.coerce.number().int().min(6).max(120),
    gatilho_reincidencia_dias: z.coerce.number().int().min(1).max(60),
    minimo_parcelas: z.coerce.number().int().min(1).max(12),
    dia_recalculo: z.coerce.number().int().min(1).max(28),
    trava_subida_parcelas: z.coerce.number().int().min(0).max(24),
    dias_vencidos_regua_cobranca: z.coerce.number().int().min(1).max(90),
    corte_bom_pagador: z.coerce.number().int().min(1).max(99),
    corte_pagador_duvidoso: z.coerce.number().int().min(1).max(98),
    indicadores: z.array(indicadorSchema).length(5, 'Informe a escala dos 5 indicadores.'),
  })
  .refine((d) => d.corte_bom_pagador > d.corte_pagador_duvidoso, {
    message: 'O corte de bom pagador deve ser maior que o de pagador duvidoso.',
    path: ['corte_bom_pagador'],
  })
  .refine(
    (d) => {
      const ids = d.indicadores.map((i) => i.indicador);
      return new Set(ids).size === 5 && INDICADORES.every((id) => ids.includes(id));
    },
    { message: 'Envie a escala de cada um dos 5 indicadores, sem repetir.', path: ['indicadores'] }
  )
  .refine((d) => d.indicadores.reduce((soma, i) => soma + i.peso, 0) === 100, {
    message: 'A soma dos pesos dos indicadores precisa fechar em 100.',
    path: ['indicadores'],
  });

const getVersaoQuerySchema = z.object({ empresa_id: empresaIdSchema });

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function listVersoes(req, res, next) {
  try {
    const { empresa_id: empresaId } = getVersaoQuerySchema.parse(req.query);
    const result = await service.listVersoes(empresaId);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getVersao(req, res, next) {
  try {
    const { empresa_id: empresaId } = getVersaoQuerySchema.parse(req.query);
    const versao = z.coerce.number().int().positive().parse(req.params.versao);
    const result = await service.getVersao(empresaId, versao);
    if (!result) return res.status(404).json({ message: 'Versão não encontrada.' });
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function criarVersao(req, res, next) {
  try {
    const dados = criarVersaoSchema.parse(req.body);
    const result = await service.criarVersao(dados.empresa_id, req.user.id, dados);
    res.status(201).json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23503') return next(badRequest('Empresa selecionada não existe.'));
    next(err);
  }
}

module.exports = { listVersoes, getVersao, criarVersao, INDICADORES };
