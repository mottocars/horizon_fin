const { CORES, borda, preencher, cabecalho, faixa, cabecalhoTabela, impressao, dataExcel, dataHoraExcel } = require('../../../utils/excelMarca');
const { fimDoMes, vespera, baseDoImposto } = require('../../dre-demonstrativo/demonstrativo.service');
const { FMT, PRIMEIRA, aba, layout, tabela, rotuloCentro, rotuloMes, dataBr, dataHoraBr, moedaBr } = require('./comum');

// Abas da PROJEÇÃO na exportação de auditoria da DRE (a projeção da coluna Projetado da aba DRE: a
// versão salva escolhida no filtro Versão, ou os rascunhos + a última versão):
//   Projeção            — o dossiê: de qual versão veio, cada orçamento (ciclo, trava, quem concluiu), os
//                         totais do ciclo, as premissas por centro e como a projeção é calculada;
//   Projeção Mensal     — a DRE de cada orçamento mês a mês dentro do período, como foi GRAVADA na versão
//                         (é o que a aba DRE soma nas colunas Projetado / Desvio %): até a trava, o
//                         realizado da data do orçamento; depois, o projetado;
//   Memória Projeção    — os meses projetados refeitos em fórmulas, como a Memória de Cálculo do realizado:
//                         base acumulada = realizado até a trava (SOMASES nas bases do realizado, datas
//                         até o fim do mês da trava) + premissas até o mês (SOMASES na Premissas
//                         Projeção), × fator da POC Projeção; ao lado, o valor gravado na versão e a
//                         diferença (≠ 0 = o realizado até a trava mudou depois que a versão foi salva);
//   POC Projeção        — POC de Receita / Despesa e fração distratada de cada centro em cada mês
//                         projetado, em fórmulas, com as POCs gravadas na versão ao lado;
//   Premissas Projeção  — o que entrou depois da trava, linha a linha: vendas de unidades (mês, valor e de
//                         onde veio o valor), naturezas (por Origem Projeção) e correção monetária.

const NOMES = {
  resumo: 'Projeção',
  mensal: 'Projeção Mensal',
  memoria: 'Memória Projeção',
  poc: 'POC Projeção',
  premissas: 'Premissas Projeção',
};
const TODO = 1e8; // POC arredondada em 8 casas na fração, como no sistema
const AMARELO_PROJ = 'FFFDF6D3';

const ROTULO_ORIGEM = {
  NAO_POSSUI: 'NÃO POSSUI ORIGEM',
  HORIZON_ORCAMENTO_INFORMADO: 'HORIZON - INFORMADO',
  SIENGE_ORCAMENTO_EMPRESARIAL: 'SIENGE - EMPRESARIAL',
  SIENGE_AGING: 'SIENGE - AGING',
};
const COMO_ORIGEM = {
  HORIZON_ORCAMENTO_INFORMADO: 'digitado no assistente (ou importado pela planilha), mês a mês',
  SIENGE_ORCAMENTO_EMPRESARIAL: 'orçamento empresarial do Sienge do centro (última versão), no mês orçado, com sinal de saída',
  SIENGE_AGING: 'títulos a pagar / receber do Sienge com EMISSÃO no mês (data de emissão do título futuro)',
};

const COL_MENSAL = [
  { chave: 'centro_id', rotulo: 'Centro (id)', largura: 8 },
  { chave: 'centro', rotulo: 'Centro de custo', largura: 26 },
  { chave: 'orcamento', rotulo: 'Orçamento', largura: 16 },
  { chave: 'mes', rotulo: 'Mês', largura: 9, formato: 'mes' },
  { chave: 'fonte_mes', rotulo: 'O que é o valor do mês', largura: 22 },
  { chave: 'comparavel', rotulo: 'Entra no Desvio %? (mês até o atual)', largura: 11 },
  { chave: 'ordem_grupo', rotulo: 'Ordem do grupo', largura: 7 },
  { chave: 'grupo_id', rotulo: 'Id grupo', largura: 7 },
  { chave: 'grupo', rotulo: 'Grupo DRE (nível 1)', largura: 24 },
  { chave: 'ordem', rotulo: 'Ordem na DRE', largura: 7 },
  { chave: 'linha', rotulo: 'Linha DRE (nível 2)', largura: 30 },
  { chave: 'mascara_id', rotulo: 'Id linha', largura: 7 },
  { chave: 'valor', rotulo: 'Projetado (gravado no orçamento)', largura: 16, formato: 'moeda', total: true, destaque: true },
];

const COL_PREMISSAS = [
  { chave: 'centro_id', rotulo: 'Centro (id)', largura: 8 },
  { chave: 'centro', rotulo: 'Centro de custo', largura: 24 },
  { chave: 'orcamento', rotulo: 'Orçamento', largura: 14 },
  { chave: 'tipo', rotulo: 'Premissa', largura: 18 },
  { chave: 'mes', rotulo: 'Mês', largura: 9, formato: 'mes' },
  { chave: 'periodo', rotulo: 'No período?', largura: 8 },
  { chave: 'unidade', rotulo: 'Unidade', largura: 12 },
  { chave: 'tipo_unidade', rotulo: 'Tipo da unidade', largura: 14 },
  { chave: 'natureza_id', rotulo: 'Cód. natureza', largura: 11, codigo: true },
  { chave: 'natureza', rotulo: 'Natureza', largura: 30 },
  { chave: 'mascara_id', rotulo: 'Id linha', largura: 7 },
  { chave: 'linha', rotulo: 'Linha DRE (nível 2)', largura: 28 },
  { chave: 'origem', rotulo: 'Origem Projeção', largura: 22 },
  { chave: 'como', rotulo: 'De onde veio o valor', largura: 44 },
  { chave: 'valor', rotulo: 'Valor', largura: 15, formato: 'moeda', total: true, destaque: true },
  { chave: 'venda', rotulo: 'Venda (base da Receita)', largura: 14, formato: 'moeda', total: true },
  { chave: 'fracao_vendida', rotulo: 'Fração vendida (POC de Despesa)', largura: 12, formato: 'fracao', total: true },
  { chave: 'valor_fin', rotulo: 'Natureza (base das linhas do Financeiro)', largura: 14, formato: 'moeda', total: true },
  { chave: 'correcao', rotulo: 'Correção monetária', largura: 13, formato: 'moeda', total: true },
];

const COL_POC = [
  { chave: 'centro_id', rotulo: 'Centro (id)', largura: 8 },
  { chave: 'centro', rotulo: 'Centro de custo', largura: 24 },
  { chave: 'data', rotulo: 'Data', largura: 11, formato: 'data' },
  { chave: 'referencia', rotulo: 'Ponto', largura: 16 },
  { chave: 'trava', rotulo: 'Fim do mês da trava', largura: 11, formato: 'data' },
  { chave: 'versao', rotulo: 'Versão do orçamento da obra (início)', largura: 12 },
  { chave: 'orcamento', rotulo: 'Orçamento vigente', largura: 15, formato: 'moeda' },
  { chave: 'custo_real', rotulo: 'Custo realizado até a trava', largura: 15, formato: 'moeda' },
  { chave: 'custo_prem', rotulo: 'Custo projetado até a data (premissas)', largura: 15, formato: 'moeda' },
  { chave: 'custo', rotulo: 'Custo acumulado (|realizado + projetado|)', largura: 15, formato: 'moeda' },
  { chave: 'poc_receita', rotulo: 'POC de Receita', largura: 12, formato: 'poc', destaque: true },
  { chave: 'vendida_real', rotulo: 'Fração vendida até a trava', largura: 12, formato: 'fracao' },
  { chave: 'vendida_prem', rotulo: 'Fração vendida projetada até a data', largura: 12, formato: 'fracao' },
  { chave: 'permuta', rotulo: 'Fração em permuta (até a trava)', largura: 12, formato: 'fracao' },
  { chave: 'poc_despesa', rotulo: 'POC de Despesa', largura: 12, formato: 'poc', destaque: true },
  { chave: 'distratada', rotulo: 'Fração distratada (até a trava)', largura: 12, formato: 'poc', destaque: true },
  { chave: 'liquida', rotulo: 'POC de Despesa − distratada', largura: 12, formato: 'poc' },
  { chave: 'estoque', rotulo: 'Fração em estoque', largura: 11, formato: 'poc' },
  { chave: 'poc_receita_versao', rotulo: 'POC de Receita (gravada)', largura: 12, formato: 'poc' },
  { chave: 'poc_despesa_versao', rotulo: 'POC de Despesa (gravada)', largura: 12, formato: 'poc' },
  { chave: 'distratada_versao', rotulo: 'Fração distratada (gravada)', largura: 12, formato: 'poc' },
  { chave: 'diferenca', rotulo: 'Maior diferença com o gravado', largura: 12, formato: 'fracao' },
];

const COL_MEMORIA = [
  { chave: 'centro_id', rotulo: 'Centro (id)', largura: 8 },
  { chave: 'centro', rotulo: 'Centro de custo', largura: 24 },
  { chave: 'mes', rotulo: 'Mês', largura: 9, formato: 'mes' },
  { chave: 'de', rotulo: 'De', largura: 10, formato: 'data' },
  { chave: 'ate', rotulo: 'Até', largura: 10, formato: 'data' },
  { chave: 'trava', rotulo: 'Fim do mês da trava', largura: 10, formato: 'data' },
  { chave: 'ordem', rotulo: 'Ordem na DRE', largura: 7 },
  { chave: 'grupo', rotulo: 'Grupo DRE (nível 1)', largura: 22 },
  { chave: 'linha', rotulo: 'Linha DRE (nível 2)', largura: 28 },
  { chave: 'mascara_id', rotulo: 'Id linha', largura: 7 },
  { chave: 'regra', rotulo: 'Regra de cálculo', largura: 42 },
  { chave: 'k', rotulo: 'Base acumulada até a véspera de "De"', largura: 15, formato: 'moeda' },
  { chave: 'u', rotulo: 'Base realizada até a trava (em "Até")', largura: 15, formato: 'moeda' },
  { chave: 'v', rotulo: 'Premissas até "Até"', largura: 15, formato: 'moeda' },
  { chave: 'l', rotulo: 'Base acumulada até "Até" (RET: base do mês)', largura: 15, formato: 'moeda' },
  { chave: 'mf', rotulo: 'Fator na véspera', largura: 11, formato: 'poc' },
  { chave: 'nf', rotulo: 'Fator em "Até" (RET: −alíquota)', largura: 11, formato: 'poc' },
  { chave: 'o', rotulo: 'Reconhecido até a véspera', largura: 15, formato: 'moeda' },
  { chave: 'p', rotulo: 'Reconhecido até "Até"', largura: 15, formato: 'moeda' },
  { chave: 'q', rotulo: 'Valor projetado no mês', largura: 15, formato: 'moeda', total: true, destaque: true },
  { chave: 'r', rotulo: 'Avanço sobre a base antiga', largura: 14, formato: 'moeda', total: true },
  { chave: 's', rotulo: 'Base nova × fator', largura: 14, formato: 'moeda', total: true },
  { chave: 't', rotulo: 'Valor gravado no orçamento', largura: 15, formato: 'moeda', total: true },
  { chave: 'dif', rotulo: 'Diferença (Excel − gravado)', largura: 12, formato: 'diferenca' },
];

const COL_FATOR = { POC_RECEITA: 'poc_receita', POC_DESPESA: 'poc_despesa', POC_DESPESA_LIQ: 'liquida', DISTRATADA: 'distratada' };
const num = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const arred2 = (v) => Math.round(v * 100) / 100;

// Rótulo do orçamento (coluna Orçamento das abas).
function rotuloOrcamento(orc) {
  if (orc.origem === 'VERSAO') return 'Versão salva';
  return orc.status === 'CONCLUIDO' ? 'Rascunho concluído' : 'Rascunho em andamento';
}

// De onde veio o valor de uma venda projetada (a regra de vendaDaUnidade).
function comoDaVenda(v, orc, naTrava) {
  const e = orc.dados?.unidades?.[v.chave];
  if (e && e.valor !== null && e.valor !== undefined && e.valor !== '') return 'Valor informado no assistente';
  const u = naTrava.get(v.chave);
  const doContrato = u?.venda_registrada && (!e || !e.mes || e.mes === u.venda_registrada.mes);
  if (!e && u?.venda_registrada) return `Venda registrada no Sienge depois da trava (contrato de ${rotuloMes(`${u.venda_registrada.mes}-01`)})`;
  if (doContrato && u.venda_registrada.valor !== null) return 'Valor do contrato registrado no Sienge depois da trava';
  if (u?.ticket !== null && u?.ticket !== undefined) return `Ticket médio do tipo ${u.tipo || '—'} (${moedaBr(u.ticket)})`;
  return 'Ticket médio do tipo (contratos não cancelados do empreendimento)';
}

// Linhas e layouts das abas (os resultados das fórmulas saem do motor refeito com as premissas da foto).
function montar(d, LY) {
  const P = d.projecao;
  if (!P || !P.orcamentos.length) return null;
  const { m, arvore, regras } = d;
  const mesDe = d.de.slice(0, 7);
  const mesAte = d.ate.slice(0, 7);
  const rot = (id) => {
    const c = m.obras.find((x) => x.id === id);
    return rotuloCentro({ id, rotulo: c?.rotulo || String(id) });
  };
  const ordemGrupo = new Map(arvore.map((g, i) => [g.id, i + 1]));
  const grupos = new Map(arvore.map((g) => [g.id, g.descricao]));
  const n2 = [];
  arvore.forEach((g) => g.filhos.forEach((f) => n2.push({ ...f, grupo_id: g.id, grupo: g.descricao })));
  const mascaraDe = new Map(m.mascaras.map((x) => [x.id, x]));
  const correcaoMascara = m.mascaras.find((x) => x.calculo === 'CORRECAO_MONETARIA') || null;

  // ---------------------------------------------------------------- Projeção Mensal (a foto)
  const mensal = [];
  P.orcamentos.forEach(({ orc }) => {
    const ms = orc.mensal;
    const rotOrc = rotuloOrcamento(orc);
    ms.meses.forEach((mes, i) => {
      if (mes < mesDe || mes > mesAte) return;
      n2.forEach((x, k) => {
        const v = ms.valores[x.id]?.[i];
        mensal.push({
          centro_id: orc.centro_id,
          centro: rot(orc.centro_id),
          orcamento: rotOrc,
          mes: `${mes}-01`,
          fonte_mes: ms.trava && mes <= ms.trava ? 'Realizado (data do orçamento)' : 'Projetado',
          comparavel: mes <= P.mesAtual ? 'Sim' : 'Não',
          ordem_grupo: ordemGrupo.get(x.grupo_id),
          grupo_id: x.grupo_id,
          grupo: x.grupo,
          ordem: k + 1,
          linha: x.descricao,
          mascara_id: x.id,
          valor: v === null || v === undefined ? null : Number(v),
        });
      });
    });
  });
  const lyMensal = layout(NOMES.mensal, COL_MENSAL, mensal.length);

  // ---------------------------------------------------------------- Premissas (o que o motor usou)
  const premissas = [];
  P.orcamentos.forEach(({ orc, foto, prep, naTrava }) => {
    const fonte = prep || foto;
    const base = { centro_id: orc.centro_id, centro: rot(orc.centro_id), orcamento: rotuloOrcamento(orc) };
    const noPeriodo = (mes) => (mes >= mesDe && mes <= mesAte ? 'Sim' : 'Não');
    (fonte.vendas || []).forEach((v) =>
      premissas.push({
        ...base,
        tipo: 'Venda de unidade',
        mes: `${v.mes}-01`,
        periodo: noPeriodo(v.mes),
        unidade: v.unidade,
        tipo_unidade: v.tipo,
        origem: 'Venda projetada',
        como: comoDaVenda(v, orc, naTrava),
        valor: num(v.valor),
        venda: num(v.valor),
        fracao_vendida: num(v.fracao_ideal),
      })
    );
    (fonte.naturezas || []).forEach((n) =>
      Object.entries(n.valores || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([mes, valor]) => {
          if (!num(valor)) return;
          premissas.push({
            ...base,
            tipo: 'Natureza',
            mes: `${mes}-01`,
            periodo: noPeriodo(mes),
            natureza_id: n.natureza_id,
            natureza: n.nome,
            mascara_id: n.mascara_id,
            linha: mascaraDe.get(n.mascara_id)?.descricao || null,
            origem: ROTULO_ORIGEM[n.origem] || n.origem,
            como: COMO_ORIGEM[n.origem] || '—',
            valor: num(valor),
            valor_fin: num(valor),
          });
        })
    );
    const corr = Array.isArray(fonte.correcao)
      ? fonte.correcao.map((x) => [x.data.slice(0, 7), x.valor])
      : Object.entries(fonte.correcao || {});
    corr
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([mes, valor]) => {
        if (!num(valor)) return;
        premissas.push({
          ...base,
          tipo: 'Correção monetária',
          mes: `${mes}-01`,
          periodo: noPeriodo(mes),
          mascara_id: correcaoMascara?.id ?? null,
          linha: correcaoMascara?.descricao || 'Correção monetária',
          origem: 'HORIZON - INFORMADO',
          como: 'digitada no assistente (etapa Custos da POC ou Demais contas), mês a mês',
          valor: num(valor),
          correcao: num(valor),
        });
      });
  });
  const lyPrem = layout(NOMES.premissas, COL_PREMISSAS, premissas.length);

  // ---------------------------------------------------------------- POC e Memória (meses projetados no período)
  const comMemoria = P.orcamentos.filter((o) => o.prep && o.mesesMem.length);
  const poc = [];
  const linhaPoc = new Map(); // `${ci}|${p}` -> linha
  const memoria = [];
  const nMasc = m.mascaras.length;
  // Base do imposto fixo (a máscara de índice k): as linhas acima marcadas (sem marcação, todas acima).
  const baseIds = (k) => baseDoImposto(m.mascaras, k).map((y) => y.id);
  const textoBase = (x, k) =>
    x.imposto_base ? `das linhas da base (${baseDoImposto(m.mascaras, k).map((y) => y.descricao).join(', ') || 'nenhuma acima'})` : 'das linhas acima';
  comMemoria.forEach((o, ci) => {
    const M = o.prep.motor;
    const id = o.orc.centro_id;
    const travaFim = o.j.travaFim;
    const intervalos = o.mesesMem.map((mes) => [`${mes}-01`, fimDoMes(`${mes}-01`)]);
    const pontos = [vespera(intervalos[0][0]), ...intervalos.map(([, b]) => b)];
    const fotoPoc = o.foto.poc || null;
    const daFoto = (D) => {
      if (!fotoPoc) return null;
      const mes = D.slice(0, 7);
      if (fotoPoc.trava?.mes === mes) return fotoPoc.trava;
      return (fotoPoc.meses || []).find((x) => x.mes === mes) || null;
    };
    const somaPrem = (filtro, D) =>
      premissas.filter((x) => x.centro_id === id && x.mes <= D && filtro(x)).reduce((t, x) => t + num(x.valor), 0);
    const pocId = m.mascaraPoc?.id;
    pontos.forEach((D, p) => {
      const r = M.pocEm ? M.pocEm(id, D) : null;
      const pd = M.pocDespesa(id, D);
      const fd = M.fracaoDistratada(id, D);
      const total = pocId ? M.custoAte.get(pocId)?.(id, D) ?? 0 : 0;
      const prem = pocId ? somaPrem((x) => x.tipo === 'Natureza' && x.mascara_id === pocId, D) : 0;
      const vendidaPrem = premissas
        .filter((x) => x.centro_id === id && x.tipo === 'Venda de unidade' && x.mes <= D)
        .reduce((t, x) => t + num(x.fracao_vendida), 0);
      // Versão do orçamento da obra vigente em D (a de início mais recente até D) — o resultado do MÁXIMOSES.
      const versao = d.orcamento.filter((x) => x.centro_id === id && x.inicio <= D).reduce((v, x) => (x.inicio > v ? x.inicio : v), '');
      const vendidaTotal = M.base.FRACAO_VENDAS(id, D);
      const f = daFoto(D);
      linhaPoc.set(`${ci}|${p}`, PRIMEIRA + poc.length);
      poc.push({
        centro_id: id,
        centro: rot(id),
        data: D,
        referencia: p === 0 ? (D === travaFim ? 'Trava (véspera)' : 'Véspera') : `Fim de ${rotuloMes(D)}`,
        trava: travaFim,
        versao: versao ? dataSerial(versao) : 0,
        orcamento: r ? r.orcamento : 0,
        custo_real: total - prem,
        custo_prem: prem,
        custo: r ? r.custo : Math.abs(total),
        poc_receita: r ? r.poc : null,
        vendida_real: vendidaTotal - vendidaPrem,
        vendida_prem: vendidaPrem,
        permuta: M.base.FRACAO_PERMUTA(id, D),
        poc_despesa: pd,
        distratada: fd,
        liquida: pd - fd,
        estoque: Math.max(0, 1 - (pd - fd)),
        poc_receita_versao: f ? f.receita : null,
        poc_despesa_versao: f ? f.despesa : null,
        distratada_versao: f ? f.distratada : null,
        diferenca: f ? Math.max(Math.abs(num(r?.poc) - num(f.receita)), Math.abs(pd - num(f.despesa)), Math.abs(fd - num(f.distratada))) : 0,
        temFoto: Boolean(f),
      });
    });

    const acumulado = (regra, x, D) => {
      const b = regra.base;
      if (b.fonte === 'FIN') return b.sinal * b.mascaras.reduce((t, mid) => t + (M.custoAte.get(mid)?.(id, D) ?? 0), 0);
      return M.base[x.calculo](id, D);
    };
    const fator = (regra, D) => {
      if (regra.fator === 'POC_RECEITA') return M.pocEm(id, D).poc;
      if (regra.fator === 'POC_DESPESA') return M.pocDespesa(id, D);
      if (regra.fator === 'POC_DESPESA_LIQ') return M.pocDespesa(id, D) - M.fracaoDistratada(id, D);
      if (regra.fator === 'DISTRATADA') return M.fracaoDistratada(id, D);
      return 1;
    };
    const ms = o.orc.mensal;
    intervalos.forEach(([a, b], i) => {
      const qMes = {};
      const idxFoto = ms.meses.indexOf(a.slice(0, 7));
      m.mascaras.forEach((x, k) => {
        const regra = regras.get(x.id);
        const gravado = idxFoto >= 0 ? ms.valores[x.id]?.[idxFoto] ?? null : null;
        const linha = {
          centro_id: id,
          centro: rot(id),
          mes: a,
          de: a,
          ate: b,
          trava: travaFim,
          ordem: k + 1,
          grupo: grupos.get(x.parent_id) || null,
          linha: x.descricao,
          mascara_id: x.id,
          t: gravado,
          ci,
          i,
          regraObj: regra,
          x,
        };
        if (regra.tipo === 'SEM_CALCULO' || (regra.tipo === 'RET' && gravado === null)) {
          memoria.push({ ...linha, regra: regra.tipo === 'RET' ? 'Sem cálculo: alguma linha da base do imposto não tem cálculo' : regra.texto, dif: 0 });
          return;
        }
        if (regra.tipo === 'RET') {
          const h = d.aliquotaEm(x.id, a);
          const aliq = h ? h.aliquota : 0;
          const acima = baseIds(k).reduce((t, id) => t + (qMes[id] || 0), 0);
          const q = (-acima * aliq) / 100;
          memoria.push({
            ...linha,
            regra: `RET: −${String(aliq).replace('.', ',')}% × soma ${textoBase(x, k)} no mês${h ? ` (alíquota desde ${rotuloMes(h.inicio)})` : ' (sem alíquota vigente)'}`,
            l: acima,
            baseIds: x.imposto_base ? baseIds(k) : null,
            nf: -aliq / 100,
            p: q,
            q,
            dif: arred2(q - num(gravado)),
          });
          qMes[x.id] = q;
          return;
        }
        const antes = i === 0 ? pontos[0] : intervalos[i - 1][1];
        const K = acumulado(regra, x, antes);
        const L = acumulado(regra, x, b);
        const U = acumulado(regra, x, b < travaFim ? b : travaFim);
        const Mf = fator(regra, antes);
        const Nf = fator(regra, b);
        const q = L * Nf - K * Mf;
        memoria.push({
          ...linha,
          regra: regra.texto,
          k: K,
          u: U,
          v: L - U,
          l: L,
          mf: Mf,
          nf: Nf,
          o: K * Mf,
          p: L * Nf,
          q,
          r: K * (Nf - Mf),
          s: (L - K) * Nf,
          dif: arred2(q - num(gravado)),
        });
        qMes[x.id] = q;
      });
    });
  });
  const lyPoc = layout(NOMES.poc, COL_POC, poc.length);
  const lyMem = layout(NOMES.memoria, COL_MEMORIA, memoria.length);

  // ---------------------------------------------------------------- fórmulas
  const BF = LY.financeiro;
  const BU = LY.unidades;
  const BC = LY.correcoes;
  const BO = LY.orcamento;
  const PB = lyPrem;
  const f = (formula, result) => ({ formula, result: result ?? 0 });
  const MIN = (data, trava) => `"<="&MIN(${data},${trava})`;
  const ATE = (data) => `"<="&${data}`;

  // Base do realizado até a trava (datas até MIN(data, fim do mês da trava)) e das premissas (até a data).
  const realizado = (regra, x, data, trava, centro) => {
    const b = regra.base;
    if (b.fonte === 'FIN') {
      if (!b.mascaras.length) return '0';
      const t = b.mascaras.map((mid) => `SUMIFS(${BF.faixa('valor')},${BF.faixa('mascara_id')},${mid},${BF.faixa('centro_id')},${centro},${BF.faixa('data')},${MIN(data, trava)})`);
      return b.sinal < 0 ? `-(${t.join('+')})` : t.join('+');
    }
    if (b.fonte === 'CORR') return `SUMIFS(${BC.faixa('total')},${BC.faixa('centro_id')},${centro},${BC.faixa('vencimento')},${MIN(data, trava)})`;
    return `SUMIFS(${BU.faixa(b.coluna)},${BU.faixa('centro_id')},${centro},${BU.faixa('data')},${MIN(data, trava)})`;
  };
  const projetadoAte = (regra, x, data, centro) => {
    const b = regra.base;
    if (b.fonte === 'FIN') {
      if (!b.mascaras.length) return '0';
      const t = b.mascaras.map((mid) => `SUMIFS(${PB.faixa('valor_fin')},${PB.faixa('mascara_id')},${mid},${PB.faixa('centro_id')},${centro},${PB.faixa('mes')},${ATE(data)})`);
      return b.sinal < 0 ? `-(${t.join('+')})` : t.join('+');
    }
    if (b.fonte === 'CORR') return `SUMIFS(${PB.faixa('correcao')},${PB.faixa('centro_id')},${centro},${PB.faixa('mes')},${ATE(data)})`;
    if (b.coluna === 'venda') return `SUMIFS(${PB.faixa('venda')},${PB.faixa('centro_id')},${centro},${PB.faixa('mes')},${ATE(data)})`;
    return '0';
  };

  const cm = (k) => lyMem.col[k];
  const cp = (k) => lyPoc.col[k];
  const memFaixa = (k) => `$${cm(k)}$${lyMem.primeira}:$${cm(k)}$${lyMem.ultima}`;
  const ehConta = (l) => l.k !== undefined;
  const colMemoria = COL_MEMORIA.map((c) => {
    const g = (fn) => ({ ...c, formula: fn });
    const centro = (n) => `$${cm('centro_id')}${n}`;
    const trava = (n) => `$${cm('trava')}${n}`;
    switch (c.chave) {
      case 'k':
        return g((n, l) => {
          if (!ehConta(l)) return null;
          if (l.i > 0) return f(`${cm('l')}${n - nMasc}`, l.k);
          const data = `($${cm('de')}${n}-1)`;
          return f(`${realizado(l.regraObj, l.x, data, trava(n), centro(n))}+${projetadoAte(l.regraObj, l.x, data, centro(n))}`, l.k);
        });
      case 'u':
        return g((n, l) => (ehConta(l) ? f(realizado(l.regraObj, l.x, `$${cm('ate')}${n}`, trava(n), centro(n)), l.u) : null));
      case 'v':
        return g((n, l) => (ehConta(l) ? f(projetadoAte(l.regraObj, l.x, `$${cm('ate')}${n}`, centro(n)), l.v) : null));
      case 'l':
        return g((n, l) => {
          if (l.regraObj.tipo === 'RET' && l.l !== undefined) {
            const crit = `${memFaixa('q')},${memFaixa('centro_id')},${cm('centro_id')}${n},${memFaixa('mes')},${cm('mes')}${n}`;
            if (l.baseIds) return f(l.baseIds.length ? l.baseIds.map((id) => `SUMIFS(${crit},${memFaixa('mascara_id')},${id})`).join('+') : '0', l.l);
            return f(`SUMIFS(${crit},${memFaixa('ordem')},"<"&${cm('ordem')}${n})`, l.l);
          }
          if (!ehConta(l)) return null;
          return f(`${cm('u')}${n}+${cm('v')}${n}`, l.l);
        });
      case 'mf':
      case 'nf':
        return g((n, l) => {
          if (l.regraObj.tipo === 'RET') return c.chave === 'nf' && l.nf !== undefined ? l.nf : null;
          if (!ehConta(l)) return null;
          const col = COL_FATOR[l.regraObj.fator];
          if (!col) return 1;
          const ponto = c.chave === 'mf' ? l.i : l.i + 1;
          return f(`${aba(NOMES.poc)}!${cp(col)}${linhaPoc.get(`${l.ci}|${ponto}`)}`, l[c.chave]);
        });
      case 'o':
        return g((n, l) => (ehConta(l) ? f(`${cm('k')}${n}*${cm('mf')}${n}`, l.o) : null));
      case 'p':
        return g((n, l) => (l.p === undefined ? null : f(`${cm('l')}${n}*${cm('nf')}${n}`, l.p)));
      case 'q':
        return g((n, l) => (l.q === undefined ? null : ehConta(l) ? f(`${cm('p')}${n}-${cm('o')}${n}`, l.q) : f(`${cm('p')}${n}`, l.q)));
      case 'r':
        return g((n, l) => (ehConta(l) ? f(`${cm('k')}${n}*(${cm('nf')}${n}-${cm('mf')}${n})`, l.r) : null));
      case 's':
        return g((n, l) => (ehConta(l) ? f(`(${cm('l')}${n}-${cm('k')}${n})*${cm('nf')}${n}`, l.s) : null));
      case 'dif': {
        const Q = cm('q');
        const T = cm('t');
        return g((n, l) => f(`IF(AND(ISNUMBER(${Q}${n}),ISNUMBER(${T}${n})),ROUND(${Q}${n}-${T}${n},2),IF(ISNUMBER(${Q}${n})=ISNUMBER(${T}${n}),0,"≠"))`, l.dif));
      }
      default:
        return c;
    }
  });

  const usaPoc = Boolean(m.mascaraPoc);
  const pocId = m.mascaraPoc?.id;
  const colPoc = COL_POC.map((c) => {
    const g = (fn) => ({ ...c, formula: fn });
    const A = (n) => `${cp('centro_id')}${n}`;
    const D = (n) => `${cp('data')}${n}`;
    const T = (n) => `${cp('trava')}${n}`;
    const BUt = (col, n) => `SUMIFS(${BU.faixa(col)},${BU.faixa('centro_id')},${A(n)},${BU.faixa('data')},${MIN(D(n), T(n))})`;
    switch (c.chave) {
      case 'versao':
        return g((n, l) => ({ formula: `_xlfn.MAXIFS(${BO.faixa('inicio')},${BO.faixa('centro_id')},${A(n)},${BO.faixa('inicio')},"<="&${D(n)})`, result: l.versao }));
      case 'orcamento':
        return g((n, l) => f(`IF(${cp('versao')}${n}=0,0,SUMIFS(${BO.faixa('valor')},${BO.faixa('centro_id')},${A(n)},${BO.faixa('inicio')},${cp('versao')}${n}))`, l.orcamento));
      case 'custo_real':
        return g((n, l) =>
          usaPoc ? f(`SUMIFS(${BF.faixa('valor')},${BF.faixa('mascara_id')},${pocId},${BF.faixa('centro_id')},${A(n)},${BF.faixa('data')},${MIN(D(n), T(n))})`, l.custo_real) : null
        );
      case 'custo_prem':
        return g((n, l) =>
          usaPoc ? f(`SUMIFS(${PB.faixa('valor_fin')},${PB.faixa('mascara_id')},${pocId},${PB.faixa('centro_id')},${A(n)},${PB.faixa('mes')},${ATE(D(n))})`, l.custo_prem) : null
        );
      case 'custo':
        return g((n, l) => (usaPoc ? f(`ABS(${cp('custo_real')}${n}+${cp('custo_prem')}${n})`, l.custo) : null));
      case 'poc_receita':
        return g((n, l) =>
          usaPoc ? f(`IF(${cp('orcamento')}${n}>0,ROUND(MIN(${cp('custo')}${n}/${cp('orcamento')}${n},1)*${TODO},0)/${TODO},0)`, l.poc_receita) : null
        );
      case 'vendida_real':
        return g((n, l) => f(BUt('fracao_vendida', n), l.vendida_real));
      case 'vendida_prem':
        return g((n, l) => f(`SUMIFS(${PB.faixa('fracao_vendida')},${PB.faixa('centro_id')},${A(n)},${PB.faixa('mes')},${ATE(D(n))})`, l.vendida_prem));
      case 'permuta':
        return g((n, l) => f(BUt('fracao_permuta', n), l.permuta));
      case 'poc_despesa':
        return g((n, l) => f(`ROUND((${cp('vendida_real')}${n}+${cp('vendida_prem')}${n}+${cp('permuta')}${n})*${TODO},0)/${TODO}`, l.poc_despesa));
      case 'distratada':
        return g((n, l) => f(`ROUND(MIN(${BUt('fracao_distratada', n)},1)*${TODO},0)/${TODO}`, l.distratada));
      case 'liquida':
        return g((n, l) => f(`${cp('poc_despesa')}${n}-${cp('distratada')}${n}`, l.liquida));
      case 'estoque':
        return g((n, l) => f(`MAX(0,1-${cp('liquida')}${n})`, l.estoque));
      case 'diferenca':
        return g((n, l) => {
          if (!l.temFoto) return 0;
          const partes = [
            ...(usaPoc ? [`ABS(${cp('poc_receita')}${n}-${cp('poc_receita_versao')}${n})`] : []),
            `ABS(${cp('poc_despesa')}${n}-${cp('poc_despesa_versao')}${n})`,
            `ABS(${cp('distratada')}${n}-${cp('distratada_versao')}${n})`,
          ];
          return f(`MAX(${partes.join(',')})`, l.diferenca);
        });
      default:
        return c;
    }
  });

  // Pra aba DRE / DRE Mensal: centros com projeção, trava de cada um e os valores (pros resultados).
  const centros = new Map(
    P.orcamentos.map(({ orc }) => [
      orc.centro_id,
      { centro_id: orc.centro_id, rotulo: rot(orc.centro_id), trava: orc.mensal.trava, origem: orc.origem, status: orc.status },
    ])
  );
  return {
    P,
    mensal,
    premissas,
    poc,
    memoria,
    centros,
    lyMensal,
    lyPrem,
    lyPoc: { ...lyPoc, colunas: colPoc },
    lyMem: { ...lyMem, colunas: colMemoria },
    comMemoria,
    // Conferências (o resultado das fórmulas da Memória e da POC com o gravado).
    somaDiferencas: memoria.reduce((t, x) => t + Math.abs(num(x.dif)), 0),
    maiorDiferencaPoc: poc.reduce((t, x) => Math.max(t, x.diferenca), 0),
  };
}

// Projetado de um centro (ou de todos, `centro` null) por linha de nível 2, nos meses do período, da
// foto — `filtro(mes)` escolhe os meses (comparável: só até o atual).
function somaFoto(J, centro, filtro = () => true) {
  const out = {};
  J.mensal.forEach((x) => {
    if (centro !== null && x.centro_id !== centro) return;
    if (!filtro(x)) return;
    out[x.mascara_id] = (out[x.mascara_id] || 0) + num(x.valor);
  });
  return out;
}

function escrever(workbook, abas, J, d, meta) {
  const { P } = J;
  const fonte =
    P.fonte === 'versao'
      ? `Versão ${P.versao?.numero ?? '—'} salva em ${dataHoraBr(P.versao?.criado_em)}${P.versao?.usuario ? ` por ${P.versao.usuario}` : ''}`
      : `Rascunhos (não salvos) + a última versão${P.versao ? ` (Versão ${P.versao.numero})` : ''} nos centros sem rascunho`;
  const metaProj = { ...meta, filtros: [...meta.filtros.filter(([k]) => k !== 'Projeção'), ['Projeção', fonte]] };

  tabela(workbook, abas.mensal, J.lyMensal, {
    titulo: 'Projeção mês a mês — o que a coluna Projetado soma',
    subtitulo:
      'A DRE de cada orçamento mês a mês, como foi GRAVADA ao concluir (a foto): até o mês da trava é o realizado da data do orçamento; depois, o projetado. A aba DRE soma esta aba (SOMASES por linha, centro e mês). "Entra no Desvio %?" = mês até o atual (o Desvio compara o realizado até hoje com o projetado só desses meses).',
    linhas: J.mensal,
    meta: metaProj,
    estiloLinha: (l) => (l.fonte_mes === 'Projetado' ? AMARELO_PROJ : CORES.CINZA_CLARO),
  });

  tabela(workbook, abas.premissas, J.lyPrem, {
    titulo: 'Premissas da projeção — o que entrou depois da trava',
    subtitulo:
      'Linha a linha: as vendas das unidades em estoque na trava (mês, valor e de onde veio o valor; fração ideal inteira na POC de Despesa), as naturezas de cada linha do Financeiro pela Origem Projeção do plano de contas do centro e a correção monetária digitada. Contratos, estornos, permutas, distratos e RET não são premissa: o motor calcula. Distratos futuros não são projetados.',
    linhas: J.premissas,
    meta: metaProj,
    estiloLinha: (l) => (l.tipo === 'Venda de unidade' ? CORES.TEAL_CLARO : l.tipo === 'Correção monetária' ? CORES.AZUL_MUITO_CLARO : null),
  });

  tabela(workbook, abas.poc, J.lyPoc, {
    titulo: 'POC da projeção — cada centro em cada mês projetado',
    subtitulo:
      'POC de Receita = |custo realizado até a trava (Base Financeiro) + custo projetado (Premissas)| ÷ orçamento vigente da obra (Base Orçamento), até 100%; POC de Despesa = fração vendida até a trava (Base Unidades) + fração das vendas projetadas (Premissas) + permutas; fração distratada só do realizado (distrato futuro não é projetado). Ao lado, as POCs gravadas no orçamento.',
    linhas: J.poc,
    meta: metaProj,
    estiloLinha: (l) => (l.referencia.startsWith('Trava') || l.referencia === 'Véspera' ? CORES.CINZA_CLARO : null),
  });
  const colVersao = J.lyPoc.col.versao;
  for (let r = J.lyPoc.primeira; r <= J.lyPoc.ultima; r += 1) abas.poc.getCell(`${colVersao}${r}`).numFmt = 'dd/mm/yyyy;;"sem orçamento"';

  tabela(workbook, abas.memoria, J.lyMem, {
    titulo: 'Memória da projeção — cada linha × centro × mês projetado',
    subtitulo:
      'Mesma conta da Memória de Cálculo do realizado: valor no mês = base acumulada até "Até" × fator em "Até" − base acumulada até a véspera × fator na véspera. Base = realizado até o fim do mês da trava (SOMASES nas abas Base) + premissas até o mês (Premissas Projeção); fatores da POC Projeção. "Valor gravado" = o da foto do orçamento; Diferença ≠ 0 = o realizado até a trava mudou depois que o orçamento foi concluído (lançamento com data antiga, ajuste, contrato).',
    linhas: J.memoria,
    meta: metaProj,
    estiloLinha: (l) => (l.regraObj.tipo === 'RET' ? CORES.AZUL_MUITO_CLARO : l.regraObj.tipo === 'SEM_CALCULO' ? CORES.CINZA_CLARO : null),
  });
  abas.memoria.views = [{ state: 'frozen', xSplit: 2, ySplit: 7, showGridLines: false }];

  escreverResumo(workbook, abas.resumo, J, d, metaProj, fonte);
}

// Aba "Projeção": o dossiê da projeção.
function escreverResumo(workbook, sheet, J, d, meta, fonte) {
  const { P } = J;
  const ULT = 12;
  [30, 16, 11, 11, 11, 11, 16, 18, 10, 15, 10, 15].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  cabecalho(workbook, sheet, {
    titulo: 'Projeção da DRE — de onde veio cada número projetado',
    subtitulo:
      'A projeção das colunas Projetado e Desvio % da aba DRE: qual versão, cada orçamento (ciclo, trava, quem concluiu), os totais do ciclo e as premissas. Para abrir um número: Projeção Mensal (o gravado) → Memória Projeção (a conta) → POC Projeção e Premissas Projeção (os insumos).',
    filtros: meta.filtros,
    gerado: meta.gerado,
    ultimaColuna: ULT,
  });
  let n = 6;
  const cel = (r, c, v, extra = {}) => {
    const x = sheet.getCell(r, c);
    x.value = v;
    x.font = { size: 9, color: { argb: CORES.CINZA_ESCURO }, ...extra };
    x.alignment = { vertical: 'middle', wrapText: true };
    x.border = { bottom: borda() };
    return x;
  };
  const secao = (t) => {
    faixa(sheet, n, t, 1, ULT);
    n += 1;
  };

  secao('FONTE DA PROJEÇÃO');
  const centrosDre = d.m.obras.length;
  [
    ['Projeção usada', fonte],
    ['Centros da DRE com projeção', `${P.orcamentos.length} de ${centrosDre}`],
    [
      'Regra do Desvio %',
      '(Valor − Projetado) ÷ |Projetado|, com o realizado até hoje e o projetado só dos meses até o atual (como no DFC). No consolidado, o realizado só dos centros com projeção. Dentro de ±10% é neutro na tela.',
    ],
    ['Meses até a trava', 'O "projetado" desses meses é o realizado da data em que o orçamento foi concluído (cinza na tela): o desvio deles mostra o que mudou no realizado depois.'],
    ...(P.avisos.length ? [['Fora da projeção', P.avisos.join(' · ')]] : []),
  ].forEach(([k, v]) => {
    cel(n, 1, k, { bold: true });
    sheet.mergeCells(n, 2, n, ULT);
    cel(n, 2, v);
    sheet.getRow(n).height = Math.max(18, Math.ceil(String(v).length / 150) * 13 + 5);
    n += 1;
  });
  n += 1;

  secao('ORÇAMENTOS (um por centro)');
  cabecalhoTabela(sheet, n, ['Centro de custo', 'Orçamento', 'Início do ciclo', 'Fim do ciclo', 'Trava (último mês realizado)', 'Projeção a partir de', 'Situação', 'Concluído em', 'Por', 'Vendas projetadas', 'Unidades', 'Correção projetada']);
  n += 1;
  P.orcamentos.forEach(({ orc, foto, prep }) => {
    const vendas = (prep || foto).vendas || [];
    const corr = prep ? prep.correcao.reduce((t, x) => t + num(x.valor), 0) : Object.values(foto.correcao || {}).reduce((t, v) => t + num(v), 0);
    const valores = [
      J.centros.get(orc.centro_id).rotulo,
      rotuloOrcamento(orc),
      dataExcel(`${orc.ciclo_inicio}-01`),
      dataExcel(`${orc.ciclo_fim}-01`),
      orc.trava ? dataExcel(`${orc.trava}-01`) : 'sem (antes do ciclo)',
      dataExcel(`${calcInicio(orc)}-01`),
      orc.status === 'CONCLUIDO' ? 'Concluído' : 'Em andamento (calculado agora)',
      orc.concluido_em ? dataHoraExcel(orc.concluido_em) : '—',
      orc.usuario || '—',
      vendas.reduce((t, v) => t + num(v.valor), 0),
      vendas.length,
      corr,
    ];
    valores.forEach((v, i) => {
      const c = cel(n, i + 1, v);
      if ([2, 3, 4, 5].includes(i) && v instanceof Date) c.numFmt = FMT.mes;
      if (i === 7 && v instanceof Date) c.numFmt = FMT.dataHora;
      if (i === 9 || i === 11) c.numFmt = FMT.moeda;
    });
    n += 1;
  });
  n += 1;

  // Fechamento (a lista da aba Projeções e a Conclusão): por centro, cada grupo de nível 1, do primeiro
  // lançamento do centro ao fim do ciclo.
  secao('FECHAMENTO DE CADA ORÇAMENTO — do primeiro lançamento ao fim do ciclo (como a lista da aba Projeções e a Conclusão)');
  cabecalhoTabela(sheet, n, ['Centro de custo', 'Grupo (nível 1)', '', '', '', '', 'Realizado (até a trava)', 'Projetado (até o fim do ciclo)', '', 'Total']);
  n += 1;
  P.orcamentos.forEach(({ orc, foto }) => {
    (foto.niveis1 || []).forEach((g) => {
      cel(n, 1, J.centros.get(orc.centro_id).rotulo);
      sheet.mergeCells(n, 2, n, 6);
      cel(n, 2, g.descricao, { bold: g.totalizadora });
      cel(n, 7, num(g.realizado)).numFmt = FMT.moeda;
      sheet.mergeCells(n, 8, n, 9);
      cel(n, 8, num(g.projetado)).numFmt = FMT.moeda;
      cel(n, 10, num(g.total), { bold: true }).numFmt = FMT.moeda;
      if (g.totalizadora) for (let c = 1; c <= 10; c += 1) sheet.getCell(n, c).fill = preencher(CORES.AZUL_MUITO_CLARO);
      n += 1;
    });
  });
  n += 1;

  // Premissas por centro e origem (somas da aba Premissas, em fórmulas).
  secao('PREMISSAS POR CENTRO E ORIGEM (somas da aba Premissas Projeção)');
  cabecalhoTabela(sheet, n, ['Centro de custo', 'Premissa', 'Origem Projeção', '', '', '', 'Linhas', 'Valor (todos os meses)', '', 'No período']);
  n += 1;
  const PB = J.lyPrem;
  const chaves = new Map();
  J.premissas.forEach((x) => {
    const k = `${x.centro_id}|${x.tipo}|${x.origem}`;
    const a = chaves.get(k) || { x, n: 0, v: 0, p: 0 };
    a.n += 1;
    a.v += num(x.valor);
    if (x.periodo === 'Sim') a.p += num(x.valor);
    chaves.set(k, a);
  });
  [...chaves.values()].forEach(({ x, n: qtd, v, p }) => {
    cel(n, 1, x.centro);
    cel(n, 2, x.tipo);
    sheet.mergeCells(n, 3, n, 6);
    cel(n, 3, x.origem);
    const crit = `${PB.faixa('centro_id')},${x.centro_id},${PB.faixa('tipo')},"${x.tipo}",${PB.faixa('origem')},"${x.origem}"`;
    cel(n, 7, { formula: `COUNTIFS(${crit})`, result: qtd }).numFmt = FMT.int;
    sheet.mergeCells(n, 8, n, 9);
    cel(n, 8, { formula: `SUMIFS(${PB.faixa('valor')},${crit})`, result: v }).numFmt = FMT.moeda;
    cel(n, 10, { formula: `SUMIFS(${PB.faixa('valor')},${crit},${PB.faixa('periodo')},"Sim")`, result: p }).numFmt = FMT.moeda;
    n += 1;
  });
  if (!chaves.size) {
    cel(n, 1, 'Nenhuma premissa: os orçamentos não projetam vendas, naturezas nem correção.');
    n += 1;
  }
  n += 1;

  secao('COMO A PROJEÇÃO É CALCULADA');
  [
    ['Princípio', 'Mesmo motor da DRE realizada: até o fim do mês da trava vale o realizado (contratos, distratos, permutas, correção pelo vencimento, Financeiro pela emissão); depois, as premissas. O motor acumula, aplica as POCs e reconhece mês a mês como na DRE realizada.'],
    ['Vendas', 'Cada unidade disponível NA TRAVA (sem contrato ativo nem permuta no fim do mês da trava) com mês de venda informado entra como um contrato novo naquele mês: valor informado, ou o do contrato registrado depois da trava, ou o ticket médio do tipo; fração ideal inteira (participação 100%).'],
    ['Naturezas', 'Das linhas que calculam pelo Financeiro, pela Origem Projeção da natureza no plano de contas do centro: HORIZON - INFORMADO (digitado), SIENGE - EMPRESARIAL (orçamento empresarial do Sienge, mês orçado, saída negativa), SIENGE - AGING (títulos pela emissão), NÃO POSSUI ORIGEM (nada).'],
    ['Correção monetária', 'Digitada mês a mês (não sai dos títulos).'],
    ['Calculado pelo motor', 'Receita de vendas e custo dos imóveis pela POC, estorno de receita e de custo, receita com permuta e com distrato, RET. Distratos futuros não são projetados.'],
    ['Foto e versão', 'Ao concluir, o resultado é gravado (a foto); "Salvar versão" junta os concluídos numa versão da empresa. A coluna Projetado mostra a foto — não muda quando o realizado muda. A Memória Projeção refaz a conta com o realizado de HOJE e as premissas da foto: a diferença mostra o que mudou desde então.'],
  ].forEach(([k, v]) => {
    cel(n, 1, k, { bold: true, color: { argb: CORES.AZUL_ESCURO } });
    sheet.mergeCells(n, 2, n, ULT);
    cel(n, 2, v);
    sheet.getRow(n).height = Math.max(18, Math.ceil(v.length / 150) * 13 + 5);
    n += 1;
  });

  sheet.views = [{ showGridLines: false }];
  impressao(sheet);
}

// 'AAAA-MM-DD' -> número de série do Excel.
function dataSerial(iso) {
  const [a, mm, dd] = iso.split('-').map(Number);
  return (Date.UTC(a, mm - 1, dd) - Date.UTC(1899, 11, 30)) / 86400000;
}

// Primeiro mês projetado do orçamento (o seguinte à trava; sem trava, o início do ciclo).
function calcInicio(orc) {
  if (!orc.trava) return orc.ciclo_inicio;
  const [a, m] = orc.trava.split('-').map(Number);
  const t = a * 12 + m;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

module.exports = { NOMES, AMARELO_PROJ, montar, escrever, somaFoto, rotuloOrcamento, dataBr };
