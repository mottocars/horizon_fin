// Resumo dos saldos (Total liberado / bloqueado / Limite cheque / Saldo a cobrir) — `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const { calcularResumoSaldos } = require('../src/modules/saldo-contas-bancarias/resumoSaldos.calculo');

const DIA = '2026-10-28';
const periodos = new Set([DIA]);
const conta = (libera, saldo, extra = {}) => ({
  classificacao_libera_saldo: libera,
  saldos: saldo === undefined ? {} : { [DIA]: saldo },
  bloqueios: {},
  valor_cheque_especial: null,
  ...extra,
});
const resumo = (contas, p = periodos) => {
  const r = calcularResumoSaldos(contas, [DIA], p);
  return { liberado: r.liberado[DIA], bloqueado: r.bloqueado[DIA], limiteCheque: r.limiteCheque[DIA], aCobrir: r.aCobrir[DIA] };
};

test('liberada: saldo menos bloqueio + limite restante; o bloqueio vai pro bloqueado', () => {
  assert.deepStrictEqual(
    resumo([conta(true, 1000, { bloqueios: { [DIA]: 200 }, valor_cheque_especial: 500 })]),
    { liberado: 1300, bloqueado: 200, limiteCheque: 500, aCobrir: 0 }
  );
});

test('liberada negativa com cheque: só o restante entra no liberado, o negativo no a cobrir', () => {
  assert.deepStrictEqual(resumo([conta(true, -200, { valor_cheque_especial: 500 })]), {
    liberado: 300, bloqueado: 0, limiteCheque: 300, aCobrir: -200,
  });
  assert.deepStrictEqual(resumo([conta(true, -300)]), { liberado: 0, bloqueado: 0, limiteCheque: 0, aCobrir: -300 });
});

test('bloqueada: saldo inteiro no bloqueado (o bloqueio registrado nela não soma de novo)', () => {
  assert.deepStrictEqual(resumo([conta(false, 800, { bloqueios: { [DIA]: 100 } })]), {
    liberado: 0, bloqueado: 800, limiteCheque: 0, aCobrir: 0,
  });
});

test('não informada: só o bloqueio registrado conta; cheque só em dia com período', () => {
  assert.deepStrictEqual(resumo([conta(null, 500, { bloqueios: { [DIA]: 50 }, valor_cheque_especial: 1000 })], new Set()), {
    liberado: 0, bloqueado: 50, limiteCheque: 0, aCobrir: 0,
  });
});

test('dia sem saldo lançado fica fora; centavos sem erro de ponto flutuante', () => {
  assert.deepStrictEqual(calcularResumoSaldos([conta(true, undefined)], [DIA], periodos).liberado, {});
  assert.strictEqual(resumo([conta(true, 0.1), conta(true, 0.2)]).liberado, 0.3);
});
