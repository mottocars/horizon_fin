import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, ListChecks, ListFilter, Loader2, Lock, TriangleAlert } from 'lucide-react';
import FiltroColuna from '../../../components/FiltroColuna';
import { listarFiltrosExercicioDre, listarLancamentosExercicioDre } from '../../../api/dreFinanceiro.api';
import LancamentoAjusteModal from './LancamentoAjusteModal';

const POR_PAGINA = 100;
// "Mostrar todos": busca em blocos (a barra de carregamento anda a cada um).
const BLOCO_TODOS = 2000;

const ORIGENS = {
  P: { rotulo: 'A pagar', classe: 'bg-red-50 text-red-600' },
  R: { rotulo: 'A receber', classe: 'bg-emerald-50 text-emerald-700' },
  E: { rotulo: 'Movimento', classe: 'bg-gray-100 text-gray-600' },
};
const OPCOES_ORIGEM = [
  { value: 'P', label: 'A pagar' },
  { value: 'R', label: 'A receber' },
  { value: 'E', label: 'Movimento (extrato sem título)' },
];

function moeda(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataBr(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Opções do filtro a partir de [{ valor, nome, n }] — valor '' = lançamentos sem o campo.
function opcoes(lista, rotulo, vazio) {
  return (lista || []).map((o) => ({ value: o.valor, label: o.valor === '' ? vazio : rotulo(o) }));
}

// Filtros de coluna (FiltroColuna): null = sem filtro; lista vazia (nada marcado) também vale como
// sem filtro (mesma regra do Plano Contas).
const SEM_FILTROS = { origens: null, meses: null, documentos: null, titulos: null, contrapartes: null, naturezas: null, centros: null, status: null };

// Status da linha: Original (como veio do Sienge) ou Ajustado (a linha tem ajuste — lancamentos_ajustes;
// centro, natureza e/ou valor trocados sem mexer no Sienge).
const STATUS = {
  ORIGINAL: { rotulo: 'Original', classe: 'bg-gray-100 text-gray-600' },
  AJUSTADO: { rotulo: 'Ajustado', classe: 'bg-violet-50 text-violet-700' },
};
const OPCOES_STATUS = [
  { value: 'ORIGINAL', label: 'Original' },
  { value: 'AJUSTADO', label: 'Ajustado' },
];
const efetivo = (f) => (f && f.length ? f : []);

// Filtro da coluna Título: em vez de lista (milhares de títulos por ano), um campo pra digitar um ou
// mais números (separados por vírgula ou espaço). Mesmo ícone do FiltroColuna; Enter aplica.
function FiltroTitulo({ valor, onChange }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const caixa = useRef(null);
  const ativo = Boolean(valor && valor.length);

  useEffect(() => {
    if (!aberto) return undefined;
    setTexto((valor || []).join(', '));
    const fora = (e) => caixa.current && !caixa.current.contains(e.target) && setAberto(false);
    const esc = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  function aplicar(e) {
    e.preventDefault();
    const numeros = [...new Set(texto.split(/[\s,;]+/).map((t) => t.replace(/\D/g, '')).filter(Boolean))];
    onChange(numeros.length ? numeros : null);
    setAberto(false);
  }

  return (
    <span ref={caixa} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        title="Filtrar por Título"
        aria-pressed={ativo}
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition ${
          ativo ? 'bg-white text-primary-700 shadow-sm' : 'text-primary-400 hover:bg-white/60 hover:text-primary-700'
        }`}
      >
        <ListFilter size={13} />
      </button>
      {aberto && (
        <form
          onSubmit={aplicar}
          className="absolute left-0 top-7 z-30 w-72 rounded-lg border border-gray-200 bg-white p-3 text-left normal-case tracking-normal shadow-lg"
        >
          <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="filtro-titulo">
            Número do título
          </label>
          <input
            id="filtro-titulo"
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: 11251, 12610"
            className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm font-normal text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <p className="mt-1 text-[11px] font-normal text-gray-400">Vários números separados por vírgula ou espaço.</p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setAberto(false);
              }}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
            >
              Limpar
            </button>
            <button type="submit" className="rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-700">
              Filtrar
            </button>
          </div>
        </form>
      )}
    </span>
  );
}

// Operações > DRE Gerencial > Financeiro > um exercício: todos os lançamentos financeiros do ano — a
// pagar, a receber (pela emissão) e o movimento das contas sem título (extrato, pela data). Uma linha
// por título, com as parcelas somadas; título rateado, uma por centro × natureza, com o % do rateio
// (regras em dre-financeiro/financeiro.service.js). Clicar em qualquer lugar da linha — título ou
// movimento — abre a janela daquela linha de rateio (LancamentoAjusteModal), onde se ajusta centro,
// natureza e valor sem mexer no Sienge; a coluna Status mostra Original ou Ajustado. Filtros no cabeçalho da tabela (Origem, Data — mês de emissão —, Documento, Título —
// números digitados —, Cliente/Fornecedor, Natureza, Centro de custo e Status) e a busca do topo da
// página, tudo aplicado no backend. Paginado (um ano da GENESIS passa de dezenas de milhares de
// linhas); no rodapé, "Mostrar todos" busca o resto em blocos, com barra de carregamento. O exercício
// do ano atual (travado) ganha o selo e a janela do título abre só pra consulta.
export default function LancamentosExercicio({ empresaId, ano, search = '', onVoltar }) {
  const [opcoesFiltro, setOpcoesFiltro] = useState(null);
  const [filtros, setFiltros] = useState(SEM_FILTROS);
  const [busca, setBusca] = useState(search.trim());
  const [pagina, setPagina] = useState(1);
  // 'pagina' = uma página por vez; 'todos' = tudo o que passa nos filtros.
  const [modo, setModo] = useState('pagina');
  const [dados, setDados] = useState(null); // { travado, total, linhas, pagina, por_pagina }
  const [progresso, setProgresso] = useState(null); // { carregadas, total } durante o "mostrar todos"
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  // Linha aberta na janela ({ origem, chave, centro, natureza } — centro/natureza originais) e recarga
  // depois de ajustar.
  const [tituloAberto, setTituloAberto] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const pedido = useRef(null);

  // Busca com espera curta (não consulta a cada tecla).
  useEffect(() => {
    const t = setTimeout(() => setBusca(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setFiltros(SEM_FILTROS);
    setModo('pagina');
    setOpcoesFiltro(null);
    listarFiltrosExercicioDre(empresaId, ano)
      .then(setOpcoesFiltro)
      .catch(() => setOpcoesFiltro({ meses: [], documentos: [], contrapartes: [], naturezas: [], centros: [] }));
  }, [empresaId, ano]);

  // Filtro ou busca novos voltam pra primeira página (o "mostrar todos" continua valendo).
  useEffect(() => setPagina(1), [empresaId, ano, busca, filtros]);

  useEffect(() => {
    pedido.current?.abort();
    const controle = new AbortController();
    pedido.current = controle;
    const consulta = Object.fromEntries(Object.entries(filtros).map(([k, v]) => [k, efetivo(v)]));
    consulta.busca = busca;
    setCarregando(true);
    setErro('');
    setProgresso(null);

    async function carregar() {
      if (modo === 'pagina') {
        const d = await listarLancamentosExercicioDre(empresaId, ano, { ...consulta, pagina, porPagina: POR_PAGINA }, { signal: controle.signal });
        setDados(d);
        return;
      }
      // Todos: blocos seguidos; a tabela só troca no fim (a barra mostra o andamento).
      const primeiro = await listarLancamentosExercicioDre(empresaId, ano, { ...consulta, pagina: 1, porPagina: BLOCO_TODOS }, { signal: controle.signal });
      const linhas = [...primeiro.linhas];
      setProgresso({ carregadas: linhas.length, total: primeiro.total });
      const blocos = Math.ceil(primeiro.total / BLOCO_TODOS);
      for (let b = 2; b <= blocos; b += 1) {
        const d = await listarLancamentosExercicioDre(empresaId, ano, { ...consulta, pagina: b, porPagina: BLOCO_TODOS }, { signal: controle.signal });
        linhas.push(...d.linhas);
        setProgresso({ carregadas: linhas.length, total: primeiro.total });
      }
      setDados({ ...primeiro, linhas, pagina: 1, por_pagina: Math.max(linhas.length, 1) });
    }

    carregar()
      .then(() => !controle.signal.aborted && setCarregando(false))
      .catch((e) => {
        if (controle.signal.aborted || e.code === 'ERR_CANCELED') return;
        setErro(e.response?.data?.message || 'Não foi possível carregar os lançamentos.');
        setCarregando(false);
      })
      .finally(() => !controle.signal.aborted && setProgresso(null));
    return () => controle.abort();
  }, [empresaId, ano, busca, filtros, pagina, modo, recarga]);

  const opDocumento = useMemo(
    () => opcoes(opcoesFiltro?.documentos, (o) => (o.nome ? `${o.valor} — ${o.nome}` : o.valor), 'SEM DOCUMENTO'),
    [opcoesFiltro]
  );
  const nomeDocumento = useMemo(
    () => new Map((opcoesFiltro?.documentos || []).filter((d) => d.nome).map((d) => [d.valor, d.nome])),
    [opcoesFiltro]
  );
  const opContraparte = useMemo(() => opcoes(opcoesFiltro?.contrapartes, (o) => o.valor, ''), [opcoesFiltro]);
  const opMes = useMemo(
    () => opcoes(opcoesFiltro?.meses, (o) => `${MESES[Number(o.valor.slice(5, 7)) - 1]}/${o.valor.slice(0, 4)}`, ''),
    [opcoesFiltro]
  );
  const opNatureza = useMemo(
    () => opcoes(opcoesFiltro?.naturezas, (o) => `${o.valor} ${o.nome || ''}`.trim(), 'SEM NATUREZA'),
    [opcoesFiltro]
  );
  const refs = {
    origens: useRef(null),
    meses: useRef(null),
    documentos: useRef(null),
    contrapartes: useRef(null),
    naturezas: useRef(null),
    centros: useRef(null),
  };
  const opCentro = useMemo(
    () => opcoes(opcoesFiltro?.centros, (o) => `${o.valor} - ${o.nome || ''}`, 'SEM CENTRO DE CUSTO'),
    [opcoesFiltro]
  );

  const mudar = (campo) => (valor) => setFiltros((f) => ({ ...f, [campo]: valor }));
  const filtrosAtivos = Object.values(filtros).some((v) => v && v.length);
  const todos = modo === 'todos';
  const de = dados && dados.total ? (dados.pagina - 1) * POR_PAGINA + 1 : 0;
  const ate = dados ? Math.min(dados.pagina * POR_PAGINA, dados.total) : 0;
  const ultimaPagina = dados ? Math.max(1, Math.ceil(dados.total / POR_PAGINA)) : 1;
  const pct = progresso && progresso.total ? Math.round((progresso.carregadas / progresso.total) * 100) : 0;
  const th = 'px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-blue-700';
  const td = 'px-3 py-1.5 text-xs';
  // Cabeçalho com o filtro de coluna da tela de Plano Contas (ícone ao lado do nome).
  const cab = (campo, titulo, opts, larguraPainel, extra = '') => (
    <th ref={refs[campo]} className={`${th} ${extra}`}>
      <span className="flex items-center gap-1.5">
        {titulo}
        <FiltroColuna
          filtro={filtros[campo]}
          onChange={mudar(campo)}
          opcoes={opts}
          label={titulo}
          colunaRef={refs[campo]}
          larguraPainel={larguraPainel}
        />
      </span>
    </th>
  );

  return (
    <div className="min-w-fit rounded-card rounded-tl-none bg-white p-5 shadow-card">
      <div className="-mt-1 mb-4 flex items-center gap-3 border-b border-gray-100 pb-3">
        <button
          type="button"
          onClick={onVoltar}
          className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-800"
        >
          <ArrowLeft size={16} />
          Exercícios
        </button>
        <span className="text-gray-300">/</span>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <CalendarDays size={15} className="text-primary-600" />
          {ano}
        </span>
        {dados?.travado && (
          <span
            className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"
            title="Exercício em andamento: só pode ser visualizado, não pode ser alterado"
          >
            <Lock size={11} /> Somente visualização
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">Títulos pela data de emissão · movimento pela data do extrato</span>
        {filtrosAtivos && (
          <button
            type="button"
            onClick={() => setFiltros(SEM_FILTROS)}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {erro ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          <TriangleAlert size={15} className="shrink-0" />
          {erro}
        </div>
      ) : (
        <div>
          <table className={`w-full min-w-[1360px] table-fixed border-collapse ${carregando && dados ? 'opacity-60 transition-opacity' : ''}`}>
            <colgroup>
              <col style={{ width: 110 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 92 }} />
              <col />
              <col style={{ width: 250 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 88 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <thead className="sticky -top-6 z-20">
              <tr className="border-b-2 border-blue-500 bg-blue-50">
                {cab('origens', 'Origem', OPCOES_ORIGEM, 260, 'rounded-tl-lg')}
                {cab('meses', 'Data', opMes, 220)}
                {cab('documentos', 'Documento', opDocumento, 420)}
                <th className={th}>
                  <span className="flex items-center gap-1.5">
                    Título
                    <FiltroTitulo valor={filtros.titulos} onChange={mudar('titulos')} />
                  </span>
                </th>
                {cab('contrapartes', 'Cliente / Fornecedor', opContraparte, 420)}
                {cab('naturezas', 'Natureza', opNatureza, 460)}
                {cab('centros', 'Centro de custo', opCentro, 380)}
                <th className={`${th} text-right`}>% Rateio</th>
                <th className={`${th} text-right`}>Valor</th>
                {cab('status', 'Status', OPCOES_STATUS, 200, 'rounded-tr-lg')}
              </tr>
            </thead>
            <tbody>
              {!dados ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-sm text-gray-400">
                    Carregando...
                  </td>
                </tr>
              ) : dados.linhas.length === 0 ? (
                <tr>
                  <td colSpan={10} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                    Nenhum lançamento encontrado{filtrosAtivos || busca ? ' para essa busca/filtro.' : ' neste exercício.'}
                    {filtrosAtivos && (
                      <button
                        type="button"
                        onClick={() => setFiltros(SEM_FILTROS)}
                        className="ml-2 font-medium text-primary-600 hover:text-primary-700"
                      >
                        Limpar filtros
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                dados.linhas.map((l, i) => {
                  const origem = ORIGENS[l.origem];
                  const docNome = nomeDocumento.get(l.documento || '') || l.documento_nome || '';
                  return (
                    <tr
                      key={i}
                      onClick={() => setTituloAberto({ origem: l.origem, chave: l.chave, centro: l.centro_original, natureza: l.natureza_original })}
                      title="Abrir para ver ou ajustar esta linha"
                      className={`cursor-pointer border-b border-gray-100 hover:bg-primary-50/50 ${l.status === 'AJUSTADO' ? 'bg-violet-50/30' : ''}`}
                    >
                      <td className={td}>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${origem.classe}`}>{origem.rotulo}</span>
                      </td>
                      <td
                        className={`${td} tabular-nums text-gray-700`}
                        title={
                          l.origem === 'E'
                            ? 'Data do movimento no extrato'
                            : `Emissão ${dataBr(l.data)} · vencimento ${dataBr(l.vencimento)}${l.vencimento_ate && l.vencimento_ate !== l.vencimento ? ` a ${dataBr(l.vencimento_ate)}` : ''}`
                        }
                      >
                        {dataBr(l.data)}
                      </td>
                      <td className={`${td} truncate text-gray-700`} title={[docNome, l.numero].filter(Boolean).join(' · ')}>
                        <span className="font-medium">{l.documento || '—'}</span>
                        {l.numero && <span className="text-gray-400"> {l.numero}</span>}
                      </td>
                      <td className={`${td} tabular-nums`}>
                        {l.titulo ? <span className="font-medium text-gray-700">{l.titulo}</span> : null}
                        {l.parcelas > 1 && <span className="ml-1 text-[10px] text-gray-400">{l.parcelas}x</span>}
                      </td>
                      <td className={`${td} truncate ${l.origem === 'E' ? 'italic text-gray-500' : 'text-gray-800'}`} title={l.contraparte || ''}>
                        {l.contraparte || (l.origem === 'E' ? l.documento_nome : '—')}
                      </td>
                      <td className={`${td} truncate text-gray-700`} title={`${l.natureza_id || ''} ${l.natureza_nome || ''}`.trim()}>
                        {l.natureza_id ? (
                          <>
                            <span className="tabular-nums text-gray-400">{l.natureza_id}</span> {l.natureza_nome}
                          </>
                        ) : (
                          <span className="text-gray-400">Sem natureza</span>
                        )}
                      </td>
                      <td className={`${td} truncate text-gray-700`} title={l.centro_nome || ''}>
                        {l.centro_id != null ? (
                          <>
                            <span className="tabular-nums text-gray-400">{l.centro_id}</span> {l.centro_nome}
                          </>
                        ) : (
                          <span className="text-gray-400">Sem centro</span>
                        )}
                      </td>
                      <td className={`${td} text-right tabular-nums text-gray-500`}>
                        {l.percentual === null || l.percentual === undefined ? '' : `${Number(l.percentual).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}
                      </td>
                      <td className={`${td} text-right tabular-nums font-medium ${l.valor < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {moeda(l.valor)}
                      </td>
                      <td className={td}>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${(STATUS[l.status] || STATUS.ORIGINAL).classe}`}>
                          {(STATUS[l.status] || STATUS.ORIGINAL).rotulo}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {dados && dados.total > 0 && (
            <div className="mt-3 flex items-center justify-end gap-3 text-xs text-gray-500">
              {carregando && !progresso && <Loader2 size={14} className="animate-spin text-gray-400" />}
              {todos ? (
                <>
                  {progresso ? (
                    // Barra de carregamento do "mostrar todos", no rodapé (onde está o botão).
                    <div className="mr-auto w-full max-w-md" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                      <div className="mb-1 flex justify-between text-[11px] text-gray-500">
                        <span>Carregando todos os lançamentos...</span>
                        <span className="tabular-nums">
                          {progresso.carregadas.toLocaleString('pt-BR')} de {progresso.total.toLocaleString('pt-BR')} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <span className="block h-full bg-primary-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ) : (
                    <span className="tabular-nums">Todos os {dados.total.toLocaleString('pt-BR')} lançamentos</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setModo('pagina')}
                    className="rounded-lg border border-gray-200 px-2.5 py-1.5 font-medium text-gray-600 hover:bg-gray-50"
                  >
                    {progresso ? 'Cancelar' : 'Voltar à paginação'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setModo('todos')}
                    disabled={carregando || dados.total <= POR_PAGINA}
                    className="mr-auto flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ListChecks size={14} />
                    Mostrar todos os lançamentos
                  </button>
                  <span className="tabular-nums">
                    {de.toLocaleString('pt-BR')}–{ate.toLocaleString('pt-BR')} de {dados.total.toLocaleString('pt-BR')} lançamentos
                  </span>
                  <button
                    type="button"
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={dados.pagina <= 1 || carregando}
                    aria-label="Página anterior"
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="tabular-nums">
                    {dados.pagina} / {ultimaPagina}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPagina((p) => Math.min(ultimaPagina, p + 1))}
                    disabled={dados.pagina >= ultimaPagina || carregando}
                    aria-label="Próxima página"
                    className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {tituloAberto && (
        <LancamentoAjusteModal
          empresaId={empresaId}
          origem={tituloAberto.origem}
          chave={tituloAberto.chave}
          linha={{ centro: tituloAberto.centro, natureza: tituloAberto.natureza }}
          onClose={() => setTituloAberto(null)}
          onAlterado={() => setRecarga((n) => n + 1)}
        />
      )}
    </div>
  );
}
