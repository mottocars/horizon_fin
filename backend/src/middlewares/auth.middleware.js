const jwt = require('jsonwebtoken');
const env = require('../config/env');
const pool = require('../config/db');
const { registrarCliente } = require('../utils/clienteHttp');

// Autenticação + contexto de acesso do usuário. Toda rota protegida passa
// por aqui (router.use(authMiddleware) em cada módulo, e também pelo
// exigirTela de server.js — ver acesso.middleware.js). Além de validar o
// token, carrega do banco o perfil, as telas e as empresas do usuário, e
// barra na hora:
//   - usuário inativado/excluído (o token de 15 min não vale mais nada);
//   - qualquer empresa pedida em query/body (empresa_id, empresaId,
//     empresa_ids) que não seja uma das empresas do usuário.
// Empresa na URL (:empresaId) e IDs de recursos (nota, certificado,
// anexo...) são conferidos pelos router.param de cada módulo (ver
// acesso.middleware.js).
//
// req.user = { id, permissao, telas: string[], empresaIds: Set<number> | null }
// empresaIds null = MASTER (todas as empresas).

const CACHE_MS = 10 * 1000;
const cache = new Map();

async function carregarUsuario(id) {
  const emCache = cache.get(id);
  if (emCache && emCache.expira > Date.now()) return emCache.valor;

  const { rows } = await pool.query(
    `SELECT u.id, u.permissao, u.ativo, u.telas_permitidas,
            COALESCE(array_agg(ue.empresa_id) FILTER (WHERE ue.empresa_id IS NOT NULL), '{}') AS empresa_ids
     FROM usuarios u
     LEFT JOIN usuarios_empresas ue ON ue.usuario_id = u.id
     WHERE u.id = $1
     GROUP BY u.id`,
    [id]
  );
  const row = rows[0];
  const valor = row
    ? {
        id: row.id,
        permissao: row.permissao,
        ativo: row.ativo,
        telas: row.telas_permitidas || [],
        empresaIds: row.permissao === 'MASTER' ? null : new Set(row.empresa_ids.map(Number)),
      }
    : null;
  cache.set(id, { valor, expira: Date.now() + CACHE_MS });
  return valor;
}

// Chamado pelo cadastro de usuários ao alterar perfil/telas/empresas/status,
// pra mudança valer na próxima requisição (sem esperar o cache vencer).
function limparCacheUsuario(id) {
  if (id == null) cache.clear();
  else cache.delete(Number(id));
}

function podeAcessarEmpresa(user, empresaId) {
  if (!user) return false;
  if (user.empresaIds === null) return true;
  const id = Number(empresaId);
  return Number.isInteger(id) && user.empresaIds.has(id);
}

// Lista de ids (aceita número, "1,2,3", array) — o que não for número
// inteiro positivo é ignorado aqui (a validação de formato é do zod de
// cada controller; aqui só importa não deixar passar empresa alheia).
function extrairIds(valor) {
  if (valor == null || valor === '') return [];
  const lista = Array.isArray(valor) ? valor : String(valor).split(',');
  return lista.map((v) => Number(String(v).trim())).filter((n) => Number.isInteger(n) && n > 0);
}

const CHAVES_EMPRESA = ['empresa_id', 'empresaId', 'empresa_ids', 'empresaIds'];

function empresasDaRequisicao(req) {
  const ids = [];
  for (const origem of [req.query, req.body]) {
    if (!origem || typeof origem !== 'object') continue;
    for (const chave of CHAVES_EMPRESA) ids.push(...extrairIds(origem[chave]));
  }
  return ids;
}

function negar(res) {
  return res.status(403).json({ message: 'Você não tem acesso a esta empresa.' });
}

async function autenticar(req, res) {
  if (req.user?.permissao) return true;

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ message: 'Token não informado.' });
    return false;
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret);
  } catch {
    res.status(401).json({ message: 'Token inválido ou expirado.' });
    return false;
  }

  const usuario = await carregarUsuario(Number(payload.sub));
  if (!usuario || !usuario.ativo) {
    res.status(401).json({ message: 'Usuário inativo ou inexistente.' });
    return false;
  }
  req.user = { id: usuario.id, permissao: usuario.permissao, telas: usuario.telas, empresaIds: usuario.empresaIds };
  // De onde veio a chamada (navegador, Postman, script...) — Métricas de Uso.
  registrarCliente(req, usuario.id);
  return true;
}

async function authMiddleware(req, res, next) {
  try {
    if (!(await autenticar(req, res))) return;
    // Corpo multipart (multer) ainda não foi lido aqui — as rotas de
    // upload recebem a empresa pela URL/query, conferidas do mesmo jeito.
    if (empresasDaRequisicao(req).some((id) => !podeAcessarEmpresa(req.user, id))) return negar(res);
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authMiddleware;
module.exports.autenticar = autenticar;
module.exports.podeAcessarEmpresa = podeAcessarEmpresa;
module.exports.limparCacheUsuario = limparCacheUsuario;
module.exports.extrairIds = extrairIds;
