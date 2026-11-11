import { useEffect, useMemo, useState } from 'react';
import { listAvancosDfc } from '../../../api/dfcAvancos.api';
import { lbl, pct } from '../EconomicoFinanceiro/fluxo/modelo';
import { COR, useDica, useLargura } from '../EconomicoFinanceiro/fluxo/ganchos';

// Obra 360º › Avanço das Obras: "Curva de avanço por obra" (pedido do usuário) — um cartão por obra
// com Prevision, no molde da "Dívida PJ da Caixa por obra" do Fluxo de Caixa (.cefs/.cef/.kv/.chart do
// painel.css): números-chave e a curva S da obra inteira, mês a mês — previsto (Prevision, área azul) ×
// realizado (Caixa/PLS, linha escura, até o último mês liberado no DCD). Os mesmos dados da tabela
// (/dfc-avancos), pedidos numa janela larga para pegar a obra do começo ao fim — 5 anos para trás e 4
// para a frente (o servidor aceita até 10 anos; o acumulado já soma tudo o que veio antes, então
// qualquer janela dá o mesmo valor em cada mês).
const ANO = new Date().getFullYear();
// Todas as obras (Tipo = Obra), não só as com "Projeta DFC": toda obra com Prevision tem curva.
const JANELA = { inicio: `${ANO - 5}-01-01`, fim: `${ANO + 4}-12-31`, todasObras: true };
const vazio = (v) => v === null || v === undefined;
const pp = (v) => (vazio(v) ? '–' : `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pp`);

// Recorte da curva: do mês antes do primeiro avanço previsto até o mês em que o previsto chega a 100%
// (ou para de mudar) — e o mês atual, se cair fora disso.
function montarCurva(obra, meses, mesAtual) {
  const prev = obra.prevision;
  const iniPrev = meses.findIndex((m) => (prev[m] || 0) > 0);
  if (iniPrev < 0) return null;
  const final = prev[meses[meses.length - 1]];
  let fim = meses.findIndex((m) => prev[m] >= 99.95);
  if (fim < 0) {
    fim = iniPrev;
    meses.forEach((m, i) => {
      if (Math.abs((prev[m] || 0) - final) > 0.005) fim = i + 1;
    });
  }
  const iAtual = meses.indexOf(mesAtual);
  const a = Math.min(Math.max(0, iniPrev - 1), iAtual >= 0 ? iAtual : Infinity);
  const b = Math.min(meses.length - 1, Math.max(fim, iAtual));
  const recorte = meses.slice(a, b + 1);
  const ultimoLib = obra.ultimo_mes_liberado || null;
  const temCaixa = Boolean(obra.pls && ultimoLib);
  const rows = recorte.map((m) => ({
    mes: m,
    previsto: prev[m] ?? 0,
    // Realizado só até o último mês liberado (depois disso a Caixa não informou nada novo).
    realizado: temCaixa && m <= ultimoLib && m <= mesAtual ? obra.pls[m] : null,
  }));
  const mesRef = temCaixa ? (ultimoLib < mesAtual ? ultimoLib : mesAtual) : null;
  const anterior = recorte[recorte.indexOf(mesAtual) - 1];
  return {
    id: obra.sienge_id,
    nome: obra.name,
    rows,
    mesAtual,
    temCaixa,
    previstoHoje: prev[mesAtual] ?? null,
    previstoMes: anterior ? (prev[mesAtual] ?? 0) - (prev[anterior] ?? 0) : null,
    mesRef,
    realizado: mesRef ? obra.pls[mesRef] : null,
    desvio: mesRef && !vazio(obra.pls[mesRef]) ? obra.pls[mesRef] - (prev[mesRef] ?? 0) : null,
    inicio: meses[iniPrev],
    termino: meses.find((m) => prev[m] >= 99.95) || null,
  };
}

function CurvaObra({ c }) {
  const [ref, W] = useLargura(260);
  const { mostrar, esconder } = useDica();
  const H = 170;
  const m = { l: 40, r: 12, t: 12, b: 26 };
  const { rows } = c;
  const n = rows.length;
  const x = (i) => m.l + ((W - m.l - m.r) * i) / Math.max(1, n - 1);
  const y = (v) => m.t + (H - m.t - m.b) * (1 - v / 100);
  const w = (W - m.l - m.r) / Math.max(1, n - 1);
  const dPrev = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(r.previsto)}`).join('');
  const comReal = rows.map((r, i) => [r, i]).filter(([r]) => !vazio(r.realizado));
  const dReal = comReal.map(([r, i], k) => `${k ? 'L' : 'M'}${x(i)},${y(r.realizado)}`).join('');
  const iNow = rows.findIndex((r) => r.mes === c.mesAtual);
  const ultReal = comReal[comReal.length - 1];
  // Meses no eixo: o primeiro, o atual e o último — o atual some se encostar num dos outros dois.
  const marcas = [0, n - 1];
  if (iNow > 0 && iNow < n - 1 && x(iNow) - x(0) > 56 && x(n - 1) - x(iNow) > 56) marcas.splice(1, 0, iNow);
  // Valor do realizado: à esquerda do ponto; perto do eixo, à direita.
  const realEsq = ultReal && x(ultReal[1]) - m.l > 50;
  // Valor do previsto de hoje: à direita do ponto; perto da borda direita (obra já no fim), à esquerda.
  const prevDir = iNow >= 0 && W - m.r - x(iNow) > 50;
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Curva de avanço de ${c.nome}`}>
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={COR.grid} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end">
              {v}%
            </text>
          </g>
        ))}
        <path d={`${dPrev}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={COR.entrada} fillOpacity={0.14} />
        <path d={dPrev} fill="none" stroke={COR.entrada} strokeWidth={2} />
        {dReal && <path d={dReal} fill="none" stroke={COR.ink} strokeWidth={2} />}
        {iNow >= 0 && <line x1={x(iNow)} x2={x(iNow)} y1={m.t} y2={H - m.b} stroke={COR.ink2} strokeDasharray="3 3" />}
        {[...new Set(marcas)].map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {lbl(rows[i].mes)}
          </text>
        ))}
        {iNow >= 0 && (
          <g>
            <circle cx={x(iNow)} cy={y(rows[iNow].previsto)} r={4} fill={COR.entrada} stroke={COR.surface} strokeWidth={2} />
            <text x={x(iNow) + (prevDir ? 6 : -6)} y={y(rows[iNow].previsto) - 8} textAnchor={prevDir ? 'start' : 'end'} className="val">
              {pct(rows[iNow].previsto)}
            </text>
          </g>
        )}
        {ultReal && (
          <g>
            <circle cx={x(ultReal[1])} cy={y(ultReal[0].realizado)} r={4} fill={COR.ink} stroke={COR.surface} strokeWidth={2} />
            <text
              x={x(ultReal[1]) + (realEsq ? -6 : 6)}
              y={y(ultReal[0].realizado) + (realEsq ? 16 : -8)}
              textAnchor={realEsq ? 'end' : 'start'}
              className="val"
            >
              {pct(ultReal[0].realizado)}
            </text>
          </g>
        )}
        {rows.map((r, i) => (
          <rect
            key={r.mes}
            x={x(i) - w / 2}
            y={m.t}
            width={w}
            height={H - m.t - m.b}
            fill="transparent"
            onMouseMove={(ev) =>
              mostrar(ev, lbl(r.mes), [
                ['Previsto (Prevision)', pct(r.previsto)],
                ...(vazio(r.realizado) ? [] : [['Realizado (Caixa)', pct(r.realizado)], ['Desvio', pp(r.realizado - r.previsto)]]),
              ])
            }
            onMouseLeave={esconder}
          />
        ))}
      </svg>
    </div>
  );
}

export default function CurvasAvanco({ empresaId }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!empresaId) return undefined;
    let vivo = true;
    setDados(null);
    setErro('');
    listAvancosDfc(empresaId, JANELA)
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro(e.response?.data?.message || 'Não foi possível carregar as curvas.'));
    return () => {
      vivo = false;
    };
  }, [empresaId]);

  const curvas = useMemo(
    () => (dados ? dados.obras.filter((o) => o.prevision).map((o) => montarCurva(o, dados.meses, dados.mes_atual)).filter(Boolean) : []),
    [dados]
  );

  if (!empresaId) return null;
  return (
    <section className="panel c12" aria-labelledby="h-curvas">
      <div className="ph">
        <h2 id="h-curvas">Curva de avanço por obra</h2>
        <p>
          Avanço acumulado previsto no Prevision (área azul) × realizado na Caixa (linha escura), mês a mês, de cada obra com
          Prevision.
        </p>
      </div>
      {erro ? (
        <div className="empty">{erro}</div>
      ) : !dados ? (
        <div className="empty">Carregando…</div>
      ) : !curvas.length ? (
        <div className="empty">Nenhuma obra com Prevision nesta empresa.</div>
      ) : (
        <div className="cefs">
          {curvas.map((c) => (
            <div key={c.id} className="cef">
              <h3>{c.nome}</h3>
              <div className="kv">
                <div>
                  <span>Previsto {lbl(c.mesAtual)}</span>
                  <strong>{pct(c.previstoHoje)}</strong>
                </div>
                <div>
                  <span>Realizado {c.mesRef ? lbl(c.mesRef) : '(Caixa)'}</span>
                  <strong>{pct(c.realizado)}</strong>
                </div>
                <div>
                  <span>Desvio {c.mesRef ? lbl(c.mesRef) : ''}</span>
                  <strong className={vazio(c.desvio) ? '' : c.desvio < 0 ? 'neg neg-propria' : c.desvio > 0 ? 'pos' : ''}>{pp(c.desvio)}</strong>
                </div>
                <div>
                  <span>Previsto no mês</span>
                  <strong>{pct(c.previstoMes)}</strong>
                </div>
                <div>
                  <span>Início</span>
                  <strong>{lbl(c.inicio)}</strong>
                </div>
                <div>
                  <span>Término previsto</span>
                  <strong>{lbl(c.termino)}</strong>
                </div>
              </div>
              <CurvaObra c={c} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
