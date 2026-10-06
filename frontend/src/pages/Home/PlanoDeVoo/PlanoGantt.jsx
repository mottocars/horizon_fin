import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CalendarDays,
  Check,
  Loader2,
  Pencil,
  Plane,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { criarMacro, excluirMacro, obterPlano, ordenarMacros, renomearMacro } from '../../../api/projetos.api';
import Avatar from './Avatar';
import { BarraBuckets } from './PlanosLista';
import { BUCKETS, BUCKET_POR_ID, dataBR } from './kanban';

// ---------------------------------------------------------------------------------------
// Gantt do plano de voo. Macro tarefas (linhas de grupo) com as micro tarefas (cards do
// Kanban) dentro. As datas vêm dos cards: a barra da macro vai do primeiro início ao último
// fim das micros, então o gráfico muda sozinho conforme os cards são criados/alterados. As
// barras têm a cor do bucket do Kanban; o assunto fica sobre as datas e a foto do responsável
// num círculo no fim da barra.
// ---------------------------------------------------------------------------------------

const MS_DIA = 86400000;
const numDia = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / MS_DIA);
const isoDe = (n) => new Date(n * MS_DIA).toISOString().slice(0, 10);
const LARGURA_ESQUERDA = 320;
const ZOOMS = [
  { id: 'dia', rotulo: 'Dias', px: 38 },
  { id: 'semana', rotulo: 'Semanas', px: 16 },
  { id: 'mes', rotulo: 'Meses', px: 5 },
];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function diaDaSemana(n) {
  return new Date(n * MS_DIA).getUTCDay();
}

// Faixa de dias mostrada: das datas dos cards (e hoje), com folga dos dois lados — à direita
// sobra espaço para a foto do responsável e o rótulo das barras curtas.
function faixaDeDias(cards, hoje, zoom) {
  const datas = [numDia(hoje), ...cards.flatMap((c) => [numDia(c.data_inicio), numDia(c.data_fim)])];
  let ini = Math.min(...datas) - (zoom === 'mes' ? 10 : 3);
  let fim = Math.max(...datas) + (zoom === 'mes' ? 30 : zoom === 'semana' ? 14 : 7);
  if (cards.length === 0) fim = Math.max(fim, numDia(hoje) + 28);
  if (zoom === 'mes') {
    const d0 = new Date(ini * MS_DIA);
    ini = numDia(isoDe(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1) / MS_DIA));
  }
  return { ini, fim };
}

function Regua({ ini, fim, px, zoom, hoje }) {
  const meses = [];
  for (let n = ini; n <= fim; n++) {
    const d = new Date(n * MS_DIA);
    const chave = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    if (!meses.length || meses.at(-1).chave !== chave) meses.push({ chave, n, dias: 0, mes: d.getUTCMonth(), ano: d.getUTCFullYear() });
    meses.at(-1).dias++;
  }
  const nHoje = numDia(hoje);
  const dias = [];
  for (let n = ini; n <= fim; n++) dias.push(n);
  return (
    <div className="relative" style={{ width: (fim - ini + 1) * px }}>
      <div className="flex h-7 border-b border-gray-100">
        {meses.map((m) => (
          <div
            key={m.chave}
            className="shrink-0 overflow-hidden border-l border-gray-200 px-2 text-[11px] font-semibold capitalize leading-7 text-gray-600 first:border-l-0"
            style={{ width: m.dias * px }}
          >
            {m.dias * px > 60 ? `${MESES[m.mes]} ${m.ano}` : MESES[m.mes].slice(0, 3)}
          </div>
        ))}
      </div>
      <div className="flex h-8">
        {dias.map((n) => {
          const d = new Date(n * MS_DIA);
          const dia = d.getUTCDate();
          const ehHoje = n === nHoje;
          const fds = [0, 6].includes(d.getUTCDay());
          const mostrar = zoom === 'dia' || (zoom === 'semana' && d.getUTCDay() === 1) || (zoom === 'mes' && (dia === 1 || dia === 15));
          return (
            <div key={n} className="relative shrink-0 text-center" style={{ width: px }}>
              {mostrar && (
                <span
                  className={`absolute left-1/2 top-1 -translate-x-1/2 whitespace-nowrap text-[10px] leading-tight tabular-nums ${
                    ehHoje ? 'font-bold text-red-500' : fds ? 'text-gray-300' : 'text-gray-400'
                  }`}
                >
                  {zoom === 'dia' && <span className="block text-[9px] uppercase">{SEMANA[d.getUTCDay()]}</span>}
                  {dia}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarraMicro({ card, ini, px, usuarios, onAbrir }) {
  const b = BUCKET_POR_ID[card.bucket];
  const esquerda = (numDia(card.data_inicio) - ini) * px;
  const largura = (numDia(card.data_fim) - numDia(card.data_inicio) + 1) * px;
  const responsavel = usuarios[card.responsavel_id];
  // o assunto vai dentro da barra quando cabe; senão, inteiro ao lado da foto
  const curta = largura < card.assunto.length * 6.3 + 34;
  const dica = `${card.assunto}\n${dataBR(card.data_inicio)} → ${dataBR(card.data_fim)} · ${b.titulo}\nResponsável: ${responsavel?.nome || ''}`;
  return (
    <button
      type="button"
      onClick={() => onAbrir(card.id)}
      title={dica}
      className="group absolute top-1/2 flex -translate-y-1/2 items-center focus:outline-none"
      style={{ left: esquerda }}
    >
      <span
        className={`flex h-7 items-center overflow-hidden rounded-md pl-2.5 pr-5 text-[11px] font-medium text-white shadow-sm transition group-hover:brightness-110 group-focus:ring-2 group-focus:ring-primary-200 ${b.barra}`}
        style={{ width: largura }}
      >
        {!curta && <span className="truncate">{card.assunto}</span>}
      </span>
      {/* foto do responsável no fim da barra — camada própria, sempre à frente da barra (o
          brilho do hover cria uma camada nova na barra, que passaria por cima da foto) */}
      <span className="relative z-10 -ml-4 shrink-0 rounded-full shadow-sm">
        <Avatar usuario={responsavel} tamanho="sm" titulo={`Responsável: ${responsavel?.nome || ''}`} />
      </span>
      {curta && <span className="ml-1.5 max-w-56 truncate text-[11px] font-medium text-gray-600">{card.assunto}</span>}
    </button>
  );
}

function BarraMacro({ macro, ini, px }) {
  if (!macro.inicio) return null;
  const esquerda = (numDia(macro.inicio) - ini) * px;
  const largura = (numDia(macro.fim) - numDia(macro.inicio) + 1) * px;
  return (
    <div className="absolute top-1/2 flex -translate-y-1/2 items-center gap-2" style={{ left: esquerda }}>
      <div className="relative" style={{ width: largura }}>
        {/* colchetes nas pontas, no estilo de "tarefa resumo" */}
        <span className="absolute -left-px -top-1 h-4 w-1 rounded-sm bg-gray-700" />
        <span className="absolute -right-px -top-1 h-4 w-1 rounded-sm bg-gray-700" />
        <BarraBuckets porBucket={macro.porBucket} total={macro.total} altura="h-2.5" />
      </div>
      <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums text-gray-500">{macro.progresso}%</span>
    </div>
  );
}

function NomeMacroEditavel({ valor, onSalvar, onCancelar }) {
  const [texto, setTexto] = useState(valor);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (texto.trim()) onSalvar(texto.trim());
      }}
      className="flex min-w-0 flex-1 items-center gap-1"
    >
      <input
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancelar()}
        maxLength={150}
        className="min-w-0 flex-1 rounded-md border border-primary-300 px-2 py-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-100"
      />
      <button type="submit" className="rounded p-1 text-emerald-600 hover:bg-emerald-50" title="Salvar">
        <Check size={14} />
      </button>
      <button type="button" onClick={onCancelar} className="rounded p-1 text-gray-400 hover:bg-gray-100" title="Cancelar">
        <X size={14} />
      </button>
    </form>
  );
}

const BOTAO_ICONE = 'rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30';

export default function PlanoGantt({ planoId, recarregarToken, onVoltar, onEditar, onAbrirCard, onNovoCard }) {
  const confirm = useConfirm();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [zoom, setZoom] = useState(null); // definido ao carregar: semanas se o plano for longo
  const [recolhidas, setRecolhidas] = useState(() => new Set());
  const [novaMacro, setNovaMacro] = useState('');
  const [salvandoMacro, setSalvandoMacro] = useState(false);
  const [editandoMacro, setEditandoMacro] = useState(null);
  const rolagemRef = useRef(null);

  const carregar = useCallback(() => {
    setErro('');
    return obterPlano(planoId)
      .then(setDados)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível abrir o plano de voo.'));
  }, [planoId]);

  useEffect(() => {
    carregar();
  }, [carregar, recarregarToken]);

  useEffect(() => {
    if (!dados || zoom) return;
    const { inicio, fim } = dados.plano;
    setZoom(inicio && numDia(fim) - numDia(inicio) > 40 ? 'semana' : 'dia');
  }, [dados, zoom]);

  async function executar(fn, msg) {
    setAviso('');
    try {
      setDados(await fn());
      return true;
    } catch (e) {
      setAviso(e.response?.data?.message || msg);
      return false;
    }
  }

  async function adicionarMacro(e) {
    e.preventDefault();
    if (!novaMacro.trim()) return;
    setSalvandoMacro(true);
    if (await executar(() => criarMacro(planoId, novaMacro.trim()), 'Não foi possível criar a macro tarefa.')) setNovaMacro('');
    setSalvandoMacro(false);
  }

  async function removerMacro(macro) {
    const ok = await confirm({
      title: 'Excluir macro tarefa',
      description: `Excluir "${macro.nome}"?${macro.total ? ` As ${macro.total} atividade(s) dela continuam no Kanban, sem plano de voo.` : ''}`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (ok) executar(() => excluirMacro(planoId, macro.id), 'Não foi possível excluir a macro tarefa.');
  }

  function mover(indice, delta) {
    const ids = dados.macros.map((m) => m.id);
    [ids[indice], ids[indice + delta]] = [ids[indice + delta], ids[indice]];
    executar(() => ordenarMacros(planoId, ids), 'Não foi possível reordenar.');
  }

  const px = ZOOMS.find((z) => z.id === (zoom || 'dia')).px;
  const faixa = useMemo(() => (dados && zoom ? faixaDeDias(dados.cards, dados.hoje, zoom) : null), [dados, zoom]);

  const centralizarHoje = useCallback(() => {
    if (!rolagemRef.current || !faixa || !dados) return;
    const x = (numDia(dados.hoje) - faixa.ini) * px;
    rolagemRef.current.scrollTo({ left: Math.max(0, x - 160), behavior: 'smooth' });
  }, [faixa, dados, px]);

  // Ao abrir e ao trocar o zoom: mostra o plano desde o início, se hoje ainda couber na tela;
  // senão, leva a régua até hoje.
  useEffect(() => {
    const el = rolagemRef.current;
    if (!el || !faixa || !dados) return;
    const xHoje = (numDia(dados.hoje) - faixa.ini) * px;
    const xInicio = dados.plano.inicio ? (numDia(dados.plano.inicio) - faixa.ini) * px : xHoje;
    const visivel = el.clientWidth - LARGURA_ESQUERDA;
    el.scrollTo({ left: Math.max(0, xHoje - xInicio < visivel * 0.7 ? xInicio - 24 : xHoje - 160) });
  }, [zoom, Boolean(dados)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (erro) {
    return (
      <div className="py-14 text-center text-sm">
        <p className="text-red-600">{erro}</p>
        <button type="button" onClick={onVoltar} className="mt-3 text-primary-600 hover:underline">
          Voltar aos planos
        </button>
      </div>
    );
  }
  if (!dados || !faixa) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-400">
        <Loader2 size={16} className="animate-spin" /> Carregando plano de voo...
      </div>
    );
  }

  const { plano, macros, cards, usuarios, hoje, permissoes } = dados;
  const pode = permissoes.editar;
  const larguraTempo = (faixa.fim - faixa.ini + 1) * px;
  const xHoje = (numDia(hoje) - faixa.ini) * px + px / 2;
  const pessoas = [plano.criador_id, ...plano.membros];

  // fins de semana sombreados (só no zoom de dias)
  const fimDeSemana = [];
  if (zoom === 'dia') for (let n = faixa.ini; n <= faixa.fim; n++) if ([0, 6].includes(diaDaSemana(n))) fimDeSemana.push(n);

  return (
    <div className="space-y-4">
      {/* cabeçalho do plano */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onVoltar} title="Voltar aos planos" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
            <ArrowLeft size={18} />
          </button>
          {plano.empresa_logo ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <img src={plano.empresa_logo} alt={plano.empresa_nome} className="h-full w-full object-contain p-0.5" />
            </span>
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
              <Plane size={19} className="-rotate-12" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[11px] uppercase tracking-wide text-gray-400">{plano.empresa_nome}</p>
            <h2 className="flex items-center gap-2 truncate text-lg font-semibold text-gray-900">
              {plano.nome}
              {pode && (
                <button type="button" onClick={() => onEditar(plano)} title="Editar plano de voo" className={BOTAO_ICONE}>
                  <Pencil size={15} />
                </button>
              )}
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="w-56">
            <div className="mb-1 flex items-baseline justify-between text-[11px] text-gray-500">
              <span>
                {plano.porBucket.CONCLUIDO + plano.porBucket.FINALIZADO} de {plano.total} entregues
              </span>
              <span className="text-sm font-semibold tabular-nums text-gray-900">{plano.progresso}%</span>
            </div>
            <BarraBuckets porBucket={plano.porBucket} total={plano.total} altura="h-2" />
          </div>
          {plano.inicio && (
            <span className="flex items-center gap-1.5 text-xs tabular-nums text-gray-500">
              <CalendarDays size={14} className="text-gray-400" />
              {dataBR(plano.inicio)} → {dataBR(plano.fim)}
            </span>
          )}
          <div className="flex -space-x-1.5">
            {pessoas.map((id) => (
              <Avatar key={id} usuario={usuarios[id]} tamanho="sm" titulo={`${usuarios[id]?.nome || ''}${id === plano.criador_id ? ' (criou o plano)' : ''}`} />
            ))}
          </div>
        </div>
      </div>

      {/* barra de ferramentas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
          {BUCKETS.map((b) => (
            <span key={b.id} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${b.barra}`} /> {b.titulo}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNovoCard({ empresa_id: plano.empresa_id, plano_id: plano.id, macro_id: '' })}
            disabled={!macros.length}
            title={macros.length ? '' : 'Crie uma macro tarefa primeiro'}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
          >
            <Plus size={14} /> Atividade
          </button>
          <button type="button" onClick={centralizarHoje} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Hoje
          </button>
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

      {aviso && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{aviso}</p>}

      {/* Gantt */}
      <div ref={rolagemRef} className="overflow-x-auto rounded-xl border border-gray-200">
        <div className="relative" style={{ width: LARGURA_ESQUERDA + larguraTempo }}>
          {/* fundo: fins de semana e linha de hoje, atravessando todas as linhas */}
          <div className="pointer-events-none absolute inset-y-0" style={{ left: LARGURA_ESQUERDA, width: larguraTempo }}>
            {fimDeSemana.map((n) => (
              <span key={n} className="absolute inset-y-0 bg-gray-50" style={{ left: (n - faixa.ini) * px, width: px }} />
            ))}
            <span className="absolute inset-y-0 z-[1] w-0.5 bg-red-400/70" style={{ left: xHoje }} />
          </div>

          {/* régua */}
          <div className="relative flex border-b border-gray-200 bg-white/90">
            <div
              className="sticky left-0 z-20 flex shrink-0 items-end border-r border-gray-200 bg-white px-4 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400"
              style={{ width: LARGURA_ESQUERDA }}
            >
              Macro / micro tarefas
            </div>
            <div className="relative">
              <Regua ini={faixa.ini} fim={faixa.fim} px={px} zoom={zoom} hoje={hoje} />
              <span
                className="absolute bottom-0.5 z-[2] -translate-x-1/2 rounded-full bg-red-500 px-1.5 py-px text-[9px] font-bold uppercase text-white"
                style={{ left: xHoje }}
              >
                Hoje
              </span>
            </div>
          </div>

          {macros.length === 0 && (
            <div className="relative flex">
              <div className="sticky left-0 z-20 shrink-0 border-r border-gray-200 bg-white px-4 py-10 text-center" style={{ width: LARGURA_ESQUERDA }}>
                <p className="text-sm font-medium text-gray-700">Nenhuma macro tarefa ainda</p>
                <p className="mt-1 text-xs text-gray-400">
                  {pode ? 'Crie as macro tarefas abaixo para organizar as atividades.' : 'Quem criou o plano ainda não cadastrou as macro tarefas.'}
                </p>
              </div>
            </div>
          )}

          {macros.map((macro, i) => {
            const micros = cards.filter((c) => c.macro_id === macro.id);
            const aberta = !recolhidas.has(macro.id);
            return (
              <Fragment key={macro.id}>
                {/* linha da macro tarefa */}
                <div className="group relative flex min-h-12 border-b border-gray-100 bg-gray-50/40">
                  <div
                    className="sticky left-0 z-20 flex shrink-0 items-center gap-1.5 border-r border-gray-200 bg-white py-1.5 pl-2 pr-2"
                    style={{ width: LARGURA_ESQUERDA }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setRecolhidas((s) => {
                          const n = new Set(s);
                          if (n.has(macro.id)) n.delete(macro.id);
                          else n.add(macro.id);
                          return n;
                        })
                      }
                      className="rounded p-0.5 text-gray-400 hover:bg-gray-100"
                      title={aberta ? 'Recolher' : 'Expandir'}
                    >
                      {aberta ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {editandoMacro === macro.id ? (
                      <NomeMacroEditavel
                        valor={macro.nome}
                        onCancelar={() => setEditandoMacro(null)}
                        onSalvar={async (nome) => {
                          if (await executar(() => renomearMacro(planoId, macro.id, nome), 'Não foi possível renomear.')) setEditandoMacro(null);
                        }}
                      />
                    ) : (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-[13px] font-semibold leading-snug text-gray-900">
                            {macro.nome}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {macro.total} atividade{macro.total === 1 ? '' : 's'}
                            {macro.inicio && ` · ${dataBR(macro.inicio, false)} → ${dataBR(macro.fim, false)}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => onNovoCard({ empresa_id: plano.empresa_id, plano_id: plano.id, macro_id: macro.id })}
                            className={BOTAO_ICONE}
                            title="Nova atividade nesta macro"
                          >
                            <Plus size={14} />
                          </button>
                          {pode && (
                            <>
                              <button type="button" onClick={() => setEditandoMacro(macro.id)} className={BOTAO_ICONE} title="Renomear">
                                <Pencil size={13} />
                              </button>
                              <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className={BOTAO_ICONE} title="Subir">
                                <ChevronUp size={14} />
                              </button>
                              <button type="button" onClick={() => mover(i, 1)} disabled={i === macros.length - 1} className={BOTAO_ICONE} title="Descer">
                                <ChevronDown size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => removerMacro(macro)}
                                className="rounded p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                                title="Excluir macro tarefa"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="relative" style={{ width: larguraTempo }}>
                    <BarraMacro macro={macro} ini={faixa.ini} px={px} />
                  </div>
                </div>

                {/* micro tarefas */}
                {aberta &&
                  micros.map((card) => {
                    const b = BUCKET_POR_ID[card.bucket];
                    return (
                      <div key={card.id} className="relative flex min-h-11 border-b border-gray-100 hover:bg-primary-50/30">
                        <button
                          type="button"
                          onClick={() => onAbrirCard(card.id)}
                          className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-gray-200 bg-white py-1.5 pl-9 pr-3 text-left hover:bg-gray-50"
                          style={{ width: LARGURA_ESQUERDA }}
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${b.barra}`} title={b.titulo} />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-xs font-medium leading-snug text-gray-700">{card.assunto}</span>
                            <span className="block text-[10px] tabular-nums text-gray-400">
                              {dataBR(card.data_inicio, false)} → {dataBR(card.data_fim, false)}
                            </span>
                          </span>
                        </button>
                        <div className="relative" style={{ width: larguraTempo }}>
                          <BarraMicro card={card} ini={faixa.ini} px={px} usuarios={usuarios} onAbrir={onAbrirCard} />
                        </div>
                      </div>
                    );
                  })}
                {aberta && micros.length === 0 && (
                  <div className="relative flex h-9 border-b border-gray-100">
                    <div className="sticky left-0 z-20 flex shrink-0 items-center border-r border-gray-200 bg-white pl-9 text-[11px] italic text-gray-400" style={{ width: LARGURA_ESQUERDA }}>
                      Nenhuma atividade nesta macro
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}

          {pode && (
            <div className="relative flex">
              <form onSubmit={adicionarMacro} className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-gray-200 bg-white px-3 py-2.5" style={{ width: LARGURA_ESQUERDA }}>
                <Plus size={15} className="shrink-0 text-gray-400" />
                <input
                  value={novaMacro}
                  onChange={(e) => setNovaMacro(e.target.value)}
                  maxLength={150}
                  placeholder="Nova macro tarefa (Enter)"
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-[13px] placeholder:text-gray-400 hover:border-gray-200 focus:border-primary-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {salvandoMacro && <Loader2 size={14} className="animate-spin text-gray-400" />}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
