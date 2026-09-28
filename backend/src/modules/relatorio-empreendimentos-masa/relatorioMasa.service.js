const pool = require('../../config/db');
const actioonService = require('../integracoes-actioon/actioon.service');

const ACTIOON_ACTION_TYPES_URL = 'https://api.actioon.com.br/api/action_types';
const ACTIOON_CLIENTS_URL = 'https://api.actioon.com.br/api/clients';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// Relatório exclusivo da Masa (pedido do usuário) — em vez de um
// empresa_id fixo no código, resolve pelo nome_fantasia (mais seguro
// contra o id mudar num banco recriado do zero).
async function getEmpresaMasaId() {
  const { rows } = await pool.query("SELECT id FROM empresas WHERE nome_fantasia = 'MASA' LIMIT 1");
  if (!rows[0]) throw badRequest('Empresa MASA não encontrada.');
  return rows[0].id;
}

async function buscarToken() {
  const empresaId = await getEmpresaMasaId();
  const credenciais = await actioonService.getCredenciaisAtivas(empresaId);
  if (!credenciais) throw badRequest('Nenhuma integração Actioon ativa cadastrada para a Masa.');
  return actioonService.login(credenciais.email, credenciais.senha);
}

// GET autenticado num endpoint da Actioon que devolve uma lista de itens
// com `id`/`name`/`order` — mesmo formato usado tanto por action_types
// (fases) quanto por clients (empreendimentos). Sempre ordena por `order`
// (não por nome nem id) e devolve só os 3 campos que o relatório usa.
async function buscarListaOrdenada(url, mensagemErro) {
  const token = await buscarToken();

  let resposta;
  try {
    resposta = await fetch(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    throw badRequest('Não foi possível conectar à Actioon.');
  }

  const corpo = await resposta.json().catch(() => []);
  if (!resposta.ok) throw badRequest(mensagemErro);

  return [...corpo]
    .sort((a, b) => a.order - b.order)
    .map((item) => ({ id: item.id, name: item.name, order: item.order }));
}

// Nível 1 da matriz (linhas) — as fases (action_types) cadastradas na
// Actioon da Masa.
function listFases() {
  return buscarListaOrdenada(ACTIOON_ACTION_TYPES_URL, 'Não foi possível buscar as fases na Actioon.');
}

// Drilldown de cada fase — os empreendimentos (clients, na terminologia da
// Actioon) cadastrados na Masa. Por enquanto a Actioon não expõe em qual
// fase cada empreendimento está, então a mesma lista completa aparece sob
// qualquer fase aberta.
function listEmpreendimentos() {
  return buscarListaOrdenada(ACTIOON_CLIENTS_URL, 'Não foi possível buscar os empreendimentos na Actioon.');
}

module.exports = { listFases, listEmpreendimentos };
