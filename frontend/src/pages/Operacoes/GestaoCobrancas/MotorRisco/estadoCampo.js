// Classe de borda/fundo de um input numérico, conforme o estado — usado nos
// 3 lugares com campo numérico da tela (parâmetros/cortes, escala dos
// indicadores e o simulador). Em branco ganha destaque âmbar: com tantos
// campos lado a lado sobre fundo branco, sem isso fica difícil enxergar
// onde ainda falta preencher. Assim que recebe um valor, vira azul claro
// (a cor da marca) — fica óbvio de relance o que já foi preenchido.
export function estadoCampoNumero(valor, disabled = false) {
  if (disabled) return 'border-gray-200 bg-gray-50 text-gray-400';
  const vazio = valor === '' || valor === null || valor === undefined;
  return vazio
    ? 'border-amber-300 bg-amber-50 text-gray-900 hover:border-amber-400'
    : 'border-primary-100 bg-primary-50 text-gray-900 hover:border-primary-500';
}
