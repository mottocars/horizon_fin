const { z } = require('zod');
const service = require('./cronogramaCentros.service');
const versoes = require('./cronogramaVersoes.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const siengeIdSchema = z.coerce.number().int().positive('Centro de custo inválido.');
const versaoIdSchema = z.coerce.number().int().positive('Versão inválida.');
const gravarVersaoSchema = z.object({
  observacao: z.string().trim().max(500, 'A observação passa de 500 caracteres.').nullable().optional(),
});

// 'AAAA-MM-DD' de verdade (nada de 31/02) e com ano razoável — o campo de data do navegador passa
// por anos como 0002 enquanto se digita.
const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
  .refine((s) => {
    const ano = Number(s.slice(0, 4));
    const d = new Date(`${s}T00:00:00Z`);
    return ano >= 1900 && ano <= 2200 && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Data inválida.');

// `datas`: as etapas que mudaram (data null = apagar). `data_termino` só muda se vier no corpo.
const datasSchema = z.object({
  datas: z
    .array(z.object({ etapa_id: z.coerce.number().int().positive('Etapa inválida.'), data: dataSchema.nullable() }))
    .max(200)
    .default([]),
  data_termino: dataSchema.nullable().optional(),
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

// Montado em centros.routes.js (aba Histórico de Etapas do cadastro do centro). Não grava no
// cronograma: guarda a alteração como pendente até a próxima versão (cronogramaVersoes.service.js).
async function updateDatas(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    const { datas, data_termino: dataTermino } = datasSchema.parse(req.body);
    res.json(await versoes.guardarPendencia(empresaId, siengeId, { datas, dataTermino }, req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function listPendencias(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await versoes.listarPendencias(empresaId, req.user.id));
  } catch (err) {
    tratar(err, next);
  }
}

async function descartarPendencia(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeId = siengeIdSchema.parse(req.params.siengeId);
    await versoes.descartarPendencia(empresaId, siengeId);
    res.status(204).end();
  } catch (err) {
    tratar(err, next);
  }
}

async function listVersoes(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(await versoes.listarVersoes(empresaId));
  } catch (err) {
    tratar(err, next);
  }
}

async function gravarVersao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { observacao } = gravarVersaoSchema.parse(req.body || {});
    res.status(201).json(await versoes.gravarVersao(empresaId, req.user.id, observacao || null));
  } catch (err) {
    tratar(err, next);
  }
}

async function excelVersao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const versaoId = versaoIdSchema.parse(req.params.versaoId);
    const { buffer, nomeArquivo } = await versoes.excelDaVersao(empresaId, versaoId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { list, updateDatas, listPendencias, descartarPendencia, listVersoes, gravarVersao, excelVersao };
