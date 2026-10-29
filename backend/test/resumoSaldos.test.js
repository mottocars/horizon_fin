// Resumo dos saldos (Liberado + cheque = Liberado + Limite cheque / Liberado / bloqueado / Limite cheque /
// Saldo a cobrir) — `npm test`.
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
  return {
    liberadoCheque: r.liberadoCheque[DIA],
    liberado: r.liberado[DIA],
    bloqueado: r.bloqueado[DIA],
    limiteCheque: r.limiteCheque[DIA],
    aCobrir: r.aCobrir[DIA],
  };
};

test('liberada: Liberado = saldo menos bloqueio, sem o cheque; Liberado + cheque = Liberado + Limite cheque', () => {
  assert.deepStrictEqual(resumo([conta(true, 1000, { bloqueios: { [DIA]: 200 }, valor_cheque_especial: 500 })]), {
    liberadoCheque: 1300, liberado: 800, bloqueado: 200, limiteCheque: 500, aCobrir: 0,
  });
});

test('exemplos do usuário: −500 e 500 com 100 mil de limite', () => {
  assert.deepStrictEqual(resumo([conta(true, -500, { valor_cheque_especial: 100000 })]), {
    liberadoCheque: 99500, liberado: 0, bloqueado: 0, limiteCheque: 99500, aCobrir: -500,
  });
  assert.deepStrictEqual(resumo([conta(true, 500, { valor_cheque_especial: 100000 })]), {
    liberadoCheque: 100500, liberado: 500, bloqueado: 0, limiteCheque: 100000, aCobrir: 0,
  });
  assert.deepStrictEqual(resumo([conta(true, -300)]), { liberadoCheque: 0, liberado: 0, bloqueado: 0, limiteCheque: 0, aCobrir: -300 });
});

test('bloqueada: saldo inteiro no bloqueado (o bloqueio registrado nela não soma de novo); fora do Liberado + cheque', () => {
  assert.deepStrictEqual(resumo([conta(false, 800, { bloqueios: { [DIA]: 100 } })]), {
    liberadoCheque: 0, liberado: 0, bloqueado: 800, limiteCheque: 0, aCobrir: 0,
  });
});

test('não informada: só o bloqueio registrado conta; cheque só em dia com período', () => {
  assert.deepStrictEqual(resumo([conta(null, 500, { bloqueios: { [DIA]: 50 }, valor_cheque_especial: 1000 })], new Set()), {
    liberadoCheque: 0, liberado: 0, bloqueado: 50, limiteCheque: 0, aCobrir: 0,
  });
});

test('dia sem saldo lançado fica fora; centavos sem erro de ponto flutuante', () => {
  assert.deepStrictEqual(calcularResumoSaldos([conta(true, undefined)], [DIA], periodos).liberadoCheque, {});
  assert.strictEqual(resumo([conta(true, 0.1), conta(true, 0.2)]).liberado, 0.3);
});
