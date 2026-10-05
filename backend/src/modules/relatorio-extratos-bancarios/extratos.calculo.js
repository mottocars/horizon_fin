// ---------------------------------------------------------------------------------------
// Monta o extrato de uma conta (dias, saldo inicial/final, saldo após cada lançamento) a
// partir da resposta crua da API de Extrato do Itaú. Função pura — coberta por
// backend/test/extratos.test.js.
//
// Saldos que a API manda num período (confirmado em produção, set/out 2026):
//   - "SALDO MOVIMENTAÇÃO CONTA" (type saldo_conta, 23:59 de cada dia útil fechado): é o que
//     FECHA com os lançamentos — fechamento(D-1) + lançamentos(D) = fechamento(D). É a base.
//   - "SALDO TOTAL DISPONÍVEL DIA" / "SALDO ANTERIOR" (saldo_disponivel): incluem a aplicação
//     automática, não batem lançamento a lançamento — não servem pra reconstruir o dia.
//   - "SALDO EM CONTA" (saldo_disponivel, agora): posição atual; só usado como último recurso.
// Saldo final do dia D = fechamento de D; sem fechamento (hoje, dia ainda aberto) = fechamento
// anterior + lançamentos até D; sem nenhum fechamento antes, volta do próximo fechamento.
// Saldo inicial = final − lançamentos do dia. Tudo em centavos (inteiros) pra não acumular erro.
// ---------------------------------------------------------------------------------------

const cent = (v) => Math.round(Number(v) * 100);
const real = (c) => c / 100;
const literal = (b) => `${b?.literal?.complete || ''} ${b?.literal?.shortened || ''}`;

function contraparteDe(e) {
  const c = e.counterpart || {};
  const contaCp = c.account ? `${c.account}${c.digit ? `-${c.digit}` : ''}` : '';
  return {
    nome: c.name || '',
    documento: c.document || '',
    banco: c.institution || c.ispb || '',
    agencia: c.agency || '',
    conta: contaCp,
  };
}

function normalizarEvento(e, ordem) {
  return {
    id: e.id || `sem-id-${ordem}`,
    ordem,
    dataHora: e.date?.event || null,
    dataContabil: (e.date?.accounting || e.date?.event || '').slice(0, 10),
    operacao: e.operation === 'C' ? 'C' : 'D',
    valorCent: cent(e.amount?.value || 0),
    historico: e.literal?.complete || e.literal?.shortened || '',
    complemento: [e.literal?.complementary, e.origin?.complement].filter(Boolean).join(' · '),
    contraparte: contraparteDe(e),
    canal: [e.origin?.channel, e.origin?.type].filter(Boolean).join(' · '),
    estorno: Boolean(e.reversal),
  };
}

// A API devolve do mais novo pro mais antigo; dentro do mesmo horário, mantém a ordem inversa
// da resposta (que já é cronológica ao contrário).
function ordenarCronologico(eventos) {
  return [...eventos].sort((a, b) => {
    const ta = Date.parse(a.dataHora || 0);
    const tb = Date.parse(b.dataHora || 0);
    if (ta !== tb) return ta - tb;
    return b.ordem - a.ordem;
  });
}

function montarExtrato({ eventos = [], saldos = [], dataInicio, dataFim }) {
  const fechamentos = new Map();
  for (const b of saldos) {
    if (b?.type === 'saldo_conta' && b.date?.event && typeof b.amount?.value === 'number') {
      fechamentos.set(b.date.event.slice(0, 10), cent(b.amount.value));
    }
  }
  const emConta = saldos.find((b) => b?.type === 'saldo_disponivel' && /em\s+conta/i.test(literal(b)));
  const aplicacao = saldos
    .filter((b) => b?.type === 'saldo_aplic_aut' && typeof b.amount?.value === 'number')
    .sort((a, b) => Date.parse(b.date?.event || 0) - Date.parse(a.date?.event || 0))[0];

  const lancamentos = ordenarCronologico(eventos.map(normalizarEvento));
  const somaDia = new Map();
  for (const l of lancamentos) somaDia.set(l.dataContabil, (somaDia.get(l.dataContabil) || 0) + l.valorCent);
  const somaEntre = (de, ate) => {
    // lançamentos com de < dia <= ate
    let s = 0;
    for (const [dia, v] of somaDia) if (dia > de && dia <= ate) s += v;
    return s;
  };

  const diasFechados = [...fechamentos.keys()].sort();
  // Saldo ao fim do dia `dia` + de onde veio.
  function saldoFinal(dia) {
    if (fechamentos.has(dia)) return { cent: fechamentos.get(dia), fonte: 'FECHAMENTO' };
    const anterior = diasFechados.filter((d) => d < dia).pop();
    if (anterior) return { cent: fechamentos.get(anterior) + somaEntre(anterior, dia), fonte: 'CALCULADO' };
    const proximo = diasFechados.find((d) => d > dia);
    if (proximo) return { cent: fechamentos.get(proximo) - somaEntre(dia, proximo), fonte: 'CALCULADO' };
    if (emConta) {
      // Sem nenhum fechamento na janela: parte da posição atual e desconta o que veio depois.
      const depois = [...somaDia].filter(([d]) => d > dia).reduce((s, [, v]) => s + v, 0);
      return { cent: cent(emConta.amount.value) - depois, fonte: 'ESTIMADO' };
    }
    return null;
  }

  const diasNoPeriodo = [...new Set([...somaDia.keys(), ...diasFechados])]
    .filter((d) => d >= dataInicio && d <= dataFim)
    .sort();

  const dias = [];
  for (const data of diasNoPeriodo) {
    // Dia útil sem lançamento (só o fechamento) também aparece: saldo inicial = final.
    const doDia = lancamentos.filter((l) => l.dataContabil === data);
    const fim = saldoFinal(data);
    if (!fim) continue;
    const inicial = fim.cent - (somaDia.get(data) || 0);
    let corrente = inicial;
    const linhas = doDia.map((l) => {
      corrente += l.valorCent;
      return {
        id: l.id,
        dataHora: l.dataHora,
        operacao: l.operacao,
        valor: real(l.valorCent),
        saldoApos: real(corrente),
        historico: l.historico,
        complemento: l.complemento,
        contraparte: l.contraparte,
        canal: l.canal,
        estorno: l.estorno,
      };
    });
    dias.push({
      data,
      saldoInicial: real(inicial),
      entradas: real(doDia.filter((l) => l.valorCent > 0).reduce((s, l) => s + l.valorCent, 0)),
      saidas: real(doDia.filter((l) => l.valorCent < 0).reduce((s, l) => s + l.valorCent, 0)),
      saldoFinal: real(fim.cent),
      fonte: fim.fonte,
      lancamentos: linhas,
    });
  }

  const fimPeriodo = saldoFinal(dataFim);
  return {
    dias,
    saldoFimPeriodo: fimPeriodo ? real(fimPeriodo.cent) : null,
    fonteSaldoFimPeriodo: fimPeriodo?.fonte || null,
    saldoEmConta: emConta ? { valor: emConta.amount.value, posicao: emConta.date?.event || null } : null,
    aplicacaoAutomatica: aplicacao ? { valor: aplicacao.amount.value, posicao: aplicacao.date?.event || null } : null,
  };
}

module.exports = { montarExtrato };
