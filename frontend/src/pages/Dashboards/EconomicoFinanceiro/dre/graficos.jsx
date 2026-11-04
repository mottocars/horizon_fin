import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { brl, eixo, lbl, niceTicks, pct } from '../fluxo/modelo';
import { COR, useDica, useLargura } from '../fluxo/ganchos';

// Gráficos SVG do painel da Demonstração do Resultado (mesma identidade dos do Fluxo de Caixa: medem a
// largura do quadro e redesenham no tamanho exato; dica flutuante do DicaProvider do painel).

const VERDE = '#2e9d55';
// Destinos da receita (na ordem da DRE): tons quentes, um por grupo.
const TONS_USO = ['#e34948', '#eb6834', '#d9822b', '#b5527a', '#8e5bb5', '#5f6b75', '#c2410c', '#9f1239'];
const pctDe = (v, total) => (total ? pct((v / total) * 100) : '–');

// Cor de cada destino da receita (coluna 2 do Sankey) — a faixa "De cada R$ 100" usa as mesmas.
export function coresDestinos(F) {
  let i = 0;
  return new Map((F?.col2 || []).map((n) => [n.id, n.tipo === 'lucro' ? VERDE : TONS_USO[i++ % TONS_USO.length]]));
}

// Rótulo do bloco: cabe pela distância até o centro dos vizinhos na coluna (os rótulos são centrados no
// bloco) — nome e valor com 30 px, só o nome com 14 px.
function Rotulo({ x, y, espaco, ancora, nome, valor, forte }) {
  if (espaco < 14) return null;
  const duas = espaco >= 30 && valor;
  return (
    <text x={x} y={y} textAnchor={ancora} className="sk-lbl" dominantBaseline="middle">
      <tspan x={x} dy={duas ? '-0.55em' : 0} className={forte ? 'sk-nome forte' : 'sk-nome'}>
        {nome}
      </tspan>
      {duas && (
        <tspan x={x} dy="1.25em" className="sk-val">
          {valor}
        </tspan>
      )}
    </text>
  );
}

// ─── Fluxo da receita (Sankey) ───────────────────────────────────────────────────────────────────
// F = fluxoDaReceita(D). Colunas: 0 fontes → 1 total → 2 destinos (grupos + resultado) → 3 detalhe.
export function Sankey({ F }) {
  const [ref, W] = useLargura(560);
  const { mostrar, esconder } = useDica();
  const [foco, setFoco] = useState(null);
  const L = useMemo(() => layout(F, W), [F, W]);
  if (!L) return <div className="empty">Sem receita no período.</div>;
  const { H, nos, links, x, nw } = L;
  const total = F.entradas;
  const valorRot = (n) => `${brl(n.valor)} · ${pctDe(n.valor, total)}`;
  const ativo = (lk) => !foco || lk.de === foco || lk.para === foco;

  const dicaNo = (ev, n) =>
    mostrar(ev, n.rotulo, [
      ['Valor', brl(n.valor)],
      ['Das entradas', pctDe(n.valor, total)],
      ...(n.grupo && n.grupo !== n.rotulo ? [['Grupo', n.grupo]] : []),
      ...((n.itens || []).slice(0, 6).map((i) => [i.rotulo, brl(i.valor)])),
    ]);

  return (
    <div className="chart sankey" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Para onde foi a receita do período">
        {links.map((lk) => (
          <path
            key={`${lk.de}>${lk.para}`}
            d={lk.d}
            fill={lk.cor}
            fillOpacity={ativo(lk) ? (foco ? 0.42 : 0.2) : 0.06}
            onMouseMove={(ev) =>
              mostrar(ev, `${lk.rotuloDe} → ${lk.rotuloPara}`, [
                ['Valor', brl(lk.valor)],
                ['Das entradas', pctDe(lk.valor, total)],
              ])
            }
            onMouseLeave={esconder}
          />
        ))}
        {nos.map((n) => (
          <g key={n.id}>
            <rect
              x={x[n.col]}
              y={n.y}
              width={nw}
              height={Math.max(1, n.h)}
              rx={2}
              fill={n.cor}
              onMouseMove={(ev) => {
                setFoco(n.id);
                dicaNo(ev, n);
              }}
              onMouseLeave={() => {
                setFoco(null);
                esconder();
              }}
              style={{ cursor: 'default' }}
            />
            {n.col === 0 && <Rotulo x={x[0] + nw + 8} y={n.y + n.h / 2} espaco={n.espaco} ancora="start" nome={n.rotulo} valor={valorRot(n)} forte={n.tipo === 'prejuizo'} />}
            {n.col === 1 && <Rotulo x={x[1] + nw + 8} y={n.y + n.h / 2} espaco={n.espaco} ancora="start" nome={n.rotulo} valor={`${brl(n.valor)} · 100%`} forte />}
            {n.col >= 2 && <Rotulo x={x[n.col] - 8} y={n.y + n.h / 2} espaco={n.espaco} ancora="end" nome={n.rotulo} valor={valorRot(n)} forte={n.tipo === 'lucro'} />}
          </g>
        ))}
      </svg>
    </div>
  );
}

// Escala ampliada (como a referência): cada coluna ocupa a altura toda e todo bloco tem uma altura mínima,
// para as linhas pequenas aparecerem e terem rótulo. As faixas mantêm a proporção dentro de cada bloco
// (a largura numa ponta é a fatia do bloco de origem; na outra, a do bloco de destino).
const ALTURA_MIN = 10;
function alturas(lista, util, g) {
  const total = lista.reduce((s, n) => s + n.valor, 0) || 1;
  const livre = util - g * (lista.length - 1);
  let pequenos = new Set();
  let k = livre / total;
  for (let volta = 0; volta < 6; volta++) {
    const grandes = lista.filter((n) => !pequenos.has(n));
    const somaGrandes = grandes.reduce((s, n) => s + n.valor, 0) || 1;
    k = Math.max(0, livre - ALTURA_MIN * pequenos.size) / somaGrandes;
    const novos = new Set(lista.filter((n) => n.valor * k < ALTURA_MIN));
    if (novos.size === pequenos.size) break;
    pequenos = novos;
  }
  return lista.map((n) => Math.max(ALTURA_MIN, n.valor * k));
}

function layout(F, W) {
  if (!F) return null;
  const nw = 12;
  const m = { t: 6, b: 6 };
  const temDetalhe = F.col3.length > 0;
  const x = temDetalhe ? [4, W * 0.27, W * 0.6, W - nw - 4] : [4, W * 0.36, W - nw - 4, W - nw - 4];
  const gap = (n) => (n > 9 ? 7 : 12);
  const maxN = Math.max(F.col0.length, F.col2.length, F.col3.length, 1);
  const H = Math.max(420, Math.min(780, 80 + maxN * 40));
  const util = H - m.t - m.b;

  const empilhar = (lista, col) => {
    const g = gap(lista.length);
    const hs = alturas(lista, util, g);
    let y = m.t;
    return lista.map((n, i) => {
      const no = { ...n, col, y, h: hs[i], espaco: hs[i] + (i < lista.length - 1 ? g : m.b) };
      y += hs[i] + g;
      return no;
    });
  };

  const cor0 = (n) => (n.tipo === 'prejuizo' ? COR.crit : n.receita ? COR.entrada : '#7fb0ea');
  const col0 = empilhar(F.col0, 0).map((n) => ({ ...n, cor: cor0(n) }));
  const centro = { ...F.centro, col: 1, y: m.t, h: util, espaco: util, cor: COR.accent };
  const cores = coresDestinos(F);
  const col2 = empilhar(F.col2, 2).map((n) => ({ ...n, cor: cores.get(n.id) }));
  // Detalhe ao lado do grupo (como a referência): cada bloco centrado no pai; se encostar no anterior,
  // desce; se passar do fim, sobe. A coluna usa só a altura que precisa (assim dá para alinhar).
  const col3 = [];
  if (temDetalhe) {
    const g = gap(F.col3.length);
    const pais = col2.filter((p) => F.col3.some((c) => c.pai === p.id));
    const alvo = Math.min(util, Math.max(F.col3.length * (ALTURA_MIN + g + 8), pais.reduce((s, p) => s + p.h, 0) * 2.4));
    const hs = alturas(F.col3, alvo, g);
    const blocos = pais.map((p) => {
      const filhos = F.col3.map((c, i) => ({ c, h: hs[i] })).filter((x) => x.c.pai === p.id);
      const altura = filhos.reduce((s, x) => s + x.h, 0) + g * (filhos.length - 1);
      return { p, filhos, altura, y: p.y + p.h / 2 - altura / 2 };
    });
    let fim = m.t - g;
    blocos.forEach((b) => {
      b.y = Math.max(b.y, fim + g);
      fim = b.y + b.altura;
    });
    let limite = H - m.b;
    [...blocos].reverse().forEach((b) => {
      if (b.y + b.altura > limite) b.y = limite - b.altura;
      limite = b.y - g;
    });
    blocos.forEach((b) => {
      let y = Math.max(m.t, b.y);
      b.filhos.forEach((x, k) => {
        col3.push({ ...x.c, col: 3, y, h: x.h, espaco: x.h + (k < b.filhos.length - 1 ? g : g + 4), cor: b.p.cor, grupo: b.p.rotulo });
        y += x.h + g;
      });
    });
  }

  // Faixas: a saída de cada bloco empilhada na ordem dos destinos; a chegada, na ordem das origens.
  const links = [];
  const saida = new Map();
  const chegada = new Map();
  const faixa = (a, b, valor, cor) => {
    const wA = (valor / a.valor) * a.h;
    const wB = (valor / b.valor) * b.h;
    const yA = a.y + (saida.get(a.id) || 0);
    const yB = b.y + (chegada.get(b.id) || 0);
    saida.set(a.id, (saida.get(a.id) || 0) + wA);
    chegada.set(b.id, (chegada.get(b.id) || 0) + wB);
    const x0 = x[a.col] + nw;
    const x1 = x[b.col];
    const xm = (x0 + x1) / 2;
    links.push({
      de: a.id,
      para: b.id,
      rotuloDe: a.rotulo,
      rotuloPara: b.rotulo,
      valor,
      cor,
      d: `M${x0},${yA}C${xm},${yA} ${xm},${yB} ${x1},${yB}L${x1},${yB + wB}C${xm},${yB + wB} ${xm},${yA + wA} ${x0},${yA + wA}Z`,
    });
  };
  col0.forEach((n) => faixa(n, centro, n.valor, n.cor));
  col2.forEach((n) => faixa(centro, n, n.valor, n.cor));
  col3.forEach((c) => {
    const p = col2.find((q) => q.id === c.pai);
    if (p) faixa(p, c, c.valor, p.cor);
  });

  // Espaço de cada rótulo: a menor distância entre o centro do bloco e o dos vizinhos (ou a borda × 2).
  [col0, col2, col3].forEach((col) => {
    const ord = [...col].sort((a, b) => a.y - b.y);
    ord.forEach((n, i) => {
      const c = n.y + n.h / 2;
      // Nas pontas o rótulo pode passar um pouco da borda (o SVG não corta).
      const antes = i > 0 ? c - (ord[i - 1].y + ord[i - 1].h / 2) : (c - m.t) * 2 + 12;
      const depois = i < ord.length - 1 ? ord[i + 1].y + ord[i + 1].h / 2 - c : (H - m.b - c) * 2 + 12;
      n.espaco = Math.min(antes, depois);
      // O resultado (lucro ou prejuízo) sempre tem nome.
      if (n.tipo === 'lucro' || n.tipo === 'prejuizo') n.espaco = Math.max(n.espaco, 14);
    });
  });

  return { H, nos: [...col0, centro, ...col2, ...col3], links, x, nw };
}

// ─── Ponte do resultado (cascata) ────────────────────────────────────────────────────────────────
// Do resultado realizado ao do cenário: cada alavanca sobe (verde) ou desce (vermelho) a partir de onde a
// anterior parou. Ocupa a altura que sobra na coluna (até o pé do simulador ao lado): o quadro .ponte
// cresce no flex e o SVG, absoluto, é redesenhado na altura medida.
function useAltura(minimo) {
  const ref = useRef(null);
  const [altura, setAltura] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setAltura(el.clientHeight);
    const ro = new ResizeObserver(() => setAltura(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, Math.max(minimo, altura)];
}

export function Ponte({ base, contrib, cen, rotuloBase, rotuloCen }) {
  const [ref, W] = useLargura(360);
  const [refAltura, alturaQuadro] = useAltura(250);
  const { mostrar, esconder } = useDica();
  const barras = [{ rotulo: rotuloBase, total: true, de: 0, ate: base }];
  let acc = base;
  contrib.forEach((c) => {
    barras.push({ rotulo: c.rotulo, de: acc, ate: acc + c.valor, valor: c.valor });
    acc += c.valor;
  });
  barras.push({ rotulo: rotuloCen, total: true, de: 0, ate: cen });
  const H = alturaQuadro;
  const m = { l: 58, r: 10, t: 22, b: 46 };
  const vals = barras.flatMap((b) => [b.de, b.ate]);
  const ymin = Math.min(0, ...vals);
  const ymax = Math.max(0, ...vals) * 1.08 || 1;
  const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - ymin) / (ymax - ymin || 1));
  const bw = (W - m.l - m.r) / barras.length;
  const w = Math.min(64, bw * 0.62);
  const quebra = (s) => {
    const p = s.split(' ');
    if (s.length <= 16 || p.length < 2) return [s];
    const meio = Math.ceil(p.length / 2);
    return [p.slice(0, meio).join(' '), p.slice(meio).join(' ')];
  };
  const quadro = (el) => {
    ref.current = el;
    refAltura.current = el;
  };
  return (
    <div className="chart ponte" ref={quadro}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ponte do resultado: realizado até o cenário">
        {niceTicks(ymin, ymax, 4).map((v, i) => (
          <g key={`${v}-${i}`}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? COR.ink2 : COR.grid} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end">
              {eixo(v)}
            </text>
          </g>
        ))}
        {barras.map((b, i) => {
          const cx = m.l + bw * i + bw / 2;
          const topo = Math.min(y(b.de), y(b.ate));
          const alt = Math.max(1.5, Math.abs(y(b.de) - y(b.ate)));
          const cor = b.total ? (b.ate >= 0 ? COR.accent : COR.crit) : b.valor >= 0 ? VERDE : COR.saida;
          const linhas = quebra(b.rotulo);
          return (
            <g key={b.rotulo + i}>
              {i > 0 && <line x1={cx - bw + w / 2} x2={cx - w / 2} y1={y(barras[i - 1].ate)} y2={y(barras[i - 1].ate)} stroke={COR.neutro} strokeDasharray="2 3" />}
              <rect
                x={cx - w / 2}
                y={topo}
                width={w}
                height={alt}
                rx={2}
                fill={cor}
                fillOpacity={b.total ? 1 : 0.85}
                onMouseMove={(ev) => mostrar(ev, b.rotulo, b.total ? [['Resultado', brl(b.ate)]] : [['Efeito', brl(b.valor, true)], ['Depois dele', brl(b.ate)]])}
                onMouseLeave={esconder}
              />
              <text x={cx} y={topo - 6} textAnchor="middle" className="val">
                {b.total ? eixo(b.ate) : `${b.valor > 0 ? '+' : ''}${eixo(b.valor)}`}
              </text>
              {linhas.map((t, k) => (
                <text key={t} x={cx} y={H - m.b + 16 + k * 13} textAnchor="middle" style={b.total ? { fill: COR.ink, fontWeight: 600 } : undefined}>
                  {t}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Resultado mês a mês ─────────────────────────────────────────────────────────────────────────
// Barras: Receita Líquida (azul) e Lucro Bruto (verde); pontos: o resultado do mês; traço cinza: a Receita
// Líquida do mesmo mês do ano anterior.
export function ResultadoMensal({ D }) {
  const [ref, W] = useLargura();
  const { mostrar, esconder } = useDica();
  const itens = D.meses;
  const n = itens.length;
  const H = W < 560 ? 250 : 300;
  const m = { l: 58, r: 10, t: 14, b: 28 };
  const vals = itens.flatMap((it) => [it.rl ?? 0, it.lb ?? 0, it.ll ?? 0, it.ant?.rl ?? 0]);
  const ymax = Math.max(1, ...vals) * 1.08;
  const ymin = Math.min(0, ...vals) * 1.08;
  const y = (v) => m.t + (H - m.t - m.b) * (1 - (v - ymin) / (ymax - ymin || 1));
  const bw = (W - m.l - m.r) / Math.max(1, n);
  const cx = (i) => m.l + bw * i + bw / 2;
  const w = Math.max(3, Math.min(26, bw * 0.3));
  const passo = W < 560 ? Math.ceil(n / 6) : Math.ceil(n / 14);
  const anoAnt = D.meta.anterior.de.slice(0, 4);
  const barra = (v, x0, cor, op = 1) =>
    v === null ? null : <rect x={x0} y={Math.min(y(0), y(v))} width={w} height={Math.max(1, Math.abs(y(v) - y(0)))} rx={2} fill={cor} fillOpacity={op} />;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Resultado mês a mês">
        {niceTicks(ymin, ymax, 5).map((v, i) => (
          <g key={`${v}-${i}`}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? COR.ink2 : COR.grid} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end">
              {eixo(v)}
            </text>
          </g>
        ))}
        {itens.map((it, i) => (
          <g key={it.mes}>
            {barra(it.rl, cx(i) - w - 1, COR.entrada)}
            {barra(it.lb, cx(i) + 1, VERDE, 0.9)}
            {it.ant?.rl !== null && it.ant?.rl !== undefined && (
              <line x1={cx(i) - w - 4} x2={cx(i) - 1 + 3} y1={y(it.ant.rl)} y2={y(it.ant.rl)} stroke={COR.ink2} strokeWidth={2} strokeDasharray="3 2" />
            )}
            {i % passo === 0 && (
              <text x={cx(i)} y={H - 9} textAnchor="middle">
                {lbl(it.mes)}
              </text>
            )}
          </g>
        ))}
        <path d={itens.map((it, i) => `${i ? 'L' : 'M'}${cx(i)},${y(it.ll ?? 0)}`).join('')} fill="none" stroke={COR.ink} strokeWidth={1.5} opacity={0.55} />
        {itens.map((it, i) => (
          <circle key={`p${it.mes}`} cx={cx(i)} cy={y(it.ll ?? 0)} r={4} fill={(it.ll ?? 0) >= 0 ? COR.ink : COR.crit} stroke={COR.surface} strokeWidth={2} />
        ))}
        {itens.map((it, i) => (
          <rect
            key={`h${it.mes}`}
            x={m.l + bw * i}
            y={m.t}
            width={bw}
            height={H - m.t - m.b}
            fill="transparent"
            onMouseMove={(ev) =>
              mostrar(ev, lbl(it.mes), [
                [D.nomes.rl, brl(it.rl)],
                [D.nomes.lb, brl(it.lb)],
                ['Margem bruta', it.mb === null ? '–' : pct(it.mb * 100)],
                ...(D.k.ebitda ? [[D.nomes.eb, brl(it.eb)]] : []),
                [D.nomes.ll, brl(it.ll, true)],
                ...(it.ant ? [[`${D.nomes.rl} ${anoAnt}`, brl(it.ant.rl)]] : []),
              ])
            }
            onMouseLeave={esconder}
          />
        ))}
      </svg>
    </div>
  );
}

// ─── Evolução da POC de uma obra ─────────────────────────────────────────────────────────────────
// Obra executada (POC de Receita) e fração vendida líquida, no fim de cada mês do período.
export function EvolucaoPoc({ obra }) {
  const [ref, W] = useLargura(300);
  const { mostrar, esconder } = useDica();
  const meses = obra.meses || [];
  const n = meses.length;
  const H = 190;
  const m = { l: 40, r: 12, t: 12, b: 24 };
  const x = (i) => m.l + ((W - m.l - m.r) * i) / Math.max(1, n - 1);
  const y = (f) => m.t + (H - m.t - m.b) * (1 - Math.min(1.05, Math.max(0, f ?? 0)) / 1.05);
  const pocR = meses.map((mm) => mm.poc_receita?.poc ?? null);
  const vend = meses.map((mm) => mm.poc_despesa?.liquida ?? null);
  const linha = (arr) => arr.map((v, i) => (v === null ? '' : `${i && arr[i - 1] !== null ? 'L' : 'M'}${x(i)},${y(v)}`)).join('');
  const passo = Math.ceil(n / 8);
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolução da POC de ${obra.nome}`}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={m.l} x2={W - m.r} y1={y(f)} y2={y(f)} stroke={f === 0 ? COR.ink2 : COR.grid} />
            <text x={m.l - 6} y={y(f) + 4} textAnchor="end">
              {f * 100}%
            </text>
          </g>
        ))}
        <path d={linha(vend)} fill="none" stroke={COR.cenario} strokeWidth={2.2} />
        <path d={linha(pocR)} fill="none" stroke={COR.entrada} strokeWidth={2.5} />
        {meses.map((mm, i) => (
          <g key={mm.mes}>
            {pocR[i] !== null && <circle cx={x(i)} cy={y(pocR[i])} r={3} fill={COR.entrada} />}
            {vend[i] !== null && <circle cx={x(i)} cy={y(vend[i])} r={3} fill={COR.cenario} />}
            {(i % passo === 0 || i === n - 1) && (
              <text x={x(i)} y={H - 7} textAnchor="middle">
                {lbl(mm.mes)}
              </text>
            )}
            <rect
              x={x(i) - (W - m.l - m.r) / Math.max(1, n - 1) / 2}
              y={m.t}
              width={(W - m.l - m.r) / Math.max(1, n - 1)}
              height={H - m.t - m.b}
              fill="transparent"
              onMouseMove={(ev) =>
                mostrar(ev, `${obra.nome} · fim de ${lbl(mm.mes)}`, [
                  ['Obra executada', pocR[i] === null ? '–' : pct(pocR[i] * 100)],
                  ['Vendido (líquido)', vend[i] === null ? '–' : pct(vend[i] * 100)],
                  ['Unidades vendidas', `${mm.unidades?.vendidas.qtd ?? '–'} de ${mm.unidades?.total.qtd ?? '–'}`],
                ])
              }
              onMouseLeave={esconder}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
