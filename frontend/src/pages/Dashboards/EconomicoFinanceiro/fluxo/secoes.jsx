import { useMemo, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { BarrasH, DividaObra, FluxoOperacional, Trajetoria } from './graficos';
import { COR, useDica, useSumario } from './ganchos';
import { CFG, PRESETS, brl, cenario, curto, eixo, lbl, media, nf0, obraMaiorEntrada, pct, presetDe, soma, titulo } from './modelo';

// Seções do painel do Fluxo de Caixa, na ordem da especificação do painel do CFO
// (C:\Users\motta\Desktop\layout\Especificação do Painel do CFO — Tostes e Diniz.md).

// "?" ao lado do título: abre o Sumário das análises na aba desta seção.
export function AjudaSecao({ aba, rotulo }) {
  const abrir = useSumario();
  return (
    <button type="button" className="ajuda" onClick={() => abrir(aba)} title="Como ler esta análise" aria-label={`Como ler: ${rotulo}`}>
      <CircleHelp size={15} />
    </button>
  );
}

function Status({ s }) {
  return <span className={`st ${s[0]}`}>{s[1]}</span>;
}
const sev = (crit, aten, ok = 'Ok') => (crit ? ['crit', 'Crítico'] : aten ? ['warn', 'Atenção'] : ['good', ok]);

// ─── Indicadores (8 tiles) ───────────────────────────────────────────────────────────────────────
export function Tiles({ D }) {
  const fco = soma(D.entR) + soma(D.saiR);
  const prox = D.resFut.slice(0, 6);
  const queima = media(prox);
  const fura = D.saldoFut.findIndex((v) => v < D.colchao);
  const dividaHoje = soma(D.cef.map((c) => c.now?.saldo || 0));
  const dividaFim = soma(D.cef.map((c) => c.end?.saldo || 0));
  const rec = D.cart.receber || {};
  const inad = ((rec.vencido || 0) / ((rec.vencido || 0) + (rec.a_vencer || 0))) * 100;
  const maior = D.spes.slice().sort((a, b) => b.caixa - a.caixa)[0];
  const fatia = maior && D.totalContas > 0 ? (maior.caixa / D.totalContas) * 100 : null;
  const tiles = [
    {
      k: 'Caixa hoje',
      v: brl(D.caixaHoje),
      d: D.totalContas ? (
        <>
          <b>{pct((D.invest / D.totalContas) * 100)}</b> aplicado · {D.contas.length} contas
        </>
      ) : (
        'abertura do mês atual'
      ),
      st: D.caixaHoje < D.colchao ? ['crit', 'Abaixo do colchão'] : ['good', 'Líquido'],
    },
    {
      k: 'Mínimo projetado',
      v: brl(D.minBase),
      d: (
        <>
          em <b>{lbl(D.fut[D.minIdx])}</b> · {D.caixaHoje ? pct((D.minBase / D.caixaHoje - 1) * 100, true) : '–'} vs. hoje
        </>
      ),
      st: sev(D.minBase < D.colchao, D.minBase < 2 * D.colchao, 'Confortável'),
    },
    {
      k: `Resultado médio · próximos ${prox.length} ${prox.length === 1 ? 'mês' : 'meses'}`,
      v: brl(queima, true),
      d:
        fura < 0 ? (
          <>
            <b>acima do colchão</b> em todo o horizonte
          </>
        ) : (
          <>
            fura o colchão em <b>{lbl(D.fut[fura])}</b>
          </>
        ),
      st: sev(fura >= 0 && fura < 3, queima < 0, 'Gera caixa'),
    },
    {
      k: `Fluxo operacional · últimos ${D.hist.length} ${D.hist.length === 1 ? 'mês' : 'meses'}`,
      v: D.hist.length ? brl(fco, true) : '–',
      d: (
        <>
          entradas de <b>{brl(soma(D.entR))}</b>
        </>
      ),
      st: !D.hist.length ? ['info', 'Sem histórico'] : fco < 0 ? ['warn', 'Consome caixa'] : ['good', 'Positivo'],
    },
    {
      k: 'Dívida PJ Caixa',
      v: D.cef.length ? brl(dividaHoje) : '–',
      d: D.cef.length ? (
        <>
          vai a <b>{brl(dividaFim)}</b> no fim da projeção · {D.cef.length} obra{D.cef.length > 1 ? 's' : ''}
        </>
      ) : (
        'nenhuma obra com Projeção CEF no escopo'
      ),
      st: D.cef.length ? (dividaFim > dividaHoje * 1.5 ? ['warn', 'Crescente'] : ['info', 'Sob controle']) : ['info', 'Sem dados'],
    },
    {
      k: 'A receber em 90 dias',
      v: brl(rec.d90 || 0),
      d: (
        <>
          carteira a vencer de <b>{brl(rec.a_vencer || 0)}</b>
        </>
      ),
      st: ['info', 'Carteira'],
    },
    {
      k: 'Inadimplência',
      v: pct(inad),
      d: (
        <>
          <b>{brl(rec.vencido || 0)}</b> vencidos em {nf0.format(rec.n_vencido || 0)} parcelas
        </>
      ),
      st: Number.isFinite(inad) ? sev(inad > 8, inad > 3, 'Baixa') : ['info', 'Sem dados'],
    },
    {
      k: 'Maior concentração de caixa',
      v: fatia === null ? '–' : pct(fatia),
      d: maior ? (
        <>
          <b>{curto(maior.nome)}</b> · {brl(maior.caixa)}
        </>
      ) : (
        ''
      ),
      st: sev(false, fatia > 40, 'Distribuído'),
    },
  ];
  return (
    <section className="tiles" aria-label="Indicadores principais">
      {tiles.map((t) => (
        <div key={t.k} className="tile">
          <span className="k">{t.k}</span>
          <span className="v">{t.v}</span>
          <span className="d">{t.d}</span>
          <Status s={t.st} />
        </div>
      ))}
    </section>
  );
}

// ─── Trajetória do caixa + simulador ─────────────────────────────────────────────────────────────
export function Hero({ D, escopo }) {
  const [preset, setPreset] = useState('cons');
  const [sc, setSc] = useState({ ...PRESETS.cons, delayId: null });
  const opcoesAtraso = useMemo(
    () => D.centros.filter((c) => soma(c.entP) > 0).sort((a, b) => soma(b.entP) - soma(a.entP)),
    [D]
  );
  // Obra do "Atrasar entradas de": a escolhida, se ainda está no escopo; senão a de maior entrada.
  const delayId = opcoesAtraso.some((c) => c.id === sc.delayId) ? sc.delayId : (obraMaiorEntrada(D)?.id ?? opcoesAtraso[0]?.id ?? null);
  const atual = { ...sc, delayId };
  const serie = cenario(D, atual);
  const mudar = (patch) => {
    const novo = { ...atual, ...patch };
    setSc(novo);
    setPreset(presetDe(novo));
  };
  const queda = D.caixaHoje ? (D.minBase / D.caixaHoje - 1) * 100 : 0;
  const de = escopo ? `de ${escopo}` : 'consolidado';
  return (
    <section className="panel hero" aria-labelledby="h-traj">
      <div className="ph">
        <h2 id="h-traj">
          {D.minBase < D.caixaHoje
            ? `O caixa ${de} chega a ${brl(D.minBase)} em ${lbl(D.fut[D.minIdx])} (${pct(queda, true)})`
            : `O caixa ${de} cresce no horizonte`}
          <AjudaSecao aba="trajetoria" rotulo="Trajetória do caixa" />
        </h2>
        <p>Saldo no fim de cada mês: realizado, projeção do Orçamento e o cenário escolhido ao lado.</p>
      </div>
      <div className="hero-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div className="legend">
            <span>
              <i style={{ borderColor: COR.entrada }} />
              Realizado
            </span>
            <span>
              <i className="dash" style={{ borderColor: COR.entrada }} />
              Orçamento
            </span>
            <span>
              <i style={{ borderColor: COR.cenario }} />
              {preset ? PRESETS[preset].label : 'Cenário personalizado'}
            </span>
            <span>
              <i className="dash" style={{ borderColor: COR.crit }} />
              Colchão: 1 mês de saídas operacionais
            </span>
          </div>
          <Trajetoria D={D} sc={serie} />
        </div>
        <aside className="sim" aria-label="Simulador de cenário">
          <h3>Simulador de cenário</h3>
          <div className="presets" role="group" aria-label="Cenários prontos">
            {[
              ['base', 'Orçamento'],
              ['cons', 'Conservador'],
              ['stress', 'Estresse'],
            ].map(([k, r]) => (
              <button
                key={k}
                type="button"
                aria-pressed={preset === k}
                onClick={() => {
                  setPreset(k);
                  setSc({ ...PRESETS[k], delayId });
                }}
              >
                {r}
              </button>
            ))}
          </div>
          <label className="opt">
            <input type="checkbox" checked={atual.overhead} onChange={(e) => mudar({ overhead: e.target.checked })} />
            <span>
              <b>Estrutura fixa no ritmo real</b>
              <span>Pessoal e administrativo a {brl(D.overheadRun)}/mês, a média dos últimos meses, quando o Orçamento projeta menos.</span>
            </span>
          </label>
          <div className="range">
            <div className="row">
              <label htmlFor="o-obra">Estouro no custo de obra</label>
              <output>{atual.obra}%</output>
            </div>
            <input id="o-obra" type="range" min="0" max="40" step="5" value={atual.obra} onChange={(e) => mudar({ obra: +e.target.value })} />
          </div>
          <div className="range">
            <div className="row">
              <label htmlFor="o-vendas">Queda na receita de vendas</label>
              <output>{atual.vendas}%</output>
            </div>
            <input id="o-vendas" type="range" min="0" max="40" step="5" value={atual.vendas} onChange={(e) => mudar({ vendas: +e.target.value })} />
          </div>
          <div className="range">
            <div className="row">
              <label htmlFor="o-delay-c">Atrasar entradas de</label>
              <output>
                {atual.delay} {atual.delay === 1 ? 'mês' : 'meses'}
              </output>
            </div>
            <select id="o-delay-c" value={delayId ?? ''} onChange={(e) => mudar({ delayId: +e.target.value || null })}>
              {opcoesAtraso.length ? (
                opcoesAtraso.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))
              ) : (
                <option value="">Sem entradas projetadas</option>
              )}
            </select>
            <input type="range" min="0" max="6" step="1" value={atual.delay} aria-label="Meses de atraso" onChange={(e) => mudar({ delay: +e.target.value })} />
          </div>
        </aside>
      </div>
    </section>
  );
}

// ─── Entradas e saídas operacionais ──────────────────────────────────────────────────────────────
export function EntradasSaidas({ D }) {
  return (
    <section className="panel c12" aria-labelledby="h-flow">
      <div className="ph">
        <h2 id="h-flow">Entradas e saídas operacionais, mês a mês
          <AjudaSecao aba="entradas" rotulo="Entradas e saídas operacionais" />
        </h2>
        <div className="legend">
          <span>
            <i className="box" style={{ background: COR.entrada }} />
            Entradas
          </span>
          <span>
            <i className="box" style={{ background: COR.saida }} />
            Saídas
          </span>
          <span>
            <i className="box" style={{ background: COR.ink, borderRadius: '50%' }} />
            Líquido
          </span>
          <span style={{ color: 'var(--muted)' }}>Barras claras = projetado</span>
        </div>
      </div>
      <FluxoOperacional D={D} />
    </section>
  );
}

// ─── Fôlego de cada SPE sozinha ──────────────────────────────────────────────────────────────────
const SPE_MAX = 12;
function lerPrefSpe() {
  try {
    const sv = JSON.parse(localStorage.getItem('cfo-spe') || '{}');
    return { sort: ['risco', 'caixa', 'nome'].includes(sv.sort) ? sv.sort : 'risco', show: ['todas', 'zeram'].includes(sv.show) ? sv.show : 'todas' };
  } catch {
    return { sort: 'risco', show: 'todas' };
  }
}

function Seg({ rotulo, opcoes, valor, onChange }) {
  return (
    <div className="ctl">
      <span className="rot">{rotulo}</span>
      <div className="seg" role="group" aria-label={rotulo}>
        {opcoes.map(([v, r]) => (
          <button key={v} type="button" aria-pressed={valor === v} onClick={() => onChange(v)}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FolegoSpe({ D, empresaSel, onEmpresa }) {
  const { mostrar, esconder } = useDica();
  const [pref, setPref] = useState(lerPrefSpe);
  const [todas, setTodas] = useState(false);
  const salvar = (p) => {
    setPref(p);
    try {
      localStorage.setItem('cfo-spe', JSON.stringify(p));
    } catch {
      /* sem armazenamento: só não lembra */
    }
  };

  const all = D.spes.map((s) => {
    const mn = Math.min(...s.path);
    return { ...s, min: mn, minIdx: Math.max(0, s.path.indexOf(mn)), drop: s.caixa > 0 ? mn / s.caixa : mn < 0 ? -1 : 1 };
  });
  const zeram = all.filter((s) => s.zera).sort((a, b) => (a.zera < b.zera ? -1 : a.zera > b.zera ? 1 : a.min - b.min));
  const positivo = soma(all.map((s) => Math.max(0, s.caixa)));
  const maior = all.slice().sort((a, b) => b.caixa - a.caixa)[0];
  const porNome = (a, b) => curto(a.nome).localeCompare(curto(b.nome), 'pt-BR', { numeric: true });
  const linhas = all
    .filter((s) => pref.show === 'todas' || s.zera)
    .sort(
      pref.sort === 'caixa'
        ? (a, b) => b.caixa - a.caixa
        : pref.sort === 'nome'
          ? porNome
          : (a, b) => {
              const za = a.zera || '9999';
              const zb = b.zera || '9999';
              return za < zb ? -1 : za > zb ? 1 : a.drop - b.drop || porNome(a, b);
            }
    );
  const vistas = todas ? linhas : linhas.slice(0, SPE_MAX);
  const maxAbs = Math.max(1, ...all.flatMap((s) => [Math.abs(s.caixa), ...s.path.map(Math.abs)]));
  const cel = (v) => {
    if (Math.abs(v) < 1) return { background: 'var(--surface-2)', color: 'var(--muted)' };
    const p = Math.round(14 + 76 * Math.sqrt(Math.min(1, Math.abs(v) / maxAbs)));
    return { background: `color-mix(in srgb, var(${v < 0 ? '--s-out' : '--s-in'}) ${p}%, var(--surface))`, color: p > 52 ? '#fff' : 'var(--ink)' };
  };
  const situacao = (s) =>
    s.zera ? <Status s={['crit', `Zera em ${lbl(s.zera)}`]} /> : s.drop < 0.5 ? <Status s={['warn', `Cai ${pct((1 - s.drop) * 100)}`]} /> : <Status s={['good', 'Cobre']} />;
  const somaPath = D.fut.map((_, i) => soma(all.map((s) => s.path[i])));
  const total = { nome: `Soma das ${all.length} empresas`, centros: ['sem mútuos entre elas'], caixa: soma(all.map((s) => s.caixa)), path: somaPath };
  total.min = Math.min(...somaPath);
  total.minIdx = Math.max(0, somaPath.indexOf(total.min));

  const linha = (s, rodape) => {
    const ir = () => onEmpresa(s.id);
    return (
      <tr
        key={rodape ? 'total' : s.id}
        className={rodape ? '' : `clk${String(empresaSel) === String(s.id) ? ' sel' : ''}`}
        tabIndex={rodape ? undefined : 0}
        onClick={rodape ? undefined : ir}
        onKeyDown={
          rodape
            ? undefined
            : (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  ir();
                }
              }
        }
      >
        <td className="nm">
          <b>{rodape ? s.nome : curto(s.nome)}</b>
          <span title={s.centros.join(', ')}>{s.centros.join(', ') || 'sem centros com fluxo'}</span>
        </td>
        <td className="sit">{rodape ? null : situacao(s)}</td>
        <td className="n">{brl(s.caixa)}</td>
        {s.path.map((v, i) => (
          <td
            key={D.fut[i]}
            className={`c${!rodape && i === s.minIdx && s.min < s.caixa ? ' mn' : ''}`}
            style={cel(v)}
            onMouseMove={(ev) =>
              mostrar(ev, `${rodape ? 'Soma' : curto(s.nome)} · fim de ${lbl(D.fut[i])}`, [
                ['Saldo projetado', brl(v)],
                ...(rodape ? [] : [['Fluxo operacional do mês', brl(s.liq[i], true)]]),
              ])
            }
            onMouseLeave={esconder}
          >
            {eixo(v)}
          </td>
        ))}
        <td className={`n ${s.min < 0 ? 'neg' : ''}`}>
          {brl(s.min)}
          <small>{lbl(D.fut[s.minIdx])}</small>
        </td>
      </tr>
    );
  };

  return (
    <section className="panel c12" aria-labelledby="h-spe">
      <div className="ph">
        <h2 id="h-spe">Fôlego de cada SPE sozinha
          <AjudaSecao aba="folego" rotulo="Fôlego de cada SPE" />
        </h2>
      </div>
      <div className="kv k4">
        <div>
          <span>Empresas no escopo</span>
          <strong>{nf0.format(all.length)}</strong>
        </div>
        <div>
          <span>Zeram no horizonte</span>
          <strong className={zeram.length ? 'neg' : 'pos'}>{zeram.length ? `${zeram.length} de ${all.length}` : 'nenhuma'}</strong>
        </div>
        <div>
          <span>Primeira a zerar</span>
          <strong>{zeram[0] ? `${curto(zeram[0].nome)} · ${lbl(zeram[0].zera)}` : '–'}</strong>
        </div>
        <div>
          <span>Maior fatia do caixa</span>
          <strong>{maior && positivo > 0 ? `${curto(maior.nome)} · ${pct((Math.max(0, maior.caixa) / positivo) * 100)}` : '–'}</strong>
        </div>
      </div>
      <div className="spe-bar">
        <Seg
          rotulo="Ordenar por"
          opcoes={[
            ['risco', 'Risco'],
            ['caixa', 'Caixa hoje'],
            ['nome', 'Nome'],
          ]}
          valor={pref.sort}
          onChange={(v) => salvar({ ...pref, sort: v })}
        />
        <Seg
          rotulo="Mostrar"
          opcoes={[
            ['todas', 'Todas'],
            ['zeram', 'Só as que zeram'],
          ]}
          valor={pref.show}
          onChange={(v) => salvar({ ...pref, show: v })}
        />
        <div className="ramp" aria-hidden="true">
          <span>negativo</span>
          <i />
          <span>positivo</span>
        </div>
      </div>
      <div className="tbl heat-wrap">
        {!all.length ? (
          <div className="empty" style={{ padding: 12 }}>
            Nenhuma empresa com caixa ou fluxo neste escopo.
          </div>
        ) : vistas.length ? (
          <table className="heat">
            <thead>
              <tr>
                <th className="l nmh">Empresa</th>
                <th className="l">Situação</th>
                <th className="n">Hoje</th>
                {D.fut.map((m) => (
                  <th key={m}>{lbl(m)}</th>
                ))}
                <th className="n">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {vistas.map((s) => linha(s))}
            </tbody>
            {all.length > 1 && (
              <tfoot>
                {linha(total, true)}
              </tfoot>
            )}
          </table>
        ) : (
          <div className="empty" style={{ padding: 12 }}>
            Nenhuma empresa corresponde ao filtro.
          </div>
        )}
        {linhas.length > SPE_MAX && (
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--line)' }}>
            <button type="button" className="btn ghost" onClick={() => setTodas((t) => !t)}>
              {todas ? `Mostrar só as ${SPE_MAX} primeiras` : `Mostrar todas as ${linhas.length} empresas`}
            </button>
          </div>
        )}
      </div>
      <p className="note">
        Clique numa empresa para filtrar o painel inteiro pelos centros dela; clique de novo para voltar ao consolidado. A célula com contorno é o mês
        de menor saldo.
      </p>
    </section>
  );
}

// ─── Quem gera e quem consome caixa ──────────────────────────────────────────────────────────────
function Barra({ v, mx }) {
  const p = (Math.abs(v) / mx) * 50;
  return (
    <div className="bar">
      <div className="z" style={{ left: '50%' }} />
      <div className="b" style={{ left: v >= 0 ? '50%' : `${50 - p}%`, width: `${p}%`, background: v >= 0 ? 'var(--s-in)' : 'var(--s-out)' }} />
    </div>
  );
}
function Flags({ r }) {
  return (
    <>
      {r.contrato && !r.param && r.capR > 0 && Math.abs(r.capP) < 1 ? (
        <span className="flag w" title="Recebeu repasse CEF e não tem projeção">
          CEF fora
        </span>
      ) : r.param ? (
        <span className="flag" title="Projeção CEF ativa">
          CEF
        </span>
      ) : null}
    </>
  );
}

export function QuemGera({ D, centroSel, onCentro }) {
  // Só os centros com "Projeta DFC" (os de fora do DFC não aparecem — pedido do usuário).
  const rows = D.centros.filter((c) => c.projeta !== false).sort((a, b) => b.lp - a.lp);
  const mx = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.lr), Math.abs(r.lp)]));
  return (
    <section className="panel c7" aria-labelledby="h-obras">
      <div className="ph">
        <h2 id="h-obras">Quem gera e quem consome caixa
          <AjudaSecao aba="quemgera" rotulo="Quem gera e quem consome caixa" />
        </h2>
        <p>Fluxo operacional líquido por centro de custo. Clique numa linha para filtrar o painel.</p>
      </div>
      <div className="tbl">
        {!rows.length ? (
          <div className="empty">Nenhum centro com fluxo no escopo.</div>
        ) : (
          <table className="tab">
            <thead>
              <tr>
                <th>Centro</th>
                <th className="n">
                  Últimos {D.hist.length} m
                </th>
                <th className="n">
                  Próximos {D.fut.length} m
                </th>
                <th style={{ minWidth: 120 }}>Projetado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={`clk${centroSel === r.id ? ' sel' : ''}`}
                  tabIndex={0}
                  onClick={() => onCentro(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onCentro(r.id);
                    }
                  }}
                >
                  <td>
                    {r.nome}
                    <Flags r={r} />
                  </td>
                  <td className={`n ${r.lr >= 0 ? 'pos' : 'neg'}`}>{brl(r.lr, true)}</td>
                  <td className={`n ${r.lp >= 0 ? 'pos' : 'neg'}`}>{brl(r.lp, true)}</td>
                  <td>
                    <Barra v={r.lp} mx={mx} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ─── Carteira e liquidez ─────────────────────────────────────────────────────────────────────────
export function Carteira({ D }) {
  const rec = D.cart.receber || {};
  const pag = D.cart.pagar || {};
  // Todas as contas com "Projeta DFC" (as que formam o caixa do DFC), da maior para a menor.
  const contas = D.contas.filter((c) => !D.empresasDoFiltro || D.empresasDoFiltro.has(c.company_id)).sort((a, b) => b.saldo - a.saldo);
  return (
    <section className="panel c5" aria-labelledby="h-cart">
      <div className="ph">
        <h2 id="h-cart">Carteira e liquidez
          <AjudaSecao aba="carteira" rotulo="Carteira e liquidez" />
        </h2>
      </div>
      <div className="kv k2">
        {[
          ['Liquidez imediata', brl(D.totalContas - D.invest)],
          ['Em aplicações', brl(D.invest)],
          ['A receber a vencer', brl(rec.a_vencer || 0)],
          ['A pagar em aberto', brl((pag.vencido || 0) + (pag.a_vencer || 0))],
        ].map(([k, v]) => (
          <div key={k}>
            <span>{k}</span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <div className="legend">
        <span>
          <i className="box" style={{ background: COR.entrada }} />
          Investimento
        </span>
        <span>
          <i className="box" style={{ background: COR.accent }} />
          Conta corrente
        </span>
      </div>
      <BarrasH
        aria="Maiores saldos bancários"
        itens={contas.map((c) => ({
          l: titulo(c.nome || c.conta),
          v: c.saldo,
          c: CFG.investimento.test(c.tipo) ? COR.entrada : COR.accent,
          titulo: titulo(c.nome || c.conta),
          linhas: [
            ['Empresa', curto(c.empresa)],
            ['Conta', c.conta],
            ['Tipo', titulo(c.tipo) || '–'],
            ['Saldo', brl(c.saldo)],
          ],
        }))}
      />
    </section>
  );
}

// ─── O Orçamento erra para qual lado? ────────────────────────────────────────────────────────────
export function Calibracao({ D }) {
  const rows = D.calib
    .filter((c) => Math.abs(c.p) > 0 && Math.abs(c.r) + Math.abs(c.p) > 20000)
    .map((c) => ({ ...c, dv: (c.r / c.p - 1) * 100, gap: Math.abs(c.r - c.p) }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 8);
  return (
    <section className="panel c6" aria-labelledby="h-cal">
      <div className="ph">
        <h2 id="h-cal">O Orçamento erra para qual lado?
          <AjudaSecao aba="orcamento" rotulo="O Orçamento erra para qual lado?" />
        </h2>
        <p>
          {D.hist.length
            ? `${lbl(D.hist[0])} a ${lbl(D.hist.at(-1))}: realizado contra o projetado da versão atual para os mesmos meses.`
            : 'Realizado contra o projetado da versão atual para os mesmos meses.'}
        </p>
      </div>
      <div className="tbl">
        {!rows.length ? (
          <div className="empty">{D.hist.length ? 'Sem linhas com valores comparáveis no histórico.' : 'Sem histórico no período: escolha ao menos 1 mês.'}</div>
        ) : (
          <table className="tab">
            <thead>
              <tr>
                <th>Linha</th>
                <th className="n">Realizado</th>
                <th className="n">Projetado</th>
                <th className="n">Desvio</th>
                <th style={{ minWidth: 100 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const ruim = c.lado === 'sai' ? c.dv > 0 : c.dv < 0;
                return (
                  <tr key={`${c.nome}|${c.lado}`}>
                    <td>
                      {c.nome} <span style={{ color: 'var(--muted)', fontSize: 12 }}>{c.lado === 'ent' ? 'entrada' : 'saída'}</span>
                    </td>
                    <td className="n">{brl(Math.abs(c.r))}</td>
                    <td className="n">{brl(Math.abs(c.p))}</td>
                    <td className={`n ${ruim ? 'neg' : 'pos'}`}>{pct(c.dv, true)}</td>
                    <td>
                      <div className="bar" style={{ minWidth: 90 }}>
                        <div className="z" style={{ left: 0 }} />
                        <div className="b" style={{ left: 0, width: `${Math.min(100, Math.abs(c.dv))}%`, background: ruim ? 'var(--s-out)' : 'var(--s-in)' }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="note">Desvio positivo nas saídas significa gastar mais que o projetado. O projetado de meses passados é o da versão atual do Orçamento.</p>
    </section>
  );
}

// ─── Maiores saídas operacionais ─────────────────────────────────────────────────────────────────
export function MaioresSaidas({ D, forn }) {
  const g = {};
  (forn || []).forEach((r) => {
    const k = r.nome || 'Sem favorecido';
    const o = (g[k] = g[k] || { nome: k, valor: 0, n: 0, mask: {} });
    o.valor += r.valor;
    o.n += r.n;
    o.mask[r.mascara] = (o.mask[r.mascara] || 0) + r.valor;
  });
  const top = Object.values(g)
    .sort((a, b) => a.valor - b.valor)
    .slice(0, 10);
  return (
    <section className="panel c6" aria-labelledby="h-forn">
      <div className="ph">
        <h2 id="h-forn">Maiores saídas operacionais
          <AjudaSecao aba="saidas" rotulo="Maiores saídas operacionais" />
        </h2>
        <p>{D.hist.length ? `${lbl(D.hist[0])} a ${lbl(D.hist.at(-1))}, por favorecido.` : 'Por favorecido, no histórico.'}</p>
      </div>
      <div className="legend">
        <span>
          <i className="box" style={{ background: COR.saida }} />
          Custo de obra
        </span>
        <span>
          <i className="box" style={{ background: COR.neutro }} />
          Demais saídas
        </span>
      </div>
      <BarrasH
        rotuloGrande
        aria="Maiores favorecidos"
        itens={top.map((f) => {
          const mk = Object.entries(f.mask).sort((a, b) => a[1] - b[1])[0]?.[0] || '';
          return {
            l: titulo(f.nome),
            v: -f.valor,
            c: CFG.obra.test(mk) ? COR.saida : COR.neutro,
            titulo: f.nome,
            linhas: [
              ['Pago', brl(-f.valor)],
              ['Lançamentos', nf0.format(f.n)],
              ['Linha', titulo(mk)],
            ],
          };
        })}
      />
    </section>
  );
}

// ─── Dívida PJ da Caixa por obra ─────────────────────────────────────────────────────────────────
export function DividaPj({ D }) {
  return (
    <section className="panel c12" aria-labelledby="h-cef">
      <div className="ph">
        <h2 id="h-cef">Dívida PJ da Caixa por obra
          <AjudaSecao aba="divida" rotulo="Dívida PJ da Caixa" />
        </h2>
        <p>Saldo devedor do crédito PJ na Projeção CEF de cada obra com Parâmetros.</p>
      </div>
      {!D.cef.length ? (
        <div className="empty">Nenhuma obra com Projeção CEF gravada neste escopo.</div>
      ) : (
        <div className="cefs">
          {D.cef.map((c) => {
            const reg = c.p.unid_registradas || 0;
            const geral = c.p.unid_geral || 0;
            const semReg = Math.max(0, geral - reg);
            const semContrato = Math.max(0, (c.p.numero_unidades || 0) - geral);
            return (
              <div key={c.id} className="cef">
                <h3>{c.nome}</h3>
                <div className="kv">
                  <div>
                    <span>Saldo devedor {lbl(c.now.mes)}</span>
                    <strong>{brl(c.now.saldo)}</strong>
                  </div>
                  <div>
                    <span>Teto do PJ</span>
                    <strong>{brl(c.p.teto)}</strong>
                  </div>
                  <div>
                    <span>Obra em {lbl(c.now.mes)}</span>
                    <strong>{pct(c.now.obra)}</strong>
                  </div>
                  <div>
                    <span>Juros ao mês</span>
                    <strong>{c.p.taxa_juros_mes != null ? pct(+c.p.taxa_juros_mes) : '–'}</strong>
                  </div>
                  <div>
                    <span>Amortização PJ</span>
                    <strong>{c.p.pct_amortizacao_pj != null ? `${nf0.format(c.p.pct_amortizacao_pj)}%` : '–'}</strong>
                  </div>
                  <div>
                    <span>Juros em {lbl(c.end.mes)}</span>
                    <strong>{brl(c.end.juros)}</strong>
                  </div>
                </div>
                <DividaObra c={c} />
                {c.p.numero_unidades > 0 && (
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>
                      Unidades ({c.p.numero_unidades})
                    </div>
                    <div className="units">
                      {reg > 0 && (
                        <div style={{ flex: reg, background: 'var(--s-in)' }} title="Com registro">
                          {reg} registradas
                        </div>
                      )}
                      {semReg > 0 && (
                        <div style={{ flex: semReg, background: 'var(--accent)' }} title="Repasse CEF sem registro">
                          {semReg}
                        </div>
                      )}
                      {semContrato > 0 && (
                        <div style={{ flex: semContrato, background: 'var(--s-neutral)' }} title="Sem contrato na Caixa">
                          {semContrato} sem contrato
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
