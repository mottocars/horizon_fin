const pool = require('../config/db');

// ---------------------------------------------------------------------------------------
// Empresa modelo (empresas.empresa_modelo = TRUE — a HZN CONSTRUTORA): empresa fictícia de
// demonstração. As integrações dela são SIMULADAS — nenhuma chamada externa (Sienge, VanPix,
// SEFAZ, Prevision, Z-API, e-mail, Construtor de Vendas…) sai em nome dela. A única exceção
// é a API Itaú, que usa conexões "espelho" (conexoes_itau.conexao_origem_id).
//
// Uso:
//   if (await ehEmpresaModelo(empresaId)) return simulado;   // na entrada de cada fluxo
//   await bloquearSeEmpresaModelo(empresaId);                 // trava de último nível
// ---------------------------------------------------------------------------------------

const VALIDADE_CACHE_MS = 60 * 1000;
let cache = { id: undefined, em: 0 };

// id da empresa modelo (ou null se não existir). Cache de 1 min — a empresa modelo não
// muda de id e não pode deixar de ser modelo (trigger no banco).
async function idEmpresaModelo() {
  if (cache.id !== undefined && Date.now() - cache.em < VALIDADE_CACHE_MS) return cache.id;
  const { rows } = await pool.query('SELECT id FROM empresas WHERE empresa_modelo LIMIT 1');
  cache = { id: rows[0]?.id ?? null, em: Date.now() };
  return cache.id;
}

async function ehEmpresaModelo(empresaId) {
  if (empresaId === undefined || empresaId === null || empresaId === '') return false;
  const id = await idEmpresaModelo();
  return id !== null && Number(empresaId) === Number(id);
}

class ErroEmpresaModelo extends Error {
  constructor(mensagem) {
    super(mensagem || 'Empresa modelo: esta integração é simulada e não acessa sistemas externos.');
    this.name = 'ErroEmpresaModelo';
    this.status = 409;
    this.expose = true;
    this.empresaModelo = true;
  }
}

// Trava de último nível: lança se a empresa for a modelo. Fica nos pontos que carregam
// credenciais de integrações externas — se algum fluxo novo esquecer a simulação, a chamada
// externa não sai.
async function bloquearSeEmpresaModelo(empresaId, mensagem) {
  if (await ehEmpresaModelo(empresaId)) throw new ErroEmpresaModelo(mensagem);
}

function limparCache() {
  cache = { id: undefined, em: 0 };
}

module.exports = { idEmpresaModelo, ehEmpresaModelo, bloquearSeEmpresaModelo, ErroEmpresaModelo, limparCache };
