const { AsyncLocalStorage } = require('node:async_hooks');

// Cancelamento das rotinas do Monitor de Integrações sem passar um "signal" por todas as camadas:
// o executor roda a rotina dentro deste contexto, e quem faz trabalho longo (siengeFetch e as
// esperas entre tentativas) lê o sinal daqui. Fora de uma rotina não há sinal e nada muda.
const contexto = new AsyncLocalStorage();

function rodarCancelavel(signal, fn) {
  return contexto.run({ signal }, fn);
}

function sinalDeCancelamento() {
  return contexto.getStore()?.signal;
}

function erroCancelada() {
  const e = new Error('Atualização cancelada.');
  e.name = 'CanceladaError';
  e.cancelada = true;
  return e;
}

function verificarCancelamento() {
  if (sinalDeCancelamento()?.aborted) throw erroCancelada();
}

module.exports = { rodarCancelavel, sinalDeCancelamento, erroCancelada, verificarCancelamento };
