const BANCOS_URL = 'https://brasilapi.com.br/api/banks/v1';
const TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 15_000;

// A lista de bancos praticamente não muda, então fica em memória por 24h em vez
// de bater na BrasilAPI a cada abertura da tela. Se a API cair depois de já ter
// sido carregada uma vez, a lista vencida continua sendo servida.
let cache = null; // { bancos, expiraEm }
let emAndamento = null;

function erroExpose(message) {
  const e = new Error(message);
  e.status = 502;
  e.expose = true;
  return e;
}

// Bancos que não existem no sistema bancário brasileiro mas precisam estar na lista de
// escolha — contas sem banco de verdade por trás. Têm prioridade sobre a BrasilAPI se
// algum dia o código coincidir. Pra criar outro, é só acrescentar aqui.
const BANCOS_INTERNOS = [{ codigo: '000', nome: 'Movimento Interno', ispb: null, logo: null }];

// A BrasilAPI traz `logo_url` (SVG/PNG quadrado servido pelo jsDelivr) pra cerca de 1/3 dos
// bancos. Só aceita https — a tela usa direto num <img>, então nada de esquema estranho.
function logoDe(banco) {
  return typeof banco?.logo_url === 'string' && banco.logo_url.startsWith('https://') ? banco.logo_url : null;
}

// A BrasilAPI mistura bancos com sistemas do Banco Central e da B3 — entradas sem
// código (Selic, Bacen, CIP...) ou com código 0 (Balcão/Câmara/Câmbio B3), que não
// são bancos e não aparecem no cadastro de contas. (O 000 da lista é o interno acima,
// não o da B3.)
function normalizar(lista) {
  const porCodigo = new Map(BANCOS_INTERNOS.map((b) => [b.codigo, { ...b }]));
  for (const b of lista) {
    if (!Number.isInteger(b?.code) || b.code <= 0) continue;
    const codigo = String(b.code).padStart(3, '0');
    if (porCodigo.has(codigo)) continue;
    porCodigo.set(codigo, {
      codigo,
      nome: (b.fullName || b.name || '').trim(),
      ispb: b.ispb,
      logo: logoDe(b),
    });
  }
  return [...porCodigo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
}

async function buscarBancos() {
  let response;
  try {
    response = await fetch(BANCOS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const motivo = err?.name === 'TimeoutError' ? ' (tempo limite excedido)' : '';
    throw erroExpose(`Não foi possível consultar a lista de bancos${motivo}.`);
  }

  if (!response.ok) {
    throw erroExpose(`A API de bancos retornou erro (status ${response.status}).`);
  }

  const lista = await response.json();
  if (!Array.isArray(lista)) throw erroExpose('A API de bancos retornou um formato inesperado.');

  const bancos = normalizar(lista);
  // Os internos sempre estão na lista, então só valem como "vazio" se não veio banco algum da API.
  if (bancos.length <= BANCOS_INTERNOS.length) throw erroExpose('A API de bancos não retornou nenhum banco.');
  return bancos;
}

async function getBancos() {
  if (cache && cache.expiraEm > Date.now()) return cache.bancos;

  // Duas telas abrindo ao mesmo tempo compartilham a mesma chamada.
  if (!emAndamento) {
    emAndamento = buscarBancos()
      .then((bancos) => {
        cache = { bancos, expiraEm: Date.now() + TTL_MS };
        return bancos;
      })
      .finally(() => {
        emAndamento = null;
      });
  }

  try {
    return await emAndamento;
  } catch (err) {
    if (cache) {
      console.warn('[bancos-api] falha ao atualizar a lista, usando a última carregada:', err.message);
      return cache.bancos;
    }
    throw err;
  }
}

module.exports = { getBancos, normalizar };
