// Leitura em partes das bulk-data do Sienge (utils/jsonEmPartes.js) e a nova chamada do contas a pagar
// quando a resposta vem sem a lista (outcome-api.client.js) — `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const { itensDoCampo } = require('../src/utils/jsonEmPartes');

// Corpo de resposta em blocos (como o fetch entrega), cortando o texto em pedaços de `tamanho` bytes.
async function* corpo(texto, tamanho = 7) {
  const bytes = new TextEncoder().encode(texto);
  for (let i = 0; i < bytes.length; i += tamanho) yield bytes.slice(i, i + tamanho);
}
const ler = async (texto, tamanho) => {
  const itens = [];
  for await (const item of itensDoCampo(corpo(texto, tamanho), 'data')) itens.push(item);
  return itens;
};

test('entrega os itens da lista, mesmo cortados entre blocos', async () => {
  const texto = JSON.stringify({ meta: { data: 'não é esta' }, x: 'a"b\\', data: [{ id: 1, nome: 'São "José"' }, { id: 2, sub: [1, { a: [] }] }] });
  for (const tamanho of [1, 3, 7, 1000]) {
    assert.deepStrictEqual(await ler(texto, tamanho), [{ id: 1, nome: 'São "José"' }, { id: 2, sub: [1, { a: [] }] }]);
  }
  assert.deepStrictEqual(await ler('{"data":[]}'), []);
});

test('sem a lista: erro com o começo da resposta e semLista', async () => {
  await assert.rejects(ler('{"status": 500,\n  "message": "Erro interno"}'), (err) => {
    assert.strictEqual(err.semLista, true);
    assert.match(err.message, /não trouxe a lista "data" \(começou com: \{"status": 500, "message": "Erro interno"\}\)/);
    return true;
  });
  await assert.rejects(ler(''), /veio vazia/);
  await assert.rejects(ler('{"data": null}'), /começou com/);
  await assert.rejects(ler('x'.repeat(500)), (err) => err.message.includes('…') && err.message.length < 320);
});

test('contas a pagar: resposta sem a lista chama o Sienge de novo', async (t) => {
  const respostas = ['{"message":"ocupado"}', '', '{"data":[{"billId":1},{"billId":2}]}'];
  const chamadas = [];
  const esperas = [];
  const caminho = require.resolve('../src/utils/siengeFetch');
  const original = require.cache[caminho];
  require.cache[caminho] = {
    id: caminho,
    filename: caminho,
    loaded: true,
    exports: {
      siengeFetch: async (url) => {
        chamadas.push(url);
        return { ok: true, status: 200, body: corpo(respostas[chamadas.length - 1]) };
      },
      sleep: async (ms) => esperas.push(ms),
    },
  };
  const cliente = require.resolve('../src/modules/outcome-sienge/outcome-api.client');
  delete require.cache[cliente];
  t.after(() => {
    require.cache[caminho] = original;
    delete require.cache[cliente];
  });
  const { abrirOutcome } = require(cliente);
  const silenciar = t.mock.method(console, 'warn', () => {});

  const itens = [];
  for await (const p of await abrirOutcome({ tenant: 't', username: 'u', password: 'p' })) itens.push(p);
  assert.deepStrictEqual(itens, [{ billId: 1 }, { billId: 2 }]);
  assert.strictEqual(chamadas.length, 3);
  assert.deepStrictEqual(esperas, [60_000, 180_000]);
  assert.strictEqual(silenciar.mock.callCount(), 2);

  // Na 3ª sem a lista, desiste com a mensagem do que veio.
  respostas.splice(0, 3, '{}', '{}', '{"erro":"x"}');
  chamadas.length = 0;
  await assert.rejects(async () => {
    for await (const p of await abrirOutcome({ tenant: 't', username: 'u', password: 'p' })) itens.push(p);
  }, /começou com: \{"erro":"x"\}/);
  assert.strictEqual(chamadas.length, 3);
});
