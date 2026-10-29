import { useState } from 'react';
import { COR, useDica, useLargura } from '../fluxo/ganchos';
import { eixo, niceTicks } from '../fluxo/modelo';
import { brl, dm, semana } from './modelo';

// Gráfico do simulador do Aging List: o caixa dia a dia — entradas (para cima) e saídas (para baixo)
// de cada dia, a linha do saldo no fim do dia e — quando o saldo desce até ele — o valor do cheque especial
// que está dentro do saldo (abaixo da linha, o caixa está usando o cheque).
// Fim de semana em faixa cinza (o que vence nele cai na segunda). Clicar num dia abre as parcelas dele.
export function CaixaDiario({ sim, diaSel, onDia }) {
  const [ref, W] = useLargura();
  const { mostrar, esconder } = useDica();
  const [cursor, setCursor] = useState(null);
  const { dias, ini, cheque } = sim;
  const n = dias.length;
  const H = W < 560 ? 250 : 300;
  const m = { l: 58, r: 14, t: 18, b: 32 };
  const piso = cheque > 0 && sim.min < cheque ? cheque : null;
  const valores = [ini, 0, ...dias.flatMap((d) => [d.fim, d.ent, -d.sai]), ...(piso !== null ? [piso] : [])];
  const ymin = Math.min(...valores) * 1.08;
  const ymax = Math.max(...valores) * 1.08 || 1;
  const bw = (W - m.l - m.r) / Math.max(1, n);
  const cx = (i) => m.l + bw * i + bw / 2;
  const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - ymin) / (ymax - ymin || 1));
  const w = Math.max(2, Math.min(26, bw * 0.34));
  const passo = Math.max(1, Math.ceil(n / (W < 560 ? 6 : 16)));
  const linha = [`M${m.l},${y(ini)}`, ...dias.map((d, i) => `L${cx(i).toFixed(1)},${y(d.fim).toFixed(1)}`)].join('');
  const iMin = dias.findIndex((d) => d.data === sim.minData);
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Saldo de caixa no fim de cada dia">
        {dias.map((d, i) =>
          d.util ? null : <rect key={`f${d.data}`} x={m.l + bw * i} y={m.t} width={bw} height={H - m.t - m.b} fill={COR.surface2} />
        )}
        {diaSel && dias.some((d) => d.data === diaSel) && (
          <rect x={m.l + bw * dias.findIndex((d) => d.data === diaSel)} y={m.t} width={bw} height={H - m.t - m.b} fill="#dbe8f2" />
        )}
        {niceTicks(ymin, ymax, 5).map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? COR.ink2 : COR.grid} strokeWidth={1} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end">
              {eixo(v)}
            </text>
          </g>
        ))}
        {dias.map((d, i) => (
          <g key={d.data}>
            {d.ent > 0 && <rect x={cx(i) - w - 1} y={y(d.ent)} width={w} height={Math.max(1, y(0) - y(d.ent))} rx={2} fill={COR.entrada} fillOpacity={0.85} />}
            {d.sai > 0 && <rect x={cx(i) + 1} y={y(0)} width={w} height={Math.max(1, y(-d.sai) - y(0))} rx={2} fill={COR.saida} fillOpacity={0.85} />}
            {(i % passo === 0 || i === n - 1) && (
              <text x={cx(i)} y={H - 12} textAnchor="middle" style={d.util ? undefined : { opacity: 0.6 }}>
                {i === 0 ? 'hoje' : dm(d.data)}
              </text>
            )}
          </g>
        ))}
        {piso !== null && (
          <>
            <line x1={m.l} x2={W - m.r} y1={y(piso)} y2={y(piso)} stroke="#8a5a00" strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={W - m.r - 4} y={y(piso) + 14} textAnchor="end" style={{ fill: '#8a5a00' }}>
              abaixo daqui, cheque especial ({eixo(piso)})
            </text>
          </>
        )}
        <path d={linha} fill="none" stroke={COR.ink} strokeWidth={2.25} strokeLinejoin="round" />
        <circle cx={m.l} cy={y(ini)} r={4} fill={COR.ink} stroke={COR.surface} strokeWidth={2} />
        <text x={m.l + 2} y={y(ini) - 10} className="val">
          {eixo(ini)}
        </text>
        {iMin >= 0 && (
          <>
            <circle cx={cx(iMin)} cy={y(sim.min)} r={5} fill={sim.min < 0 ? COR.saida : COR.ink} stroke={COR.surface} strokeWidth={2} />
            {/* Rótulo para dentro do gráfico nas pontas (não encosta no do saldo de partida). */}
            <text
              x={iMin < n / 4 ? cx(iMin) + 8 : iMin > (3 * n) / 4 ? cx(iMin) - 8 : cx(iMin)}
              y={y(sim.min) + 18}
              textAnchor={iMin < n / 4 ? 'start' : iMin > (3 * n) / 4 ? 'end' : 'middle'}
              className="val"
            >
              mín. {eixo(sim.min)}
            </text>
          </>
        )}
        {dias.map((d, i) => (
          <circle key={`p${d.data}`} cx={cx(i)} cy={y(d.fim)} r={cursor === i ? 4 : 2.2} fill={d.fim < 0 ? COR.saida : COR.ink} />
        ))}
        {cursor !== null && <line x1={cx(cursor)} x2={cx(cursor)} y1={m.t} y2={H - m.b} stroke={COR.ink2} strokeWidth={1} opacity={0.4} />}
        {dias.map((d, i) => (
          <rect
            key={`h${d.data}`}
            x={m.l + bw * i}
            y={m.t}
            width={bw}
            height={H - m.t - m.b}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => onDia(d.data === diaSel ? null : d.data)}
            onMouseMove={(ev) => {
              setCursor(i);
              mostrar(ev, `${semana(d.n)}, ${dm(d.data)}${d.util ? '' : ' · fim de semana'}`, [
                ['Saldo no início', brl(d.ini)],
                ['Entradas', brl(d.ent)],
                ['Saídas', brl(-d.sai)],
                ['Saldo no fim', brl(d.fim)],
              ]);
            }}
            onMouseLeave={() => {
              setCursor(null);
              esconder();
            }}
          />
        ))}
      </svg>
    </div>
  );
}
