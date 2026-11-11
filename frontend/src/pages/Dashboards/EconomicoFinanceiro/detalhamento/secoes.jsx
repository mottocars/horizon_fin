import { Fragment, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ChevronDown, ChevronRight, Maximize2, Minimize2, Search } from 'lucide-react';
import { AjudaSecao } from '../fluxo/secoes';
import { COR } from '../fluxo/ganchos';
import { COR_ABERTO, MensalGrafico } from './graficos';
import {
  DIMENSOES,
  ORDENS,
  arvore,
  brl,
  codigoPlano,
  dm,
  dma,
  eixo,
  filtrarBusca,
  itensDe,
  lbl,
  mensal,
  nf0,
  nomeCentro,
  nomeDocumento,
  nomeOrigem,
  nomePessoa,
  nomePlano,
  pct,
  resumo,
  rotuloPeriodo,
  soma,
  titulo,
} from './modelo';

// Seções do Detalhamento Financeiro (dashboard Econômico Financeiro). Os números vêm de modelo.js; aqui é o
// desenho.

const tem = (v) => Math.abs(v) >= 0.5;
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const exato = (v) => (Math.abs(v) >= 0.005 ? `${v < 0 ? '−' : ''}${nf2.format(Math.abs(v))}` : '·');
const dias = (n) => `${nf0.format(n)} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`;
const minusculo = (s) => s.toLowerCase().replace(/\bdfc\b/g, 'DFC');

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

// ─── Resumo: entradas, saídas e resultado × realizado, em aberto e total ─────────────────────────
export function Resumo({ E }) {
  const R = useMemo(() => resumo(E), [E]);
  const qtd = (n, um, varios) => `${nf0.format(n)} ${n === 1 ? um : varios}`;
  const hoje = E.B.hoje;
  const linhas = [
    {
      k: 'R',
      rotulo: 'Realizado',
      nota: E.B.contas.length ? `o que entrou e saiu do banco${E.B.extrato_ate ? ` · extrato até ${dm(E.B.extrato_ate)}` : ''}` : 'nenhuma conta com "Projeta DFC"',
      e: [R.R.e, qtd(R.R.ne, 'lançamento', 'lançamentos')],
      s: [R.R.s, qtd(R.R.ns, 'lançamento', 'lançamentos')],
      res: R.R.res,
    },
    {
      k: 'A',
      rotulo: 'Em aberto',
      nota: 'o que vence no período e ainda não foi pago nem recebido',
      e: [R.A.e, `${qtd(R.A.ne, 'parcela', 'parcelas')}${tem(R.A.vencE) ? ` · ${brl(R.A.vencE)} vencidos` : ''}`],
      s: [R.A.s, `${qtd(R.A.ns, 'parcela', 'parcelas')}${tem(R.A.vencS) ? ` · ${brl(R.A.vencS)} vencidos` : ''}`],
      res: R.A.res,
    },
    { k: 'T', rotulo: 'Total', nota: 'realizado + em aberto', e: [R.T.e, null], s: [R.T.s, null], res: R.T.res },
  ];
  return (
    <section className="resumo" aria-label="Resumo do período">
      <div className="rs-cab">
        <span>
          {rotuloPeriodo(E.P.de, E.P.ate)} <AjudaSecao aba="resumo" rotulo="Resumo" />
        </span>
        <span>Entradas</span>
        <span>Saídas</span>
        <span>Resultado</span>
      </div>
      {linhas.map((l) => (
        <div key={l.k} className={`rs-l rs-${l.k}`}>
          <div className="rs-rot">
            <b>{l.rotulo}</b>
            <small>{l.nota}</small>
          </div>
          <div className="rs-v e">
            <strong>{brl(Math.abs(l.e[0]) < 0.005 ? 0 : l.e[0])}</strong>
            {l.e[1] && <small>{l.e[1]}</small>}
          </div>
          <div className="rs-v s">
            <strong>{brl(Math.abs(l.s[0]) < 0.005 ? 0 : l.s[0])}</strong>
            {l.s[1] && <small>{l.s[1]}</small>}
          </div>
          <div className={`rs-v res ${!tem(l.res) ? '' : l.res > 0 ? 'pos' : 'neg'}`}>
            <strong>{brl(Math.abs(l.res) < 0.005 ? 0 : l.res, true)}</strong>
            {l.k === 'T' && <small>resultado total do período</small>}
          </div>
        </div>
      ))}
      <p className="rs-nota">
        Realizado: lançamentos de {dma(E.P.de)} a {dma(E.P.ate > hoje ? hoje : E.P.ate)}. Em aberto: parcelas do Aging List que vencem de {dma(E.P.de)} a {dma(E.P.ate)}, pelo
        saldo corrigido, sem as previsões financeiras.
      </p>
    </section>
  );
}

// ─── Mês a mês: um gráfico do realizado e outro do em aberto ─────────────────────────────────────
// `tipo`: 'R' (realizado — data do lançamento) ou 'A' (em aberto — mês do vencimento).
const GRAFICOS = {
  R: { titulo: 'Realizado mês a mês', cores: [COR.entrada, COR.saida], sufixo: 'realizadas', vazio: 'Nada realizado no período.' },
  A: { titulo: 'Em aberto mês a mês', cores: [COR_ABERTO.entrada, COR_ABERTO.saida], sufixo: 'em aberto', vazio: 'Nada em aberto no período.' },
};
export function Grafico({ E, tipo }) {
  const [verTabela, setVerTabela] = useState(false);
  const meses = useMemo(() => mensal(E), [E]);
  const G = GRAFICOS[tipo];
  const [ke, ks, kr, ka] = [`e${tipo}`, `s${tipo}`, `res${tipo}`, `acum${tipo}`];
  const tot = (k) => soma(meses.map((m) => m[k]));
  const vazio = !meses.some((m) => tem(m[ke]) || tem(m[ks]));
  return (
    <section className="panel c12" aria-labelledby={`h-mes-${tipo}`}>
      <div className="ph">
        <h2 id={`h-mes-${tipo}`}>
          {G.titulo}
          <AjudaSecao aba="grafico" rotulo="Mês a mês" />
        </h2>
      </div>
      {vazio ? (
        <div className="empty">{tipo === 'R' && !E.B.contas.length ? 'Nenhuma conta com "Projeta DFC" nesta empresa: não há realizado.' : G.vazio}</div>
      ) : (
        <>
          <div className="legend">
            <span>
              <i className="box" style={{ background: G.cores[0] }} />
              Entradas {G.sufixo}
            </span>
            <span>
              <i className="box" style={{ background: G.cores[1] }} />
              Saídas {G.sufixo}
            </span>
            <span>
              <i style={{ borderColor: COR.ink }} />
              Resultado do mês
            </span>
          </div>
          <MensalGrafico meses={meses} tipo={tipo} cores={G.cores} />
          <div>
            <button type="button" className="btn ghost" onClick={() => setVerTabela((v) => !v)} aria-expanded={verTabela}>
              {verTabela ? 'Esconder a tabela' : 'Ver a tabela'}
            </button>
          </div>
          {verTabela && (
            <div className="tbl">
              <table className="tab">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className="n">Entradas</th>
                    <th className="n">Saídas</th>
                    <th className="n">Resultado</th>
                    <th className="n">Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {meses.map((m) => (
                    <tr key={m.mes} className={m.atual ? 'sel' : ''}>
                      <td>{lbl(m.mes)}</td>
                      <td className="n">{tem(m[ke]) ? brl(m[ke]) : '–'}</td>
                      <td className="n">{tem(m[ks]) ? brl(m[ks]) : '–'}</td>
                      <td className={`n ${m[kr] >= 0 ? 'pos' : 'neg'}`}>{tem(m[kr]) ? brl(m[kr], true) : '–'}</td>
                      <td className={`n ${m[ka] >= 0 ? '' : 'neg'}`}>{brl(m[ka], true)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td className="n">{brl(tot(ke))}</td>
                    <td className="n">{brl(tot(ks))}</td>
                    <td className={`n ${tot(kr) >= 0 ? 'pos' : 'neg'}`}>{brl(tot(kr), true)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ─── Detalhamento (árvore até o lançamento): entradas e saídas lado a lado, como no Aging List ──
const PADRAO_NIVEIS = ['centro', 'natureza', 'pessoa'];
const LIMITE = { 0: 60, outros: 40, itens: 25 };

function Valores({ r, a, folha = false }) {
  const f = folha ? exato : (v) => eixo(v);
  const ha = folha ? (v) => Math.abs(v) >= 0.005 : tem;
  return (
    <>
      <td className={`c${ha(r) ? '' : ' z'}`}>{ha(r) ? f(r) : '·'}</td>
      <td className={`c ab${ha(a) ? '' : ' z'}`}>{ha(a) ? f(a) : '·'}</td>
      <td className="n tot">{folha ? exato(r + a) : brl(r + a)}</td>
    </>
  );
}

function ArvoreLado({ E, lado, linhas, niveis, ordem, onOrdem, filtrado }) {
  const [abertos, setAbertos] = useState(() => new Set());
  const [limites, setLimites] = useState({});
  const { B } = E;
  const raiz = useMemo(() => (niveis.length ? arvore(E, linhas, niveis, ordem) : []), [E, linhas, niveis.join(), ordem]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = useMemo(() => {
    let r = 0;
    let a = 0;
    linhas.forEach((x) => (x.tipo === 'R' ? (r += x.valor) : (a += x.valor)));
    return { r, a };
  }, [linhas]);
  const alternar = (id) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const mais = (id, padrao) => setLimites((l) => ({ ...l, [id]: (l[id] || padrao) * 3 }));

  function linhasItens(no, nivel) {
    const lista = itensDe(no.linhas, ordem);
    const lim = limites[`${no.id}#i`] || LIMITE.itens;
    return [
      ...lista.slice(0, lim).map(({ x, valor, frac }) => {
        const real = x.tipo === 'R';
        const it = real ? x.L : x.T;
        const quando = real
          ? it.vc
            ? `venc. ${dma(it.vc)}`
            : null
          : it.atraso > 0
            ? `vencido há ${dias(it.atraso)}`
            : it.atraso === 0
              ? 'vence hoje'
              : `vence em ${dias(-it.atraso)}`;
        const extra = [
          real ? `Realizado · ${nomeOrigem(it.o)}${it.conta ? ` · ${titulo(it.conta.nome)}` : ''}` : 'Em aberto',
          quando,
          it.doc || it.n ? `${nomeDocumento(B, it.doc)}${it.n ? ` ${it.n}` : ''}`.trim() : null,
          it.u ? `unid. ${it.u}` : null,
          !niveis.includes('natureza') && x.nat !== null ? `${codigoPlano(B, x.nat)} ${nomePlano(B, x.nat)}` : null,
          !niveis.includes('centro') ? nomeCentro(B, x.centro) : null,
          frac < 0.999 ? `rateio ${pct(frac * 100)}` : null,
        ].filter(Boolean);
        const pessoa = !niveis.includes('pessoa') || !it.b ? nomePessoa(B, x) : null;
        const desc = [pessoa, real && it.ds ? titulo(it.ds) : null].filter(Boolean).join(' — ');
        return (
          <tr key={`${no.id}#${x.tipo}${real ? it.i : `${it.l}${it.b}/${it.p}`}`} className={`parc${real ? '' : ' aberto-item'}`}>
            <td className="nm" style={{ paddingLeft: 12 + nivel * 16 }}>
              <div className="lin">
                <div className="txt">
                  <b title={desc}>
                    <span className="data">{dma(real ? it.d : it.v)}</span>
                    {it.b !== undefined && (
                      <span className="titulo">
                        {it.b}/{it.p}
                      </span>
                    )}
                    {desc && <span className="desc">{desc}</span>}
                    {!real && it.atraso > 0 ? <span className="tag">Vencido</span> : null}
                  </b>
                  <small title={extra.join(' · ')}>{extra.join(' · ')}</small>
                </div>
              </div>
            </td>
            <Valores r={real ? valor : 0} a={real ? 0 : valor} folha />
          </tr>
        );
      }),
      lista.length > lim && (
        <tr key={`${no.id}#mais`} className="mais">
          <td colSpan={4} style={{ paddingLeft: 12 + nivel * 16 }}>
            <button type="button" onClick={() => mais(`${no.id}#i`, LIMITE.itens)}>
              Mostrar mais ({nf0.format(lista.length - lim)} restantes)
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
        const partes = [no.nr ? `${nf0.format(no.nr)} ${no.nr === 1 ? 'lançamento' : 'lançamentos'}` : null, no.na ? `${nf0.format(no.na)} em aberto` : null, tem(no.venc) ? `${brl(no.venc)} vencidos` : null];
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
              <td className="nm" style={{ paddingLeft: 8 + nivel * 16 }}>
                <div className="lin">
                  <Caret size={15} className="car" />
                  <div className="txt">
                    <b title={no.nome}>{no.nome}</b>
                    <small>{partes.filter(Boolean).join(' · ')}</small>
                  </div>
                </div>
              </td>
              <Valores r={no.r} a={no.a} />
            </tr>
            {aberto && (no.filhos ? linhasNos(no.filhos(), nivel + 1, no.id) : linhasItens(no, nivel + 1))}
          </Fragment>
        );
      }),
      nos.length > lim && (
        <tr key={`${idPai}#mais`} className="mais">
          <td colSpan={4} style={{ paddingLeft: 12 + nivel * 16 }}>
            <button type="button" onClick={() => mais(idPai, padrao)}>
              Mostrar mais ({nf0.format(nos.length - lim)} restantes)
            </button>
          </td>
        </tr>
      ),
    ];
  }

  const entradas = lado === 'e';
  return (
    <div className={`det-lado ${entradas ? 'r' : 'p'}`}>
      <div className="det-cab">
        <h3>{entradas ? 'Entradas' : 'Saídas'}</h3>
        <span>{brl(total.r + total.a)}</span>
      </div>
      <div className="ag-wrap">
        {!raiz.length ? (
          <div className="empty" style={{ padding: 14 }}>
            {filtrado ? 'Nada com essa busca.' : `Nenhuma ${entradas ? 'entrada' : 'saída'} no período.`}
          </div>
        ) : (
          <table className="ag realizado">
            <thead>
              <tr>
                <th className="nmh">{niveis.map((d) => DIMENSOES[d].rotulo).join(' › ')}</th>
                {[
                  ['realizado', 'Realizado', 'O que já entrou ou saiu do banco'],
                  ['aberto', 'Em aberto', 'O que vence no período e ainda não foi pago nem recebido'],
                  ['total', 'Total', 'Realizado + em aberto'],
                ].map(([k, rotulo, dica]) => (
                  <th key={k} className={`ordena${ordem === k ? ' ord' : ''}`} title={`${dica} — clique para ordenar por esta coluna`} aria-sort={ordem === k ? 'descending' : undefined} onClick={() => onOrdem(k)}>
                    {rotulo}
                    {ordem === k && <ArrowDown size={12} aria-hidden="true" />}
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
                    {nf0.format(raiz.length)} {raiz.length === 1 ? 'grupo' : 'grupos'}
                  </small>
                </td>
                <Valores r={total.r} a={total.a} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

export function Detalhamento({ E }) {
  const [niveis, setNiveis] = useState(PADRAO_NIVEIS);
  const [busca, setBusca] = useState('');
  const [telaCheia, setTelaCheia] = useState(false);
  const [ordem, setOrdem] = useState('total');
  const opcoesDim = Object.keys(DIMENSOES);
  const validos = niveis.filter((n, i) => n && opcoesDim.includes(n) && niveis.indexOf(n) === i);

  // Tela cheia (como no Aging List): pede também a do navegador; o Esc sai.
  useEffect(() => {
    if (!telaCheia) return undefined;
    const doc = document.documentElement;
    if (!document.fullscreenElement && doc.requestFullscreen) doc.requestFullscreen().catch(() => {});
    const aoTrocar = () => {
      if (!document.fullscreenElement) setTelaCheia(false);
    };
    const aoTeclar = (e) => {
      if (e.key === 'Escape') setTelaCheia(false);
    };
    document.addEventListener('fullscreenchange', aoTrocar);
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('fullscreenchange', aoTrocar);
      window.removeEventListener('keydown', aoTeclar);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [telaCheia]);

  const porLado = useMemo(() => {
    const ls = filtrarBusca(E, E.pecas, busca);
    return { e: ls.filter((x) => x.lado === 'e'), s: ls.filter((x) => x.lado === 's') };
  }, [E, busca]);

  const mudarNivel = (i, v) => {
    const n = niveis.slice(0, 3);
    n[i] = v;
    setNiveis(v ? n : n.slice(0, i));
  };

  return (
    <section className={`panel c12${telaCheia ? ' tela-cheia' : ''}`} aria-labelledby="h-det">
      <div className="ph">
        <h2 id="h-det">
          Detalhamento por {validos.map((d) => minusculo(DIMENSOES[d].rotulo)).join(' › ') || '…'}
          <AjudaSecao aba="detalhamento" rotulo="Detalhamento" />
        </h2>
      </div>
      <div className="det-bar">
        <div className="ctl">
          <span className="rot">Agrupar por</span>
          <div className="niveis">
            {[0, 1, 2].map((i) => (
              <Fragment key={i}>
                {i > 0 && <ChevronRight size={14} />}
                <select aria-label={`Nível ${i + 1}`} value={opcoesDim.includes(niveis[i]) ? niveis[i] : ''} onChange={(e) => mudarNivel(i, e.target.value)} disabled={i > 0 && !validos[i - 1]}>
                  {i > 0 && <option value="">—</option>}
                  {opcoesDim.map((d) => (
                    <option key={d} value={d} disabled={niveis.some((n, k) => k !== i && n === d)}>
                      {DIMENSOES[d].rotulo}
                    </option>
                  ))}
                </select>
              </Fragment>
            ))}
          </div>
        </div>
        <Seg rotulo="Ordenar por" opcoes={ORDENS} valor={ordem} onChange={setOrdem} />
        <div className="ctl busca">
          <span className="rot">Buscar</span>
          <div style={{ position: 'relative' }}>
            <Search size={14} />
            <input type="search" placeholder="Cliente, fornecedor, título, documento, centro, plano…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <button
          type="button"
          className="btn ghost icone tela-cheia-btn"
          onClick={() => setTelaCheia((t) => !t)}
          title={telaCheia ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
          aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
        >
          {telaCheia ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
      <div className="det-duas">
        {/* A chave recria a árvore (e fecha os grupos) quando o agrupamento muda. */}
        {['e', 's'].map((l) => (
          <ArvoreLado key={`${l}|${validos.join()}`} E={E} lado={l} linhas={porLado[l]} niveis={validos} ordem={ordem} onOrdem={setOrdem} filtrado={!!busca} />
        ))}
      </div>
    </section>
  );
}
