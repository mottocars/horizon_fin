import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChartGantt, Milestone, TriangleAlert, X } from 'lucide-react';
import { listCronogramaCentros } from '../../../api/cronogramaCentros.api';
import JanelaCentroCusto from './JanelaCentroCusto';
import CardsCarteira from './CardsCarteira';
import GanttObras, { LegendaGantt, ZOOMS_GANTT } from './GanttObras';
import { isoHoje, montarObras, plural, resumoCarteira } from './cronogramaObras';

// ---------------------------------------------------------------------------------------
// Operações > Cronogramas Obras > Cronogramas (pedido do usuário): no topo, os números da
// carteira — VGV, unidades e quantas obras estão em cada etapa hoje (CardsCarteira, os mesmos cards
// do dashboard Cronogramas de Obras) —; embaixo, o Gantt das obras
// mês a mês (GanttObras — o mesmo do dashboard Cronogramas de Obras). Clicar numa obra abre o
// cadastro dela (JanelaCentroCusto); clicar num card de etapa destaca, no Gantt, as obras que
// estão nela hoje.
// ---------------------------------------------------------------------------------------

export default function CronogramasTab({ empresaId }) {
  const [etapas, setEtapas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [zoom, setZoom] = useState('geral');
  const [destaque, setDestaque] = useState(null); // id da etapa destacada pelos cards
  const [aberto, setAberto] = useState(null); // centro aberto na janela do cadastro

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

  const obras = useMemo(() => montarObras(centros, etapas, isoHoje()), [centros, etapas]);
  const r = useMemo(() => resumoCarteira(obras, etapas), [obras, etapas]);

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

      {/* Números da carteira — os mesmos cards do dashboard (pedido do usuário) */}
      <div className="painel-cfo embutido">
        <CardsCarteira resumo={r} destaque={destaque} onDestaque={setDestaque} />
      </div>

      {/* Gantt */}
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Linha do tempo das obras</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {plural(r.comCronograma, 'obra no cronograma', 'obras no cronograma')}
              {r.aIniciar > 0 && ` · ${plural(r.aIniciar, 'a iniciar', 'a iniciar')}`}
              {r.concluidas > 0 && ` · ${plural(r.concluidas, 'concluída', 'concluídas')}`}
              {r.semCronograma > 0 && <span className="text-amber-600"> · {plural(r.semCronograma, 'sem datas', 'sem datas')}</span>}
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
            <LegendaGantt etapas={etapas} />
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
              {ZOOMS_GANTT.map((z) => (
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
        <GanttObras etapas={etapas} obras={obras} zoom={zoom} destaque={destaque} onAbrirObra={setAberto} />
      </div>

      <JanelaCentroCusto empresaId={empresaId} centro={aberto} onFechar={() => setAberto(null)} onSalvo={carregar} />
    </div>
  );
}
