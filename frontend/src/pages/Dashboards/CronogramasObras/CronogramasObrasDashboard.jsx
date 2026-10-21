import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Loader2, LocateFixed, Maximize2, Minimize2, X } from 'lucide-react';
import CabecalhoDashboard from '../CabecalhoDashboard';
import { listEmpresas } from '../../../api/empresas.api';
import {
  exportarCronogramaExcel,
  getVersaoCronograma,
  listCronogramaCentros,
  listVersoesCronograma,
} from '../../../api/cronogramaCentros.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import GanttObras, { LegendaGantt, ZOOMS_GANTT } from '../../Operacoes/CronogramasObras/GanttObras';
import CardsCarteira from '../../Operacoes/CronogramasObras/CardsCarteira';
import {
  FILTROS_SITUACAO,
  filtrarPeriodo,
  filtrarSituacao,
  isoHoje,
  montarObras,
  naRecorte,
  nomeObra,
  numerosTopo,
  obrasDaVersao,
  plural,
  periodoPadrao,
  resumoCarteira,
  rotuloRecorte,
} from '../../Operacoes/CronogramasObras/cronogramaObras';
import { mesAno } from '../../Operacoes/CronogramasObras/formatos';
import '../EconomicoFinanceiro/fluxo/painel.css';
import './cronogramas.css';

// Dashboards > Cronogramas de Obras (pedido do usuário): no layout do Econômico Financeiro — tela
// inteira, cabeçalho dos dashboards, barra de controles e os cards (CardsCarteira, no estilo .tile
// do painel do CFO — os mesmos da aba Cronogramas de Operações > Cronogramas Obras: VGV, unidades e
// quantas obras estão em cada etapa hoje) e, embaixo, o mesmo Gantt (GanttObras), aqui
// só leitura: quem vê o dashboard pode não ter acesso ao cadastro dos centros de custo. Clicar num
// card de etapa filtra o Gantt (só as obras que estão nela hoje). A empresa fica na URL (?empresa_id=).
// Ao lado da empresa (pedidos do usuário), também na URL: "Obras" (?situacao= — todas, em andamento
// ou só as concluídas) e "Mudanças" (?versao= — uma versão gravada: o Gantt mostra só as obras
// alteradas nela, com como eram antes numa faixa fina em cima da barra), e o botão de exportar o
// Excel do comunicado (o do cronograma em vigor, ou o da versão escolhida). No Mês a mês, o período
// De/Até (padrão: 3 meses antes a 20 à frente; fica no estado da tela — só volta ao padrão ao
// recarregar): obras fora dele não aparecem e os cards somam só as do período.

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

  const situacao = params.get('situacao') || '';
  const versaoId = params.get('versao') || '';

  const empresaAtual = empresas.find((e) => String(e.id) === String(empresaId));
  const marcaEmpresa = empresaAtual ? { logo: empresaAtual.logo || null, nome: nomeExibicaoEmpresa(empresaAtual) } : null;

  // ─── Cronograma ───────────────────────────────────────────────────────────────────────────────
  const [etapas, setEtapas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [atraso, setAtraso] = useState(null); // Regra de Atraso da Construção (aba Configurações)
  const [estado, setEstado] = useState('carregando'); // carregando | ok | erro
  const [erro, setErro] = useState('');
  const [zoom, setZoom] = useState('mensal'); // abre no mês a mês (pedido do usuário)
  const [periodo, setPeriodo] = useState(periodoPadrao); // De/Até do Mês a mês
  const mudarPeriodo = (campo, valor) => {
    if (!valor) return;
    setPeriodo((p) => {
      const novo = { ...p, [campo]: valor };
      return novo.ini <= novo.fim ? novo : { ini: novo.fim, fim: novo.ini };
    });
  };
  const [destaque, setDestaque] = useState(null);
  const [selecionada, setSelecionada] = useState(null); // sienge_id da obra clicada no Gantt
  const [telaCheia, setTelaCheia] = useState(false);
  const ganttRef = useRef(null);
  const [versoes, setVersoes] = useState([]);
  const [versaoDetalhe, setVersaoDetalhe] = useState(null);
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

  // As versões gravadas (filtro "Mudanças") e, com uma escolhida, o retrato dela.
  useEffect(() => {
    setVersoes([]);
    if (!empresaId) return;
    listVersoesCronograma(empresaId)
      .then(setVersoes)
      .catch(() => setVersoes([]));
  }, [empresaId]);
  useEffect(() => {
    setVersaoDetalhe(null);
    if (!empresaId || !versaoId) return;
    getVersaoCronograma(empresaId, versaoId)
      .then(setVersaoDetalhe)
      .catch(() => atualizarParams({ versao: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, versaoId]);

  // Exportar Excel (como no Econômico Financeiro): a mesma planilha do comunicado.
  async function exportarExcel() {
    setErroExportacao('');
    setExportando(true);
    try {
      const { blob, nome } = await exportarCronogramaExcel(empresaId, versaoId || null);
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
  const obras = useMemo(
    () => filtrarSituacao(montarObras(centros, etapas, hoje, atraso).filter((o) => o.segmentos.length), situacao),
    [centros, etapas, hoje, atraso, situacao]
  );
  // "Mudanças da versão": o Gantt fica com as obras alteradas nela (como ficaram + como eram antes).
  const obrasVersao = useMemo(
    () => (versaoDetalhe ? filtrarSituacao(obrasDaVersao(versaoDetalhe, hoje), situacao) : null),
    [versaoDetalhe, hoje, situacao]
  );
  // Mês a mês: só as obras do período De/Até (cards e Gantt); Visão geral: todas.
  const periodoAtivo = zoom === 'mensal' ? periodo : null;
  const obrasPeriodo = useMemo(() => filtrarPeriodo(obras, periodoAtivo), [obras, periodoAtivo]);
  const obrasVersaoPeriodo = useMemo(() => (obrasVersao ? filtrarPeriodo(obrasVersao, periodoAtivo) : null), [obrasVersao, periodoAtivo]);
  const baseGantt = obrasVersaoPeriodo || obrasPeriodo;
  const r = useMemo(() => resumoCarteira(obrasPeriodo, etapas), [obrasPeriodo, etapas]);
  const recorte = rotuloRecorte(destaque, etapas);

  // Cards dinâmicos (pedido do usuário): card de etapa clicado → o Gantt fica só com as obras dela
  // hoje e VGV e unidades somam só elas; obra clicada no Gantt → todos os cards mostram só ela (o
  // filtro da etapa continua no Gantt).
  const obraSelecionada = baseGantt.find((o) => o.centro.sienge_id === selecionada) || null;
  const rCards = useMemo(() => (obraSelecionada ? resumoCarteira([obraSelecionada], etapas) : r), [obraSelecionada, etapas, r]);
  const topo = obraSelecionada
    ? numerosTopo([obraSelecionada], 'da obra')
    : recorte
      ? numerosTopo(obrasPeriodo.filter((o) => naRecorte(o, destaque)), recorte.topo)
      : numerosTopo(obrasPeriodo);
  const obrasGantt = recorte ? baseGantt.filter((o) => naRecorte(o, destaque)) : baseGantt;
  const rGantt = recorte || obrasVersao ? resumoCarteira(obrasGantt, etapas) : r;
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
              onChange={(e) => atualizarParams({ empresa_id: e.target.value, versao: null })}
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
          <div className="ctl">
            <label htmlFor="f-situacao">Obras</label>
            <select id="f-situacao" value={situacao} onChange={(e) => atualizarParams({ situacao: e.target.value })} disabled={!empresaId}>
              {FILTROS_SITUACAO.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="ctl">
            <label htmlFor="f-versao">Mudanças</label>
            <select
              id="f-versao"
              value={versaoId}
              onChange={(e) => atualizarParams({ versao: e.target.value })}
              disabled={!empresaId || !versoes.length}
            >
              <option value="">{versoes.length ? 'Cronograma atual' : 'Nenhuma versão gravada'}</option>
              {versoes.map((v) => (
                <option key={v.id} value={v.id}>
                  Versão {v.numero} · {new Date(v.criado_em).toLocaleDateString('pt-BR')} ·{' '}
                  {v.alteracoes.length === 1 ? '1 obra alterada' : `${v.alteracoes.length} obras alteradas`}
                </option>
              ))}
            </select>
          </div>
          {zoom === 'mensal' && (
            <>
              <div className="ctl">
                <label htmlFor="f-de">De</label>
                <input id="f-de" type="month" value={periodo.ini} onChange={(e) => mudarPeriodo('ini', e.target.value)} disabled={!empresaId} />
              </div>
              <div className="ctl">
                <label htmlFor="f-ate">Até</label>
                <input id="f-ate" type="month" value={periodo.fim} onChange={(e) => mudarPeriodo('fim', e.target.value)} disabled={!empresaId} />
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
              title={versaoId ? 'Exportar o Excel desta versão' : 'Exportar Excel do cronograma'}
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
                  {versaoDetalhe
                    ? plural(rGantt.comCronograma, `obra alterada na versão ${versaoDetalhe.numero}`, `obras alteradas na versão ${versaoDetalhe.numero}`)
                    : plural(rGantt.comCronograma, 'obra no cronograma', 'obras no cronograma')}
                  {rGantt.aIniciar > 0 && ` · ${plural(rGantt.aIniciar, 'a iniciar', 'a iniciar')}`}
                  {rGantt.concluidas > 0 && ` · ${plural(rGantt.concluidas, 'concluída', 'concluídas')}`}
                  {rGantt.semCronograma > 0 && ` · ${plural(rGantt.semCronograma, 'sem datas', 'sem datas')}`}
                  {versaoDetalhe && (
                    <button type="button" className="destaque-chip" onClick={() => atualizarParams({ versao: null })} title="Voltar para o cronograma atual">
                      Mudanças da versão {versaoDetalhe.numero} <X size={11} />
                    </button>
                  )}
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
                <LegendaGantt etapas={etapas} atraso={atraso} comparando={Boolean(obrasVersao)} />
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
