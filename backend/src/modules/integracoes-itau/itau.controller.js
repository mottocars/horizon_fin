const { z } = require('zod');
const service = require('./itau.service');
const usuariosService = require('../usuarios/usuarios.service');

// statementId do Itaú = agência(4) + "00" + conta(5) + DAC(1) — cada parte com o tamanho exato.
const contaSchema = z.object({
  agencia: z.string().trim().regex(/^\d{4}$/, 'Agência deve ter 4 dígitos.'),
  conta: z.string().trim().regex(/^\d{5}$/, 'Conta deve ter 5 dígitos (sem o dígito verificador).'),
  dac: z.string().trim().regex(/^\d$/, 'DAC (dígito da conta) deve ter 1 dígito.'),
});

const baseSchema = {
  empresa_id: z.coerce.number().int().positive('Selecione uma empresa.'),
  nome_conexao: z.string().trim().min(1, 'Nome da conexão é obrigatório.').max(150),
  client_id: z.string().trim().min(1, 'Client ID (CREDENCIAL da planilha) é obrigatório.').max(100),
  token_temporario: z.string().trim().optional(),
  token_temporario_validade: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Validade do token inválida.')
    .optional()
    .or(z.literal(''))
    .nullable(),
  cert_ou: z.string().trim().min(1, 'Nome da aplicação (OU) é obrigatório.').max(100),
  cert_cidade: z.string().trim().min(1, 'Cidade é obrigatória.').max(120),
  cert_uf: z.string().trim().regex(/^[A-Za-z]{2}$/, 'UF deve ter 2 letras.').transform((v) => v.toUpperCase()),
  contas: z.array(contaSchema).default([]),
};

const createSchema = z.object({
  ...baseSchema,
  token_temporario: z.string().trim().min(1, 'Token temporário (TOKEN da planilha) é obrigatório.'),
});
const updateSchema = z.object(baseSchema);

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function normalizarContas(contas) {
  const vistas = new Set();
  return contas.filter((c) => {
    const chave = `${c.agencia}${c.conta}${c.dac}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

function tratarErro(err, next) {
  if (err.issues) return next(badRequest(err.issues[0].message));
  if (err.code === '23503') return next(badRequest('Empresa selecionada não existe.'));
  if (err.code === '23505') return next(badRequest('Conta repetida.'));
  return next(err);
}

async function list(req, res, next) {
  try {
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
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const item = await service.getById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Conexão não encontrada.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = createSchema.parse(req.body);
    data.contas = normalizarContas(data.contas);
    res.status(201).json(await service.create(data));
  } catch (err) {
    tratarErro(err, next);
  }
}

async function update(req, res, next) {
  try {
    const data = updateSchema.parse(req.body);
    data.contas = normalizarContas(data.contas);
    const item = await service.update(req.params.id, data);
    if (!item) return res.status(404).json({ message: 'Conexão não encontrada.' });
    res.json(item);
  } catch (err) {
    tratarErro(err, next);
  }
}

async function setStatus(req, res, next) {
  try {
    const item = await service.setAtivo(req.params.id, Boolean(req.body.ativo));
    if (!item) return res.status(404).json({ message: 'Conexão não encontrada.' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function gerarCertificado(req, res, next) {
  try {
    const resultado = await service.gerarCertificado(req.params.id);
    if (!resultado) return res.status(404).json({ message: 'Conexão não encontrada.' });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

async function renovarCertificado(req, res, next) {
  try {
    const resultado = await service.renovarCertificado(req.params.id);
    if (!resultado) return res.status(404).json({ message: 'Conexão não encontrada.' });
    res.json({ ...resultado, conexao: await service.getById(req.params.id) });
  } catch (err) {
    next(err);
  }
}

async function testar(req, res, next) {
  try {
    const resultado = await service.testarConexao(req.params.id);
    if (!resultado) return res.status(404).json({ message: 'Conexão não encontrada.' });
    res.json(resultado);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, setStatus, gerarCertificado, renovarCertificado, testar };
