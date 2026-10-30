import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Loader2, Lock, TriangleAlert } from 'lucide-react';
import FiltroColuna from '../../../components/FiltroColuna';
import { listarFiltrosExercicioDre, listarLancamentosExercicioDre } from '../../../api/dreFinanceiro.api';

const POR_PAGINA = 100;

const ORIGENS = {
  R: { rotulo: 'A receber', classe: 'bg-emerald-50 text-emerald-700' },
  P: { rotulo: 'A pagar', classe: 'bg-red-50 text-red-600' },
  E: { rotulo: 'Extrato', classe: 'bg-gray-100 text-gray-600' },
};
const OPCOES_ORIGEM = [
  { value: 'R', label: 'Contas a receber' },
  { value: 'P', label: 'Contas a pagar' },
  { value: 'E', label: 'Extrato sem título' },
];

const SITUACOES = {
  ABERTO: { rotulo: 'Em aberto', classe: 'text-amber-600' },
  BAIXADO: { rotulo: 'Baixado', classe: 'text-gray-500' },
  REALIZADO: { rotulo: 'Realizado', classe: 'text-gray-500' },
};

function moeda(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataBr(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

// Opções do filtro de coluna a partir de [{ valor, nome, n }] — valor '' = lançamentos sem o campo.
function opcoes(lista, rotulo, vazio) {
  return (lista || []).map((o) => ({ value: o.valor, label: o.valor === '' ? vazio : rotulo(o) }));
}

// Filtro com nada marcado vale como sem filtro (mesma regra do Plano Contas).
const efetivo = (f) => (f && f.length ? f : []);

function Total({ titulo, valor, detalhe, destaque = false }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${destaque ? 'border-primary-100 bg-primary-50' : 'border-gray-200/80 bg-white'}`}>
      <p className="text-[11px] text-gray-500">{titulo}</p>
      <p className={`mt-0.5 text-base font-semibold tabular-nums ${valor < 0 ? 'text-red-600' : 'text-gray-900'}`}>{moeda(valor)}</p>
      {detalhe && <p className="mt-0.5 text-[11px] tabular-nums text-gray-400">{detalhe}</p>}
    </div>
  );
}

// Operações > DRE Gerencial > Financeiro > um exercício: todos os lançamentos financeiros do ano —
// contas a receber, contas a pagar (pelo vencimento) e o extrato das contas sem título (pela data do
// lançamento) —, uma linha por parcela × centro de custo × natureza (regras em
// dre-financeiro/financeiro.service.js). Paginado e filtrado no backend (um ano da GENESIS passa de
// dezenas de milhares de linhas): filtros de coluna Origem, Documento, Natureza e Centro de custo,
// busca no topo da página; os totais são de tudo o que passa nos filtros, não só da página.
// Só visualização (o exercício do ano atual, travado, ganha o selo).
export default function LancamentosExercicio({ empresaId, ano, search = '', onVoltar }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [opcoesFiltro, setOpcoesFiltro] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState(search.trim());
  // Filtros de coluna (FiltroColuna): null = sem filtro.
  const [fOrigem, setFOrigem] = useState(null);
  const [fDocumento, setFDocumento] = useState(null);
  const [fNatureza, setFNatureza] = useState(null);
  const [fCentro, setFCentro] = useState(null);
  const refOrigem = useRef(null);
  const refDocumento = useRef(null);
  const refNatureza = useRef(null);
  const refCentro = useRef(null);
  const pedido = useRef(0);

  // Busca com espera curta (não consulta a cada tecla).
  useEffect(() => {
    const t = setTimeout(() => setBusca(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setFOrigem(null);
    setFDocumento(null);
    setFNatureza(null);
    setFCentro(null);
    setOpcoesFiltro(null);
    listarFiltrosExercicioDre(empresaId, ano)
      .then(setOpcoesFiltro)
      .catch(() => setOpcoesFiltro({ documentos: [], centros: [], naturezas: [] }));
  }, [empresaId, ano]);

  // Filtro ou busca novos voltam pra primeira página.
  useEffect(() => setPagina(1), [empresaId, ano, busca, fOrigem, fDocumento, fNatureza, fCentro]);

  useEffect(() => {
    const meu = ++pedido.current;
    setCarregando(true);
    setErro('');
    listarLancamentosExercicioDre(empresaId, ano, {
      origens: efetivo(fOrigem),
      documentos: efetivo(fDocumento),
      naturezas: efetivo(fNatureza),
      centros: efetivo(fCentro),
      busca,
      pagina,
      porPagina: POR_PAGINA,
    })
      .then((d) => meu === pedido.current && setDados(d))
      .catch((e) => meu === pedido.current && setErro(e.response?.data?.message || 'Não foi possível carregar os lançamentos.'))
      .finally(() => meu === pedido.current && setCarregando(false));
  }, [empresaId, ano, busca, fOrigem, fDocumento, fNatureza, fCentro, pagina]);

  const nomeDocumento = useMemo(
    () => new Map((opcoesFiltro?.documentos || []).filter((d) => d.nome).map((d) => [d.valor, d.nome])),
    [opcoesFiltro]
  );
  const opDocumento = useMemo(
    () => opcoes(opcoesFiltro?.documentos, (o) => (o.nome ? `${o.valor} — ${o.nome}` : o.valor), 'SEM DOCUMENTO'),
    [opcoesFiltro]
  );
  const opNatureza = useMemo(
    () => opcoes(opcoesFiltro?.naturezas, (o) => `${o.valor} ${o.nome || ''}`.trim(), 'SEM NATUREZA'),
    [opcoesFiltro]
  );
  const opCentro = useMemo(
    () => opcoes(opcoesFiltro?.centros, (o) => `${o.valor} - ${o.nome || ''}`, 'SEM CENTRO DE CUSTO'),
    [opcoesFiltro]
  );

  const filtrosAtivos = [fOrigem, fDocumento, fNatureza, fCentro].some((f) => f && f.length);
  const t = dados?.totais;
  const de = dados && dados.total ? (dados.pagina - 1) * dados.por_pagina + 1 : 0;
  const ate = dados ? Math.min(dados.pagina * dados.por_pagina, dados.total) : 0;
  const ultimaPagina = dados ? Math.max(1, Math.ceil(dados.total / dados.por_pagina)) : 1;
  const th = 'px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-blue-700';
  const td = 'px-3 py-1.5 text-xs';

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
        <span className="ml-auto text-xs text-gray-400">Títulos pelo vencimento · extrato pela data do lançamento</span>
      </div>

      {t && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Total titulo="Contas a receber" valor={t.receber} />
          <Total titulo="Contas a pagar" valor={t.pagar} />
          <Total
            titulo="Extrato sem título"
            valor={t.extrato_entradas + t.extrato_saidas}
            detalhe={`entradas ${moeda(t.extrato_entradas)} · saídas ${moeda(t.extrato_saidas)}`}
          />
          <Total titulo="Resultado" valor={t.resultado} detalhe={filtrosAtivos || busca ? 'dos lançamentos filtrados' : null} destaque />
        </div>
      )}

      {erro ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          <TriangleAlert size={15} className="shrink-0" />
          {erro}
        </div>
      ) : (
        <div className={carregando && dados ? 'opacity-60 transition-opacity' : ''}>
          <table className="w-full min-w-[1250px] table-fixed border-collapse">
            <colgroup>
              <col style={{ width: 110 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 92 }} />
              <col />
              <col style={{ width: 240 }} />
              <col style={{ width: 190 }} />
              <col style={{ width: 88 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead className="sticky -top-6 z-20">
              <tr className="border-b-2 border-blue-500 bg-blue-50">
                <th ref={refOrigem} className={`${th} rounded-tl-lg`}>
                  <span className="flex items-center gap-1.5">
                    Origem
                    <FiltroColuna filtro={fOrigem} onChange={setFOrigem} opcoes={OPCOES_ORIGEM} label="Origem" colunaRef={refOrigem} larguraPainel={240} />
                  </span>
                </th>
                <th className={th}>Data</th>
                <th ref={refDocumento} className={th}>
                  <span className="flex items-center gap-1.5">
                    Documento
                    <FiltroColuna filtro={fDocumento} onChange={setFDocumento} opcoes={opDocumento} label="Documento" colunaRef={refDocumento} larguraPainel={420} />
                  </span>
                </th>
                <th className={th}>Título</th>
                <th className={th}>Cliente / Fornecedor</th>
                <th ref={refNatureza} className={th}>
                  <span className="flex items-center gap-1.5">
                    Natureza
                    <FiltroColuna filtro={fNatureza} onChange={setFNatureza} opcoes={opNatureza} label="Natureza" colunaRef={refNatureza} larguraPainel={460} />
                  </span>
                </th>
                <th ref={refCentro} className={th}>
                  <span className="flex items-center gap-1.5">
                    Centro de custo
                    <FiltroColuna filtro={fCentro} onChange={setFCentro} opcoes={opCentro} label="Centro de custo" colunaRef={refCentro} larguraPainel={380} />
                  </span>
                </th>
                <th className={th}>Situação</th>
                <th className={`${th} rounded-tr-lg text-right`}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {!dados && carregando ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-gray-400">
                    Carregando...
                  </td>
                </tr>
              ) : dados.linhas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                    Nenhum lançamento encontrado{filtrosAtivos || busca ? ' para essa busca/filtro.' : ' neste exercício.'}
                    {filtrosAtivos && (
                      <button
                        type="button"
                        onClick={() => {
                          setFOrigem(null);
                          setFDocumento(null);
                          setFNatureza(null);
                          setFCentro(null);
                        }}
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
                  const situacao = SITUACOES[l.situacao] || { rotulo: l.situacao, classe: 'text-gray-500' };
                  const docNome = nomeDocumento.get(l.documento || '') || l.documento_nome || '';
                  return (
                    <tr key={`${(dados.pagina - 1) * dados.por_pagina + i}`} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className={td}>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${origem.classe}`}>{origem.rotulo}</span>
                      </td>
                      <td className={`${td} tabular-nums text-gray-700`} title={l.emissao ? `Emissão ${dataBr(l.emissao)}` : 'Data do lançamento no extrato'}>
                        {dataBr(l.data)}
                      </td>
                      <td className={`${td} truncate text-gray-700`} title={[docNome, l.numero].filter(Boolean).join(' · ')}>
                        <span className="font-medium">{l.documento || '—'}</span>
                        {l.numero && <span className="text-gray-400"> {l.numero}</span>}
                      </td>
                      <td className={`${td} tabular-nums text-gray-500`}>{l.titulo ? `${l.titulo}${l.parcela ? ` / ${l.parcela}` : ''}` : ''}</td>
                      <td
                        className={`${td} truncate ${l.origem === 'E' ? 'italic text-gray-500' : 'text-gray-800'}`}
                        title={l.contraparte || ''}
                      >
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
                      <td className={`${td} ${situacao.classe}`}>{situacao.rotulo}</td>
                      <td className={`${td} text-right tabular-nums font-medium ${l.valor < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {moeda(l.valor)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {dados && dados.total > 0 && (
            <div className="mt-3 flex items-center justify-end gap-3 text-xs text-gray-500">
              {carregando && <Loader2 size={14} className="animate-spin text-gray-400" />}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
