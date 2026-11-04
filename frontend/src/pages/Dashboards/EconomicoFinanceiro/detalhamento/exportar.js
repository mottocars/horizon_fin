import { TIPOS, codigoPlano, lbl, mensal, nomeCentro, nomeDocumento, nomeMascara, nomeOrigem, nomePessoa, nomePlano, resumo, titulo } from './modelo';

// Excel do Detalhamento Financeiro (no navegador, com o SheetJS): o resumo, o mês a mês e cada fatia (rateio)
// do realizado e do em aberto do escopo — os mesmos números da tela.
const data = (iso) => (iso ? new Date(`${iso}T12:00:00`) : null);
const R$ = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const r2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);

function formatar(XLSX, planilha, larguras, moeda) {
  const cab = Object.keys(larguras);
  planilha['!cols'] = cab.map((h) => ({ wch: larguras[h] }));
  if (!planilha['!ref']) return;
  const range = XLSX.utils.decode_range(planilha['!ref']);
  moeda.forEach((h) => {
    const c = cab.indexOf(h);
    if (c < 0) return;
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const cel = planilha[XLSX.utils.encode_cell({ r, c })];
      if (cel && cel.t === 'n') cel.z = R$;
    }
  });
  planilha['!autofilter'] = { ref: planilha['!ref'] };
}

export async function exportarDetalhamento(E, nomeArquivo) {
  const XLSX = await import('xlsx');
  const { B } = E;
  const livro = XLSX.utils.book_new();

  const R = resumo(E);
  const p1 = XLSX.utils.json_to_sheet(
    [
      ['Realizado', R.R],
      ['Em aberto', R.A],
      ['Total', R.T],
    ].map(([k, x]) => ({ '': k, Entradas: r2(x.e), Saídas: r2(x.s), Resultado: r2(x.res) }))
  );
  formatar(XLSX, p1, { '': 14, Entradas: 18, Saídas: 18, Resultado: 18 }, ['Entradas', 'Saídas', 'Resultado']);
  XLSX.utils.book_append_sheet(livro, p1, 'Resumo');

  const colsM = ['Entradas realizadas', 'Entradas em aberto', 'Saídas realizadas', 'Saídas em aberto', 'Resultado', 'Acumulado'];
  const p2 = XLSX.utils.json_to_sheet(
    mensal(E).map((m) => ({
      Mês: lbl(m.mes),
      'Entradas realizadas': r2(m.eR),
      'Entradas em aberto': r2(m.eA),
      'Saídas realizadas': r2(m.sR),
      'Saídas em aberto': r2(m.sA),
      Resultado: r2(m.res),
      Acumulado: r2(m.acum),
    }))
  );
  formatar(XLSX, p2, { Mês: 10, ...Object.fromEntries(colsM.map((c) => [c, 18])) }, colsM);
  XLSX.utils.book_append_sheet(livro, p2, 'Mês a mês');

  // Cada fatia do rateio, realizada e em aberto.
  const linhas = [...E.pecas]
    .sort((a, b) => (a.tipo === b.tipo ? a.data.localeCompare(b.data) : a.tipo === 'R' ? -1 : 1))
    .map((x) => {
      const real = x.tipo === 'R';
      const it = real ? x.L : x.T;
      return {
        Situação: TIPOS[x.tipo],
        Lado: x.lado === 'e' ? 'Entrada' : 'Saída',
        Data: data(real ? it.d : null),
        Vencimento: data(real ? it.vc : it.v),
        Mês: lbl(x.mes),
        Origem: real ? nomeOrigem(it.o) : it.l === 'r' ? 'Contas a receber' : 'Contas a pagar',
        Conta: real && it.conta ? titulo(it.conta.nome) : '',
        Título: it.b ?? '',
        Parcela: it.p ?? '',
        'Cliente / fornecedor': nomePessoa(B, x),
        Documento: nomeDocumento(B, it.doc),
        'Nº documento': it.n || '',
        Descrição: real && it.ds ? titulo(it.ds) : '',
        'Centro de custo': nomeCentro(B, x.centro),
        'Código do plano': codigoPlano(B, x.nat),
        'Plano de contas': nomePlano(B, x.nat),
        'Máscara DFC': nomeMascara(x),
        'Rateio %': real ? (it.v ? Math.round((x.valor / it.v) * 10000) / 100 : 100) : Math.round(x.frac * 10000) / 100,
        Valor: r2(x.valor),
      };
    });
  const larg = {
    Situação: 11,
    Lado: 9,
    Data: 11,
    Vencimento: 11,
    Mês: 8,
    Origem: 18,
    Conta: 22,
    Título: 9,
    Parcela: 8,
    'Cliente / fornecedor': 36,
    Documento: 20,
    'Nº documento': 14,
    Descrição: 36,
    'Centro de custo': 30,
    'Código do plano': 12,
    'Plano de contas': 38,
    'Máscara DFC': 34,
    'Rateio %': 9,
    Valor: 18,
  };
  const p3 = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ Situação: 'Nada no período' }], { cellDates: true, dateNF: 'dd/mm/yyyy' });
  if (linhas.length) formatar(XLSX, p3, larg, ['Valor']);
  XLSX.utils.book_append_sheet(livro, p3, 'Lançamentos e parcelas');

  XLSX.writeFile(livro, nomeArquivo);
}
