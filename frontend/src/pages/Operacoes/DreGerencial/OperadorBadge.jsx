// Selo do operador de cada linha de nível 1 da DRE — mesmo "+"/"-"/"+/-"/"=" da estrutura
// (ver config/estruturaDre.js), usado tanto no cadastro (MascarasTab.jsx) quanto na
// demonstração em si (DreTab.jsx), pra manter a mesma linguagem visual nos dois lugares.
const CORES = {
  '+': 'bg-emerald-50 text-emerald-600',
  '-': 'bg-rose-50 text-rose-600',
  '+/-': 'bg-amber-50 text-amber-600',
  '=': 'bg-gray-200 text-gray-600',
};

// `escuro` é usado na barra de subtotal da aba DRE (fundo gray-900) — o badge cinza claro de
// `=` ficaria ilegível ali, então essa variante troca pra um selo translúcido branco.
export default function OperadorBadge({ operador, escuro = false }) {
  const cor = escuro ? 'bg-white/15 text-white' : CORES[operador] || 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex h-5 shrink-0 items-center justify-center rounded-full px-2 text-[10px] font-bold tabular-nums ${cor}`}>
      {operador}
    </span>
  );
}
