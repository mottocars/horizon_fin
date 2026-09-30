const crypto = require('crypto');
const env = require('../../config/env');

// Criptografia dos segredos das conexões API Itaú (chave privada, client_secret, resposta
// bruta) — AES-256-GCM com a chave da variável ITAU_ENCRYPTION_KEY, separada do JWT_SECRET
// (que criptografa os demais segredos do sistema em utils/crypto.js). Formato gravado:
// base64(iv[12] | authTag[16] | ciphertext) — o mesmo de utils/crypto.js.

const ALGORITHM = 'aes-256-gcm';

function erroConfiguracao() {
  const err = new Error(
    'A chave de criptografia da API Itaú (ITAU_ENCRYPTION_KEY) não está configurada no servidor — nada foi enviado ao Itaú.'
  );
  err.status = 500;
  err.expose = true;
  return err;
}

// Aceita 64 caracteres hex ou base64 de 32 bytes.
function chave() {
  const bruta = env.itau.encryptionKey.trim();
  if (!bruta) throw erroConfiguracao();
  let buffer = null;
  if (/^[0-9a-fA-F]{64}$/.test(bruta)) buffer = Buffer.from(bruta, 'hex');
  else {
    const b64 = Buffer.from(bruta, 'base64');
    if (b64.length === 32) buffer = b64;
  }
  if (!buffer) {
    const err = erroConfiguracao();
    err.message = 'ITAU_ENCRYPTION_KEY inválida: use 32 bytes em hex (64 caracteres) ou base64.';
    throw err;
  }
  return buffer;
}

// Falha cedo (antes de gerar chave / chamar o Itaú) se a chave não estiver utilizável.
function garantirChave() {
  chave();
}

function criptografar(texto) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, chave(), iv);
  const encrypted = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

function descriptografar(payload) {
  const buffer = Buffer.from(payload, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, chave(), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8');
}

module.exports = { criptografar, descriptografar, garantirChave };
