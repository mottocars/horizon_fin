import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LocateFixed, Maximize2, Minimize2, X } from 'lucide-react';
import CabecalhoDashboard from '../CabecalhoDashboard';
import { listEmpresas } from '../../../api/empresas.api';
import { listCronogramaCentros } from '../../../api/cronogramaCentros.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import GanttObras, { LegendaGantt, ZOOMS_GANTT } from '../../Operacoes/CronogramasObras/GanttObras';
import CardsCarteira from '../../Operacoes/CronogramasObras/CardsCarteira';
import { isoHoje, montarObras, naEtapa, numerosTopo, plural, resumoCarteira } from '../../Operacoes/CronogramasObras/cronogramaObras';
import { mesAno } from '../../Operacoes/CronogramasObras/formatos';
import '../EconomicoFinanceiro/fluxo/painel.css';
import './cronogramas.css';

// Dashboards > Cronogramas de Obras (pedido do usuário): no layout do Econômico Financeiro — tela
// inteira, cabeçalho dos dashboards, barra de controles e os cards (CardsCarteira, no estilo .tile
// do painel do CFO — os mesmos da aba Cronogramas de Operações > Cronogramas Obras: VGV, unidades e
// quantas obras estão em cada etapa hoje) e, embaixo, o mesmo Gantt (GanttObras), aqui
// só leitura: quem vê o dashboard pode não ter acesso ao cadastro dos centros de custo. Clicar num
// card de etapa destaca no Gantt as obras que estão nela hoje. A empresa fica na URL (?empresa_id=).

export default function CronogramasObrasDashboard() {
  const [params, setParams] = useSearchParams();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();

  function atualizarParams(patch) {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        Object.entries(patch).forEach(([k, v]) => (v === null || v === undefined || v === '' ? novo.delete(k) : novo.set(k, String(v))));
        return novo;
      },
      { replace: true }
    );
  }

  // ─── Empresa (mesmo esquema do Econômico Financeiro) ──────────────────────────────────────────
  const empresaId = params.get('empresa_id') || '';
  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((r) => setEmpresas(r.data))
      .finally(() => setCarregandoEmpresas(false));
  }, []);

  useEffect(() => {
    if (empresaTravada && empresaIdTravada && empresaId !== String(empresaIdTravada)) atualizarParams({ empresa_id: empresaIdTravada });
    else if (!carregandoEmpresas && !empresaId && empresas.length === 1) atualizarParams({ empresa_id: empresas[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaTravada, empresaIdTravada, carregandoEmpresas, empresas, empresaId]);

  const empresaAtual = empresas.find((e) => String(e.id) === String(empresaId));
  const marcaEmpresa = empresaAtual ? { logo: empresaAtual.logo || null, nome: nomeExibicaoEmpresa(empresaAtual) } : null;

  // ─── Cronograma ───────────────────────────────────────────────────────────────────────────────
  const [etapas, setEtapas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [atraso, setAtraso] = useState(null); // Regra de Atraso da Construção (aba Configurações)
  const [estado, setEstado] = useState('carregando'); // carregando | ok | erro
  const [erro, setErro] = useState('');
  const [zoom, setZoom] = useState('geral');
  const [destaque, setDestaque] = useState(null);
  const [selecionada, setSelecionada] = useState(null); // sienge_id da obra clicada no Gantt
  const [telaCheia, setTelaCheia] = useState(false);
  const ganttRef = useRef(null);

  // "Hoje": no mês a mês leva a régua até hoje; na visão geral (tudo já cabe na tela) troca para o
  // mês a mês, que abre com hoje à vista.
  function irParaHoje() {
    if (zoom === 'mensal') ganttRef.current?.irParaHoje();
    else setZoom('mensal');
  }

  // Tela cheia (como no Plano de Voo): pede também a do navegador; o Esc dele sai e o
  // `fullscreenchange` fecha a nossa junto. Sem a do navegador, o Esc é tratado aqui.
  useEffect(() => {
    if (!telaCheia) return undefined;
    const doc = document.documentElement;
    if (!document.fullscreenElement && doc.requestFullscreen) doc.requestFullscreen().catch(() => {});
    const aoTrocar = () => {
      if (!document.fullscreenElement) setTelaCheia(false);
    };
    const aoTeclar = (e) => {
      if (e.key === 'Escape') setTelaCheia(false);
    };
    document.addEventListener('fullscreenchange', aoTrocar);
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('fullscreenchange', aoTrocar);
      window.removeEventListener('keydown', aoTeclar);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [telaCheia]);

  const carregar = useCallback(() => {
    setEtapas([]);
    setCentros([]);
    setAtraso(null);
    setDestaque(null);
    setSelecionada(null);
    if (!empresaId) return;
    setEstado('carregando');
    listCronogramaCentros(empresaId)
      .then((r) => {
        setEtapas(r.etapas);
        setCentros(r.centros);
        setAtraso(r.atraso);
        setEstado('ok');
      })
      .catch((err) => {
        setErro(err.response?.data?.message || 'Não foi possível carregar o cronograma.');
        setEstado('erro');
      });
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const hoje = isoHoje();
  // Só as obras com alguma data de etapa (pedido do usuário): as sem cronograma saem do dashboard
  // inteiro — cards, etiqueta e Gantt. Na aba de Operações elas continuam, com o convite pra preencher.
  const obras = useMemo(() => montarObras(centros, etapas, hoje, atraso).filter((o) => o.segmentos.length), [centros, etapas, hoje, atraso]);
  const r = useMemo(() => resumoCarteira(obras, etapas), [obras, etapas]);
  const etapaDestacada = etapas.find((e) => e.id === destaque);

  // Cards dinâmicos (pedido do usuário): card de etapa clicado → o Gantt fica só com as obras dela
  // hoje e VGV e unidades somam só elas; obra clicada no Gantt → todos os cards mostram só ela (o
  // filtro da etapa continua no Gantt).
  const obraSelecionada = obras.find((o) => o.centro.sienge_id === selecionada) || null;
  const rCards = useMemo(() => (obraSelecionada ? resumoCarteira([obraSelecionada], etapas) : r), [obraSelecionada, etapas, r]);
  const topo = obraSelecionada
    ? numerosTopo([obraSelecionada], 'da obra')
    : etapaDestacada
      ? numerosTopo(obras.filter((o) => naEtapa(o, destaque)), `em ${etapaDestacada.descricao}`)
      : numerosTopo(obras);
  const obrasGantt = etapaDestacada ? obras.filter((o) => naEtapa(o, destaque)) : obras;
  const rGantt = etapaDestacada ? resumoCarteira(obrasGantt, etapas) : r;
  const destacar = (id) => {
    setSelecionada(null);
    setDestaque(id);
  };
  const selecionar = (centro) => setSelecionada((atual) => (atual === centro.sienge_id ? null : centro.sienge_id));

  return (
    <div className="flex min-h-full w-full flex-col gap-3 p-5">
      <div className="painel-cfo">
        <CabecalhoDashboard
          dashboard="Cronogramas de Obras"
          titulo="Carteira de obras"
          etiquetas={empresaId && estado === 'ok' ? [{ rotulo: 'Obras', valor: r.totalObras }, { rotulo: 'Referência', valor: mesAno(hoje) }] : []}
          marca={marcaEmpresa}
        />

        <section className="controls" aria-label="Controles do painel">
          <div className="ctl">
            <label htmlFor="f-empresa">Empresa</label>
            <select
              id="f-empresa"
              value={empresaId}
              onChange={(e) => atualizarParams({ empresa_id: e.target.value })}
              disabled={carregandoEmpresas || empresaTravada}
            >
              {!empresaId && <option value="">{carregandoEmpresas ? 'Carregando…' : 'Selecione a empresa'}</option>}
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {nomeExibicaoEmpresa(e)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {!empresaId ? (
          <div className="panel">
            <div className="empty">Escolha a empresa na barra acima para montar o painel.</div>
          </div>
        ) : estado === 'erro' ? (
          <div className="sec-err">
            <b>Não foi possível montar o painel</b>
            {erro}
          </div>
        ) : estado === 'carregando' ? (
          <section className="tiles cronograma" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="tile">
                <div className="sk" style={{ height: 14, width: '60%' }} />
                <div className="sk" style={{ height: 28, width: '70%', marginTop: 6 }} />
                <div className="sk" style={{ height: 12, width: '80%', marginTop: 6 }} />
              </div>
            ))}
          </section>
        ) : (
          <>
            {/* Os números da carteira */}
            <CardsCarteira resumo={rCards} topo={topo} destaque={destaque} onDestaque={destacar} />

            {/* O Gantt */}
            <section className={`panel${telaCheia ? ' tela-cheia' : ''}`} aria-labelledby="h-gantt">
              <div className="ph">
                <h2 id="h-gantt">Linha do tempo das obras</h2>
                <p>
                  {plural(rGantt.comCronograma, 'obra no cronograma', 'obras no cronograma')}
                  {rGantt.aIniciar > 0 && ` · ${plural(rGantt.aIniciar, 'a iniciar', 'a iniciar')}`}
                  {rGantt.concluidas > 0 && ` · ${plural(rGantt.concluidas, 'concluída', 'concluídas')}`}
                  {rGantt.semCronograma > 0 && ` · ${plural(rGantt.semCronograma, 'sem datas', 'sem datas')}`}
                  {etapaDestacada && (
                    <button type="button" className="destaque-chip" onClick={() => destacar(null)} title="Voltar para todas as obras">
                      Só em {etapaDestacada.descricao} <X size={11} />
                    </button>
                  )}
                  {obraSelecionada && (
                    <button type="button" className="destaque-chip" onClick={() => setSelecionada(null)} title="Voltar para todas as obras">
                      Só {obraSelecionada.centro.name} <X size={11} />
                    </button>
                  )}
                </p>
              </div>
              <div className="gantt-barra">
                <LegendaGantt etapas={etapas} atraso={atraso} />
                {/* Hoje, zoom e tela cheia — como na barra do Gantt do Plano de Voo (pedido do usuário) */}
                <div className="gantt-acoes">
                  <button type="button" className="btn ghost icone com-texto" onClick={irParaHoje} title="Levar a régua até hoje">
                    <LocateFixed size={15} />
                    Hoje
                  </button>
                  <div className="seg" role="group" aria-label="Zoom do gráfico">
                    {ZOOMS_GANTT.map((z) => (
                      <button key={z.id} type="button" aria-pressed={zoom === z.id} onClick={() => setZoom(z.id)}>
                        {z.rotulo}
                      </button>
                    ))}
                  </div>
                  {telaCheia ? (
                    <>
                      <span className="dica-esc">Esc para sair</span>
                      <button type="button" className="btn ghost icone com-texto" onClick={() => setTelaCheia(false)}>
                        <Minimize2 size={15} />
                        Sair da tela cheia
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn ghost icone"
                      onClick={() => setTelaCheia(true)}
                      title="Tela cheia"
                      aria-label="Tela cheia"
                    >
                      <Maximize2 size={15} />
                    </button>
                  )}
                </div>
              </div>
              <div className="gantt-moldura">
                {/* a barra de rolagem gruda no rodapé de quem rola na vertical: o <main> do dashboard
                    (sem padding) ou, na tela cheia, o próprio painel (padding 24px) */}
                <GanttObras
                  ref={ganttRef}
                  etapas={etapas}
                  obras={obrasGantt}
                  zoom={zoom}
                  selecionada={selecionada}
                  onSelecionarObra={selecionar}
                  fundoBarra={telaCheia ? '-bottom-6' : 'bottom-0'}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
