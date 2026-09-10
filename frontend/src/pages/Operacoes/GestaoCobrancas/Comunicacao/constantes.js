// Réplica do protótipo comunicacao-templates.html. Reaproveita o mesmo
// vocabulário de cluster já usado na Régua de Cobrança — um template marca
// em quais desses 5 clusters ele pode ser escolhido (ver TemplateEditor.jsx
// e regua_cobranca_etapas.cluster no backend).
export { CLUSTERS, CLUSTER_ICON, CLUSTER_ICON_COR, CLUSTER_TAB_ATIVA } from '../ReguaCobranca/constantes';

// Variáveis disponíveis no corpo/assunto (@nome_cliente etc.) — mesma lista
// do protótipo, com um valor de exemplo pra pré-visualização e pra montar
// a lista lateral clicável (ver VariablesPanel.jsx).
export const VARS = [
  { chave: 'nome_cliente', rotulo: 'Nome do cliente', exemplo: 'Construtora Vale Ltda.' },
  { chave: 'centro_custo', rotulo: 'Centro de custo', exemplo: 'Residencial Aurora' },
  { chave: 'vencimento', rotulo: 'Vencimento', exemplo: '31/07/2026' },
  { chave: 'valor', rotulo: 'Valor', exemplo: 'R$ 12.900,00' },
];

const VALOR_POR_CHAVE = Object.fromEntries(VARS.map((v) => [v.chave, v.exemplo]));

// Troca cada @chave pelo valor de exemplo — usado na pré-visualização
// (assunto e corpo). Uma @chave que não existe em VARS fica como está (não
// quebra o texto, só não é substituída).
export function substituirVariaveis(texto) {
  return String(texto || '').replace(/@([a-z_]+)/g, (trecho, chave) => VALOR_POR_CHAVE[chave] ?? trecho);
}
