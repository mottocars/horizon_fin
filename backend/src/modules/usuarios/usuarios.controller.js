const { z } = require('zod');
const service = require('./usuarios.service');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.status = 403;
  err.expose = true;
  return err;
}

function mensagemDeDuplicidade(err) {
  if (String(err.constraint || '').includes('username')) {
    return 'Já existe um usuário cadastrado com esse nome de usuário.';
  }
  return 'Já existe um usuário cadastrado com esse e-mail.';
}

// Defesa em profundidade: o seletor de permissão já esconde "Master" pra
// quem não é Master, mas isso sozinho não impede uma chamada direta à API —
// só um Master pode criar ou promover outro usuário a Master.
async function garantirPodeDefinirMaster(req, permissaoAlvo) {
  if (permissaoAlvo !== 'MASTER') return;
  const solicitante = await service.getById(req.user.id);
  if (solicitante?.permissao !== 'MASTER') {
    throw forbidden('Somente um usuário Master pode definir outro usuário como Master.');
  }
}

// Mesma ideia: as empresas já vêm restritas na tela pra quem não é Master,
// mas o servidor também confere — ninguém abaixo de Master pode cadastrar
// ou mover um usuário pra uma empresa que não seja uma das suas próprias.
async function garantirEmpresaPermitida(req, empresaIdsAlvo) {
  const solicitante = await service.getById(req.user.id);
  if (solicitante?.permissao === 'MASTER') return;
  const permitidas = new Set((solicitante?.empresa_ids || []).map(Number));
  const foraDoPermitido = (empresaIdsAlvo || []).some((id) => !permitidas.has(Number(id)));
  if (foraDoPermitido) {
    throw forbidden('Você só pode cadastrar usuários nas suas próprias empresas.');
  }
}

// Um usuário Master é invisível pra quem não é Master — nem pra editar, nem
// pra desativar. Sem isso, alguém poderia, por exemplo, rebaixar a permissão
// de um Master existente sem passar pela checagem de "definir Master"
// (que só olha pra permissão de DESTINO, não pra permissão atual do alvo).
async function garantirAlvoNaoEhMasterOculto(req, idAlvo) {
  const alvo = await service.getById(idAlvo);
  if (!alvo || alvo.permissao !== 'MASTER') return;
  const solicitante = await service.getById(req.user.id);
  if (solicitante?.permissao !== 'MASTER') {
    const err = new Error('Usuário não encontrado.');
    err.status = 404;
    err.expose = true;
    throw err;
  }
}

const baseSchema = {
  nome: z.string().min(1, 'Nome completo é obrigatório.'),
  email: z.string().email('Informe um e-mail válido.'),
  username: z
    .string()
    .trim()
    .min(3, 'O usuário deve ter pelo menos 3 caracteres.')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Use apenas letras, números, ponto, hífen ou underline.'),
  telefone_ddd: z.string().trim().regex(/^\d{2,3}$/, 'DDD inválido.').optional().or(z.literal('')),
  telefone_numero: z.string().trim().optional().or(z.literal('')),
  empresa_ids: z.array(z.coerce.number().int().positive()).optional().default([]),
  permissao: z.enum(['MASTER', 'ADMINISTRADOR', 'BASICO'], {
    errorMap: () => ({ message: 'Selecione a permissão do usuário.' }),
  }),
  telas_permitidas: z.array(z.string()).optional().default([]),
  // Data URI (base64) da foto, já redimensionada/comprimida no navegador.
  // '' explicitamente = removeu a foto; undefined = não mexeu nela.
  avatar_url: z
    .string()
    .max(3_000_000, 'A foto é grande demais.')
    .optional()
    .or(z.literal('')),
};

function comValidacoesDeNegocio(schema) {
  return schema
    .refine((data) => data.permissao !== 'BASICO' || data.telas_permitidas.length > 0, {
      message: 'Selecione ao menos uma tela para o usuário Básico.',
      path: ['telas_permitidas'],
    })
    .refine((data) => data.permissao === 'MASTER' || data.empresa_ids.length > 0, {
      message: 'Selecione ao menos uma empresa.',
      path: ['empresa_ids'],
    });
}

const createSchema = comValidacoesDeNegocio(
  z.object({
    ...baseSchema,
    senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
  })
);

const updateSchema = comValidacoesDeNegocio(
  z.object({
    ...baseSchema,
    senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
  })
);

async function list(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const search = (req.query.search || '').toString();
    let ativo;
    if (req.query.ativo === 'true') ativo = true;
    if (req.query.ativo === 'false') ativo = false;
    // A restrição por empresa é sempre calculada a partir de quem está
    // pedindo, nunca de um parâmetro vindo do cliente — assim não tem como
    // burlar mandando (ou omitindo) um empresaId na URL.
    const solicitante = await service.getById(req.user.id);
    const isMaster = solicitante?.permissao === 'MASTER';
    const result = await service.list({
      page,
      limit,
      search,
      ativo,
      excludeMaster: !isMaster,
      empresaIds: isMaster ? undefined : solicitante?.empresa_ids || [],
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const usuario = await service.getById(req.params.id);
    if (!usuario) return res.status(404).json({ message: 'Usuário não encontrado.' });
    // Usuário Master é invisível pra quem não é Master — trata como se não
    // existisse, pra não nem confirmar que aquele id é de um Master.
    if (usuario.permissao === 'MASTER') {
      const solicitante = await service.getById(req.user.id);
      if (solicitante?.permissao !== 'MASTER') {
        return res.status(404).json({ message: 'Usuário não encontrado.' });
      }
    }
    res.json(usuario);
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const data = createSchema.parse(req.body);
    await garantirPodeDefinirMaster(req, data.permissao);
    await garantirEmpresaPermitida(req, data.empresa_ids);
    const usuario = await service.create(data);
    res.status(201).json(usuario);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23505') return next(badRequest(mensagemDeDuplicidade(err)));
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const data = updateSchema.parse(req.body);
    await garantirAlvoNaoEhMasterOculto(req, req.params.id);
    await garantirPodeDefinirMaster(req, data.permissao);
    await garantirEmpresaPermitida(req, data.empresa_ids);
    const usuario = await service.update(req.params.id, data);
    if (!usuario) return res.status(404).json({ message: 'Usuário não encontrado.' });
    res.json(usuario);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23505') return next(badRequest(mensagemDeDuplicidade(err)));
    next(err);
  }
}

async function setStatus(req, res, next) {
  try {
    const ativo = Boolean(req.body.ativo);
    await garantirAlvoNaoEhMasterOculto(req, req.params.id);
    const usuario = await service.setAtivo(req.params.id, ativo);
    if (!usuario) return res.status(404).json({ message: 'Usuário não encontrado.' });
    res.json(usuario);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getById, create, update, setStatus };
