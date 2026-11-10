import { useEffect, useId, useRef, useState } from 'react';
import { data as dataBr } from './util';

// Curva de avanço previsto (Prevision) dia a dia, de 0 a 100%, com uma bandeira na data de previsão de
// recebimento mostrando o acumulado previsto naquele dia. Mesmo desenho dos gráficos da Viabilidade
// (SVG em pixels, grade clara, área azul, leitura do dia ao passar o mouse).
// pontos: [{ data 'AAAA-MM-DD', previsto % acumulado }] em ordem de data, um por dia.

const AZUL = '#2563eb';
const BANDEIRA = '#d97706';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const pct = (v) => `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function useLargura() {
  const ref = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Índice do ponto da data (o último dia da curva até ela); -1 antes do início.
export function indiceNaData(pontos, data) {
  if (!data || !pontos.length) return -1;
  let k = -1;
  for (let i = 0; i < pontos.length && pontos[i].data <= data; i++) k = i;
  return k;
}

export default function GraficoAvanco({ pontos, dataPrevisao, altura = 300 }) {
  const [ref, w] = useLargura();
  return (
    <div ref={ref} className="relative w-full" style={{ height: altura }}>
      {w > 0 && pontos.length > 1 && <Svg pontos={pontos} dataPrevisao={dataPrevisao} W={w} H={altura} />}
    </div>
  );
}

function Svg({ pontos, dataPrevisao, W, H }) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState(null);
  const pad = { t: 34, b: 26, l: 44, r: 16 };
  const n = pontos.length;
  const util = W - pad.l - pad.r;
  const x = (i) => pad.l + (i * util) / (n - 1);
  const y = (v) => pad.t + ((100 - v) * (H - pad.t - pad.b)) / 100;

  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.previsto).toFixed(1)}`).join(' ');
  const area = `${linha} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;

  // Rótulos do tempo: o 1º dia de cada mês, espaçados para caber (no máximo ~1 a cada 70 px).
  const inicios = pontos.map((p, i) => (p.data.endsWith('-01') ? i : -1)).filter((i) => i >= 0);
  const passo = Math.max(1, Math.ceil(inicios.length / Math.max(1, Math.floor(util / 70))));
  const marcasX = inicios.filter((_, k) => k % passo === 0);
  const rotuloMes = (iso) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;

  // Bandeira: só quando a data cai dentro da curva.
  const k = indiceNaData(pontos, dataPrevisao);
  const temBandeira = dataPrevisao && k >= 0 && dataPrevisao <= pontos[n - 1].data;
  const bx = temBandeira ? x(k) : 0;
  const by = temBandeira ? y(pontos[k].previsto) : 0;
  const textoBandeira = temBandeira ? `${dataBr(dataPrevisao)} · ${pct(pontos[k].previsto)}` : '';
  const largBandeira = textoBandeira.length * 6.4 + 16;
  const bandeiraADireita = bx + largBandeira < W - pad.r;

  function mover(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / util) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <>
      <svg width={W} height={H} className="block" onMouseMove={mover} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`${id}a`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={AZUL} stopOpacity="0.2" />
            <stop offset="100%" stopColor={AZUL} stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#9ca3af' : '#eef2f7'} />
            <text x={pad.l - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" className="fill-gray-400">
              {v}%
            </text>
          </g>
        ))}
        {marcasX.map((i) => (
          <g key={i}>
            <line x1={x(i)} x2={x(i)} y1={H - pad.b} y2={H - pad.b + 4} stroke="#d1d5db" />
            <text x={x(i)} y={H - 7} textAnchor="middle" fontSize="10.5" className="fill-gray-400">
              {rotuloMes(pontos[i].data)}
            </text>
          </g>
        ))}

        <path d={area} fill={`url(#${id}a)`} />
        <path d={linha} fill="none" stroke={AZUL} strokeWidth="2" strokeLinejoin="round" />

        {temBandeira && (
          <g>
            <line x1={bx} x2={bx} y1={pad.t - 22} y2={H - pad.b} stroke={BANDEIRA} strokeWidth="1.5" strokeDasharray="4 3" />
            <g transform={`translate(${bandeiraADireita ? bx : bx - largBandeira}, ${pad.t - 26})`}>
              <rect width={largBandeira} height="20" rx="4" fill={BANDEIRA} />
              <text x={largBandeira / 2} y="13.5" textAnchor="middle" fontSize="11" fontWeight="600" fill="white">
                {textoBandeira}
              </text>
            </g>
            <circle cx={bx} cy={by} r="5" fill={BANDEIRA} stroke="white" strokeWidth="2" />
          </g>
        )}

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#94a3b8" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(pontos[hover].previsto)} r="4" fill={AZUL} stroke="white" strokeWidth="2" />
          </g>
        )}
        <rect x={pad.l - 4} y={0} width={Math.max(0, util + 8)} height={H} fill="transparent" />
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg bg-gray-900/95 px-2.5 py-1.5 text-[11px] text-white shadow-lg"
          style={{ top: pad.t, ...(x(hover) > W / 2 ? { right: W - x(hover) + 10 } : { left: x(hover) + 10 }) }}
        >
          <span className="block font-semibold">{dataBr(pontos[hover].data)}</span>
          <span className="tabular-nums text-gray-200">Previsto acumulado {pct(pontos[hover].previsto)}</span>
        </div>
      )}
    </>
  );
}
