import { Fragment, useMemo, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { AjudaSecao } from '../fluxo/secoes';
import { BarrasH } from '../fluxo/graficos';
import { COR } from '../fluxo/ganchos';
import { brl, pct } from '../fluxo/modelo';
import { EvolucaoPoc, Ponte, ResultadoMensal, Sankey, coresDestinos } from './graficos';
import { PRESETS, deCada100, fluxoDaReceita, indicadores, pp, presetDe, rotuloPeriodo, simular } from './modelo';

// Seções do painel da Demonstração do Resultado. As contas ficam em modelo.js; aqui é só o desenho.

function Status({ s }) {
  return <span className={`st ${s.tom}`}>{s.texto}</span>;
}
const Partes = ({ partes }) => partes.map((p, i) => (typeof p === 'string' ? p : <b key={i}>{p.b}</b>));
const pctOuTraco = (f) => (f === null || f === undefined ? '–' : pct(f * 100));

// ─── Indicadores (8 tiles) ───────────────────────────────────────────────────────────────────────
export function Tiles({ D }) {
  return (
    <section className="tiles" aria-label="Indicadores principais">
      {indicadores(D).map((t) => (
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

// ─── Para onde foi a receita (Sankey) ────────────────────────────────────────────────────────────
export function FluxoReceita({ D, escopo }) {
  const F = useMemo(() => fluxoDaReceita(D), [D]);
  const cores = useMemo(() => coresDestinos(F), [F]);
  const cem = deCada100(F);
  return (
    <section className="panel hero c12" aria-labelledby="h-sankey">
      <div className="ph">
        <h2 id="h-sankey">
          Para onde foi cada real que entrou
          <AjudaSecao aba="sankey" rotulo="Para onde foi a receita" />
        </h2>
        <p>
          {rotuloPeriodo(D.meta.de, D.meta.ate)} · {escopo}. À esquerda, de onde veio cada real reconhecido na DRE; à direita, o que cada grupo consumiu e o
          que sobrou de resultado.
        </p>
      </div>
      {!F ? (
        <div className="empty">Sem receita reconhecida no período.</div>
      ) : (
        <>
          <Sankey F={F} />
          <p className="note">Escala ampliada: as linhas pequenas ganham uma altura mínima para aparecer — o valor e o percentual de cada bloco estão no rótulo e ao passar o mouse.</p>
          <div className="cem" aria-label="De cada R$ 100 que entraram">
            <span className="cem-rot">De cada R$ 100 que entraram</span>
            <div className="cem-barra">
              {cem.map((c, i) => (
                <div key={c.rotulo} style={{ flex: Math.max(0.0001, c.valor), background: cores.get(F.col2[i].id) }} title={`${c.rotulo}: R$ ${c.valor.toFixed(2).replace('.', ',')}`} />
              ))}
            </div>
            <div className="cem-itens">
              {cem.map((c, i) => (
                <span key={c.rotulo} className={c.tipo === 'lucro' ? 'lucro' : ''}>
                  <i style={{ background: cores.get(F.col2[i].id) }} />
                  {c.rotulo} <b>R$ {c.valor.toFixed(2).replace('.', ',')}</b>
                </span>
              ))}
              {F.resultado < -0.5 && (
                <span className="prejuizo">
                  <i style={{ background: COR.crit }} />
                  faltaram <b>R$ {((-F.resultado / F.entradas) * 100).toFixed(2).replace('.', ',')}</b> — prejuízo
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ─── Simulador ───────────────────────────────────────────────────────────────────────────────────
const ALAVANCAS = [
  { chave: 'vendas', rotulo: 'Vendas do período', min: -50, max: 50, passo: 5, un: '%', dica: 'Mais ou menos contratos assinados no período: muda a receita deles pela POC de hoje e o custo da fração vendida.' },
  { chave: 'avanco', rotulo: 'Avanço de obra a mais', min: 0, max: 30, passo: 1, un: ' p.p.', dica: 'Obra executada a mais no período: a carteira vendida reconhece mais receita e o custo gasto a mais entra no CIV pela fração vendida.' },
  { chave: 'orcamento', rotulo: 'Revisão do orçamento de obra', min: -10, max: 30, passo: 1, un: '%', dica: 'Orçamento maior derruba a POC (custo ÷ orçamento) e a receita reconhecida recua junto.' },
  { chave: 'estoque', rotulo: 'Vender estoque agora', min: 0, max: 100, passo: 5, un: '%', dica: 'Vender parte do estoque pelo valor estimado: receita × POC de hoje e o custo dessa fração no CIV.' },
  { chave: 'despesas', rotulo: 'Despesas operacionais', min: -30, max: 30, passo: 5, un: '%', dica: 'Despesas sem POC entre o Lucro Bruto e o EBITDA (administrativas, marketing…).' },
];

export function Simulador({ D }) {
  const [preset, setPreset] = useState('cons');
  const [p, setP] = useState({ ...PRESETS.cons });
  const sim = useMemo(() => simular(D, p), [D, p]);
  const mudar = (patch) => {
    const novo = { ...p, ...patch };
    setP(novo);
    setPreset(presetDe(novo));
  };
  const { base, cen, contrib } = sim;
  const nomeCen = preset ? PRESETS[preset].label : 'Cenário';
  const linhas = [
    { k: D.nomes.rl, b: base.rl, c: cen.rl },
    { k: D.nomes.lb, b: base.lb, c: cen.lb, mb: base.mb, mc: cen.mb },
    ...(D.k.ebitda ? [{ k: D.nomes.eb, b: base.eb, c: cen.eb, mb: base.me, mc: cen.me }] : []),
    { k: D.nomes.ll, b: base.ll, c: cen.ll, mb: base.ml, mc: cen.ml },
  ];
  const dif = (cen.ll ?? 0) - (base.ll ?? 0);
  const tom = (cen.ll ?? 0) < 0 ? 'crit' : dif < -0.5 ? 'warn' : dif > 0.5 ? 'good' : 'info';
  return (
    <section className="panel hero c12" aria-labelledby="h-sim">
      <div className="ph">
        <h2 id="h-sim">
          E se? O resultado em outro cenário
          <AjudaSecao aba="simulador" rotulo="Simulador" />
        </h2>
        <p>O realizado do período refeito com as alavancas ao lado, pela mesma lógica da POC. Nada é gravado.</p>
      </div>
      <div className="hero-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div className={`kv k${linhas.length} juntos`}>
            {linhas.map((l) => (
              <div key={l.k}>
                <span>{l.k}</span>
                <strong className={(l.c ?? 0) < 0 ? 'neg' : ''}>{brl(l.c)}</strong>
                <small>
                  realizado {brl(l.b)}
                  {l.mb !== undefined && ` · margem ${pctOuTraco(l.mb)} → ${pctOuTraco(l.mc)}`}
                </small>
              </div>
            ))}
          </div>
          <div className={`alerta ${tom}`}>
            <span>
              {Math.abs(dif) < 0.5 ? (
                <>
                  Sem alavanca mexida: o cenário é o <b>realizado</b>.
                </>
              ) : (
                <>
                  No cenário <b>{nomeCen}</b>, o {D.nomes.ll.toLowerCase()} {dif < 0 ? 'cai' : 'sobe'} de <b>{brl(base.ll)}</b> para <b>{brl(cen.ll)}</b> ({brl(dif, true)}
                  {cen.ml !== null ? `, margem líquida ${pctOuTraco(cen.ml)}` : ''}).
                  {(cen.ll ?? 0) < 0 && ' O período fecharia no prejuízo.'}
                </>
              )}
            </span>
          </div>
          <Ponte base={base.ll ?? 0} contrib={contrib} cen={cen.ll ?? 0} rotuloBase={`${D.nomes.ll} realizado`} rotuloCen={`${D.nomes.ll} no cenário`} />
        </div>
        <aside className="sim" aria-label="Alavancas do cenário">
          <h3>Simulador de cenário</h3>
          <div className="presets" role="group" aria-label="Cenários prontos">
            {Object.entries(PRESETS).map(([k, v]) => (
              <button
                key={k}
                type="button"
                aria-pressed={preset === k}
                onClick={() => {
                  setPreset(k);
                  setP({ ...v });
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
          {ALAVANCAS.map((a) => (
            <div key={a.chave} className="range" title={a.dica}>
              <div className="row">
                <label htmlFor={`s-${a.chave}`}>{a.rotulo}</label>
                <output>
                  {p[a.chave] > 0 && a.chave !== 'estoque' && a.chave !== 'avanco' ? '+' : ''}
                  {p[a.chave]}
                  {a.un}
                </output>
              </div>
              <input id={`s-${a.chave}`} type="range" min={a.min} max={a.max} step={a.passo} value={p[a.chave]} onChange={(e) => mudar({ [a.chave]: +e.target.value })} />
              <small className="dica-alavanca">{a.dica}</small>
            </div>
          ))}
        </aside>
      </div>
    </section>
  );
}

// ─── Resultado mês a mês ─────────────────────────────────────────────────────────────────────────
export function Mensal({ D }) {
  const anoAnt = D.meta.anterior.de.slice(0, 4);
  return (
    <section className="panel c12" aria-labelledby="h-mes">
      <div className="ph">
        <h2 id="h-mes">
          Resultado mês a mês
          <AjudaSecao aba="mensal" rotulo="Resultado mês a mês" />
        </h2>
        <div className="legend">
          <span>
            <i className="box" style={{ background: COR.entrada }} />
            {D.nomes.rl}
          </span>
          <span>
            <i className="box" style={{ background: '#2e9d55' }} />
            {D.nomes.lb}
          </span>
          <span>
            <i className="box" style={{ background: COR.ink, borderRadius: '50%' }} />
            {D.nomes.ll}
          </span>
          <span>
            <i className="dash" style={{ borderColor: COR.ink2 }} />
            {D.nomes.rl} em {anoAnt}
          </span>
        </div>
      </div>
      <ResultadoMensal D={D} />
    </section>
  );
}

// ─── De onde veio a receita ──────────────────────────────────────────────────────────────────────
export function OrigemReceita({ D }) {
  const c = D.poc.carteira;
  return (
    <section className="panel c5" aria-labelledby="h-origem">
      <div className="ph">
        <h2 id="h-origem">
          De onde veio a receita
          <AjudaSecao aba="origem" rotulo="De onde veio a receita" />
        </h2>
        <p>
          {D.nomes.rb} de {brl(D.atual.rb)} aberta pelo que a gerou.
          {c.fatiaObra !== null && (
            <>
              {' '}
              <b>{pct(c.fatiaObra * 100)}</b> do que as obras reconheceram veio do <b>avanço da obra</b> sobre o que já estava vendido.
            </>
          )}
        </p>
      </div>
      <BarrasH
        rotuloGrande
        aria="Origem da receita bruta"
        itens={D.origem.map((o) => ({
          l: o.rotulo,
          v: o.valor,
          c: o.chave === 'obra' ? COR.accent : o.valor < 0 ? COR.saida : COR.entrada,
          titulo: o.rotulo,
          linhas: [
            ['Valor', brl(o.valor, true)],
            [`% da ${D.nomes.rb.toLowerCase()}`, D.atual.rb ? pct((o.valor / D.atual.rb) * 100) : '–'],
            ['Como', o.dica],
          ],
        }))}
      />
    </section>
  );
}

// ─── Quem gera resultado ─────────────────────────────────────────────────────────────────────────
function Barra({ v, mx }) {
  const p = mx ? (Math.abs(v) / mx) * 50 : 0;
  return (
    <div className="bar">
      <div className="z" style={{ left: '50%' }} />
      <div className="b" style={{ left: v >= 0 ? '50%' : `${50 - p}%`, width: `${p}%`, background: v >= 0 ? 'var(--s-in)' : 'var(--s-out)' }} />
    </div>
  );
}

export function QuemGera({ D, centroSel, onCentro }) {
  const linhas = D.centros.filter((c) => [c.rl, c.lb, c.ll].some((v) => v && Math.abs(v) > 0.5)).sort((a, b) => (b.ll ?? 0) - (a.ll ?? 0));
  const mx = Math.max(1, ...linhas.map((c) => Math.abs(c.ll ?? 0)));
  return (
    <section className="panel c7" aria-labelledby="h-centros">
      <div className="ph">
        <h2 id="h-centros">
          Quem gera resultado
          <AjudaSecao aba="centros" rotulo="Quem gera resultado" />
        </h2>
        <p>Cada centro de custo no período, do que mais gera ao que mais consome. Clique numa linha para filtrar o painel.</p>
      </div>
      <div className="tbl">
        {!linhas.length ? (
          <div className="empty">Nenhum centro com valores no período.</div>
        ) : (
          <table className="tab">
            <thead>
              <tr>
                <th>Centro</th>
                <th className="n">{D.nomes.rl}</th>
                <th className="n">Margem bruta</th>
                <th className="n">{D.nomes.ll}</th>
                <th style={{ minWidth: 120 }} />
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <tr
                  key={c.id}
                  className={`clk${centroSel === c.id ? ' sel' : ''}`}
                  tabIndex={0}
                  onClick={() => onCentro(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onCentro(c.id);
                    }
                  }}
                >
                  <td>
                    {c.nome}
                    {c.natureza && c.natureza !== 'OBRA' && <span className="flag w">{c.natureza === 'ADMINISTRATIVO' ? 'ADM' : c.natureza}</span>}
                  </td>
                  <td className="n">{brl(c.rl)}</td>
                  <td className={`n ${c.mb !== null && c.mb < 0 ? 'neg' : ''}`}>{pctOuTraco(c.mb)}</td>
                  <td className={`n ${(c.ll ?? 0) >= 0 ? 'pos' : 'neg'}`}>{brl(c.ll, true)}</td>
                  <td>
                    <Barra v={c.ll ?? 0} mx={mx} />
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

// ─── Carteira de obras pela POC ──────────────────────────────────────────────────────────────────
function Progresso({ f, ini, cor, rotulo }) {
  const v = Math.max(0, Math.min(1, f ?? 0));
  const i = ini === null || ini === undefined ? null : Math.max(0, Math.min(1, ini));
  return (
    <div className="prog" title={rotulo}>
      <div className="prog-trilho">
        {i !== null && <div className="prog-ini" style={{ width: `${i * 100}%` }} />}
        <div className="prog-fim" style={{ left: i !== null ? `${i * 100}%` : 0, width: `${Math.max(0, v - (i ?? 0)) * 100}%`, background: cor }} />
      </div>
      <span>{f === null || f === undefined ? '–' : pct(f * 100)}</span>
    </div>
  );
}

function ContaObra({ D, o }) {
  const linhasRec = D.poc.linhas.filter((l) => l.tipo === 'RECEITA');
  return (
    <div className="conta-obra">
      <div className="eyebrow">Como a receita da obra chegou no período</div>
      <table className="tab mini">
        <thead>
          <tr>
            <th>Linha</th>
            <th className="n">Acumulado</th>
            <th className="n">POC</th>
            <th className="n">Reconhecido</th>
            <th className="n">Já antes</th>
            <th className="n">No período</th>
            <th className="n">A reconhecer</th>
          </tr>
        </thead>
        <tbody>
          {linhasRec.map((l) => {
            const x = o.foto.linhas[l.id];
            if (!x || [x.acumulado, x.reconhecido, x.periodo].every((v) => Math.abs(v) < 0.5)) return null;
            return (
              <tr key={l.id}>
                <td>{l.nome}</td>
                <td className="n">{brl(x.acumulado)}</td>
                <td className="n">{pct(x.poc * 100)}</td>
                <td className="n">{brl(x.reconhecido)}</td>
                <td className="n">{brl(-x.anterior)}</td>
                <td className={`n ${x.periodo < 0 ? 'neg' : ''}`}>
                  <b>{brl(x.periodo)}</b>
                </td>
                <td className="n">{brl(x.a_reconhecer)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="note">
        Do período: <b>{brl(o.recObra)}</b> vieram do avanço da obra sobre o que já estava vendido e <b>{brl(o.recVendas)}</b> das vendas novas, já pela POC de hoje.
      </p>
    </div>
  );
}

export function CarteiraPoc({ D, onRastreio }) {
  const [aberta, setAberta] = useState(null);
  const obras = D.poc.obras;
  const c = D.poc.carteira;
  return (
    <section className="panel c12" aria-labelledby="h-carteira">
      <div className="ph carteira-ph">
        <h2 id="h-carteira">
          Carteira de obras pela POC
          <AjudaSecao aba="carteira" rotulo="Carteira de obras pela POC" />
        </h2>
        <button type="button" className="btn ghost icone com-texto" onClick={() => onRastreio(null)} title="Rastreio completo da POC em tela cheia">
          <Maximize2 size={15} />
          Rastreio completo
        </button>
      </div>
      <div className="kv k4">
        <div>
          <span>Obra executada da carteira</span>
          <strong>{pctOuTraco(c.pocR)}</strong>
          <small>{pp(c.pocR === null || c.pocRIni === null ? null : c.pocR - c.pocRIni)} no período</small>
        </div>
        <div>
          <span>Orçamento a executar</span>
          <strong>{brl(c.saldo)}</strong>
          <small>de {brl(c.orcamento)} orçados</small>
        </div>
        <div>
          <span>Receita a apropriar</span>
          <strong>{brl(c.aRecReceita)}</strong>
          <small>entra na DRE conforme a obra anda</small>
        </div>
        <div>
          <span>Resultado a apropriar</span>
          <strong className={c.margemApropriar < 0 ? 'neg' : ''}>{brl(c.margemApropriar)}</strong>
          <small>
            {brl(c.aRecReceita - c.aRecSemOrcamento)} − {brl(-c.custoAApropriar)} de custo a incorrer · margem {pctOuTraco(c.margemApropriarPct)}
            {c.semOrcamento.length > 0 && ` · sem ${c.semOrcamento.map((o) => o.nome).join(', ')} (sem orçamento)`}
          </small>
        </div>
      </div>
      <div className="legend">
        <span>
          <i className="box" style={{ background: 'var(--accent-soft)' }} />
          até o início do período
        </span>
        <span>
          <i className="box" style={{ background: COR.entrada }} />
          obra executada no período
        </span>
        <span>
          <i className="box" style={{ background: COR.cenario }} />
          vendido no período
        </span>
        <span style={{ color: 'var(--muted)' }}>Clique numa obra para ver a evolução mês a mês e a conta da receita.</span>
      </div>
      <div className="tbl">
        {!obras.length ? (
          <div className="empty">Nenhuma obra (centro com natureza Obra e "Realiza DRE") no escopo.</div>
        ) : (
          <table className="tab carteira">
            <thead>
              <tr>
                <th>Obra</th>
                <th style={{ minWidth: 170 }}>Obra executada</th>
                <th style={{ minWidth: 170 }}>Vendido (líquido)</th>
                <th className="n">Receita no período</th>
                <th className="n">Receita a apropriar</th>
                <th className="n">Resultado a apropriar</th>
                <th className="n">Obra a executar</th>
                <th className="n">Estoque</th>
              </tr>
            </thead>
            <tbody>
              {obras.map((o) => (
                <Fragment key={o.id}>
                  <tr className={`clk${aberta === o.id ? ' sel' : ''}`} tabIndex={0} onClick={() => setAberta((a) => (a === o.id ? null : o.id))}>
                    <td>
                      <b>{o.nome}</b>
                    </td>
                    <td>
                      <Progresso f={o.pocR} ini={o.pocRIni} cor={COR.entrada} rotulo={`Obra executada: ${pctOuTraco(o.pocR)} (${pp(o.pocR === null || o.pocRIni === null ? null : o.pocR - o.pocRIni)} no período)`} />
                    </td>
                    <td>
                      <Progresso f={o.vendida} ini={o.vendidaIni} cor={COR.cenario} rotulo={`Vendido líquido: ${pctOuTraco(o.vendida)} (${pp(o.vendida - o.vendidaIni)} no período)`} />
                    </td>
                    <td className={`n ${o.recPeriodo < 0 ? 'neg' : ''}`}>{brl(o.recPeriodo)}</td>
                    <td className="n">{brl(o.aRecReceita)}</td>
                    <td className={`n ${o.margemApropriar !== null && o.margemApropriar < 0 ? 'neg' : ''}`}>
                      {o.margemApropriar === null ? (
                        <span className="sub-aviso">sem orçamento</span>
                      ) : (
                        <>
                          {brl(o.margemApropriar)}
                          <small className="sub">{o.aRecReceita ? pctOuTraco(o.margemApropriarPct) : 'nada a apropriar'}</small>
                        </>
                      )}
                    </td>
                    <td className={`n ${o.estourada ? 'neg' : ''}`}>
                      {o.saldo === null ? (
                        <span className="sub-aviso">sem orçamento</span>
                      ) : o.estourada ? (
                        <>
                          estourada
                          <small className="sub">custo {brl(-o.saldo)} acima</small>
                        </>
                      ) : (
                        brl(o.saldo)
                      )}
                    </td>
                    <td className="n">
                      {o.un?.estoque.qtd ?? 0} un
                      <small className="sub">{brl(o.un?.estoque.valor ?? 0)}</small>
                    </td>
                  </tr>
                  {aberta === o.id && (
                    <tr className="detalhe-obra">
                      <td colSpan={8}>
                        <div className="detalhe-grade">
                          <div>
                            <div className="legend">
                              <span>
                                <i style={{ borderColor: COR.entrada }} />
                                Obra executada
                              </span>
                              <span>
                                <i style={{ borderColor: COR.cenario }} />
                                Vendido (líquido)
                              </span>
                            </div>
                            <EvolucaoPoc obra={o} />
                          </div>
                          <div>
                            <ContaObra D={D} o={o} />
                            <button type="button" className="btn ghost" onClick={() => onRastreio(o.id)}>
                              Rastreio completo de {o.nome}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
