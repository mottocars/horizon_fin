import { useState } from 'react';
import { Ban, CalendarRange, GripVertical, MessageSquare, Paperclip } from 'lucide-react';
import Avatar from './Avatar';
import { BUCKETS, BUCKET_POR_ID, dataBR, destinosPermitidos, prazo } from './kanban';

function CardKanban({ card, hoje, usuarios, visao, usuarioAtualId, arrastavel, arrastando, onAbrir, onDragStart, onDragEnd }) {
  const bucket = BUCKET_POR_ID[card.bucket];
  const responsavel = usuarios[card.responsavel_id];
  const criador = usuarios[card.criador_id];
  const p = prazo(card, hoje);
  return (
    <div
      draggable={arrastavel}
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
      onClick={() => onAbrir(card.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onAbrir(card.id)}
      className={`group relative rounded-xl border border-gray-200 border-l-4 ${bucket.barra} bg-white p-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-100 ${
        arrastavel ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${arrastando ? 'rotate-2 scale-[0.98] opacity-40' : ''}`}
    >
      {arrastavel && (
        <GripVertical size={14} className="absolute right-2 top-2.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
      <div className="mb-1.5 flex items-center gap-1.5 pr-4">
        <span className="truncate rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
          {card.empresa_nome}
        </span>
      </div>
      <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900">{card.assunto}</p>
      {card.descricao && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">{card.descricao}</p>}

      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-gray-500">
        <CalendarRange size={12} className="shrink-0 text-gray-400" />
        <span className="tabular-nums">
          {dataBR(card.data_inicio, false)} → {dataBR(card.data_fim, false)}
        </span>
        <span className="text-gray-300">·</span>
        <span className={`truncate ${p.tom}`}>{p.texto}</span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5">
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          {card.comentarios > 0 && (
            <span className="flex items-center gap-1" title={`${card.comentarios} comentário(s)`}>
              <MessageSquare size={12} /> {card.comentarios}
            </span>
          )}
          {card.anexos > 0 && (
            <span className="flex items-center gap-1" title={`${card.anexos} anexo(s)`}>
              <Paperclip size={12} /> {card.anexos}
            </span>
          )}
          {visao === 'minhas' && criador && card.criador_id !== usuarioAtualId && (
            <span className="truncate text-gray-400" title={`Criada por ${criador.nome}`}>
              por {criador.nome.split(' ')[0]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {visao === 'equipe' && <span className="max-w-24 truncate text-[11px] font-medium text-gray-600">{responsavel?.nome.split(' ')[0]}</span>}
          <Avatar usuario={responsavel} tamanho="sm" titulo={`Responsável: ${responsavel?.nome || ''}`} />
        </div>
      </div>
    </div>
  );
}

// Quadro com as 4 colunas. Arrastar usa o drag-and-drop nativo do navegador (sem biblioteca):
// enquanto um card é arrastado, as colunas permitidas ganham um contorno e uma área "Solte
// aqui"; as proibidas ficam esmaecidas com o motivo. Só o responsável arrasta os próprios cards.
export default function KanbanBoard({ cards, hoje, usuarios, visao, usuarioAtualId, onAbrir, onMover, movendoId }) {
  const [arrastado, setArrastado] = useState(null);
  const [colunaSobre, setColunaSobre] = useState(null);

  const permitidos = arrastado ? destinosPermitidos(arrastado, hoje) : [];

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
    <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
      {BUCKETS.map((b) => {
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
            className={`flex flex-col rounded-2xl p-2.5 ring-1 ring-inset ring-gray-200/70 transition-all duration-150 ${b.coluna} ${
              sobre ? `ring-2 ${b.alvo}` : ''
            } ${proibido ? 'opacity-50' : ''}`}
          >
            <header className="mb-2.5 flex items-center justify-between px-1.5 pt-0.5">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${b.ponto}`} />
                <h3 className="text-sm font-semibold text-gray-800">{b.titulo}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${b.chip}`}>{doBucket.length}</span>
              </div>
              <b.Icone size={15} className="text-gray-300" />
            </header>
            {b.dica && <p className="-mt-1 mb-2 px-1.5 text-[11px] leading-snug text-gray-400">{b.dica}</p>}

            <div className="flex min-h-24 flex-col gap-2.5">
              {podeSoltar && (
                <div
                  className={`flex h-14 items-center justify-center rounded-xl border-2 border-dashed text-xs font-medium transition-colors ${
                    sobre ? 'border-current text-gray-700' : 'border-gray-300 text-gray-400'
                  }`}
                >
                  Solte aqui
                </div>
              )}
              {proibido && (
                <div className="flex h-14 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 px-3 text-center text-[11px] text-gray-400">
                  <Ban size={13} className="shrink-0" />
                  {b.id === 'ATRASADO' ? 'Atrasado é automático' : 'Atrasada só pode ir para Finalizado'}
                </div>
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
                  onAbrir={onAbrir}
                  onDragStart={iniciarArraste}
                  onDragEnd={encerrarArraste}
                />
              ))}
              {doBucket.length === 0 && !arrastado && <p className="px-2 py-6 text-center text-xs text-gray-400">{b.vazio}</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
