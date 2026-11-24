// O que entra nas cópias de uma versão da DRE (ver fotos.js). Cada tabela leva só as linhas da empresa
// (`filtro`, com o parâmetro $1 = empresa e o alias `x` da tabela de origem). Tudo o que a DRE, as abas
// dela, o dashboard, o MCP, o Excel de auditoria e a Reforma Tributária leem e que muda com o tempo
// tem de estar aqui — o que não estiver é lido ao vivo do public.

const daEmpresa = 'x.empresa_id = $1';

// Configuração (schema dre_vc_<id>): as abas da DRE e os cadastros de fora que ela usa. `restaura`: as
// tabelas que voltam ao que estava na última versão salva quando a versão aberta é excluída (e quando
// uma versão é aberta) — na ordem pai → filho; `pk` = a chave primária; `existe` = condição extra pra
// reinserir uma linha (a linha da cópia `s` só volta se o que ela referencia ainda existir).
const CONFIG = [
  { tabela: 'dre_categorias_orcamento', filtro: daEmpresa, restaura: true, pk: ['id'] },
  {
    tabela: 'dre_orcamento_valores',
    filtro: daEmpresa,
    restaura: true,
    pk: ['id'],
    existe: 'EXISTS (SELECT 1 FROM public.centros_custo_sienge c WHERE c.empresa_id = s.empresa_id AND c.sienge_id = s.sienge_id)',
  },
  { tabela: 'dre_mascaras', filtro: daEmpresa, restaura: true, pk: ['id'] },
  {
    tabela: 'dre_mascaras_imposto_historico',
    filtro: 'x.mascara_id IN (SELECT id FROM public.dre_mascaras WHERE empresa_id = $1)',
    restaura: true,
    pk: ['id'],
  },
  { tabela: 'dre_configuracoes', filtro: daEmpresa, restaura: true, pk: ['empresa_id'] },
  { tabela: 'dre_documentos_excluidos', filtro: daEmpresa, restaura: true, pk: ['empresa_id', 'documento'] },
  { tabela: 'dre_condicoes_excluidas', filtro: daEmpresa, restaura: true, pk: ['empresa_id', 'condicao'] },
  {
    tabela: 'dre_plano_contas',
    filtro: daEmpresa,
    restaura: true,
    pk: ['empresa_id', 'sienge_id'],
    existe: 'EXISTS (SELECT 1 FROM public.planos_financeiros_sienge p WHERE p.empresa_id = s.empresa_id AND p.sienge_id = s.sienge_id)',
  },
  {
    tabela: 'dre_plano_contas_versoes',
    filtro: daEmpresa,
    restaura: true,
    pk: ['empresa_id', 'centro_id'],
    existe: 'EXISTS (SELECT 1 FROM public.centros_custo_sienge c WHERE c.empresa_id = s.empresa_id AND c.sienge_id = s.centro_id)',
  },
  {
    tabela: 'dre_plano_contas_centro',
    filtro: daEmpresa,
    restaura: true,
    pk: ['empresa_id', 'centro_id', 'sienge_id'],
    existe:
      'EXISTS (SELECT 1 FROM public.planos_financeiros_sienge p WHERE p.empresa_id = s.empresa_id AND p.sienge_id = s.sienge_id) ' +
      'AND EXISTS (SELECT 1 FROM public.dre_plano_contas_versoes v WHERE v.empresa_id = s.empresa_id AND v.centro_id = s.centro_id)',
  },
  {
    tabela: 'dre_projecao_orcamentos',
    filtro: `${daEmpresa} AND x.versao_id IS NULL`,
    restaura: true,
    pk: ['id'],
    existe: 'EXISTS (SELECT 1 FROM public.centros_custo_sienge c WHERE c.empresa_id = s.empresa_id AND c.sienge_id = s.centro_id)',
  },
  { tabela: 'lancamentos_ajustes', filtro: daEmpresa, restaura: true, pk: ['id'] },
  { tabela: 'lancamentos_ajustes_historico', filtro: daEmpresa, restaura: true, pk: ['id'] },
  { tabela: 'lancamentos_manuais', filtro: daEmpresa, restaura: true, pk: ['id'] },
  // Agrupadores da aba Centros Custos (dre-agrupadores): o agrupador antes dos centros dele.
  { tabela: 'dre_agrupadores', filtro: daEmpresa, restaura: true, pk: ['id'] },
  {
    tabela: 'dre_agrupadores_centros',
    filtro: daEmpresa,
    restaura: true,
    pk: ['empresa_id', 'centro_id'],
    existe: 'EXISTS (SELECT 1 FROM public.centros_custo_sienge c WHERE c.empresa_id = s.empresa_id AND c.sienge_id = s.centro_id)',
  },
  // De fora da DRE (não voltam ao excluir: a versão nova usa o valor de hoje, e o salvar registra o que
  // mudou como "alterado fora da DRE"). As colunas da DRE no cadastro do centro (realiza_dre, dre_ordem)
  // voltam à parte (fotos.restaurar).
  { tabela: 'centros_custo_sienge', filtro: daEmpresa },
  { tabela: 'planos_financeiros_sienge', filtro: daEmpresa },
  { tabela: 'dfc_mascaras', filtro: daEmpresa },
  { tabela: 'dfc_plano_contas', filtro: daEmpresa },
  { tabela: 'dfc_plano_contas_centro', filtro: daEmpresa },
];

// Realizado (schema dre_vr_<id>): as tabelas do Sienge que alimentam a DRE (títulos, extrato, unidades e
// contratos, orçamento empresarial da Projeção). A Editar última versão usa a mesma cópia da versão editada.
const REALIZADO = [
  { tabela: 'sie_income', filtro: daEmpresa },
  { tabela: 'sie_income_categorias', filtro: daEmpresa },
  { tabela: 'sie_income_recebimentos', filtro: daEmpresa },
  { tabela: 'sie_outcome', filtro: daEmpresa },
  { tabela: 'sie_outcome_categorias', filtro: daEmpresa },
  { tabela: 'sie_extrato_contas', filtro: daEmpresa },
  { tabela: 'sie_extrato_contas_rateio', filtro: daEmpresa },
  { tabela: 'sie_units', filtro: daEmpresa },
  { tabela: 'sie_sales_contracts', filtro: daEmpresa },
  { tabela: 'sie_sales_contracts_units', filtro: daEmpresa },
  { tabela: 'sie_sales_contracts_payment_conditions', filtro: daEmpresa },
  { tabela: 'sie_business_budget', filtro: daEmpresa },
  {
    tabela: 'sie_business_budget_categorias',
    filtro: 'x.registro_id IN (SELECT registro_id FROM public.sie_business_budget WHERE empresa_id = $1)',
  },
  {
    tabela: 'sie_business_budget_valores',
    filtro:
      'x.categoria_id IN (SELECT c.categoria_id FROM public.sie_business_budget_categorias c ' +
      'JOIN public.sie_business_budget b ON b.registro_id = c.registro_id WHERE b.empresa_id = $1)',
  },
];

module.exports = { CONFIG, REALIZADO };
