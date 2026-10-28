import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { AjudaSecao } from '../fluxo/secoes';
import { BarrasH } from '../fluxo/graficos';
import { COR, useDica } from '../fluxo/ganchos';
import { eixo } from '../fluxo/modelo';
import { CaixaDiario } from './graficos';
import {
  CENARIOS,
  COLUNAS,
  DIMENSOES,
  FAIXAS,
  IDX_HOJE,
  PADRAO_SIM,
  arvore,
  brl,
  cenarioDe,
  dimensoesDoLado,
  dm,
  dma,
  escada,
  filtrarBusca,
  indicadores,
  maiores,
  nf0,
  nomeCondicao,
  nomeDocumento,
  nomePessoa,
  parcelas,
  pct,
  rotuloPessoa,
  semana,
  simular,
  soma,
} from './modelo';

// Seções do Aging List (dashboard Econômico Financeiro). Os números vêm de modelo.js; aqui é o desenho.

function Status({ s }) {
  return <span className={`st ${s.tom}`}>{s.texto}</span>;
}
const Partes = ({ partes }) => partes.map((p, i) => (typeof p === 'string' ? p : <b key={i}>{p.b}</b>));
const dias = (n) => `${nf0.format(n)} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`;

function Seg({ rotulo, opcoes, valor, onChange, oculto = false }) {
  return (
    <div className="ctl">
      {!oculto && <span className="rot">{rotulo}</span>}
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

// ─── Indicadores (8 cards: a receber em cima, a pagar embaixo) ───────────────────────────────────
const LADO_CARD = { receber: 'r', receber_vencido: 'r', receber_prox: 'r', caixa: 'c', pagar: 'p', pagar_vencido: 'p', pagar_prox: 'p', minimo: 'c' };
export function Tiles({ E }) {
  const tiles = useMemo(() => indicadores(E), [E]);
  return (
    <section className="tiles" aria-label="Indicadores do aging">
      {tiles.map((t) => (
        <div key={t.chave} className={`tile lado-${LADO_CARD[t.chave]}`}>
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

// ─── Escada de vencimentos ───────────────────────────────────────────────────────────────────────
export function Escada({ E, faixaSel, onFaixa }) {
  const { mostrar, esconder } = useDica();
  const es = useMemo(() => escada(E), [E]);
  const temBanco = !!E.banco.data;
  const larg = (v) => `${Math.min(100, (v / es.escala) * 100)}%`;
  const cortada = (v) => v > es.escala * 1.001;
  const sel = (i) => faixaSel?.fx.length === 1 && faixaSel.fx[0] === i;
  return (
    <section className="panel c12" aria-labelledby="h-esc">
      <div className="ph">
        <h2 id="h-esc">
          Escada de vencimentos: a pagar × a receber
          <AjudaSecao aba="faixas" rotulo="Escada de vencimentos" />
        </h2>
        <p>Saldo corrigido em aberto por faixa de dias. Clique numa faixa para abrir as parcelas dela no detalhamento.</p>
      </div>
      <div className="kv k4">
        <div>
          <span>Posição líquida (receber − pagar)</span>
          <strong className={es.posicao >= 0 ? 'pos' : 'neg'}>{brl(es.posicao, true)}</strong>
        </div>
        <div>
          <span>Vencido líquido</span>
          <strong className={es.vencidoLiq >= 0 ? 'pos' : 'neg'}>{brl(es.vencidoLiq, true)}</strong>
        </div>
        <div>
          <span>Líquido de hoje a 30 dias</span>
          <strong className={es.trintaLiq >= 0 ? 'pos' : 'neg'}>{brl(es.trintaLiq, true)}</strong>
        </div>
        <div>
          <span>{temBanco ? `Caixa livre em ${dm(E.banco.data)}` : 'Caixa livre'}</span>
          <strong>{temBanco ? brl(E.banco.livre) : '–'}</strong>
        </div>
      </div>
      <div className="tbl">
        <div className="esc" style={{ minWidth: 640 }}>
          <div className="esc-cab">
            <span>A pagar</span>
            <span>Faixa</span>
            <span>A receber</span>
            <span className="n">Líquido</span>
            <span className="n" title="Caixa livre de hoje + o líquido acumulado das faixas de hoje em diante">
              Caixa acumulado
            </span>
          </div>
          {es.linhas.map((l) => (
            <Fragment key={l.id}>
              {l.i === 0 && (
                <div className="esc-sep v">
                  <span>Vencido há</span>
                </div>
              )}
              {l.i === IDX_HOJE + 1 && (
                <div className="esc-sep a">
                  <span>A vencer em</span>
                </div>
              )}
              <button
                type="button"
                className={`esc-l g-${l.grupo}${sel(l.i) ? ' sel' : ''}`}
                aria-pressed={sel(l.i)}
                onClick={() => onFaixa(sel(l.i) ? null : { fx: [l.i], rotulo: l.rotulo })}
                onMouseMove={(ev) =>
                  mostrar(ev, l.rotulo, [
                    ['A receber', brl(l.r)],
                    ['A pagar', brl(-l.p)],
                    ['Líquido', brl(l.liq, true)],
                    ...(l.acum !== null ? [['Caixa acumulado', temBanco ? brl(l.acum) : `${brl(l.acum)} (sem saldo de partida)`]] : []),
                  ])
                }
                onMouseLeave={esconder}
              >
                <span className="lado p">
                  <b>{l.p ? eixo(l.p) : ''}</b>
                  {l.p > 0 && <i className={cortada(l.p) ? 'corte' : ''} style={{ width: larg(l.p) }} />}
                </span>
                <span className="fx">{l.curto}</span>
                <span className="lado r">
                  {l.r > 0 && <i className={cortada(l.r) ? 'corte' : ''} style={{ width: larg(l.r) }} />}
                  <b>{l.r ? eixo(l.r) : ''}</b>
                </span>
                <span className={`n ${l.liq > 0 ? 'pos' : l.liq < 0 ? 'neg' : ''}`}>{l.liq ? brl(l.liq, true) : '–'}</span>
                <span className={`n ac ${l.acum !== null && l.acum < 0 ? 'neg' : ''}`}>{l.acum === null ? '' : brl(l.acum)}</span>
              </button>
            </Fragment>
          ))}
          <div className="esc-rodape">
            <span className="n">{brl(es.p.total)}</span>
            <span>Total</span>
            <span className="n">{brl(es.r.total)}</span>
            <span className={`n ${es.posicao >= 0 ? 'pos' : 'neg'}`} style={{ textAlign: 'right' }}>
              {brl(es.posicao, true)}
            </span>
            <span />
          </div>
        </div>
      </div>
      <p className="note">
        Barras na mesma escala; as das pontas (+180 dias) que passam dela aparecem com a ponta cortada. O caixa acumulado parte do caixa livre de hoje
        e soma o líquido de cada faixa a vencer — é o caixa se tudo for pago e recebido exatamente no vencimento.
      </p>
    </section>
  );
}

// ─── Simulador de caixa dos próximos dias ────────────────────────────────────────────────────────
function Faixa({ id, rotulo, valor, sufixo, min, max, step, onChange, dica }) {
  return (
    <div className="range">
      <div className="row">
        <label htmlFor={id}>{rotulo}</label>
        <output>
          {valor}
          {sufixo}
        </output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={valor} onChange={(e) => onChange(+e.target.value)} />
      {dica && <span className="dica">{dica}</span>}
    </div>
  );
}

function CampoValor({ id, rotulo, valor, onChange }) {
  const [texto, setTexto] = useState(valor ? String(valor) : '');
  return (
    <label className="campo" htmlFor={id}>
      {rotulo}
      <input
        id={id}
        inputMode="decimal"
        placeholder="0"
        value={texto}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d,.-]/g, '');
          setTexto(t);
          const v = Number(t.replace(/\./g, '').replace(',', '.'));
          onChange(Number.isFinite(v) ? v : 0);
        }}
      />
    </label>
  );
}

function situacao(sim, temBanco) {
  if (!temBanco) return { tom: 'warn', partes: ['Sem saldo lançado em ', { b: 'Saldo Contas Bancárias' }, ': a simulação parte de zero (use o aporte para informar um saldo).'] };
  if (sim.primeiroEstouro)
    return {
      tom: 'crit',
      partes: ['O caixa passa do limite do cheque especial em ', { b: dm(sim.primeiroEstouro) }, '. Falta ', { b: brl(-(sim.min + sim.cheque)) }, ' no pior dia (', { b: dm(sim.minData) }, ').'],
    };
  if (sim.primeiroNegativo)
    return {
      tom: sim.cheque > 0 ? 'warn' : 'crit',
      partes: [
        'O caixa fica negativo em ',
        { b: dm(sim.primeiroNegativo) },
        sim.cheque > 0 ? ' e usa até ' : ': faltam ',
        { b: brl(-sim.min) },
        sim.cheque > 0 ? ` do cheque especial (${sim.diasNegativos} ${sim.diasNegativos === 1 ? 'dia' : 'dias'} no vermelho).` : ` no pior dia (${dm(sim.minData)}).`,
      ],
    };
  if (sim.primeiroAbaixo)
    return { tom: 'warn', partes: ['Fica abaixo do mínimo de segurança em ', { b: dm(sim.primeiroAbaixo) }, ': faltam ', { b: brl(sim.necessidade) }, ' para mantê-lo.'] };
  return { tom: 'good', partes: ['O caixa cobre o período: o menor saldo é ', { b: brl(sim.min) }, ' em ', { b: dm(sim.minData) }, '.'] };
}

function ItemDia({ it, B }) {
  if (it.extra) {
    const nome = { recuperacao: 'Recuperação de vencidos a receber', vencidos: 'Vencidos a pagar (até 90 dias)', aporte: 'Aporte / captação' }[it.extra];
    return (
      <div className="it">
        <span>{nome}</span>
        <b>{brl(it.valor)}</b>
      </div>
    );
  }
  const { t } = it;
  return (
    <div className="it" title={`${nomePessoa(B, t.l, t.q)} · título ${t.b}/${t.p} · ${nomeDocumento(B, t.d)} ${t.n || ''}`}>
      <span>
        {nomePessoa(B, t.l, t.q)}
        <small>
          {t.b}/{t.p}
          {t.vn !== undefined && t.v !== it.data ? ` · venc. ${dm(t.v)}` : ''}
          {it.frac < 1 ? ` · rateio ${pct(it.frac * 100)}` : ''}
        </small>
      </span>
      <b>{brl(it.valor)}</b>
    </div>
  );
}

export function Simulador({ E }) {
  const [p, setP] = useState(PADRAO_SIM);
  const [diaAberto, setDiaAberto] = useState(null);
  const [verDias, setVerDias] = useState(false);
  const sim = useMemo(() => simular(E, p), [E, p]);
  const cen = cenarioDe(p);
  const mudar = (patch) => setP((a) => ({ ...a, ...patch }));
  const temBanco = !!E.banco.data;
  const sit = situacao(sim, temBanco);
  const abrirDia = (d) => {
    setDiaAberto(d);
    if (d) setVerDias(true);
  };
  return (
    <section className="panel hero c12" aria-labelledby="h-sim">
      <div className="ph">
        <h2 id="h-sim">
          Caixa dos próximos {p.horizonte} dias
          <AjudaSecao aba="simulador" rotulo="Simulador de caixa" />
        </h2>
        <p>
          Parte do saldo das contas de hoje e paga e recebe, dia a dia, tudo o que vence no período (fim de semana cai na segunda), com os ajustes do
          cenário ao lado.
        </p>
      </div>
      <div className="kv k6">
        <div>
          <span>Saldo de partida</span>
          <strong>{brl(sim.ini + (p.aporte || 0))}</strong>
          <small>{temBanco ? `${p.partida === 'total' ? 'todas as contas' : 'caixa livre'} em ${dm(E.banco.data)}` : 'sem saldo lançado'}</small>
        </div>
        <div>
          <span>Entradas</span>
          <strong className="pos">{brl(sim.entradas - (p.aporte || 0))}</strong>
          <small>{p.naoReceber ? `já sem ${p.naoReceber}% de perda` : 'tudo o que vence'}</small>
        </div>
        <div>
          <span>Saídas</span>
          <strong className="neg">{brl(-sim.saidas)}</strong>
          <small>{p.pagarVencidos ? `com ${p.pagarVencidos}% dos vencidos` : 'só o que vence'}</small>
        </div>
        <div>
          <span>Saldo no fim</span>
          <strong className={sim.final >= 0 ? '' : 'neg'}>{brl(sim.final)}</strong>
          <small>em {dm(sim.dias.at(-1).data)}</small>
        </div>
        <div>
          <span>Menor saldo</span>
          <strong className={sim.min >= p.minimo ? '' : 'neg'}>{brl(sim.min)}</strong>
          <small>em {dm(sim.minData)}</small>
        </div>
        <div>
          <span>Necessidade de caixa</span>
          <strong className={sim.necessidade > 0 ? 'neg' : 'pos'}>{brl(sim.necessidade)}</strong>
          <small>para não ficar abaixo de {brl(p.minimo)}</small>
        </div>
      </div>
      <div className="hero-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div className={`alerta ${sit.tom}`}>
            <span>
              <Partes partes={sit.partes} />
            </span>
          </div>
          <div className="legend">
            <span>
              <i className="box" style={{ background: COR.entrada }} />
              Entradas do dia
            </span>
            <span>
              <i className="box" style={{ background: COR.saida }} />
              Saídas do dia
            </span>
            <span>
              <i style={{ borderColor: COR.ink }} />
              Saldo no fim do dia
            </span>
            {p.minimo ? (
              <span>
                <i className="dash" style={{ borderColor: COR.crit }} />
                Mínimo de segurança
              </span>
            ) : null}
            <span style={{ color: 'var(--muted)' }}>Faixa cinza = fim de semana. Clique num dia para ver as parcelas.</span>
          </div>
          <CaixaDiario sim={sim} diaSel={diaAberto} onDia={abrirDia} />
        </div>
        <aside className="sim" aria-label="Cenário do simulador">
          <h3>Cenário</h3>
          <div className="presets" role="group" aria-label="Cenários prontos">
            {Object.entries(CENARIOS).map(([k, c]) => (
              <button key={k} type="button" aria-pressed={cen === k} onClick={() => mudar(c)}>
                {c.rotulo}
              </button>
            ))}
          </div>
          <div className="duas">
            <label className="campo" htmlFor="s-hor">
              Horizonte
              <select id="s-hor" value={p.horizonte} onChange={(e) => mudar({ horizonte: +e.target.value })}>
                {[7, 15, 30, 45, 60, 90].map((n) => (
                  <option key={n} value={n}>
                    {n} dias
                  </option>
                ))}
              </select>
            </label>
            <label className="campo" htmlFor="s-part">
              Saldo de partida
              <select id="s-part" value={p.partida} onChange={(e) => mudar({ partida: e.target.value })} disabled={!temBanco}>
                <option value="livre">Caixa livre</option>
                <option value="total">Todas as contas</option>
              </select>
            </label>
          </div>
          <div className="sub">Recebimentos</div>
          <Faixa id="s-nr" rotulo="Não receber das entradas previstas" valor={p.naoReceber} sufixo="%" min={0} max={100} step={5} onChange={(v) => mudar({ naoReceber: v })} />
          <Faixa id="s-ar" rotulo="Atrasar os recebimentos" valor={p.atrasoReceb} sufixo=" d" min={0} max={30} step={1} onChange={(v) => mudar({ atrasoReceb: v })} />
          <Faixa
            id="s-rc"
            rotulo="Recuperar do vencido (até 90 dias)"
            valor={p.recuperar}
            sufixo="%"
            min={0}
            max={100}
            step={5}
            onChange={(v) => mudar({ recuperar: v })}
            dica={`${brl(sim.recuperavel)} vencidos há até 90 dias, divididos pelos dias úteis`}
          />
          <label className="opt">
            <input type="checkbox" checked={p.semCaixa} onChange={(e) => mudar({ semCaixa: e.target.checked })} />
            <span>
              <b>Permutas e "Não cobrar" não entram</b>
              <span>{sim.semCaixa ? `${brl(sim.semCaixa)} no período não vira dinheiro no banco.` : 'Condições que não viram dinheiro no banco.'}</span>
            </span>
          </label>
          <div className="sub">Pagamentos</div>
          <Faixa
            id="s-pv"
            rotulo="Pagar do vencido (até 90 dias)"
            valor={p.pagarVencidos}
            sufixo="%"
            min={0}
            max={100}
            step={5}
            onChange={(v) => mudar({ pagarVencidos: v })}
            dica={`${brl(sim.vencidoPagar)} vencidos há até 90 dias, pagos no 1º dia útil`}
          />
          <Faixa id="s-ad" rotulo="Adiar os pagamentos" valor={p.adiarPag} sufixo=" d" min={0} max={30} step={1} onChange={(v) => mudar({ adiarPag: v })} />
          <div className="sub">Caixa</div>
          <div className="duas">
            <CampoValor id="s-ap" rotulo="Aporte / captação (R$)" valor={p.aporte} onChange={(v) => mudar({ aporte: v })} />
            <CampoValor id="s-mi" rotulo="Mínimo de segurança (R$)" valor={p.minimo} onChange={(v) => mudar({ minimo: v })} />
          </div>
        </aside>
      </div>
      <div>
        <button type="button" className="btn ghost" onClick={() => setVerDias((v) => !v)} aria-expanded={verDias}>
          {verDias ? 'Esconder o dia a dia' : 'Ver o dia a dia'}
        </button>
      </div>
      {verDias && (
        <div className="tbl">
          <table className="tab dias">
            <thead>
              <tr>
                <th>Dia</th>
                <th className="n">Saldo no início</th>
                <th className="n">Entradas</th>
                <th className="n">Saídas</th>
                <th className="n">Saldo no fim</th>
                <th className="n">Parcelas</th>
              </tr>
            </thead>
            <tbody>
              {sim.dias.map((d) => {
                const aberto = diaAberto === d.data;
                const ent = d.itens.filter((x) => x.campo === 'ent').sort((a, b) => b.valor - a.valor);
                const sai = d.itens.filter((x) => x.campo === 'sai').sort((a, b) => b.valor - a.valor);
                return (
                  <Fragment key={d.data}>
                    <tr
                      className={`clk${d.util ? '' : ' fds'}${aberto ? ' aberto' : ''}`}
                      tabIndex={0}
                      onClick={() => setDiaAberto(aberto ? null : d.data)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setDiaAberto(aberto ? null : d.data);
                        }
                      }}
                    >
                      <td className="d">
                        {dma(d.data)}
                        <small>{semana(d.n)}</small>
                      </td>
                      <td className="n">{brl(d.ini)}</td>
                      <td className="n pos">{d.ent ? brl(d.ent) : '–'}</td>
                      <td className="n neg">{d.sai ? brl(-d.sai) : '–'}</td>
                      <td className={`n ${d.fim < p.minimo ? 'neg' : ''}`}>
                        <b>{brl(d.fim)}</b>
                      </td>
                      <td className="n">{d.itens.length ? nf0.format(d.itens.length) : '–'}</td>
                    </tr>
                    {aberto && (
                      <tr className="itens">
                        <td colSpan={6}>
                          {d.itens.length ? (
                            <div className="lista">
                              <div>
                                <h4>Entradas {ent.length ? `(${ent.length})` : ''}</h4>
                                {ent.length ? ent.map((it, k) => <ItemDia key={k} it={{ ...it, data: d.data }} B={E.B} />) : <div className="empty">Nada a receber.</div>}
                              </div>
                              <div>
                                <h4>Saídas {sai.length ? `(${sai.length})` : ''}</h4>
                                {sai.length ? sai.map((it, k) => <ItemDia key={k} it={{ ...it, data: d.data }} B={E.B} />) : <div className="empty">Nada a pagar.</div>}
                              </div>
                            </div>
                          ) : (
                            <div className="empty">Nenhuma parcela neste dia{d.util ? '' : ' (fim de semana: o que vence cai na segunda)'}.</div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Detalhamento (árvore até a parcela) ─────────────────────────────────────────────────────────
const PADRAO_NIVEIS = ['centro', 'natureza', 'pessoa'];
const LIMITE = { 0: 60, outros: 40, parcelas: 25 };

function corCelula(grupo, v, total) {
  if (!v || !total) return undefined;
  const p = Math.round(6 + 46 * Math.min(1, Math.abs(v) / Math.abs(total)));
  const cor = grupo === 'v' ? '--s-out' : grupo === 'h' ? '--warn' : '--s-in';
  return { background: `color-mix(in srgb, var(${cor}) ${p}%, var(--surface))` };
}

export function Detalhamento({ E, faixaSel, onFaixa }) {
  const [lado, setLado] = useState('r');
  const [niveis, setNiveis] = useState(PADRAO_NIVEIS);
  const [cols, setCols] = useState('resumidas');
  const [ordem, setOrdem] = useState('vencido');
  const [busca, setBusca] = useState('');
  const [abertos, setAbertos] = useState(() => new Set());
  const [limites, setLimites] = useState({});
  const { B } = E;
  const colunas = COLUNAS[cols];
  const opcoesDim = dimensoesDoLado(lado);
  const validos = niveis.filter((n, i) => n && opcoesDim.includes(n) && niveis.indexOf(n) === i);

  const linhas = useMemo(() => {
    let ls = E.linhas.filter((x) => x.t.l === lado);
    if (faixaSel) {
      const fx = new Set(faixaSel.fx);
      ls = ls.filter((x) => fx.has(x.t.fx));
    }
    return filtrarBusca(E, ls, busca);
  }, [E, lado, faixaSel, busca]);
  const raiz = useMemo(() => (validos.length ? arvore(E, linhas, validos, lado, ordem) : null), [E, linhas, validos.join(), lado, ordem]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = useMemo(() => {
    const fx = new Array(FAIXAS.length).fill(0);
    linhas.forEach((x) => (fx[x.t.fx] += x.valor));
    return { fx, total: soma(fx), vencido: soma(fx.slice(0, IDX_HOJE)), n: new Set(linhas.map((x) => x.t)).size };
  }, [linhas]);

  const alternar = (id) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const mais = (id, padrao) => setLimites((l) => ({ ...l, [id]: (l[id] || padrao) * 3 }));
  // "—" num nível corta os seguintes.
  const mudarNivel = (i, v) => {
    const n = niveis.slice(0, 3);
    n[i] = v;
    setNiveis(v ? n : n.slice(0, i));
    setAbertos(new Set());
  };
  const somaCols = (fx) => colunas.map((c) => soma(c.fx.map((i) => fx[i])));
  const nCols = colunas.length + 3;

  const celulas = (fx, tot) =>
    somaCols(fx).map((v, k) => (
      <td key={colunas[k].id} className={`c${v ? '' : ' z'}`} style={corCelula(colunas[k].grupo, v, tot)}>
        {v ? eixo(v) : '·'}
      </td>
    ));

  function linhasParcelas(no, nivel) {
    const lista = parcelas(no.linhas);
    const lim = limites[`${no.id}#p`] || LIMITE.parcelas;
    return [
      ...lista.slice(0, lim).map(({ t, valor, frac }) => {
        const k = colunas.findIndex((c) => c.fx.includes(t.fx));
        const extra = [
          t.pc ? `parc. ${t.pc}` : null,
          `${nomeDocumento(B, t.d)}${t.n ? ` ${t.n}` : ''}`,
          `venc. ${dma(t.v)}`,
          t.u ? `unid. ${t.u}` : null,
          t.cp ? nomeCondicao(B, t.cp) : null,
          frac < 0.999 ? `rateio ${pct(frac * 100)} de ${brl(t.s)}` : null,
        ].filter(Boolean);
        return (
          <tr key={`${no.id}#${t.b}/${t.p}`} className="parc">
            <td className="nm" style={{ paddingLeft: 12 + nivel * 18 }}>
              <div className="lin">
                <div className="txt">
                  <b title={`Título ${t.b}, parcela ${t.p}`}>
                    {t.b}/{t.p}
                    {!validos.includes('pessoa') && <span style={{ fontFamily: 'var(--f-body)', marginLeft: 6 }}>{nomePessoa(B, t.l, t.q)}</span>}
                    {t.ina ? <span className="tag">Inadimplente</span> : null}
                    {t.sj ? <span className="tag warn">Sub judice</span> : null}
                    {t.pv ? <span className="tag info">Previsão</span> : null}
                  </b>
                  <small title={extra.join(' · ')}>{extra.join(' · ')}</small>
                </div>
              </div>
            </td>
            {colunas.map((c, i) => (
              <td key={c.id} className={`c${i === k ? '' : ' z'}`} style={i === k ? corCelula(c.grupo, 1, 1) : undefined}>
                {i === k ? eixo(valor) : '·'}
              </td>
            ))}
            <td className="n tot">{brl(valor)}</td>
            <td className="n" style={{ color: t.atraso > 0 ? 'var(--crit-ink)' : 'var(--muted)' }}>
              {t.atraso > 0 ? `${nf0.format(t.atraso)} d` : t.atraso === 0 ? 'hoje' : `em ${nf0.format(-t.atraso)} d`}
            </td>
          </tr>
        );
      }),
      lista.length > lim && (
        <tr key={`${no.id}#mais`} className="mais">
          <td colSpan={nCols} style={{ paddingLeft: 12 + nivel * 18 }}>
            <button type="button" onClick={() => mais(`${no.id}#p`, LIMITE.parcelas)}>
              Mostrar mais parcelas ({nf0.format(lista.length - lim)} restantes)
            </button>
          </td>
        </tr>
      ),
    ];
  }

  function linhasNos(nos, nivel, idPai) {
    const padrao = nivel === 0 ? LIMITE[0] : LIMITE.outros;
    const lim = limites[idPai] || padrao;
    return [
      ...nos.slice(0, lim).map((no) => {
        const aberto = abertos.has(no.id);
        const Caret = aberto ? ChevronDown : ChevronRight;
        return (
          <Fragment key={no.id}>
            <tr
              className={`grupo n${nivel}${aberto ? ' aberto' : ''}`}
              tabIndex={0}
              aria-expanded={aberto}
              onClick={() => alternar(no.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  alternar(no.id);
                }
              }}
            >
              <td className="nm" style={{ paddingLeft: 8 + nivel * 18 }}>
                <div className="lin">
                  <Caret size={15} className="car" />
                  <div className="txt">
                    <b title={no.nome}>{no.nome}</b>
                    <small>
                      {nf0.format(no.n)} {no.n === 1 ? 'parcela' : 'parcelas'}
                      {no.vencido > 0 ? ` · atraso médio ${dias(Math.round(no.atrasoMedio))}` : ''}
                    </small>
                  </div>
                </div>
              </td>
              {celulas(no.fx, no.total)}
              <td className="n tot">{brl(no.total)}</td>
              <td className={`n ${no.vencido > 0 ? 'neg' : ''}`}>{no.total ? pct((no.vencido / no.total) * 100) : '–'}</td>
            </tr>
            {aberto && (no.filhos ? linhasNos(no.filhos(), nivel + 1, no.id) : linhasParcelas(no, nivel + 1))}
          </Fragment>
        );
      }),
      nos.length > lim && (
        <tr key={`${idPai}#mais`} className="mais">
          <td colSpan={nCols} style={{ paddingLeft: 12 + nivel * 18 }}>
            <button type="button" onClick={() => mais(idPai, padrao)}>
              Mostrar mais ({nf0.format(nos.length - lim)} restantes)
            </button>
          </td>
        </tr>
      ),
    ];
  }

  const grupos = [
    { g: 'v', rotulo: 'Vencido há (dias)', n: colunas.filter((c) => c.grupo === 'v').length },
    { g: 'h', rotulo: '', n: 1 },
    { g: 'a', rotulo: 'A vencer em (dias)', n: colunas.filter((c) => c.grupo === 'a').length },
  ];
  const colSel = (c) => faixaSel && faixaSel.fx.length === c.fx.length && c.fx.every((i) => faixaSel.fx.includes(i));

  return (
    <section className="panel c12" aria-labelledby="h-det">
      <div className="ph">
        <h2 id="h-det">
          Aging por {validos.map((d) => DIMENSOES[d].rotulo(lado).toLowerCase()).join(' › ') || '…'} › parcela
          <AjudaSecao aba="detalhamento" rotulo="Detalhamento do aging" />
        </h2>
        <p>Abra cada linha até chegar no título e na parcela (bill e installment do Sienge). Clique no cabeçalho de uma faixa para ficar só com ela.</p>
      </div>
      <div className="det-bar">
        <Seg
          rotulo="Carteira"
          opcoes={[
            ['r', 'A receber'],
            ['p', 'A pagar'],
          ]}
          valor={lado}
          onChange={(v) => {
            setLado(v);
            setAbertos(new Set());
          }}
        />
        <div className="ctl">
          <span className="rot">Agrupar por</span>
          <div className="niveis">
            {[0, 1, 2].map((i) => (
              <Fragment key={i}>
                {i > 0 && <ChevronRight size={14} />}
                <select
                  aria-label={`Nível ${i + 1}`}
                  value={opcoesDim.includes(niveis[i]) ? niveis[i] : ''}
                  onChange={(e) => mudarNivel(i, e.target.value)}
                  disabled={i > 0 && !validos[i - 1]}
                >
                  {i > 0 && <option value="">—</option>}
                  {opcoesDim.map((d) => (
                    <option key={d} value={d} disabled={niveis.some((n, k) => k !== i && n === d)}>
                      {DIMENSOES[d].rotulo(lado)}
                    </option>
                  ))}
                </select>
              </Fragment>
            ))}
          </div>
        </div>
        <Seg
          rotulo="Faixas"
          opcoes={[
            ['resumidas', 'Resumidas'],
            ['detalhadas', 'Todas'],
          ]}
          valor={cols}
          onChange={setCols}
        />
        <Seg
          rotulo="Ordenar por"
          opcoes={[
            ['vencido', 'Vencido'],
            ['total', 'Total'],
            ['atraso', 'Atraso'],
            ['nome', 'Nome'],
          ]}
          valor={ordem}
          onChange={setOrdem}
        />
        <div className="ctl busca">
          <span className="rot">Buscar</span>
          <div style={{ position: 'relative' }}>
            <Search size={14} />
            <input type="search" placeholder={`${rotuloPessoa(lado)}, título, documento, unidade…`} value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
      </div>
      {faixaSel && (
        <div>
          <span className="chip">
            Só a faixa: {faixaSel.rotulo}
            <button type="button" onClick={() => onFaixa(null)} aria-label="Tirar o filtro de faixa" title="Tirar o filtro de faixa">
              <X size={14} />
            </button>
          </span>
        </div>
      )}
      <div className="ag-wrap">
        {!raiz?.length ? (
          <div className="empty" style={{ padding: 14 }}>
            {busca || faixaSel ? 'Nenhuma parcela com esses filtros.' : `Nenhuma parcela ${lado === 'r' ? 'a receber' : 'a pagar'} em aberto neste escopo.`}
          </div>
        ) : (
          <table className="ag">
            <thead>
              <tr>
                <th className="nmh" rowSpan={2} style={{ textAlign: 'left', verticalAlign: 'bottom', borderBottom: '1.5px solid var(--ink)' }}>
                  {validos.map((d) => DIMENSOES[d].rotulo(lado)).join(' › ')}
                </th>
                {grupos.map((g) => (
                  <th key={g.g} colSpan={g.n} className={`g-${g.g}`}>
                    {g.rotulo}
                  </th>
                ))}
                <th rowSpan={2} style={{ verticalAlign: 'bottom', borderBottom: '1.5px solid var(--ink)' }}>
                  Total
                </th>
                <th rowSpan={2} style={{ verticalAlign: 'bottom', borderBottom: '1.5px solid var(--ink)' }} title="Vencido ÷ total da linha; na parcela, os dias de atraso">
                  % vencido
                </th>
              </tr>
              <tr>
                {colunas.map((c) => (
                  <th
                    key={c.id}
                    className={`fxh g-${c.grupo}${colSel(c) ? ' sel' : ''}`}
                    title={`${c.titulo} — clique para ficar só com esta faixa`}
                    onClick={() => onFaixa(colSel(c) ? null : { fx: c.fx, rotulo: c.titulo })}
                  >
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{linhasNos(raiz, 0, 'raiz')}</tbody>
            <tfoot>
              <tr>
                <td className="nm">
                  <b>Total</b>
                  <small>
                    {nf0.format(total.n)} parcelas · {nf0.format(raiz.length)} {raiz.length === 1 ? 'grupo' : 'grupos'}
                  </small>
                </td>
                {somaCols(total.fx).map((v, k) => (
                  <td key={colunas[k].id} className="c">
                    {v ? eixo(v) : '·'}
                  </td>
                ))}
                <td className="n tot">{brl(total.total)}</td>
                <td className={`n ${total.vencido > 0 ? 'neg' : ''}`}>{total.total ? pct((total.vencido / total.total) * 100) : '–'}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="note">
        Valores no saldo corrigido. Parcela rateada entre centros ou naturezas aparece em cada um com a fração dela (a soma bate com o saldo). Cor da
        célula = peso da faixa no total da linha.
      </p>
    </section>
  );
}

// ─── Maiores devedores e credores ────────────────────────────────────────────────────────────────
export function Maiores({ E, lado }) {
  const [quais, setQuais] = useState('vencido');
  const r = useMemo(() => maiores(E, lado, quais), [E, lado, quais]);
  const receber = lado === 'r';
  return (
    <section className="panel c6" aria-labelledby={`h-mai-${lado}`}>
      <div className="ph">
        <h2 id={`h-mai-${lado}`}>
          {receber ? 'Quem mais me deve' : 'A quem mais devo'}
          <AjudaSecao aba="maiores" rotulo="Maiores devedores e credores" />
        </h2>
        <Seg
          rotulo="Mostrar"
          oculto
          opcoes={[
            ['vencido', 'Vencido'],
            ['prox30', 'Vence em 30 dias'],
          ]}
          valor={quais}
          onChange={setQuais}
        />
      </div>
      <div className="kv">
        <div>
          <span>{quais === 'vencido' ? 'Vencido' : 'Vence em 30 dias'}</span>
          <strong>{brl(r.total)}</strong>
        </div>
        <div>
          <span>{receber ? 'Clientes' : 'Fornecedores'}</span>
          <strong>{nf0.format(r.pessoas)}</strong>
        </div>
        <div>
          <span>Concentração nos 10 maiores</span>
          <strong>{r.total ? pct(r.concentracao) : '–'}</strong>
        </div>
      </div>
      <BarrasH
        rotuloGrande
        aria={receber ? 'Maiores devedores' : 'Maiores credores'}
        itens={r.itens.map((x) => ({
          l: x.nome,
          v: x.valor,
          c: quais === 'vencido' ? (receber ? COR.cenario : COR.saida) : receber ? COR.entrada : COR.neutro,
          titulo: x.nome,
          linhas: [
            [quais === 'vencido' ? 'Vencido' : 'Vence em 30 dias', brl(x.valor)],
            ['Parcelas', nf0.format(x.parcelas)],
            ...(quais === 'vencido' ? [['Maior atraso', dias(x.maiorAtraso)]] : [['Próximo vencimento', dm(x.proximo)]]),
            ['Do total', pct((x.valor / r.total) * 100)],
          ],
        }))}
      />
    </section>
  );
}
