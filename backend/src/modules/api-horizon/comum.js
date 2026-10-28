const crypto = require('crypto');
const T = require('../../config/telas');

// Peças comuns da API Horizon (chaves geradas na tela Integrações > API Horizon e a API pública
// /api/v1 — ver v1/). Chave e token são segredos aleatórios de 256 bits; no banco só fica o
// SHA-256 deles.

const PREFIXO_CHAVE = 'hzn_';
const PREFIXO_TOKEN = 'hzt_';
const TOKEN_MINUTOS = 15;
const VALIDADES_DIAS = [90, 180, 365];
const MAX_CHAVES_ATIVAS_POR_USUARIO = 10;

// A API só serve dados do Espião NF-e/NFS-e: o dono da chave precisa ter essa tela (ou ser Master).
const TELA_EXIGIDA = T.ESPIAO;

function gerarSegredo(prefixo) {
  return `${prefixo}${crypto.randomBytes(32).toString('base64url')}`;
}

function hashSegredo(segredo) {
  return crypto.createHash('sha256').update(String(segredo)).digest('hex');
}

// usuario: linha de usuarios com permissao, ativo, telas_permitidas e empresa_ids (array).
function usuarioPodeUsarApi(usuario, empresaId) {
  if (!usuario || !usuario.ativo) return false;
  if (usuario.permissao === 'MASTER') return true;
  const telas = usuario.telas_permitidas || [];
  const empresas = (usuario.empresa_ids || []).map(Number);
  return telas.includes(TELA_EXIGIDA) && empresas.includes(Number(empresaId));
}

const SQL_USUARIO = `
  SELECT u.id, u.nome, u.permissao, u.ativo, u.telas_permitidas,
         COALESCE(array_agg(ue.empresa_id) FILTER (WHERE ue.empresa_id IS NOT NULL), '{}') AS empresa_ids
  FROM usuarios u
  LEFT JOIN usuarios_empresas ue ON ue.usuario_id = u.id
  WHERE u.id = $1
  GROUP BY u.id`;

module.exports = {
  PREFIXO_CHAVE,
  PREFIXO_TOKEN,
  TOKEN_MINUTOS,
  VALIDADES_DIAS,
  MAX_CHAVES_ATIVAS_POR_USUARIO,
  TELA_EXIGIDA,
  gerarSegredo,
  hashSegredo,
  usuarioPodeUsarApi,
  SQL_USUARIO,
};
