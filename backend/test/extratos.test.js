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

test('conta parada: o SALDO ANTERIOR vale como fechamento; sem ele, usa a posição em conta', () => {
  const comAnterior = montarExtrato({
    eventos: [],
    saldos: [disp('SALDO ANTERIOR', '2026-09-27T23:59:59-03:00', 99), disp('SALDO EM CONTA', '2026-10-05T03:12:22-03:00', 99)],
    dataInicio: '2026-09-28',
    dataFim: '2026-10-05',
  });
  assert.strictEqual(comAnterior.dias.length, 0);
  assert.strictEqual(comAnterior.saldoFimPeriodo, 99);
  assert.strictEqual(comAnterior.fonteSaldoFimPeriodo, 'CALCULADO');

  const r = montarExtrato({ eventos: [], saldos: [disp('SALDO EM CONTA', '2026-09-23T03:12:22-03:00', 123.45)], dataInicio: '2026-09-28', dataFim: '2026-10-05' });
  assert.strictEqual(r.saldoFimPeriodo, 123.45);
  assert.strictEqual(r.fonteSaldoFimPeriodo, 'ESTIMADO');
  assert.strictEqual(r.saldoEmConta.valor, 123.45);
});

test('aplicação automática: saldo = conta + aplicação; aplicar/resgatar não entra no extrato', () => {
  // Como em produção (GENESIS, set/out 2026): a conta fecha em R$ 1,00 e o resto fica aplicado.
  const aplic = (dia, valor) => ({ type: 'saldo_aplic_aut', literal: { complete: 'SALDO APLIC. AUT.' }, date: { event: `${dia}T23:59:59.999-03:00` }, amount: { value: valor } });
  const r = montarExtrato({
    eventos: [
      ev('r2', '2026-10-02T08:00:00Z', '2026-10-02', 0.04, 'REND PAGO APLIC AUT APR'),
      ev('r1', '2026-10-02T08:00:00Z', '2026-10-02', 103354.11, 'RES APLIC AUT MAIS AP'),
      ev('p2', '2026-10-02T12:00:00Z', '2026-10-02', -179950.83, 'SISPAG FORNECEDORES'),
      ev('a1', '2026-10-01T20:00:00Z', '2026-10-01', -103055.92, 'APL APLIC AUT MAIS'),
      ev('c1', '2026-10-01T12:00:00Z', '2026-10-01', 103055.92, 'TED RECEBIDA'),
    ],
    saldos: [
      disp('SALDO TOTAL DISPONÍVEL DIA', '2026-10-02T23:59:59.999-03:00', -76595.68),
      fech('2026-10-02', -76595.68),
      disp('SALDO TOTAL DISPONÍVEL DIA', '2026-10-01T23:59:59.999-03:00', 103355.11),
      fech('2026-10-01', 1),
      aplic('2026-10-01', 103354.11),
      fech('2026-09-30', 1), // sem o total do dia: conta + aplicação
      aplic('2026-09-30', 298.19),
      aplic('2026-10-05', 0), // posição de agora: não é fechamento
    ],
    dataInicio: '2026-10-01',
    dataFim: '2026-10-02',
  });
  const [d01, d02] = r.dias;
  assert.strictEqual(d01.saldoInicial, 299.19, 'começa no saldo real, não no R$ 1,00 da conta');
  assert.deepStrictEqual(d01.lancamentos.map((l) => l.id), ['c1'], 'APL APLIC AUT fica de fora');
  assert.strictEqual(d01.saldoFinal, 103355.11);
  assert.strictEqual(d02.saldoInicial, 103355.11);
  assert.deepStrictEqual(d02.lancamentos.map((l) => l.id), ['r2', 'p2'], 'RES sai, rendimento fica');
  assert.strictEqual(d02.lancamentos.at(-1).saldoApos, -76595.68, 'fecha com o total do Itaú');
});

test('centavos não acumulam erro de ponto flutuante', () => {
  const eventos = Array.from({ length: 10 }, (_, i) => ev(`e${i}`, `2026-09-30T1${i}:00:00Z`, '2026-09-30', 0.1));
  const r = montarExtrato({ eventos, saldos: [fech('2026-09-29', 0), fech('2026-09-30', 1)], dataInicio: '2026-09-30', dataFim: '2026-09-30' });
  assert.strictEqual(r.dias[0].lancamentos.at(-1).saldoApos, 1);
  assert.strictEqual(r.dias[0].entradas, 1);
});
