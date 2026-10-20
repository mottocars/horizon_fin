// DRE gerencial do Grupo Aurora no último mês fechado — ilustrativa (a DRE do site não passa pelo motor do
// fluxo de caixa). Valores em R$; despesas negativas; subtotais calculados aqui.
import { addM } from '../motor/modelo.js';

const LINHAS = [
  { id: 'rb', nome: 'Receita bruta', tipo: 'mais', r: 29.64e6, o: 30.4e6 },
  { id: 'imp', nome: 'Impostos sobre a receita', tipo: 'menos', r: -3.02e6, o: -3.1e6 },
  { id: 'rl', nome: 'Receita líquida', tipo: 'sub' },
  { id: 'cpv', nome: 'Custo dos produtos e serviços', tipo: 'menos', r: -16.77e6, o: -16.05e6 },
  { id: 'lb', nome: 'Lucro bruto', tipo: 'sub' },
  { id: 'dop', nome: 'Despesas operacionais', tipo: 'menos', r: -6.43e6, o: -6.2e6 },
  { id: 'ebitda', nome: 'EBITDA', tipo: 'sub' },
  { id: 'dep', nome: 'Depreciação e amortização', tipo: 'menos', r: -0.62e6, o: -0.62e6 },
  { id: 'fin', nome: 'Resultado financeiro', tipo: 'menos', r: -0.51e6, o: -0.48e6 },
  { id: 'lair', nome: 'Lucro antes do IR', tipo: 'sub' },
  { id: 'ir', nome: 'IR e CSLL', tipo: 'menos', r: -0.61e6, o: -1.05e6 },
  { id: 'll', nome: 'Lucro líquido', tipo: 'fim' },
];

// Lançamentos por trás de cada linha (realizado do mês). Dia do mês + histórico + valor.
const LANCAMENTOS = {
  rb: [
    [30, 'Vendas indústria (Fábrica Contagem)', 12.94e6],
    [30, 'Vendas varejo e e-commerce', 6.18e6],
    [30, 'Fretes e armazenagem para terceiros', 6.52e6],
    [28, 'Vendas de unidades (Incorporadora)', 4.0e6],
  ],
  imp: [
    [20, 'ICMS sobre vendas', -1.61e6],
    [25, 'PIS e Cofins', -1.08e6],
    [15, 'ISS sobre serviços', -0.33e6],
  ],
  cpv: [
    [30, 'Matéria-prima e embalagens', -8.12e6],
    [30, 'Mão de obra direta', -4.36e6],
    [30, 'Combustível e manutenção da frota', -2.21e6],
    [30, 'Custo das unidades vendidas', -2.08e6],
  ],
  dop: [
    [30, 'Folha administrativa e encargos', -2.41e6],
    [30, 'Comissões sobre vendas', -1.02e6],
    [10, 'Aluguéis (CD Betim e lojas)', -0.86e6],
    [18, 'Marketing digital', -0.58e6],
    [12, 'Tecnologia e licenças', -0.31e6],
    [30, 'Demais despesas administrativas', -1.25e6],
  ],
  dep: [[30, 'Depreciação de máquinas e frota', -0.62e6]],
  fin: [
    [15, 'Juros de capital de giro', -0.42e6],
    [5, 'Tarifas bancárias', -0.06e6],
    [30, 'Rendimento de aplicações', 0.29e6],
    [22, 'Juros do financiamento da frota', -0.32e6],
  ],
  ir: [[30, 'IRPJ e CSLL estimados', -0.61e6]],
};

export function dreDemo(hoje) {
  const mes = addM(hoje.slice(0, 7), -1);
  let r = 0;
  let o = 0;
  const linhas = LINHAS.map((l) => {
    if (l.tipo === 'mais' || l.tipo === 'menos') {
      r += l.r;
      o += l.o;
      return { ...l, lanc: LANCAMENTOS[l.id] || [] };
    }
    return { ...l, r, o, lanc: [] };
  });
  return { mes, linhas, receita: { r: LINHAS[0].r, o: LINHAS[0].o } };
}
