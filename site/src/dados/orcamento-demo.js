// Orçamento do Grupo Aurora (consolidado, por mês) — três meses fechados (realizado × orçado) e três abertos
// (orçado da versão escolhida). Ilustrativo; o "para qual lado erra" da tela vem do motor (calibracao).
import { addM, lbl } from '../motor/modelo.js';

const LINHAS = [
  { id: 'rec', nome: 'Receita de vendas', base: 29.0e6, dv: [-2.1, -2.9, -2.4] },
  { id: 'cd', nome: 'Custos diretos', base: -15.6e6, dv: [4.1, 5.2, 4.8] },
  { id: 'pes', nome: 'Pessoal', base: -4.7e6, dv: [4.6, 5.1, 5.3], dez: 1.9 },
  { id: 'adm', nome: 'Despesas administrativas', base: -1.6e6, dv: [1.2, -2.4, 0.6] },
  { id: 'fre', nome: 'Logística e fretes', base: -1.42e6, dv: [7.4, 8.8, 8.1] },
  { id: 'mkt', nome: 'Marketing', base: -0.4e6, dv: [-6.0, -3.5, -5.2] },
];
// Fator de cada versão sobre o orçado da v3 nos meses abertos.
const VERSOES = [
  { id: 'v1', nome: 'Original', recuo: 9, fator: { rec: 1.06, cd: 0.95, pes: 0.96, adm: 1, fre: 0.97, mkt: 0.9 } },
  { id: 'v2', nome: 'Revisão pós-dissídio', recuo: 5, fator: { rec: 1.03, cd: 0.97, pes: 1, adm: 1, fre: 0.98, mkt: 0.95 } },
  { id: 'v3', nome: 'Revisão do 2º semestre', recuo: 2, fator: {} },
];

const sazonal = (m, l) => {
  const mes = +m.slice(5, 7);
  let f = 1 + Math.sin(mes * 1.7) * 0.03;
  if (l.dez && mes === 12) f *= l.dez;
  if (l.id === 'rec' && mes === 12) f *= 1.09;
  return f;
};

export function orcamentoDemo(hoje) {
  const m0 = hoje.slice(0, 7);
  const fechados = [-3, -2, -1].map((k) => addM(m0, k));
  const abertos = [0, 1, 2].map((k) => addM(m0, k));
  const ano = (m) => m.slice(2, 4);
  const versoes = VERSOES.map((v) => {
    const m = addM(m0, -v.recuo);
    return { ...v, data: `${String(3 + v.recuo).padStart(2, '0')}/${m.slice(5, 7)}/${ano(m)}` };
  });
  const linhas = LINHAS.map((l) => ({
    ...l,
    fechados: fechados.map((m, i) => {
      const o = l.base * sazonal(m, l);
      return { mes: m, o, r: o * (1 + l.dv[i] / 100), dv: l.dv[i] };
    }),
    abertos: abertos.map((m) => ({ mes: m, o: l.base * sazonal(m, l) })),
  }));
  const L = (k) => lbl(addM(m0, k));
  // Histórico de alterações (o mais novo primeiro). `ia`: feito pelo conector da IA, a pedido de alguém.
  const historico = [
    { ini: 'RL', quem: 'Rafael Lima', texto: `fechou ${L(-1)} e travou o mês`, quando: 'hoje, 08:05' },
    { ini: 'MA', quem: 'Marcos Andrade', texto: `alterou Marketing de ${L(1)}: R$ 380 mil → R$ 420 mil`, quando: 'ontem, 17:40' },
    { ini: 'JR', quem: 'Juliana Ribeiro', texto: `criou a versão v3, "Revisão do 2º semestre"`, quando: versoes[2].data },
  ];
  const novidades = [
    { ini: 'IA', ia: true, quem: 'Claude, a pedido de Marcos Andrade', texto: `ajustou Logística e fretes de ${L(2)}: R$ 1,46 mi → R$ 1,40 mi`, quando: 'agora' },
    { ini: 'CS', quem: 'Carla Souza', texto: `comentou em Pessoal de ${L(2)}: "o 13º já está aqui"`, quando: 'agora' },
    { ini: 'JR', quem: 'Juliana Ribeiro', texto: 'importou Orçamento_rev3.xlsx pela última vez (prometeu)', quando: 'agora' },
    { ini: 'MA', quem: 'Marcos Andrade', texto: `aprovou a versão v3 para ${L(0)} a ${L(2)}`, quando: 'agora' },
  ];
  return { fechados, abertos, versoes, linhas, historico, novidades };
}
