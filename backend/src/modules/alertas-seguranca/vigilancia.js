const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { classificarCliente, ehSuspeito } = require('../../utils/clienteHttp');
const { paisDoIp } = require('../../utils/paisDoIp');
const { alertar } = require('./alertasSeguranca.service');

// Detecta atividade suspeita e manda pro alertasSeguranca.service.js (que
// grava e avisa por WhatsApp). Três pontos de entrada:
//   - aoAutenticar: toda chamada com token válido (auth.middleware.js) —
//     cliente fora do navegador, acesso do exterior, mesmo login em muitos IPs;
//   - aoRecusarToken: token forjado/adulterado ou de usuário inativado;
//   - observarRespostas: middleware no topo do server.js que olha o status
//     de toda resposta — limite de requisições estourado (429), força bruta
//     e login por fora do navegador, acessos negados (403/404) em sequência
//     e varredura de rotas sem login.
// Contadores em memória do processo: reiniciar o backend zera as janelas.
// O MCP (/api/mcp, /api/mcp-oauth, /.well-known) é robô autorizado — só o
// limite estourado dele conta.

const MIN = 60 * 1000;
const HORA = 60 * MIN;

const SILENCIO = {
  cliente: 6 * HORA,
  token: 6 * HORA,
  inativo: 6 * HORA,
  limite: HORA,
  login: HORA,
  loginFora: 6 * HORA,
  exterior: 24 * HORA,
  ips: 6 * HORA,
  negados: HORA,
  varredura: 6 * HORA,
};

const TITULOS = {
  navegador_automatizado: 'Acesso por navegador automatizado (robô)',
  imitando_navegador: 'Programa se passando por navegador',
  fora_do_app: 'Chamada manual à API (console do navegador, extensão ou outro site)',
  postman: 'Acesso pelo Postman',
  insomnia: 'Acesso pelo Insomnia',
  python: 'Acesso por script Python',
  curl: 'Acesso por curl',
  node: 'Acesso por script Node.js',
  script: 'Acesso por programa fora do navegador',
  desconhecido: 'Acesso por programa sem identificação',
};

function ipDe(req) {
  return String(req.ip || '').replace(/^::ffff:/, '').slice(0, 64);
}

function userAgentDe(req) {
  return String(req.headers['user-agent'] || '').slice(0, 500);
}

// Método + caminho, sem query string (pode ter dados) e sem o token do
// conector MCP, que vai na própria URL (/api/mcp/<token>, /api/mcp/dfc/<token>).
function rotaDe(req) {
  const caminho = String(req.originalUrl || req.url || '').split('?')[0];
  const limpo = caminho.replace(/^(\/api\/mcp(?:\/dfc)?)\/[^/]+/, '$1/•••');
  return `${req.method} ${limpo}`.slice(0, 300);
}

function ehRotaMcp(caminho) {
  return caminho.startsWith('/api/mcp') || caminho.startsWith('/.well-known/');
}

// Janela deslizante simples: chave → horários dos eventos recentes.
const janelas = new Map();

function contar(chave, janelaMs, extra) {
  const agora = Date.now();
  let lista = janelas.get(chave);
  if (!lista) {
    lista = [];
    janelas.set(chave, lista);
  }
  lista.push({ em: agora, extra });
  while (lista.length && lista[0].em <= agora - janelaMs) lista.shift();
  if (lista.length > 500) lista.splice(0, lista.length - 500);
  return lista;
}

setInterval(() => {
  const limite = Date.now() - HORA;
  for (const [chave, lista] of janelas) {
    if (!lista.length || lista[lista.length - 1].em <= limite) janelas.delete(chave);
  }
  for (const [chave, mapa] of ipsPorUsuario) {
    for (const [ip, em] of mapa) if (em <= limite) mapa.delete(ip);
    if (!mapa.size) ipsPorUsuario.delete(chave);
  }
  if (paisPorPar.size > 20000) paisPorPar.clear();
}, 10 * MIN).unref();

// ---------------------------------------------------------------- autenticadas

// usuário → (ip → visto por último). IPv6 conta pelo /64 — o celular troca
// o final do endereço o tempo todo sem trocar de rede.
const ipsPorUsuario = new Map();
const LIMITE_IPS_POR_HORA = 5;
// "usuário|ip" → país do IP — consulta a base 1 vez por par e alerta só
// na primeira vez que o par aparece.
const paisPorPar = new Map();

function redeDoIp(ip) {
  if (!ip.includes(':')) return ip;
  return `${ip.split(':').slice(0, 4).join(':')}::/64`;
}

function aoAutenticar(req, usuarioId, classificacao) {
  try {
    const ip = ipDe(req);
    const userAgent = userAgentDe(req);
    const rota = rotaDe(req);

    const cliente = classificacao || classificarCliente(req);
    if (ehSuspeito(cliente.tipo)) {
      alertar(
        {
          motivo: 'cliente_suspeito',
          titulo: TITULOS[cliente.tipo] || TITULOS.desconhecido,
          chave: `cliente|${usuarioId}|${cliente.tipo}`,
          usuarioId,
          ip,
          userAgent: userAgent || '(vazio)',
          rota,
          detalhe: `Identificado como: ${cliente.detalhe}. O login deste usuário está sendo usado por fora do sistema aberto no navegador.`,
        },
        SILENCIO.cliente
      );
    }

    const par = `${usuarioId}|${ip}`;
    let pais = paisPorPar.get(par);
    if (pais === undefined) {
      pais = paisDoIp(ip);
      paisPorPar.set(par, pais);
      if (pais && pais !== 'BR' && pais !== 'LOCAL') {
        alertar(
          {
            motivo: 'acesso_exterior',
            titulo: 'Acesso de fora do Brasil',
            chave: `exterior|${usuarioId}|${pais}`,
            usuarioId,
            ip,
            userAgent,
            rota,
            detalhe: 'Pode ser VPN, servidor no exterior ou login vazado.',
          },
          SILENCIO.exterior
        );
      }
    }

    if (pais !== 'LOCAL') {
      let mapa = ipsPorUsuario.get(usuarioId);
      if (!mapa) {
        mapa = new Map();
        ipsPorUsuario.set(usuarioId, mapa);
      }
      const agora = Date.now();
      mapa.set(redeDoIp(ip), agora);
      const recentes = [...mapa.entries()].filter(([, em]) => em > agora - HORA).map(([rede]) => rede);
      if (recentes.length >= LIMITE_IPS_POR_HORA) {
        alertar(
          {
            motivo: 'muitos_ips',
            titulo: `Mesmo login usado de ${recentes.length} endereços (IPs) na última hora`,
            chave: `ips|${usuarioId}`,
            usuarioId,
            ip,
            userAgent,
            rota,
            detalhe: `IPs: ${recentes.slice(0, 8).join(', ')}. Pode ser login compartilhado ou vazado.`,
          },
          SILENCIO.ips
        );
      }
    }
  } catch (err) {
    console.error('[alertas-seguranca] falha na vigilância:', err.message);
  }
}

// motivo: 'forjado' (assinatura inválida, token adulterado) ou 'inativo'
// (token válido de usuário inativado/excluído). Token só vencido é normal.
function aoRecusarToken(req, motivo, { erro, usuarioId } = {}) {
  try {
    const ip = ipDe(req);
    if (motivo === 'forjado') {
      alertar(
        {
          motivo: 'token_forjado',
          titulo: 'Token de acesso forjado ou adulterado',
          chave: `token|${ip}`,
          ip,
          userAgent: userAgentDe(req),
          rota: rotaDe(req),
          detalhe: `O token enviado não foi emitido pelo Horizon (${erro || 'assinatura inválida'}). Alguém está tentando entrar sem senha.`,
        },
        SILENCIO.token
      );
    } else {
      alertar(
        {
          motivo: 'usuario_inativo',
          titulo: 'Usuário inativado ou excluído tentando acessar',
          chave: `inativo|${usuarioId}`,
          usuarioId: Number.isInteger(usuarioId) ? usuarioId : null,
          ip,
          userAgent: userAgentDe(req),
          rota: rotaDe(req),
          detalhe: 'O acesso foi recusado, mas o token ainda estava guardado em algum lugar.',
        },
        SILENCIO.inativo
      );
    }
  } catch (err) {
    console.error('[alertas-seguranca] falha na vigilância:', err.message);
  }
}

// ---------------------------------------------------------------- respostas

const ROTAS_LOGIN = ['/api/auth/login', '/api/mcp-oauth/authorize'];
const ROTAS_SESSAO = ['/api/auth/login', '/api/auth/refresh'];
const FALHAS_LOGIN = { janela: 15 * MIN, total: 15, usuariosDiferentes: 5 };
const NEGADOS = { janela: 10 * MIN, total: 30 };
const VARREDURA = { janela: 10 * MIN, total: 40 };

// Usuário do token (sem consultar o banco) — no 429 o limite responde antes
// da autenticação, então req.user ainda não existe.
function usuarioDoToken(req) {
  if (req.user?.id) return req.user.id;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return Number(jwt.verify(header.slice(7), env.jwt.secret).sub) || null;
  } catch {
    return null;
  }
}

// Dono do refresh token do corpo (POST /api/auth/refresh), ou o erro da
// verificação — refresh token com assinatura inválida é forjado.
function verificarRefresh(req) {
  try {
    return { usuarioId: Number(jwt.verify(String(req.body?.refreshToken || ''), env.jwt.refreshSecret).sub) || null };
  } catch (err) {
    return { erro: err };
  }
}

function usernameDigitado(req) {
  const b = req.body || {};
  const valor = b.username || b.usuario;
  return valor ? String(valor).trim().slice(0, 150) : null;
}

function analisarResposta(req, res) {
  const caminho = String(req.originalUrl || req.url || '').split('?')[0];
  if (caminho === '/api/health') return;
  const status = res.statusCode;
  const ip = ipDe(req);
  const userAgent = userAgentDe(req);
  const rota = rotaDe(req);
  const mcp = ehRotaMcp(caminho);

  // Login/renovação de sessão por script — vale com senha certa, errada ou bloqueada (429).
  if (ROTAS_SESSAO.includes(caminho) && req.method === 'POST') {
    const cliente = classificarCliente(req);
    if (ehSuspeito(cliente.tipo)) {
      const refresh = caminho.endsWith('/refresh');
      alertar(
        {
          motivo: 'login_fora_navegador',
          titulo: refresh ? 'Renovação de sessão por fora do navegador' : 'Login por fora do navegador',
          chave: `loginfora|${ip}|${cliente.tipo}`,
          username: refresh ? null : usernameDigitado(req),
          usuarioId: refresh ? verificarRefresh(req).usuarioId || null : null,
          ip,
          userAgent: userAgent || '(vazio)',
          rota,
          detalhe: `Identificado como: ${cliente.detalhe}. Resultado: ${
            status >= 400 ? `recusado (${status})` : refresh ? 'sessão renovada' : 'senha aceita, entrou no sistema'
          }.`,
        },
        SILENCIO.loginFora
      );
    }
  }

  if (status === 429) {
    const login = ROTAS_LOGIN.includes(caminho);
    const usuarioId = login || mcp ? null : usuarioDoToken(req);
    alertar(
      {
        motivo: login ? 'forca_bruta_login' : 'limite_excedido',
        titulo: login
          ? 'Tentativas de senha em massa (login bloqueado por 15 minutos)'
          : mcp
            ? 'Conector MCP estourou o limite de requisições'
            : 'Limite de requisições por minuto estourado',
        chave: login ? `login|${ip}` : `limite|${usuarioId || ip}|${mcp ? 'mcp' : 'api'}`,
        usuarioId,
        username: login ? usernameDigitado(req) : null,
        ip,
        userAgent,
        rota,
        detalhe: login
          ? 'Muitas senhas erradas em sequência — típico de robô tentando adivinhar a senha.'
          : 'Volume de chamadas que uma pessoa usando as telas não alcança — típico de robô baixando dados.',
      },
      login ? SILENCIO.login : SILENCIO.limite
    );
    return;
  }
  // Senha errada conta também no login do OAuth do MCP (/api/mcp-oauth/authorize).
  if (status === 401 && ROTAS_LOGIN.includes(caminho)) {
    const falhas = contar(`falhalogin|${ip}`, FALHAS_LOGIN.janela, usernameDigitado(req));
    const usuarios = new Set(falhas.map((f) => String(f.extra || '').toLowerCase()).filter(Boolean));
    if (falhas.length >= FALHAS_LOGIN.total || usuarios.size >= FALHAS_LOGIN.usuariosDiferentes) {
      alertar(
        {
          motivo: 'forca_bruta_login',
          titulo:
            usuarios.size >= FALHAS_LOGIN.usuariosDiferentes
              ? `Senha errada em ${usuarios.size} logins diferentes a partir do mesmo IP`
              : `${falhas.length} senhas erradas em 15 minutos a partir do mesmo IP`,
          chave: `login|${ip}`,
          username: [...usuarios].slice(0, 6).join(', ') || null,
          ip,
          userAgent,
          rota,
          detalhe: 'Alguém testando senhas (ou logins) em sequência.',
        },
        SILENCIO.login
      );
    }
    return;
  }

  if (mcp) return;

  if (status === 401 && caminho === '/api/auth/refresh' && req.body?.refreshToken) {
    const { erro } = verificarRefresh(req);
    if (erro && erro.name !== 'TokenExpiredError') aoRecusarToken(req, 'forjado', { erro: `renovação de sessão: ${erro.message}` });
  }

  const usuarioId = req.user?.id || null;
  if (usuarioId && (status === 403 || status === 404)) {
    const negados = contar(`negado|${usuarioId}`, NEGADOS.janela);
    if (negados.length >= NEGADOS.total) {
      alertar(
        {
          motivo: 'acessos_negados',
          titulo: `${negados.length} acessos negados ou inexistentes em 10 minutos`,
          chave: `negados|${usuarioId}`,
          usuarioId,
          ip,
          userAgent,
          rota,
          detalhe: 'Tentando abrir telas, empresas ou registros sem permissão (ou chutando ids em sequência).',
        },
        SILENCIO.negados
      );
    }
    return;
  }

  if (!usuarioId && (status === 401 || status === 404)) {
    const tentativas = contar(`varredura|${ip}`, VARREDURA.janela);
    if (tentativas.length >= VARREDURA.total) {
      alertar(
        {
          motivo: 'varredura',
          titulo: `${tentativas.length} chamadas sem login ou a rotas inexistentes em 10 minutos`,
          chave: `varredura|${ip}`,
          ip,
          userAgent,
          rota,
          detalhe: 'Varredura da API — robô procurando rotas abertas ou testando tokens.',
        },
        SILENCIO.varredura
      );
    }
  }
}

function observarRespostas(req, res, next) {
  res.on('finish', () => {
    try {
      analisarResposta(req, res);
    } catch (err) {
      console.error('[alertas-seguranca] falha na vigilância:', err.message);
    }
  });
  next();
}

module.exports = { aoAutenticar, aoRecusarToken, observarRespostas };
