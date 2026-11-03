import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, BookOpen, Building2, Calculator, Filter, LayoutGrid, LineChart, Loader2, Maximize2, Route, Table2, Workflow } from 'lucide-react';
import { getDrePainel } from '../../../../api/dashboards.api';
import DreTab from '../../../Operacoes/DreGerencial/DreTab';
import PocTab from '../../../Operacoes/DreGerencial/PocTab';
import CabecalhoDashboard from '../../CabecalhoDashboard';
import { FiltroCentros } from '../fluxo/FluxoCaixaPainel';
import { DicaProvider } from '../fluxo/graficos';
import { SumarioCtx } from '../fluxo/ganchos';
import { AjudaSecao } from '../fluxo/secoes';
import SumarioModal from '../fluxo/sumario';
import '../fluxo/painel.css';
import './dre.css';
import { nome, preparar, rotuloPeriodo } from './modelo';
import { CarteiraPoc, FluxoReceita, Mensal, OrigemReceita, QuemGera, Simulador, Tiles } from './secoes';
import { ABAS_SUMARIO } from './sumarioTexto';

// Dashboard Econômico Financeiro › Demonstração do Resultado, no layout do painel do Fluxo de Caixa
// (fluxo/FluxoCaixaPainel.jsx): barra de controles (Empresa, Início e Fim em mês, Centro de custo), os 8
// indicadores, a DRE com as máscaras (a aba DRE do DRE Gerencial embutida, com tela cheia — como a grade do
// DFC no Fluxo de Caixa), o fluxo da receita (Sankey), o simulador e, embaixo, o resultado mês a mês, a
// origem da receita, quem gera resultado e a carteira de obras pela POC (com o rastreio completo da aba POC
// em tela cheia). Dados de /dashboards/economico-financeiro/dre — o mesmo motor da aba DRE; recarrega
// sozinho a cada 30 minutos com a aba visível.

const MIN_RECARGA = 30;
const ICONES_SUMARIO = { filtros: Filter, indicadores: LayoutGrid, dre: Table2, sankey: Workflow, simulador: Calculator, mensal: LineChart, origem: Route, centros: Building2, carteira: BarChart3 };

function mesHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const ultimoDia = (m) => {
  const [a, mm] = m.split('-').map(Number);
  return `${m}-${String(new Date(a, mm, 0).getDate()).padStart(2, '0')}`;
};

function CampoMes({ id, rotulo, valor, min, max, onChange, dica }) {
  return (
    <div className="ctl">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        type="month"
        value={valor}
        min={min}
        max={max}
        title={dica}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{4}-\d{2}$/.test(v) && (!min || v >= min) && (!max || v <= max)) onChange(v);
        }}
      />
    </div>
  );
}

export default function DrePainel({ dashboard, tituloTela, empresaId, onEmpresa, opcoesEmpresas, empresaTravada, carregandoEmpresas, marcaEmpresa }) {
  // Padrão: o ano até agora (de janeiro ao mês atual) — o olhar do CFO no fechamento.
  const mesAtual = mesHoje();
  const [inicioMes, setInicioMes] = useState(`${mesAtual.slice(0, 4)}-01`);
  const [fimMes, setFimMes] = useState(mesAtual);
  const [centros, setCentros] = useState([]);
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState('ocioso'); // ocioso | carregando | erro
  const [erro, setErro] = useState('');
  const [telaCheia, setTelaCheia] = useState(false);
  const [rastreio, setRastreio] = useState(null); // { obra } = aba POC em tela cheia
  const [sumario, setSumario] = useState({ aberta: false, aba: 'filtros' });
  const abrirSumario = useCallback((aba = 'filtros') => setSumario({ aberta: true, aba }), []);
  const fecharSumario = useCallback(() => setSumario((s) => ({ ...s, aberta: false })), []);
  const pedido = useRef(0);

  const de = `${inicioMes}-01`;
  const ate = ultimoDia(fimMes);

  // Trocar de empresa limpa os centros e os dados.
  useEffect(() => {
    setCentros((c) => (c.length ? [] : c));
    setDados(null);
  }, [empresaId]);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    const meu = ++pedido.current;
    setEstado('carregando');
    getDrePainel({ empresa_id: empresaId, de, ate, centros: centros.join(',') || undefined })
      .then((d) => {
        if (meu !== pedido.current) return;
        setDados(d);
        setEstado('ocioso');
        setErro('');
      })
      .catch((e) => {
        if (meu !== pedido.current) return;
        setEstado('erro');
        setErro(e?.response?.data?.message || e?.response?.data?.error || 'Não foi possível carregar a DRE.');
      });
  }, [empresaId, de, ate, centros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && carregar(), MIN_RECARGA * 60000);
    return () => clearInterval(t);
  }, [carregar]);

  const D = useMemo(() => {
    if (!dados) return null;
    try {
      return preparar(dados);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [dados]);

  // A grade da DRE recebe os dados já carregados (não calcula de novo).
  const dadosDre = useMemo(() => (dados ? { arvore: dados.arvore, resultado: dados.atual } : null), [dados]);

  const opcoesCentros = useMemo(() => (dados?.centros || []).map((c) => ({ value: c.id, label: nome(c.rotulo || c.nome) })), [dados]);
  const nomeCentro = (id) => opcoesCentros.find((o) => o.value === id)?.label || `centro ${id}`;
  const escopo = !centros.length ? 'consolidado de todos os centros' : centros.length === 1 ? nomeCentro(centros[0]) : `${centros.length} centros`;
  const selecionarCentro = (id) => setCentros((c) => (c.length === 1 && c[0] === id ? [] : [id]));

  return (
    <DicaProvider>
      <SumarioCtx.Provider value={abrirSumario}>
        <div className="painel-cfo dre">
          <CabecalhoDashboard dashboard={dashboard} titulo={tituloTela} marca={marcaEmpresa} />

          <section className="controls" aria-label="Controles da DRE">
            <div className="ctl">
              <label htmlFor="d-empresa">Empresa</label>
              <select id="d-empresa" value={empresaId} onChange={(e) => onEmpresa(e.target.value)} disabled={carregandoEmpresas || empresaTravada}>
                {!empresaId && <option value="">{carregandoEmpresas ? 'Carregando…' : 'Selecione a empresa'}</option>}
                {opcoesEmpresas.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <CampoMes id="d-inicio" rotulo="Início" valor={inicioMes} min="2015-01" max={fimMes} onChange={setInicioMes} dica="Primeiro mês do período" />
            <CampoMes id="d-fim" rotulo="Fim" valor={fimMes} min={inicioMes} max={mesAtual} onChange={setFimMes} dica="Último mês do período (até o mês atual: a DRE é do realizado)" />
            <FiltroCentros opcoes={opcoesCentros} valor={centros} onChange={setCentros} disabled={!empresaId || !dados} />
            <div className="acoes">
              {estado === 'carregando' && dados && <Loader2 size={16} className="animate-spin" style={{ color: 'var(--muted)' }} aria-label="Atualizando" />}
              <button type="button" className="btn ghost icone com-texto" onClick={() => abrirSumario()} title="Sumário das análises">
                <BookOpen size={16} />
                Sumário
              </button>
            </div>
          </section>

          {!empresaId ? (
            <div className="panel">
              <div className="empty">Escolha a empresa na barra acima para montar a DRE.</div>
            </div>
          ) : !D ? (
            estado === 'erro' ? (
              <div className="sec-err">
                <b>Não foi possível montar a DRE</b>
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
          ) : !D.arvore.length ? (
            <div className="panel">
              <div className="empty">
                A DRE de {D.meta.empresa || 'esta empresa'} ainda não foi montada: cadastre as máscaras e o plano de contas em Operações › DRE Gerencial (abas
                Máscaras e Plano Contas) e marque os centros que entram nela (aba Centros Custos).
              </div>
            </div>
          ) : (
            <>
              {D.semPocReceita && (
                <div className="aviso">POC de Receita não gerada: escolha a Máscara DRE Nível 2 na aba Configurações do DRE Gerencial. Sem ela, as receitas das obras ficam fora.</div>
              )}
              <Tiles D={D} />

              <section className="panel grade-dfc grade-dre" aria-labelledby="h-dre">
                <div className="grade-barra">
                  <div>
                    <h2 id="h-dre">
                      Demonstração do resultado
                      <AjudaSecao aba="dre" rotulo="Demonstração do resultado" />
                    </h2>
                    <p>
                      {rotuloPeriodo(D.meta.de, D.meta.ate)} (até {D.meta.ate.split('-').reverse().join('/')}) · {escopo}. Clique no nome de um centro para vê-lo mês a mês.
                    </p>
                  </div>
                  <button type="button" className="btn ghost icone" onClick={() => setTelaCheia(true)} title="Tela cheia" aria-label="Tela cheia">
                    <Maximize2 size={16} />
                  </button>
                </div>
                <DreTab
                  variante="dashboard"
                  empresaId={empresaId}
                  de={D.meta.de}
                  ate={D.meta.ate}
                  centros={centros.map(String)}
                  dadosProntos={dadosDre}
                  telaCheia={telaCheia}
                  onSairTelaCheia={() => setTelaCheia(false)}
                />
              </section>

              <FluxoReceita D={D} escopo={escopo} />
              <Simulador D={D} />

              <div className="grid">
                <CarteiraPoc D={D} onRastreio={(obra) => setRastreio({ obra })} />
                <Mensal D={D} />
                <OrigemReceita D={D} />
                <QuemGera D={D} centroSel={centros.length === 1 ? centros[0] : null} onCentro={selecionarCentro} />
              </div>
            </>
          )}

          {rastreio && dados && (
            <PocTab
              empresaId={empresaId}
              de={dados.meta.de}
              ate={dados.meta.ate}
              centros={centros.map(String)}
              dadosProntos={dados.poc}
              obraInicial={rastreio.obra}
              telaCheia
              onSairTelaCheia={() => setRastreio(null)}
            />
          )}

          <SumarioModal
            aberta={sumario.aberta}
            aba={sumario.aba}
            onAba={(aba) => setSumario({ aberta: true, aba })}
            onFechar={fecharSumario}
            abas={ABAS_SUMARIO}
            icones={ICONES_SUMARIO}
            contexto="Econômico Financeiro · Demonstração do Resultado"
          />
        </div>
      </SumarioCtx.Provider>
    </DicaProvider>
  );
}
