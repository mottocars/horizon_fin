import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { listAvancosDfc } from '../../../api/dfcAvancos.api';
import { listCronogramaCentros } from '../../../api/cronogramaCentros.api';
import { isoHoje, montarObras } from '../../Operacoes/CronogramasObras/cronogramaObras';
import { somarDias } from '../../CentrosCusto/cronogramaDatas';
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

const SERIES = [
  { chave: 'caixa', rotulo: 'Caixa (PLS)', curto: 'Caixa', cor: COR.ink },
  { chave: 'primaria', rotulo: 'Prevision · orçamento primário', curto: 'Primário', cor: COR.entrada },
  { chave: 'secundaria', rotulo: 'Prevision · orçamento secundário', curto: 'Secundário', cor: COR.cenario },
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

// Uma obra: as três séries e o recorte do gráfico — do mês antes do primeiro avanço até o mês em que a
// última série chega a 100% (ou para de mudar), incluindo o mês atual.
function montarObra(obra, meses, mesAtual) {
  if (!obra.prevision_primaria && !obra.prevision_secundaria) return null;
  const ultimoLib = obra.ultimo_mes_liberado || null;
  const caixa = obra.pls && ultimoLib ? obra.pls : null;
  const series = { caixa, primaria: obra.prevision_primaria, secundaria: obra.prevision_secundaria };

  let ini = meses.length;
  let fim = 0;
  Object.values(series)
    .filter(Boolean)
    .forEach((s) => {
      const i = meses.findIndex((m) => (s[m] || 0) > 0);
      if (i >= 0) ini = Math.min(ini, i);
      let f = meses.findIndex((m) => s[m] >= 99.95);
      if (f < 0) {
        const final = s[meses[meses.length - 1]] || 0;
        meses.forEach((m, k) => {
          if (Math.abs((s[m] || 0) - final) > 0.005) f = k + 1;
        });
      }
      fim = Math.max(fim, f);
    });
  const iAtual = meses.indexOf(mesAtual);
  const a = Math.max(0, Math.min(ini - 1, iAtual >= 0 ? iAtual : Infinity));
  const b = Math.min(meses.length - 1, Math.max(fim, iAtual));

  return {
    id: obra.sienge_id,
    nome: obra.name,
    mesAtual,
    ultimoLib,
    tem: { caixa: Boolean(caixa), primaria: Boolean(series.primaria), secundaria: Boolean(series.secundaria) },
    hoje: {
      caixa: caixa ? ate100(caixa[mesAtual]) : null,
      primaria: series.primaria ? ate100(series.primaria[mesAtual]) : null,
      secundaria: series.secundaria ? ate100(series.secundaria[mesAtual]) : null,
    },
    rows: meses.slice(a, b + 1).map((m) => ({
      mes: m,
      // Caixa só até o último mês liberado (depois disso ela não informou nada novo).
      caixa: caixa && m <= ultimoLib && m <= mesAtual ? ate100(caixa[m]) : null,
      primaria: series.primaria ? ate100(series.primaria[m]) : null,
      secundaria: series.secundaria ? ate100(series.secundaria[m]) : null,
    })),
  };
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

function GraficoObra({ c }) {
  const [ref, W] = useLargura(480);
  const { mostrar, esconder } = useDica();
  const H = 260;
  const m = { l: 44, r: 16, t: 14, b: 30 };
  const { rows } = c;
  const n = rows.length;
  const x = (i) => m.l + ((W - m.l - m.r) * i) / Math.max(1, n - 1);
  const y = (v) => m.t + (H - m.t - m.b) * (1 - v / 100);
  const w = (W - m.l - m.r) / Math.max(1, n - 1);
  const iNow = rows.findIndex((r) => r.mes === c.mesAtual);
  // Meses no eixo: um a cada `passo` (uns 60 px entre rótulos), sempre o primeiro e o último.
  const passo = Math.max(1, Math.ceil(60 / Math.max(1, w)));
  const marcas = rows.map((_, i) => i).filter((i) => i % passo === 0 && x(n - 1) - x(i) > 44);
  marcas.push(n - 1);
  const linha = (chave) =>
    rows
      .map((r, i) => [r[chave], i])
      .filter(([v]) => !vazio(v))
      .map(([v, i], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join('');
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Avanço de ${c.nome} mês a mês`}>
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
            {lbl(rows[i].mes)}
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
        {SERIES.filter((s) => c.tem[s.chave]).map((s) => (
          <path key={s.chave} d={linha(s.chave)} fill="none" stroke={s.cor} strokeWidth={2.2} strokeLinejoin="round" />
        ))}
        {iNow >= 0 &&
          SERIES.filter((s) => !vazio(rows[iNow][s.chave])).map((s) => (
            <circle key={s.chave} cx={x(iNow)} cy={y(rows[iNow][s.chave])} r={4} fill={s.cor} stroke={COR.surface} strokeWidth={2} />
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
              mostrar(
                ev,
                lbl(r.mes),
                SERIES.filter((s) => !vazio(r[s.chave])).map((s) => [s.curto, pct(r[s.chave])])
              )
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
        <p>Avanço acumulado até {mesAtual ? lbl(mesAtual) : 'hoje'} de cada obra com Prevision. Clique na obra para ver mês a mês.</p>
      </div>
      {erro ? (
        <div className="empty">{erro}</div>
      ) : !dados ? (
        <div className="empty">Carregando…</div>
      ) : !obras.length ? (
        <div className="empty">Nenhuma obra com Prevision nesta empresa.</div>
      ) : (
        <>
          <div className="av-cab" aria-hidden="true">
            <span>Empreendimento</span>
            <span>Etapa da carteira</span>
            {SERIES.map((s) => (
              <span key={s.chave}>
                <i style={{ background: s.cor }} />
                {s.rotulo}
              </span>
            ))}
            <span />
          </div>
          <div className="av-lista">
            {obras.map((c) => {
              const aberta = abertas.includes(c.id);
              return (
                <div key={c.id} className={`av-item${aberta ? ' aberto' : ''}`}>
                  <button type="button" className="av-linha" aria-expanded={aberta} onClick={() => alternar(c.id)}>
                    <span className="av-nome">{c.nome}</span>
                    {etapas ? <Etapa e={etapas(c.id)} /> : <span className="av-etapa nulo">…</span>}
                    <Metrica
                      valor={c.hoje.caixa}
                      cor={COR.ink}
                      nota={!c.tem.caixa ? 'sem Caixa' : c.ultimoLib < mesAtual ? `até ${lbl(c.ultimoLib)}` : null}
                    />
                    <Metrica valor={c.hoje.primaria} cor={COR.entrada} nota={c.tem.primaria ? null : 'sem orçamento'} />
                    <Metrica valor={c.hoje.secundaria} cor={COR.cenario} nota={c.tem.secundaria ? null : 'sem orçamento'} />
                    <ChevronDown size={18} className="av-seta" />
                  </button>
                  {aberta && (
                    <div className="av-grafico">
                      <GraficoObra c={c} />
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
