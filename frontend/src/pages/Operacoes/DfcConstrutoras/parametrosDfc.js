// Parâmetros fixos da DFC (aba Parâmetros), na ordem definida pelo usuário, agrupados em
// sessões no mesmo estilo do Motor de Risco. Os ids são as colunas de dfc_parametros_versoes e
// as regras (obrigatório, limites) espelham o versaoBodySchema de
// backend/src/modules/dfc-parametros/dfcParametros.controller.js — os dois têm que ficar em
// sincronia.
//
// tipo: 'moeda' (R$, 2 casas) | 'percentual' (casas definidas no campo) | 'inteiro' | 'data' |
// 'simnao' (true / false) |
// 'calculado' (não é digitado nem gravado — ver `calcular`).
export const SESSOES_PARAMETROS = [
  {
    selo: 'Sessão 1',
    titulo: 'Obra e financiamento',
    texto: 'O tamanho do empreendimento: quanto custa a obra, quanto vem de financiamento e quantas unidades existem.',
    campos: [
      {
        id: 'cto',
        label: 'CTO - Custo Total da Obra',
        tipo: 'moeda',
        desc: 'Custo total previsto para executar a obra do empreendimento.',
      },
      {
        id: 'valor_financiamento_pj',
        label: 'Valor do Financiamento PJ',
        tipo: 'moeda',
        desc: 'Valor do financiamento à produção contratado pela construtora (pessoa jurídica) para a obra.',
      },
      {
        id: 'numero_unidades',
        label: 'Número Total de Unidades',
        tipo: 'inteiro',
        unidade: 'unidades',
        max: 100000,
        desc: 'Quantidade total de unidades do empreendimento.',
      },
      {
        id: 'ticket_medio_avaliacao_pf',
        label: 'Ticket Médio da Avaliação PF',
        tipo: 'moeda',
        desc: 'Valor médio de avaliação de uma unidade no financiamento da pessoa física (cliente).',
      },
    ],
  },
  {
    selo: 'Sessão 2',
    titulo: 'Garantia e repasse',
    texto: 'Como cada repasse do financiamento PF se divide entre amortizar o financiamento PJ e o caixa da construtora.',
    campos: [
      {
        id: 'pct_coeficiente_garantia',
        label: '% Coeficiente da Garantia',
        tipo: 'percentual',
        casas: 2,
        max: 999.99,
        desc: 'Coeficiente de garantia do financiamento, em percentual.',
      },
      {
        id: 'pct_amortizacao_pj',
        label: '% Amortização PJ',
        tipo: 'percentual',
        casas: 2,
        max: 100,
        desc: 'Parte de cada repasse do financiamento PF que vai para amortizar o financiamento PJ.',
      },
      {
        id: 'pct_repasse_construtor',
        label: '% Repasse Construtor',
        tipo: 'calculado',
        unidade: '%',
        casas: 2,
        desc: 'Parte de cada repasse que fica com a construtora. Calculado automaticamente: 100% − % Amortização PJ.',
        calcular: (v) => (v.pct_amortizacao_pj === '' ? '' : Math.round((100 - Number(v.pct_amortizacao_pj)) * 100) / 100),
      },
    ],
  },
  {
    selo: 'Sessão 3',
    titulo: 'Prazos e ritmo',
    texto: 'O calendário do ciclo e o ritmo de vendas e de registro dos contratos.',
    campos: [
      {
        id: 'data_demanda_minima',
        label: 'Data da Demanda Mínima',
        tipo: 'data',
        desc: 'Data em que o empreendimento precisa atingir a demanda mínima de vendas.',
      },
      {
        id: 'taxa_juros_mes',
        label: 'Taxa de Juros ao Mês',
        tipo: 'percentual',
        casas: 4,
        max: 100,
        unidade: '% a.m.',
        desc: 'Taxa de juros mensal considerada na projeção.',
      },
      {
        id: 'data_inicio_ciclo',
        label: 'Data Início do Ciclo',
        tipo: 'data',
        desc: 'Primeiro dia do ciclo do empreendimento considerado na DFC.',
      },
      {
        id: 'data_fim_ciclo',
        label: 'Data Fim do Ciclo',
        tipo: 'data',
        desc: 'Último dia do ciclo. Precisa ser depois da Data Início do Ciclo.',
      },
      {
        id: 'projeta_vendas_futuras',
        label: 'Projeta Vendas Futuras',
        tipo: 'simnao',
        desc: 'Indica se a DFC deste empreendimento projeta vendas futuras.',
      },
      {
        id: 'qtd_vendas_mes',
        // Só aparece (e só é obrigatório) com "Projeta Vendas Futuras" diferente de Não.
        visivel: (v) => v.projeta_vendas_futuras !== false,
        label: 'Quantidade de Vendas no Mês',
        tipo: 'inteiro',
        unidade: 'vendas/mês',
        max: 100000,
        desc: 'Ritmo de vendas esperado: quantas unidades vendidas por mês.',
      },
      {
        id: 'tempo_assinatura_registro_meses',
        label: 'Tempo Entre Assinatura e Registro',
        tipo: 'inteiro',
        unidade: 'meses',
        max: 600,
        desc: 'Quantos meses, em média, entre a assinatura do contrato do cliente e o registro.',
      },
    ],
  },
];

// Só os que são digitados e gravados (o calculado fica de fora).
export const CAMPOS_EDITAVEIS = SESSOES_PARAMETROS.flatMap((s) => s.campos).filter((c) => c.tipo !== 'calculado');

export const PARAMETROS_VAZIOS = Object.fromEntries(CAMPOS_EDITAVEIS.map((c) => [c.id, '']));

// Número no padrão brasileiro com `casas` casas fixas; '' quando não há valor.
export function formatarNumero(valor, casas) {
  if (valor === '' || valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
