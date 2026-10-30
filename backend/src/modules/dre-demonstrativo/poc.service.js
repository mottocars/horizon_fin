const { motor, meses, vespera } = require('./demonstrativo.service');
const { arredondarPoc } = require('../../utils/poc');

// Operações > DRE Gerencial > POC: o rastreio de como a POC de cada obra chegou no valor da DRE, centro
// a centro (sem consolidado), só os centros com "Realiza DRE" e natureza OBRA. Usa o mesmo motor da aba
// DRE (demonstrativo.service.js), então os números batem com ela. Cada coluna é uma "foto" de um
// intervalo [a, b] (o período do filtro, ou um mês dele na visão mês a mês):
//
//   unidades     — posição em b: vendidas (contratos ativos em b: assinados até b e não distratados até
//                  b; valor do contrato × participação), permutas (avaliação; sem data = desde sempre),
//                  em estoque (as demais; valor estimado = o ticket médio do tipo da unidade, o mesmo da
//                  aba Unidades; tipo sem estimativa, o do último contrato da unidade — não o contrato
//                  em si, que pode ser simbólico, como a garagem "vendida" por R$ 0,01 junto com o
//                  apartamento) e o total (VGV); mais
//                  o movimento do intervalo: vendas (contratos assinados em [a, b]) e distratos (com
//                  data de distrato em [a, b]).
//   poc_receita  — em b: orçamento vigente, custo acumulado (Máscara DRE Nível 2 da aba Configurações),
//                  saldo de obra a executar (orçamento − custo) e a POC; `poc_inicio` = a POC na véspera
//                  de a (o avanço no intervalo é a diferença).
//   poc_despesa  — frações ideais em b: vendas (todo contrato, até o distratado depois), permutas, POC de
//                  Despesa (vendas + permutas), distratada, líquida (POC − distratada) e em estoque
//                  (1 − líquida); `*_inicio` = na véspera de a.
//   linhas       — cada máscara com POC (as da DRE: receitas com POC Receita, custos/despesas com POC
//                  Despesa e o Estorno de Custo): acumulado (a base até b), poc (o percentual aplicado
//                  em b), reconhecido (acumulado × poc), anterior (o reconhecido até a véspera de a),
//                  periodo (reconhecido − anterior = o valor da DRE no intervalo) e a_reconhecer
//                  (acumulado − reconhecido: o que ainda vai entrar na DRE conforme a obra/as vendas
//                  avançam; null no Estorno de Custo, que não tem saldo a apropriar).
const num = (v) => (v === null || v === undefined ? 0 : Number(v));

// Unidade do contrato sem cadastro em sie_units: pelo nome.
const chaveUnidade = (r) => (r.unit_id !== null && r.unit_id !== undefined ? `u${r.unit_id}` : `n${r.unidade}`);

function posicaoUnidades(centro, a, b) {
  const { vendidas, distratadas, permuta, disponiveis } = centro.clusters;
  // Data do distrato de cada contrato × unidade (a chave da linha sem o prefixo v/d).
  const distratoEm = new Map(distratadas.map((d) => [d.chave.slice(1), d.data]));
  const ativa = (v) => {
    if (!v.data || v.data > b) return false;
    const dd = distratoEm.get(v.chave.slice(1));
    return !(dd && dd <= b);
  };
  const ativas = vendidas.filter(ativa);
  const permutas = permuta.filter((p) => !p.data || p.data <= b);
  const ocupadas = new Set([...ativas.map(chaveUnidade), ...permutas.map(chaveUnidade)]);

  // Valor de referência de cada unidade conhecida (pro estoque): o ticket médio do tipo (o estimado da
  // aba Unidades, que vem nas disponíveis); sem estimativa do tipo, o do último contrato da unidade; a
  // permuta, a avaliação.
  const ticket = new Map();
  disponiveis.forEach((d) => d.valor !== null && d.valor !== undefined && ticket.set(d.tipo, num(d.valor)));
  const referencia = new Map();
  [...vendidas]
    .sort((x, y) => (x.data || '').localeCompare(y.data || ''))
    .forEach((v) => referencia.set(chaveUnidade(v), ticket.has(v.tipo) ? ticket.get(v.tipo) : num(v.valor)));
  permuta.forEach((p) => referencia.set(chaveUnidade(p), num(p.valor)));
  disponiveis.forEach((d) => referencia.set(chaveUnidade(d), ticket.has(d.tipo) ? ticket.get(d.tipo) : referencia.get(chaveUnidade(d)) ?? 0));
  let estoqueValor = 0;
  referencia.forEach((v, k) => {
    if (!ocupadas.has(k)) estoqueValor += v;
  });

  const soma = (linhas) => linhas.reduce((t, l) => t + num(l.valor), 0);
  const vendidasQtd = new Set(ativas.map(chaveUnidade)).size;
  const permutaQtd = new Set(permutas.map(chaveUnidade)).size;
  const estoqueQtd = Math.max(0, centro.total_unidades - ocupadas.size);
  const vendidasValor = soma(ativas);
  const permutaValor = soma(permutas);
  const dentro = (d) => d && d >= a && d <= b;
  const vendasIntervalo = vendidas.filter((v) => dentro(v.data));
  const distratosIntervalo = distratadas.filter((d) => dentro(d.data));
  const distratosAte = distratadas.filter((d) => d.data && d.data <= b);
  return {
    vendidas: { qtd: vendidasQtd, valor: vendidasValor },
    permuta: { qtd: permutaQtd, valor: permutaValor },
    estoque: { qtd: estoqueQtd, valor: estoqueValor },
    total: { qtd: vendidasQtd + permutaQtd + estoqueQtd, valor: vendidasValor + permutaValor + estoqueValor },
    vendas_intervalo: { qtd: new Set(vendasIntervalo.map(chaveUnidade)).size, valor: soma(vendasIntervalo) },
    distratos_intervalo: { qtd: distratosIntervalo.length, valor: soma(distratosIntervalo) },
    distratos_acumulados: { qtd: distratosAte.length, valor: soma(distratosAte) },
  };
}

async function rastrear(empresaId, { de, ate, centros: filtro = [] }) {
  const m = await motor(empresaId, { ate, filtro, soObras: true });
  const { obras, mascaras, base, unidadesPorCentro, custoAte, pocEm, pocDespesa, fracaoDistratada, custosDoGrupo } = m;
  const { comPocReceita, comPocDespesa, custoCiv, calculavel, reconhecidoNoCentro } = m;
  const porId = new Map(unidadesPorCentro.map((c) => [c.id, c]));

  // As linhas da DRE que passam pela POC, na ordem da DRE.
  const linhas = mascaras.filter((x) => calculavel(x) && (comPocReceita(x) || comPocDespesa(x) || x.calculo === 'ESTORNO_CUSTO'));
  // Base acumulada e POC aplicada de uma linha em D — acumulado × poc = reconhecidoNoCentro (mesma conta).
  const decompor = (x, id, D) => {
    if (comPocReceita(x)) return { acumulado: base[x.calculo](id, D), poc: pocEm(id, D).poc };
    if (custoCiv(x)) return { acumulado: custoAte.get(x.id)(id, D), poc: pocDespesa(id, D) };
    if (comPocDespesa(x)) return { acumulado: custoAte.get(x.id)(id, D), poc: pocDespesa(id, D) - fracaoDistratada(id, D) };
    return { acumulado: -custosDoGrupo(x).reduce((t, y) => t + custoAte.get(y.id)(id, D), 0), poc: fracaoDistratada(id, D) };
  };

  const fotoPocDespesa = (id, D) => {
    const vendas = arredondarPoc(base.FRACAO_VENDAS(id, D));
    const permuta = arredondarPoc(base.FRACAO_PERMUTA(id, D));
    const poc = pocDespesa(id, D);
    const distratada = fracaoDistratada(id, D);
    const liquida = poc - distratada;
    return { vendas, permuta, poc, distratada, liquida, estoque: Math.max(0, 1 - liquida) };
  };

  const foto = (id, a, b) => {
    const antes = vespera(a);
    const receita = pocEm ? pocEm(id, b) : null;
    const despesa = fotoPocDespesa(id, b);
    const despesaInicio = fotoPocDespesa(id, antes);
    const centro = porId.get(id);
    return {
      unidades: centro ? posicaoUnidades(centro, a, b) : null,
      poc_receita: receita
        ? {
            orcamento: receita.orcamento,
            custo: receita.custo,
            saldo: receita.orcamento > 0 ? receita.orcamento - receita.custo : null,
            poc: receita.poc,
            poc_inicio: pocEm(id, antes).poc,
          }
        : null,
      poc_despesa: {
        ...despesa,
        ...Object.fromEntries(Object.entries(despesaInicio).map(([k, v]) => [`${k}_inicio`, v])),
      },
      linhas: Object.fromEntries(
        linhas.map((x) => {
          const { acumulado, poc } = decompor(x, id, b);
          const reconhecido = reconhecidoNoCentro(x, id, b);
          const anterior = reconhecidoNoCentro(x, id, antes);
          return [
            x.id,
            {
              acumulado,
              poc,
              reconhecido,
              anterior,
              periodo: reconhecido - anterior,
              a_reconhecer: x.calculo === 'ESTORNO_CUSTO' ? null : acumulado - reconhecido,
            },
          ];
        })
      ),
    };
  };

  const intervalos = meses(de, ate);
  return {
    de,
    ate,
    poc_receita_mascara: m.mascaraPoc,
    linhas: linhas.map((x) => ({
      id: x.id,
      descricao: x.descricao,
      tipo: comPocReceita(x) ? 'RECEITA' : 'DESPESA',
      estorno: x.calculo === 'ESTORNO_CUSTO',
    })),
    obras: obras.map((c) => ({
      id: c.id,
      nome: c.rotulo,
      periodo: foto(c.id, de, ate),
      meses: intervalos.map(([a, b]) => ({ mes: a.slice(0, 7), de: a, ate: b, ...foto(c.id, a, b) })),
    })),
  };
}

module.exports = { rastrear };
