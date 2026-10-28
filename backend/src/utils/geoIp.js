const fs = require('fs');
const path = require('path');
const { Reader } = require('maxmind');

// Onde fica um IP (cidade, estado, país, coordenadas) e de qual provedor ele
// é — drilldown "Onde acessou" de Métricas de Uso. Bases gratuitas que vêm
// dentro dos pacotes npm @ip-location-db (atualizam com `npm update`),
// consultadas no próprio servidor: nenhum IP sai pra serviço de terceiros.
//   - DB-IP Lite (CC BY 4.0, "IP Geolocation by DB-IP"): local principal;
//   - GeoLite2 (MaxMind, "This product includes GeoLite2 data created by
//     MaxMind"): segunda opinião — quando as duas discordam por mais de
//     50 km, a tela mostra as duas;
//   - ASN (DB-IP/RouteViews): o provedor (Claro, Vivo, AWS...).
// Precisão de IP é de CIDADE, e às vezes da cidade da central do provedor
// (celular costuma cair na capital) — nunca o endereço de quem acessou.
//
// As bases somam ~100 MB por versão de IP: só são carregadas quando alguém
// abre o drilldown e saem da memória depois de 10 min sem uso. O resultado
// de cada IP fica em cache (pequeno) enquanto o processo estiver de pé.

const PASTA = path.dirname(require.resolve('@ip-location-db/dbip-city-mmdb/package.json'));
const PASTA_GEOLITE = path.dirname(require.resolve('@ip-location-db/geolite2-city-mmdb/package.json'));
const PASTA_ASN = path.dirname(require.resolve('@ip-location-db/asn-mmdb/package.json'));

const ARQUIVOS = {
  dbip4: path.join(PASTA, 'dbip-city-ipv4.mmdb'),
  dbip6: path.join(PASTA, 'dbip-city-ipv6.mmdb'),
  geolite4: path.join(PASTA_GEOLITE, 'geolite2-city-ipv4.mmdb'),
  geolite6: path.join(PASTA_GEOLITE, 'geolite2-city-ipv6.mmdb'),
  asn4: path.join(PASTA_ASN, 'asn-ipv4.mmdb'),
  asn6: path.join(PASTA_ASN, 'asn-ipv6.mmdb'),
};

const OCIOSO_MS = 10 * 60 * 1000;
const leitores = new Map();
let timerOcioso = null;

function leitor(nome) {
  if (!leitores.has(nome)) leitores.set(nome, new Reader(fs.readFileSync(ARQUIVOS[nome])));
  clearTimeout(timerOcioso);
  timerOcioso = setTimeout(() => leitores.clear(), OCIOSO_MS);
  timerOcioso.unref();
  return leitores.get(nome);
}

const PRIVADO = /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::$|f[cd][0-9a-f]{2}:|fe80:)/i;

const cache = new Map();
const MAX_CACHE = 5000;

function distanciaKm(a, b) {
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function local(registro) {
  if (!registro || registro.latitude == null || registro.longitude == null) return null;
  return {
    cidade: registro.city || null,
    estado: registro.state1 || null,
    pais: registro.country_code || null,
    latitude: Number(registro.latitude),
    longitude: Number(registro.longitude),
  };
}

// { ip, privado, cidade, estado, pais, latitude, longitude, provedor, asn,
//   alternativa: { cidade, estado, pais, latitude, longitude, distanciaKm } | null }
// Campos null quando a base não conhece o IP.
function localizarIp(ipBruto) {
  const ip = String(ipBruto || '').replace(/^::ffff:/, '').trim();
  if (cache.has(ip)) return cache.get(ip);

  const vazio = { ip, privado: false, cidade: null, estado: null, pais: null, latitude: null, longitude: null, provedor: null, asn: null, alternativa: null };
  let resultado = vazio;
  if (!ip) return vazio;
  if (PRIVADO.test(ip)) {
    resultado = { ...vazio, privado: true };
  } else {
    try {
      const v = ip.includes(':') ? '6' : '4';
      const principal = local(leitor(`dbip${v}`).get(ip));
      const segunda = local(leitor(`geolite${v}`).get(ip));
      const asn = leitor(`asn${v}`).get(ip);
      const base = principal || segunda;
      // Segunda base sem cidade só aponta o meio do país — não é opinião, é ruído.
      const distancia = principal && segunda?.cidade ? distanciaKm(principal, segunda) : 0;
      resultado = {
        ...vazio,
        ...(base || {}),
        provedor: asn?.autonomous_system_organization || null,
        asn: asn?.autonomous_system_number || null,
        alternativa: distancia > 50 ? { ...segunda, distanciaKm: Math.round(distancia) } : null,
      };
    } catch (err) {
      // IP em formato inválido ou base ilegível — fica sem local.
      console.error('[geoIp] falha ao localizar IP:', err.message);
    }
  }

  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(ip, resultado);
  return resultado;
}

module.exports = { localizarIp };
