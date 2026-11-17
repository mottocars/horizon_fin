const crypto = require('crypto');
const pool = require('../../config/db');
const env = require('../../config/env');
const zapiService = require('../integracoes-zapi/zapi.service');

// Peças comuns dos Parceiros (loja de aplicativos): credenciais, WhatsApp da Comunicação Oficial
// e o histórico. Ver parceiros.publico.js (formulário "Quero ser um Parceiro" e troca do
// client_secret, em api.horizonhub.com.br) e parceiros.service.js (Cadastros › Parceiros).

// client_id é público (identifica o parceiro). Os dois client_secret são segredos de 256 bits;
// no banco só fica o SHA-256 deles.
const PREFIXO_CLIENT_ID = 'hzp_';
const PREFIXO_SECRET_TEMPORARIO = 'hzpt_';
const PREFIXO_SECRET_OFICIAL = 'hzps_';
const SECRET_TEMPORARIO_DIAS = 6;

function gerarClientId() {
  return `${PREFIXO_CLIENT_ID}${crypto.randomBytes(15).toString('base64url')}`;
}

function gerarSegredo(prefixo) {
  return `${prefixo}${crypto.randomBytes(32).toString('base64url')}`;
}

function hashSegredo(segredo) {
  return crypto.createHash('sha256').update(String(segredo)).digest('hex');
}

// Página da documentação onde o parceiro gera o client_secret oficial (mesmo domínio da API em
// produção; em dev, o Vite de api-docs/ na 5182).
function linkGerarSecretOficial() {
  return `${env.apiHorizon.docsUrl}/#ep-parceiros-client-secret`;
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

function dataHoraBr(data) {
  const d = new Date(data);
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  return `${dia} às ${hora}`;
}

// (31) 99883-2751 a partir de 5531998832751.
function telefoneFormatado(telefone) {
  const d = String(telefone || '').replace(/\D/g, '').replace(/^55/, '');
  if (d.length < 10) return telefone || '';
  const ddd = d.slice(0, 2);
  const numero = d.slice(2);
  return `(${ddd}) ${numero.slice(0, numero.length - 4)}-${numero.slice(-4)}`;
}

// Só os 4 últimos dígitos (resposta do formulário público).
function telefoneMascarado(telefone) {
  const d = String(telefone || '').replace(/\D/g, '').replace(/^55/, '');
  return `(${d.slice(0, 2)}) •••••-${d.slice(-4)}`;
}

// Envia pela conexão Z-API "Comunicação Oficial" da HORIZON. `aoFaltar` monta o erro de quem
// chamou (a API pública usa ErroApi; a tela, o erro comum com status).
async function enviarWhatsapp(telefone, mensagem, { aoFaltar, aoSemWhatsapp } = {}) {
  const integracaoId = await zapiService.conexaoOficialId();
  if (!integracaoId) throw aoFaltar();
  try {
    await zapiService.enviarMensagemTexto(integracaoId, { telefone, mensagem });
  } catch (err) {
    if (err.code === 'SEM_WHATSAPP' && aoSemWhatsapp) throw aoSemWhatsapp();
    throw err;
  }
}

async function registrarEvento(cliente, parceiroId, tipo, detalhe = null, usuarioId = null) {
  await (cliente || pool).query(
    'INSERT INTO parceiros_eventos (parceiro_id, tipo, detalhe, usuario_id) VALUES ($1, $2, $3, $4)',
    [parceiroId, tipo, detalhe, usuarioId]
  );
}

// Mensagem com as credenciais (aprovação e novo client_secret temporário).
function mensagemCredenciais(parceiro, { clientId, secretTemporario, expiraEm, novo }) {
  const nome = primeiroNome(parceiro.responsavel_nome);
  return [
    `Olá${nome ? `, ${nome}` : ''}!`,
    novo
      ? `Geramos um novo client_secret temporário para o aplicativo *${parceiro.app_nome}* no Horizon.`
      : `O aplicativo *${parceiro.app_nome}* foi aprovado como parceiro do Horizon.`,
    '',
    'Suas credenciais:',
    `client_id: ${clientId}`,
    `client_secret temporário: ${secretTemporario}`,
    '',
    `O client_secret temporário vale até ${dataHoraBr(expiraEm)} e pode ser usado uma vez só. Use-o para gerar o client_secret oficial em:`,
    linkGerarSecretOficial(),
    '',
    'Guarde o client_secret oficial em local seguro: ele aparece uma vez só e não é enviado por aqui.',
  ].join('\n');
}

module.exports = {
  PREFIXO_CLIENT_ID,
  PREFIXO_SECRET_TEMPORARIO,
  PREFIXO_SECRET_OFICIAL,
  SECRET_TEMPORARIO_DIAS,
  gerarClientId,
  gerarSegredo,
  hashSegredo,
  linkGerarSecretOficial,
  primeiroNome,
  dataHoraBr,
  telefoneFormatado,
  telefoneMascarado,
  enviarWhatsapp,
  registrarEvento,
  mensagemCredenciais,
};
