// O que entra nas cópias de uma versão da DFC (ver fotos.js). Cada tabela leva só as linhas da empresa
// (`filtro`, com $1 = empresa e o alias `x` da tabela de origem). Tudo o que a DFC (as abas, o dashboard Fluxo
// de Caixa, o MCP, o Excel e o Impacto DFC da Reforma) lê e que muda com o tempo tem de estar aqui — o que não
// estiver é lido ao vivo do public.

const daEmpresa = 'x.empresa_id = $1';
const centroExiste = (coluna = 'sienge_id') =>
  `EXISTS (SELECT 1 FROM public.centros_custo_sienge c WHERE c.empresa_id = s.empresa_id AND c.sienge_id = s.${coluna})`;
const contaExiste = 'EXISTS (SELECT 1 FROM public.planos_financeiros_sienge p WHERE p.empresa_id = s.empresa_id AND p.sienge_id = s.sienge_id)';

// Configuração e Orçamento (schema dfc_vc_<id>). `restaura`: voltam ao que estava na versão de onde a aberta
// saiu quando ela é aberta e quando é excluída — na ordem pai → filho; `pk` = a chave primária; `existe` =
// condição extra pra reinserir uma linha (a linha da cópia `s` só volta se o que ela referencia ainda existir).
const CONFIG = [
  { tabela: 'dfc_mascaras', filtro: daEmpresa, restaura: true, pk: ['id'] },
  { tabela: 'dfc_plano_contas', filtro: daEmpresa, restaura: true, pk: ['empresa_id', 'sienge_id'], existe: contaExiste },
  {
    tabela: 'dfc_plano_contas_versoes',
    filtro: daEmpresa,
    restaura: true,
    pk: ['empresa_id', 'centro_id'],
    existe: centroExiste('centro_id'),
  },
  {
    tabela: 'dfc_plano_contas_centro',
    filtro: daEmpresa,
    restaura: true,
    pk: ['empresa_id', 'centro_id', 'sienge_id'],
    existe: `${contaExiste} AND EXISTS (SELECT 1 FROM public.dfc_plano_contas_versoes v WHERE v.empresa_id = s.empresa_id AND v.centro_id = s.centro_id)`,
  },
  { tabela: 'dfc_parametros_versoes', filtro: daEmpresa, restaura: true, pk: ['id'], existe: centroExiste() },
  { tabela: 'dfc_avanco_manual', filtro: daEmpresa, restaura: true, pk: ['empresa_id', 'sienge_id', 'mes'], existe: centroExiste() },
  {
    tabela: 'dfc_repasses_registro_manual',
    filtro: daEmpresa,
    restaura: true,
    pk: ['empresa_id', 'contrato_empreendimento', 'numero_contrato_unidade'],
  },
  { tabela: 'dfc_divida_pj', filtro: daEmpresa, restaura: true, pk: ['id'], existe: centroExiste() },
  // Configuração do saldo (aba Contas › engrenagem): ERP ou Saldo das Contas Horizon. Versões salvas antes dela
  // não têm a tabela na cópia — fotos.restaurar pula a tabela que falta.
  { tabela: 'dfc_saldo_config', filtro: daEmpresa, restaura: true, pk: ['empresa_id'] },
  {
    tabela: 'dfc_orcamento_informado',
    filtro: daEmpresa,
    restaura: true,
    pk: ['empresa_id', 'centro_id', 'sienge_id', 'mes'],
    existe: centroExiste('centro_id'),
  },
  // O Orçamento consolidado (o que o "Gerar orçamento" grava). Só volta a linha cuja geração ainda existe.
  {
    tabela: 'dfc_orcamento_valores',
    filtro: daEmpresa,
    restaura: true,
    pk: ['empresa_id', 'centro_id', 'sienge_id', 'tipo_parcela', 'mes'],
    existe: `${centroExiste('centro_id')} AND EXISTS (SELECT 1 FROM public.dfc_orcamento_versoes g WHERE g.id = s.versao_id)`,
  },
  // De fora da DFC ou bases calculadas: entram na cópia, mas não voltam ao excluir (as colunas da DFC no
  // cadastro do centro e da conta bancária voltam à parte — fotos.restaurar).
  { tabela: 'centros_custo_sienge', filtro: daEmpresa },
  { tabela: 'contas_bancarias_sienge', filtro: daEmpresa },
  { tabela: 'planos_financeiros_sienge', filtro: daEmpresa },
  { tabela: 'dfc_orcamento_versoes', filtro: daEmpresa },
  { tabela: 'dfc_projecao_cef', filtro: daEmpresa },
  { tabela: 'dfc_projecao_cef_execucao', filtro: daEmpresa },
  { tabela: 'dfc_desembolso_fichas', filtro: daEmpresa },
];

// Realizado (schema dfc_vr_<id>): o extrato bancário (com o rateio por centro × natureza e até onde cada conta
// foi sincronizada) e as parcelas a receber (de onde vem o tipo de parcela do recebimento). A Editar última
// versão usa a mesma cópia da versão editada.
const REALIZADO = [
  { tabela: 'sie_extrato_contas', filtro: daEmpresa },
  { tabela: 'sie_extrato_contas_rateio', filtro: daEmpresa },
  { tabela: 'sie_extrato_contas_sincronizacoes', filtro: daEmpresa },
  { tabela: 'sie_income', filtro: daEmpresa },
  // Saldo das Contas Horizon (o Saldo Inicial do mês atual quando a configuração do saldo é HORIZON).
  { tabela: 'saldos_contas_bancarias', filtro: daEmpresa },
  { tabela: 'saldos_bloqueios', filtro: daEmpresa },
  { tabela: 'saldos_periodos', filtro: daEmpresa },
];

module.exports = { CONFIG, REALIZADO };
