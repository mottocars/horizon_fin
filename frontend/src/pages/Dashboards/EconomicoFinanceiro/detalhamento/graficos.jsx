import { useState } from 'react';
import { COR, useDica, useLargura } from '../fluxo/ganchos';
import { niceTicks } from '../fluxo/modelo';
import { brl, eixo, lbl } from './modelo';

// Gráfico do Detalhamento Financeiro (mesma identidade dos painéis do Fluxo de Caixa e do Aging List: mede a
// largura do quadro e redesenha no tamanho exato; dica flutuante do DicaProvider do painel).

export const COR_ABERTO = { entrada: '#9cc3ef', saida: '#f2a3a2' };

// ─── Mês a mês ───────────────────────────────────────────────────────────────────────────────────
// Para cima, as entradas: realizadas (azul) e, empilhadas em cima, as em aberto (azul claro). Para baixo,
// as saídas: realizadas (vermelho) e em aberto (vermelho claro). A linha escura é o resultado do mês
// (realizado + em aberto). A faixa cinza marca o mês atual.
export function MensalGrafico({ meses }) {
  const [ref, W] = useLargura();
  const { mostrar, esconder } = useDica();
  const [cursor, setCursor] = useState(null);
  const n = meses.length;
  const H = W < 560 ? 270 : 340;
  const m = { l: 58, r: 14, t: 16, b: 30 };
  const vals = meses.flatMap((x) => [x.eR + x.eA, x.sR + x.sA, x.res]);
  const ymax = Math.max(1, ...vals) * 1.08;
  const ymin = Math.min(-1, ...vals) * 1.08;
  const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - ymin) / (ymax - ymin || 1));
  const bw = (W - m.l - m.r) / Math.max(1, n);
  const cx = (i) => m.l + bw * i + bw / 2;
  const w = Math.max(4, Math.min(46, bw * 0.56));
  const passo = W < 560 ? Math.ceil(n / 6) : Math.ceil(n / 16);
  const barra = (de, ate, cor, chave) =>
    Math.abs(ate - de) < 0.5 ? null : <rect key={chave} x={-w / 2} y={Math.min(y(de), y(ate))} width={w} height={Math.max(1, Math.abs(y(ate) - y(de)))} fill={cor} />;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Entradas e saídas realizadas e em aberto, e o resultado, mês a mês">
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
            {barra(0, x.eR, COR.entrada, 'eR')}
            {barra(x.eR, x.eR + x.eA, COR_ABERTO.entrada, 'eA')}
            {barra(0, x.sR, COR.saida, 'sR')}
            {barra(x.sR, x.sR + x.sA, COR_ABERTO.saida, 'sA')}
            {(i % passo === 0 || i === n - 1 || x.atual) && (
              <text x={0} y={H - 10} textAnchor="middle" style={x.atual ? { fill: COR.ink, fontWeight: 600 } : undefined}>
                {x.atual ? `${lbl(x.mes)} · hoje` : lbl(x.mes)}
              </text>
            )}
          </g>
        ))}
        <path d={meses.map((x, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${y(x.res).toFixed(1)}`).join('')} fill="none" stroke={COR.ink} strokeWidth={2} strokeLinejoin="round" />
        {meses.map((x, i) => (
          <circle key={`r${x.mes}`} cx={cx(i)} cy={y(x.res)} r={cursor === i ? 5 : 3.5} fill={x.res >= 0 ? COR.ink : COR.crit} stroke={COR.surface} strokeWidth={1.5} />
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
                ['Entradas realizadas', brl(x.eR)],
                ['Entradas em aberto', brl(x.eA)],
                ['Saídas realizadas', brl(x.sR)],
                ['Saídas em aberto', brl(x.sA)],
                ['Resultado do mês', brl(x.res, true)],
                ['Resultado acumulado', brl(x.acum, true)],
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
