import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CircleDollarSign, Download, Filter, LayoutGrid, Layers, LineChart, Loader2, Table2, Users } from 'lucide-react';
import { getAgingPainel } from '../../../../api/dashboards.api';
import CabecalhoDashboard from '../../CabecalhoDashboard';
import { FiltroCentros } from '../fluxo/FluxoCaixaPainel';
import { DicaProvider } from '../fluxo/graficos';
import { SumarioCtx } from '../fluxo/ganchos';
import SumarioModal from '../fluxo/sumario';
import '../fluxo/painel.css';
import './aging.css';
import { brl, dm, escopo, preparar, titulo } from './modelo';
import { exportarAging } from './exportar';
import { Detalhamento, Escada, Maiores, Simulador, Tiles } from './secoes';
import { ABAS_SUMARIO } from './sumarioTexto';

// Dashboard Econômico Financeiro › Aging List, no layout do painel do Fluxo de Caixa: barra de controles
// (Empresa, Centro de custo, Previsões financeiras), os 8 indicadores, a escada de vencimentos (a pagar ×
// a receber por faixa), o simulador do caixa dos próximos dias (a partir do Saldo Contas Bancárias), o
// detalhamento em árvore até a parcela e os maiores devedores e credores. Dados de
// /dashboards/economico-financeiro/aging (todas as parcelas em aberto, recalculadas no navegador por
// aging/modelo.js); recarrega sozinho a cada 30 minutos com a aba visível.

const MIN_RECARGA = 30;
const ICONES_SUMARIO = { filtros: Filter, indicadores: LayoutGrid, faixas: Layers, simulador: LineChart, detalhamento: Table2, maiores: Users };
const quando = (ts) => {
  if (!ts) return '–';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function AgingPainel({ dashboard, tituloTela, empresaId, onEmpresa, opcoesEmpresas, empresaTravada, carregandoEmpresas, marcaEmpresa }) {
  const [centros, setCentros] = useState([]);
  const [previsoes, setPrevisoes] = useState(false);
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState('ocioso'); // ocioso | carregando | erro
  const [erro, setErro] = useState('');
  const [faixaSel, setFaixaSel] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [sumario, setSumario] = useState({ aberta: false, aba: 'filtros' });
  const abrirSumario = useCallback((aba = 'filtros') => setSumario({ aberta: true, aba }), []);
  const fecharSumario = useCallback(() => setSumario((s) => ({ ...s, aberta: false })), []);
  const pedido = useRef(0);

  // Trocar de empresa limpa os dados, os centros e a faixa.
  useEffect(() => {
    setDados(null);
    setCentros((c) => (c.length ? [] : c));
    setFaixaSel(null);
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

  const E = useMemo(() => (dados ? escopo(dados, { centros, previsoes }) : null), [dados, centros, previsoes]);

  const opcoesCentros = useMemo(
    () => (dados?.centros || []).map((c) => ({ value: c.id, label: titulo(c.nome) })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [dados]
  );

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
            <FiltroCentros opcoes={opcoesCentros} valor={centros} onChange={setCentros} disabled={!empresaId || !dados} />
            <div className="ctl">
              <span className="rot">Previsões financeiras</span>
              <div className="seg" role="group" aria-label="Previsões financeiras">
                <button
                  type="button"
                  aria-pressed={!previsoes}
                  onClick={() => setPrevisoes(false)}
                  title="Previsões (de contrato de medição, de pedido de compra…) ficam fora: o documento real que as substitui também está no Sienge"
                >
                  Fora
                </button>
                <button type="button" aria-pressed={previsoes} onClick={() => setPrevisoes(true)} title="Somar as previsões financeiras ao a pagar e ao a receber">
                  Incluir
                </button>
              </div>
            </div>
            {dados && (
              <div className="base">
                Sienge: a receber <b>{quando(dados.bases.r)}</b> · a pagar <b>{quando(dados.bases.p)}</b>
                <br />
                Saldos bancários: <b>{dados.bancos.data ? dm(dados.bancos.data) : 'sem lançamento'}</b>
                {E && !previsoes && E.previsoesFora > 0 ? (
                  <>
                    {' '}
                    · previsões fora: <b>{brl(E.previsoesFora)}</b>
                  </>
                ) : null}
              </div>
            )}
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
              <p className="note">
                <CircleDollarSign size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
                Valores em saldo corrigido das parcelas em aberto do Sienge. Posição de hoje ({dm(dados.hoje)}).
              </p>
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
