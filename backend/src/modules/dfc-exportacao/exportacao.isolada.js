const path = require('path');
const { Worker } = require('worker_threads');
const pool = require('../../config/db');

// O Excel do DFC fora da thread que atende o sistema (exportacao.worker.js) — o mesmo esquema do Excel de auditoria
// da DRE (dre-exportacao/exportacao.isolada.js). Usado pelo anexo dos Workflows (versões da DFC), que roda em
// segundo plano e não pode prender o backend enquanto monta a planilha:
//   - a planilha é montada num worker (outro núcleo da VPS), com teto de memória próprio;
//   - uma exportação por vez (as outras esperam na fila) — duas pesadas juntas disputariam CPU e memória;
//   - quem desiste (fecha a aba, cancela o download) sai da fila ou tem o worker encerrado na hora;
//   - tempo máximo: passou disso, o worker é encerrado e o usuário recebe um aviso pra reduzir o período.
// Mesma assinatura de exportacao.excel.js::gerar + `opcoes.sinal` (AbortSignal, opcional).

const MEMORIA_MB = Number(process.env.DFC_EXCEL_MEMORIA_MB) || 4096;
const TEMPO_MAX_MS = Number(process.env.DFC_EXCEL_TEMPO_MAX_MS) || 10 * 60 * 1000;
const FILA_MAX = 5;
const ARQUIVO = path.join(__dirname, 'exportacao.worker.js');

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// O contexto da versão da DFC (config/db.js usa o searchPath; o resto da DFC lê `dfc`) — atravessa pro worker por cópia.
function contextoSerializavel() {
  const c = pool.contextoAtual();
  if (!c || c.sistema !== 'dfc') return null;
  return { sistema: 'dfc', dfc: c.dfc, searchPath: c.searchPath };
}

let ocupado = false;
const fila = [];

function proximo() {
  if (ocupado) return;
  const tarefa = fila.shift();
  if (!tarefa) return;
  ocupado = true;
  executar(tarefa).finally(() => {
    ocupado = false;
    proximo();
  });
}

function executar({ dados, sinal, resolve, reject }) {
  return new Promise((fim) => {
    if (sinal?.aborted) {
      reject(erro(499, 'Exportação cancelada.'));
      return fim();
    }
    const worker = new Worker(ARQUIVO, {
      workerData: dados,
      resourceLimits: { maxOldGenerationSizeMb: MEMORIA_MB },
    });
    let terminou = false;
    const encerrar = (falha) => {
      if (terminou) return;
      terminou = true;
      clearTimeout(relogio);
      sinal?.removeEventListener('abort', aoCancelar);
      if (falha) {
        worker.terminate().catch(() => {});
        reject(falha);
      }
      fim();
    };
    const relogio = setTimeout(
      () => encerrar(erro(422, 'O Excel deste período é grande demais e passou do tempo máximo. Reduza o período (ex.: um ano) ou filtre os centros.')),
      TEMPO_MAX_MS
    );
    const aoCancelar = () => encerrar(erro(499, 'Exportação cancelada.'));
    sinal?.addEventListener('abort', aoCancelar, { once: true });

    worker.on('message', (m) => {
      if (terminou) return;
      if (m.ok) {
        resolve({ buffer: Buffer.from(m.buffer.buffer, m.buffer.byteOffset, m.buffer.byteLength), nome: m.nome });
        encerrar(null);
      } else {
        const e = new Error(m.erro.message);
        e.status = m.erro.status;
        e.expose = m.erro.expose;
        e.stack = m.erro.stack;
        encerrar(e);
      }
    });
    worker.on('error', (e) => {
      const semMemoria = e?.code === 'ERR_WORKER_OUT_OF_MEMORY';
      if (semMemoria) console.error(`[dfc-exportacao] Excel passou de ${MEMORIA_MB} MB e foi encerrado (empresa ${dados.empresaId}, ${dados.filtros.inicio} a ${dados.filtros.fim}).`);
      encerrar(semMemoria ? erro(422, 'O Excel deste período é grande demais para gerar. Reduza o período (ex.: um ano) ou filtre os centros.') : e);
    });
    worker.on('exit', (codigo) => {
      if (!terminou) encerrar(new Error(`A geração do Excel terminou sem resposta (código ${codigo}).`));
    });
  });
}

async function gerar(empresaId, filtros, usuarioId, { sinal } = {}) {
  if (fila.length >= FILA_MAX) throw erro(429, 'Há muitas exportações do Excel do DFC na fila. Tente de novo em alguns minutos.');
  const dados = { empresaId, filtros, usuarioId, contexto: contextoSerializavel() };
  return new Promise((resolve, reject) => {
    const tarefa = { dados, sinal, resolve, reject };
    if (sinal) {
      // Desistiu enquanto esperava na fila: sai dela sem nem abrir o worker.
      sinal.addEventListener(
        'abort',
        () => {
          const i = fila.indexOf(tarefa);
          if (i >= 0) {
            fila.splice(i, 1);
            reject(erro(499, 'Exportação cancelada.'));
          }
        },
        { once: true }
      );
    }
    fila.push(tarefa);
    proximo();
  });
}

module.exports = { gerar };
