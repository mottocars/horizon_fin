// Estrutura fixa da DRE (nível 1) — mesma pra todas as empresas, mesmo espírito de
// MACRO_ETAPAS_REPASSES.js. `value` é o mesmo código usado como `grupo` em mascara_itens (ver
// backend/src/modules/mascaras/mascaras.controller.js::GRUPOS_DRE) — só os grupos com
// `calculado: false` guardam itens de nível 2 (a Máscara DRE cadastrada pelo usuário em cada
// empresa); os `calculado: true` são subtotais de exibição (somam os grupos acima), sem
// cadastro próprio.
export const ESTRUTURA_DRE = [
  { value: 'RECEITA_BRUTA', label: 'RECEITA BRUTA', operador: '+', calculado: false },
  { value: 'IMPOSTOS_RECEITA', label: 'IMPOSTOS SOBRE A RECEITA', operador: '-', calculado: false },
  { value: 'RECEITA_LIQUIDA', label: 'RECEITA LÍQUIDA', operador: '=', calculado: true },
  { value: 'CIV', label: 'CIV - CUSTO DOS IMÓVEIS VENDIDOS', operador: '-', calculado: false },
  { value: 'LUCRO_BRUTO', label: 'LUCRO BRUTO', operador: '=', calculado: true },
  { value: 'DESPESAS_OPERACIONAIS', label: 'DESPESAS OPERACIONAIS', operador: '-', calculado: false },
  { value: 'EBITDA', label: 'EBITDA - LUCRO OPERACIONAL', operador: '=', calculado: true },
  { value: 'DESPESAS_RECEITAS_NAO_OPERACIONAIS', label: 'DESPESAS/RECEITAS NÃO OPERACIONAIS', operador: '+/-', calculado: false },
  { value: 'LUCRO_LIQUIDO', label: 'LUCRO LÍQUIDO', operador: '=', calculado: true },
];
