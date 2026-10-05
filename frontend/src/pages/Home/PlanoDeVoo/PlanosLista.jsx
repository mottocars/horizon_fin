import { CalendarRange, Layers, ListChecks, Plane, Plus } from 'lucide-react';
import Avatar from './Avatar';
import { BUCKETS, dataBR } from './kanban';

// Barra de progresso segmentada com as cores dos buckets do Kanban, lida como progresso: o que
// já foi entregue à esquerda, o que falta à direita.
const ORDEM_PROGRESSO = ['FINALIZADO', 'CONCLUIDO', 'PROGRESSO', 'ATRASADO', 'AGUARDANDO'].map((id) => BUCKETS.find((b) => b.id === id));

export function BarraBuckets({ porBucket, total, altura = 'h-1.5' }) {
  return (
    <div className={`flex ${altura} w-full overflow-hidden rounded-full bg-gray-100`}>
      {total > 0 &&
        ORDEM_PROGRESSO.map((b) =>
          porBucket[b.id] ? (
            <span key={b.id} className={b.barra} style={{ width: `${(porBucket[b.id] / total) * 100}%` }} title={`${b.titulo}: ${porBucket[b.id]}`} />
          ) : null
        )}
    </div>
  );
}

function CardPlano({ plano, usuarios, onAbrir }) {
  const pessoas = [plano.criador_id, ...plano.membros];
  return (
    <button
      type="button"
      onClick={() => onAbrir(plano.id)}
      className="group flex flex-col rounded-xl border border-gray-200/80 bg-white p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-primary-200 hover:shadow-card focus:outline-none focus:ring-2 focus:ring-primary-100"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 transition group-hover:bg-primary-600 group-hover:text-white">
          <Plane size={17} className="-rotate-12" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-gray-400">{plano.empresa_nome}</p>
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900">{plano.nome}</p>
        </div>
        <span className="shrink-0 text-lg font-semibold tabular-nums text-gray-900">
          {plano.progresso}
          <span className="text-xs text-gray-400">%</span>
        </span>
      </div>

      <div className="mt-4">
        <BarraBuckets porBucket={plano.porBucket} total={plano.total} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        <span className="flex items-center gap-1">
          <Layers size={12} className="text-gray-400" /> {plano.macros} macro{plano.macros === 1 ? '' : 's'}
        </span>
        <span className="flex items-center gap-1">
          <ListChecks size={12} className="text-gray-400" /> {plano.total} atividade{plano.total === 1 ? '' : 's'}
        </span>
        {plano.inicio && (
          <span className="flex items-center gap-1 tabular-nums">
            <CalendarRange size={12} className="text-gray-400" /> {dataBR(plano.inicio, false)} → {dataBR(plano.fim)}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
        <div className="flex -space-x-1.5">
          {pessoas.slice(0, 6).map((id) => (
            <Avatar key={id} usuario={usuarios[id]} tamanho="xs" />
          ))}
          {pessoas.length > 6 && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 ring-2 ring-white">
              +{pessoas.length - 6}
            </span>
          )}
        </div>
        {plano.porBucket.ATRASADO > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
            {plano.porBucket.ATRASADO} atrasada{plano.porBucket.ATRASADO === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </button>
  );
}

// Aba "Plano de voo": um card por plano + o card de criar no começo.
export default function PlanosLista({ planos, usuarios, onAbrir, onNovo }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      <button
        type="button"
        onClick={onNovo}
        className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 text-sm font-medium text-gray-500 transition hover:border-primary-500 hover:bg-white hover:text-primary-600"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
          <Plus size={18} />
        </span>
        Novo plano de voo
      </button>
      {planos.map((p) => (
        <CardPlano key={p.id} plano={p} usuarios={usuarios} onAbrir={onAbrir} />
      ))}
    </div>
  );
}
