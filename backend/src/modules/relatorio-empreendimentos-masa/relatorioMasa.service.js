const pool = require('../../config/db');
const actioonService = require('../integracoes-actioon/actioon.service');

const ACTIOON_ACTION_TYPES_URL = 'https://api.actioon.com.br/api/action_types';

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

// Nível 1 da matriz (linhas) — as fases (action_types) cadastradas na
// Actioon da Masa, ordenadas pela própria tag `order` que a API devolve
// (não por nome nem por id — "Fase 0" pode ter id maior que "Fase 3").
async function listFases() {
  const token = await buscarToken();

  let resposta;
  try {
    resposta = await fetch(ACTIOON_ACTION_TYPES_URL, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
  } catch {
    throw badRequest('Não foi possível conectar à Actioon.');
  }

  const corpo = await resposta.json().catch(() => []);
  if (!resposta.ok) throw badRequest('Não foi possível buscar as fases na Actioon.');

  return [...corpo]
    .sort((a, b) => a.order - b.order)
    .map((fase) => ({ id: fase.id, name: fase.name, order: fase.order }));
}

module.exports = { listFases };
