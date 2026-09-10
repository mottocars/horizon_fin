const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1500;
// Sem isso, uma chamada que o Sienge nunca responde (conexão aceita, sem
// erro nem resposta) trava o request inteiro pra sempre — já aconteceu em
// teste. bulk-data pode devolver payloads grandes, por isso a margem alta.
const TIMEOUT_MS = 120_000;
// Falha de conexão (reset, recusada, DNS falhando na hora, etc.) na API do
// Sienge se mostrou intermitente na prática — a mesma chamada que falhou
// funcionou de novo poucos minutos depois, sem nada mudar do nosso lado.
// Como esse tipo de falha costuma acontecer rápido (ao contrário do
// timeout, que já esperou o TIMEOUT_MS inteiro), vale tentar de novo
// algumas vezes antes de desistir e quebrar o envio de WhatsApp/e-mail.
const MAX_RETRIES_CONEXAO = 3;
const BASE_DELAY_CONEXAO_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function siengeFetch(url, options = {}) {
  let tentativasConexao = 0;
  for (let tentativa = 0; ; tentativa++) {
    let response;
    try {
      response = await fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      const timeout = err?.name === 'TimeoutError';
      console.warn('[siengeFetch] falha de conexão:', err?.name, err?.cause?.code || err?.code || err?.message);
      if (!timeout && tentativasConexao < MAX_RETRIES_CONEXAO) {
        tentativasConexao++;
        await sleep(BASE_DELAY_CONEXAO_MS * 2 ** (tentativasConexao - 1));
        continue;
      }
      const motivo = timeout ? ' (tempo limite excedido)' : '';
      const e = new Error(`Não foi possível conectar à API do Sienge${motivo}.`);
      e.status = 502;
      e.expose = true;
      throw e;
    }

    if (response.status === 429 && tentativa < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BASE_DELAY_MS * 2 ** tentativa;
      await sleep(delayMs);
      continue;
    }

    return response;
  }
}

module.exports = { siengeFetch };
