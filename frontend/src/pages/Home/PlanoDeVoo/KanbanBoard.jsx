import { useState } from 'react';
import { CalendarDays, CheckCircle2, Loader2, MessageSquare, Paperclip, Plane, Plus } from 'lucide-react';
import Avatar from './Avatar';
import { BUCKETS, dataBR, destinosPermitidos, prazo } from './kanban';

function CardKanban({ card, hoje, usuarios, visao, usuarioAtualId, arrastavel, arrastando, finalizando, onAbrir, onFinalizar, onDragStart, onDragEnd }) {
  const responsavel = usuarios[card.responsavel_id];
  const criador = usuarios[card.criador_id];
  const p = prazo(card, hoje);
  const deOutro = visao === 'minhas' && criador && card.criador_id !== usuarioAtualId;
  return (
    <div
      draggable={arrastavel}
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
      onClick={() => onAbrir(card.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onAbrir(card.id)}
      className={`rounded-lg border border-gray-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition duration-150 hover:border-gray-300 hover:shadow-card focus:outline-none focus:ring-2 focus:ring-primary-100 ${
        arrastavel ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${arrastando ? 'opacity-40' : ''}`}
    >
      <p className="truncate text-[11px] text-gray-400">{card.empresa_nome}</p>
      <p className="mt-0.5 line-clamp-2 text-[13px] font-medium leading-snug text-gray-900">{card.assunto}</p>
      {card.descricao && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">{card.descricao}</p>}
      {card.plano_nome && (
        <p className="mt-2 flex min-w-0 items-center gap-1 text-[11px] font-medium text-primary-600" title={`Plano de voo: ${card.plano_nome} · ${card.macro_nome}`}>
          <Plane size={11} className="shrink-0 -rotate-12" />
          <span className="truncate">{card.macro_nome}</span>
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5 text-[11px]">
          <span className="flex items-center gap-1 text-gray-400" title={`${dataBR(card.data_inicio)} → ${dataBR(card.data_fim)}`}>
            <CalendarDays size={12} />
            <span className="tabular-nums">{dataBR(card.data_fim, false)}</span>
          </span>
          <span className={`truncate ${p.tom}`}>{p.texto}</span>
          {card.comentarios > 0 && (
            <span className="flex items-center gap-0.5 text-gray-400" title={`${card.comentarios} comentário(s)`}>
              <MessageSquare size={11} /> {card.comentarios}
            </span>
          )}
          {card.anexos > 0 && (
            <span className="flex items-center gap-0.5 text-gray-400" title={`${card.anexos} anexo(s)`}>
              <Paperclip size={11} /> {card.anexos}
            </span>
          )}
        </div>
        <div className="flex shrink-0 -space-x-1.5">
          {deOutro && <Avatar usuario={criador} tamanho="xs" titulo={`Criada por ${criador.nome}`} />}
          <Avatar usuario={responsavel} tamanho="xs" titulo={`Responsável: ${responsavel?.nome || ''}`} />
        </div>
      </div>

      {/* Concluído: só quem criou finaliza — o botão verde aparece só pra ele. */}
      {card.bucket === 'CONCLUIDO' &&
        (card.criador_id === usuarioAtualId ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFinalizar(card);
            }}
            disabled={finalizando}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {finalizando ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Finalizar
          </button>
        ) : (
          <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] text-gray-400">
            Aguardando {criador?.nome.split(' ')[0] || 'o criador'} finalizar
          </p>
        ))}
    </div>
  );
}

// Quadro com as colunas (Finalizado só aparece com a chave "Finalizados" ligada). Arrastar usa
// o drag-and-drop nativo do navegador: enquanto um card é arrastado, as colunas permitidas
// ganham contorno e as proibidas ficam esmaecidas. Só o
// responsável arrasta os próprios cards.
export default function KanbanBoard({
  cards,
  hoje,
  usuarios,
  visao,
  usuarioAtualId,
  mostrarFinalizados,
  onAbrir,
  onMover,
  onAdicionar,
  onFinalizar,
  movendoId,
  finalizandoId,
}) {
  const [arrastado, setArrastado] = useState(null);
  const [colunaSobre, setColunaSobre] = useState(null);

  const permitidos = arrastado ? destinosPermitidos(arrastado, hoje) : [];
  const colunas = mostrarFinalizados ? BUCKETS : BUCKETS.filter((b) => b.id !== 'FINALIZADO');

  function iniciarArraste(e, card) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(card.id));
    // adia pra o navegador capturar a "foto" do card antes de esmaecer o original
    requestAnimationFrame(() => setArrastado(card));
  }

  function encerrarArraste() {
    setArrastado(null);
    setColunaSobre(null);
  }

  return (
    <div className={`grid grid-cols-1 items-start gap-3 md:grid-cols-2 ${mostrarFinalizados ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
      {colunas.map((b) => {
        const doBucket = cards.filter((c) => c.bucket === b.id);
        const podeSoltar = arrastado && permitidos.includes(b.id);
        const proibido = arrastado && !podeSoltar && arrastado.bucket !== b.id;
        const sobre = colunaSobre === b.id && podeSoltar;
        return (
          <section
            key={b.id}
            onDragOver={(e) => {
              if (!podeSoltar) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (colunaSobre !== b.id) setColunaSobre(b.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setColunaSobre((atual) => (atual === b.id ? null : atual));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const card = arrastado;
              encerrarArraste();
              if (card && podeSoltar) onMover(card, b.id);
            }}
            className={`rounded-xl border ${b.borda} ${b.fundo} p-2 transition duration-150 ${sobre ? `ring-2 ${b.alvo} bg-white` : podeSoltar ? 'ring-1 ring-gray-300' : ''} ${
              proibido ? 'opacity-40' : ''
            }`}
          >
            <header className="flex items-center gap-2 px-1.5 pb-2.5 pt-1">
              <b.Icone size={15} className={b.iconeCor} />
              <h3 className="text-[13px] font-semibold text-gray-700">{b.titulo}</h3>
              <span className={`ml-auto rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums ${b.contador}`}>{doBucket.length}</span>
            </header>

            <div className="flex min-h-20 flex-col gap-2">
              {/* Sempre o primeiro de Aguardando: cria uma atividade nova. */}
              {b.id === 'AGUARDANDO' && (
                <button
                  type="button"
                  onClick={onAdicionar}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white/60 px-3 py-2.5 text-[13px] font-medium text-gray-500 transition hover:border-primary-500 hover:bg-white hover:text-primary-600"
                >
                  <Plus size={15} />
                  Adicionar card
                </button>
              )}
              {doBucket.map((card) => (
                <CardKanban
                  key={card.id}
                  card={card}
                  hoje={hoje}
                  usuarios={usuarios}
                  visao={visao}
                  usuarioAtualId={usuarioAtualId}
                  arrastavel={card.responsavel_id === usuarioAtualId && destinosPermitidos(card, hoje).length > 0 && movendoId !== card.id}
                  arrastando={arrastado?.id === card.id || movendoId === card.id}
                  finalizando={finalizandoId === card.id}
                  onFinalizar={onFinalizar}
                  onAbrir={onAbrir}
                  onDragStart={iniciarArraste}
                  onDragEnd={encerrarArraste}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
