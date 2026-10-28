// Preenche espiao_notas.cnpj_emitente / cnpj_destinatario das notas salvas antes
// das colunas existirem (migration 2026-10-28-api-horizon.sql), lendo o XML de
// cada uma (mesma extração do salvamento — espiao.service.js::extrairCnpjsNota).
// Idempotente: só mexe em quem ainda está com algum dos dois NULL e só preenche
// o que estiver vazio. Roda onde os XMLs estão (o container do backend na VPS):
// `docker exec -w /app horizonfin-backend-1 node scripts/preencher-cnpjs-notas.js`
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');
const { NOTAS_DIR, extrairCnpjsNota } = require('../src/modules/espiao-nfe-nfse/espiao.service');

async function main() {
  const { rows } = await pool.query(
    `SELECT id, tipo, arquivo_armazenado FROM espiao_notas
     WHERE (cnpj_emitente IS NULL OR cnpj_destinatario IS NULL) AND arquivo_armazenado IS NOT NULL`
  );
  let preenchidas = 0;
  let semCnpj = 0;
  let semArquivo = 0;
  for (const nota of rows) {
    const caminho = path.join(NOTAS_DIR, nota.arquivo_armazenado);
    if (!fs.existsSync(caminho)) {
      semArquivo += 1;
      continue;
    }
    const { emitente, destinatario } = extrairCnpjsNota(nota.tipo, fs.readFileSync(caminho));
    if (!emitente && !destinatario) {
      semCnpj += 1;
      continue;
    }
    await pool.query(
      `UPDATE espiao_notas
       SET cnpj_emitente = COALESCE(cnpj_emitente, $1), cnpj_destinatario = COALESCE(cnpj_destinatario, $2)
       WHERE id = $3`,
      [emitente, destinatario, nota.id]
    );
    preenchidas += 1;
  }
  console.log(JSON.stringify({ analisadas: rows.length, preenchidas, semCnpj, semArquivo }));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
