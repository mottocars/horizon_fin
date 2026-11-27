import { Fragment, useCallback, useEffect, useState } from 'react';
import { Check, HandCoins, Minus, Plus, Trash2, X } from 'lucide-react';
import { listCentrosCustoDfc } from '../../../api/dfcCentros.api';
import { listDividaPjCentro, listDividaPjVigentes, removerDividaPj, salvarDividaPj } from '../../../api/dfcDividaPj.api';
import { useConfirm } from '../../../confirm/ConfirmContext';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// '2025-10-01' -> 'out/2025'.
function mesAno(iso) {
  const [ano, mes] = iso.split('-').map(Number);
  return `${MESES[mes - 1]}/${ano}`;
}

const LARGURA_PRIMEIRA = 380;
const LARGURA_VALOR = 200;

// Zero aparece em branco (como na aba Orçamento da DRE) — no banco continua 0.
function formatarValor(valor) {
  const n = Number(valor || 0);
  return n === 0 ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numeroParaEdicao(valor) {
  if (!Number(valor || 0)) return '';
  return Number(valor || 0).toFixed(2).replace('.', ',');
}

// Mesma leitura do valor digitado da aba Orçamento da DRE (OrcamentoTab.jsx::interpretarValor):
// null pra vazio, NaN pra texto inválido, o número (2 casas) nos demais casos.
function interpretarValor(texto) {
  let t = String(texto ?? '').replace(/\s/g, '').replace(/^(-?)R\$/i, '$1');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  const n = Math.round(parseFloat(t) * 100) / 100;
  return Number.isFinite(n) && Math.abs(n) <= 9_999_999_999_999.99 ? n : NaN;
}

// Célula de valor editável — a mesma da aba Orçamento da DRE: mostra o valor formatado, ao focar vira
// texto editável e grava ao sair do campo (Enter grava, Esc desiste).
function CelulaValor({ valor, onCommit }) {
  const [texto, setTexto] = useState(null);
  const editando = texto !== null;

  function commit() {
    if (texto === null) return;
    const digitado = texto;
    setTexto(null);
    const novo = interpretarValor(digitado);
    if (Number.isNaN(novo)) return;
    if ((novo ?? 0) === (valor ?? 0)) return;
    onCommit(novo ?? 0);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={editando ? texto : formatarValor(valor)}
      onFocus={(e) => {
        setTexto(numeroParaEdicao(valor));
        const campo = e.currentTarget;
        setTimeout(() => campo.select(), 0);
      }}
      onChange={(e) => {
        if (/^[-\d.,\sR$]*$/i.test(e.target.value)) setTexto(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          setTexto(null);
          e.currentTarget.blur();
        }
      }}
      className="h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-right text-xs tabular-nums text-gray-900 outline-none transition-colors hover:border-gray-300 hover:bg-white focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-100"
    />
  );
}

// Linha "+ Novo mês": abre o campo do mês ali mesmo; confirmar cria o mês com valor 0, pronto pra editar.
function LinhaNovoMes({ mesesExistentes, onCriar }) {
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!mes) {
      setErro('Escolha o mês.');
      return;
    }
    if (mesesExistentes.has(`${mes}-01`)) {
      setErro('Este mês já está cadastrado.');
      return;
    }
    setErro('');
    setSalvando(true);
    try {
      await onCriar(mes);
      setAberto(false);
      setMes('');
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível incluir o mês.');
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <tr>
        <td colSpan={2} className="border-b border-gray-100 bg-white p-0">
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="flex w-full items-center gap-1.5 py-2 pl-9 pr-3 text-left text-xs font-medium text-primary-600 hover:bg-primary-50"
          >
            <Plus size={13} />
            Novo mês
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={2} className="border-b border-gray-100 bg-primary-50/40 py-2 pl-9 pr-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Mês</label>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            autoFocus
            className="rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <button
            type="button"
            onClick={confirmar}
            disabled={salvando}
            title="Confirmar"
            className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            <Check size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              setErro('');
              setMes('');
            }}
            title="Cancelar"
            className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={13} />
          </button>
          {erro && <span className="text-xs text-red-600">{erro}</span>}
        </div>
      </td>
    </tr>
  );
}

// Aba Dívida PJ (pedido do usuário): o valor da dívida PJ de cada centro de custo, mês a mês — o mesmo
// cadastro da aba Orçamento da DRE Gerencial (OrcamentoTab.jsx), com uma coluna de valor só.
// Nível 1 = 1 linha por centro de custo com "Projeta DFC" (aba Centros Custos), mostrando o valor do mês
// mais recente e, abaixo do nome, "Vigente em mmm/aaaa". Só 1 aberto por vez.
// Nível 2 (aberto) = os meses cadastrados, valor editável, remover no hover e a linha "Novo mês" no fim.
export default function DfcDividaPjTab({ empresaId, search = '' }) {
  const confirm = useConfirm();
  const [centros, setCentros] = useState(null);
  const [vigentes, setVigentes] = useState({});
  const [carregando, setCarregando] = useState(false);
  const [expandidoId, setExpandidoId] = useState(null);
  const [meses, setMeses] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [removendoMes, setRemovendoMes] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    if (!empresaId) {
      setCentros(null);
      setVigentes({});
      return;
    }
    setCarregando(true);
    Promise.all([listCentrosCustoDfc(empresaId), listDividaPjVigentes(empresaId)])
      .then(([lista, vig]) => {
        setCentros(lista.filter((c) => c.projeta_dfc));
        setVigentes(vig);
      })
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setExpandidoId(null);
    setMeses(null);
    carregar();
  }, [carregar]);

  // A lista vem do mais antigo pro mais novo: o último é o vigente.
  function sincronizarVigente(siengeId, lista) {
    setVigentes((atual) => {
      const proximo = { ...atual };
      if (lista.length === 0) delete proximo[siengeId];
      else proximo[siengeId] = lista[lista.length - 1];
      return proximo;
    });
  }

  const carregarDetalhe = useCallback(
    (siengeId) => {
      if (!siengeId) return;
      setCarregandoDetalhe(true);
      listDividaPjCentro(empresaId, siengeId)
        .then((lista) => {
          setMeses(lista);
          sincronizarVigente(siengeId, lista);
        })
        .finally(() => setCarregandoDetalhe(false));
    },
    [empresaId]
  );

  useEffect(() => {
    carregarDetalhe(expandidoId);
  }, [expandidoId, carregarDetalhe]);

  function toggleExpandir(siengeId) {
    setMeses(null);
    setExpandidoId((atual) => (atual === siengeId ? null : siengeId));
  }

  async function gravar(siengeId, mes, valor) {
    setErro('');
    try {
      const lista = await salvarDividaPj(empresaId, siengeId, { mes, valor });
      setMeses(lista);
      sincronizarVigente(siengeId, lista);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível salvar o valor.');
      throw err;
    }
  }

  async function remover(siengeId, mes) {
    const confirmado = await confirm({
      title: 'Remover mês',
      description: `Remover a dívida PJ de ${mesAno(mes)}?`,
      confirmLabel: 'Remover',
      variant: 'warning',
    });
    if (!confirmado) return;
    setRemovendoMes(mes);
    try {
      await removerDividaPj(empresaId, siengeId, mes);
      carregarDetalhe(siengeId);
    } finally {
      setRemovendoMes(null);
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <HandCoins size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver e lançar a dívida PJ de cada centro de custo.
        </p>
      </div>
    );
  }

  const termo = search.trim().toLowerCase();
  const centrosFiltrados = (centros || []).filter(
    (c) => !termo || c.name.toLowerCase().includes(termo) || String(c.sienge_id).includes(termo)
  );
  const semCentros = !carregando && centrosFiltrados.length === 0;
  // Totalizador (pedido do usuário): a soma do que a coluna mostra — o valor vigente (mês mais recente) de cada
  // centro listado, respeitando a busca.
  const comDivida = centrosFiltrados.filter((c) => vigentes[c.sienge_id]);
  const total = comDivida.reduce((s, c) => s + Number(vigentes[c.sienge_id].valor || 0), 0);

  return (
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {erro && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="status">
          {erro}
          <button type="button" onClick={() => setErro('')} title="Fechar" className="shrink-0 hover:text-red-800">
            <X size={14} />
          </button>
        </div>
      )}
      {carregando ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : (
        <table
          className="border-separate border-spacing-0 text-left text-xs"
          style={{ tableLayout: 'fixed', width: LARGURA_PRIMEIRA + LARGURA_VALOR }}
        >
          <colgroup>
            <col style={{ width: LARGURA_PRIMEIRA }} />
            <col style={{ width: LARGURA_VALOR }} />
          </colgroup>
          <thead>
            <tr className="[&>th:first-child]:rounded-tl-lg [&>th:last-child]:rounded-tr-lg">
              <th className="sticky -top-6 z-20 border-b-2 border-r border-b-blue-500 border-r-blue-100 bg-blue-50 py-2.5 pl-4 pr-3 text-xs font-medium uppercase tracking-wide text-blue-700">
                Centro de custo / Mês
              </th>
              <th className="sticky -top-6 z-20 border-b-2 border-b-blue-500 bg-blue-100 px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-blue-800">
                Dívida PJ
              </th>
            </tr>
          </thead>
          <tbody>
            {semCentros && (
              <tr>
                <td colSpan={2} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                  {(centros || []).length === 0
                    ? 'Nenhum centro de custo com "Projeta DFC" marcado. Marque na aba Centros Custos.'
                    : 'Nenhum centro de custo encontrado para essa busca.'}
                </td>
              </tr>
            )}
            {centrosFiltrados.map((centro) => {
              const expandido = expandidoId === centro.sienge_id;
              const vigente = vigentes[centro.sienge_id];
              return (
                <Fragment key={centro.sienge_id}>
                  {/* Nível 1: o centro, com o valor do mês mais recente */}
                  <tr onClick={() => toggleExpandir(centro.sienge_id)} className="group/obra cursor-pointer">
                    <td className="border-b border-r border-gray-200 bg-gray-50 py-2 pl-3 pr-2 group-hover/obra:bg-gray-100">
                      <span className="flex items-center gap-2">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                          {expandido ? <Minus size={10} /> : <Plus size={10} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-gray-900" title={`${centro.sienge_id} - ${centro.name}`}>
                            {centro.name}
                          </span>
                          <span className="block truncate text-[10px] text-gray-400">
                            {vigente ? `Vigente em ${mesAno(vigente.mes)}` : 'Sem dívida cadastrada'}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="border-b border-blue-100 bg-blue-50 px-3 text-right text-xs font-bold tabular-nums text-blue-700 group-hover/obra:bg-blue-100">
                      {vigente ? formatarValor(vigente.valor) : <span className="text-blue-200">—</span>}
                    </td>
                  </tr>

                  {expandido && carregandoDetalhe && (
                    <tr>
                      <td colSpan={2} className="border-b border-gray-100 bg-white py-6 text-center text-xs text-gray-400">
                        Carregando...
                      </td>
                    </tr>
                  )}

                  {/* Nível 2: os meses (o último é o vigente), editáveis */}
                  {expandido &&
                    !carregandoDetalhe &&
                    meses &&
                    meses.map((m, i) => (
                      <tr key={m.mes} className="group/mes">
                        <td className="border-b border-r border-gray-100 border-r-gray-200 bg-white py-1.5 pl-9 pr-2">
                          <span className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-800">{mesAno(m.mes)}</span>
                            {i === meses.length - 1 && (
                              <span className="rounded bg-primary-50 px-1.5 py-px text-[10px] font-semibold text-primary-600 ring-1 ring-primary-100">
                                Vigente
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => remover(centro.sienge_id, m.mes)}
                              disabled={removendoMes === m.mes}
                              title="Remover mês"
                              className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-gray-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover/mes:opacity-100 disabled:opacity-50"
                            >
                              <Trash2 size={13} />
                            </button>
                          </span>
                        </td>
                        <td className="border-b border-gray-100 bg-white p-1">
                          <CelulaValor valor={m.valor} onCommit={(novo) => gravar(centro.sienge_id, m.mes, novo).catch(() => {})} />
                        </td>
                      </tr>
                    ))}

                  {expandido && !carregandoDetalhe && meses && (
                    <LinhaNovoMes
                      mesesExistentes={new Set(meses.map((m) => m.mes))}
                      onCriar={(mes) => gravar(centro.sienge_id, mes, 0)}
                    />
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {!semCentros && (
            <tfoot>
              <tr>
                <td className="sticky bottom-0 z-10 border-t-2 border-r border-t-blue-500 border-r-blue-100 bg-blue-50 py-2.5 pl-4 pr-3">
                  <span className="block text-xs font-semibold uppercase tracking-wide text-blue-800">Total</span>
                  <span className="block text-[10px] text-blue-500">
                    Soma do valor vigente de {comDivida.length} {comDivida.length === 1 ? 'centro' : 'centros'}
                  </span>
                </td>
                <td className="sticky bottom-0 z-10 border-t-2 border-t-blue-500 bg-blue-100 px-3 text-right text-xs font-bold tabular-nums text-blue-800">
                  {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  );
}
