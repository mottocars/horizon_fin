import { Fragment, useEffect, useMemo, useState } from 'react';
import { Check, CircleDashed } from 'lucide-react';
import { corPadrao } from '../../../utils/coresPadrao';
import { somarDias, somarMeses } from '../../CentrosCusto/cronogramaDatas';
import { isoHoje, naEtapa } from './cronogramaObras';
import { MESES_ABREV, mesAno, moeda } from './formatos';

// ---------------------------------------------------------------------------------------
// Gantt das obras, mês a mês, com as cores das etapas (máscara Etapas do Centro de Custo) — na aba
// Cronogramas de Operações > Cronogramas Obras e no dashboard Cronogramas de Obras. Mesmo estilo
// do Gantt do Plano de Voo (PlanoGantt.jsx): nomes fixos à esquerda, régua de meses, linha de hoje.
// - `obras`: montarObras (cronogramaObras.js). `zoom`: 'geral' (encaixa tudo na largura) | 'mensal'.
// - `destaque`: id de etapa — as obras que não estão nela hoje ficam apagadas.
// - `onAbrirObra(centro)`: opcional — com ele, clicar numa obra abre o cadastro (Operações); sem
//   ele, o gráfico é só leitura (dashboard).
// ---------------------------------------------------------------------------------------

export const ZOOMS_GANTT = [
  { id: 'geral', rotulo: 'Visão geral' },
  { id: 'mensal', rotulo: 'Mês a mês' },
];

const LARGURA_NOMES = 264;
const PX_MES_MENSAL = 38;
const MESES_INICIAIS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

// Posição em meses (índice contínuo: ano*12 + mês, com a fração do dia dentro do mês).
const idxMes = (iso) => {
  const [a, m] = iso.split('-').map(Number);
  return a * 12 + m - 1;
};
const posMes = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return idxMes(iso) + (d - 1) / new Date(Date.UTC(a, m, 0)).getUTCDate();
};

// Texto dentro de uma barra colorida: branco ou grafite, o que tiver mais contraste com o fundo.
function corDoTexto(hex) {
  const canal = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.06 ? '#ffffff' : '#1f2937';
}

function duracaoTexto(seg) {
  if (seg.duracao === null || seg.duracao === undefined) return 'sem fim definido';
  const n = seg.duracao;
  if (seg.unidade === 'ano') return `${n} ${n === 1 ? 'ano' : 'anos'}`;
  return `${n} ${n === 1 ? 'mês' : 'meses'}`;
}

// Legenda: retângulo da cor de cada etapa (a forma da marca) e a linha de hoje.
export function LegendaGantt({ etapas }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
      {etapas.map((etapa, i) => (
        <span key={etapa.id} className="flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 rounded-[3px]" style={{ backgroundColor: etapa.cor || corPadrao(i) }} />
          {etapa.descricao || 'Sem nome'}
        </span>
      ))}
      <span className="flex items-center gap-1.5 text-gray-500">
        <span className="h-3 w-0.5 rounded-full bg-red-400" />
        Hoje
      </span>
    </div>
  );
}

function Regua({ ini, fim, px, xHoje }) {
  const anos = [];
  for (let m = ini; m <= fim; m += 12) anos.push(Math.floor(m / 12));
  const meses = [];
  for (let m = ini; m <= fim; m++) meses.push(m);
  const anoAtual = new Date().getFullYear();
  const rotuloMes = px >= 30 ? (m) => MESES_ABREV[m % 12] : px >= 13 ? (m) => MESES_INICIAIS[m % 12] : null;
  return (
    <div className="relative" style={{ width: (fim - ini + 1) * px }}>
      <div className="flex h-7">
        {anos.map((ano) => (
          <div
            key={ano}
            className={`shrink-0 border-l border-gray-200 text-[11px] leading-7 tabular-nums first:border-l-0 ${
              ano === anoAtual ? 'font-bold text-gray-900' : 'font-semibold text-gray-500'
            }`}
            style={{ width: 12 * px }}
          >
            {/* gruda na borda visível ao rolar (o ano não some sob a coluna das obras) */}
            <span className="sticky px-2" style={{ left: LARGURA_NOMES }}>
              {ano}
            </span>
          </div>
        ))}
      </div>
      <div className="flex h-6 border-t border-gray-100">
        {meses.map((m) => (
          <div
            key={m}
            className={`shrink-0 text-center text-[10px] leading-6 text-gray-400 ${m % 12 === 0 ? 'border-l border-gray-200' : ''}`}
            style={{ width: px }}
          >
            {/* sem espaço pros meses (visão geral apertada): marca o começo de cada trimestre */}
            {rotuloMes ? rotuloMes(m) : m % 3 === 0 && m % 12 !== 0 && <span className="mt-2 block h-2 w-px bg-gray-300" />}
          </div>
        ))}
      </div>
      <span
        className="absolute bottom-0.5 z-4 -translate-x-1/2 rounded-full bg-red-500 px-1.5 py-px text-[9px] font-bold uppercase text-white"
        style={{ left: xHoje }}
      >
        Hoje
      </span>
    </div>
  );
}

// A barra da obra: um segmento por etapa, colados, separados por 2px de respiro; pontas
// arredondadas só nos extremos. O nome da etapa vai dentro do segmento quando cabe com folga.
function BarraObra({ segmentos, ini, px, onDica }) {
  const xDe = (iso) => (posMes(iso) - ini) * px;
  return segmentos.map((seg, i) => {
    const primeiro = i === 0;
    const ultimo = i === segmentos.length - 1;
    const esquerda = xDe(seg.inicio);
    // sem etapa posterior (sem fim conhecido): só o mês de início, sólido (pedido do usuário — sem
    // degradê); a dica diz "sem fim definido"
    const direita = seg.fim ? xDe(somarDias(seg.fim, 1)) : esquerda + px;
    const largura = Math.max(4, direita - esquerda - (ultimo ? 0 : 2));
    const nome = seg.etapa.descricao || '';
    const cabe = largura >= nome.length * 7 + 20;
    const raio = `${primeiro ? 4 : 0}px ${ultimo ? 4 : 0}px ${ultimo ? 4 : 0}px ${primeiro ? 4 : 0}px`;
    // Linha separando os meses dentro da barra (pedido do usuário): um traço claro de 1px em cada
    // virada de mês, alinhado à régua; mais suave quando os meses são estreitos (visão geral).
    const linha = `rgba(255,255,255,${px < 14 ? 0.2 : 0.5})`;
    const desvio = ((esquerda % px) + px) % px;
    return (
      <div
        key={seg.etapa.id}
        onMouseEnter={(e) => onDica(e, seg)}
        onMouseMove={(e) => onDica(e, seg)}
        onMouseLeave={() => onDica(null)}
        className="absolute top-1/2 flex h-7 -translate-y-1/2 items-center transition-[filter] hover:brightness-110"
        style={{
          left: esquerda,
          width: largura,
          borderRadius: raio,
          backgroundColor: seg.cor,
          backgroundImage: `linear-gradient(to right, transparent ${px - 1}px, ${linha} ${px - 1}px)`,
          backgroundSize: `${px}px 100%`,
          backgroundPosition: `${-desvio}px 0`,
          backgroundRepeat: 'repeat-x',
        }}
      >
        {/* o nome gruda na borda visível ao rolar (não fica cortado sob a coluna das obras) */}
        {cabe && (
          <span
            className="pointer-events-none sticky whitespace-nowrap px-2.5 text-[11.5px] font-semibold"
            style={{ left: LARGURA_NOMES, color: corDoTexto(seg.cor) }}
          >
            {nome}
          </span>
        )}
      </div>
    );
  });
}

function Dica({ dica }) {
  if (!dica) return null;
  const { seg, obra, x, y } = dica;
  const esquerda = x + 260 > window.innerWidth ? x - 252 : x + 14;
  return (
    <div
      className="pointer-events-none fixed z-60 w-60 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-normal shadow-lg"
      style={{ left: esquerda, top: y + 14 }}
    >
      <p className="text-[13px] font-semibold tabular-nums text-gray-900">
        {mesAno(seg.inicio)} → {seg.fim ? mesAno(seg.fim) : 'em aberto'}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-gray-600">
        <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: seg.cor }} />
        {seg.etapa.descricao} · {duracaoTexto(seg)}
      </p>
      <p className="mt-0.5 truncate text-gray-400">{obra.name}</p>
    </div>
  );
}

function SituacaoObra({ situacao, centro, clicavel }) {
  const extras = [moeda(centro.valor_geral_vendas, { compacta: true }), centro.numero_unidades ? `${centro.numero_unidades} un.` : null].filter(Boolean);
  let estado;
  if (situacao.tipo === 'etapa') {
    estado = (
      <>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: situacao.segmento.cor }} />
        {situacao.segmento.etapa.descricao}
      </>
    );
  } else if (situacao.tipo === 'aIniciar') {
    estado = (
      <>
        <CircleDashed size={11} className="shrink-0 text-gray-400" />
        Inicia em {mesAno(situacao.segmento.inicio)}
      </>
    );
  } else if (situacao.tipo === 'concluida') {
    estado = (
      <>
        <Check size={11} className="shrink-0 text-emerald-600" />
        Concluída
      </>
    );
  } else {
    return <span className="text-[11px] leading-normal text-amber-600">{clicavel ? 'Sem datas — clique para preencher' : 'Sem datas no cronograma'}</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] leading-normal text-gray-500">
      {estado}
      {extras.length > 0 && <span className="truncate text-gray-400">· {extras.join(' · ')}</span>}
    </span>
  );
}

export default function GanttObras({ etapas, obras, zoom, destaque, onAbrirObra }) {
  const [area, setArea] = useState(null);
  const [larguraArea, setLarguraArea] = useState(0);
  const [dica, setDica] = useState(null);
  const hoje = isoHoje();

  // Largura da área — a "Visão geral" encaixa a carteira inteira nela.
  useEffect(() => {
    if (!area) return undefined;
    const ro = new ResizeObserver(([e]) => setLarguraArea(e.contentRect.width));
    ro.observe(area);
    return () => ro.disconnect();
  }, [area]);

  const comCronograma = obras.filter((o) => o.segmentos.length);
  const semCronograma = obras.filter((o) => !o.segmentos.length);

  // Faixa de meses: anos inteiros, do primeiro início ao último fim (e hoje).
  const faixa = useMemo(() => {
    const marcos = [hoje];
    obras.forEach((o) => o.segmentos.forEach((s) => marcos.push(s.inicio, s.fim || somarMeses(s.inicio, 1))));
    const idx = marcos.map(idxMes);
    const ini = Math.min(...idx);
    const fim = Math.max(...idx);
    return { ini: ini - (ini % 12), fim: fim + (11 - (fim % 12)) };
  }, [obras, hoje]);

  const meses = faixa.fim - faixa.ini + 1;
  const px = zoom === 'mensal' ? PX_MES_MENSAL : Math.max(3, (larguraArea - LARGURA_NOMES - 2) / meses);
  const larguraTempo = meses * px;
  const xHoje = (posMes(hoje) - faixa.ini) * px;

  // Mês a mês: a régua abre com hoje à vista (um terço da tela à esquerda dele).
  useEffect(() => {
    if (zoom !== 'mensal' || !area) return;
    area.scrollTo({ left: Math.max(0, xHoje - (larguraArea - LARGURA_NOMES) / 3) });
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const mostrarDica = (obra) => (e, seg) => setDica(e && seg ? { seg, obra, x: e.clientX, y: e.clientY } : null);
  const apagada = (o) => destaque && !naEtapa(o, destaque);
  const clicavel = Boolean(onAbrirObra);

  return (
    <div ref={setArea} className="overflow-x-auto" onScroll={() => dica && setDica(null)}>
      <div className="relative leading-normal" style={{ width: LARGURA_NOMES + larguraTempo, minWidth: '100%' }}>
        {/* fundo: anos alternados, divisas de ano (e de mês, no zoom mensal) e a linha de hoje */}
        <div className="pointer-events-none absolute inset-y-0" style={{ left: LARGURA_NOMES, width: larguraTempo }}>
          {Array.from({ length: meses / 12 }, (_, i) => (
            <span
              key={i}
              className={`absolute inset-y-0 border-l border-gray-200 first:border-l-0 ${i % 2 ? 'bg-gray-50/70' : ''}`}
              style={{ left: i * 12 * px, width: 12 * px }}
            />
          ))}
          {zoom === 'mensal' &&
            Array.from({ length: meses }, (_, m) =>
              m % 12 ? <span key={m} className="absolute inset-y-0 border-l border-gray-100" style={{ left: m * px }} /> : null
            )}
          {/* atrás das barras: não passa por cima do nome das etapas */}
          <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-red-400/80" style={{ left: xHoje }} />
        </div>

        {/* régua */}
        <div className="relative flex border-b border-gray-200">
          <div
            className="sticky left-0 z-20 flex shrink-0 items-end border-r border-gray-200 bg-white px-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400"
            style={{ width: LARGURA_NOMES }}
          >
            Obra
          </div>
          <div className="bg-white/80">
            <Regua ini={faixa.ini} fim={faixa.fim} px={px} xHoje={xHoje} />
          </div>
        </div>

        {obras.length === 0 && (
          <div className="relative flex">
            <div className="sticky left-0 z-20 shrink-0 border-r border-gray-200 bg-white px-4 py-10 text-center" style={{ width: LARGURA_NOMES }}>
              <p className="text-sm font-medium text-gray-700">Nenhuma obra nesta empresa</p>
              <p className="mt-1 text-xs text-gray-400">Marque o Tipo dos centros de custo como Obra no cadastro.</p>
            </div>
          </div>
        )}

        {[...comCronograma, ...semCronograma].map((o, i) => (
          <Fragment key={o.centro.sienge_id}>
            {i === comCronograma.length && semCronograma.length > 0 && (
              <div className="relative flex h-8 border-b border-gray-100">
                <div
                  className="sticky left-0 z-20 flex shrink-0 items-center border-r border-gray-200 bg-white px-4 text-[10px] font-semibold uppercase tracking-wide text-gray-400"
                  style={{ width: LARGURA_NOMES }}
                >
                  Sem cronograma · {semCronograma.length}
                </div>
              </div>
            )}
            <div
              {...(clicavel && {
                role: 'button',
                tabIndex: 0,
                title: 'Abrir o cadastro da obra',
                onClick: () => onAbrirObra(o.centro),
                onKeyDown: (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onAbrirObra(o.centro);
                  }
                },
              })}
              className={`group relative flex h-14 border-b border-gray-100 transition-opacity focus:outline-none ${clicavel ? 'cursor-pointer' : ''} ${
                apagada(o) ? 'opacity-30 hover:opacity-70' : ''
              }`}
            >
              <div
                className="sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-gray-200 bg-white px-4 transition-colors group-hover:bg-[#f7f9fd] group-focus:bg-primary-50/50"
                style={{ width: LARGURA_NOMES }}
              >
                <span className="truncate text-[13px] font-semibold text-gray-900" title={o.centro.name}>
                  {o.centro.name}
                </span>
                <SituacaoObra situacao={o.situacao} centro={o.centro} clicavel={clicavel} />
              </div>
              <div className="relative transition-colors group-hover:bg-primary-50/25" style={{ width: larguraTempo }}>
                <BarraObra segmentos={o.segmentos} ini={faixa.ini} px={px} onDica={mostrarDica(o.centro)} />
              </div>
            </div>
          </Fragment>
        ))}
      </div>
      <Dica dica={dica} />
    </div>
  );
}
