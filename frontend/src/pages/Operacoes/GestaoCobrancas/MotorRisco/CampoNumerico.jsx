import { estadoCampoNumero } from './estadoCampo';

// Um parâmetro numérico com rótulo, explicação e exemplo ilustrativo à
// esquerda, e o input à direita — mesmo par "descrição + campo" usado nas
// demais telas do sistema, só que com a régua de contexto embaixo (o que
// esse número faz na prática), porque aqui cada parâmetro molda o motor
// inteiro, não é só um dado de cadastro.
export default function CampoNumerico({ campo, value, onChange, disabled = false, primeiro = false }) {
  return (
    <div
      className={`grid grid-cols-1 gap-3 py-4 sm:grid-cols-[1fr_150px] sm:items-start sm:gap-4 ${
        primeiro ? '' : 'border-t border-gray-100'
      }`}
    >
      <div>
        <p className="text-sm font-medium text-gray-800">{campo.label}</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">{campo.desc}</p>
        {campo.exemplo && (
          <p className="mt-2 border-l-2 border-primary-100 pl-2.5 text-xs leading-relaxed text-primary-700">
            {campo.exemplo}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          min={campo.min}
          max={campo.max}
          step={campo.step || 1}
          disabled={disabled}
          onChange={(e) => onChange(campo.id, e.target.value === '' ? '' : Number(e.target.value))}
          className={`w-full rounded-lg border px-3 py-2 text-right font-mono text-sm tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-primary-100 ${estadoCampoNumero(value, disabled)}`}
        />
        <span className="w-16 shrink-0 text-xs text-gray-400">{campo.unidade}</span>
      </div>
    </div>
  );
}
