const { CORES } = require('../../../utils/excelMarca');
const { fimDoMes } = require('../../dre-demonstrativo/demonstrativo.service');
const { aba, layout, tabela, rotuloCentro, rotuloMes, dataBr } = require('./comum');

// Abas "Memória de Cálculo" e "POC" da exportação de auditoria da DRE — a conta da DRE refeita em
// fórmulas a partir das bases, com o valor do sistema ao lado:
//   POC      — cada centro em cada ponto (véspera do período e fim de cada mês): orçamento vigente e
//              custo acumulado (→ POC de Receita), frações vendida, em permuta e distratada (→ POC de
//              Despesa), todos por SOMASES sobre as bases, mais a POC do sistema e a diferença;
//   Memória  — cada linha da DRE × centro × mês: base acumulada na véspera e no fim (SOMASES sobre as
//              bases), o fator (POC, fração ou 100%, puxado da aba POC), o reconhecido (base × fator)
//              e o valor do mês (reconhecido no fim − na véspera), aberto em avanço sobre a base antiga
//              + base nova; o RET = −alíquota × soma das linhas acima no mês. Mesma conta do motor
//              (demonstrativo.service.js::reconhecidoNoCentro), mesmos arredondamentos da POC.

const NOMES = { memoria: 'Memória de Cálculo', poc: 'POC' };
const TODO = 1e8; // a POC é arredondada em 8 casas na fração (utils/poc.js)

const COL_POC = [
  { chave: 'centro_id', rotulo: 'Centro (id)', largura: 8 },
  { chave: 'centro', rotulo: 'Centro de custo', largura: 26 },
  { chave: 'natureza', rotulo: 'Natureza do centro', largura: 15 },
  { chave: 'data', rotulo: 'Data', largura: 11, formato: 'data' },
  { chave: 'referencia', rotulo: 'Ponto', largura: 18 },
  { chave: 'versao', rotulo: 'Versão do orçamento (início)', largura: 13 },
  { chave: 'orcamento', rotulo: 'Orçamento vigente', largura: 16, formato: 'moeda' },
  { chave: 'custo', rotulo: 'Custo acumulado (máscara da POC)', largura: 16, formato: 'moeda' },
  { chave: 'poc_receita', rotulo: 'POC de Receita', largura: 13, formato: 'poc', destaque: true },
  { chave: 'poc_receita_sis', rotulo: 'POC de Receita (sistema)', largura: 13, formato: 'poc' },
  { chave: 'fracao_vendida', rotulo: 'Fração vendida acumulada', largura: 13, formato: 'fracao' },
  { chave: 'fracao_permuta', rotulo: 'Fração em permuta acumulada', largura: 13, formato: 'fracao' },
  { chave: 'poc_despesa', rotulo: 'POC de Despesa (vendida + permuta)', largura: 13, formato: 'poc', destaque: true },
  { chave: 'poc_despesa_sis', rotulo: 'POC de Despesa (sistema)', largura: 13, formato: 'poc' },
  { chave: 'distratada', rotulo: 'Fração distratada', largura: 13, formato: 'poc', destaque: true },
  { chave: 'distratada_sis', rotulo: 'Fração distratada (sistema)', largura: 13, formato: 'poc' },
  { chave: 'liquida', rotulo: 'POC de Despesa − distratada', largura: 13, formato: 'poc' },
  { chave: 'estoque', rotulo: 'Fração em estoque', largura: 12, formato: 'poc' },
  { chave: 'diferenca', rotulo: 'Maior diferença com o sistema', largura: 12, formato: 'fracao' },
];

const COL_MEMORIA = [
  { chave: 'centro_id', rotulo: 'Centro (id)', largura: 8 },
  { chave: 'centro', rotulo: 'Centro de custo', largura: 24 },
  { chave: 'mes', rotulo: 'Mês', largura: 9, formato: 'mes' },
  { chave: 'de', rotulo: 'De', largura: 10, formato: 'data' },
  { chave: 'ate', rotulo: 'Até', largura: 10, formato: 'data' },
  { chave: 'ordem', rotulo: 'Ordem na DRE', largura: 7 },
  { chave: 'grupo', rotulo: 'Grupo DRE (nível 1)', largura: 24 },
  { chave: 'linha', rotulo: 'Linha DRE (nível 2)', largura: 30 },
  { chave: 'mascara_id', rotulo: 'Id linha', largura: 7 },
  { chave: 'regra', rotulo: 'Regra de cálculo', largura: 46 },
  { chave: 'k', rotulo: 'Base acumulada até a véspera de "De"', largura: 16, formato: 'moeda' },
  { chave: 'l', rotulo: 'Base acumulada até "Até" (RET: base do mês)', largura: 16, formato: 'moeda' },
  { chave: 'mf', rotulo: 'Fator na véspera', largura: 12, formato: 'poc' },
  { chave: 'nf', rotulo: 'Fator em "Até" (RET: −alíquota)', largura: 12, formato: 'poc' },
  { chave: 'o', rotulo: 'Reconhecido até a véspera', largura: 16, formato: 'moeda' },
  { chave: 'p', rotulo: 'Reconhecido até "Até"', largura: 16, formato: 'moeda' },
  { chave: 'q', rotulo: 'Valor no mês (DRE)', largura: 16, formato: 'moeda', total: true, destaque: true },
  { chave: 'r', rotulo: 'Avanço sobre a base antiga', largura: 15, formato: 'moeda', total: true },
  { chave: 's', rotulo: 'Base nova × fator', largura: 15, formato: 'moeda', total: true },
  { chave: 't', rotulo: 'Valor no sistema', largura: 16, formato: 'moeda', total: true },
  { chave: 'u', rotulo: 'Diferença (Excel − sistema)', largura: 12, formato: 'diferenca' },
];

const COL_FATOR = { POC_RECEITA: 'poc_receita', POC_DESPESA: 'poc_despesa', POC_DESPESA_LIQ: 'liquida', DISTRATADA: 'distratada' };

// Linhas das duas abas, com o resultado de cada fórmula calculado pelo motor (o Excel recalcula ao
// abrir; o resultado gravado é o que aparece em quem não recalcula, como a prévia do celular).
function montar(d, LY) {
  const { m, regras, intervalos, pontos, resultado } = d;
  const grupos = new Map(d.arvore.map((g) => [g.id, g.descricao]));
  const usaPoc = Boolean(m.pocEm);
  const nPontos = pontos.length;
  const nMeses = intervalos.length;
  const nMasc = m.mascaras.length;
  const rotulo = (c) => rotuloCentro({ id: c.id, rotulo: c.rotulo });
  const naturezaDe = (id) => d.centros.get(id)?.natureza || null;

  // Versão do orçamento vigente em D, por centro.
  const versoes = new Map();
  d.orcamento.forEach((o) => {
    if (!versoes.has(o.centro_id)) versoes.set(o.centro_id, new Map());
    const v = versoes.get(o.centro_id);
    v.set(o.inicio, (v.get(o.inicio) || 0) + o.valor);
  });
  const versaoEm = (id, D) => [...(versoes.get(id)?.keys() || [])].filter((i) => i <= D).sort().pop() || null;

  const poc = [];
  m.obras.forEach((c) => {
    pontos.forEach((D, p) => {
      const r = usaPoc ? m.pocEm(c.id, D) : null;
      const v = versaoEm(c.id, D);
      const pd = m.pocDespesa(c.id, D);
      const fd = m.fracaoDistratada(c.id, D);
      poc.push({
        centro_id: c.id,
        centro: rotulo(c),
        natureza: naturezaDe(c.id),
        data: D,
        // O último ponto é o fim do período, que pode cair no meio do mês.
        referencia: p === 0 ? 'Véspera do período' : D === d.ate && D !== fimDoMes(D) ? 'Fim do período' : `Fim de ${rotuloMes(D)}`,
        versao: v,
        orcamento: v ? versoes.get(c.id).get(v) : 0,
        custo: r ? r.custo : null,
        poc_receita: r ? r.poc : null,
        poc_receita_sis: r ? r.poc : null,
        fracao_vendida: m.base.FRACAO_VENDAS(c.id, D),
        fracao_permuta: m.base.FRACAO_PERMUTA(c.id, D),
        poc_despesa: pd,
        poc_despesa_sis: pd,
        distratada: fd,
        distratada_sis: fd,
        liquida: pd - fd,
        estoque: Math.max(0, 1 - (pd - fd)),
        diferenca: 0,
      });
    });
  });
  const lyPoc = layout(NOMES.poc, COL_POC, poc.length);
  const linhaPoc = (ci, p) => lyPoc.primeira + ci * nPontos + p;

  // Memória: centro → mês → linha da DRE (na ordem do motor).
  const lyMem = layout(NOMES.memoria, COL_MEMORIA, m.obras.length * nMeses * nMasc);
  const primeiraMem = lyMem.primeira;
  const memoria = [];
  const porCentro = new Map(resultado.por_centro.map((c) => [c.id, c]));
  const acumulado = (regra, x, id, D) => {
    const b = regra.base;
    if (b.fonte === 'FIN') return b.sinal * b.mascaras.reduce((t, mid) => t + m.custoAte.get(mid)(id, D), 0);
    return m.base[x.calculo](id, D);
  };
  const fator = (regra, id, D) => {
    if (regra.fator === 'POC_RECEITA') return m.pocEm(id, D).poc;
    if (regra.fator === 'POC_DESPESA') return m.pocDespesa(id, D);
    if (regra.fator === 'POC_DESPESA_LIQ') return m.pocDespesa(id, D) - m.fracaoDistratada(id, D);
    if (regra.fator === 'DISTRATADA') return m.fracaoDistratada(id, D);
    return 1;
  };
  m.obras.forEach((c, ci) => {
    intervalos.forEach(([a, b], i) => {
      let acima = 0; // soma das linhas acima no mês (base do RET)
      const sistemaMes = porCentro.get(c.id)?.meses[i]?.valores || {};
      m.mascaras.forEach((x, k) => {
        const regra = regras.get(x.id);
        const base = {
          centro_id: c.id,
          centro: rotulo(c),
          mes: `${a.slice(0, 7)}-01`,
          de: a,
          ate: b,
          ordem: k + 1,
          grupo: grupos.get(x.parent_id) || null,
          linha: x.descricao,
          mascara_id: x.id,
          t: sistemaMes[x.id] ?? null,
          ci,
          i,
          regraObj: regra,
          x,
        };
        if (regra.tipo === 'SEM_CALCULO' || (regra.tipo === 'RET' && sistemaMes[x.id] == null)) {
          memoria.push({ ...base, regra: regra.tipo === 'RET' ? 'Sem cálculo: alguma linha acima não tem cálculo' : regra.texto, u: 0 });
          return;
        }
        if (regra.tipo === 'RET') {
          const h = d.aliquotaEm(x.id, `${a.slice(0, 7)}-01`);
          const aliq = h ? h.aliquota : 0;
          const q = (-acima * aliq) / 100;
          memoria.push({
            ...base,
            regra: `RET: −${String(aliq).replace('.', ',')}% × soma das linhas acima no mês${h ? ` (alíquota desde ${rotuloMes(h.inicio)})` : ' (sem alíquota vigente)'}`,
            l: acima,
            nf: -aliq / 100,
            p: q,
            q,
            u: Math.round((q - (base.t ?? 0)) * 100) / 100,
          });
          acima += q;
          return;
        }
        const antes = i === 0 ? pontos[0] : intervalos[i - 1][1];
        const K = acumulado(regra, x, c.id, antes);
        const L = acumulado(regra, x, c.id, b);
        const M = fator(regra, c.id, antes);
        const N = fator(regra, c.id, b);
        const q = L * N - K * M;
        memoria.push({
          ...base,
          regra: regra.texto,
          k: K,
          l: L,
          mf: M,
          nf: N,
          o: K * M,
          p: L * N,
          q,
          r: K * (N - M),
          s: (L - K) * N,
          u: Math.round((q - (base.t ?? 0)) * 100) / 100,
        });
        acima += q;
      });
    });
  });

  // Fórmulas — dependem dos layouts das bases (LY) e das duas abas.
  const BF = LY.financeiro;
  const BU = LY.unidades;
  const BC = LY.correcoes;
  const BO = LY.orcamento;
  const pocId = m.mascaraPoc?.id;
  const P = (col) => lyPoc.col[col];
  const ate = (dataExpr) => `"<="&${dataExpr}`;
  const somaBase = (regra, x, dataExpr) => {
    const b = regra.base;
    if (b.fonte === 'FIN') {
      if (!b.mascaras.length) return '0';
      const termos = b.mascaras.map(
        (mid) => `SUMIFS(${BF.faixa('valor')},${BF.faixa('mascara_id')},${mid},${BF.faixa('centro_id')},$A{n},${BF.faixa('data')},${ate(dataExpr)})`
      );
      return b.sinal < 0 ? `-(${termos.join('+')})` : termos.join('+');
    }
    if (b.fonte === 'CORR') return `SUMIFS(${BC.faixa('total')},${BC.faixa('centro_id')},$A{n},${BC.faixa('vencimento')},${ate(dataExpr)})`;
    return `SUMIFS(${BU.faixa(b.coluna)},${BU.faixa('centro_id')},$A{n},${BU.faixa('data')},${ate(dataExpr)})`;
  };
  const f = (formula, result) => ({ formula, result: result ?? 0 });
  const ehConta = (l) => l.k !== undefined; // linha com base × fator (não RET nem sem cálculo)
  const memFaixa = (chave) => `$${lyMem.col[chave]}$${primeiraMem}:$${lyMem.col[chave]}$${lyMem.ultima}`;

  const colMemoria = COL_MEMORIA.map((c) => {
    const g = (fn) => ({ ...c, formula: fn });
    switch (c.chave) {
      case 'k':
        return g((n, l) => {
          if (!ehConta(l)) return null;
          if (l.i > 0) return f(`L${n - nMasc}`, l.k);
          return f(somaBase(l.regraObj, l.x, `($D${n}-1)`).replace(/\{n\}/g, n), l.k);
        });
      case 'l':
        return g((n, l) => {
          if (l.regraObj.tipo === 'RET' && l.l !== undefined)
            return f(`SUMIFS(${memFaixa('q')},${memFaixa('centro_id')},A${n},${memFaixa('mes')},C${n},${memFaixa('ordem')},"<"&F${n})`, l.l);
          if (!ehConta(l)) return null;
          return f(somaBase(l.regraObj, l.x, `$E${n}`).replace(/\{n\}/g, n), l.l);
        });
      case 'mf':
      case 'nf':
        return g((n, l) => {
          if (l.regraObj.tipo === 'RET') return c.chave === 'nf' && l.nf !== undefined ? l.nf : null;
          if (!ehConta(l)) return null;
          const col = COL_FATOR[l.regraObj.fator];
          if (!col) return 1;
          const ponto = c.chave === 'mf' ? l.i : l.i + 1;
          return f(`${aba(NOMES.poc)}!${P(col)}${linhaPoc(l.ci, ponto)}`, l[c.chave]);
        });
      case 'o':
        return g((n, l) => (ehConta(l) ? f(`K${n}*M${n}`, l.o) : null));
      case 'p':
        return g((n, l) => (l.p === undefined ? null : f(`L${n}*N${n}`, l.p)));
      case 'q':
        return g((n, l) => (l.q === undefined ? null : ehConta(l) ? f(`P${n}-O${n}`, l.q) : f(`P${n}`, l.q)));
      case 'r':
        return g((n, l) => (ehConta(l) ? f(`K${n}*(N${n}-M${n})`, l.r) : null));
      case 's':
        return g((n, l) => (ehConta(l) ? f(`(L${n}-K${n})*N${n}`, l.s) : null));
      case 'u':
        return g((n, l) => f(`IF(AND(ISNUMBER(Q${n}),ISNUMBER(T${n})),ROUND(Q${n}-T${n},2),IF(ISNUMBER(Q${n})=ISNUMBER(T${n}),0,"≠"))`, l.u));
      default:
        return c;
    }
  });

  const colPoc = COL_POC.map((c) => {
    const g = (fn) => ({ ...c, formula: fn });
    const BUs = (col, n) => `SUMIFS(${BU.faixa(col)},${BU.faixa('centro_id')},A${n},${BU.faixa('data')},"<="&D${n})`;
    switch (c.chave) {
      case 'versao':
        return g((n, l) => ({
          formula: `_xlfn.MAXIFS(${BO.faixa('inicio')},${BO.faixa('centro_id')},A${n},${BO.faixa('inicio')},"<="&D${n})`,
          result: l.versao ? dataSerial(l.versao) : 0,
        }));
      case 'orcamento':
        return g((n, l) => f(`IF(F${n}=0,0,SUMIFS(${BO.faixa('valor')},${BO.faixa('centro_id')},A${n},${BO.faixa('inicio')},F${n}))`, l.orcamento));
      case 'custo':
        return g((n, l) =>
          usaPoc ? f(`ABS(SUMIFS(${BF.faixa('valor')},${BF.faixa('mascara_id')},${pocId},${BF.faixa('centro_id')},A${n},${BF.faixa('data')},"<="&D${n}))`, l.custo) : null
        );
      case 'poc_receita':
        return g((n, l) => (usaPoc ? f(`IF(G${n}>0,ROUND(MIN(H${n}/G${n},1)*${TODO},0)/${TODO},0)`, l.poc_receita) : null));
      case 'fracao_vendida':
        return g((n, l) => f(BUs('fracao_vendida', n), l.fracao_vendida));
      case 'fracao_permuta':
        return g((n, l) => f(BUs('fracao_permuta', n), l.fracao_permuta));
      case 'poc_despesa':
        return g((n, l) => f(`ROUND((K${n}+L${n})*${TODO},0)/${TODO}`, l.poc_despesa));
      case 'distratada':
        return g((n, l) => f(`ROUND(MIN(${BUs('fracao_distratada', n)},1)*${TODO},0)/${TODO}`, l.distratada));
      case 'liquida':
        return g((n, l) => f(`M${n}-O${n}`, l.liquida));
      case 'estoque':
        return g((n, l) => f(`MAX(0,1-Q${n})`, l.estoque));
      case 'diferenca':
        return g((n, l) =>
          f(usaPoc ? `MAX(ABS(I${n}-J${n}),ABS(M${n}-N${n}),ABS(O${n}-P${n}))` : `MAX(ABS(M${n}-N${n}),ABS(O${n}-P${n}))`, l.diferenca)
        );
      default:
        return c;
    }
  });

  return { poc, memoria, lyPoc: { ...lyPoc, colunas: colPoc }, lyMem: { ...lyMem, colunas: colMemoria }, linhaPoc, usaPoc };
}

// 'AAAA-MM-DD' -> número de série do Excel (o resultado gravado do MÁXIMOSES).
function dataSerial(iso) {
  const [a, mm, dd] = iso.split('-').map(Number);
  return (Date.UTC(a, mm - 1, dd) - Date.UTC(1899, 11, 30)) / 86400000;
}

function escrever(workbook, abas, C, d, meta) {
  const periodo = `${dataBr(d.de)} a ${dataBr(d.ate)}`;
  const pocNome = d.m.mascaraPoc?.descricao || '—';
  tabela(workbook, abas.poc, C.lyPoc, {
    titulo: 'POC por obra — como cada percentual foi calculado',
    subtitulo: C.usaPoc
      ? `Em cada ponto (véspera do período e fim de cada mês): POC de Receita = custo acumulado na máscara "${pocNome}" ÷ orçamento vigente, até 100%; POC de Despesa = fração ideal vendida (todo contrato, até o cancelado depois) + em permuta, sem trava; fração distratada até 100%. Arredondadas em 6 casas no percentual, como no sistema. Tudo em fórmulas sobre as bases.`
      : 'POC de Receita não configurada (aba Configurações): as linhas de receita com POC ficam sem cálculo. POC de Despesa = fração vendida + em permuta; fração distratada até 100%.',
    linhas: C.poc,
    meta,
    estiloLinha: (l) => (l.referencia === 'Véspera do período' ? CORES.CINZA_CLARO : null),
  });
  // Versão do orçamento: data, ou "sem orçamento" quando o MÁXIMOSES dá zero.
  const colVersao = C.lyPoc.col.versao;
  for (let r = C.lyPoc.primeira; r <= C.lyPoc.ultima; r += 1) abas.poc.getCell(`${colVersao}${r}`).numFmt = 'dd/mm/yyyy;;"sem orçamento"';

  tabela(workbook, abas.memoria, C.lyMem, {
    titulo: 'Memória de Cálculo — cada linha da DRE × centro × mês',
    subtitulo: `${periodo}. Valor no mês = base acumulada até "Até" × fator em "Até" − base acumulada até a véspera × fator na véspera (o que já tinha sido reconhecido). Bases por SOMASES nas abas Base; fatores da aba POC. Avanço + base nova = valor no mês. Filtre por linha (H) e centro (B): o TOTAL DO FILTRO dá o número da DRE.`,
    linhas: C.memoria,
    meta,
    estiloLinha: (l) => (l.regraObj.tipo === 'RET' ? CORES.AZUL_MUITO_CLARO : l.regraObj.tipo === 'SEM_CALCULO' ? CORES.CINZA_CLARO : null),
  });
  abas.memoria.views = [{ state: 'frozen', xSplit: 2, ySplit: 7, showGridLines: false }];
}

module.exports = { NOMES, montar, escrever };
