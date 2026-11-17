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

// Variáveis do template fixo de "Comunicação em massa" (vários títulos do
// mesmo cliente numa mensagem só, ver backend
// regua-cobranca-historico/cobrancaEmMassa.service.js) — sem @vencimento/
// @valor de 1 parcela, que não fazem sentido aqui; no lugar, a lista e o total.
export const VARS_EM_MASSA = [
  { chave: 'nome_cliente', rotulo: 'Nome do cliente', exemplo: 'Construtora Vale Ltda.' },
  { chave: 'centro_custo', rotulo: 'Centro de custo', exemplo: 'Residencial Aurora' },
  {
    chave: 'lista_titulos',
    rotulo: 'Lista dos títulos (título, parcela, vencimento e valor)',
    exemplo: [
      '• Título 1234 – parcela 5 – venc. 10/08/2026 – R$ 1.250,00',
      '• Título 1234 – parcela 6 – venc. 10/09/2026 – R$ 1.250,00',
      '• Título 1240 – parcela 2 – venc. 10/09/2026 – R$ 830,00',
    ].join('\n'),
  },
  { chave: 'quantidade_titulos', rotulo: 'Quantidade de títulos', exemplo: '3' },
  { chave: 'valor_total', rotulo: 'Valor total em aberto', exemplo: 'R$ 3.330,00' },
];

const VALOR_POR_CHAVE = Object.fromEntries(VARS.map((v) => [v.chave, v.exemplo]));
const VALOR_POR_CHAVE_EM_MASSA = Object.fromEntries(VARS_EM_MASSA.map((v) => [v.chave, v.exemplo]));

// Troca cada @chave pelo valor de exemplo — usado na pré-visualização
// (assunto e corpo). Uma @chave que não existe em VARS fica como está (não
// quebra o texto, só não é substituída). `emMassa` usa as variáveis do
// template de Comunicação em massa.
export function substituirVariaveis(texto, emMassa = false) {
  const valores = emMassa ? VALOR_POR_CHAVE_EM_MASSA : VALOR_POR_CHAVE;
  return String(texto || '').replace(/@([a-z_]+)/g, (trecho, chave) => valores[chave] ?? trecho);
}
