const geoip = require('geoip-country');

// País de um IP (código ISO de 2 letras, ex.: "BR") — base GeoLite2 que
// vem dentro do pacote geoip-country, consultada em memória: nenhum IP sai
// pra serviço de terceiros. Atualiza junto com o pacote (npm update).
// IP de rede interna (testes locais, a própria VPS, rede do Docker) vira
// 'LOCAL'; IP público que a base não conhece vira null.
const PRIVADO = /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::$|f[cd][0-9a-f]{2}:|fe80:)/i;

function paisDoIp(ip) {
  const limpo = String(ip || '').replace(/^::ffff:/, '');
  if (!limpo) return null;
  if (PRIVADO.test(limpo)) return 'LOCAL';
  try {
    return geoip.lookup(limpo)?.country || null;
  } catch {
    return null;
  }
}

module.exports = { paisDoIp };
