const https = require('https');

// Promise em cima de https.request — pra chamadas com mTLS (`agent` com key/cert do cliente),
// que o fetch global do Node não aceita. Devolve o corpo cru (Buffer), sem interpretar status:
// quem chama decide o que é erro. Usado pelo Espião NFe/NFSe (SEFAZ/ADN) e pela API Itaú.
function httpsRequest({ method, url, agent, headers, body, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        method,
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        port: 443,
        agent,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Tempo limite excedido.')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

module.exports = { httpsRequest };
