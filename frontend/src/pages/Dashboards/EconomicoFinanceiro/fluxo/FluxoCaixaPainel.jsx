import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Download, Loader2, Maximize2 } from 'lucide-react';
import { getFluxoCaixaPainel } from '../../../../api/dashboards.api';
import { exportarExcelDfc } from '../../../../api/dfcExportacao.api';
import DfcFluxoTab from '../../../Operacoes/DfcConstrutoras/DfcFluxoTab';
import CabecalhoDashboard from '../../CabecalhoDashboard';
import { DicaProvider } from './graficos';
import { SumarioCtx } from './ganchos';
import SumarioModal from './sumario';
import { addM, curto, modelo, titulo } from './modelo';
import { AjudaSecao, Calibracao, Carteira, DividaPj, EntradasSaidas, FolegoSpe, Hero, MaioresSaidas, QuemGera, Tiles } from './secoes';
import './painel.css';

// Dashboard Econômico Financeiro › Fluxo de Caixa, no layout do painel do CFO
// (C:\Users\motta\Desktop\layout\Especificação do Painel do CFO — Tostes e Diniz.md):
// barra de controles (Empresa no lugar do Escopo, período Início–Fim e Centro de custo), os 8
// indicadores, a grade do DFC (DfcFluxoTab) na altura da tela e, embaixo, os gráficos da especificação.
// Período: ver CampoMes (vira o Histórico/Horizonte da API). Os dados vêm de /dashboards/economico-financeiro/fluxo-caixa e o painel recarrega
// sozinho a cada 30 minutos. A grade tem o botão de tela cheia (a mesma do DFC Construtoras) e a barra o
// Exportar Excel do DFC Construtoras, com os filtros do painel (empresa, período Início–Fim, centros).

const MIN_RECARGA = 30;
const LIMITE_MESES = 36;

function mesHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
const ultimoDia = (m) => {
  const [a, mm] = m.split('-').map(Number);
  return `${m}-${String(new Date(a, mm, 0).getDate()).padStart(2, '0')}`;
};

// Período (pedido do usuário): Início e Fim em mês/ano no lugar de Histórico e Horizonte. O painel é a
// foto de hoje, então o período sempre contém o mês atual — Início até ele (até 36 meses antes), Fim a
// partir dele (até 35 depois). Por dentro vira o Histórico (meses antes do atual) e o Horizonte (meses
// do atual em diante) que a API, o modelo e o conector MCP usam (limite: LIMITE_MESES).
const diferencaMeses = (de, ate) => {
  const [a1, m1] = de.split('-').map(Number);
  const [a2, m2] = ate.split('-').map(Number);
  return a2 * 12 + m2 - (a1 * 12 + m1);
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
          if (/^\d{4}-\d{2}$/.test(v) && v >= min && v <= max) onChange(v);
        }}
      />
    </div>
  );
}

// Centro de custo: lista com marcação múltipla e busca, no visual da barra (também no Aging List).
// Os textos mudam pelas props (Cronogramas de Obras usa a mesma lista nos filtros Obras e Localidade);
// opção com `grupo` ganha um título antes da primeira do grupo (as opções vêm ordenadas por grupo).
export function FiltroCentros({
  opcoes,
  valor,
  onChange,
  disabled,
  id,
  rotulo = 'Centro de custo',
  todos = 'Todos os centros',
  varios = 'centros',
  buscar = 'Buscar centro',
  vazio = 'Nenhum centro encontrado.',
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => !ref.current?.contains(e.target) && setAberto(false);
    const esc = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);
  const q = busca.trim().toLowerCase();
  const lista = opcoes.filter((o) => !q || o.label.toLowerCase().includes(q) || (o.grupo || '').toLowerCase().includes(q));
  const resumo = !valor.length ? todos : valor.length === 1 ? opcoes.find((o) => o.value === valor[0])?.label || `1 de ${varios}` : `${valor.length} ${varios}`;
  const alternar = (id) => onChange(valor.includes(id) ? valor.filter((v) => v !== id) : [...valor, id]);
  return (
    <div className="ctl multi" ref={ref}>
      <span className="rot">{rotulo}</span>
      <button type="button" id={id} className="multi-btn" disabled={disabled} aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <span>{resumo}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {aberto && (
        <div className="multi-pop" role="listbox" aria-multiselectable="true">
          <input type="search" placeholder={buscar} value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
          <div className="multi-lista">
            {lista.map((o, i) => (
              <Fragment key={o.value}>
                {o.grupo && o.grupo !== lista[i - 1]?.grupo && <div className="multi-grupo">{o.grupo}</div>}
                <label className="multi-item">
                  <input type="checkbox" checked={valor.includes(o.value)} onChange={() => alternar(o.value)} />
                  <span>{o.label}</span>
                </label>
              </Fragment>
            ))}
            {!lista.length && <div className="empty">{vazio}</div>}
          </div>
          <div className="multi-rodape">
            <span>{valor.length ? `${valor.length} marcado${valor.length > 1 ? 's' : ''}` : 'Todos'}</span>
            <button type="button" className="btn ghost" onClick={() => onChange([])} disabled={!valor.length}>
              Limpar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// `marcaEmpresa`: { logo, nome } da empresa escolhida — a logomarca vai no canto direito do cabeçalho.
export default function FluxoCaixaPainel({ dashboard, tituloTela, empresaId, onEmpresa, opcoesEmpresas, empresaTravada, carregandoEmpresas, marcaEmpresa }) {
  // Padrão: do mês anterior ao atual até o atual + 4 (em out/26: set/26 a fev/27).
  const mesAtual = mesHoje();
  const [inicioMes, setInicioMes] = useState(() => addM(mesAtual, -1));
  const [fimMes, setFimMes] = useState(() => addM(mesAtual, 4));
  const hist = diferencaMeses(inicioMes, mesAtual);
  const hor = diferencaMeses(mesAtual, fimMes) + 1;
  const [centros, setCentros] = useState([]);
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState('ocioso'); // ocioso | carregando | erro
  const [erro, setErro] = useState('');
  const [telaCheia, setTelaCheia] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [sumario, setSumario] = useState({ aberta: false, aba: 'filtros' });
  const abrirSumario = useCallback((aba = 'filtros') => setSumario({ aberta: true, aba }), []);
  const fecharSumario = useCallback(() => setSumario((s) => ({ ...s, aberta: false })), []);
  const [erroExportacao, setErroExportacao] = useState('');
  const [recarga, setRecarga] = useState(0);
  const [altura, setAltura] = useState(() => Math.max(420, window.innerHeight - 190));
  const pedido = useRef(0);

  // Trocar de empresa limpa os centros.
  useEffect(() => setCentros((c) => (c.length ? [] : c)), [empresaId]);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    const meu = ++pedido.current;
    setEstado('carregando');
    getFluxoCaixaPainel({ empresa_id: empresaId, hist, hor, centros: centros.join(',') || undefined })
      .then((d) => {
        if (meu !== pedido.current) return;
        setDados(d);
        setEstado('ocioso');
        setErro('');
      })
      .catch((e) => {
        if (meu !== pedido.current) return;
        setEstado('erro');
        setErro(e?.response?.data?.error || e?.response?.data?.message || 'Não foi possível carregar os dados do painel.');
      });
  }, [empresaId, hist, hor, centros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!empresaId) setDados(null);
  }, [empresaId]);

  // Recarga automática (só com a aba visível) e altura da grade = a da tela, como antes dos cards.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') {
        carregar();
        setRecarga((r) => r + 1);
      }
    }, MIN_RECARGA * 60000);
    return () => clearInterval(t);
  }, [carregar]);
  useEffect(() => {
    const medir = () => setAltura(Math.max(420, window.innerHeight - 190));
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  const ids = centros.length ? centros : null;
  const D = useMemo(() => {
    try {
      return modelo(dados, ids);
    } catch (e) {
      console.error(e);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados]);

  // Período da grade: do 1º mês do histórico ao último do horizonte (o mês atual conta no horizonte).
  const m0 = mesAtual;
  const inicio = `${addM(m0, -hist)}-01`;
  const fim = ultimoDia(addM(m0, hor - 1));

  // Exportar Excel: o mesmo .xlsx da aba DFC do DFC Construtoras, com o período e os centros do painel.
  useEffect(() => setErroExportacao(''), [empresaId, hist, hor, centros]);
  async function exportarExcel() {
    setErroExportacao('');
    setExportando(true);
    try {
      const { blob, nome } = await exportarExcelDfc(empresaId, { inicio: inicio.slice(0, 7), fim: fim.slice(0, 7), centros });
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
        // mantém a mensagem padrão
      }
      setErroExportacao(mensagem);
    } finally {
      setExportando(false);
    }
  }

  const todosCentros = useMemo(() => dados?.centros || [], [dados]);
  const opcoesCentros = useMemo(
    () =>
      todosCentros
        .filter((c) => c.projeta_dfc)
        .map((c) => ({ value: c.id, label: titulo(c.nome) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [todosCentros]
  );
  const centrosDaEmpresa = (companyId) => todosCentros.filter((c) => String(c.company_id) === String(companyId) && c.projeta_dfc).map((c) => c.id);
  const mesmo = (a, b) => a.length === b.length && a.every((v) => b.includes(v));
  const empresaSel = useMemo(() => {
    if (!centros.length) return null;
    const cos = [...new Set(todosCentros.filter((c) => centros.includes(c.id)).map((c) => c.company_id))];
    return cos.length === 1 && mesmo(centrosDaEmpresa(cos[0]), centros) ? cos[0] : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centros, todosCentros]);

  const selecionarEmpresa = (companyId) => {
    const lista = centrosDaEmpresa(companyId);
    setCentros(String(empresaSel) === String(companyId) || !lista.length ? [] : lista);
  };
  const selecionarCentro = (id) => setCentros(centros.length === 1 && centros[0] === id ? [] : [id]);

  // Rótulo do escopo (título da trajetória).
  const escopo = !centros.length
    ? null
    : empresaSel !== null
      ? curto(todosCentros.find((c) => c.company_id === empresaSel)?.company_name)
      : centros.length === 1
        ? titulo(todosCentros.find((c) => c.id === centros[0])?.nome || `centro ${centros[0]}`)
        : `${centros.length} centros`;

  return (
    <DicaProvider>
      <SumarioCtx.Provider value={abrirSumario}>
      <div className="painel-cfo">
        <CabecalhoDashboard dashboard={dashboard} titulo={tituloTela} marca={marcaEmpresa} />

        <section className="controls" aria-label="Controles do painel">
          <div className="ctl">
            <label htmlFor="f-empresa">Empresa</label>
            <select id="f-empresa" value={empresaId} onChange={(e) => onEmpresa(e.target.value)} disabled={carregandoEmpresas || empresaTravada}>
              {!empresaId && <option value="">{carregandoEmpresas ? 'Carregando…' : 'Selecione a empresa'}</option>}
              {opcoesEmpresas.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          <CampoMes
            id="f-inicio"
            rotulo="Início"
            valor={inicioMes}
            min={addM(mesAtual, -LIMITE_MESES)}
            max={mesAtual}
            onChange={setInicioMes}
            dica="Primeiro mês do período — até o mês atual (o painel é a foto de hoje)"
          />
          <CampoMes
            id="f-fim"
            rotulo="Fim"
            valor={fimMes}
            min={mesAtual}
            max={addM(mesAtual, LIMITE_MESES - 1)}
            onChange={setFimMes}
            dica="Último mês do período — a partir do mês atual"
          />
          <FiltroCentros opcoes={opcoesCentros} valor={centros} onChange={setCentros} disabled={!empresaId || !dados} />
          <div className="acoes">
            {erroExportacao && <span className="erro">{erroExportacao}</span>}
            <button type="button" className="btn ghost icone com-texto" onClick={() => abrirSumario()} title="Sumário das análises">
              <BookOpen size={16} />
              Sumário
            </button>
            <button
              type="button"
              className="btn ghost icone"
              onClick={exportarExcel}
              disabled={!empresaId || exportando}
              title="Exportar Excel"
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
        ) : !D ? (
          estado === 'erro' ? (
            <div className="sec-err">
              <b>Não foi possível montar o painel</b>
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
          <Tiles D={D} />
        )}

        {empresaId && (
          <section className="panel grade-dfc" aria-labelledby="h-grade">
            <div className="grade-barra">
              <h2 id="h-grade">
                Detalhamento do fluxo de caixa
                <AjudaSecao aba="detalhamento" rotulo="Detalhamento do fluxo de caixa" />
              </h2>
              <button type="button" className="btn ghost icone" onClick={() => setTelaCheia(true)} title="Tela cheia" aria-label="Tela cheia">
                <Maximize2 size={16} />
              </button>
            </div>
            <DfcFluxoTab
              variante="dashboard"
              empresaId={empresaId}
              inicio={inicio}
              fim={fim}
              centros={centros}
              alturaFixa={telaCheia ? null : altura}
              refreshToken={recarga}
              telaCheia={telaCheia}
              onSairTelaCheia={() => setTelaCheia(false)}
            />
          </section>
        )}

        {D && (
          <>
            <Hero D={D} escopo={escopo} />
            <div className="grid">
              <EntradasSaidas D={D} />
              <FolegoSpe D={D} empresaSel={empresaSel} onEmpresa={selecionarEmpresa} />
              <QuemGera D={D} centroSel={centros.length === 1 ? centros[0] : null} onCentro={selecionarCentro} />
              <Carteira D={D} />
              <Calibracao D={D} />
              <MaioresSaidas D={D} forn={dados.forn} />
              <DividaPj D={D} />
            </div>
          </>
        )}
        <SumarioModal aberta={sumario.aberta} aba={sumario.aba} onAba={(aba) => setSumario({ aberta: true, aba })} onFechar={fecharSumario} />
      </div>
      </SumarioCtx.Provider>
    </DicaProvider>
  );
}
