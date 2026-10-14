const { z } = require('zod');
const service = require('./dfcParametros.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');
const versaoSchema = z.coerce.number().int().positive('Versão inválida.');

// Todos obrigatórios: a tela só libera "Publicar Versão" com tudo preenchido (mesma regra do
// Motor de Risco), e aqui valida de novo pra valer mesmo batendo direto na API. Campos de
// frontend/src/pages/Operacoes/DfcConstrutoras/parametrosDfc.js — os dois têm que ficar em
// sincronia.
// z.coerce.number() sozinho transformaria '' e null em 0 — aqui vazio vira "não informado".
const numero = (rotulo) =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number({ invalid_type_error: `Informe ${rotulo}.` })
  );
const valor = (rotulo) =>
  numero(rotulo).pipe(z.number().min(0, `${rotulo} não pode ser negativo.`).max(9_999_999_999_999.99));
const inteiro = (rotulo, max) =>
  numero(rotulo).pipe(
    z
      .number()
      .int(`${rotulo} precisa ser um número inteiro.`)
      .min(0, `${rotulo} não pode ser negativo.`)
      .max(max, `${rotulo} acima do limite (${max}).`)
  );
const percentual = (rotulo, max) =>
  numero(rotulo).pipe(z.number().min(0, `${rotulo} não pode ser negativo.`).max(max, `${rotulo} não pode passar de ${max}%.`));
const data = (rotulo) => z.string({ required_error: `Informe ${rotulo}.` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${rotulo} inválida.`);

const versaoBodySchema = z
  .object({
    cto: valor('CTO - Custo Total da Obra'),
    valor_financiamento_pj: valor('Valor do Financiamento PJ'),
    numero_unidades: inteiro('Número Total de Unidades', 100000),
    ticket_medio_avaliacao_pf: valor('Ticket Médio da Avaliação PF'),
    pct_coeficiente_garantia: percentual('% Coeficiente da Garantia', 999.99),
    pct_amortizacao_pj: percentual('% Amortização PJ', 100),
    data_demanda_minima: data('Data da Demanda Mínima'),
    taxa_juros_mes: percentual('Taxa de Juros ao Mês', 100),
    data_inicio_ciclo: data('Data Início do Ciclo'),
    data_fim_ciclo: data('Data Fim do Ciclo'),
    projeta_vendas_futuras: z.boolean({
      required_error: 'Informe "Projeta Vendas Futuras".',
      invalid_type_error: 'Informe "Projeta Vendas Futuras".',
    }),
    qtd_vendas_mes: inteiro('Quantidade de Vendas no Mês', 100000),
    tempo_assinatura_registro_meses: inteiro('Tempo Entre Assinatura e Registro', 600),
  })
  .refine((d) => d.data_fim_ciclo > d.data_inicio_ciclo, {
    message: 'A Data Fim do Ciclo precisa ser depois da Data Início do Ciclo.',
  });

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

function tratar(err, next) {
  if (err.issues) return next(erro(400, err.issues[0].message));
  // 22008 = data inexistente (ex.: 2026-02-30) que passou no formato AAAA-MM-DD.
  if (err.code === '22008') return next(erro(400, 'Data inválida.'));
  return next(err);
}

async function listCentros(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await service.listCentros(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

// Valores fixos (vindos do DCD / Geral do Contrato Caixa da obra) que a tela mostra travados.
async function getFonte(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    res.json(await service.fonteFixos(empresaId, siengeId));
  } catch (err) {
    tratar(err, next);
  }
}

async function listVersoes(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    res.json(await service.listVersoes(empresaId, siengeId));
  } catch (err) {
    tratar(err, next);
  }
}

async function getVersao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const versao = versaoSchema.parse(req.params.versao);
    const item = await service.getVersao(empresaId, siengeId, versao);
    if (!item) throw erro(404, 'Versão não encontrada.');
    res.json(item);
  } catch (err) {
    tratar(err, next);
  }
}

async function criarVersao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const dados = versaoBodySchema.parse(req.body);
    res.status(201).json(await service.criarVersao(empresaId, siengeId, req.user.id, dados));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { listCentros, getFonte, listVersoes, getVersao, criarVersao };
