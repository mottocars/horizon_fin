// Roda numa thread separada (worker_threads) — ver exportacao.isolada.js. Monta o Excel do DFC
// (exportacao.excel.js::gerar) longe da thread que atende o sistema (o mesmo esquema do Excel da DRE).
//
// Recebe { empresaId, filtros, usuarioId, contexto } e devolve { ok, buffer, nome } ou { ok: false, erro }.
// `contexto`: o da versão da DFC (config/db.js usa o searchPath dele), reaplicado aqui dentro.
const { parentPort, workerData } = require('worker_threads');
const pool = require('../../config/db');
const excel = require('./exportacao.excel');

async function principal() {
  const { empresaId, filtros, usuarioId, contexto } = workerData;
  const gerar = () => excel.gerar(empresaId, filtros, usuarioId);
  try {
    const { buffer, nome } = contexto ? await pool.comContexto(contexto, gerar) : await gerar();
    // Copia pra um ArrayBuffer próprio e transfere (sem segunda cópia ao atravessar pra thread principal).
    const bytes = Uint8Array.from(buffer);
    parentPort.postMessage({ ok: true, buffer: bytes, nome }, [bytes.buffer]);
  } catch (err) {
    parentPort.postMessage({
      ok: false,
      erro: { message: err.message, status: err.status, expose: err.expose, stack: err.stack },
    });
  } finally {
    await pool.end().catch(() => {});
  }
}

principal();
