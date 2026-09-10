import { Search } from 'lucide-react';
import Card from '../../../../components/Card';
import { CLUSTERS, CLUSTER_ICON, CLUSTER_ICON_COR } from './constantes';

// Ícone do próprio cluster (mesmo de toda a régua) — colorido quando o
// template pode ser usado naquele cluster, cinza quando não.
function IconeCluster({ cluster, aceso }) {
  const Icone = CLUSTER_ICON[cluster.id];
  return <Icone size={14} title={cluster.nome} className={aceso ? CLUSTER_ICON_COR[cluster.id] : 'text-gray-300'} />;
}

const norm = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Tela inteira é só isto: a listagem. Criar ou editar um template acontece
// numa janela à parte (ver TemplateFormModal.jsx, aberta pelo pai a partir
// de onSelecionar/onNovo) — aqui só se escolhe qual.
export default function TemplateList({ templates, onSelecionar, onNovo, busca, onBusca, filtroCluster, onFiltroCluster }) {
  const filtrados = templates.filter((t) => {
    const okCluster = filtroCluster === 'todos' || t.clusters.includes(filtroCluster);
    const okBusca = !busca || norm(`${t.nome} ${t.descricao} ${t.assunto} ${t.corpo}`).includes(norm(busca));
    return okCluster && okBusca;
  });

  return (
    <Card className="rounded-tl-none">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Templates</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {filtrados.length === templates.length ? `${templates.length} no total` : `${filtrados.length} de ${templates.length}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onNovo}
          className="shrink-0 rounded-full border border-primary-100 bg-primary-50 px-3.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
        >
          + Novo template
        </button>
      </div>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder="Buscar por nome, assunto ou texto"
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-7 pr-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary-100"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onFiltroCluster('todos')}
            aria-pressed={filtroCluster === 'todos'}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${
              filtroCluster === 'todos' ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            Todos
          </button>
          {CLUSTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onFiltroCluster(c.id)}
              aria-pressed={filtroCluster === c.id}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                filtroCluster === c.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              {c.nome}
            </button>
          ))}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          {templates.length === 0 ? 'Nenhum template ainda. Use "+ Novo template" para criar o primeiro.' : 'Nada encontrado com esse filtro.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtrados.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelecionar(t.id)}
              className="rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/30"
            >
              <p className="truncate text-[13px] font-medium leading-snug text-gray-900">{t.nome}</p>
              <p className="mt-0.5 h-8 overflow-hidden text-xs leading-snug text-gray-400">{t.descricao || '—'}</p>
              <div className="mt-2 flex items-center gap-1.5">
                {CLUSTERS.map((c) => (
                  <IconeCluster key={c.id} cluster={c} aceso={t.clusters.includes(c.id)} />
                ))}
                {t.enviar_boleto && <span className="ml-auto font-mono text-[10px] text-primary-600">boleto</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
