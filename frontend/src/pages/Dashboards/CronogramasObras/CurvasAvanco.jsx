import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { listAvancosDfc } from '../../../api/dfcAvancos.api';
import { listCronogramaCentros } from '../../../api/cronogramaCentros.api';
import { isoHoje, montarObras } from '../../Operacoes/CronogramasObras/cronogramaObras';
import { somarDias } from '../../CentrosCusto/cronogramaDatas';
import iconCaixa from '../../../assets/integracoes/portal-construtoras.svg';
import iconPrevision from '../../../assets/integracoes/prevision.svg';
import { lbl, pct } from '../EconomicoFinanceiro/fluxo/modelo';
import { COR, useDica, useLargura } from '../EconomicoFinanceiro/fluxo/ganchos';

// Obra 360º › Avanço das Obras: "Avanço por obra" (pedido do usuário) — uma linha-cartão por obra com
// Prevision (retângulo baixo na largura toda, não linha de tabela): a etapa da carteira de obras em
// que ela está hoje (a mesma conta da Carteira — montarObras/situacaoHoje —, com o mês da etapa na
// numeração do Gantt: "mês 18 de 32", e o mês em que a etapa começa e termina) e o avanço acumulado
// até o mês atual em três colunas: Caixa (PLS, realizado até o último mês liberado no DCD), Prevision
// do orçamento primário e do secundário. Clicar abre embaixo o gráfico da obra inteira, na largura toda,
// com as três linhas mês a mês. Dados do /dfc-avancos (?obras=todas: toda obra com Prevision, marcada
// ou não com "Projeta DFC"), numa janela de 10 anos (5 para trás, 4 para a frente — o servidor aceita
// até 10; o acumulado já soma tudo o que veio antes, então qualquer janela dá o mesmo valor por mês).
const ANO = new Date().getFullYear();
const JANELA = { inicio: `${ANO - 5}-01-01`, fim: `${ANO + 4}-12-31`, todasObras: true };

// No cabeçalho das colunas, a logomarca do sistema no lugar do nome (pedido do usuário) — os mesmos
// ícones da aba DFC › Avanços; nas do Prevision, ao lado, qual orçamento.
const SERIES = [
  { chave: 'caixa', rotulo: 'Caixa (PLS)', curto: 'Caixa', cor: COR.ink, logo: iconCaixa },
  { chave: 'primaria', rotulo: 'Prevision · orçamento primário', curto: 'Primário', cor: COR.entrada, logo: iconPrevision, sub: 'Primário' },
  { chave: 'secundaria', rotulo: 'Prevision · orçamento secundário', curto: 'Secundário', cor: COR.cenario, logo: iconPrevision, sub: 'Secundário' },
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

// Uma obra: o avanço de hoje de cada tipo (as colunas da linha) e a obra bruta, de onde saem os três
// gráficos que abrem embaixo da linha (`graficosDe`).
function montarObra(obra, meses, mesAtual) {
  if (!obra.prevision_primaria && !obra.prevision_secundaria) return null;
  const ultimoLib = obra.ultimo_mes_liberado || null;
  const caixa = obra.pls && ultimoLib ? obra.pls : null;
  return {
    id: obra.sienge_id,
    nome: obra.name,
    bruta: obra,
    meses,
    mesAtual,
    ultimoLib,
    tem: { caixa: Boolean(caixa), primaria: Boolean(obra.prevision_primaria), secundaria: Boolean(obra.prevision_secundaria) },
    hoje: {
      caixa: caixa ? ate100(caixa[mesAtual]) : null,
      primaria: obra.prevision_primaria ? ate100(obra.prevision_primaria[mesAtual]) : null,
      secundaria: obra.prevision_secundaria ? ate100(obra.prevision_secundaria[mesAtual]) : null,
    },
  };
}

// Os três gráficos que abrem embaixo da linha (pedido do usuário): PLS (só a curva realizada, da Caixa),
// Principal (orçamento primário do Prevision) e Secundário — cada um do Prevision com as curvas Base,
// Previsto e Realizado. Todos no mesmo recorte de meses: do mês antes do primeiro avanço até o mês em que
// a última curva chega a 100% (ou a última medição), incluindo o mês atual. A curva que chega a 100% para
// ali: o mês vira 100% exatos, os seguintes ficam sem valor, e `cem` guarda o índice para a bandeirinha.
const TRES = [
  { chave: 'base', rotulo: 'Base', cor: COR.ink2 },
  { chave: 'previsto', rotulo: 'Previsto', cor: null },
  { chave: 'realizado', rotulo: 'Realizado', cor: COR.ink },
];
function graficosDe(c) {
  const { bruta: obra, meses, mesAtual, ultimoLib } = c;
  const doMes = (acc, ok = () => true) =>
    acc ? Object.fromEntries(meses.map((m) => [m, ok(m) && !vazio(acc[m]) ? ate100(acc[m]) : null])) : null;
  const graficos = [
    {
      chave: 'caixa',
      titulo: 'PLS',
      logo: SERIES[0].logo,
      series: [
        { chave: 'caixa', rotulo: 'Realizado', cor: COR.ink, valores: doMes(obra.pls, (m) => ultimoLib && m <= ultimoLib && m <= mesAtual) },
      ],
    },
    ...['primaria', 'secundaria'].map((tipo, k) => {
      const det = obra.prevision_detalhe?.[tipo] || {};
      const corTipo = tipo === 'primaria' ? COR.entrada : COR.cenario;
      return {
        chave: tipo,
        titulo: k === 0 ? 'Principal' : 'Secundário',
        logo: SERIES[k + 1].logo,
        series: TRES.map((s) => ({ ...s, cor: s.cor || corTipo, valores: doMes(det[s.chave]) })),
      };
    }),
  ].map((g) => ({ ...g, series: g.series.filter((s) => s.valores) }));

  let ini = meses.length;
  let fim = 0;
  graficos.forEach((g) =>
    g.series.forEach((s) => {
      const i = meses.findIndex((m) => (s.valores[m] || 0) > 0);
      if (i >= 0) ini = Math.min(ini, i);
      let f = meses.findIndex((m) => s.valores[m] >= 99.95);
      if (f < 0) f = meses.reduce((u, m, k) => (vazio(s.valores[m]) ? u : k), -1);
      fim = Math.max(fim, f);
    })
  );
  const iAtual = meses.indexOf(mesAtual);
  const a = Math.max(0, Math.min(ini - 1, iAtual >= 0 ? iAtual : Infinity));
  const b = Math.min(meses.length - 1, Math.max(fim, iAtual));
  const mesesGrafico = meses.slice(a, b + 1);
  return graficos.map((g) => ({
    chave: g.chave,
    titulo: g.titulo,
    logo: g.logo,
    mesAtual,
    nome: obra.name,
    meses: mesesGrafico,
    series: g.series.map((s) => {
      const v = mesesGrafico.map((m) => s.valores[m]);
      const i = v.findIndex((x) => x >= 99.95);
      if (i >= 0) {
        v[i] = 100;
        for (let k = i + 1; k < v.length; k++) v[k] = null;
      }
      return { chave: s.chave, rotulo: s.rotulo, cor: s.cor, v, cem: i >= 0 ? i : undefined };
    }),
  }));
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

function Metrica({ valor, cor, nota }) {
  return (
    <span className="av-met">
      <b className={vazio(valor) ? 'nulo' : ''}>
        {vazio(valor) ? '–' : pct(valor)}
        {nota && <small>{nota}</small>}
      </b>
      <span className="av-barra" aria-hidden="true">
        <i style={{ width: `${vazio(valor) ? 0 : valor}%`, background: cor }} />
      </span>
    </span>
  );
}

// Um dos três gráficos: o tipo de avanço, mês a mês, de 0 a 100%, com as curvas dele (PLS: uma; Prevision:
// Base, Previsto e Realizado, com a legenda).
function Grafico({ g, colapsado, onEnter }) {
  const [ref, W] = useLargura(300);
  const { mostrar, esconder } = useDica();
  const H = 230;
  const m = { l: 44, r: 16, t: 24, b: 30 }; // em cima, espaço para a bandeirinha dos 100%
  const { meses, series } = g;
  const n = meses.length;
  const x = (i) => m.l + ((W - m.l - m.r) * i) / Math.max(1, n - 1);
  const y = (v) => m.t + (H - m.t - m.b) * (1 - v / 100);
  const w = (W - m.l - m.r) / Math.max(1, n - 1);
  const iNow = meses.indexOf(g.mesAtual);
  // Meses no eixo: um a cada `passo` (uns 60 px entre rótulos), sempre o último.
  const passo = Math.max(1, Math.ceil(60 / Math.max(1, w)));
  const marcas = meses.map((_, i) => i).filter((i) => i % passo === 0 && x(n - 1) - x(i) > 58);
  marcas.push(n - 1);
  const caminho = (s) =>
    s.v
      .map((v, i) => [v, i])
      .filter(([v]) => !vazio(v))
      .map(([v, i], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join('');
  return (
    <div className={`av-curva${colapsado ? ' colapsado' : ''}`} onMouseEnter={onEnter}>
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
                <i style={{ background: s.cor }} />
                {s.rotulo}
              </em>
            ))}
        </span>
      </h4>
      {!series.length ? (
        <div className="empty">Sem dados.</div>
      ) : (
        <div className="chart" ref={ref}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${g.titulo} de ${g.nome} mês a mês`}>
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
                {lbl(meses[i])}
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
            {series.map((s) => (
              <path key={s.chave} d={caminho(s)} fill="none" stroke={s.cor} strokeWidth={2.2} strokeLinejoin="round" />
            ))}
            {/* Bandeirinha onde a curva chega a 100% (e para); duas no mesmo mês ficam lado a lado, a
                segunda à esquerda (não sai do gráfico quando é o último mês). */}
            {series
              .filter((s) => s.cem !== undefined)
              .map((s, k, lista) => {
                const i = s.cem;
                const lado = lista.slice(0, k).filter((o) => o.cem === i).length;
                return (
                  <g key={`cem-${s.chave}`} transform={`translate(${x(i) - lado * 12},${y(100)})`}>
                    <title>{`${s.rotulo}: 100% em ${lbl(meses[i])}`}</title>
                    <line x1={0} y1={0} x2={0} y2={-15} stroke={s.cor} strokeWidth={1.5} />
                    <path d="M0,-15 L9,-11.5 L0,-8 Z" fill={s.cor} />
                    <circle r={3} fill={s.cor} stroke={COR.surface} strokeWidth={1.5} />
                  </g>
                );
              })}
            {iNow >= 0 &&
              series
                .filter((s) => !vazio(s.v[iNow]))
                .map((s) => <circle key={s.chave} cx={x(iNow)} cy={y(s.v[iNow])} r={4} fill={s.cor} stroke={COR.surface} strokeWidth={2} />)}
            {meses.map((mes, i) => (
              <rect
                key={mes}
                x={x(i) - w / 2}
                y={m.t}
                width={w}
                height={H - m.t - m.b}
                fill="transparent"
                onMouseMove={(ev) =>
                  mostrar(
                    ev,
                    lbl(mes),
                    series.filter((s) => !vazio(s.v[i])).map((s) => [s.rotulo, pct(s.v[i])])
                  )
                }
                onMouseLeave={esconder}
              />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

// Os três gráficos da linha aberta: passar o mouse num deles o expande na largura toda e recolhe os
// outros em faixas estreitas, com o nome na vertical (o do meio recolhe um para cada lado); ao sair,
// voltam os três.
function Graficos({ lista }) {
  const [foco, setFoco] = useState(null);
  return (
    <div className="av-curvas" onMouseLeave={() => setFoco(null)}>
      {lista.map((g, i) => (
        <Grafico key={g.chave} g={g} colapsado={foco !== null && foco !== i} onEnter={() => setFoco(i)} />
      ))}
    </div>
  );
}

export default function CurvasAvanco({ empresaId }) {
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
    listAvancosDfc(empresaId, JANELA)
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro(e.response?.data?.message || 'Não foi possível carregar o avanço das obras.'));
    // A etapa vem do cronograma da Carteira de obras; sem ele, a coluna fica "Sem cronograma".
    listCronogramaCentros(empresaId)
      .then((c) => vivo && setCronograma(c))
      .catch(() => vivo && setCronograma({ etapas: [], centros: [], atraso: null }));
    return () => {
      vivo = false;
    };
  }, [empresaId]);

  const obras = useMemo(
    () => (dados ? dados.obras.map((o) => montarObra(o, dados.meses, dados.mes_atual)).filter(Boolean) : []),
    [dados]
  );
  // Etapa de hoje de cada obra (por sienge_id), como na Carteira de obras.
  const etapas = useMemo(() => {
    if (!cronograma) return null;
    const hoje = isoHoje();
    const porObra = new Map(montarObras(cronograma.centros, cronograma.etapas, hoje, cronograma.atraso).map((o) => [o.centro.sienge_id, o]));
    return (id) => etapaHoje(porObra.get(id), hoje);
  }, [cronograma]);
  const alternar = (id) => setAbertas((a) => (a.includes(id) ? a.filter((v) => v !== id) : [...a, id]));

  if (!empresaId) return null;
  const mesAtual = dados?.mes_atual;
  return (
    <section className="panel c12" aria-labelledby="h-avanco-obra">
      <div className="ph">
        <h2 id="h-avanco-obra">Avanço por obra</h2>
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
              <span key={s.chave}>
                <i style={{ background: s.cor }} />
                <img src={s.logo} alt={s.sub ? 'Prevision' : 'Caixa'} title={s.rotulo} />
                {s.sub}
              </span>
            ))}
            <span />
          </div>
          <div className="av-lista">
            {obras.map((c) => {
              const aberta = abertas.includes(c.id);
              const notas = {
                caixa: !c.tem.caixa ? 'sem Caixa' : c.ultimoLib < mesAtual ? `até ${lbl(c.ultimoLib)}` : null,
                primaria: c.tem.primaria ? null : 'sem orçamento',
                secundaria: c.tem.secundaria ? null : 'sem orçamento',
              };
              return (
                <div key={c.id} className={`av-item${aberta ? ' aberto' : ''}`}>
                  <button type="button" className="av-linha" aria-expanded={aberta} onClick={() => alternar(c.id)}>
                    <span className="av-nome">{c.nome}</span>
                    {etapas ? <Etapa e={etapas(c.id)} /> : <span className="av-etapa nulo">…</span>}
                    {SERIES.map((s) => (
                      <Metrica key={s.chave} valor={c.hoje[s.chave]} cor={s.cor} nota={notas[s.chave]} />
                    ))}
                    <ChevronDown size={18} className="av-seta" />
                  </button>
                  {aberta && (
                    <div className="av-grafico">
                      <Graficos lista={graficosDe(c)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
