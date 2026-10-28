import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Download, Filter, LayoutGrid, Layers, LineChart, Loader2, SlidersHorizontal, Table2, Users } from 'lucide-react';
import { excluirFiltroSalvo, getAgingPainel, gravarFiltroSalvo, listarFiltrosSalvos } from '../../../../api/dashboards.api';
import CabecalhoDashboard from '../../CabecalhoDashboard';
import { FiltroCentros } from '../fluxo/FluxoCaixaPainel';
import { DicaProvider } from '../fluxo/graficos';
import { SumarioCtx } from '../fluxo/ganchos';
import SumarioModal from '../fluxo/sumario';
import '../fluxo/painel.css';
import './aging.css';
import { FILTROS_VAZIOS, escopo, filtrosNoPainel, mesmosFiltros, normalizarFiltros, preparar, titulo } from './modelo';
import { exportarAging } from './exportar';
import { PainelFiltros, ResumoFiltros } from './filtros';
import { Detalhamento, Escada, Maiores, Simulador, Tiles } from './secoes';
import { ABAS_SUMARIO } from './sumarioTexto';

// Dashboard Econômico Financeiro › Aging List, no layout do painel do Fluxo de Caixa: barra de controles
// (Empresa, período Início–Fim do vencimento — padrão o ano atual inteiro —, Centro de custo e Filtros
// salvos; o botão "Filtros" abre o painel com tipo de documento, natureza, cliente, fornecedor e
// previsão financeira), os 8 indicadores, a escada de vencimentos (a pagar × a receber por faixa), o
// simulador do caixa dos próximos dias (a partir do Saldo Contas Bancárias), o detalhamento em árvore
// até a parcela e os maiores devedores e credores. Dados de /dashboards/economico-financeiro/aging (todas
// as parcelas em aberto, recalculadas no navegador por aging/modelo.js); recarrega sozinho a cada 30
// minutos com a aba visível.

const DASHBOARD = 'economico-financeiro';
const TELA = 'aging';
const MIN_RECARGA = 30;
const ICONES_SUMARIO = { filtros: Filter, indicadores: LayoutGrid, faixas: Layers, simulador: LineChart, detalhamento: Table2, maiores: Users };
const ehData = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function CampoData({ id, rotulo, valor, min, max, onChange, dica }) {
  return (
    <div className="ctl">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        type="date"
        value={valor}
        min={min}
        max={max}
        title={dica}
        onChange={(e) => {
          const v = e.target.value;
          if (ehData(v) && (!min || v >= min) && (!max || v <= max)) onChange(v);
        }}
      />
    </div>
  );
}

export default function AgingPainel({ dashboard, tituloTela, empresaId, onEmpresa, opcoesEmpresas, empresaTravada, carregandoEmpresas, marcaEmpresa }) {
  const ano = new Date().getFullYear();
  const [inicio, setInicio] = useState(`${ano}-01-01`);
  const [fim, setFim] = useState(`${ano}-12-31`);
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [painelFiltros, setPainelFiltros] = useState(false);
  const [salvos, setSalvos] = useState([]);
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState('ocioso'); // ocioso | carregando | erro
  const [erro, setErro] = useState('');
  const [faixaSel, setFaixaSel] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [sumario, setSumario] = useState({ aberta: false, aba: 'filtros' });
  const abrirSumario = useCallback((aba = 'filtros') => setSumario({ aberta: true, aba }), []);
  const fecharSumario = useCallback(() => setSumario((s) => ({ ...s, aberta: false })), []);
  const pedido = useRef(0);

  // Trocar de empresa limpa os dados, os filtros e a faixa, e traz os filtros salvos dela.
  useEffect(() => {
    setDados(null);
    setFiltros(FILTROS_VAZIOS);
    setFaixaSel(null);
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
    getAgingPainel({ empresa_id: empresaId })
      .then((d) => {
        if (meu !== pedido.current) return;
        setDados(preparar(d));
        setEstado('ocioso');
        setErro('');
      })
      .catch((e) => {
        if (meu !== pedido.current) return;
        setEstado('erro');
        setErro(e?.response?.data?.error || e?.response?.data?.message || 'Não foi possível carregar o aging.');
      });
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && carregar(), MIN_RECARGA * 60000);
    return () => clearInterval(t);
  }, [carregar]);

  const E = useMemo(() => (dados ? escopo(dados, { inicio, fim, ...filtros }) : null), [dados, inicio, fim, filtros]);

  const opcoesCentros = useMemo(
    () => (dados?.centros || []).map((c) => ({ value: c.id, label: titulo(c.nome) })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [dados]
  );

  // Filtro salvo igual aos filtros de agora (a lista da barra mostra ele; mexeu, deixa de mostrar).
  const salvoAtual = salvos.find((s) => mesmosFiltros(s.filtros, filtros)) || null;
  const noPainel = filtrosNoPainel(filtros);

  async function gravarFiltro(nome) {
    const salvo = await gravarFiltroSalvo(DASHBOARD, TELA, empresaId, nome, normalizarFiltros(filtros));
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
      await exportarAging(E, `aging-list_${nome}_${dados.hoje}.xlsx`);
    } finally {
      setExportando(false);
    }
  }

  const irParaDetalhe = (f) => {
    setFaixaSel(f);
    if (f) document.getElementById('h-det')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <DicaProvider>
      <SumarioCtx.Provider value={abrirSumario}>
        <div className="painel-cfo aging">
          <CabecalhoDashboard dashboard={dashboard} titulo={tituloTela} marca={marcaEmpresa} />

          <section className="controls" aria-label="Controles do aging">
            <div className="ctl">
              <label htmlFor="a-empresa">Empresa</label>
              <select id="a-empresa" value={empresaId} onChange={(e) => onEmpresa(e.target.value)} disabled={carregandoEmpresas || empresaTravada}>
                {!empresaId && <option value="">{carregandoEmpresas ? 'Carregando…' : 'Selecione a empresa'}</option>}
                {opcoesEmpresas.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <CampoData id="a-inicio" rotulo="Início" valor={inicio} max={fim} onChange={setInicio} dica="Vencimento a partir desta data" />
            <CampoData id="a-fim" rotulo="Fim" valor={fim} min={inicio} onChange={setFim} dica="Vencimento até esta data" />
            <FiltroCentros opcoes={opcoesCentros} valor={filtros.centros} onChange={(c) => setFiltros((f) => ({ ...f, centros: c }))} disabled={!empresaId || !dados} />
            <div className="ctl salvos">
              <label htmlFor="a-salvos">Filtros salvos</label>
              <select
                id="a-salvos"
                value={salvoAtual ? String(salvoAtual.id) : ''}
                disabled={!empresaId || !salvos.length}
                onChange={(e) => {
                  const s = salvos.find((x) => String(x.id) === e.target.value);
                  setFiltros(s ? normalizarFiltros(s.filtros) : FILTROS_VAZIOS);
                }}
              >
                <option value="">{salvos.length ? (noPainel || filtros.centros.length ? 'Personalizado' : 'Nenhum') : 'Nenhum filtro salvo'}</option>
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
              B={dados}
              filtros={filtros}
              onFiltros={setFiltros}
              salvos={salvos}
              salvoAtual={salvoAtual}
              onGravar={gravarFiltro}
              onExcluir={excluirFiltro}
              onFechar={() => setPainelFiltros(false)}
            />
          )}
          {dados && !painelFiltros && <ResumoFiltros B={dados} filtros={filtros} onFiltros={setFiltros} />}

          {!empresaId ? (
            <div className="panel">
              <div className="empty">Escolha a empresa na barra acima para montar o aging.</div>
            </div>
          ) : !E ? (
            estado === 'erro' ? (
              <div className="sec-err">
                <b>Não foi possível montar o aging</b>
                {erro}
              </div>
            ) : (
              <section className="tiles" aria-hidden="true">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i} className="tile">
                    <div className="sk" style={{ height: 14, width: '60%' }} />
                    <div className="sk" style={{ height: 28, width: '80%', marginTop: 6 }} />
                    <div className="sk" style={{ height: 12, width: '70%', marginTop: 6 }} />
                  </div>
                ))}
              </section>
            )
          ) : (
            <>
              <Tiles E={E} />
              <div className="grid">
                <Escada E={E} faixaSel={faixaSel} onFaixa={irParaDetalhe} />
                <Simulador E={E} />
                <Detalhamento E={E} faixaSel={faixaSel} onFaixa={setFaixaSel} />
                <Maiores E={E} lado="r" />
                <Maiores E={E} lado="p" />
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
            contexto="Econômico Financeiro · Aging List"
          />
        </div>
      </SumarioCtx.Provider>
    </DicaProvider>
  );
}
