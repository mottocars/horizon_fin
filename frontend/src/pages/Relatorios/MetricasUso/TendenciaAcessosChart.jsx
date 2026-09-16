import { useMemo, useState } from 'react';
import Card from '../../../components/Card';

const WIDTH = 720;
const HEIGHT = 200;
const PAD_LEFT = 36;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

// Arredonda pra um teto "redondo" (10, 20, 50, 100, 200...) em vez do valor
// máximo cru — senão a linha de grade do topo mostra um número tipo "37" e
// nunca bate exatamente com o pico do gráfico.
function tetoAmigavel(valor) {
  if (valor <= 0) return 4;
  const exp = Math.floor(Math.log10(valor));
  const base = 10 ** exp;
  const normalizado = valor / base;
  const passo = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10;
  return passo * base;
}

function formatarDataCurta(dataISO) {
  return new Date(`${dataISO}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function TendenciaAcessosChart({ porDia }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  const { pontos, tetoY, ticksY } = useMemo(() => {
    const max = Math.max(0, ...porDia.map((d) => d.total));
    const teto = tetoAmigavel(max);
    const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const n = porDia.length;

    const pts = porDia.map((d, i) => {
      const x = n <= 1 ? PAD_LEFT : PAD_LEFT + (i / (n - 1)) * plotW;
      const y = PAD_TOP + plotH - (d.total / teto) * plotH;
      return { ...d, x, y };
    });

    return {
      pontos: pts,
      tetoY: teto,
      ticksY: [0, teto / 2, teto].map((v) => Math.round(v)),
    };
  }, [porDia]);

  if (pontos.length === 0) return null;

  const baseline = HEIGHT - PAD_BOTTOM;
  const ultimo = pontos[pontos.length - 1];
  const area = `M ${pontos[0].x},${baseline} L ${pontos.map((p) => `${p.x},${p.y}`).join(' L ')} L ${ultimo.x},${baseline} Z`;
  const hover = hoverIdx !== null ? pontos[hoverIdx] : null;

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const ratio = Math.min(1, Math.max(0, (relX - PAD_LEFT) / plotW));
    const idx = Math.round(ratio * (pontos.length - 1));
    setHoverIdx(Math.min(pontos.length - 1, Math.max(0, idx)));
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-900">Acessos ao longo do tempo</h2>
      <p className="text-xs text-gray-500">Total de acessos por dia, no período selecionado</p>

      <div className="relative mt-4">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full touch-none"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
          role="img"
          aria-label="Gráfico de acessos por dia"
        >
          {ticksY.map((tick) => {
            const y = PAD_TOP + (HEIGHT - PAD_TOP - PAD_BOTTOM) * (1 - tick / tetoY);
            return (
              <g key={tick}>
                <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} stroke="#f3f4f6" strokeWidth="1" />
                <text x={PAD_LEFT - 8} y={y} textAnchor="end" dominantBaseline="middle" fontSize="10" fill="#9ca3af">
                  {tick.toLocaleString('pt-BR')}
                </text>
              </g>
            );
          })}

          <path d={area} fill="#3b82f6" fillOpacity="0.1" stroke="none" />
          <polyline points={pontos.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          <circle cx={ultimo.x} cy={ultimo.y} r="4" fill="#2563eb" stroke="#fff" strokeWidth="2" />
          <text x={Math.min(ultimo.x + 6, WIDTH - 20)} y={Math.max(ultimo.y - 8, 10)} fontSize="11" fontWeight="600" fill="#1d4ed8">
            {ultimo.total.toLocaleString('pt-BR')}
          </text>

          {hover && (
            <>
              <line x1={hover.x} x2={hover.x} y1={PAD_TOP} y2={baseline} stroke="#d1d5db" strokeWidth="1" />
              <circle cx={hover.x} cy={hover.y} r="4" fill="#2563eb" stroke="#fff" strokeWidth="2" />
            </>
          )}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-gray-100 bg-white px-2.5 py-1.5 text-xs shadow-card"
            style={{ left: `${(hover.x / WIDTH) * 100}%` }}
          >
            <p className="font-semibold text-gray-900">{hover.total.toLocaleString('pt-BR')} acessos</p>
            <p className="text-gray-400">{formatarDataCurta(hover.data)}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
