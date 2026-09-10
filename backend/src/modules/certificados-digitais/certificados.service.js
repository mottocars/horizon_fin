const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const forge = require('node-forge');
const pool = require('../../config/db');
const { encrypt } = require('../../utils/crypto');

const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'certificados');

function lerDadosPfx(buffer, senha) {
  let p12Asn1;
  try {
    const der = forge.util.createBuffer(buffer.toString('binary'));
    p12Asn1 = forge.asn1.fromDer(der);
  } catch {
    const err = new Error('Arquivo inválido. Envie um certificado .pfx válido.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);
  } catch {
    const err = new Error('Não foi possível abrir o certificado — verifique a senha informada.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = (bags[forge.pki.oids.certBag] || [])[0];
  if (!certBag) {
    const err = new Error('Nenhum certificado encontrado dentro do arquivo .pfx.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const { cert } = certBag;
  const cnField = cert.subject.getField('CN');
  const nome = cnField?.value?.trim() || cert.subject.attributes.map((a) => a.value).join(', ') || 'Certificado sem nome';

  return { nome, validadeAte: cert.validity.notAfter };
}

function nomeArquivoUnico(originalName) {
  const ext = path.extname(originalName) || '.pfx';
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

function removerArquivoFisico(arquivoArmazenado) {
  if (!arquivoArmazenado) return;
  const caminho = path.join(UPLOADS_DIR, arquivoArmazenado);
  fs.unlink(caminho, () => {});
}

async function listPorEmpresa(empresaId) {
  const { rows } = await pool.query(
    `SELECT id, empresa_id, nome, arquivo_original, validade_ate, criado_em, atualizado_em
     FROM certificados_digitais
     WHERE empresa_id = $1
     ORDER BY nome ASC`,
    [empresaId]
  );
  return rows;
}

async function getById(id) {
  const { rows } = await pool.query('SELECT * FROM certificados_digitais WHERE id = $1', [id]);
  return rows[0] || null;
}

async function substituirLinha(existente, { nome, validadeAte, senha, tempFilePath, originalName }) {
  const empresaDir = path.join(UPLOADS_DIR, String(existente.empresa_id));
  fs.mkdirSync(empresaDir, { recursive: true });
  const arquivoArmazenado = path.join(String(existente.empresa_id), nomeArquivoUnico(originalName));
  fs.copyFileSync(tempFilePath, path.join(UPLOADS_DIR, arquivoArmazenado));

  const { rows } = await pool.query(
    `UPDATE certificados_digitais SET
       nome = $1, arquivo_original = $2, arquivo_armazenado = $3, senha_enc = $4, validade_ate = $5
     WHERE id = $6
     RETURNING id, empresa_id, nome, arquivo_original, validade_ate, criado_em, atualizado_em`,
    [nome, originalName, arquivoArmazenado, encrypt(senha), validadeAte, existente.id]
  );

  removerArquivoFisico(existente.arquivo_armazenado);
  return rows[0];
}

// Ao instalar um certificado com o mesmo nome (lido do próprio .pfx) de um já
// cadastrado para a empresa, substitui o existente em vez de duplicar.
async function criar(empresaId, { senha, tempFilePath, originalName }) {
  const buffer = fs.readFileSync(tempFilePath);
  const { nome, validadeAte } = lerDadosPfx(buffer, senha);

  const { rows: existentes } = await pool.query(
    'SELECT * FROM certificados_digitais WHERE empresa_id = $1 AND nome = $2',
    [empresaId, nome]
  );
  if (existentes[0]) {
    return substituirLinha(existentes[0], { nome, validadeAte, senha, tempFilePath, originalName });
  }

  const empresaDir = path.join(UPLOADS_DIR, String(empresaId));
  fs.mkdirSync(empresaDir, { recursive: true });
  const arquivoArmazenado = path.join(String(empresaId), nomeArquivoUnico(originalName));
  fs.copyFileSync(tempFilePath, path.join(UPLOADS_DIR, arquivoArmazenado));

  const { rows } = await pool.query(
    `INSERT INTO certificados_digitais
       (empresa_id, nome, arquivo_original, arquivo_armazenado, senha_enc, validade_ate)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, empresa_id, nome, arquivo_original, validade_ate, criado_em, atualizado_em`,
    [empresaId, nome, originalName, arquivoArmazenado, encrypt(senha), validadeAte]
  );
  return rows[0];
}

async function substituir(id, { senha, tempFilePath, originalName }) {
  const existente = await getById(id);
  if (!existente) return null;

  const buffer = fs.readFileSync(tempFilePath);
  const { nome, validadeAte } = lerDadosPfx(buffer, senha);

  return substituirLinha(existente, { nome, validadeAte, senha, tempFilePath, originalName });
}

module.exports = { listPorEmpresa, getById, criar, substituir };
