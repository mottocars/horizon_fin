const dns = require('dns').promises;
const net = require('net');
const tls = require('tls');
const https = require('https');
const zlib = require('zlib');

// Verificações automáticas de um parceiro (Cadastros › Parceiros): cada item sai "ok" ou
// "atenção", com o detalhe do que foi visto. Nenhum bloqueia a aprovação — servem para o
// administrador não conferir na mão.
//
// As URLs vêm de um formulário público: antes de conectar, o host é resolvido e endereço
// interno (loopback, rede privada, link-local, CGNAT...) é recusado, e a conexão vai para o IP
// já conferido (sem nova consulta de DNS no meio, o que permitiria trocar o IP depois).

const TIMEOUT_MS = 8000;
const MAX_REDIRECIONAMENTOS = 3;

// Regras da logo (as mesmas do formulário em api-docs/parceiros/).
const LOGO = {
  tipo: 'image/png',
  maxBytes: 500 * 1024,
  minLado: 128,
  maxLado: 1024,
};

// ─── domínio ────────────────────────────────────────────────────────────────

// Sufixos de dois níveis mais comuns (com.br, co.uk...): o domínio "registrável" leva um rótulo a
// mais. Não é a Public Suffix List inteira, mas cobre o que aparece por aqui.
const SUFIXOS_DUPLOS = new Set([
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'ind.br', 'eng.br', 'adv.br', 'app.br', 'dev.br',
  'eco.br', 'emp.br', 'inf.br', 'log.br', 'med.br', 'srv.br', 'tec.br', 'tv.br', 'art.br', 'blog.br',
  'co.uk', 'org.uk', 'com.au', 'com.ar', 'com.mx', 'co.jp', 'com.pt', 'co.za', 'com.co', 'com.uy',
]);

function dominioRegistravel(host) {
  const rotulos = String(host || '').toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (rotulos.length <= 2) return rotulos.join('.');
  const ultimosDois = rotulos.slice(-2).join('.');
  return rotulos.slice(SUFIXOS_DUPLOS.has(ultimosDois) ? -3 : -2).join('.');
}

// ─── endereço seguro ────────────────────────────────────────────────────────

function ipv4Interno(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast e reservados
  );
}

function ipInterno(ip) {
  if (net.isIPv4(ip)) return ipv4Interno(ip);
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return ipv4Interno(v6.slice(7));
  return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith('ff');
}

async function resolverSeguro(host) {
  if (net.isIP(host)) throw new Error('Endereço IP no lugar do domínio.');
  let enderecos;
  try {
    enderecos = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error(`O domínio ${host} não foi encontrado (DNS).`);
  }
  if (!enderecos.length) throw new Error(`O domínio ${host} não foi encontrado (DNS).`);
  if (enderecos.some((e) => ipInterno(e.address))) throw new Error(`O domínio ${host} aponta para um endereço interno.`);
  return enderecos[0];
}

// ─── SSL ────────────────────────────────────────────────────────────────────

const ERROS_TLS = {
  CERT_HAS_EXPIRED: 'certificado vencido',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'certificado autoassinado',
  SELF_SIGNED_CERT_IN_CHAIN: 'certificado autoassinado na cadeia',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'cadeia do certificado incompleta',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'emissor do certificado desconhecido',
  ERR_TLS_CERT_ALTNAME_INVALID: 'certificado não é deste domínio',
  CERT_NOT_YET_VALID: 'certificado ainda não é válido',
};

function dataBr(data) {
  return new Date(data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function checarCertificado(url) {
  const u = new URL(url);
  const endereco = await resolverSeguro(u.hostname);
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: endereco.address,
      servername: u.hostname,
      port: Number(u.port || 443),
      rejectUnauthorized: true,
      timeout: TIMEOUT_MS,
    });
    const terminar = (resultado) => {
      socket.destroy();
      resolve(resultado);
    };
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      terminar({ ok: true, validoAte: cert?.valid_to ? new Date(cert.valid_to).toISOString() : null });
    });
    socket.once('timeout', () => terminar({ ok: false, erro: 'sem resposta em 8 s' }));
    socket.once('error', (err) => terminar({ ok: false, erro: ERROS_TLS[err.code] || err.code || err.message }));
  });
}

// ─── URL responde ───────────────────────────────────────────────────────────

async function requisitar(url) {
  const u = new URL(url);
  const endereco = await resolverSeguro(u.hostname);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: u.hostname,
        port: Number(u.port || 443),
        path: `${u.pathname}${u.search}`,
        method: 'GET',
        servername: u.hostname,
        // A conexão vai para o IP já conferido.
        // (Node 20+ pede a lista inteira — opts.all — por causa do autoSelectFamily.)
        lookup: (_host, opts, cb) =>
          opts?.all ? cb(null, [{ address: endereco.address, family: endereco.family }]) : cb(null, endereco.address, endereco.family),
        headers: { 'User-Agent': 'HorizonParceiros/1.0 (+https://api.horizonhub.com.br)', Accept: 'text/html,*/*' },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        // Só o status interessa: não lê o corpo.
        res.destroy();
        resolve({ status: res.statusCode, location: res.headers.location });
      }
    );
    req.once('timeout', () => req.destroy(new Error('sem resposta em 8 s')));
    req.once('error', (err) => reject(new Error(ERROS_TLS[err.code] || err.message)));
    req.end();
  });
}

async function checarResposta(url) {
  let atual = url;
  for (let i = 0; i <= MAX_REDIRECIONAMENTOS; i += 1) {
    const r = await requisitar(atual);
    if (r.status >= 300 && r.status < 400 && r.location) {
      const proxima = new URL(r.location, atual);
      if (proxima.protocol !== 'https:') return { ok: false, status: r.status, detalhe: `redireciona para ${proxima.protocol.replace(':', '')} (sem https)` };
      atual = proxima.toString();
      continue;
    }
    return { ok: r.status < 400, status: r.status, final: atual };
  }
  return { ok: false, detalhe: 'redirecionamentos demais' };
}

// ─── logo (PNG) ─────────────────────────────────────────────────────────────

// Lê o PNG sem biblioteca: dimensões, se tem transparência e quanto da borda é transparente
// (o "fundo"). Entrelaçado (Adam7) não é decodificado — só diz se tem canal alfa.
function analisarPng(buffer) {
  const ASSINATURA = '89504e470d0a1a0a';
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || buffer.subarray(0, 8).toString('hex') !== ASSINATURA) {
    return { png: false };
  }
  let largura = 0;
  let altura = 0;
  let profundidade = 0;
  let tipoCor = 0;
  let entrelacado = 0;
  let trns = null;
  const idat = [];
  let pos = 8;
  while (pos + 8 <= buffer.length) {
    const tamanho = buffer.readUInt32BE(pos);
    const tipo = buffer.toString('ascii', pos + 4, pos + 8);
    const dados = buffer.subarray(pos + 8, pos + 8 + tamanho);
    if (tipo === 'IHDR') {
      largura = dados.readUInt32BE(0);
      altura = dados.readUInt32BE(4);
      profundidade = dados[8];
      tipoCor = dados[9];
      entrelacado = dados[12];
    } else if (tipo === 'tRNS') trns = Buffer.from(dados);
    else if (tipo === 'IDAT') idat.push(dados);
    else if (tipo === 'IEND') break;
    pos += 12 + tamanho;
  }
  const temAlfa = tipoCor === 4 || tipoCor === 6 || Boolean(trns);
  const base = { png: true, largura, altura, temAlfa };
  if (!temAlfa) return { ...base, bordaTransparente: 0 };
  if (entrelacado || largura > 4096 || altura > 4096) return { ...base, bordaTransparente: null };

  let bruto;
  try {
    bruto = zlib.inflateSync(Buffer.concat(idat));
  } catch {
    return { ...base, bordaTransparente: null };
  }
  const canais = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipoCor];
  const bitsPorPixel = canais * profundidade;
  const bytesPorPixel = Math.max(1, Math.ceil(bitsPorPixel / 8));
  const bytesPorLinha = Math.ceil((largura * bitsPorPixel) / 8);
  if (bruto.length < altura * (bytesPorLinha + 1)) return { ...base, bordaTransparente: null };

  const alfa = (linha, x) => {
    if (tipoCor === 6) return linha[x * bytesPorPixel + (profundidade === 16 ? 6 : 3)];
    if (tipoCor === 4) return linha[x * bytesPorPixel + (profundidade === 16 ? 2 : 1)];
    if (tipoCor === 3) {
      const porByte = 8 / profundidade;
      const byte = linha[Math.floor(x / porByte)];
      const desloc = (porByte - 1 - (x % porByte)) * profundidade;
      const indice = (byte >> desloc) & ((1 << profundidade) - 1);
      return trns && indice < trns.length ? trns[indice] : 255;
    }
    // Cinza / RGB com cor-chave no tRNS (só 8 bits).
    if (trns && profundidade === 8) {
      const i = x * bytesPorPixel;
      const chave = tipoCor === 0 ? [trns[1]] : [trns[1], trns[3], trns[5]];
      return chave.every((v, k) => linha[i + k] === v) ? 0 : 255;
    }
    return 255;
  };

  let anterior = Buffer.alloc(bytesPorLinha);
  let transparentes = 0;
  let total = 0;
  for (let y = 0; y < altura; y += 1) {
    const inicio = y * (bytesPorLinha + 1);
    const filtro = bruto[inicio];
    const linha = Buffer.from(bruto.subarray(inicio + 1, inicio + 1 + bytesPorLinha));
    for (let i = 0; i < bytesPorLinha; i += 1) {
      const a = i >= bytesPorPixel ? linha[i - bytesPorPixel] : 0;
      const b = anterior[i];
      const c = i >= bytesPorPixel ? anterior[i - bytesPorPixel] : 0;
      let soma = 0;
      if (filtro === 1) soma = a;
      else if (filtro === 2) soma = b;
      else if (filtro === 3) soma = (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        soma = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      linha[i] = (linha[i] + soma) & 0xff;
    }
    // Borda: primeira e última linha inteiras + primeira e última coluna das outras.
    const xs = y === 0 || y === altura - 1 ? Array.from({ length: largura }, (_, x) => x) : [0, largura - 1];
    for (const x of xs) {
      total += 1;
      if (alfa(linha, x) < 32) transparentes += 1;
    }
    anterior = linha;
  }
  return { ...base, bordaTransparente: total ? transparentes / total : 0 };
}

// Validação da logo no envio do formulário (as mesmas regras do formulário).
function validarLogo(buffer) {
  const info = analisarPng(buffer);
  if (!info.png) return { erro: 'A logomarca precisa ser um arquivo PNG.' };
  if (buffer.length > LOGO.maxBytes) return { erro: 'A logomarca pode ter no máximo 500 KB.' };
  if (info.largura < LOGO.minLado || info.altura < LOGO.minLado || info.largura > LOGO.maxLado || info.altura > LOGO.maxLado) {
    return { erro: `A logomarca precisa ter entre ${LOGO.minLado} e ${LOGO.maxLado} pixels de largura e de altura (enviada: ${info.largura}×${info.altura}).` };
  }
  return { info };
}

// ─── todas as verificações ──────────────────────────────────────────────────

function kb(bytes) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function verificarParceiro(p) {
  const itens = [];
  const urls = [
    ['Abertura', p.url_abertura],
    ['Callback', p.url_callback],
  ];

  // 1. https + certificado válido.
  const certificados = await Promise.all(
    urls.map(async ([nome, url]) => {
      try {
        if (new URL(url).protocol !== 'https:') return { nome, ok: false, texto: 'não usa https' };
        const c = await checarCertificado(url);
        return { nome, ok: c.ok, texto: c.ok ? `certificado válido${c.validoAte ? ` até ${dataBr(c.validoAte)}` : ''}` : c.erro };
      } catch (err) {
        return { nome, ok: false, texto: err.message };
      }
    })
  );
  itens.push({
    id: 'ssl',
    titulo: 'URLs com https e certificado SSL válido',
    ok: certificados.every((c) => c.ok),
    detalhe: certificados.map((c) => `${c.nome}: ${c.texto}`).join(' · '),
  });

  // 2. Mesmo domínio.
  const hostAbertura = new URL(p.url_abertura).hostname;
  const hostCallback = new URL(p.url_callback).hostname;
  const domAbertura = dominioRegistravel(hostAbertura);
  const domCallback = dominioRegistravel(hostCallback);
  itens.push({
    id: 'mesmo_dominio',
    titulo: 'Abertura e callback no mesmo domínio',
    ok: domAbertura === domCallback,
    detalhe: domAbertura === domCallback ? domAbertura : `${hostAbertura} × ${hostCallback}`,
  });

  // 3. Domínio das URLs × e-mail do responsável (informativo: não bloqueia).
  const domEmail = dominioRegistravel(String(p.responsavel_email).split('@')[1] || '');
  const bate = domEmail === domAbertura && domEmail === domCallback;
  itens.push({
    id: 'dominio_email',
    titulo: 'Domínio das URLs bate com o e-mail do responsável',
    ok: bate,
    informativo: true,
    detalhe: bate ? `@${domEmail}` : `e-mail @${domEmail} × URLs ${domAbertura}${domCallback !== domAbertura ? ` / ${domCallback}` : ''}`,
  });

  // 4. Celular confirmado pelo código do WhatsApp.
  itens.push({
    id: 'telefone',
    titulo: 'Número do responsável confirmado',
    ok: Boolean(p.telefone_confirmado_em),
    detalhe: p.telefone_confirmado_em ? `código do WhatsApp confirmado em ${dataBr(p.telefone_confirmado_em)}` : 'não confirmado',
  });

  // 5. URL de abertura responde.
  let resposta;
  try {
    const r = await checarResposta(p.url_abertura);
    resposta = { ok: r.ok, detalhe: r.detalhe || `HTTP ${r.status}${r.final && r.final !== p.url_abertura ? ` (depois de redirecionar para ${r.final})` : ''}` };
  } catch (err) {
    resposta = { ok: false, detalhe: err.message };
  }
  itens.push({ id: 'abertura_responde', titulo: 'URL de abertura responde', ...resposta });

  // 6. Logo: transparente e dentro dos limites.
  const info = analisarPng(p.logo);
  const tamanho = p.logo?.length || 0;
  const dentro =
    info.png &&
    tamanho <= LOGO.maxBytes &&
    info.largura >= LOGO.minLado &&
    info.altura >= LOGO.minLado &&
    info.largura <= LOGO.maxLado &&
    info.altura <= LOGO.maxLado;
  let transparencia;
  if (!info.png) transparencia = { ok: false, texto: 'não é PNG' };
  else if (!info.temAlfa) transparencia = { ok: false, texto: 'sem transparência (fundo sólido)' };
  else if (info.bordaTransparente === null) transparencia = { ok: true, texto: 'com transparência' };
  else {
    const pct = Math.round(info.bordaTransparente * 100);
    transparencia = { ok: pct >= 50, texto: pct >= 50 ? `fundo transparente (${pct}% da borda)` : `fundo não parece transparente (só ${pct}% da borda)` };
  }
  itens.push({
    id: 'logo',
    titulo: 'Logo com fundo transparente, dimensões e peso no limite',
    ok: transparencia.ok && dentro,
    detalhe: `${transparencia.texto} · ${info.largura || '?'}×${info.altura || '?'} px · ${kb(tamanho)}${dentro ? '' : ` (limite: ${LOGO.minLado}–${LOGO.maxLado} px, até 500 KB)`}`,
  });

  return itens;
}

module.exports = { LOGO, analisarPng, validarLogo, verificarParceiro, dominioRegistravel, ipInterno };
