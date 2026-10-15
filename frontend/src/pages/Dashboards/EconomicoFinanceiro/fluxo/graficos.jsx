import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { brl, eixo, lbl, niceTicks, pct } from './modelo';
import { COR, DicaCtx, useDica, useLargura } from './ganchos';

// Gráficos SVG do painel do Fluxo de Caixa (porte dos desenhos do painel do CFO de referência) e a
// dica flutuante (.cfo-tip). Os gráficos medem a largura do quadro e redesenham no tamanho exato.

// ─── Dica ────────────────────────────────────────────────────────────────────────────────────────
export function DicaProvider({ children }) {
  const [dica, setDica] = useState(null);
  const ref = useRef(null);
  const mostrar = useCallback((ev, titulo, linhas = []) => setDica({ titulo, linhas, x: ev.clientX, y: ev.clientY }), []);
  const esconder = useCallback(() => setDica(null), []);
  const valor = useMemo(() => ({ mostrar, esconder }), [mostrar, esconder]); // estável: a dica não redesenha os gráficos
  // Posiciona depois de medir (vira para o outro lado perto da borda da janela).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !dica) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = dica.x + 14;
    let y = dica.y + 14;
    if (x + w > window.innerWidth - 8) x = dica.x - w - 14;
    if (y + h > window.innerHeight - 8) y = dica.y - h - 14;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [dica]);
  return (
    <DicaCtx.Provider value={valor}>
      {children}
      {dica &&
        createPortal(
          <div ref={ref} className="cfo-tip" role="tooltip" style={{ left: -9999, top: -9999 }}>
            <b>{dica.titulo}</b>
            {dica.linhas.map(([k, v]) => (
              <div key={k} className="r">
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>,
          document.body
        )}
    </DicaCtx.Provider>
  );
}

function Grade({ ticks, y, l, r, zero = true }) {
  return ticks.map((v) => (
    <g key={v}>
      <line x1={l} x2={r} y1={y(v)} y2={y(v)} stroke={v === 0 && zero ? COR.ink2 : COR.grid} strokeWidth={1} />
      <text x={l - 8} y={y(v) + 4} textAnchor="end">
        {eixo(v)}
      </text>
    </g>
  ));
}
const caminho = (arr, x, y, a = 0) => arr.map((v, k) => `${k ? 'L' : 'M'}${x(a + k).toFixed(1)},${y(v).toFixed(1)}`).join('');

// ─── Trajetória do caixa ─────────────────────────────────────────────────────────────────────────
export function Trajetoria({ D, sc }) {
  const [ref, W] = useLargura();
  const { mostrar, esconder } = useDica();
  const [cursor, setCursor] = useState(null);
  const meses = [...D.hist, ...D.fut];
  const base = [...D.saldoHist, ...D.saldoFut];
  const scen = [...D.saldoHist, ...sc];
  const nh = D.hist.length;
  const n = meses.length;
  const H = W < 560 ? 260 : 330;
  const m = { l: 58, r: 14, t: 16, b: 30 };
  const todos = [...base, ...scen, D.colchao, 0];
  const ymin = Math.min(0, ...todos);
  const ymax = Math.max(...todos) * 1.06 || 1;
  const x = (i) => m.l + ((W - m.l - m.r) * i) / Math.max(1, n - 1);
  const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - ymin) / (ymax - ymin || 1));
  const xs = Math.max(0, nh - 1);
  const passo = W < 560 ? Math.ceil(n / 7) : Math.ceil(n / 14);
  const igual = sc.every((v, i) => Math.abs(v - D.saldoFut[i]) < 1);
  const mv = Math.min(...sc);
  const mi = sc.indexOf(mv);
  const bi = nh + D.minIdx;
  const rotX = (i) => Math.min(Math.max(x(i), m.l + 40), W - m.r - 40);

  function mover(ev) {
    const r = ev.currentTarget.ownerSVGElement.getBoundingClientRect();
    const px = ((ev.clientX - r.left) * W) / r.width;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / (W - m.l - m.r)) * (n - 1))));
    setCursor(i);
    const linhas =
      i < nh
        ? [['Realizado', brl(base[i])]]
        : [
            ['Orçamento', brl(base[i])],
            ...(igual ? [] : [['Cenário', brl(scen[i])]]),
            ['Resultado do mês', brl(D.resFut[i - nh], true)],
          ];
    mostrar(ev, `Fim de ${lbl(meses[i])}`, linhas);
  }

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Saldo de caixa no fim de cada mês">
        <Grade ticks={niceTicks(ymin, ymax, 5)} y={y} l={m.l} r={W - m.r} />
        <rect x={x(xs)} y={m.t} width={Math.max(0, x(n - 1) - x(xs))} height={H - m.t - m.b} fill={COR.surface2} />
        <text x={x(n - 1) - 6} y={m.t + 12} textAnchor="end">
          PROJETADO
        </text>
        {meses.map((mm, i) =>
          i % passo ? null : (
            <text key={mm} x={x(i)} y={H - 10} textAnchor="middle">
              {lbl(mm)}
            </text>
          )
        )}
        <line x1={m.l} x2={W - m.r} y1={y(D.colchao)} y2={y(D.colchao)} stroke={COR.crit} strokeWidth={1.5} strokeDasharray="2 4" />
        <text x={m.l + 6} y={y(D.colchao) - 6} style={{ fill: COR.critInk }}>
          colchão {eixo(D.colchao)}
        </text>
        {nh > 0 && (
          <>
            <path d={`${caminho(base.slice(0, nh), x, y)}L${x(nh - 1)},${y(ymin)}L${x(0)},${y(ymin)}Z`} fill={COR.entrada} fillOpacity={0.1} />
            <path d={caminho(base.slice(0, nh), x, y)} fill="none" stroke={COR.entrada} strokeWidth={2.5} strokeLinejoin="round" />
          </>
        )}
        <path d={caminho(base.slice(xs), x, y, xs)} fill="none" stroke={COR.entrada} strokeWidth={2} strokeDasharray="6 4" />
        {!igual && <path d={caminho(scen.slice(xs), x, y, xs)} fill="none" stroke={COR.cenario} strokeWidth={2.5} strokeLinejoin="round" />}
        {nh > 0 && (
          <>
            <circle cx={x(nh - 1)} cy={y(base[nh - 1])} r={4.5} fill={COR.entrada} stroke={COR.surface} strokeWidth={2} />
            <text x={rotX(nh - 1)} y={y(base[nh - 1]) - 12} textAnchor="middle" className="val">
              hoje {eixo(base[nh - 1])}
            </text>
          </>
        )}
        <circle cx={x(bi)} cy={y(base[bi])} r={4.5} fill={COR.entrada} stroke={COR.surface} strokeWidth={2} />
        <text x={rotX(bi)} y={y(base[bi]) - 12} textAnchor="middle" className="val">
          {eixo(base[bi])}
        </text>
        {!igual && (
          <>
            <circle cx={x(nh + mi)} cy={y(mv)} r={4.5} fill={COR.cenario} stroke={COR.surface} strokeWidth={2} />
            <text x={rotX(nh + mi)} y={y(mv) + 18} textAnchor="middle" className="val" style={{ fill: COR.cenario }}>
              {eixo(mv)}
            </text>
          </>
        )}
        {cursor !== null && <line x1={x(cursor)} x2={x(cursor)} y1={m.t} y2={H - m.b} stroke={COR.ink2} strokeWidth={1} opacity={0.5} />}
        <rect
          x={m.l}
          y={m.t}
          width={W - m.l - m.r}
          height={H - m.t - m.b}
          fill="transparent"
          onMouseMove={mover}
          onMouseLeave={() => {
            setCursor(null);
            esconder();
          }}
        />
      </svg>
    </div>
  );
}

// ─── Entradas e saídas operacionais ──────────────────────────────────────────────────────────────
export function FluxoOperacional({ D }) {
  const [ref, W] = useLargura();
  const { mostrar, esconder } = useDica();
  const meses = [...D.hist, ...D.fut];
  const ent = [...D.entR, ...D.entP];
  const sai = [...D.saiR, ...D.saiP];
  const liq = ent.map((v, i) => v + sai[i]);
  const nh = D.hist.length;
  const n = ent.length;
  const H = W < 560 ? 240 : 280;
  const m = { l: 58, r: 10, t: 12, b: 28 };
  const ymax = Math.max(1, ...ent, ...liq) * 1.05;
  const ymin = Math.min(-1, ...sai, ...liq) * 1.05;
  const bw = (W - m.l - m.r) / Math.max(1, n);
  const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - ymin) / (ymax - ymin));
  const cx = (i) => m.l + bw * i + bw / 2;
  const w = Math.max(3, Math.min(56, bw * 0.62));
  const passo = W < 560 ? Math.ceil(n / 7) : Math.ceil(n / 16);
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Entradas e saídas operacionais por mês">
        <Grade ticks={niceTicks(ymin, ymax, 5)} y={y} l={m.l} r={W - m.r} />
        {meses.map((mm, i) => {
          const op = i >= nh ? 0.45 : 1;
          return (
            <g key={mm}>
              <rect x={cx(i) - w / 2} y={y(ent[i])} width={w} height={Math.max(0, y(0) - y(ent[i]) - 1)} fill={COR.entrada} fillOpacity={op} rx={2} />
              <rect x={cx(i) - w / 2} y={y(0) + 1} width={w} height={Math.max(0, y(sai[i]) - y(0) - 1)} fill={COR.saida} fillOpacity={op} rx={2} />
              {i % passo === 0 && (
                <text x={cx(i)} y={H - 9} textAnchor="middle">
                  {lbl(mm)}
                </text>
              )}
            </g>
          );
        })}
        <path d={liq.map((v, i) => `${i ? 'L' : 'M'}${cx(i)},${y(v)}`).join('')} fill="none" stroke={COR.ink} strokeWidth={1.5} opacity={0.55} />
        {liq.map((v, i) => (
          <circle key={meses[i]} cx={cx(i)} cy={y(v)} r={4} fill={COR.ink} stroke={COR.surface} strokeWidth={2} />
        ))}
        {nh > 0 && nh < n && (
          <>
            <line x1={m.l + bw * nh} x2={m.l + bw * nh} y1={m.t} y2={H - m.b} stroke={COR.ink2} strokeDasharray="3 3" />
            <text x={m.l + bw * nh + 6} y={m.t + 10}>
              PROJETADO →
            </text>
          </>
        )}
        {meses.map((mm, i) => (
          <rect
            key={`h${mm}`}
            x={m.l + bw * i}
            y={m.t}
            width={bw}
            height={H - m.t - m.b}
            fill="transparent"
            onMouseMove={(ev) =>
              mostrar(ev, `${lbl(mm)} · ${i >= nh ? 'projetado' : 'realizado'}`, [
                ['Entradas', brl(ent[i])],
                ['Saídas', brl(sai[i])],
                ['Líquido', brl(liq[i], true)],
              ])
            }
            onMouseLeave={esconder}
          />
        ))}
      </svg>
    </div>
  );
}

// ─── Barras horizontais (maiores saídas, maiores saldos) ─────────────────────────────────────────
// itens: [{ l, v, c?, titulo, linhas }]; `rotuloGrande`: nomes maiores (e coluna de nomes mais larga).
export function BarrasH({ itens, aria, rotuloGrande = false }) {
  const [ref, W] = useLargura(280);
  const { mostrar, esconder } = useDica();
  const rh = rotuloGrande ? 34 : 30;
  const lw = Math.min(rotuloGrande ? 270 : 190, W * (rotuloGrande ? 0.5 : 0.46)) + 8;
  const mr = 66;
  const H = itens.length * rh + 8;
  const plotW = W - lw - mr;
  const negMax = Math.max(0, ...itens.map((i) => -i.v));
  const posMax = Math.max(0, ...itens.map((i) => i.v));
  const comSinal = negMax > 0 && posMax > 0;
  const zero = comSinal ? lw + plotW * (negMax / (negMax + posMax)) : lw;
  const escala = plotW / Math.max(1, comSinal ? negMax + posMax : Math.max(negMax, posMax));
  const maxc = Math.floor((lw - 12) / (rotuloGrande ? 8 : 7.2));
  return (
    <div className="chart" ref={ref}>
      {!itens.length && <div className="empty">Sem valores no período.</div>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} style={itens.length ? undefined : { display: 'none' }}>
        {itens.map((it, k) => {
          const yy = 4 + k * rh;
          const w = Math.max(2, Math.abs(it.v) * escala);
          const x0 = comSinal ? (it.v >= 0 ? zero : zero - w) : lw;
          const direita = !comSinal || it.v >= 0;
          let tx = direita ? x0 + w + 5 : x0 - 5;
          let ta = direita ? 'start' : 'end';
          if (!direita && x0 - 56 < lw) {
            tx = zero + 5;
            ta = 'start';
          }
          return (
            <g key={`${it.l}${k}`}>
              <text x={0} y={yy + rh / 2 + 5} className={rotuloGrande ? 'lbl lg' : 'lbl'}>
                {it.l.length > maxc ? `${it.l.slice(0, maxc - 1).trim()}…` : it.l}
              </text>
              <rect x={x0} y={yy + 7} width={w} height={rh - 14} rx={2} fill={it.c || (it.v < 0 ? COR.saida : COR.entrada)} />
              <text x={tx} y={yy + rh / 2 + 4} textAnchor={ta} className="val">
                {eixo(it.v)}
              </text>
              <rect x={0} y={yy} width={W} height={rh} fill="transparent" onMouseMove={(ev) => mostrar(ev, it.titulo, it.linhas)} onMouseLeave={esconder} />
            </g>
          );
        })}
        {comSinal && <line x1={zero} x2={zero} y1={0} y2={H} stroke={COR.ink2} />}
      </svg>
    </div>
  );
}

// ─── Saldo devedor PJ de uma obra ────────────────────────────────────────────────────────────────
export function DividaObra({ c }) {
  const [ref, W] = useLargura(260);
  const { mostrar, esconder } = useDica();
  const H = 170;
  const m = { l: 52, r: 12, t: 12, b: 26 };
  const rows = c.rows;
  const n = rows.length;
  const ymax = Math.max(c.p.teto || 0, ...rows.map((r) => r.saldo)) * 1.05 || 1;
  const x = (i) => m.l + ((W - m.l - m.r) * i) / Math.max(1, n - 1);
  const y = (v) => m.t + (H - m.t - m.b) * (1 - v / ymax);
  const d = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(r.saldo)}`).join('');
  const iNow = Math.max(0, rows.indexOf(c.now));
  const w = (W - m.l - m.r) / Math.max(1, n - 1);
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Saldo devedor PJ de ${c.nome}`}>
        <Grade ticks={niceTicks(0, ymax, 4)} y={y} l={m.l} r={W - m.r} zero={false} />
        {c.p.teto > 0 && (
          <>
            <line x1={m.l} x2={W - m.r} y1={y(c.p.teto)} y2={y(c.p.teto)} stroke={COR.muted} strokeDasharray="4 4" />
            <text x={W - m.r} y={y(c.p.teto) - 5} textAnchor="end">
              teto {eixo(c.p.teto)}
            </text>
          </>
        )}
        <path d={`${d}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={COR.entrada} fillOpacity={0.14} />
        <path d={d} fill="none" stroke={COR.entrada} strokeWidth={2} />
        <line x1={x(iNow)} x2={x(iNow)} y1={m.t} y2={H - m.b} stroke={COR.ink2} strokeDasharray="3 3" />
        {[...new Set([0, iNow, n - 1])].map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {lbl(rows[i].mes)}
          </text>
        ))}
        {[...new Set([iNow, n - 1])].map((i) => (
          <g key={`p${i}`}>
            <circle cx={x(i)} cy={y(rows[i].saldo)} r={4} fill={COR.entrada} stroke={COR.surface} strokeWidth={2} />
            <text x={x(i) - 6} y={y(rows[i].saldo) - 8} textAnchor="end" className="val">
              {eixo(rows[i].saldo)}
            </text>
          </g>
        ))}
        {rows.map((r, i) => (
          <rect
            key={r.mes}
            x={x(i) - w / 2}
            y={m.t}
            width={w}
            height={H - m.t - m.b}
            fill="transparent"
            onMouseMove={(ev) =>
              mostrar(ev, `${lbl(r.mes)} · obra ${pct(r.obra)}`, [
                ['Saldo devedor', brl(r.saldo)],
                ['Crédito PJ', brl(r.credito)],
                ['Juros', brl(-r.juros)],
                ['Amortização', brl(-r.amort)],
                ['Novo registro', brl(r.novo_registro)],
              ])
            }
            onMouseLeave={esconder}
          />
        ))}
      </svg>
    </div>
  );
}
