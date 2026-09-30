// Agendador do Monitor de Integrações: a cada minuto confere quais rotinas
// agendadas (diária/semanal/mensal, horário de Brasília) já estão na hora e
// dispara pelo executor — a execução em si roda em segundo plano, então o
// tick nunca fica preso esperando uma sincronização longa.
const service = require('./monitor.service');
const executor = require('./executor');

const INTERVALO_MS = 60 * 1000;

let timer = null;
let verificando = false;

async function tick() {
  if (verificando) return;
  verificando = true;
  try {
    await service.verificarAgendamentos();
  } catch (err) {
    console.error('[monitor-integracoes] falha ao verificar os agendamentos:', err.message);
  } finally {
    verificando = false;
  }
}

async function iniciar() {
  if (timer) return;
  try {
    await executor.marcarInterrompidas();
  } catch (err) {
    console.error('[monitor-integracoes] falha ao marcar execuções interrompidas:', err.message);
  }
  console.log('[monitor-integracoes] agendador iniciado — verifica as rotinas a cada 1 min.');
  timer = setInterval(tick, INTERVALO_MS);
  tick();
}

module.exports = { iniciar };
