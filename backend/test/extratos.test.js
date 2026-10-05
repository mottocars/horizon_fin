// Testes da montagem do relatório Extratos Bancários — `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const { montarExtrato } = require('../src/modules/relatorio-extratos-bancarios/extratos.calculo');

const ev = (id, dataHora, contabil, valor, historico = 'X') => ({
  id,
  type: 'lancamento',
  operation: valor < 0 ? 'D' : 'C',
  reversal: false,
  date: { event: dataHora, accounting: contabil },
  literal: { complete: historico },
  amount: { value: valor, currency: 'BRL' },
  counterpart: { name: 'Fornecedor', document: '123', institution: 'ITAU', agency: '1', account: '2', digit: '3' },
  origin: { channel: 'PIX' },
});
const fech = (dia, valor) => ({ type: 'saldo_conta', literal: { complete: 'SALDO MOVIMENTAÇÃO CONTA' }, date: { event: `${dia}T23:59:59.999-03:00` }, amount: { value: valor } });
const disp = (literal, quando, valor) => ({ type: 'saldo_disponivel', literal: { complete: literal }, date: { event: quando }, amount: { value: valor } });

test('dias com fechamento: saldo inicial/final e saldo após cada lançamento', () => {
  // 29/09 fecha em 1000; 30/09 tem -200 e +50 e fecha em 850; 01/10 (hoje) sem fechamento: -100
  const r = montarExtrato({
    eventos: [
      // a API manda do mais novo pro mais antigo
      ev('c', '2026-10-01T10:00:00Z', '2026-10-01', -100),
      ev('b', '2026-09-30T15:00:00Z', '2026-09-30', 50),
      ev('a', '2026-09-30T09:00:00Z', '2026-09-30', -200),
      ev('z', '2026-09-29T09:00:00Z', '2026-09-29', 10), // antes do período (janela extra)
    ],
    saldos: [fech('2026-09-29', 1000), fech('2026-09-30', 850), disp('SALDO EM CONTA', '2026-10-01T10:00:00-03:00', 750)],
    dataInicio: '2026-09-30',
    dataFim: '2026-10-01',
  });
  assert.deepStrictEqual(r.dias.map((d) => d.data), ['2026-09-30', '2026-10-01'], 'só os dias do período');
  const [d30, d01] = r.dias;
  assert.strictEqual(d30.saldoInicial, 1000);
  assert.deepStrictEqual(d30.lancamentos.map((l) => [l.id, l.saldoApos]), [['a', 800], ['b', 850]], 'cronológico, saldo acumulado');
  assert.strictEqual(d30.saldoFinal, 850);
  assert.strictEqual(d30.entradas, 50);
  assert.strictEqual(d30.saidas, -200);
  assert.strictEqual(d30.fonte, 'FECHAMENTO');
  assert.strictEqual(d01.saldoInicial, 850);
  assert.strictEqual(d01.saldoFinal, 750);
  assert.strictEqual(d01.fonte, 'CALCULADO', 'hoje: fechamento anterior + lançamentos');
  assert.strictEqual(r.saldoFimPeriodo, 750);
  assert.strictEqual(d30.lancamentos[0].contraparte.conta, '2-3');
});

test('dia útil sem lançamento aparece com saldo inicial = final', () => {
  const r = montarExtrato({
    eventos: [],
    saldos: [fech('2026-09-29', 500), fech('2026-09-30', 500)],
    dataInicio: '2026-09-29',
    dataFim: '2026-09-30',
  });
  assert.strictEqual(r.dias.length, 2);
  assert(r.dias.every((d) => d.saldoInicial === 500 && d.saldoFinal === 500 && d.lancamentos.length === 0));
});

test('sem fechamento anterior: volta do próximo fechamento', () => {
  const r = montarExtrato({
    eventos: [ev('a', '2026-09-28T10:00:00Z', '2026-09-28', -30), ev('b', '2026-09-29T10:00:00Z', '2026-09-29', 20)],
    saldos: [fech('2026-09-29', 1000)],
    dataInicio: '2026-09-28',
    dataFim: '2026-09-29',
  });
  // fim de 28 = 1000 - 20 = 980; inicial 28 = 1010
  assert.strictEqual(r.dias[0].saldoFinal, 980);
  assert.strictEqual(r.dias[0].saldoInicial, 1010);
  assert.strictEqual(r.dias[1].saldoInicial, 980);
});

test('conta parada (sem fechamento nem lançamento): só o saldo do fim do período, pela posição em conta', () => {
  const r = montarExtrato({
    eventos: [],
    saldos: [disp('SALDO ANTERIOR', '2026-09-27T23:59:59-03:00', 99), disp('SALDO EM CONTA', '2026-09-23T03:12:22-03:00', 123.45)],
    dataInicio: '2026-09-28',
    dataFim: '2026-10-05',
  });
  assert.strictEqual(r.dias.length, 0);
  assert.strictEqual(r.saldoFimPeriodo, 123.45);
  assert.strictEqual(r.fonteSaldoFimPeriodo, 'ESTIMADO');
  assert.strictEqual(r.saldoEmConta.valor, 123.45);
});

test('centavos não acumulam erro de ponto flutuante', () => {
  const eventos = Array.from({ length: 10 }, (_, i) => ev(`e${i}`, `2026-09-30T1${i}:00:00Z`, '2026-09-30', 0.1));
  const r = montarExtrato({ eventos, saldos: [fech('2026-09-29', 0), fech('2026-09-30', 1)], dataInicio: '2026-09-30', dataFim: '2026-09-30' });
  assert.strictEqual(r.dias[0].lancamentos.at(-1).saldoApos, 1);
  assert.strictEqual(r.dias[0].entradas, 1);
});
