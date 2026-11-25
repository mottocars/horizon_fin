// Roda numa thread separada (worker_threads) — ver exportacao.isolada.js. Monta o Excel de auditoria da DRE
// (exportacao.excel.js::gerar) longe da thread que atende o sistema: um período longo (ex.: 2020 a 2026, todos
// os centros) leva minutos de CPU e gigas de memória, e na thread principal isso travava o sistema inteiro
// para todos (25/11/2026). Aqui ele usa outro núcleo, com teto de memória próprio; se estourar, só o worker morre.
//
// Recebe { tipo, empresaId, filtros, usuarioId, contexto } e devolve { ok, buffer, nome } ou { ok: false, erro }.
// `contexto`: o da versão da DRE do pedido (config/db.js usa o searchPath dele), reaplicado aqui dentro.
const { parentPort, workerData } = require('worker_threads');
const pool = require('../../config/db');
const excel = require('./exportacao.excel');

// `tipo`: 'dre' (o Excel de auditoria) ou 'financeiro' (aba Financeiro, todos os exercícios —
// dre-financeiro/financeiro.excel.js), na mesma fila.
async function principal() {
  const { tipo, empresaId, filtros, usuarioId, contexto } = workerData;
  const gerar = () =>
    tipo === 'financeiro'
      ? require('../dre-financeiro/financeiro.excel').gerar(empresaId, usuarioId)
      : excel.gerar(empresaId, filtros, usuarioId);
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
