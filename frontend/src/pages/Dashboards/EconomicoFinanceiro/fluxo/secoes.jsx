import { useMemo, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { BarrasH, DividaObra, FluxoOperacional, Trajetoria } from './graficos';
import { COR, useDica, useSumario } from './ganchos';
import { PRESETS, brl, cenario, curto, eixo, lbl, nf0, obraMaiorEntrada, pct, presetDe, titulo } from './modelo';
import { calibracao, carteira, diaMes, dividaPj, folego, indicadores, maioresSaidas, opcoesAtraso as listaAtraso, quemGera, tituloTrajetoria } from './analise';

// Seções do painel do Fluxo de Caixa, na ordem da especificação do painel do CFO
// (C:\Users\motta\Desktop\layout\Especificação do Painel do CFO — Tostes e Diniz.md).
// Os números, etiquetas e ordenações vêm de analise.js (o mesmo cálculo que o MCP usa); aqui é só o desenho.

// "?" ao lado do título: abre o Sumário das análises na aba desta seção.
export function AjudaSecao({ aba, rotulo }) {
  const abrir = useSumario();
  return (
    <button type="button" className="ajuda" onClick={() => abrir(aba)} title="Como ler esta análise" aria-label={`Como ler: ${rotulo}`}>
      <CircleHelp size={15} />
    </button>
  );
}

// Etiqueta { tom, texto } (analise.js).
function Status({ s }) {
  return <span className={`st ${s.tom}`}>{s.texto}</span>;
}
// Texto em partes: string ou { b } (negrito).
const Partes = ({ partes }) => partes.map((p, i) => (typeof p === 'string' ? p : <b key={i}>{p.b}</b>));

// ─── Indicadores (8 tiles) ───────────────────────────────────────────────────────────────────────
export function Tiles({ D }) {
  const tiles = indicadores(D);
  return (
    <section className="tiles" aria-label="Indicadores principais">
      {tiles.map((t) => (
        <div key={t.chave} className="tile">
          <span className="k">{t.titulo}</span>
          <span className="v">{t.valor_fmt}</span>
          <span className="d">
            <Partes partes={t.detalhe} />
          </span>
          <Status s={t.etiqueta} />
        </div>
      ))}
    </section>
  );
}

// ─── Trajetória do caixa + simulador ─────────────────────────────────────────────────────────────
export function Hero({ D, escopo }) {
  const [preset, setPreset] = useState('cons');
  const [sc, setSc] = useState({ ...PRESETS.cons, delayId: null });
  const opcoesAtraso = useMemo(() => listaAtraso(D), [D]);
  // Obra do "Atrasar entradas de": a escolhida, se ainda está no escopo; senão a de maior entrada.
  const delayId = opcoesAtraso.some((c) => c.id === sc.delayId) ? sc.delayId : (obraMaiorEntrada(D)?.id ?? opcoesAtraso[0]?.id ?? null);
  const atual = { ...sc, delayId };
  const serie = cenario(D, atual);
  const mudar = (patch) => {
    const novo = { ...atual, ...patch };
    setSc(novo);
    setPreset(presetDe(novo));
  };
  return (
    <section className="panel hero" aria-labelledby="h-traj">
      <div className="ph">
        <h2 id="h-traj">
          {tituloTrajetoria(D, escopo)}
          <AjudaSecao aba="trajetoria" rotulo="Trajetória do caixa" />
        </h2>
        <p>Realizado até hoje e, daqui em diante, o saldo no fim de cada mês pelo Orçamento (no mês atual, só o que falta acontecer) e pelo cenário ao lado.</p>
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
          <span style={{ color: 'var(--muted)' }}>Barras fortes = realizado; claras = orçado. O mês atual aparece duas vezes: realizado até hoje e orçado no mês.</span>
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

  const { empresas: all, zeram, linhas, total, resumo } = folego(D, { ordem: pref.sort, mostrar: pref.show });
  const vistas = todas ? linhas : linhas.slice(0, SPE_MAX);
  const maxAbs = Math.max(1, ...all.flatMap((s) => [Math.abs(s.caixa), ...s.path.map(Math.abs)]));
  const cel = (v) => {
    if (Math.abs(v) < 1) return { background: 'var(--surface-2)', color: 'var(--muted)' };
    const p = Math.round(14 + 76 * Math.sqrt(Math.min(1, Math.abs(v) / maxAbs)));
    return { background: `color-mix(in srgb, var(${v < 0 ? '--s-out' : '--s-in'}) ${p}%, var(--surface))`, color: p > 52 ? '#fff' : 'var(--ink)' };
  };
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
        <td className="sit">{rodape ? null : <Status s={s.situacao} />}</td>
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
          <strong className={zeram.length ? 'neg' : 'pos'}>{resumo.zeram}</strong>
        </div>
        <div>
          <span>Primeira a zerar</span>
          <strong>{resumo.primeira_a_zerar}</strong>
        </div>
        <div>
          <span>Maior fatia do caixa</span>
          <strong>{resumo.maior_fatia}</strong>
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
  return r.etiqueta ? (
    <span className={r.etiqueta.classe} title={r.etiqueta.dica}>
      {r.etiqueta.texto}
    </span>
  ) : null;
}

export function QuemGera({ D, centroSel, onCentro }) {
  // Só os centros com "Projeta DFC" (os de fora do DFC não aparecem — pedido do usuário).
  const { linhas: rows, maximo: mx } = quemGera(D);
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
                <th className="n" title="Realizado: meses fechados do histórico e o mês atual até hoje">
                  Realizado até {diaMes(D.hoje)}
                </th>
                <th className="n" title="Orçamento: o que falta do mês atual e os meses seguintes">
                  A acontecer até {lbl(D.fut.at(-1))}
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
  const { numeros, contas } = carteira(D);
  return (
    <section className="panel c5" aria-labelledby="h-cart">
      <div className="ph">
        <h2 id="h-cart">Carteira e liquidez
          <AjudaSecao aba="carteira" rotulo="Carteira e liquidez" />
        </h2>
      </div>
      <div className="kv k2">
        {numeros.map((n) => (
          <div key={n.rotulo}>
            <span>{n.rotulo}</span>
            <strong>{brl(n.valor)}</strong>
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
          c: c.investimento ? COR.entrada : COR.accent,
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
  const rows = calibracao(D);
  return (
    <section className="panel c6" aria-labelledby="h-cal">
      <div className="ph">
        <h2 id="h-cal">O Orçamento erra para qual lado?
          <AjudaSecao aba="orcamento" rotulo="O Orçamento erra para qual lado?" />
        </h2>
        <p>
          {D.hist.length
            ? `${lbl(D.hist[0])} a ${lbl(D.hist.at(-1))} (meses fechados): realizado contra o projetado da versão atual para os mesmos meses.`
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
                const { ruim } = c;
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
  const top = maioresSaidas(forn);
  return (
    <section className="panel c6" aria-labelledby="h-forn">
      <div className="ph">
        <h2 id="h-forn">Maiores saídas operacionais
          <AjudaSecao aba="saidas" rotulo="Maiores saídas operacionais" />
        </h2>
        <p>{`${D.hist.length ? lbl(D.hist[0]) : lbl(D.m0)} até ${diaMes(D.hoje)}, por favorecido (realizado).`}</p>
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
        itens={top.map((f) => ({
          l: titulo(f.nome),
          v: -f.valor,
          c: f.obra ? COR.saida : COR.neutro,
          titulo: f.nome,
          linhas: [
            ['Pago', brl(-f.valor)],
            ['Lançamentos', nf0.format(f.lancamentos)],
            ['Linha', f.linha],
          ],
        }))}
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
      {!dividaPj(D).length ? (
        <div className="empty">Nenhuma obra com Projeção CEF gravada neste escopo.</div>
      ) : (
        <div className="cefs">
          {dividaPj(D).map((c) => {
            const { registradas: reg, sem_registro: semReg, sem_contrato: semContrato } = c.unidades;
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
