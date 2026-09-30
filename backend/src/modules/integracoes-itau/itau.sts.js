const https = require('https');
const crypto = require('crypto');
const forge = require('node-forge');
const env = require('../../config/env');
const { httpsRequest } = require('../../utils/httpsRequest');

// ---------------------------------------------------------------------------------------
// Certificado dinâmico + STS do Itaú (documentação pública do devportal: "Certificado
// dinâmico" e "Autenticação mTLS - produção"). Fluxo:
//   1. Chave RSA 2048 + CSR assinado em SHA-512, subject CN=<client_id> (TEM que ser
//      exatamente o client_id — é o que o STS valida), OU=<aplicação>, L=<cidade>, ST=<UF>, C=BR.
//   2. POST /seguranca/v1/certificado/solicitacao — Bearer <token temporário>, corpo = CSR em
//      texto puro. Resposta em texto: client_secret na 1ª linha + certificado PEM.
//   3. POST /api/oauth/token com mTLS (certificado + chave) e client_credentials → access_token
//      de 300 s (renovado aqui automaticamente, com cache em memória).
//   4. Renovação anual: POST /seguranca/v2/certificado/renovacao com mTLS, Bearer
//      <access_token>, x-itau-force-cert: true e um CSR NOVO — só aceita nos últimos 30 dias
//      de validade (erro C700 antes disso). Vencido: só com um novo token temporário do Itaú.
// Tudo com node-forge (já usado no Espião/Certificados) — não depende do openssl do sistema.
// ---------------------------------------------------------------------------------------

const STS_BASE_URL = 'https://sts.itau.com.br';
const URL_SOLICITACAO = `${STS_BASE_URL}/seguranca/v1/certificado/solicitacao`;
const URL_RENOVACAO = `${STS_BASE_URL}/seguranca/v2/certificado/renovacao`;
const URL_TOKEN = `${STS_BASE_URL}/api/oauth/token`;

// A especificação da API de Extrato fica atrás do login do devportal — endereço provisório,
// ajustável sem deploy de código pela env ITAU_EXTRATO_URL. Placeholders: {statementId}
// (agência + "00" + conta + DAC), {dataInicio} e {dataFim} (AAAA-MM-DD).
const EXTRATO_URL_PADRAO = 'https://account-statement.api.itau.com/account-statement/v1/statements/{statementId}';

const DIAS_JANELA_RENOVACAO = 30;

// PrintableString (o tipo que o node-forge usa no subject) não aceita acento nem vários
// símbolos — "São Paulo" viraria um CSR inválido. O Itaú só valida o CN (client_id), então
// normalizar OU/L/ST pro alfabeto permitido é seguro.
function textoCertificado(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 '()+,\-./:=?]/g, '')
    .trim();
}

function gerarChaveECsr({ clientId, ou, cidade, uf }) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;
  csr.setSubject([
    { name: 'commonName', value: String(clientId).trim() },
    { shortName: 'OU', value: textoCertificado(ou) },
    { name: 'localityName', value: textoCertificado(cidade) },
    { shortName: 'ST', value: textoCertificado(uf).toUpperCase() },
    { name: 'countryName', value: 'BR' },
  ]);
  csr.sign(keys.privateKey, forge.md.sha512.create());
  return {
    chavePem: forge.pki.privateKeyToPem(keys.privateKey),
    csrPem: forge.pki.certificationRequestToPem(csr),
  };
}

// O subject gravado no CSR bate com os dados atuais da conexão? Se bater, uma nova tentativa
// de emissão reaproveita a MESMA chave/CSR (não troca a chave a cada clique/erro de rede).
function csrConfere(csrPem, { clientId, ou, cidade, uf }) {
  try {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    const campo = (nome) => csr.subject.getField(nome)?.value;
    return (
      campo('CN') === String(clientId).trim() &&
      campo('OU') === textoCertificado(ou) &&
      campo('L') === textoCertificado(cidade) &&
      campo('ST') === textoCertificado(uf).toUpperCase()
    );
  } catch {
    return false;
  }
}

const REGEX_CERTIFICADO = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

// Resposta da emissão/renovação: texto com o client_secret na 1ª linha (normalmente
// "Secret: <valor>") e o certificado PEM em seguida. Aceita também JSON, caso o Itaú devolva
// nesse formato em alguma versão — melhor tolerar do que perder a resposta (o token é de uso
// único). Devolve { secret, certificadoPem } (qualquer um pode vir null).
function parseRespostaEmissao(texto) {
  const bruto = String(texto || '');

  try {
    const json = JSON.parse(bruto);
    if (json && typeof json === 'object') {
      const secret = json.client_secret || json.clientSecret || json.secret || null;
      const cert = json.certificate || json.certificado || json.crt || '';
      const certs = String(cert).match(REGEX_CERTIFICADO);
      return { secret, certificadoPem: certs ? certs.join('\n') : null };
    }
  } catch {
    // não é JSON — segue no formato texto
  }

  const certs = bruto.match(REGEX_CERTIFICADO);
  const semCertificados = bruto.replace(REGEX_CERTIFICADO, '');
  const linhaSecret = semCertificados.match(/^\s*(?:client[_ -]?)?secret\s*[:=]\s*(\S+)\s*$/im);
  let secret = linhaSecret ? linhaSecret[1] : null;
  if (!secret) {
    const primeira = semCertificados.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
    secret = primeira && !/\s/.test(primeira) ? primeira : null;
  }
  return { secret, certificadoPem: certs ? certs.join('\n') : null };
}

// Confere que o certificado devolvido é da chave que geramos (senão o mTLS nunca funcionaria)
// e lê a validade. Lança erro com mensagem legível se não bater.
function validarCertificado(certificadoPem, chavePem) {
  const primeiro = certificadoPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)[0];
  const cert = forge.pki.certificateFromPem(primeiro);
  const chave = forge.pki.privateKeyFromPem(chavePem);
  if (cert.publicKey.n.compareTo(chave.n) !== 0 || cert.publicKey.e.compareTo(chave.e) !== 0) {
    throw new Error('O certificado devolvido pelo Itaú não corresponde à chave privada gerada para esta conexão.');
  }
  return { validade: cert.validity.notAfter, emitidoEm: cert.validity.notBefore };
}

function criarAgente(chavePem, certificadoPem) {
  // Sem `ca` (mesmo motivo de espiao.service.js::carregarAgente): o `ca` substituiria as
  // raízes confiáveis usadas pra validar o SERVIDOR do Itaú.
  return new https.Agent({ key: chavePem, cert: certificadoPem, keepAlive: false });
}

// Mensagem de erro do Itaú em formato legível — os erros do STS às vezes vêm em JSON
// ({ codigo/code, mensagem/message }) e às vezes em texto.
function mensagemErroItau(statusCode, corpo) {
  const texto = String(corpo || '').trim();
  let detalhe = texto;
  try {
    const json = JSON.parse(texto);
    const codigo = json.codigo || json.code || json.error || '';
    const msg = json.mensagem || json.message || json.error_description || json.detail || '';
    detalhe = [codigo, msg].filter(Boolean).join(' — ') || texto;
  } catch {
    // texto puro
  }
  return `HTTP ${statusCode}${detalhe ? `: ${detalhe.slice(0, 500)}` : ''}`;
}

class ErroItau extends Error {
  constructor(message, { statusCode, corpo } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.corpo = corpo;
  }
}

async function solicitarCertificado({ tokenTemporario, csrPem }) {
  let resposta;
  try {
    resposta = await httpsRequest({
      method: 'POST',
      url: URL_SOLICITACAO,
      headers: {
        Authorization: `Bearer ${tokenTemporario}`,
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(csrPem),
      },
      body: csrPem,
      timeoutMs: 60000,
    });
  } catch (err) {
    throw new ErroItau(`Não foi possível conectar ao Itaú (${err.message}).`);
  }
  const corpo = resposta.body.toString('utf8');
  return { statusCode: resposta.statusCode, corpo };
}

async function renovarCertificadoItau({ agente, accessToken, csrPem }) {
  let resposta;
  try {
    resposta = await httpsRequest({
      method: 'POST',
      url: URL_RENOVACAO,
      agent: agente,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'text/plain',
        'x-itau-force-cert': 'true',
        'Content-Length': Buffer.byteLength(csrPem),
      },
      body: csrPem,
      timeoutMs: 60000,
    });
  } catch (err) {
    throw new ErroItau(`Não foi possível conectar ao Itaú (${err.message}).`);
  }
  return { statusCode: resposta.statusCode, corpo: resposta.body.toString('utf8') };
}

// access_token vale 300 s — cache por conexão até 30 s antes de vencer. A chave do cache
// inclui o início do certificado, então renovar/reemitir invalida sozinho.
const cacheTokens = new Map();

async function obterAccessToken({ integracaoId, clientId, clientSecret, agente, certificadoPem }) {
  const chaveCache = `${integracaoId}:${crypto.createHash('sha1').update(certificadoPem).digest('hex')}`;
  const emCache = cacheTokens.get(chaveCache);
  if (emCache && emCache.expiraEm > Date.now()) return emCache.token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  }).toString();

  let resposta;
  try {
    resposta = await httpsRequest({
      method: 'POST',
      url: URL_TOKEN,
      agent: agente,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
      timeoutMs: 30000,
    });
  } catch (err) {
    throw new ErroItau(`Não foi possível conectar ao STS do Itaú (${err.message}).`);
  }

  const corpo = resposta.body.toString('utf8');
  let json = null;
  try {
    json = JSON.parse(corpo);
  } catch {
    // tratado abaixo
  }
  if (resposta.statusCode !== 200 || !json?.access_token) {
    throw new ErroItau(`O Itaú recusou a geração do access token (${mensagemErroItau(resposta.statusCode, corpo)}).`, {
      statusCode: resposta.statusCode,
      corpo,
    });
  }

  const expiraEmSeg = Number(json.expires_in) || 300;
  cacheTokens.set(chaveCache, { token: json.access_token, expiraEm: Date.now() + Math.max(30, expiraEmSeg - 30) * 1000 });
  return json.access_token;
}

function limparCacheToken(integracaoId) {
  for (const chave of cacheTokens.keys()) {
    if (chave.startsWith(`${integracaoId}:`)) cacheTokens.delete(chave);
  }
}

function statementId({ agencia, conta, dac }) {
  return `${agencia}00${conta}${dac}`;
}

function montarUrlExtrato(conta, { dataInicio, dataFim }) {
  const modelo = env.itau.extratoUrl || EXTRATO_URL_PADRAO;
  return modelo
    .replaceAll('{statementId}', encodeURIComponent(statementId(conta)))
    .replaceAll('{dataInicio}', dataInicio)
    .replaceAll('{dataFim}', dataFim);
}

async function consultarExtrato({ agente, accessToken, clientId, conta, dataInicio, dataFim }) {
  const url = montarUrlExtrato(conta, { dataInicio, dataFim });
  let resposta;
  try {
    resposta = await httpsRequest({
      method: 'GET',
      url,
      agent: agente,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-itau-apikey': clientId,
        'x-itau-correlationID': crypto.randomUUID(),
        Accept: 'application/json',
      },
      timeoutMs: 30000,
    });
  } catch (err) {
    return { url, erroRede: err.message };
  }
  return { url, statusCode: resposta.statusCode, corpo: resposta.body.toString('utf8') };
}

module.exports = {
  DIAS_JANELA_RENOVACAO,
  ErroItau,
  gerarChaveECsr,
  csrConfere,
  parseRespostaEmissao,
  validarCertificado,
  criarAgente,
  mensagemErroItau,
  solicitarCertificado,
  renovarCertificadoItau,
  obterAccessToken,
  limparCacheToken,
  statementId,
  consultarExtrato,
};
