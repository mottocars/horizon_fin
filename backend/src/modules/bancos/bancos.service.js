const pool = require('../../config/db');
const bancosApiClient = require('../contas-bancarias-sienge/bancos-api.client');

// A imagem já chega redimensionada pelo navegador (ver frontend/src/utils/imagemLogoBanco.js)
// — este limite é só uma trava de segurança contra alguém chamando a API direto.
const TIPOS_ACEITOS = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const TAMANHO_MAXIMO_BYTES = 300 * 1024;

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

async function mapaLogosCustomizadas() {
  const { rows } = await pool.query('SELECT codigo, logo FROM bancos_logos');
  return new Map(rows.map((r) => [r.codigo, r.logo]));
}

// Todos os bancos (oficiais da BrasilAPI + os internos, ver bancos-api.client.js), com a
// logomarca customizada tendo prioridade sobre a oficial onde existir uma. Usado tanto pelo
// cadastro de Bancos quanto por qualquer outra tela que mostre a logo de um banco (Saldo
// Contas Bancárias) — assim, subir uma logo aqui já aparece em todo lugar na hora, sem
// esperar o cache de 24h da BrasilAPI vencer.
async function listarTodosComLogo() {
  const [oficiais, customizadas] = await Promise.all([bancosApiClient.getBancos(), mapaLogosCustomizadas()]);
  return oficiais.map((b) => {
    const logoCustomizada = customizadas.get(b.codigo);
    return {
      codigo: b.codigo,
      nome: b.nome,
      logo: logoCustomizada || b.logo || null,
      logo_customizada: Boolean(logoCustomizada),
    };
  });
}

// Paginação e busca em memória, sobre a lista já carregada (que o próprio bancos-api.client
// já cacheia por 24h) — não vale a pena outra camada de cache pra ~460 bancos.
async function listarComPaginacao({ search = '', page = 1, limit = 20 }) {
  const todos = await listarTodosComLogo();
  const termo = search.trim().toLowerCase();
  const filtrados = termo
    ? todos.filter((b) => b.codigo.includes(termo) || b.nome.toLowerCase().includes(termo))
    : todos;
  const total = filtrados.length;
  const offset = (page - 1) * limit;
  return {
    data: filtrados.slice(offset, offset + limit),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

function validarDataUri(dataUri) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUri || '');
  if (!m) throw erro(400, 'Envie uma imagem válida.');
  const [, mime, base64] = m;
  if (!TIPOS_ACEITOS.has(mime)) throw erro(400, 'Formato de imagem não suportado. Use PNG, JPEG, WEBP ou SVG.');
  if (Buffer.byteLength(base64, 'base64') > TAMANHO_MAXIMO_BYTES) {
    throw erro(400, 'Imagem muito grande — envie um arquivo de até 300KB.');
  }
}

async function salvarLogo(codigo, dataUri) {
  validarDataUri(dataUri);
  const existe = (await bancosApiClient.getBancos()).some((b) => b.codigo === codigo);
  if (!existe) throw erro(404, 'Banco não encontrado.');
  await pool.query(
    `INSERT INTO bancos_logos (codigo, logo) VALUES ($1, $2)
     ON CONFLICT (codigo) DO UPDATE SET logo = EXCLUDED.logo`,
    [codigo, dataUri]
  );
}

async function removerLogo(codigo) {
  await pool.query('DELETE FROM bancos_logos WHERE codigo = $1', [codigo]);
}

module.exports = { listarTodosComLogo, listarComPaginacao, salvarLogo, removerLogo };
