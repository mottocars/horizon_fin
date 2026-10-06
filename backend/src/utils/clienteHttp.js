const crypto = require('crypto');
const pool = require('../config/db');

// Identifica DE ONDE vem uma chamada autenticada à API — navegador,
// celular, Postman, script Python... — pro relatório "Como cada usuário
// acessa" (Métricas de Uso). Duas pistas:
//   - User-Agent: cada programa se apresenta (PostmanRuntime/7.x,
//     python-requests/2.x, curl/8.x...). Pode ser falsificado.
//   - Cabeçalhos Sec-Fetch-*: o navegador manda sozinho em toda chamada e
//     o JavaScript da página não consegue tirar. Programas não mandam por
//     padrão — um User-Agent de navegador SEM esses cabeçalhos é alguém
//     se passando por navegador.
// É um indício forte, não prova: quem souber imitar os dois passa como
// navegador.

const SCRIPTS = [
  [/PostmanRuntime/i, 'postman', 'Postman'],
  [/insomnia/i, 'insomnia', 'Insomnia'],
  [/python|aiohttp|httpx|urllib|scrapy/i, 'python', 'Script Python'],
  [/^curl\//i, 'curl', 'curl'],
  [/^Wget/i, 'script', 'Wget'],
  [/PowerShell/i, 'script', 'PowerShell'],
  [/node-fetch|axios|undici|^node/i, 'node', 'Script Node.js'],
  [/Go-http-client/i, 'script', 'Script Go'],
  [/okhttp|Java\//i, 'script', 'Script Java'],
  [/Apache-HttpClient/i, 'script', 'Script Java'],
  [/RestSharp|\.NET/i, 'script', 'Script .NET'],
];

function navegadorDoUa(ua) {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Navegador';
}

function sistemaDoUa(ua) {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return null;
}

// { tipo, detalhe } — tipos: navegador, celular, navegador_automatizado,
// imitando_navegador, postman, insomnia, python, curl, node, script, desconhecido.
function classificarCliente(req) {
  const ua = String(req.headers['user-agent'] || '').trim();
  if (!ua) return { tipo: 'desconhecido', detalhe: 'Sem identificação (User-Agent vazio)' };

  for (const [regex, tipo, nome] of SCRIPTS) {
    if (regex.test(ua)) {
      const versao = ua.split(/\s/)[0];
      return { tipo, detalhe: versao.length <= 60 ? versao : nome };
    }
  }

  if (/HeadlessChrome|Puppeteer|Playwright|PhantomJS|Selenium|Electron/i.test(ua)) {
    return { tipo: 'navegador_automatizado', detalhe: ua.match(/HeadlessChrome|Puppeteer|Playwright|PhantomJS|Selenium|Electron/i)[0] };
  }

  if (/^Mozilla\//.test(ua)) {
    const nome = navegadorDoUa(ua);
    const sistema = sistemaDoUa(ua);
    const detalhe = sistema ? `${nome} · ${sistema}` : nome;
    if (!req.headers['sec-fetch-mode']) return { tipo: 'imitando_navegador', detalhe };
    const movel = /Mobile|Android|iPhone|iPad/.test(ua);
    return { tipo: movel ? 'celular' : 'navegador', detalhe };
  }

  return { tipo: 'script', detalhe: ua.slice(0, 60) };
}

// Acumula em memória e grava em lote — gravar 1 linha por requisição
// pesaria no banco sem necessidade. Se o processo cair, perde no máximo
// os últimos 30 s de contagem (é métrica, não auditoria). Horários
// (primeiro_em/ultimo_em) são os do banco no momento da gravação.
const INTERVALO_GRAVACAO_MS = 30 * 1000;
const pendentes = new Map();

function diaBrasil(data) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(data);
}

function registrarCliente(req, usuarioId) {
  try {
    const { tipo, detalhe } = classificarCliente(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500);
    const ip = String(req.ip || '').replace(/^::ffff:/, '').slice(0, 64);
    const agora = new Date();
    const dia = diaBrasil(agora);
    const assinatura = crypto.createHash('md5').update(`${userAgent}|${ip}`).digest('hex');
    const chave = `${usuarioId}|${dia}|${assinatura}`;
    const atual = pendentes.get(chave);
    if (atual) atual.total += 1;
    else pendentes.set(chave, { usuarioId, dia, tipo, detalhe, userAgent, ip, assinatura, total: 1 });
  } catch {
    // métrica nunca pode derrubar a requisição
  }
}

async function gravarPendentes() {
  if (pendentes.size === 0) return;
  const lote = [...pendentes.values()];
  pendentes.clear();
  for (const r of lote) {
    try {
      await pool.query(
        `INSERT INTO logs_acesso_clientes
           (usuario_id, dia, tipo, detalhe, user_agent, ip, assinatura, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (usuario_id, dia, assinatura) DO UPDATE SET
           total = logs_acesso_clientes.total + EXCLUDED.total,
           ultimo_em = NOW()`,
        [r.usuarioId, r.dia, r.tipo, r.detalhe, r.userAgent, r.ip, r.assinatura, r.total]
      );
    } catch (err) {
      console.error('[logs-acesso-clientes] falha ao gravar:', err.message);
    }
  }
}

setInterval(gravarPendentes, INTERVALO_GRAVACAO_MS).unref();

module.exports = { classificarCliente, registrarCliente, gravarPendentes };
