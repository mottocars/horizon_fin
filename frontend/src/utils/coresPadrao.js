// Paleta usada como cor padrão pra opções que o usuário ainda não
// personalizou (ver ConfigurarFiltrosModal.jsx) — cicla pelo índice da
// opção na lista.
const PALETA_PADRAO = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#6366f1', '#f97316',
];

export function corPadrao(indice) {
  return PALETA_PADRAO[indice % PALETA_PADRAO.length];
}
