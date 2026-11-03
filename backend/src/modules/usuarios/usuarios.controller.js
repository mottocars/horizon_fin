const { z } = require('zod');
const service = require('./usuarios.service');
const { limparCacheUsuario } = require('../../middlewares/auth.middleware');
const TELAS = require('../../config/telas');

const CODIGOS_TELAS = new Set(Object.values(TELAS));

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
  permissao: z.enum(['MASTER', 'BASICO'], {
    errorMap: () => ({ message: 'Selecione a permissão do usuário.' }),
  }),
  telas_permitidas: z.array(z.string()).optional().default([]),
  // Telas (dentre as liberadas) em que o usuário é Administrador; as demais
  // são nível Comum. O que não estiver em telas_permitidas é descartado no
  // service.
  telas_administrador: z.array(z.string()).optional().default([]),
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

// Usuário alvo precisa ter ao menos uma empresa em comum com quem pede
// (Master vê todos); Master é invisível pra quem não é Master.
function alvoAcessivel(user, alvo) {
  if (!alvo) return false;
  if (user.empresaIds === null) return true;
  const emComum = (alvo.empresa_ids || []).some((e) => user.empresaIds.has(Number(e)));
  return alvo.permissao !== 'MASTER' && emComum;
}

// Mesma restrição do list(), a partir de quem pede.
function escopoDoSolicitante(user) {
  const isMaster = user.permissao === 'MASTER';
  return { excludeMaster: !isMaster, empresaIds: isMaster ? undefined : [...user.empresaIds] };
}

// router.param('id'): fora do alcance (alvoAcessivel) responde 404 — mesmo
// tratamento do Master oculto, pra não confirmar que o id existe.
async function paramUsuarioAcessivel(req, res, next, id) {
  try {
    if (req.user.empresaIds === null) return next();
    const alvo = await service.getById(id);
    if (!alvoAcessivel(req.user, alvo)) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }
    next();
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ message: 'Usuário não encontrado.' });
    next(err);
  }
}

// Ninguém concede mais acesso do que tem: só Master cria Master (ver
// garantirPodeDefinirMaster); Básico com a tela de Usuários só libera telas
// que ele mesmo tem, e só marca como Administrador as telas em que ele mesmo
// é Administrador — senão bastaria se dar o acesso por meio de outro
// usuário. Na edição, o que o alvo JÁ tinha pode continuar (quem edita não
// precisa ter tudo o que o alvo tem pra mexer no resto do cadastro); a
// checagem é só sobre o que está sendo acrescentado.
async function garantirNivelConcedivel(req, data, idAlvo) {
  if (req.user.permissao === 'MASTER') return;
  if (data.permissao !== 'BASICO') {
    throw forbidden('Você só pode cadastrar usuários com perfil Básico.');
  }
  const atual = idAlvo ? await service.getById(idAlvo) : null;
  const jaTinha = new Set(atual?.telas_permitidas || []);
  const jaEraAdmin = new Set(atual?.telas_administrador || []);
  const proprias = new Set(req.user.telas);
  const propriasAdmin = new Set(req.user.telasAdministrador || []);
  if ((data.telas_permitidas || []).some((t) => !jaTinha.has(t) && !proprias.has(t))) {
    throw forbidden('Você só pode liberar telas às quais você mesmo tem acesso.');
  }
  if ((data.telas_administrador || []).some((t) => !jaEraAdmin.has(t) && !propriasAdmin.has(t))) {
    throw forbidden('Você só pode marcar como Administrador as telas em que você mesmo é Administrador.');
  }
}

async function create(req, res, next) {
  try {
    const data = createSchema.parse(req.body);
    await garantirPodeDefinirMaster(req, data.permissao);
    await garantirNivelConcedivel(req, data);
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
    await garantirNivelConcedivel(req, data, req.params.id);
    await garantirEmpresaPermitida(req, data.empresa_ids);
    const usuario = await service.update(req.params.id, data);
    if (!usuario) return res.status(404).json({ message: 'Usuário não encontrado.' });
    limparCacheUsuario(req.params.id);
    res.json(usuario);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23505') return next(badRequest(mensagemDeDuplicidade(err)));
    next(err);
  }
}

// Mapa de Acessos (aba de Cadastros › Usuários): os usuários Básicos
// visíveis com as telas de cada um, pra montar a matriz usuário × tela.
// Master fica de fora (tem tudo, não há o que ver nem mudar).
async function listAcessos(req, res, next) {
  try {
    res.json(await service.listAcessos({ ...escopoDoSolicitante(req.user), excludeMaster: true }));
  } catch (err) {
    next(err);
  }
}

// A matriz manda só o que mudou, célula a célula — { usuario_id, tela,
// acesso } —, aplicado sobre o que está no banco agora (o que outra pessoa
// mudou em outra tela enquanto isso continua valendo). Sem Comum ×
// Administrador por enquanto (ver acesso.middleware.js::ehAdministradorDaTela):
// liberar não mexe em telas_administrador; tirar a tela tira de lá também.
// Mesmas travas do cadastro: só Básico, ninguém mexe nos próprios acessos e
// ninguém concede tela que não tem (garantirNivelConcedivel).
const acessosSchema = z.object({
  alteracoes: z
    .array(
      z.object({
        usuario_id: z.coerce.number().int().positive(),
        tela: z.string().refine((t) => CODIGOS_TELAS.has(t), 'Tela desconhecida.'),
        acesso: z.boolean(),
      })
    )
    .min(1, 'Nenhuma alteração para salvar.')
    .max(5000),
});

async function atualizarAcessos(req, res, next) {
  try {
    const { alteracoes } = acessosSchema.parse(req.body);
    const porUsuario = new Map();
    for (const a of alteracoes) {
      if (!porUsuario.has(a.usuario_id)) porUsuario.set(a.usuario_id, []);
      porUsuario.get(a.usuario_id).push(a);
    }

    const novos = [];
    for (const [id, lista] of porUsuario) {
      if (id === req.user.id) throw forbidden('Você não pode alterar os seus próprios acessos.');
      const alvo = await service.getById(id);
      if (!alvoAcessivel(req.user, alvo)) {
        const err = new Error('Usuário não encontrado.');
        err.status = 404;
        err.expose = true;
        throw err;
      }
      if (alvo.permissao !== 'BASICO') throw badRequest(`${alvo.nome} é Master: já tem acesso a todas as telas.`);

      const telas = new Set(alvo.telas_permitidas || []);
      for (const { tela, acesso } of lista) {
        if (acesso) telas.add(tela);
        else telas.delete(tela);
      }
      const data = {
        permissao: 'BASICO',
        telas_permitidas: [...telas],
        telas_administrador: (alvo.telas_administrador || []).filter((t) => telas.has(t)),
      };
      if (!data.telas_permitidas.some((t) => CODIGOS_TELAS.has(t))) {
        throw badRequest(`${alvo.nome} ficaria sem nenhuma tela. Para tirar todo o acesso, desative o usuário no cadastro.`);
      }
      await garantirNivelConcedivel(req, data, id);
      const igual = (a, b) => a.length === b.length && a.every((t) => b.includes(t));
      const mudou =
        !igual(data.telas_permitidas, alvo.telas_permitidas || []) ||
        !igual(data.telas_administrador, alvo.telas_administrador || []);
      if (mudou) novos.push({ id, ...data });
    }

    await service.atualizarAcessos(novos);
    for (const { id } of novos) limparCacheUsuario(id);
    res.json(await service.listAcessos({ ...escopoDoSolicitante(req.user), excludeMaster: true }));
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function setStatus(req, res, next) {
  try {
    const ativo = Boolean(req.body.ativo);
    await garantirAlvoNaoEhMasterOculto(req, req.params.id);
    const usuario = await service.setAtivo(req.params.id, ativo);
    if (!usuario) return res.status(404).json({ message: 'Usuário não encontrado.' });
    limparCacheUsuario(req.params.id);
    res.json(usuario);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  list,
  listAcessos,
  getById,
  create,
  update,
  atualizarAcessos,
  setStatus,
  paramUsuarioAcessivel,
};
