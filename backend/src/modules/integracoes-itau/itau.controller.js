const { z } = require('zod');
const service = require('./itau.service');
const usuariosService = require('../usuarios/usuarios.service');

// A validação de conteúdo (UUID, dígitos do CNPJ, subject) fica no service — aqui só a forma.
const texto = z.string().trim().default('');

const conferirSchema = z.object({ nome: texto, client_id: texto, cnpj: texto });

const gerarSchema = z.object({
  empresa_id: z.coerce.number().int().positive('Selecione a empresa.'),
  nome: texto,
  client_id: texto,
  cnpj: texto,
  token: texto,
  razao_social: texto,
  cidade: texto,
  uf: texto,
});

// Gerar de novo numa conexão existente: os dados já estão nela; só o token é novo (e os dados
// do subject podem ser corrigidos).
const gerarNovamenteSchema = z.object({
  token: texto,
  razao_social: z.string().trim().optional(),
  cidade: z.string().trim().optional(),
  uf: z.string().trim().optional(),
});

const digitos = (n, msg) => z.string().trim().regex(new RegExp(`^\\d{${n}}$`), msg);
const atualizarSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome da conexão.').max(150),
  agencia: digitos(4, 'Agência deve ter 4 dígitos.').optional().or(z.literal('')),
  conta: digitos(5, 'Conta deve ter 5 dígitos (sem o DAC).').optional().or(z.literal('')),
  dac: digitos(1, 'DAC deve ter 1 dígito.').optional().or(z.literal('')),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function tratar(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err.issues) return next(badRequest(err.issues[0].message));
      if (err.code === '23503') return next(badRequest('Empresa selecionada não existe.'));
      next(err);
    }
  };
}

function naoEncontrada(res) {
  return res.status(404).json({ message: 'Conexão não encontrada.' });
}

const list = tratar(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const search = (req.query.search || '').toString();
  let ativo;
  if (req.query.ativo === 'true') ativo = true;
  if (req.query.ativo === 'false') ativo = false;
  const solicitante = await usuariosService.getById(req.user.id);
  const isMaster = solicitante?.permissao === 'MASTER';
  let empresaIds = isMaster ? undefined : solicitante?.empresa_ids || [];
  if (isMaster && req.query.empresa_id) empresaIds = [Number(req.query.empresa_id)];
  res.json(await service.list({ page, limit, search, ativo, empresaIds }));
});

const getById = tratar(async (req, res) => {
  const item = await service.getById(req.params.id);
  if (!item) return naoEncontrada(res);
  res.json(item);
});

const conferir = tratar(async (req, res) => {
  res.json(await service.conferirDados(conferirSchema.parse(req.body || {})));
});

const gerar = tratar(async (req, res) => {
  const resultado = await service.gerarCertificado(gerarSchema.parse(req.body || {}), req.user.id);
  res.status(201).json(resultado);
});

const gerarNovamente = tratar(async (req, res) => {
  const atual = await service.getById(req.params.id);
  if (!atual) return naoEncontrada(res);
  const corpo = gerarNovamenteSchema.parse(req.body || {});
  const dados = {
    nome: atual.nome,
    client_id: atual.client_id,
    cnpj: atual.cnpj,
    token: corpo.token,
    razao_social: corpo.razao_social ?? atual.razao_social,
    cidade: corpo.cidade ?? atual.cidade,
    uf: corpo.uf ?? atual.uf,
  };
  res.json(await service.gerarCertificado(dados, req.user.id, atual.id));
});

const atualizar = tratar(async (req, res) => {
  const item = await service.atualizar(req.params.id, atualizarSchema.parse(req.body || {}));
  if (!item) return naoEncontrada(res);
  res.json(item);
});

const setStatus = tratar(async (req, res) => {
  const item = await service.setAtivo(req.params.id, Boolean(req.body.ativo));
  if (!item) return naoEncontrada(res);
  res.json(item);
});

const testarToken = tratar(async (req, res) => {
  res.json(await service.testarToken(req.params.id));
});

const testarExtrato = tratar(async (req, res) => {
  const r = await service.testarExtrato(req.params.id);
  if (!r) return naoEncontrada(res);
  res.json(r);
});

const renovar = tratar(async (req, res) => {
  const r = await service.renovarCertificado(req.params.id);
  if (!r) return naoEncontrada(res);
  res.json(r);
});

module.exports = { list, getById, conferir, gerar, gerarNovamente, atualizar, setStatus, testarToken, testarExtrato, renovar };
