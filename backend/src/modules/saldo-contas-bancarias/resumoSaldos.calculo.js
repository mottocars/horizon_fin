// Resumo dos saldos (linhas abaixo do TOTAL GERAL na grade, 1ª seção da planilha e corpo do
// WhatsApp do Comunicar Saldos) — função pura (backend/test/resumoSaldos.test.js). A grade tem
// a mesma regra em frontend/.../SaldoContasBancarias/constantes.js::calcularResumoSaldos.
//
// Por dia, olhando só as contas com saldo lançado no dia:
// - Total liberado: contas de classificação liberada — saldo menos o bloqueio registrado (só a
//   parte positiva) + limite restante do cheque especial. Saldo negativo não entra (já está
//   descontado do limite restante e aparece no Saldo a cobrir): -200 com limite 500 -> 300.
// - Total bloqueado: saldo inteiro das contas de classificação bloqueada + bloqueios
//   registrados nas demais contas.
// - Limite cheque: soma dos limites restantes do cheque especial (todas as contas).
// - Saldo a cobrir: soma dos saldos negativos (todas as contas).
// Limite restante segue a regra da linha de detalhe da grade: só nos dias com abertura de
// período (`periodos`); saldo negativo -> limite + saldo; senão o limite inteiro.
// Classificação com liberado/bloqueado não informado (null) não entra em nenhum dos dois totais
// pelo saldo — só o bloqueio registrado dela conta como bloqueado.

const RESUMO_SALDOS = [
  { chave: 'liberado', rotulo: 'Total liberado' },
  { chave: 'bloqueado', rotulo: 'Total bloqueado' },
  { chave: 'limiteCheque', rotulo: 'Limite cheque' },
  { chave: 'aCobrir', rotulo: 'Saldo a cobrir' },
];

const centavos = (v) => Math.round(Number(v) * 100);

function limiteRestanteCentavos(conta, iso, periodos) {
  const limite = conta.valor_cheque_especial;
  if (!(limite > 0) || !periodos.has(iso)) return 0;
  const saldo = conta.saldos[iso];
  return saldo < 0 ? centavos(limite) + centavos(saldo) : centavos(limite);
}

// Quanto UMA conta entra em cada total no dia `iso` (em centavos) — base de calcularResumoSaldos
// e do detalhamento do MCP (quem compõe cada total). null = conta sem saldo lançado no dia.
function contribuicaoConta(conta, iso, periodos) {
  if (conta.saldos[iso] === undefined || conta.saldos[iso] === null) return null;
  const saldo = centavos(conta.saldos[iso]);
  const bloqueio = centavos(conta.bloqueios?.[iso] || 0);
  const restante = limiteRestanteCentavos(conta, iso, periodos);
  return {
    saldo,
    bloqueio,
    restante,
    liberado: conta.classificacao_libera_saldo === true ? Math.max(saldo - bloqueio, 0) + restante : 0,
    bloqueado: conta.classificacao_libera_saldo === false ? saldo : bloqueio,
    limiteCheque: restante,
    aCobrir: Math.min(saldo, 0),
  };
}

// `contas`: o formato de saldos.service.js::getSaldos (saldos/bloqueios por dia,
// classificacao_libera_saldo, valor_cheque_especial). Devolve { liberado: {iso: n}, ... } —
// só os dias em que alguma conta tem saldo lançado.
function calcularResumoSaldos(contas, diasIso, periodos) {
  const resumo = Object.fromEntries(RESUMO_SALDOS.map((r) => [r.chave, {}]));
  for (const iso of diasIso) {
    const partes = contas.map((c) => contribuicaoConta(c, iso, periodos)).filter(Boolean);
    if (partes.length === 0) continue;
    for (const { chave } of RESUMO_SALDOS) resumo[chave][iso] = partes.reduce((t, p) => t + p[chave], 0) / 100;
  }
  return resumo;
}

module.exports = { RESUMO_SALDOS, calcularResumoSaldos, contribuicaoConta };
