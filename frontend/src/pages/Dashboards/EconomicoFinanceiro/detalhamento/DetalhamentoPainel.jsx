import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CalendarRange, Download, Filter, LayoutGrid, Loader2, Table2, Workflow } from 'lucide-react';
import { getDetalhamentoPainel } from '../../../../api/dashboards.api';
import CabecalhoDashboard from '../../CabecalhoDashboard';
import CampoPeriodo from '../fluxo/CampoPeriodo';
import { FiltroCentros, centrosDoFiltro } from '../fluxo/FluxoCaixaPainel';
import { DicaProvider } from '../fluxo/graficos';
import { SumarioCtx } from '../fluxo/ganchos';
import SumarioModal from '../fluxo/sumario';
import '../fluxo/painel.css';
import '../aging/aging.css';
import './detalhamento.css';
import { escopo, periodoPadrao, preparar, titulo } from './modelo';
import { exportarDetalhamento } from './exportar';
import { Detalhamento, FluxoDinheiro, Grafico, Resumo } from './secoes';
import { ABAS_SUMARIO } from './sumarioTexto';

// Dashboard Econômico Financeiro › Detalhamento Financeiro, no layout do Aging List: barra (Empresa, Início e
// Fim — padrão o ano atual inteiro — e Centro de custo), o resumo (entradas, saídas e resultado: realizado,
// em aberto e total), o gráfico mês a mês, o Sankey de onde veio e para onde foi cada real e o detalhamento
// por centro de custo, plano de contas e cliente/fornecedor até o lançamento, com as entradas e as saídas
// lado a lado. Dados de /dashboards/economico-financeiro/detalhamento — o realizado do extrato das contas com
// "Projeta DFC" (mesma base do DFC) e o em aberto do Aging List —, recalculados no navegador por
// detalhamento/modelo.js; recarrega sozinho a cada 30 minutos com a aba visível.

const MIN_RECARGA = 30;
const ICONES_SUMARIO = { base: Filter, resumo: LayoutGrid, grafico: CalendarRange, sankey: Workflow, detalhamento: Table2 };
const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function DetalhamentoPainel({ dashboard, tituloTela, empresaId, onEmpresa, opcoesEmpresas, empresaTravada, carregandoEmpresas, marcaEmpresa }) {
  const [periodo, setPeriodo] = useState(() => periodoPadrao(hojeLocal()));
  const { inicio, fim } = periodo;
  const [marcados, setMarcados] = useState([]); // centros marcados no filtro
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
    setMarcados([]);
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
  const centros = useMemo(() => centrosDoFiltro(marcados, opcoesCentros), [marcados, opcoesCentros]);
  const E = useMemo(() => (dados ? escopo(dados, { centros }) : null), [dados, centros]);

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
            <FiltroCentros opcoes={opcoesCentros} valor={marcados} onChange={setMarcados} disabled={!empresaId || !dados} selecionarTodos />
            <div className="acoes">
              {estado === 'carregando' && dados && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--muted)' }} aria-label="Atualizando" />}
              <button type="button" className="btn ghost icone com-texto" onClick={() => abrirSumario()} title="Sumário das análises">
                <BookOpen size={16} />
                Sumário
              </button>
              <button type="button" className="btn ghost icone" onClick={exportar} disabled={!E || exportando} title="Exportar Excel" aria-label="Exportar Excel">
                {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              </button>
            </div>
          </section>

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
                <Grafico E={E} />
                <FluxoDinheiro E={E} />
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
