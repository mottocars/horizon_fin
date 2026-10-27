// Testes da classificação de quem chama a API (Métricas de Uso e alertas de segurança) — `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const { classificarCliente, ehSuspeito } = require('../src/utils/clienteHttp');

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1';

// Chamada que o frontend faz de verdade numa página https.
function req(headers = {}, { secure = true } = {}) {
  return {
    secure,
    headers: {
      'user-agent': CHROME,
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'sec-ch-ua': '"Google Chrome";v="141", "Chromium";v="141", "Not A(Brand";v="24"',
      'x-horizon-app': '1',
      host: 'financas.horizonhub.com.br',
      ...headers,
    },
  };
}

test('telas do sistema no navegador e no celular não são suspeitas', () => {
  assert.deepStrictEqual(classificarCliente(req()), { tipo: 'navegador', detalhe: 'Chrome · Windows' });
  assert.strictEqual(classificarCliente(req({ 'user-agent': FIREFOX, 'sec-ch-ua': undefined })).tipo, 'navegador');
  assert.strictEqual(classificarCliente(req({ 'user-agent': IPHONE, 'sec-ch-ua': undefined })).tipo, 'celular');
  // Página http (sem ser localhost): o Chrome não manda Client Hints — não dá pra cobrar.
  assert.strictEqual(classificarCliente(req({ 'sec-ch-ua': undefined, host: '192.168.1.9:5173' }, { secure: false })).tipo, 'navegador');
});

test('programas e robôs', () => {
  assert.strictEqual(classificarCliente(req({ 'user-agent': 'curl/8.4.0' })).tipo, 'curl');
  assert.strictEqual(classificarCliente(req({ 'user-agent': 'python-requests/2.31' })).tipo, 'python');
  assert.strictEqual(classificarCliente(req({ 'user-agent': 'PostmanRuntime/7.43.0' })).tipo, 'postman');
  assert.strictEqual(classificarCliente(req({ 'user-agent': '' })).tipo, 'desconhecido');
  assert.strictEqual(classificarCliente(req({ 'x-horizon-webdriver': '1' })).tipo, 'navegador_automatizado');
  assert.strictEqual(classificarCliente(req({ 'sec-ch-ua': '"HeadlessChrome";v="141"' })).tipo, 'navegador_automatizado');
});

test('quem se passa por navegador ou chama a API na mão', () => {
  assert.strictEqual(classificarCliente(req({ 'sec-fetch-mode': undefined })).tipo, 'imitando_navegador');
  assert.strictEqual(classificarCliente(req({ 'sec-fetch-mode': 'navigate' })).tipo, 'imitando_navegador');
  assert.strictEqual(classificarCliente(req({ 'sec-fetch-site': 'none' })).tipo, 'imitando_navegador');
  assert.strictEqual(classificarCliente(req({ 'sec-ch-ua': undefined })).detalhe, 'Chrome · Windows · sem Client Hints');
  assert.strictEqual(classificarCliente(req({ 'x-horizon-app': undefined })).tipo, 'fora_do_app');
});

test('só navegador e celular são confiáveis', () => {
  assert.strictEqual(ehSuspeito('navegador'), false);
  assert.strictEqual(ehSuspeito('celular'), false);
  for (const tipo of ['fora_do_app', 'imitando_navegador', 'navegador_automatizado', 'curl', 'script', 'desconhecido']) {
    assert.strictEqual(ehSuspeito(tipo), true, tipo);
  }
});
