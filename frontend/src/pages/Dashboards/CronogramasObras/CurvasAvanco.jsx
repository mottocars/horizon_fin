import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { listCurvasAvanco } from '../../../api/dfcAvancos.api';
import { listCronogramaCentros } from '../../../api/cronogramaCentros.api';
import { montarObras, nomeObra, opcoesFiltroObras } from '../../Operacoes/CronogramasObras/cronogramaObras';
import { somarDias } from '../../CentrosCusto/cronogramaDatas';
import iconCaixa from '../../../assets/integracoes/portal-construtoras.svg';
import iconPrevision from '../../../assets/integracoes/prevision.svg';
import { lbl, pct } from '../EconomicoFinanceiro/fluxo/modelo';
import { COR, useDica, useLargura } from '../EconomicoFinanceiro/fluxo/ganchos';
import { dataBr, periodoAnterior, periodoDe, periodosEntre, rotuloCurto, rotuloLongo, valorEm } from './periodosAvanco';

// Obra 360º › Avanço das Obras: "Avanço por obra" (pedido do usuário) — uma linha-cartão por obra com
// Prevision (retângulo baixo na largura toda, não linha de tabela): a etapa da carteira de obras em
// que ela está hoje (a mesma conta da Carteira — montarObras/situacaoHoje —, com o mês da etapa na
// numeração do Gantt: "mês 18 de 32", e o mês em que a etapa começa e termina) e o avanço acumulado em
// três colunas: Caixa (PLS — só o realizado, até a última parcela liberada, com a data dela), Prevision
// do orçamento primário e do secundário (realizado até hoje × previsto no fim do período da visão: o
// último dia do mês, o sábado da semana ou hoje — pedido do usuário). Clicar abre embaixo os três
// gráficos da obra na visão escolhida (Mensal, Semanal ou Diária) e no De/Até (vazio = a obra inteira).
// Dados do /dfc-avancos/:empresa/curvas: as curvas por data, agrupadas aqui (periodosAvanco.js).

// No cabeçalho das colunas, a logomarca do sistema e, ao lado, o nome da coluna.
const SERIES = [
  { chave: 'caixa', rotulo: 'Caixa (PLS)', cor: COR.entrada, logo: iconCaixa, sub: 'PLS' },
  { chave: 'primaria', rotulo: 'Prevision · orçamento primário', cor: COR.entrada, logo: iconPrevision, sub: 'Primário' },
  { chave: 'secundaria', rotulo: 'Prevision · orçamento secundário', cor: COR.cenario, logo: iconPrevision, sub: 'Secundário' },
];
const vazio = (v) => v === null || v === undefined;
const mesIso = (iso) => (iso ? lbl(iso.slice(0, 7)) : '–');

// Mês da etapa como no Gantt (GanttObras › BarraObra): o mês de início é o 1; o total vai até o dia
// seguinte ao fim, arredondado (5 anos de Pós Obra dão 60, não 61). Sem fim: total desconhecido.
const idxMes = (iso) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const posMes = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return idxMes(iso) + (d - 1) / new Date(Date.UTC(a, m, 0)).getUTCDate();
};
function etapaHoje(obra, hoje) {
  if (!obra) return { tipo: 'sem' };
  const { situacao } = obra;
  if (situacao.tipo !== 'etapa') return situacao;
  const seg = situacao.segmento;
  const total = seg.fim ? Math.max(1, Math.round(posMes(somarDias(seg.fim, 1)) - posMes(seg.inicio))) : null;
  const atual = idxMes(hoje) - idxMes(seg.inicio) + 1;
  return { tipo: 'etapa', segmento: seg, atual: total ? Math.min(atual, total) : atual, total };
}
// O Prevision às vezes soma 100,03% por arredondamento: na tela, no máximo 100%.
const ate100 = (v) => (vazio(v) ? null : Math.min(v, 100));
// Obra finalizada (pedido do usuário): o realizado de todas as curvas que ela tem (PLS, Principal e
// Secundário) já em 100% — essas vão para o fim da lista, separadas.
const finalizada = (c) => {
  const cols = SERIES.filter((s) => c.tem[s.chave]).map((s) => c.cards[s.chave]?.realizado);
  return cols.length > 0 && cols.every((v) => !vazio(v) && v >= 99.95);
};

// Cores das curvas (pedido do usuário): realizado azul (barras), previsto preto (linha) — as mesmas nos
// três gráficos (o PLS só tem o realizado). A base do Prevision não entra (pedido do usuário).
const COR_CURVA = { previsto: COR.ink, realizado: COR.entrada };
const TRES = [
  { chave: 'previsto', rotulo: 'Previsto' },
  { chave: 'realizado', rotulo: 'Realizado' },
];

// Uma obra nos cards: realizado acumulado até hoje e, no Prevision, o previsto acumulado no fim do
// período da visão (`fimPeriodo`). O PLS não tem previsto (pedido do usuário) — só a data da última
// parcela liberada.
function montarObra(obra, hoje, fimPeriodo) {
  const prevision = (curva) =>
    curva ? { realizado: ate100(valorEm(curva.realizado, hoje)), previsto: ate100(valorEm(curva.previsto, fimPeriodo)) } : null;
  return {
    id: obra.sienge_id,
    nome: nomeObra(obra), // o apelido do centro de custo, quando preenchido (pedido do usuário)
    bruta: obra,
    ultimaLib: obra.pls?.ultima_liberacao || null,
    tem: { caixa: Boolean(obra.pls), primaria: Boolean(obra.primaria), secundaria: Boolean(obra.secundaria) },
    cards: {
      caixa: obra.pls ? { realizado: ate100(valorEm(obra.pls.pontos, hoje)), previsto: null } : null,
      primaria: prevision(obra.primaria),
      secundaria: prevision(obra.secundaria),
    },
  };
}

// Os três gráficos que abrem embaixo da linha (pedido do usuário): PLS (só o realizado, da Caixa),
// Principal (orçamento primário do Prevision) e Secundário — cada um do Prevision com o Previsto (linha)
// e o Realizado (barras), um ponto por período da visão (o acumulado no último dia dele; o realizado
// para em hoje). Sem De/Até, cada gráfico no seu recorte: do período antes do primeiro avanço até o dia
// em que a última curva dele chega a 100% ou, se nenhuma chega, até o último ponto e hoje. Com De/Até,
// o recorte é o pedido (só um dos dois: o outro lado fica automático). A curva que chega a 100% para
// ali: o período vira 100% exatos, os seguintes ficam sem valor, e `cem` guarda o índice da bandeirinha.
function graficosDe(c, { visao, de, ate, hoje }) {
  const obra = c.bruta;
  const graficos = [
    {
      chave: 'caixa',
      titulo: 'PLS',
      logo: SERIES[0].logo,
      series: obra.pls ? [{ chave: 'realizado', rotulo: 'Realizado', pontos: obra.pls.pontos }] : [],
    },
    ...['primaria', 'secundaria'].map((tipo, k) => ({
      chave: tipo,
      titulo: k === 0 ? 'Principal' : 'Secundário',
      logo: SERIES[k + 1].logo,
      series: obra[tipo] ? TRES.filter((s) => obra[tipo][s.chave]).map((s) => ({ ...s, pontos: obra[tipo][s.chave] })) : [],
    })),
  ];
  return graficos.map((g) => {
    const series = g.series.map((s) => ({ ...s, cor: COR_CURVA[s.chave] }));
    let ini = null;
    let fim = null;
    let todasCem = series.length > 0;
    series.forEach((s) => {
      const primeiro = s.pontos.find((p) => p[1] > 0);
      if (primeiro && (!ini || primeiro[0] < ini)) ini = primeiro[0];
      const cem = s.pontos.find((p) => p[1] >= 99.95);
      if (!cem) todasCem = false;
      const f = cem ? cem[0] : s.pontos[s.pontos.length - 1][0];
      if (!fim || f > fim) fim = f;
    });
    if (!ini) ini = hoje;
    if (!fim || (!todasCem && fim < hoje)) fim = hoje;
    let periodos;
    if (de || ate) {
      const a = de || ini;
      const b = ate || fim;
      periodos = periodosEntre(visao, a, b < a ? a : b);
    } else {
      periodos = periodosEntre(visao, ini, fim < ini ? ini : fim);
      periodos.unshift(periodoAnterior(visao, periodos[0])); // o ponto de partida, antes do 1º avanço
    }
    return {
      chave: g.chave,
      titulo: g.titulo,
      logo: g.logo,
      nome: c.nome,
      curtos: periodos.map((p) => rotuloCurto(visao, p)),
      longos: periodos.map((p) => rotuloLongo(visao, p)),
      iHoje: periodos.findIndex((p) => p.ini <= hoje && hoje <= p.fim),
      series: series.map((s) => {
        const v = periodos.map((p) =>
          s.chave === 'realizado'
            ? p.ini > hoje
              ? null
              : ate100(valorEm(s.pontos, p.fim < hoje ? p.fim : hoje))
            : ate100(valorEm(s.pontos, p.fim))
        );
        const i = v.findIndex((x) => x >= 99.95);
        if (i >= 0) {
          v[i] = 100;
          for (let k = i + 1; k < v.length; k++) v[k] = null;
        }
        return { chave: s.chave, rotulo: s.rotulo, cor: s.cor, v, cem: i >= 0 ? i : undefined };
      }),
    };
  });
}

function Etapa({ e }) {
  if (e.tipo === 'etapa') {
    const seg = e.segmento;
    return (
      <span className="av-etapa">
        <span className="av-etapa-nome">
          <i style={{ background: seg.cor }} />
          <span>{seg.etapa.descricao}</span>
          <em>{e.total ? `mês ${e.atual} de ${e.total}` : `mês ${e.atual}`}</em>
        </span>
        <small>
          {mesIso(seg.inicio)} → {seg.fim ? mesIso(seg.fim) : 'sem fim definido'}
        </small>
      </span>
    );
  }
  const texto = { aIniciar: 'A iniciar', concluida: 'Concluída', sem: 'Sem cronograma' }[e.tipo];
  return (
    <span className="av-etapa">
      <span className="av-etapa-nome nulo">
        <i />
        <span>{texto}</span>
      </span>
      {e.tipo === 'aIniciar' && <small>começa em {mesIso(e.segmento.inicio)}</small>}
    </span>
  );
}

// Uma coluna da linha: o realizado grande e, à frente, menor, o previsto. A barra fica vermelha com o
// previsto acima do realizado (atrasado) e verde com ele igual ou abaixo; sem previsto (PLS), azul.
function Metrica({ col, cor, nota }) {
  const real = col?.realizado ?? null;
  const prev = col?.previsto ?? null;
  const comparavel = !vazio(real) && !vazio(prev);
  // Compara como aparece na tela (uma casa): 99,97 × 100,02 é "100,0% prev. 100,0%", não atraso.
  const umaCasa = (v) => Math.round(v * 10) / 10;
  const corBarra = comparavel ? (umaCasa(prev) > umaCasa(real) ? 'var(--crit)' : 'var(--good)') : cor;
  return (
    <span className="av-met">
      <b className={vazio(real) ? 'nulo' : ''}>
        {vazio(real) ? '–' : pct(real)}
        {!vazio(prev) && <small className="av-prev">prev. {pct(prev)}</small>}
        {nota && <small>{nota}</small>}
      </b>
      <span className="av-barra" aria-hidden="true">
        <i style={{ width: `${vazio(real) ? 0 : real}%`, background: corBarra }} />
      </span>
    </span>
  );
}

// Um dos três gráficos: o tipo de avanço por período da visão, de 0 a 100%, com as curvas dele (PLS:
// uma; Prevision: Previsto e Realizado, com a legenda). Com o mouse em cima, uma linha vertical
// acompanha o período, com o ponto de cada curva nele. Clicar expande / volta (Graficos).
function Grafico({ g, colapsado, onClick }) {
  const [ref, W] = useLargura(300);
  const { mostrar, esconder } = useDica();
  const [mira, setMira] = useState(null);
  const H = 230;
  const m = { l: 44, r: 16, t: 24, b: 30 }; // em cima, espaço para a bandeirinha dos 100%
  const { curtos, longos, series } = g;
  const n = curtos.length;
  const x = (i) => m.l + ((W - m.l - m.r) * i) / Math.max(1, n - 1);
  const y = (v) => m.t + (H - m.t - m.b) * (1 - v / 100);
  const w = (W - m.l - m.r) / Math.max(1, n - 1);
  const iNow = g.iHoje;
  // Rótulos no eixo: sempre o primeiro e o último; no meio, um a cada `passo`, sem encostar nos vizinhos
  // (o primeiro sai alinhado à esquerda e o último à direita, então ocupam mais para dentro).
  const ESPACO = curtos[0]?.length > 6 ? 76 : 60;
  const passo = Math.max(1, Math.ceil(ESPACO / Math.max(0.01, w)));
  const marcas = [0];
  for (let i = passo; i < n - 1; i += passo) {
    const folgaAntes = x(i) - x(marcas[marcas.length - 1]) - (marcas.length === 1 ? ESPACO / 2 : 0);
    if (folgaAntes >= ESPACO && x(n - 1) - x(i) >= ESPACO * 1.5) marcas.push(i);
  }
  if (n > 1) marcas.push(n - 1);
  // Muitos períodos (visão diária): as barras encostam umas nas outras e viram uma área.
  const larguraBarra = Math.max(Math.min(2, w), Math.min(18, w * 0.62));
  const caminho = (s) =>
    s.v
      .map((v, i) => [v, i])
      .filter(([v]) => !vazio(v))
      .map(([v, i], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join('');
  // O período sob o mouse: pela posição na largura do gráfico (uma camada só, não um retângulo por período).
  const aoMover = (ev) => {
    const caixa = ev.currentTarget.ownerSVGElement.getBoundingClientRect();
    const px = ((ev.clientX - caixa.left) * W) / caixa.width;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / Math.max(0.01, w))));
    setMira(i);
    mostrar(
      ev,
      longos[i],
      series.filter((s) => !vazio(s.v[i])).map((s) => [s.rotulo, pct(s.v[i])])
    );
  };
  return (
    <div
      className={`av-curva${colapsado ? ' colapsado' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), onClick())}
      title={colapsado ? `Expandir ${g.titulo}` : undefined}
    >
      {/* Recolhido: só o nome na vertical, por cima (fora do fluxo, não muda a altura da linha). */}
      <span className="av-vertical" aria-hidden={!colapsado}>
        <img src={g.logo} alt="" />
        {g.titulo}
      </span>
      <h4>
        <img src={g.logo} alt="" />
        {g.titulo}
        <span className="av-leg">
          {series.length > 1 &&
            series.map((s) => (
              <em key={s.chave}>
                <i className={s.chave === 'realizado' ? 'barra' : ''} style={{ background: s.cor }} />
                {s.rotulo}
              </em>
            ))}
        </span>
      </h4>
      {!series.length ? (
        <div className="empty">Sem dados.</div>
      ) : (
        <div className="chart" ref={ref}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${g.titulo} de ${g.nome}`}>
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={v}>
                <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={COR.grid} />
                <text x={m.l - 8} y={y(v) + 4} textAnchor="end">
                  {v}%
                </text>
              </g>
            ))}
            {marcas.map((i) => (
              <text key={i} x={x(i)} y={H - 10} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
                {curtos[i]}
              </text>
            ))}
            {iNow >= 0 && (
              <g>
                <line x1={x(iNow)} x2={x(iNow)} y1={m.t} y2={H - m.b} stroke={COR.ink2} strokeDasharray="3 3" />
                <text x={x(iNow) + (W - m.r - x(iNow) > 40 ? 5 : -5)} y={m.t + 10} textAnchor={W - m.r - x(iNow) > 40 ? 'start' : 'end'}>
                  hoje
                </text>
              </g>
            )}
            {/* Linha que acompanha o período sob o mouse. */}
            {mira !== null && <line className="av-mira" x1={x(mira)} x2={x(mira)} y1={m.t} y2={H - m.b} stroke={COR.ink2} strokeWidth={1} />}
            {/* Realizado em barras (pedido do usuário), por baixo; previsto em linha, por cima. */}
            {series
              .filter((s) => s.chave === 'realizado')
              .map((s) =>
                s.v.map((v, i) =>
                  vazio(v) || v <= 0 ? null : (
                    <rect
                      key={`${s.chave}-${i}`}
                      x={x(i) - larguraBarra / 2}
                      y={y(v)}
                      width={larguraBarra}
                      height={y(0) - y(v)}
                      rx={Math.min(2, larguraBarra / 4)}
                      fill={s.cor}
                      fillOpacity={mira === null || mira === i ? 0.85 : 0.55}
                    />
                  )
                )
              )}
            {series
              .filter((s) => s.chave !== 'realizado')
              .map((s) => (
                <path key={s.chave} d={caminho(s)} fill="none" stroke={s.cor} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round" />
              ))}
            {/* Bandeirinha onde a curva chega a 100% (e para); duas no mesmo período ficam lado a lado, a
                segunda à esquerda (não sai do gráfico quando é o último). */}
            {series
              .filter((s) => s.cem !== undefined)
              .map((s, k, lista) => {
                const i = s.cem;
                const lado = lista.slice(0, k).filter((o) => o.cem === i).length;
                return (
                  <g key={`cem-${s.chave}`} transform={`translate(${x(i) - lado * 12},${y(100)})`}>
                    <title>{`${s.rotulo}: 100% em ${longos[i]}`}</title>
                    <line x1={0} y1={0} x2={0} y2={-15} stroke={s.cor} strokeWidth={1.5} />
                    <path d="M0,-15 L9,-11.5 L0,-8 Z" fill={s.cor} />
                    <circle r={3} fill={s.cor} stroke={COR.surface} strokeWidth={1.5} />
                  </g>
                );
              })}
            {(() => {
              const i = mira !== null ? mira : iNow;
              if (i < 0) return null;
              return series
                .filter((s) => s.chave !== 'realizado' && !vazio(s.v[i]))
                .map((s) => <circle key={s.chave} cx={x(i)} cy={y(s.v[i])} r={4.5} fill={s.cor} stroke={COR.surface} strokeWidth={2} />);
            })()}
            <rect
              x={m.l - Math.max(6, w / 2)}
              y={m.t}
              width={W - m.l - m.r + 2 * Math.max(6, w / 2)}
              height={H - m.t - m.b}
              fill="transparent"
              onMouseMove={aoMover}
              onMouseLeave={() => {
                setMira(null);
                esconder();
              }}
            />
          </svg>
        </div>
      )}
    </div>
  );
}

// Os três gráficos da linha aberta: clicar num deles o expande na largura toda e recolhe os outros em
// faixas estreitas, com o nome na vertical (o do meio recolhe um para cada lado); clicar de novo no
// expandido volta os três; clicar numa faixa expande aquele.
function Graficos({ lista }) {
  const [foco, setFoco] = useState(null);
  return (
    <div className="av-curvas">
      {lista.map((g, i) => (
        <Grafico key={g.chave} g={g} colapsado={foco !== null && foco !== i} onClick={() => setFoco((f) => (f === i ? null : i))} />
      ))}
    </div>
  );
}

// Texto do topo do painel: a que dia os números dos cards se referem em cada visão.
function referencia(visao, hoje, fimPeriodo) {
  if (visao === 'diaria') return `Realizado e previsto acumulados até hoje (${dataBr(hoje)})`;
  const ate = visao === 'semanal' ? `o fim da semana (sábado, ${dataBr(fimPeriodo)})` : `o fim do mês (${dataBr(fimPeriodo)})`;
  return `Realizado acumulado até hoje (${dataBr(hoje)}) · previsto acumulado até ${ate}`;
}

export default function CurvasAvanco({ empresaId, obrasMarcadas = [], onOpcoesObras, visao = 'mensal', de = '', ate = '' }) {
  const [dados, setDados] = useState(null);
  const [cronograma, setCronograma] = useState(null);
  const [erro, setErro] = useState('');
  const [abertas, setAbertas] = useState([]);

  useEffect(() => {
    if (!empresaId) return undefined;
    let vivo = true;
    setDados(null);
    setCronograma(null);
    setErro('');
    setAbertas([]);
    onOpcoesObras?.([]);
    listCurvasAvanco(empresaId)
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro(e.response?.data?.message || 'Não foi possível carregar o avanço das obras.'));
    // A etapa vem do cronograma da Carteira de obras; sem ele, a coluna fica "Sem cronograma".
    listCronogramaCentros(empresaId)
      .then((c) => vivo && setCronograma(c))
      .catch(() => vivo && setCronograma({ etapas: [], centros: [], atraso: null }));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const hoje = dados?.hoje || null;
  const fimPeriodo = hoje ? periodoDe(visao, hoje).fim : null;
  const obras = useMemo(
    () =>
      dados
        ? dados.obras
            .map((o) => montarObra(o, dados.hoje, fimPeriodo))
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) // em ordem do nome exibido (apelido)
        : [],
    [dados, fimPeriodo]
  );
  // Opções do filtro "Obras" (na barra de controles, AvancoObras): as obras desta lista, como na Carteira.
  useEffect(() => {
    if (dados) onOpcoesObras?.(opcoesFiltroObras(dados.obras));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados]);
  // Filtro "Obras" e, no fim, as finalizadas (as três curvas em 100%).
  const [emAndamento, finalizadas] = useMemo(() => {
    const vistas = obrasMarcadas.length ? obras.filter((c) => obrasMarcadas.includes(String(c.id))) : obras;
    return [vistas.filter((c) => !finalizada(c)), vistas.filter(finalizada)];
  }, [obras, obrasMarcadas]);
  // Etapa de hoje de cada obra (por sienge_id), como na Carteira de obras.
  const etapas = useMemo(() => {
    if (!cronograma || !hoje) return null;
    const porObra = new Map(montarObras(cronograma.centros, cronograma.etapas, hoje, cronograma.atraso).map((o) => [o.centro.sienge_id, o]));
    return (id) => etapaHoje(porObra.get(id), hoje);
  }, [cronograma, hoje]);
  const alternar = (id) => setAbertas((a) => (a.includes(id) ? a.filter((v) => v !== id) : [...a, id]));

  if (!empresaId) return null;
  const linha = (c) => {
    const aberta = abertas.includes(c.id);
    const notas = {
      caixa: c.tem.caixa ? `até ${dataBr(c.ultimaLib)}` : 'sem Caixa',
      primaria: c.tem.primaria ? null : 'sem orçamento',
      secundaria: c.tem.secundaria ? null : 'sem orçamento',
    };
    return (
      <div key={c.id} className={`av-item${aberta ? ' aberto' : ''}`}>
        <button type="button" className="av-linha" aria-expanded={aberta} onClick={() => alternar(c.id)}>
          <span className="av-nome" title={c.bruta.name}>
            {c.nome}
          </span>
          {etapas ? <Etapa e={etapas(c.id)} /> : <span className="av-etapa nulo">…</span>}
          {SERIES.map((s) => (
            <Metrica key={s.chave} col={c.cards[s.chave]} cor={s.cor} nota={notas[s.chave]} />
          ))}
          <ChevronDown size={18} className="av-seta" />
        </button>
        {aberta && (
          <div className="av-grafico">
            <Graficos lista={graficosDe(c, { visao, de, ate, hoje })} />
          </div>
        )}
      </div>
    );
  };
  return (
    <section className="panel c12" aria-labelledby="h-avanco-obra">
      <div className="ph">
        <h2 id="h-avanco-obra">Avanço por obra</h2>
        {hoje && <p>{referencia(visao, hoje, fimPeriodo)}</p>}
      </div>
      {erro ? (
        <div className="empty">{erro}</div>
      ) : !dados ? (
        <div className="empty">Carregando…</div>
      ) : !obras.length ? (
        <div className="empty">Nenhuma obra com Prevision nesta empresa.</div>
      ) : (
        <>
          <div className="av-cab">
            <span>Empreendimento</span>
            <span>Etapa da carteira</span>
            {SERIES.map((s) => (
              <span key={s.chave} title={s.rotulo}>
                <img src={s.logo} alt={s.sub === 'PLS' ? 'Caixa' : 'Prevision'} />
                {s.sub}
              </span>
            ))}
            <span />
          </div>
          {!emAndamento.length && !finalizadas.length ? (
            <div className="empty">Nenhuma obra no filtro.</div>
          ) : (
            <>
              {emAndamento.length > 0 && <div className="av-lista">{emAndamento.map(linha)}</div>}
              {finalizadas.length > 0 && (
                <>
                  <div className="av-separador">
                    <span>Obras finalizadas</span>
                    <small>{finalizadas.length === 1 ? '1 obra' : `${finalizadas.length} obras`} com todas as curvas em 100%</small>
                  </div>
                  <div className="av-lista finalizadas">{finalizadas.map(linha)}</div>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
