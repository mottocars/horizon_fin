const { z } = require('zod');
const service = require('./unidades.service');
const c = require('../dre-versoes/carimbo');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');

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

async function listar(req, res, next) {
  try {
    // A posição no limite do realizado da versão da DRE (o mesmo da DRE e da POC).
    res.json(await service.listarNoCorte(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

async function sincronizar(req, res, next) {
  try {
    const r = await service.sincronizar(empresaIdSchema.parse(req.params.empresaId));
    await c.carimbar(req, { descricao: 'Atualizou as unidades do Sienge (botão Atualizar).' });
    res.json(r);
  } catch (err) {
    tratar(err, next);
  }
}

async function sincronizarContratos(req, res, next) {
  try {
    const r = await service.sincronizarContratos(empresaIdSchema.parse(req.params.empresaId));
    await c.carimbar(req, { descricao: 'Atualizou os contratos de venda do Sienge (botão Atualizar).' });
    res.json(r);
  } catch (err) {
    tratar(err, next);
  }
}

async function statusSincronizacao(req, res, next) {
  try {
    res.json(service.getStatusSincronizacao(empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
}

module.exports = { listar, sincronizar, sincronizarContratos, statusSincronizacao };
