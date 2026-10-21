import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChartGantt, Milestone, TriangleAlert, X } from 'lucide-react';
import { getVersaoCronograma, listCronogramaCentros } from '../../../api/cronogramaCentros.api';
import JanelaCentroCusto from './JanelaCentroCusto';
import CardsCarteira from './CardsCarteira';
import GanttObras, { LegendaGantt, ZOOMS_GANTT } from './GanttObras';
import { filtrarSituacao, isoHoje, montarObras, naEtapa, numerosTopo, obrasDaVersao, plural, resumoCarteira } from './cronogramaObras';

// ---------------------------------------------------------------------------------------
// Operações > Cronogramas Obras > Cronogramas (pedido do usuário): no topo, os números da
// carteira — VGV, unidades e quantas obras estão em cada etapa hoje (CardsCarteira, os mesmos cards
// do dashboard Cronogramas de Obras) —; embaixo, o Gantt das obras
// mês a mês (GanttObras — o mesmo do dashboard Cronogramas de Obras). Clicar numa obra abre o
// cadastro dela (JanelaCentroCusto); clicar num card de etapa filtra o Gantt (só as obras que
// estão nela hoje). Os filtros "Obras" (`situacao`) e "Mudanças" (`versaoId` — as obras alteradas
// numa versão, com como eram antes) ficam ao lado da empresa, na página (CronogramasObrasPage).
// ---------------------------------------------------------------------------------------

export default function CronogramasTab({ empresaId, situacao = '', versaoId = '', onLimparVersao }) {
  const [etapas, setEtapas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [atraso, setAtraso] = useState(null); // Regra de Atraso da Construção (aba Configurações)
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [zoom, setZoom] = useState('mensal'); // abre no mês a mês (pedido do usuário)
  const [destaque, setDestaque] = useState(null); // id da etapa destacada pelos cards
  const [aberto, setAberto] = useState(null); // centro aberto na janela do cadastro
  const [versaoDetalhe, setVersaoDetalhe] = useState(null);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    listCronogramaCentros(empresaId)
      .then((r) => {
        setEtapas(r.etapas);
        setCentros(r.centros);
        setAtraso(r.atraso);
      })
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar o cronograma.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setEtapas([]);
    setCentros([]);
    setAtraso(null);
    setDestaque(null);
    carregar();
  }, [carregar]);

  useEffect(() => {
    setVersaoDetalhe(null);
    if (!empresaId || !versaoId) return;
    getVersaoCronograma(empresaId, versaoId)
      .then(setVersaoDetalhe)
      .catch(() => onLimparVersao?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, versaoId]);

  const obras = useMemo(() => filtrarSituacao(montarObras(centros, etapas, isoHoje(), atraso), situacao), [centros, etapas, atraso, situacao]);
  const r = useMemo(() => resumoCarteira(obras, etapas), [obras, etapas]);
  // "Mudanças da versão": o Gantt fica com as obras alteradas nela (como ficaram + como eram antes).
  const obrasVersao = useMemo(
    () => (versaoDetalhe ? filtrarSituacao(obrasDaVersao(versaoDetalhe, isoHoje()), situacao) : null),
    [versaoDetalhe, situacao]
  );

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
  // Card de etapa clicado → o Gantt fica só com as obras dela hoje e VGV e unidades somam só elas.
  const baseGantt = obrasVersao || obras;
  const obrasGantt = etapaDestacada ? baseGantt.filter((o) => naEtapa(o, destaque)) : baseGantt;
  const rGantt = etapaDestacada || obrasVersao ? resumoCarteira(obrasGantt, etapas) : r;
  const topo = etapaDestacada ? numerosTopo(obrasGantt, `em ${etapaDestacada.descricao}`) : numerosTopo(obras);

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
        <CardsCarteira resumo={r} topo={topo} destaque={destaque} onDestaque={setDestaque} />
      </div>

      {/* Gantt — overflow-clip (não hidden): recorta sem virar área de rolagem, então a barra de
          rolagem do Gantt gruda no rodapé da tela */}
      <div className="overflow-clip rounded-xl border border-gray-200">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">Linha do tempo das obras</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {versaoDetalhe
                ? plural(rGantt.comCronograma, `obra alterada na versão ${versaoDetalhe.numero}`, `obras alteradas na versão ${versaoDetalhe.numero}`)
                : plural(rGantt.comCronograma, 'obra no cronograma', 'obras no cronograma')}
              {rGantt.aIniciar > 0 && ` · ${plural(rGantt.aIniciar, 'a iniciar', 'a iniciar')}`}
              {rGantt.concluidas > 0 && ` · ${plural(rGantt.concluidas, 'concluída', 'concluídas')}`}
              {rGantt.semCronograma > 0 && <span className="text-amber-600"> · {plural(rGantt.semCronograma, 'sem datas', 'sem datas')}</span>}
              {versaoDetalhe && (
                <button
                  type="button"
                  onClick={() => onLimparVersao?.()}
                  className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-200"
                >
                  Mudanças da versão {versaoDetalhe.numero} <X size={11} />
                </button>
              )}
              {etapaDestacada && (
                <button
                  type="button"
                  onClick={() => setDestaque(null)}
                  className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-200"
                >
                  Só em {etapaDestacada.descricao} <X size={11} />
                </button>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <LegendaGantt etapas={etapas} atraso={atraso} comparando={Boolean(obrasVersao)} />
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
        <GanttObras etapas={etapas} obras={obrasGantt} zoom={zoom} onAbrirObra={setAberto} />
      </div>

      <JanelaCentroCusto empresaId={empresaId} centro={aberto} onFechar={() => setAberto(null)} onSalvo={carregar} />
    </div>
  );
}
