import { FAIXAS, escada, nomeCentro, nomeCondicao, nomeDocumento, nomeEmpresa, nomeNatureza, nomePessoa } from './modelo';

// Excel do Aging List (no navegador, com o SheetJS): resumo por faixa e uma aba por carteira com cada
// fatia (parcela × centro × natureza) do escopo da barra — mesmos números da tela.
const data = (iso) => (iso ? new Date(`${iso}T12:00:00`) : null);
const R$ = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

function formatar(XLSX, planilha, larguras, moeda) {
  const cab = Object.keys(larguras);
  planilha['!cols'] = cab.map((h) => ({ wch: larguras[h] }));
  const range = XLSX.utils.decode_range(planilha['!ref']);
  moeda.forEach((h) => {
    const c = cab.indexOf(h);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const cel = planilha[XLSX.utils.encode_cell({ r, c })];
      if (cel && cel.t === 'n') cel.z = R$;
    }
  });
  planilha['!autofilter'] = { ref: planilha['!ref'] };
}

export async function exportarAging(E, nomeArquivo) {
  const XLSX = await import('xlsx');
  const { B } = E;
  const livro = XLSX.utils.book_new();

  const es = escada(E);
  const resumo = es.linhas.map((l) => ({
    Faixa: l.rotulo,
    'A receber': Math.round(l.r * 100) / 100,
    'A pagar': Math.round(l.p * 100) / 100,
    Líquido: Math.round(l.liq * 100) / 100,
    'Caixa acumulado': l.acum === null ? null : Math.round(l.acum * 100) / 100,
  }));
  resumo.push({ Faixa: 'Total', 'A receber': es.r.total, 'A pagar': es.p.total, Líquido: es.posicao, 'Caixa acumulado': null });
  const p1 = XLSX.utils.json_to_sheet(resumo);
  formatar(XLSX, p1, { Faixa: 30, 'A receber': 18, 'A pagar': 18, Líquido: 18, 'Caixa acumulado': 18 }, ['A receber', 'A pagar', 'Líquido', 'Caixa acumulado']);
  XLSX.utils.book_append_sheet(livro, p1, 'Resumo por faixa');

  ['r', 'p'].forEach((lado) => {
    const pessoa = lado === 'r' ? 'Cliente' : 'Fornecedor';
    const linhas = E.linhas
      .filter((x) => x.t.l === lado)
      .sort((a, b) => b.t.atraso - a.t.atraso)
      .map(({ t, centro, nat, frac, valor }) => ({
        Empresa: nomeEmpresa(B, t.c),
        'Centro de custo': nomeCentro(B, centro),
        Natureza: nomeNatureza(B, nat),
        [pessoa]: nomePessoa(B, lado, t.q),
        Título: t.b,
        Parcela: t.p,
        ...(lado === 'r' ? { 'Nº parcela': t.pc || '', Unidade: t.u || '', Condição: t.cp ? nomeCondicao(B, t.cp) : '' } : {}),
        Documento: nomeDocumento(B, t.d),
        'Nº documento': t.n || '',
        Emissão: data(t.e),
        Vencimento: data(t.v),
        'Dias de atraso': t.atraso,
        Faixa: FAIXAS[t.fx].rotulo,
        'Saldo sem correção': t.o,
        'Saldo corrigido': t.s,
        'Rateio %': Math.round(frac * 10000) / 100,
        'Valor no rateio': Math.round(valor * 100) / 100,
        Situação: [t.ina ? 'Inadimplente' : '', t.sj ? 'Sub judice' : '', t.pv ? 'Previsão' : ''].filter(Boolean).join(', '),
      }));
    const larg = {
      Empresa: 22,
      'Centro de custo': 28,
      Natureza: 32,
      [pessoa]: 36,
      Título: 9,
      Parcela: 8,
      ...(lado === 'r' ? { 'Nº parcela': 10, Unidade: 10, Condição: 22 } : {}),
      Documento: 24,
      'Nº documento': 16,
      Emissão: 11,
      Vencimento: 11,
      'Dias de atraso': 9,
      Faixa: 26,
      'Saldo sem correção': 16,
      'Saldo corrigido': 16,
      'Rateio %': 9,
      'Valor no rateio': 16,
      Situação: 16,
    };
    const pl = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ [pessoa]: 'Nenhuma parcela em aberto' }], { cellDates: true, dateNF: 'dd/mm/yyyy' });
    if (linhas.length) formatar(XLSX, pl, larg, ['Saldo sem correção', 'Saldo corrigido', 'Valor no rateio']);
    XLSX.utils.book_append_sheet(livro, pl, lado === 'r' ? 'A receber' : 'A pagar');
  });

  XLSX.writeFile(livro, nomeArquivo);
}
