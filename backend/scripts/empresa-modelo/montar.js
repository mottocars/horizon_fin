#!/usr/bin/env node
// Monta (ou remonta) a empresa modelo HZN CONSTRUTORA — só mexe nela e na equipe fictícia.
//   node scripts/empresa-modelo/montar.js            → monta e grava (COMMIT)
//   node scripts/empresa-modelo/montar.js --ensaio   → monta e desfaz (ROLLBACK), só para conferir
// Na VPS: docker exec -w /app horizonfin-backend-1 node scripts/empresa-modelo/montar.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const pool = require('../../src/config/db');
const { montarEmpresaModelo } = require('../../src/modules/empresa-modelo/montar');
const { auditar } = require('../../src/modules/empresa-modelo/auditoria');

// Pós-processamento interno (sem chamada externa), depois do COMMIT: os serviços usam o pool
// e só enxergam o que já foi gravado — clusters de cobrança e distribuição do dia.
async function posProcessar(modelo, equipe) {
  const clusters = require('../../src/modules/cobranca-clusters/cobrancaClusters.service');
  const distribuicao = require('../../src/modules/regua-cobranca/distribuicao.service');
  // Estatísticas do planejador depois da carga em massa (sem isto a DRE da empresa modelo leva
  // ~2 min em vez de ~2 s até o autovacuum passar).
  const t = Date.now();
  await pool.query('ANALYZE');
  console.log(`ANALYZE: ${((Date.now() - t) / 1000).toFixed(1)} s`);
  const rc = await clusters.recalcularClusters(modelo, equipe[0]).catch((e) => ({ erro: e.message }));
  console.log('Clusters recalculados:', JSON.stringify(rc).slice(0, 300));
  const rd = await distribuicao.distribuirDia(modelo, { usuarioId: equipe[2] }).catch((e) => ({ erro: e.message }));
  console.log('Distribuição do dia:', JSON.stringify(rd).slice(0, 300));
}

const apenasPos = process.argv.includes('--pos');
const ensaio = process.argv.includes('--ensaio');
const etapasArg = process.argv.find((a) => a.startsWith('--etapas='));
const etapas = etapasArg ? etapasArg.slice(9).split(',') : null;

(async () => {
  if (apenasPos) {
    const { rows } = await pool.query('SELECT id FROM empresas WHERE empresa_modelo');
    const { rows: eq } = await pool.query(
      'SELECT u.id FROM usuarios u JOIN usuarios_empresas ue ON ue.usuario_id = u.id WHERE ue.empresa_id = $1 ORDER BY u.id',
      [rows[0].id]
    );
    await posProcessar(rows[0].id, eq.map((e) => e.id));
    await pool.end();
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await montarEmpresaModelo(client, { log: (m) => console.log(m), etapas, ensaio });
    const achados = await auditar(client, r.modelo, { log: (m) => console.log(m) });
    if (achados.length) {
      console.log(`\nAUDITORIA: ${achados.length} ocorrência(s) proibida(s) — nada foi gravado.`);
      for (const a of achados.slice(0, 60)) console.log(`  ${a.tabela}.${a.coluna}: ${a.amostra}`);
      await client.query('ROLLBACK');
      process.exitCode = 2;
      return;
    }
    if (ensaio) {
      await client.query('ROLLBACK');
      console.log('\nEnsaio: tudo desfeito (ROLLBACK).');
    } else {
      await client.query('COMMIT');
      console.log(`\nEmpresa modelo gravada (empresa ${r.modelo}).`);
      await posProcessar(r.modelo, r.equipe);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Falhou — nada foi gravado:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
