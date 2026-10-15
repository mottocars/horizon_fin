import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { getFluxoCaixaPainel } from '../../../../api/dashboards.api';
import DfcFluxoTab from '../../../Operacoes/DfcConstrutoras/DfcFluxoTab';
import CabecalhoDashboard from '../../CabecalhoDashboard';
import { DicaProvider } from './graficos';
import { addM, curto, lbl, modelo, titulo } from './modelo';
import { Calibracao, Carteira, DividaPj, EntradasSaidas, FolegoSpe, Hero, MaioresSaidas, QuemGera, Tiles } from './secoes';
import './painel.css';

// Dashboard Econômico Financeiro › Fluxo de Caixa, no layout do painel do CFO
// (C:\Users\motta\Desktop\layout\Especificação do Painel do CFO — Tostes e Diniz.md):
// barra de controles (Empresa no lugar do Escopo, Histórico, Horizonte e Centro de custo), os 8
// indicadores, a grade do DFC (DfcFluxoTab) na altura da tela e, embaixo, os gráficos da especificação.
// Histórico: meses antes do mês atual (padrão 1). Horizonte: meses a partir do mês atual, contando
// ele (padrão 6). Os dados vêm de /dashboards/economico-financeiro/fluxo-caixa e o painel recarrega
// sozinho a cada 30 minutos. A grade tem o botão de tela cheia (a mesma do DFC Construtoras).

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

// Opções fixas + campo para digitar quantos meses (o digitado fica marcado quando é o valor em uso).
function SegMeses({ rotulo, opcoes, valor, onChange, digitarPrimeiro }) {
  const fixo = opcoes.includes(valor);
  const [texto, setTexto] = useState(fixo ? '' : String(valor));
  useEffect(() => setTexto(opcoes.includes(valor) ? '' : String(valor)), [valor, opcoes]);
  const aplicar = () => {
    const n = Math.round(Number(texto));
    if (Number.isFinite(n) && n >= 1 && n <= LIMITE_MESES) onChange(n);
    else setTexto(fixo ? '' : String(valor));
  };
  const digitar = (
    <label key="digitar" className={`digitar${fixo ? '' : ' ativo'}`} title={`Digite quantos meses (de 1 a ${LIMITE_MESES})`}>
      <input
        inputMode="numeric"
        aria-label={`${rotulo}: digitar quantos meses`}
        value={texto}
        onChange={(e) => setTexto(e.target.value.replace(/\D/g, '').slice(0, 2))}
        onBlur={() => texto && aplicar()}
        onKeyDown={(e) => e.key === 'Enter' && aplicar()}
      />
    </label>
  );
  const botoes = opcoes.map((o) => (
    <button key={o} type="button" aria-pressed={valor === o} onClick={() => onChange(o)}>
      {o}m
    </button>
  ));
  return (
    <div className="ctl">
      <span className="rot">{rotulo}</span>
      <div className="seg" role="group" aria-label={rotulo}>
        {digitarPrimeiro ? [digitar, ...botoes] : [...botoes, digitar]}
      </div>
    </div>
  );
}

// Centro de custo: lista com marcação múltipla e busca, no visual da barra.
function FiltroCentros({ opcoes, valor, onChange, disabled }) {
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
  const lista = opcoes.filter((o) => !q || o.label.toLowerCase().includes(q));
  const resumo = !valor.length ? 'Todos os centros' : valor.length === 1 ? opcoes.find((o) => o.value === valor[0])?.label || '1 centro' : `${valor.length} centros`;
  const alternar = (id) => onChange(valor.includes(id) ? valor.filter((v) => v !== id) : [...valor, id]);
  return (
    <div className="ctl multi" ref={ref}>
      <span className="rot">Centro de custo</span>
      <button type="button" className="multi-btn" disabled={disabled} aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
        <span>{resumo}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {aberto && (
        <div className="multi-pop" role="listbox" aria-multiselectable="true">
          <input type="search" placeholder="Buscar centro" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
          <div className="multi-lista">
            {lista.map((o) => (
              <label key={o.value} className="multi-item">
                <input type="checkbox" checked={valor.includes(o.value)} onChange={() => alternar(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
            {!lista.length && <div className="empty">Nenhum centro encontrado.</div>}
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

export default function FluxoCaixaPainel({ dashboard, tituloTela, empresaId, onEmpresa, opcoesEmpresas, empresaTravada, carregandoEmpresas }) {
  const [hist, setHist] = useState(1);
  const [hor, setHor] = useState(6);
  const [centros, setCentros] = useState([]);
  const [dados, setDados] = useState(null);
  const [estado, setEstado] = useState('ocioso'); // ocioso | carregando | erro
  const [erro, setErro] = useState('');
  const [telaCheia, setTelaCheia] = useState(false);
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
  const m0 = mesHoje();
  const inicio = `${addM(m0, -hist)}-01`;
  const fim = ultimoDia(addM(m0, hor - 1));

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

  // Rótulo do escopo (título da trajetória e etiqueta do cabeçalho).
  const escopo = !centros.length
    ? null
    : empresaSel !== null
      ? curto(todosCentros.find((c) => c.company_id === empresaSel)?.company_name)
      : centros.length === 1
        ? titulo(todosCentros.find((c) => c.id === centros[0])?.nome || `centro ${centros[0]}`)
        : `${centros.length} centros`;

  const info = dados?.info || {};
  const etiquetas = dados
    ? [
        ...(info.extratoAte ? [{ rotulo: 'Extrato até', valor: info.extratoAte.split('-').reverse().join('/') }] : []),
        ...(info.versao ? [{ rotulo: 'Orçamento', valor: `v${info.versao.numero} · ${new Date(info.versao.criado_em).toLocaleDateString('pt-BR')}` }] : []),
        { rotulo: 'Mês atual', valor: lbl(dados.m0) },
        { rotulo: 'Escopo', valor: escopo || 'Consolidado' },
      ]
    : [];

  return (
    <DicaProvider>
      <div className="painel-cfo">
        <CabecalhoDashboard dashboard={dashboard} titulo={tituloTela} etiquetas={etiquetas} />

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
          <SegMeses rotulo="Histórico" opcoes={[6, 1]} valor={hist} onChange={setHist} digitarPrimeiro />
          <SegMeses rotulo="Horizonte" opcoes={[6, 9]} valor={hor} onChange={setHor} />
          <FiltroCentros opcoes={opcoesCentros} valor={centros} onChange={setCentros} disabled={!empresaId || !dados} />
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
              <h2 id="h-grade">Detalhamento do fluxo de caixa</h2>
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
      </div>
    </DicaProvider>
  );
}
