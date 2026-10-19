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
// Erro do lado do Sienge (502/503/504 — "An invalid response was received from the upstream server")
// também é passageiro: a mesma consulta funciona segundos depois. Só repete CONSULTAS (GET) — um
// POST/PATCH que falhou no meio do caminho pode já ter sido gravado lá.
const STATUS_PASSAGEIROS = new Set([502, 503, 504]);
const MAX_RETRIES_SERVIDOR = 3;
const BASE_DELAY_SERVIDOR_MS = 2000;
// 429 com Retry-After curto (limite por minuto) vale esperar. Já o limite diário das bulk-data
// devolve Retry-After até a meia-noite UTC (21h em Brasília): esperar isso deixava a rotina
// "executando" o dia inteiro, sem log, e no fim ela caía em "tempo limite excedido".
const MAX_ESPERA_429_MS = 120_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function horaDeBrasilia(data) {
  return data.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// options.timeoutMs: tempo limite de CADA tentativa (padrão TIMEOUT_MS). Prefira a options.signal —
// um signal único continua contando durante as esperas entre tentativas e já chega vencido na
// tentativa seguinte.
async function siengeFetch(url, { timeoutMs = TIMEOUT_MS, ...options } = {}) {
  let tentativasConexao = 0;
  let tentativasServidor = 0;
  const consulta = !options.method || String(options.method).toUpperCase() === 'GET';
  for (let tentativa = 0; ; tentativa++) {
    let response;
    try {
      response = await fetch(url, { ...options, signal: options.signal ?? AbortSignal.timeout(timeoutMs) });
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

    if (consulta && STATUS_PASSAGEIROS.has(response.status) && tentativasServidor < MAX_RETRIES_SERVIDOR) {
      tentativasServidor++;
      console.warn(`[siengeFetch] Sienge respondeu ${response.status}; tentativa ${tentativasServidor} de ${MAX_RETRIES_SERVIDOR}`);
      await response.body?.cancel().catch(() => {});
      await sleep(BASE_DELAY_SERVIDOR_MS * 2 ** (tentativasServidor - 1));
      continue;
    }

    if (response.status === 429 && tentativa < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : BASE_DELAY_MS * 2 ** tentativa;
      const corpo = await response.text().catch(() => '');
      console.warn(`[siengeFetch] Sienge respondeu 429 (espera pedida ${Math.round(delayMs / 1000)} s) em ${url.split('?')[0]}: ${corpo.slice(0, 300)}`);
      if (delayMs > MAX_ESPERA_429_MS) {
        const e = new Error(
          `O Sienge recusou a consulta por limite de requisições (429). Liberação prevista em ${horaDeBrasilia(new Date(Date.now() + delayMs))}.`
        );
        e.status = 502;
        e.expose = true;
        throw e;
      }
      await sleep(delayMs);
      continue;
    }

    return response;
  }
}

module.exports = { siengeFetch };
