// Simulação didática da Distribuição automática — usada só pela página
// "Como funciona a distribuição" (DistribuicaoExplicacaoPage.jsx) pra montar
// os exemplos com números calculados de verdade, não escritos à mão.
//
// É a MESMA regra de backend regua-cobranca/distribuicao.service.js::
// distribuirDia (continuidade → faixa mais grave primeiro → 1º quantos, 2º
// quais pela menor média do mês). Mudou a regra lá, muda aqui também.

export const FAIXAS = ['inad', 'd15', 'd3']; // mais grave primeiro
export const NOME_FAIXA = { inad: 'Inadimplência', d15: 'Atraso (D+15)', d3: 'Recém-vencido (D+3)' };

export function distribuir({ participantes, clientes, fixacao, placar, pausados = [] }) {
  const hoje = Object.fromEntries(participantes.map((p) => [p, { qtd: 0, valor: 0, faixa: {} }]));
  const resultado = [];
  const livres = [];
  const soma = (p, c) => {
    hoje[p].qtd++;
    hoje[p].valor += c.valor;
    hoje[p].faixa[c.faixa] = (hoje[p].faixa[c.faixa] || 0) + 1;
  };
  for (const c of clientes) {
    const dono = fixacao[c.nome];
    if (dono && hoje[dono]) {
      soma(dono, c);
      resultado.push({ ...c, atendente: dono, motivo: 'continuidade' });
    } else {
      livres.push({ ...c, motivoLivre: dono && pausados.includes(dono) ? 'cobertura' : dono ? 'liberado' : 'novo', dono });
    }
  }
  const media = (p) => {
    const pl = placar[p] || { valorMes: 0, dias: 0 };
    return (pl.valorMes + hoje[p].valor) / (pl.dias + 1);
  };
  for (const f of FAIXAS) {
    const grupo = livres.filter((c) => c.faixa === f).sort((a, b) => b.valor - a.valor);
    // 1º quantos
    const cota = Object.fromEntries(participantes.map((p) => [p, 0]));
    const qtdFaixa = (p) => (hoje[p].faixa[f] || 0) + cota[p];
    const qtdTotal = (p) => hoje[p].qtd + cota[p];
    for (let i = 0; i < grupo.length; i++) {
      const p = [...participantes].sort(
        (a, b) => qtdFaixa(a) - qtdFaixa(b) || qtdTotal(a) - qtdTotal(b) || media(a) - media(b) || a.localeCompare(b)
      )[0];
      cota[p]++;
    }
    // 2º quais
    for (const c of grupo) {
      const p = participantes.filter((x) => cota[x] > 0).sort((a, b) => media(a) - media(b) || a.localeCompare(b))[0];
      cota[p]--;
      soma(p, c);
      resultado.push({ ...c, atendente: p, motivo: c.motivoLivre });
    }
  }
  resultado.sort((a, b) => FAIXAS.indexOf(a.faixa) - FAIXAS.indexOf(b.faixa) || b.valor - a.valor);
  return { resultado, hoje };
}

export function fecharDia(placar, fixacao, { resultado, hoje }) {
  const p2 = JSON.parse(JSON.stringify(placar));
  for (const [p, h] of Object.entries(hoje)) {
    p2[p] ??= { valorMes: 0, dias: 0 };
    p2[p].valorMes += h.valor;
    p2[p].dias++;
  }
  const f2 = { ...fixacao };
  for (const r of resultado) if (r.motivo !== 'cobertura') f2[r.nome] = r.atendente;
  return { placar: p2, fixacao: f2 };
}

const C = (nome, faixa, valor) => ({ nome, faixa, valor });

// Clientes fictícios de 3 dias de Rotina. Os "dias" são ilustrativos: um
// cliente que volta está em outra etapa da régua.
export const DIA1 = [
  C('Marcos Lima', 'inad', 18400), C('Patrícia Souza', 'inad', 9200), C('João Alves', 'inad', 6100), C('Renata Dias', 'inad', 3500),
  C('Fernanda Rocha', 'd15', 7600), C('Ricardo Nunes', 'd15', 5300), C('Luciana Prado', 'd15', 4200), C('Gustavo Reis', 'd15', 2900),
  C('Beatriz Lopes', 'd15', 1700), C('Tiago Martins', 'd3', 3800), C('Sandra Melo', 'd3', 2450), C('Felipe Costa', 'd3', 1300),
];
export const DIA2 = [
  C('Tiago Martins', 'd15', 3800), C('Sandra Melo', 'd15', 2450), C('Patrícia Souza', 'inad', 9200),
  C('Otávio Brandão', 'inad', 12500), C('Cláudia Freitas', 'inad', 4800),
  C('Henrique Matos', 'd15', 6200), C('Vanessa Cruz', 'd15', 3100),
  C('Rafael Teixeira', 'd3', 5400), C('Débora Pires', 'd3', 2700), C('Leandro Araújo', 'd3', 1900), C('Mônica Vieira', 'd3', 950),
];
export const DIA3 = [
  C('Marcos Lima', 'inad', 18400), C('Ricardo Nunes', 'd15', 5300), C('Otávio Brandão', 'inad', 12500), C('Rafael Teixeira', 'd15', 5400),
  C('Débora Pires', 'd15', 2700), C('Luciana Prado', 'd15', 4200), C('Fernanda Rocha', 'inad', 7600), C('Vanessa Cruz', 'd15', 3100),
  C('Silvio Ramos', 'inad', 8700), C('Elaine Castro', 'inad', 3900), C('Paulo Mendes', 'd15', 4600), C('Juliana Torres', 'd15', 2200),
  C('André Barros', 'd3', 3300), C('Camila Nogueira', 'd3', 2100), C('Roberto Lins', 'd3', 1500), C('Isabela Moura', 'd3', 800),
];

export const EQUIPE = ['Ana', 'Bruno', 'Carla'];

// Monta os 3 dias de uma vez: dia 1, dia 2 e o estado (carteira + placar)
// com que todos os cenários do dia 3 começam.
export function montarExemplo() {
  let placar = {};
  let fixacao = {};
  const dia1 = distribuir({ participantes: EQUIPE, clientes: DIA1, fixacao, placar });
  const rodizio = Object.fromEntries(EQUIPE.map((p) => [p, 0]));
  [...DIA1].sort((a, b) => b.valor - a.valor).forEach((c, i) => (rodizio[EQUIPE[i % EQUIPE.length]] += c.valor));
  ({ placar, fixacao } = fecharDia(placar, fixacao, dia1));
  const placarDia1 = placar;
  const dia2 = distribuir({ participantes: EQUIPE, clientes: DIA2, fixacao, placar });
  const mediasDia2 = Object.fromEntries(EQUIPE.map((p) => [p, (placar[p].valorMes + dia2.hoje[p].valor) / (placar[p].dias + 1)]));
  ({ placar, fixacao } = fecharDia(placar, fixacao, dia2));

  const cenarios = {
    normal: distribuir({ participantes: EQUIPE, clientes: DIA3, fixacao, placar }),
    entra: distribuir({ participantes: [...EQUIPE, 'Diego'], clientes: DIA3, fixacao, placar }),
    sai: distribuir({ participantes: ['Ana', 'Carla'], clientes: DIA3, fixacao, placar }),
    substitui: (() => {
      const fix = Object.fromEntries(Object.entries(fixacao).map(([c, p]) => [c, p === 'Carla' ? 'Elisa' : p]));
      const pl = { ...placar, Elisa: placar.Carla };
      delete pl.Carla;
      return distribuir({ participantes: ['Ana', 'Bruno', 'Elisa'], clientes: DIA3, fixacao: fix, placar: pl });
    })(),
    ferias: distribuir({ participantes: ['Bruno', 'Carla'], clientes: DIA3, fixacao, placar, pausados: ['Ana'] }),
  };
  return { dia1, rodizio, placarDia1, dia2, mediasDia2, cenarios };
}
