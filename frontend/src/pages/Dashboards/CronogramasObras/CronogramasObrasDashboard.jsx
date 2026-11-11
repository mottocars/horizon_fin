import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChartGantt, Download, House, Loader2, LocateFixed, Maximize2, Minimize2, TrendingUp, X } from 'lucide-react';
import CabecalhoDashboard from '../CabecalhoDashboard';
import ControlesDashboard from '../ControlesDashboard';
import CapaDashboard from '../capa/CapaDashboard';
import engenheiro from '../../../assets/dashboards/engenheiro-obras.webp';
import AvancoObras from './AvancoObras';
import { listEmpresas } from '../../../api/empresas.api';
import { exportarCronogramaExcel, listCronogramaCentros } from '../../../api/cronogramaCentros.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import GanttObras, { LegendaGantt, ZOOMS_GANTT } from '../../Operacoes/CronogramasObras/GanttObras';
import CardsCarteira from '../../Operacoes/CronogramasObras/CardsCarteira';
import CampoDataPeriodo from '../../Operacoes/CronogramasObras/CampoDataPeriodo';
import {
  filtrarObras,
  filtrarPeriodo,
  isoHoje,
  mesesDoPeriodo,
  montarObras,
  obrasNasLocalidades,
  naRecorte,
  nomeObra,
  numerosTopo,
  opcoesFiltroObras,
  opcoesLocalidade,
  plural,
  periodoPadrao,
  resumoCarteira,
  rotuloRecorte,
  trocarDataPeriodo,
} from '../../Operacoes/CronogramasObras/cronogramaObras';
import { mesAno } from '../../Operacoes/CronogramasObras/formatos';
import { FiltroCentros } from '../EconomicoFinanceiro/fluxo/FluxoCaixaPainel';
import '../EconomicoFinanceiro/fluxo/painel.css';
import './cronogramas.css';

// Dashboards > Obra 360º (ex-Cronogramas de Obras; pedido do usuário): abre na capa laranja com o
// engenheiro (CapaDashboard, como a do Econômico/Financeiro) e o menu de telas aberto; as outras telas
// são a Carteira de obras (?tela=carteira) e o Avanço das Obras (?tela=avancos, AvancoObras.jsx). Sem
// tela favorita: a rota de favoritas do servidor só atende o Econômico/Financeiro.
//
// Carteira de obras: no layout do Econômico Financeiro — tela
// inteira, cabeçalho dos dashboards, barra de controles e os cards (CardsCarteira, no estilo .tile
// do painel do CFO — os mesmos da aba Cronogramas de Operações > Cronogramas Obras: VGV, unidades e
// quantas obras estão em cada etapa hoje) e, embaixo, o mesmo Gantt (GanttObras), aqui
// só leitura: quem vê o dashboard pode não ter acesso ao cadastro dos centros de custo. Clicar num
// card de etapa filtra o Gantt (só as obras que estão nela hoje). A empresa fica na URL (?empresa_id=).
// Ao lado da empresa (pedidos do usuário), também na URL: "Obras" (?obra= — os centros de custo
// marcados), "Localidade" (?local= — Cidade - UF) e "Etapas" (?sem_etapa= — as desmarcadas; no lugar
// do antigo filtro Mudanças, pedido do usuário: etapa desmarcada some do dashboard — barras, legenda
// e card), os três com marcação múltipla (a chave repetida na URL), e o botão de exportar o Excel do
// comunicado (o do cronograma em vigor, com todas as etapas). No Mês a mês, o período
// De/Até (padrão: 3 meses antes a 20 à frente; fica no estado da tela — só volta ao padrão ao
// recarregar): obras fora dele não aparecem e os cards somam só as do período.

function CarteiraObras() {
  const [params, setParams] = useSearchParams();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();

  function atualizarParams(patch) {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        Object.entries(patch).forEach(([k, v]) => {
          // lista (filtros de marcação múltipla): a chave repetida, uma vez por valor
          if (Array.isArray(v)) {
            novo.delete(k);
            v.forEach((x) => novo.append(k, String(x)));
          } else if (v === null || v === undefined || v === '') novo.delete(k);
          else novo.set(k, String(v));
        });
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

  // "Obras" (?obra=): os sienge_id dos centros marcados; "Localidade" (?local=): Cidade - UF.
  const textoObras = params.getAll('obra').join('|');
  const textoLocal = params.getAll('local').join('|');
  const obrasMarcadas = useMemo(() => (textoObras ? textoObras.split('|') : []), [textoObras]);
  const localidades = useMemo(() => (textoLocal ? textoLocal.split('|') : []), [textoLocal]);
  // "Etapas" (?sem_etapa=): os ids das etapas desmarcadas — nasce com todas marcadas.
  const textoSemEtapa = params.getAll('sem_etapa').join('|');
  const etapasOcultas = useMemo(() => (textoSemEtapa ? textoSemEtapa.split('|') : []), [textoSemEtapa]);

  const empresaAtual = empresas.find((e) => String(e.id) === String(empresaId));
  const marcaEmpresa = empresaAtual ? { logo: empresaAtual.logo || null, nome: nomeExibicaoEmpresa(empresaAtual) } : null;

  // ─── Cronograma ───────────────────────────────────────────────────────────────────────────────
  const [etapas, setEtapas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [atraso, setAtraso] = useState(null); // Regra de Atraso da Construção (aba Configurações)
  const [estado, setEstado] = useState('carregando'); // carregando | ok | erro
  const [erro, setErro] = useState('');
  const [zoom, setZoom] = useState('mensal'); // abre no mês a mês (pedido do usuário)
  // De/Até do Mês a mês: digitado com dia, mês e ano, mas só mês e ano valem (`periodo` em 'AAAA-MM').
  const [datasPeriodo, setDatasPeriodo] = useState(periodoPadrao);
  const periodo = useMemo(() => mesesDoPeriodo(datasPeriodo), [datasPeriodo]);
  const mudarPeriodo = (campo, valor) => setDatasPeriodo((d) => trocarDataPeriodo(d, campo, valor));
  const [destaque, setDestaque] = useState(null);
  const [selecionada, setSelecionada] = useState(null); // sienge_id da obra clicada no Gantt
  const [telaCheia, setTelaCheia] = useState(false);
  const ganttRef = useRef(null);
  const [exportando, setExportando] = useState(false);
  const [erroExportacao, setErroExportacao] = useState('');

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

  // Exportar Excel (como no Econômico Financeiro): a mesma planilha do comunicado.
  async function exportarExcel() {
    setErroExportacao('');
    setExportando(true);
    try {
      const { blob, nome } = await exportarCronogramaExcel(empresaId, null);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // Com responseType 'blob' a mensagem de erro do backend chega dentro de um Blob.
      let mensagem = 'Não foi possível gerar o Excel.';
      const dados = err.response?.data;
      try {
        mensagem = (dados instanceof Blob ? JSON.parse(await dados.text()) : dados)?.message || mensagem;
      } catch {
        // fica a mensagem padrão
      }
      setErroExportacao(mensagem);
    } finally {
      setExportando(false);
    }
  }

  const hoje = isoHoje();
  // Só as obras com alguma data de etapa (pedido do usuário): as sem cronograma saem do dashboard
  // inteiro — cards, etiqueta e Gantt. Na aba de Operações elas continuam, com o convite pra preencher.
  // Filtro Etapas: as marcadas (cards, legenda e Gantt) — obra que só tem etapas desmarcadas sai.
  const etapasVisiveis = useMemo(() => etapas.filter((e) => !etapasOcultas.includes(String(e.id))), [etapas, etapasOcultas]);
  const obrasTodas = useMemo(
    () =>
      montarObras(centros, etapas, hoje, atraso, etapasOcultas.length ? new Set(etapasVisiveis.map((e) => e.id)) : null).filter(
        (o) => o.segmentos.length
      ),
    [centros, etapas, hoje, atraso, etapasOcultas, etapasVisiveis]
  );
  const obras = useMemo(() => filtrarObras(obrasTodas, obrasMarcadas, localidades), [obrasTodas, obrasMarcadas, localidades]);
  // Opções dos filtros "Obras" (situações + centros) e "Localidade": só as obras do dashboard (com datas).
  const centrosComDatas = useMemo(() => obrasTodas.map((o) => o.centro), [obrasTodas]);
  const opcoesObras = useMemo(() => opcoesFiltroObras(centrosComDatas, localidades), [centrosComDatas, localidades]);
  const opcoesLocal = useMemo(() => opcoesLocalidade(centrosComDatas), [centrosComDatas]);
  const opcoesEtapas = useMemo(() => etapas.map((e) => ({ value: String(e.id), label: e.descricao || 'Sem nome' })), [etapas]);
  const mudarEtapas = (marcadas) =>
    atualizarParams({ sem_etapa: etapas.map((e) => String(e.id)).filter((id) => !marcadas.includes(id)) });
  // Card de etapa clicado e a etapa desmarcada depois: o recorte sai junto.
  useEffect(() => {
    if (destaque !== null && etapasOcultas.includes(String(destaque))) setDestaque(null);
  }, [destaque, etapasOcultas]);
  // Mês a mês: só as obras do período De/Até (cards e Gantt); Visão geral: todas.
  const periodoAtivo = zoom === 'mensal' ? periodo : null;
  const obrasPeriodo = useMemo(() => filtrarPeriodo(obras, periodoAtivo), [obras, periodoAtivo]);
  const baseGantt = obrasPeriodo;
  const r = useMemo(() => resumoCarteira(obrasPeriodo, etapasVisiveis, periodoAtivo), [obrasPeriodo, etapasVisiveis, periodoAtivo]);
  const recorte = rotuloRecorte(destaque, etapasVisiveis, periodoAtivo);

  // Cards dinâmicos (pedido do usuário): card de etapa clicado → o Gantt fica só com as obras que
  // estiveram nela em algum momento do período (naRecorte) e VGV e unidades somam só elas; obra clicada no Gantt → todos os cards mostram só ela (o
  // filtro da etapa continua no Gantt).
  const obraSelecionada = baseGantt.find((o) => o.centro.sienge_id === selecionada) || null;
  const rCards = useMemo(
    () => (obraSelecionada ? resumoCarteira([obraSelecionada], etapasVisiveis, periodoAtivo) : r),
    [obraSelecionada, etapasVisiveis, periodoAtivo, r]
  );
  const topo = obraSelecionada
    ? numerosTopo([obraSelecionada], 'da obra')
    : recorte
      ? numerosTopo(obrasPeriodo.filter((o) => naRecorte(o, destaque, periodoAtivo)), recorte.topo)
      : numerosTopo(obrasPeriodo);
  const obrasGantt = recorte ? baseGantt.filter((o) => naRecorte(o, destaque, periodoAtivo)) : baseGantt;
  const rGantt = recorte ? resumoCarteira(obrasGantt, etapasVisiveis, periodoAtivo) : r;
  const destacar = (id) => {
    setSelecionada(null);
    setDestaque(id);
  };
  const selecionar = (centro) => setSelecionada((atual) => (atual === centro.sienge_id ? null : centro.sienge_id));

  return (
    <div className="flex min-h-full w-full flex-col gap-3 p-5">
      <div className="painel-cfo">
        <CabecalhoDashboard
          dashboard={NOME}
          titulo="Carteira de obras"
          etiquetas={empresaId && estado === 'ok' ? [{ rotulo: 'Obras', valor: r.totalObras }, { rotulo: 'Referência', valor: mesAno(hoje) }] : []}
          marca={marcaEmpresa}
        />

        <section className="controls cronograma" aria-label="Controles do painel">
          <div className="ctl">
            <label htmlFor="f-empresa">Empresa</label>
            <select
              id="f-empresa"
              value={empresaId}
              onChange={(e) =>
                atualizarParams({ empresa_id: e.target.value, local: null, obra: null, sem_etapa: null })
              }
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
          <FiltroCentros
            id="f-obras"
            rotulo="Obras"
            todos="Todas as obras"
            varios="obras"
            buscar="Buscar obra ou centro"
            vazio="Nenhuma obra encontrada."
            opcoes={opcoesObras}
            valor={obrasMarcadas}
            onChange={(v) => atualizarParams({ obra: v })}
            disabled={!empresaId}
            selecionarTodos
          />
          <FiltroCentros
            id="f-local"
            rotulo="Localidade"
            todos="Todas as localidades"
            varios="localidades"
            buscar="Buscar cidade"
            vazio="Nenhuma localidade encontrada."
            opcoes={opcoesLocal}
            valor={localidades}
            onChange={(v) => atualizarParams({ local: v, obra: obrasNasLocalidades(obrasMarcadas, v, centros) })}
            disabled={!empresaId}
            selecionarTodos
          />
          <FiltroCentros
            id="f-etapas"
            rotulo="Etapas"
            todos="Todas as etapas"
            nenhum="Nenhuma etapa"
            varios="etapas"
            buscar="Buscar etapa"
            vazio="Nenhuma etapa encontrada."
            opcoes={opcoesEtapas}
            valor={opcoesEtapas.map((o) => o.value).filter((id) => !etapasOcultas.includes(id))}
            onChange={mudarEtapas}
            disabled={!empresaId}
            selecionarTodos
            todasMarcadas
          />
          {zoom === 'mensal' && (
            <>
              <div className="ctl">
                <label htmlFor="f-de">De</label>
                <CampoDataPeriodo id="f-de" value={datasPeriodo.ini} onChange={(valor) => mudarPeriodo('ini', valor)} disabled={!empresaId} />
              </div>
              <div className="ctl">
                <label htmlFor="f-ate">Até</label>
                <CampoDataPeriodo id="f-ate" value={datasPeriodo.fim} onChange={(valor) => mudarPeriodo('fim', valor)} disabled={!empresaId} />
              </div>
            </>
          )}
          <div className="acoes">
            {erroExportacao && <span className="erro">{erroExportacao}</span>}
            <button
              type="button"
              className="btn ghost icone"
              onClick={exportarExcel}
              disabled={!empresaId || exportando || estado !== 'ok'}
              title="Exportar Excel do cronograma"
              aria-label="Exportar Excel"
            >
              {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            </button>
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
            {Array.from({ length: 5 }, (_, i) => (
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
                  {recorte && (
                    <button type="button" className="destaque-chip" onClick={() => destacar(null)} title="Voltar para todas as obras">
                      {recorte.aviso} <X size={11} />
                    </button>
                  )}
                  {obraSelecionada && (
                    <button type="button" className="destaque-chip" onClick={() => setSelecionada(null)} title="Voltar para todas as obras">
                      Só {nomeObra(obraSelecionada.centro)} <X size={11} />
                    </button>
                  )}
                </p>
              </div>
              <div className="gantt-barra">
                <LegendaGantt etapas={etapasVisiveis} atraso={atraso} />
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
                  etapas={etapasVisiveis}
                  obras={obrasGantt}
                  agruparPorCidade
                  zoom={zoom}
                  selecionada={selecionada}
                  onSelecionarObra={selecionar}
                  periodo={periodoAtivo}
                  fundoBarra={telaCheia ? '-bottom-6' : 'bottom-0'}
                  topoCabecalho={telaCheia ? '-top-6' : 'top-0'}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

const NOME = 'Obra 360º';
const TELAS = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'carteira', label: 'Carteira de obras', icon: ChartGantt },
  { id: 'avancos', label: 'Avanço das Obras', icon: TrendingUp },
];

export default function CronogramasObrasDashboard() {
  const [params, setParams] = useSearchParams();
  const daUrl = params.get('tela');
  // Link que já traz a empresa (o do comunicado de nova versão por WhatsApp — cronogramaVersoes.service.js)
  // vai direto à Carteira; pelo menu (sem parâmetros) abre a capa.
  const telaAtiva = TELAS.some((t) => t.id === daUrl) ? daUrl : params.get('empresa_id') ? 'carteira' : 'home';
  const home = telaAtiva === 'home';
  const irPara = (id) =>
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        novo.set('tela', id);
        return novo;
      },
      { replace: true }
    );

  return (
    <>
      {home ? (
        <div className="h-full w-full">
          <CapaDashboard imagem={engenheiro} nome={NOME} tema="laranja" />
        </div>
      ) : telaAtiva === 'avancos' ? (
        <AvancoObras nome={NOME} />
      ) : (
        <CarteiraObras />
      )}
      <ControlesDashboard telas={TELAS} telaAtiva={telaAtiva} onTela={irPara} abertoInicial={home} />
    </>
  );
}
