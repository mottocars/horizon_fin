import { fmt } from './calculo';
import { estadoCampoNumero } from './estadoCampo';

function CampoMini({ label, value, onChange, disabled, min, max }) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-gray-400">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={`w-full rounded-lg border px-2.5 py-1.5 text-right font-mono text-sm tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-primary-100 ${estadoCampoNumero(value, disabled)}`}
      />
    </div>
  );
}

// Uma escala de indicador: nome + fórmula, os 3 campos que a definem
// (nota 0 / nota 100 / peso) e, embaixo, a "régua de conversão" mostrando
// como fica a nota em 5 pontos do intervalo — pra quem está calibrando ver
// na hora o efeito do que acabou de digitar, sem fazer conta de cabeça.
export default function EscalaIndicador({ indicador, escala, onChange, disabled = false, primeiro = false }) {
  const escalaPreenchida = escala.nota_0 !== '' && escala.nota_100 !== '';
  const pontos = escalaPreenchida
    ? [0, 0.25, 0.5, 0.75, 1].map((t) => ({
        pct: t * 100,
        valor: escala.nota_0 + (escala.nota_100 - escala.nota_0) * t,
      }))
    : [];

  return (
    <div className={`py-4 ${primeiro ? '' : 'border-t border-gray-100'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-800">{indicador.nome}</p>
          <p className="mt-0.5 font-mono text-[11px] text-gray-400">o sistema calcula: {indicador.formula}</p>
        </div>
        <span
          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: indicador.cor }}
          aria-hidden="true"
        />
      </div>

      <div className="mt-3 grid max-w-md grid-cols-3 gap-3">
        <CampoMini
          label="Nota 0 · pior"
          value={escala.nota_0}
          onChange={(v) => onChange(indicador.id, 'nota_0', v)}
          disabled={disabled}
        />
        <CampoMini
          label="Nota 100 · ideal"
          value={escala.nota_100}
          onChange={(v) => onChange(indicador.id, 'nota_100', v)}
          disabled={disabled}
        />
        <CampoMini
          label="Peso"
          value={escala.peso}
          min={0}
          max={100}
          onChange={(v) => onChange(indicador.id, 'peso', v)}
          disabled={disabled}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg bg-gray-50 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-gray-400">como converte</span>
        {escalaPreenchida ? (
          pontos.map((p) => (
            <span key={p.pct} className="whitespace-nowrap font-mono text-xs text-gray-500">
              {fmt(p.valor)}
              {indicador.unidade} → <strong className="font-medium text-gray-700">{p.pct.toFixed(0)}</strong>
            </span>
          ))
        ) : (
          <span className="font-mono text-xs text-gray-400">preencha nota 0 e nota 100 pra ver a conversão</span>
        )}
      </div>
    </div>
  );
}
