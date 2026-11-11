import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CalendarRange, Download, Filter, LayoutGrid, Loader2, SlidersHorizontal, Table2 } from 'lucide-react';
import { excluirFiltroSalvo, getDetalhamentoPainel, gravarFiltroSalvo, listarFiltrosSalvos } from '../../../../api/dashboards.api';
import CabecalhoDashboard from '../../CabecalhoDashboard';
import CampoPeriodo from '../fluxo/CampoPeriodo';
import { FiltroCentros, centrosDoFiltro } from '../fluxo/FluxoCaixaPainel';
import { DicaProvider } from '../fluxo/graficos';
import { SumarioCtx } from '../fluxo/ganchos';
import SumarioModal from '../fluxo/sumario';
import '../fluxo/painel.css';
import '../aging/aging.css';
import './detalhamento.css';
import { fimDe, filtrosNoPainel, filtrosVazios, inicioDe, mesesDoPeriodo, mesmosFiltros, normalizarFiltros } from '../aging/modelo';
import { PainelFiltros, ResumoFiltros } from '../aging/filtros';
import { escopo, periodoPadrao, preparar, titulo } from './modelo';
import { exportarDetalhamento } from './exportar';
import { Detalhamento, Grafico, Resumo } from './secoes';
import { ABAS_SUMARIO } from './sumarioTexto';

// Dashboard Econômico Financeiro › Detalhamento Financeiro, no layout do Aging List: barra (Empresa, Início e
// Fim — padrão o ano atual inteiro — e Centro de custo), o resumo (entradas, saídas e resultado: realizado,
// em aberto e total), o gráfico mês a mês do realizado, o do em aberto e o detalhamento
// por centro de custo, plano de contas e cliente/fornecedor até o lançamento, com as entradas e as saídas
// lado a lado. Dados de /dashboards/economico-financeiro/detalhamento — o realizado do extrato das contas com
// "Projeta DFC" (mesma base do DFC) e o em aberto do Aging List —, recalculados no navegador por
// detalhamento/modelo.js; recarrega sozinho a cada 30 minutos com a aba visível.

const DASHBOARD = 'economico-financeiro';
const TELA = 'detalhamento';
const MIN_RECARGA = 30;
const ICONES_SUMARIO = { base: Filter, resumo: LayoutGrid, grafico: CalendarRange, detalhamento: Table2 };
const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function DetalhamentoPainel({ dashboard, tituloTela, empresaId, onEmpresa, opcoesEmpresas, empresaTravada, carregandoEmpresas, marcaEmpresa }) {
  const [periodo, setPeriodo] = useState(() => periodoPadrao(hojeLocal()));
  const { inicio, fim } = periodo;
  // Filtros do Aging List (centros, documento, plano de contas, cliente, fornecedor, previsão, título) + filtros salvos.
  const [filtros, setFiltros] = useState(filtrosVazios);
  const [painelFiltros, setPainelFiltros] = useState(false);
  const [salvos, setSalvos] = useState([]);
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState('ocioso'); // ocioso | carregando | erro
  const [erro, setErro] = useState('');
  const [exportando, setExportando] = useState(false);
  const [sumario, setSumario] = useState({ aberta: false, aba: 'base' });
  const abrirSumario = useCallback((aba = 'base') => setSumario({ aberta: true, aba }), []);
  const fecharSumario = useCallback(() => setSumario((s) => ({ ...s, aberta: false })), []);
  const pedido = useRef(0);

  // Trocar de empresa limpa os dados e os centros.
  useEffect(() => {
    setDados(null);
    setFiltros(filtrosVazios());
    setSalvos([]);
    if (!empresaId) return;
    listarFiltrosSalvos(DASHBOARD, TELA, empresaId)
      .then(setSalvos)
      .catch(() => setSalvos([]));
  }, [empresaId]);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    const meu = ++pedido.current;
    setEstado('carregando');
    getDetalhamentoPainel({ empresa_id: empresaId, de: inicio, ate: fim })
      .then((d) => {
        if (meu !== pedido.current) return;
        setDados(preparar(d));
        setEstado('ocioso');
        setErro('');
      })
      .catch((e) => {
        if (meu !== pedido.current) return;
        setEstado('erro');
        setErro(e?.response?.data?.message || e?.response?.data?.error || 'Não foi possível carregar o detalhamento.');
      });
  }, [empresaId, inicio, fim]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && carregar(), MIN_RECARGA * 60000);
    return () => clearInterval(t);
  }, [carregar]);

  const opcoesCentros = useMemo(
    () => (dados?.centros || []).map((c) => ({ value: c.id, label: titulo(c.nome) })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [dados]
  );
  const centros = useMemo(() => centrosDoFiltro(filtros.centros, opcoesCentros), [filtros.centros, opcoesCentros]);
  const valendo = useMemo(() => ({ ...filtros, centros }), [filtros, centros]);
  const E = useMemo(() => (dados ? escopo(dados, valendo) : null), [dados, valendo]);

  // O painel de filtros do Aging lê as listas no formato dele: documentos, plano de contas e pessoas.
  const Bfiltros = useMemo(
    () =>
      dados && {
        documentos: dados.documentos || {},
        catalogos: dados.catalogos || {},
        naturezas: Object.fromEntries(Object.entries(dados.planos || {}).map(([id, [cod, nome]]) => [id, nome || cod])),
        pessoas: dados.pessoas,
        contasOpcoes: (dados.contas || []).map((c) => ({ value: c.id, label: c.nome || c.numero })),
      },
    [dados]
  );

  // Histórico e Horizonte: o período da barra em meses a partir do mês atual.
  const hoje = dados?.hoje || hojeLocal();
  const meses = mesesDoPeriodo(hoje, inicio, fim);
  const mudarMeses = (patch) =>
    setPeriodo((p) => ({
      inicio: patch.historico !== undefined ? inicioDe(hoje, patch.historico) : p.inicio,
      fim: patch.horizonte !== undefined ? fimDe(hoje, patch.horizonte) : p.fim,
    }));
  const atuais = { ...valendo, ...meses };
  const salvoAtual = salvos.find((s) => mesmosFiltros(s.filtros, atuais)) || null;
  const noPainel = filtrosNoPainel(filtros);
  const padrao = mesmosFiltros(atuais, { ...filtrosVazios(), ...mesesDoPeriodo(hoje, periodoPadrao(hoje).inicio, periodoPadrao(hoje).fim) });

  function aplicarSalvo(s) {
    if (!s) {
      setFiltros(filtrosVazios());
      setPeriodo(periodoPadrao(hoje));
      return;
    }
    const { historico, horizonte, ...resto } = normalizarFiltros(s.filtros);
    setFiltros(resto);
    mudarMeses({ ...(historico !== null ? { historico } : {}), ...(horizonte !== null ? { horizonte } : {}) });
  }
  async function gravarFiltro(nome) {
    const salvo = await gravarFiltroSalvo(DASHBOARD, TELA, empresaId, nome, normalizarFiltros(atuais));
    setSalvos((lista) => [...lista.filter((s) => s.id !== salvo.id), salvo].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
  }
  async function excluirFiltro(salvo) {
    await excluirFiltroSalvo(DASHBOARD, TELA, salvo.id);
    setSalvos((lista) => lista.filter((s) => s.id !== salvo.id));
  }

  async function exportar() {
    setExportando(true);
    try {
      const nome = (dados.empresa || 'empresa').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await exportarDetalhamento(E, `detalhamento-financeiro_${nome}_${dados.periodo.de}_a_${dados.periodo.ate}.xlsx`);
    } finally {
      setExportando(false);
    }
  }

  return (
    <DicaProvider>
      <SumarioCtx.Provider value={abrirSumario}>
        <div className="painel-cfo detfin">
          <CabecalhoDashboard dashboard={dashboard} titulo={tituloTela} marca={marcaEmpresa} />

          <section className="controls" aria-label="Controles do detalhamento financeiro">
            <div className="ctl">
              <label htmlFor="df-empresa">Empresa</label>
              <select id="df-empresa" value={empresaId} onChange={(e) => onEmpresa(e.target.value)} disabled={carregandoEmpresas || empresaTravada}>
                {!empresaId && <option value="">{carregandoEmpresas ? 'Carregando…' : 'Selecione a empresa'}</option>}
                {opcoesEmpresas.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <CampoPeriodo
              tipo="date"
              id="df-inicio"
              rotulo="Início"
              valor={inicio}
              min="2000-01-01"
              max={fim}
              onChange={(v) => setPeriodo((p) => ({ ...p, inicio: v }))}
              dica="Realizado: lançamentos a partir desta data. Em aberto: parcelas que vencem a partir dela."
            />
            <CampoPeriodo
              tipo="date"
              id="df-fim"
              rotulo="Fim"
              valor={fim}
              min={inicio}
              onChange={(v) => setPeriodo((p) => ({ ...p, fim: v }))}
              dica="Realizado: lançamentos até esta data (no máximo, hoje). Em aberto: parcelas que vencem até ela."
            />
            <FiltroCentros
              opcoes={opcoesCentros}
              valor={filtros.centros}
              onChange={(c) => setFiltros((f) => ({ ...f, centros: c }))}
              disabled={!empresaId || !dados}
              selecionarTodos
            />
            <div className="ctl salvos">
              <label htmlFor="df-salvos">Filtros salvos</label>
              <select
                id="df-salvos"
                value={salvoAtual ? String(salvoAtual.id) : ''}
                disabled={!empresaId || !salvos.length}
                onChange={(e) => aplicarSalvo(salvos.find((x) => String(x.id) === e.target.value))}
              >
                <option value="">{salvos.length ? (padrao ? 'Nenhum' : 'Personalizado') : 'Nenhum filtro salvo'}</option>
                {salvos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="acoes">
              {estado === 'carregando' && dados && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--muted)' }} aria-label="Atualizando" />}
              <button type="button" className="btn ghost icone com-texto" onClick={() => abrirSumario()} title="Sumário das análises">
                <BookOpen size={16} />
                Sumário
              </button>
              <button
                type="button"
                className={`btn ghost icone com-texto${painelFiltros || noPainel ? ' ativo' : ''}`}
                onClick={() => setPainelFiltros((a) => !a)}
                disabled={!dados}
                aria-expanded={painelFiltros}
                title={painelFiltros ? 'Fechar os filtros' : 'Abrir os filtros'}
              >
                <SlidersHorizontal size={16} />
                Filtros
                {noPainel > 0 && <span className="contador">{noPainel}</span>}
              </button>
              <button type="button" className="btn ghost icone" onClick={exportar} disabled={!E || exportando} title="Exportar Excel" aria-label="Exportar Excel">
                {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </button>
            </div>
          </section>

          {dados && painelFiltros && (
            <PainelFiltros
              B={Bfiltros}
              filtros={filtros}
              onFiltros={setFiltros}
              meses={meses}
              periodo={periodo}
              onMeses={mudarMeses}
              salvos={salvos}
              salvoAtual={salvoAtual}
              onGravar={gravarFiltro}
              onExcluir={excluirFiltro}
              onFechar={() => setPainelFiltros(false)}
            />
          )}
          {dados && !painelFiltros && <ResumoFiltros B={Bfiltros} filtros={filtros} onFiltros={setFiltros} />}

          {!empresaId ? (
            <div className="panel">
              <div className="empty">Escolha a empresa na barra acima para montar o detalhamento.</div>
            </div>
          ) : !E ? (
            estado === 'erro' ? (
              <div className="sec-err">
                <b>Não foi possível montar o detalhamento</b>
                {erro}
              </div>
            ) : (
              <section className="resumo" aria-hidden="true">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="sk" style={{ height: 54, margin: '6px 0' }} />
                ))}
              </section>
            )
          ) : (
            <>
              {!dados.contas.length && (
                <div className="aviso">
                  Nenhuma conta com "Projeta DFC" nesta empresa, então não há realizado — só o em aberto. Marque as contas em Operações › DFC Construtoras › Contas Correntes
                  e busque o extrato (rotina "Saldos das contas (Sienge)" do Monitor de Integrações).
                </div>
              )}
              <Resumo E={E} />
              <div className="grid">
                <Grafico E={E} tipo="R" />
                <Grafico E={E} tipo="A" />
                <Detalhamento E={E} />
              </div>
            </>
          )}
          <SumarioModal
            aberta={sumario.aberta}
            aba={sumario.aba}
            onAba={(aba) => setSumario({ aberta: true, aba })}
            onFechar={fecharSumario}
            abas={ABAS_SUMARIO}
            icones={ICONES_SUMARIO}
            contexto="Econômico/Financeiro · Detalhamento Financeiro"
          />
        </div>
      </SumarioCtx.Provider>
    </DicaProvider>
  );
}
