const https = require('https');
const crypto = require('crypto');
const forge = require('node-forge');
const env = require('../../config/env');
const { httpsRequest } = require('../../utils/httpsRequest');
const { identificadorConta } = require('./itau.validacao');

// ---------------------------------------------------------------------------------------
// Chamadas ao STS / APIs do Itaú (documentação pública do devportal: "Certificado dinâmico"
// e "Autenticação mTLS - produção"). Só roda no backend. Regras:
//   - chave e CSR gerados em memória (node-forge) — sem openssl, sem arquivo em disco;
//   - a solicitação do certificado usa o token temporário de USO ÚNICO: 1 chamada, sem retry;
//   - nenhuma função daqui devolve/lança o corpo das respostas em mensagens de erro (o
//     middleware de erro faz console.error do erro inteiro) — só status code / código.
// ---------------------------------------------------------------------------------------

const STS_BASE_URL = 'https://sts.itau.com.br';
const URL_SOLICITACAO = `${STS_BASE_URL}/seguranca/v1/certificado/solicitacao`;
const URL_RENOVACAO = `${STS_BASE_URL}/seguranca/v2/certificado/renovacao`;
const URL_TOKEN = `${STS_BASE_URL}/api/oauth/token`;

// Extrato de conta corrente (confirmado com o fluxo usado pelo usuário): statementId =
// agência + "00" + conta + DAC, type=current_account e start-date no formato AAAA-MM-DD.
// Ajustável pela env ITAU_EXTRATO_URL. Placeholders: {statementId}, {dataInicio}, {dataFim}.
const EXTRATO_URL_PADRAO =
  'https://account-statement.api.itau.com/account-statement/v1/statements/{statementId}?type=current_account&start-date={dataInicio}';

const TIMEOUT_SOLICITACAO_MS = 60000;

// Passo 3: RSA 2048 + CSR SHA-512 — equivalente a
//   openssl req -new -newkey rsa:2048 -nodes -sha512 -subj "/CN=.../OU=.../L=.../ST=.../C=BR"
// Os campos vão como UTF8String (como o openssl faz por padrão, string_mask utf8only) e o país
// como PrintableString (exigência do X.520 pra countryName).
function gerarChaveECsr(subject) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;
  const UTF8 = forge.asn1.Type.UTF8;
  csr.setSubject([
    { shortName: 'CN', value: subject.CN, valueTagClass: UTF8 },
    { shortName: 'OU', value: subject.OU, valueTagClass: UTF8 },
    { shortName: 'L', value: subject.L, valueTagClass: UTF8 },
    { shortName: 'ST', value: subject.ST, valueTagClass: UTF8 },
    { shortName: 'C', value: subject.C, valueTagClass: forge.asn1.Type.PRINTABLESTRING },
  ]);
  csr.sign(keys.privateKey, forge.md.sha512.create());
  return {
    // PKCS#8 ("BEGIN PRIVATE KEY"), o mesmo formato que o openssl req -nodes grava.
    chavePem: forge.pki.privateKeyInfoToPem(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(keys.privateKey))),
    csrPem: forge.pki.certificationRequestToPem(csr),
  };
}

// Passo 7 (+ conferência): o certificado tem que ser da chave que geramos (senão o mTLS nunca
// funcionaria). Devolve a validade (notAfter) ou null se não bater / não der pra ler.
function lerCertificado(certificadoPem, chavePem) {
  try {
    const primeiro = certificadoPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)[0];
    const cert = forge.pki.certificateFromPem(primeiro);
    const chave = forge.pki.privateKeyFromPem(chavePem);
    if (cert.publicKey.n.compareTo(chave.n) !== 0 || cert.publicKey.e.compareTo(chave.e) !== 0) return null;
    return { validade: cert.validity.notAfter };
  } catch {
    return null;
  }
}

function criarAgente(chavePem, certificadoPem) {
  // Sem `ca` (mesmo motivo de espiao.service.js::carregarAgente): o `ca` substituiria as
  // raízes confiáveis usadas pra validar o SERVIDOR do Itaú.
  return new https.Agent({ key: chavePem, cert: certificadoPem, keepAlive: false });
}

function codigoFalhaRede(err) {
  return /tempo limite|timeout|ETIMEDOUT/i.test(err?.message || '') ? 'TIMEOUT' : 'REDE';
}

// Passo 5: UMA chamada, sem retry. { statusCode, corpo } ou { falhaRede: 'TIMEOUT'|'REDE' }.
async function solicitarCertificado({ tokenTemporario, csrPem }) {
  try {
    const resposta = await httpsRequest({
      method: 'POST',
      url: URL_SOLICITACAO,
      headers: {
        'Content-Type': 'text/plain',
        Authorization: `Bearer ${tokenTemporario}`,
        'Content-Length': Buffer.byteLength(csrPem),
      },
      body: csrPem,
      timeoutMs: TIMEOUT_SOLICITACAO_MS,
    });
    return { statusCode: resposta.statusCode, corpo: resposta.body.toString('utf8') };
  } catch (err) {
    return { falhaRede: codigoFalhaRede(err) };
  }
}

// Passo 8 / uso posterior: client_credentials com mTLS.
// { ok: true, accessToken, expiresIn } ou { ok: false, codigo } (HTTP status, TIMEOUT, REDE).
async function pedirAccessToken({ agente, clientId, clientSecret }) {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString();
  let resposta;
  try {
    resposta = await httpsRequest({
      method: 'POST',
      url: URL_TOKEN,
      agent: agente,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
      body,
      timeoutMs: 30000,
    });
  } catch (err) {
    return { ok: false, codigo: codigoFalhaRede(err) };
  }
  let json = null;
  try {
    json = JSON.parse(resposta.body.toString('utf8'));
  } catch {
    // corpo não-JSON — tratado como falha abaixo
  }
  if (resposta.statusCode !== 200 || !json?.access_token) return { ok: false, codigo: String(resposta.statusCode) };
  return { ok: true, accessToken: json.access_token, expiresIn: Number(json.expires_in) || 300 };
}

// Renovação anual (só aceita nos últimos 30 dias de validade): mTLS com o certificado atual,
// Bearer <access_token>, CSR novo no corpo. Mesmo formato de resposta da solicitação.
async function renovarCertificado({ agente, accessToken, csrPem }) {
  try {
    const resposta = await httpsRequest({
      method: 'POST',
      url: URL_RENOVACAO,
      agent: agente,
      headers: {
        'Content-Type': 'text/plain',
        Authorization: `Bearer ${accessToken}`,
        'x-itau-force-cert': 'true',
        'Content-Length': Buffer.byteLength(csrPem),
      },
      body: csrPem,
      timeoutMs: TIMEOUT_SOLICITACAO_MS,
    });
    return { statusCode: resposta.statusCode, corpo: resposta.body.toString('utf8') };
  } catch (err) {
    return { falhaRede: codigoFalhaRede(err) };
  }
}

function montarUrlExtrato(conta, { dataInicio, dataFim }) {
  const modelo = env.itau.extratoUrl || EXTRATO_URL_PADRAO;
  return modelo
    .replaceAll('{statementId}', identificadorConta(conta))
    .replaceAll('{dataInicio}', dataInicio)
    .replaceAll('{dataFim}', dataFim);
}

// { statusCode } ou { falhaRede } — o corpo não sai daqui (pode ter dados bancários).
async function consultarExtrato({ agente, accessToken, clientId, conta, dataInicio, dataFim }) {
  try {
    const resposta = await httpsRequest({
      method: 'GET',
      url: montarUrlExtrato(conta, { dataInicio, dataFim }),
      agent: agente,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'x-itau-apikey': clientId,
        'x-itau-correlationID': crypto.randomUUID(),
        Accept: 'application/json',
      },
      timeoutMs: 30000,
    });
    return { statusCode: resposta.statusCode };
  } catch (err) {
    return { falhaRede: codigoFalhaRede(err) };
  }
}

module.exports = {
  gerarChaveECsr,
  lerCertificado,
  criarAgente,
  solicitarCertificado,
  pedirAccessToken,
  renovarCertificado,
  consultarExtrato,
  montarUrlExtrato,
};
