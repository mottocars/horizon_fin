// Preenche espiao_notas.valor_total das notas que já estavam salvas antes da
// coluna existir, lendo o XML de cada uma (mesma extração do salvamento —
// espiao.service.js::extrairValorNota). Idempotente: só mexe em quem ainda
// está com valor_total NULL. Roda onde os XMLs estão (o container do backend
// na VPS): `docker exec horizonfin-backend-1 node scripts/backfill-valor-notas.js`
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');
const { NOTAS_DIR, extrairValorNota } = require('../src/modules/espiao-nfe-nfse/espiao.service');

async function main() {
  const { rows } = await pool.query(
    'SELECT id, tipo, arquivo_armazenado FROM espiao_notas WHERE valor_total IS NULL AND arquivo_armazenado IS NOT NULL'
  );
  let preenchidas = 0;
  let semValor = 0;
  let semArquivo = 0;
  for (const nota of rows) {
    const caminho = path.join(NOTAS_DIR, nota.arquivo_armazenado);
    if (!fs.existsSync(caminho)) {
      semArquivo += 1;
      continue;
    }
    const valor = extrairValorNota(nota.tipo, fs.readFileSync(caminho));
    if (valor == null) {
      semValor += 1;
      continue;
    }
    await pool.query('UPDATE espiao_notas SET valor_total = $1 WHERE id = $2', [valor, nota.id]);
    preenchidas += 1;
  }
  console.log(JSON.stringify({ analisadas: rows.length, preenchidas, semValor, semArquivo }));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
