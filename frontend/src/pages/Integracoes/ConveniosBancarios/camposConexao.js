// Compartilhado pelos formulários de conexão (VanPix e API Itaú) da tela Convênios Bancários.

// Cada tipo tem seus próprios campos (e tabela no backend), reunidos numa única tela
// "Nova Conexão" — o combobox troca o formulário.
export const TIPOS_CONEXAO = [
  { value: 'VANPIX', label: 'VanPix' },
  { value: 'ITAU', label: 'API Itaú' },
];

// Mesmo padrão de ContaBancariaItemDetalhe.jsx (corCampoFiltro no Espião NFe/NFSe): âmbar
// quando o campo está em branco, azul claro quando já tem valor — dá pra ver de relance o
// que ainda falta preencher na conexão.
// A borda azul é primary-100/500 (não 200/400): o tema (styles/index.css) só define primary
// 50, 100, 500, 600 e 700 — classe de tom inexistente não gera CSS e a borda cairia na cor
// padrão (preta).
const COR_CAMPO_VAZIO = 'border-amber-200 bg-amber-50 focus:border-amber-400';
const COR_CAMPO_PREENCHIDO = 'border-primary-100 bg-primary-50 focus:border-primary-500';
// Na edição o campo fica vazio de propósito (o backend nunca manda o segredo descriptografado
// de volta) — o placeholder simula visualmente "tem uma senha escondida aqui" em vez do campo
// parecer em branco/sem nada.
export const PLACEHOLDER_SEGREDO = '••••••••••••••••';

export function estaPreenchido(valor) {
  return String(valor ?? '').trim() !== '';
}

export function classesCor(preenchido) {
  return preenchido
    ? `${COR_CAMPO_PREENCHIDO} focus:ring-primary-100`
    : `${COR_CAMPO_VAZIO} focus:ring-amber-100`;
}

export function corCampo(valor) {
  return classesCor(estaPreenchido(valor));
}

// O gatilho do SearchableSelect já traz o próprio anel de foco (primary-100), então aqui vão
// só borda e fundo — repetir o anel geraria conflito de especificidade no Tailwind.
export function corSelect(valor) {
  return estaPreenchido(valor) ? COR_CAMPO_PREENCHIDO : COR_CAMPO_VAZIO;
}
