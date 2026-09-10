import { Wand2 } from 'lucide-react';

// Barra de "orçamento de pesos": os 5 indicadores precisam somar exatamente
// 100 pontos antes de gravar uma versão nova. A barra reparte
// proporcionalmente (base = maior entre a soma atual e 100), então
// ultrapassar 100 aperta visualmente os blocos em vez de estourar a barra —
// dá pra ver o excesso sem precisar ler o número.
export default function OrcamentoPesos({ indicadores, pesos, onDistribuir, disabled = false }) {
  const soma = indicadores.reduce((acc, ind) => acc + (Number(pesos[ind.id]) || 0), 0);
  const resto = 100 - soma;
  const base = Math.max(soma, 100);

  const status =
    soma === 100
      ? {
          tom: 'text-emerald-600',
          texto: '100 de 100 pontos distribuídos',
          ajuda: 'Orçamento fechado. Já dá pra gravar esta versão.',
        }
      : soma < 100
        ? {
            tom: 'text-amber-600',
            texto: `faltam ${resto} pontos`,
            ajuda: `A soma está em ${soma}. Distribua os ${resto} pontos restantes antes de gravar.`,
          }
        : {
            tom: 'text-red-600',
            texto: `excedeu ${soma - 100} pontos`,
            ajuda: `A soma está em ${soma}. Reduza ${soma - 100} pontos antes de gravar.`,
          };

  return (
    <div className="border-t border-gray-100 pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800">Orçamento de pesos</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Você tem 100 pontos para distribuir entre os cinco indicadores.
          </p>
        </div>
        <span className={`font-mono text-sm font-medium ${status.tom}`}>{status.texto}</span>
      </div>

      <div className="mt-3 flex h-7 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
        {indicadores.map((ind) => {
          const peso = Number(pesos[ind.id]) || 0;
          if (peso <= 0) return null;
          return (
            <div
              key={ind.id}
              style={{ flex: `0 0 ${(peso / base) * 100}%`, background: ind.cor }}
              className="flex items-center justify-center font-mono text-[11px] text-white"
              title={`${ind.curto}: ${peso}`}
            >
              {peso >= 7 ? peso : ''}
            </div>
          );
        })}
        {soma < 100 && (
          <div
            style={{
              flex: `0 0 ${(resto / base) * 100}%`,
              backgroundImage: 'repeating-linear-gradient(135deg, #e5e7eb, #e5e7eb 5px, #f3f4f6 5px, #f3f4f6 10px)',
            }}
            className="flex items-center justify-center font-mono text-[11px] text-gray-400"
          >
            {resto >= 7 ? resto : ''}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-500">
        {indicadores.map((ind) => (
          <span key={ind.id} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: ind.cor }} aria-hidden="true" />
            {ind.curto} <strong className="font-mono font-medium text-gray-700">{Number(pesos[ind.id]) || 0}</strong>
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-xs text-gray-500">{status.ajuda}</p>
        <button
          type="button"
          onClick={onDistribuir}
          disabled={disabled || soma === 100 || soma === 0}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Wand2 size={13} />
          Distribuir proporcionalmente
        </button>
      </div>
    </div>
  );
}
