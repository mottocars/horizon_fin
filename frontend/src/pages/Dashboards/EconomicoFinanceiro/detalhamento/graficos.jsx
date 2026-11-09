import { useState } from 'react';
import { COR, useDica, useLargura } from '../fluxo/ganchos';
import { niceTicks } from '../fluxo/modelo';
import { brl, eixo, lbl } from './modelo';

// Gráfico do Detalhamento Financeiro (mesma identidade dos painéis do Fluxo de Caixa e do Aging List: mede a
// largura do quadro e redesenha no tamanho exato; dica flutuante do DicaProvider do painel).

export const COR_ABERTO = { entrada: '#9cc3ef', saida: '#f2a3a2' };
const ROTULO = { R: 'realizadas', A: 'em aberto' };

// ─── Mês a mês ───────────────────────────────────────────────────────────────────────────────────
// Um gráfico por `tipo`: 'R' (realizado) ou 'A' (em aberto). Para cima, as entradas; para baixo, as saídas
// (`cores`: [entrada, saída]); a linha escura é o resultado do mês. A faixa cinza marca o mês atual.
export function MensalGrafico({ meses, tipo, cores }) {
  const [ref, W] = useLargura();
  const { mostrar, esconder } = useDica();
  const [cursor, setCursor] = useState(null);
  const ke = `e${tipo}`;
  const ks = `s${tipo}`;
  const kr = `res${tipo}`;
  const ka = `acum${tipo}`;
  const n = meses.length;
  const H = W < 560 ? 250 : 300;
  const m = { l: 58, r: 14, t: 16, b: 30 };
  const vals = meses.flatMap((x) => [x[ke], x[ks], x[kr]]);
  const ymax = Math.max(1, ...vals) * 1.08;
  const ymin = Math.min(-1, ...vals) * 1.08;
  const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - ymin) / (ymax - ymin || 1));
  const bw = (W - m.l - m.r) / Math.max(1, n);
  const cx = (i) => m.l + bw * i + bw / 2;
  const w = Math.max(4, Math.min(46, bw * 0.56));
  const passo = W < 560 ? Math.ceil(n / 6) : Math.ceil(n / 16);
  const barra = (v, cor, chave) =>
    Math.abs(v) < 0.5 ? null : <rect key={chave} x={-w / 2} y={Math.min(y(0), y(v))} width={w} height={Math.max(1, Math.abs(y(v) - y(0)))} rx={2} fill={cor} />;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Entradas e saídas ${ROTULO[tipo]} e o resultado, mês a mês`}>
        {meses.map((x, i) => (x.atual ? <rect key="hoje" x={m.l + bw * i} y={m.t} width={bw} height={H - m.t - m.b} fill={COR.surface2} /> : null))}
        {niceTicks(ymin, ymax, 5).map((v, i) => (
          <g key={`${v}-${i}`}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? COR.ink2 : COR.grid} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end">
              {eixo(v)}
            </text>
          </g>
        ))}
        {meses.map((x, i) => (
          <g key={x.mes} transform={`translate(${cx(i)},0)`}>
            {barra(x[ke], cores[0], 'e')}
            {barra(x[ks], cores[1], 's')}
            {(i % passo === 0 || i === n - 1 || x.atual) && (
              <text x={0} y={H - 10} textAnchor="middle" style={x.atual ? { fill: COR.ink, fontWeight: 600 } : undefined}>
                {x.atual ? `${lbl(x.mes)} · hoje` : lbl(x.mes)}
              </text>
            )}
          </g>
        ))}
        <path d={meses.map((x, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${y(x[kr]).toFixed(1)}`).join('')} fill="none" stroke={COR.ink} strokeWidth={2} strokeLinejoin="round" />
        {meses.map((x, i) => (
          <circle key={`r${x.mes}`} cx={cx(i)} cy={y(x[kr])} r={cursor === i ? 5 : 3.5} fill={x[kr] >= 0 ? COR.ink : COR.crit} stroke={COR.surface} strokeWidth={1.5} />
        ))}
        {cursor !== null && <line x1={cx(cursor)} x2={cx(cursor)} y1={m.t} y2={H - m.b} stroke={COR.ink2} opacity={0.35} />}
        {meses.map((x, i) => (
          <rect
            key={`h${x.mes}`}
            x={m.l + bw * i}
            y={m.t}
            width={bw}
            height={H - m.t - m.b}
            fill="transparent"
            onMouseMove={(ev) => {
              setCursor(i);
              mostrar(ev, `${lbl(x.mes)}${x.atual ? ' (mês atual)' : ''}`, [
                [`Entradas ${ROTULO[tipo]}`, brl(x[ke])],
                [`Saídas ${ROTULO[tipo]}`, brl(x[ks])],
                ['Resultado do mês', brl(x[kr], true)],
                ['Resultado acumulado', brl(x[ka], true)],
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
