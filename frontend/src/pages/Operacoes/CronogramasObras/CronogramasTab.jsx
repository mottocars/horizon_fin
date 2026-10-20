import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building, ChartGantt, Check, CircleDashed, Milestone, TriangleAlert, Wallet, X } from 'lucide-react';
import { listCronogramaCentros } from '../../../api/cronogramaCentros.api';
import { corPadrao } from '../../../utils/coresPadrao';
import { duracaoEtapa, fimEtapa, somarDias, somarMeses } from '../../CentrosCusto/cronogramaDatas';
import JanelaCentroCusto from './JanelaCentroCusto';
import { MESES_ABREV, mesAno, moeda } from './formatos';

// ---------------------------------------------------------------------------------------
// Operações > Cronogramas Obras > Cronogramas (pedido do usuário): no topo, os números da
// carteira — VGV, unidades e quantas obras estão em cada etapa hoje —; embaixo, o Gantt das obras
// mês a mês, com as cores das etapas (máscara Etapas do Centro de Custo). Mesmo estilo do Gantt
// do Plano de Voo (PlanoGantt.jsx): nomes fixos à esquerda, régua de meses, linha de hoje.
//
// O cronograma de cada obra é o Histórico de Etapas do centro de custo (o mesmo dado da aba
// Centros de Custos); clicar numa obra abre o cadastro dela (JanelaCentroCusto). Clicar num card
// de etapa destaca, no Gantt, as obras que estão nela hoje.
// ---------------------------------------------------------------------------------------

const LARGURA_NOMES = 264;
const PX_MES_MENSAL = 38;
const ZOOMS = [
  { id: 'geral', rotulo: 'Visão geral' },
  { id: 'mensal', rotulo: 'Mês a mês' },
];
const MESES_INICIAIS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function isoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

// Segmentos da obra: um por etapa com data de início. Fim = véspera do início da seguinte (ou o
// fim gravado); na última, o término — as mesmas regras do Histórico de Etapas (cronogramaDatas).
// Sem fim conhecido, a etapa fica "em aberto".
function montarSegmentos(centro, etapas) {
  return etapas
    .map((etapa, i) => {
      const inicio = centro.datas[etapa.id];
      if (!inicio) return null;
      const ultima = i === etapas.length - 1;
      const datas = {
        ultima,
        inicio,
        inicioSeguinte: ultima ? null : centro.datas[etapas[i + 1].id],
        fim: ultima ? centro.data_termino : centro.fins?.[etapa.id],
      };
      return {
        etapa,
        cor: etapa.cor || corPadrao(i),
        inicio,
        fim: fimEtapa(datas),
        duracao: duracaoEtapa(datas),
        unidade: ultima ? 'ano' : 'mês',
      };
    })
    .filter(Boolean);
}

// Onde a obra está hoje: a etapa em curso (a mais adiantada, se uma em aberto se sobrepõe), ou
// antes de começar / depois de terminar.
function situacaoHoje(segmentos, hoje) {
  if (!segmentos.length) return { tipo: 'sem' };
  const emCurso = segmentos.filter((s) => s.inicio <= hoje && (!s.fim || hoje <= s.fim)).at(-1);
  if (emCurso) return { tipo: 'etapa', segmento: emCurso };
  if (hoje < segmentos[0].inicio) return { tipo: 'aIniciar', segmento: segmentos[0] };
  return { tipo: 'concluida' };
}

function duracaoTexto(seg) {
  if (seg.duracao === null || seg.duracao === undefined) return 'sem fim definido';
  const n = seg.duracao;
  if (seg.unidade === 'ano') return `${n} ${n === 1 ? 'ano' : 'anos'}`;
  return `${n} ${n === 1 ? 'mês' : 'meses'}`;
}

function plural(n, um, varios) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

// ---------------------------------------------------------------------------------------
// Cards do topo
// ---------------------------------------------------------------------------------------

function CardNumero({ icone: Icone, rotulo, valor, titulo, detalhe }) {
  return (
    <div className="flex flex-col rounded-xl border border-gray-100 bg-linear-to-b from-white to-gray-50/60 p-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
          <Icone size={14} />
        </span>
        {rotulo}
      </div>
      <p className="mt-3 text-2xl font-semibold leading-none text-gray-900" title={titulo}>
        {valor}
      </p>
      <p className="mt-2 text-xs text-gray-500">{detalhe}</p>
    </div>
  );
}

// Card de uma etapa: quantas obras estão nela hoje, o VGV e as unidades delas e a fatia da carteira
// (medidor no próprio tom da etapa). Clicar destaca essas obras no Gantt.
function CardEtapa({ etapa, cor, obras, totalObras, ativo, apagado, onClick }) {
  const vgv = obras.reduce((s, o) => s + (Number(o.valor_geral_vendas) || 0), 0);
  const unidades = obras.reduce((s, o) => s + (Number(o.numero_unidades) || 0), 0);
  const fatia = totalObras ? obras.length / totalObras : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={ativo ? 'Mostrar todas as obras' : `Destacar no gráfico as obras em ${etapa.descricao} hoje`}
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white p-4 text-left transition ${
        ativo ? 'border-gray-300 shadow-[0_6px_18px_-10px_rgba(15,23,42,0.35)]' : 'border-gray-100 hover:border-gray-200'
      } ${apagado ? 'opacity-55 hover:opacity-100' : ''}`}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: cor }} />
      <span className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-gray-500">
        <span className="truncate">{etapa.descricao || 'Sem nome'}</span>
        {ativo && <X size={13} className="shrink-0 text-gray-400" />}
      </span>
      <span className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold leading-none text-gray-900">{obras.length}</span>
        <span className="text-xs text-gray-400">{obras.length === 1 ? 'obra hoje' : 'obras hoje'}</span>
      </span>
      <span className="mt-2 truncate text-xs text-gray-500">
        {obras.length ? `${moeda(vgv, { compacta: true })} · ${plural(unidades, 'unidade', 'unidades')}` : 'Nenhuma obra nesta etapa'}
      </span>
      <span className="mt-3 h-1 overflow-hidden rounded-full" style={{ backgroundColor: `${cor}26` }}>
        <span className="block h-full rounded-full" style={{ width: `${fatia * 100}%`, backgroundColor: cor }} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------------------
// Gantt
// ---------------------------------------------------------------------------------------

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
    const emAberto = !seg.fim;
    // em aberto: três meses esmaecendo, sem ponta arredondada (a etapa continua)
    const direita = emAberto ? esquerda + 3 * px : xDe(somarDias(seg.fim, 1));
    const largura = Math.max(3, direita - esquerda - (ultimo ? 0 : 2));
    const nome = seg.etapa.descricao || '';
    const cabe = !emAberto && largura >= nome.length * 6.4 + 18;
    const raio = `${primeiro ? 4 : 0}px ${ultimo && !emAberto ? 4 : 0}px ${ultimo && !emAberto ? 4 : 0}px ${primeiro ? 4 : 0}px`;
    return (
      <div
        key={seg.etapa.id}
        onMouseEnter={(e) => onDica(e, seg)}
        onMouseMove={(e) => onDica(e, seg)}
        onMouseLeave={() => onDica(null)}
        className="absolute top-1/2 flex h-5 -translate-y-1/2 items-center transition-[filter] hover:brightness-110"
        style={{
          left: esquerda,
          width: largura,
          borderRadius: raio,
          background: emAberto ? `linear-gradient(to right, ${seg.cor} 0%, ${seg.cor} 35%, ${seg.cor}00 100%)` : seg.cor,
        }}
      >
        {/* o nome gruda na borda visível ao rolar (não fica cortado sob a coluna das obras) */}
        {cabe && (
          <span
            className="pointer-events-none sticky whitespace-nowrap px-2 text-[10.5px] font-semibold"
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
      className="pointer-events-none fixed z-60 w-60 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg"
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

function SituacaoObra({ situacao, centro }) {
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
    return <span className="text-[11px] text-amber-600">Sem datas — clique para preencher</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-gray-500">
      {estado}
      {extras.length > 0 && <span className="truncate text-gray-400">· {extras.join(' · ')}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------------------

export default function CronogramasTab({ empresaId }) {
  const [etapas, setEtapas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [zoom, setZoom] = useState('geral');
  const [destaque, setDestaque] = useState(null); // id da etapa destacada pelos cards
  const [dica, setDica] = useState(null);
  const [aberto, setAberto] = useState(null); // centro aberto na janela do cadastro
  const [areaGantt, setAreaGantt] = useState(null);
  const [larguraArea, setLarguraArea] = useState(0);
  const hoje = isoHoje();

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    listCronogramaCentros(empresaId)
      .then((r) => {
        setEtapas(r.etapas);
        setCentros(r.centros);
      })
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar o cronograma.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setEtapas([]);
    setCentros([]);
    setDestaque(null);
    carregar();
  }, [carregar]);

  // Largura da área do Gantt — a "Visão geral" encaixa a carteira inteira nela.
  useEffect(() => {
    if (!areaGantt) return undefined;
    const ro = new ResizeObserver(([e]) => setLarguraArea(e.contentRect.width));
    ro.observe(areaGantt);
    return () => ro.disconnect();
  }, [areaGantt]);

  const obras = useMemo(() => {
    const lista = centros
      .filter((c) => c.natureza === 'OBRA')
      .map((centro) => {
        const segmentos = montarSegmentos(centro, etapas);
        return { centro, segmentos, situacao: situacaoHoje(segmentos, hoje) };
      });
    // com cronograma primeiro, pela data de início da primeira etapa; sem cronograma no fim
    return lista.sort((a, b) => {
      const ia = a.segmentos[0]?.inicio || '9999';
      const ib = b.segmentos[0]?.inicio || '9999';
      return ia.localeCompare(ib) || a.centro.name.localeCompare(b.centro.name, 'pt-BR');
    });
  }, [centros, etapas, hoje]);

  const comCronograma = obras.filter((o) => o.segmentos.length);
  const semCronograma = obras.filter((o) => !o.segmentos.length);

  // Faixa de meses do Gantt: anos inteiros, do primeiro início ao último fim (e hoje).
  const faixa = useMemo(() => {
    const marcos = [hoje];
    comCronograma.forEach((o) => o.segmentos.forEach((s) => marcos.push(s.inicio, s.fim || somarMeses(s.inicio, 3))));
    const idx = marcos.map(idxMes);
    const ini = Math.min(...idx);
    const fim = Math.max(...idx);
    return { ini: ini - (ini % 12), fim: fim + (11 - (fim % 12)) };
  }, [comCronograma, hoje]);

  const meses = faixa.fim - faixa.ini + 1;
  const px = zoom === 'mensal' ? PX_MES_MENSAL : Math.max(3, (larguraArea - LARGURA_NOMES - 2) / meses);
  const larguraTempo = meses * px;
  const xHoje = (posMes(hoje) - faixa.ini) * px;

  // Mês a mês: a régua abre com hoje à vista (um terço da tela à esquerda dele).
  useEffect(() => {
    if (zoom !== 'mensal' || !areaGantt) return;
    areaGantt.scrollTo({ left: Math.max(0, xHoje - (larguraArea - LARGURA_NOMES) / 3) });
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Números do topo.
  const vgvTotal = obras.reduce((s, o) => s + (Number(o.centro.valor_geral_vendas) || 0), 0);
  const comVgv = obras.filter((o) => Number(o.centro.valor_geral_vendas) > 0).length;
  const unidadesTotal = obras.reduce((s, o) => s + (Number(o.centro.numero_unidades) || 0), 0);
  const comUnidades = obras.filter((o) => Number(o.centro.numero_unidades) > 0).length;
  const porEtapa = (etapaId) => obras.filter((o) => o.situacao.tipo === 'etapa' && o.situacao.segmento.etapa.id === etapaId).map((o) => o.centro);
  const aIniciar = obras.filter((o) => o.situacao.tipo === 'aIniciar').length;
  const concluidas = obras.filter((o) => o.situacao.tipo === 'concluida').length;

  const mostrarDica = (obra) => (e, seg) => setDica(e && seg ? { seg, obra, x: e.clientX, y: e.clientY } : null);

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <ChartGantt size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver o cronograma das obras.</p>
      </div>
    );
  }

  if (carregando && !centros.length) {
    return <div className="rounded-card rounded-tl-none bg-white py-16 text-center text-sm text-gray-400 shadow-card">Carregando...</div>;
  }

  if (erroCarga) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card rounded-tl-none bg-white py-14 text-center shadow-card">
        <TriangleAlert size={26} className="text-red-400" />
        <p className="text-sm text-gray-600">{erroCarga}</p>
        <button
          type="button"
          onClick={carregar}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const linhaApagada = (o) => destaque && !(o.situacao.tipo === 'etapa' && o.situacao.segmento.etapa.id === destaque);
  const etapaDestacada = etapas.find((e) => e.id === destaque);

  return (
    <div className="space-y-5 rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {etapas.length === 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          <Milestone size={14} className="shrink-0" />
          Nenhuma etapa cadastrada — cadastre em
          <Link to="/cadastros/mascaras" className="font-semibold underline underline-offset-2 hover:text-amber-800">
            Cadastros › Máscaras › Etapas do Centro de Custo
          </Link>
        </div>
      )}

      {/* Números da carteira */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <CardNumero
          icone={Wallet}
          rotulo="VGV total"
          valor={moeda(vgvTotal, { compacta: true })}
          titulo={moeda(vgvTotal, { centavos: true })}
          detalhe={`${plural(comVgv, 'obra', 'obras')} com VGV de ${plural(obras.length, 'obra', 'obras')}`}
        />
        <CardNumero
          icone={Building}
          rotulo="Unidades"
          valor={unidadesTotal.toLocaleString('pt-BR')}
          detalhe={comUnidades ? `média de ${Math.round(unidadesTotal / comUnidades)} por obra` : 'nenhuma obra com unidades'}
        />
        {etapas.map((etapa, i) => (
          <CardEtapa
            key={etapa.id}
            etapa={etapa}
            cor={etapa.cor || corPadrao(i)}
            obras={porEtapa(etapa.id)}
            totalObras={obras.length}
            ativo={destaque === etapa.id}
            apagado={Boolean(destaque) && destaque !== etapa.id}
            onClick={() => setDestaque((d) => (d === etapa.id ? null : etapa.id))}
          />
        ))}
      </div>

      {/* Gantt */}
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Linha do tempo das obras</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {plural(comCronograma.length, 'obra no cronograma', 'obras no cronograma')}
              {aIniciar > 0 && ` · ${plural(aIniciar, 'a iniciar', 'a iniciar')}`}
              {concluidas > 0 && ` · ${plural(concluidas, 'concluída', 'concluídas')}`}
              {semCronograma.length > 0 && <span className="text-amber-600"> · {plural(semCronograma.length, 'sem datas', 'sem datas')}</span>}
              {etapaDestacada && (
                <button
                  type="button"
                  onClick={() => setDestaque(null)}
                  className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-200"
                >
                  Destacando {etapaDestacada.descricao} <X size={11} />
                </button>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* legenda: retângulo da cor de cada etapa (a forma da marca), hoje e em aberto */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
              {etapas.map((etapa, i) => (
                <span key={etapa.id} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-3.5 rounded-[3px]" style={{ backgroundColor: etapa.cor || corPadrao(i) }} />
                  {etapa.descricao || 'Sem nome'}
                </span>
              ))}
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="h-2.5 w-3.5 rounded-[3px]" style={{ background: 'linear-gradient(to right, #9ca3af, #9ca3af00)' }} />
                Sem fim definido
              </span>
              <span className="flex items-center gap-1.5 text-gray-500">
                <span className="h-3 w-0.5 rounded-full bg-red-400" />
                Hoje
              </span>
            </div>
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
              {ZOOMS.map((z) => (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setZoom(z.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    zoom === z.id ? 'bg-primary-50 text-primary-700' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {z.rotulo}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div ref={setAreaGantt} className="overflow-x-auto" onScroll={() => dica && setDica(null)}>
          <div className="relative" style={{ width: LARGURA_NOMES + larguraTempo, minWidth: '100%' }}>
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
                <div
                  className="sticky left-0 z-20 shrink-0 border-r border-gray-200 bg-white px-4 py-10 text-center"
                  style={{ width: LARGURA_NOMES }}
                >
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
                  role="button"
                  tabIndex={0}
                  onClick={() => setAberto(o.centro)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setAberto(o.centro);
                    }
                  }}
                  title="Abrir o cadastro da obra"
                  className={`group relative flex h-14 cursor-pointer border-b border-gray-100 transition-opacity focus:outline-none ${
                    linhaApagada(o) ? 'opacity-30 hover:opacity-70' : ''
                  }`}
                >
                  <div
                    className="sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-gray-200 bg-white px-4 transition-colors group-hover:bg-[#f7f9fd] group-focus:bg-primary-50/50"
                    style={{ width: LARGURA_NOMES }}
                  >
                    <span className="truncate text-[13px] font-semibold text-gray-900" title={o.centro.name}>
                      {o.centro.name}
                    </span>
                    <SituacaoObra situacao={o.situacao} centro={o.centro} />
                  </div>
                  <div className="relative transition-colors group-hover:bg-primary-50/25" style={{ width: larguraTempo }}>
                    <BarraObra segmentos={o.segmentos} ini={faixa.ini} px={px} onDica={mostrarDica(o.centro)} />
                  </div>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      <Dica dica={dica} />
      <JanelaCentroCusto empresaId={empresaId} centro={aberto} onFechar={() => setAberto(null)} onSalvo={carregar} />
    </div>
  );
}
