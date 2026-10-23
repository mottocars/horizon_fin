import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Briefcase, Check, Minus, Pencil, Plus, Trash2, X } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { listCentrosCustoDre } from '../../../api/dreCentros.api';
import {
  createCategoriaOrcamento,
  listCategoriasOrcamento,
  removeCategoriaOrcamento,
  updateCategoriaOrcamento,
} from '../../../api/dreCategoriasOrcamento.api';
import {
  listOrcamentoCentroCusto,
  listOrcamentosVigentes,
  removerOrcamentoCentroCusto,
  salvarOrcamentoCentroCusto,
} from '../../../api/dreOrcamento.api';
import { useConfirm } from '../../../confirm/ConfirmContext';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function nomeMesAno(iso) {
  const [ano, mes] = iso.split('-').map(Number);
  return `${MESES[mes - 1]} de ${ano}`;
}

function formatarValor(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numeroParaEdicao(valor) {
  return Number(valor || 0).toFixed(2).replace('.', ',');
}

// Mesma lógica de saldo-contas-bancarias/constantes.js::interpretarSaldo (duplicada aqui de
// propósito — módulos não importam um do outro nesse projeto). Devolve null pra vazio, NaN pra
// texto inválido, o número (2 casas) nos demais casos.
function interpretarValor(texto) {
  let t = String(texto ?? '').replace(/\s/g, '').replace(/^(-?)R\$/i, '$1');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  const n = Math.round(parseFloat(t) * 100) / 100;
  return Number.isFinite(n) && Math.abs(n) <= 9_999_999_999_999.99 ? n : NaN;
}

// Célula de valor editável — mesmo comportamento de CelulaSaldo.jsx (SaldosContasTab.jsx): sem
// edição mostra o valor formatado, ao focar vira texto puro editável e grava ao sair do campo.
// Mais simples que a de lá de propósito: aqui não existe "origem" (API/manual) nem "bloqueada"
// (período aberto) — todo valor de orçamento é sempre digitado à mão.
function CelulaValor({ valor, onCommit }) {
  const [texto, setTexto] = useState(null);
  const editando = texto !== null;

  function commit() {
    if (texto === null) return;
    const digitado = texto;
    setTexto(null);
    const novo = interpretarValor(digitado);
    if (Number.isNaN(novo)) return;
    const atual = valor ?? 0;
    if ((novo ?? 0) === atual) return;
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

// Valor do orçamento vigente na linha-resumo (nível 0) — negrito, não editável (mesmo peso
// visual do "total" de SaldosContasTab.jsx::ValorTotal); traço quando não existe nenhum valor
// pra essa categoria no orçamento vigente.
function ValorVigente({ valor }) {
  if (valor === undefined) return <span className="text-gray-300">—</span>;
  return <span className="font-semibold text-gray-900">{formatarValor(valor)}</span>;
}

// Linha "+ Novo orçamento" — clicar revela um mini-formulário inline (só o mês de início) sem
// precisar de um modal separado; confirmar cria a linha (todas as categorias com valor 0,
// prontas pra editar) e volta a mostrar o "+" de novo.
function LinhaNovoOrcamento({ totalColunas, mesesExistentes, onCriar }) {
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!mes) {
      setErro('Escolha o mês de início.');
      return;
    }
    if (mesesExistentes.has(`${mes}-01`)) {
      setErro('Já existe um orçamento começando neste mês.');
      return;
    }
    setErro('');
    setSalvando(true);
    try {
      await onCriar(mes);
      setAberto(false);
      setMes('');
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível criar o orçamento.');
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <tr>
        <td colSpan={totalColunas} className="border-b border-gray-50 p-0">
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="flex w-full items-center gap-1.5 px-9 py-2.5 text-left text-xs font-medium text-primary-600 hover:bg-primary-50"
          >
            <Plus size={13} />
            Novo orçamento
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={totalColunas} className="border-b border-gray-50 bg-primary-50/40 px-9 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Mês de início</label>
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

// Nível 0 = 1 linha por centro de custo (só 1 expandido por vez, mesmo padrão de
// ClustersCobranca/CentrosCustoResumo.jsx — drilldown de tabela única, sem cabeçalho repetido).
// Nível 1 (expandido) = 1 linha por orçamento (rotulada pelo mês de início), 1 coluna por
// categoria — mesma mecânica de célula editável de SaldosContasTab.jsx.
//
// As categorias (as colunas) são cadastradas aqui mesmo (pedido do usuário — saiu a aba Categorias
// Orçamento): `ref` expõe `abrirNova()` pro botão "Nova categoria" do topo da página, e cada
// cabeçalho de categoria mostra renomear/remover ao passar o mouse. Mesmo formulário da aba antiga
// (nome sempre maiúsculo — o backend já normaliza, aqui é só pra mostrar maiúsculo ao digitar).
const OrcamentoTab = forwardRef(function OrcamentoTab({ empresaId, search = '' }, ref) {
  const confirm = useConfirm();
  const [categorias, setCategorias] = useState([]);
  const [centros, setCentros] = useState(null);
  // Orçamento vigente (o de data_inicio mais recente) de cada centro, pra mostrar na linha-
  // resumo (nível 0) sem precisar expandir — { [sienge_id]: { data_inicio, valores } }.
  const [vigentes, setVigentes] = useState({});
  const [carregando, setCarregando] = useState(false);

  const [expandidoId, setExpandidoId] = useState(null);
  const [orcamentos, setOrcamentos] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [removendoData, setRemovendoData] = useState(null);

  // Janela de criar/editar categoria. editandoCategoria null = criando.
  const [modalCategoria, setModalCategoria] = useState(false);
  const [editandoCategoria, setEditandoCategoria] = useState(null);
  const [nomeCategoria, setNomeCategoria] = useState('');
  const [erroCategoria, setErroCategoria] = useState('');
  const [salvandoCategoria, setSalvandoCategoria] = useState(false);
  const [erroRemoverCategoria, setErroRemoverCategoria] = useState('');

  const carregar = useCallback(() => {
    if (!empresaId) {
      setCategorias([]);
      setCentros(null);
      setVigentes({});
      return;
    }
    setCarregando(true);
    Promise.all([
      listCategoriasOrcamento(empresaId),
      listCentrosCustoDre(empresaId),
      listOrcamentosVigentes(empresaId),
    ])
      .then(([cats, listaCentros, vig]) => {
        setCategorias(cats);
        // Só os centros com "Realiza DRE" (aba Centros Custos).
        setCentros(listaCentros.filter((c) => c.realiza_dre));
        setVigentes(vig);
      })
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setExpandidoId(null);
    setOrcamentos(null);
    carregar();
  }, [carregar]);

  // O último item de `lista` (já vem ordenada por data_inicio ASC) é sempre o vigente — atualiza
  // localmente em vez de refazer a consulta de /vigentes inteira a cada edição/criação/remoção.
  function sincronizarVigenteLocal(siengeId, lista) {
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
      listOrcamentoCentroCusto(empresaId, siengeId)
        .then((lista) => {
          setOrcamentos(lista);
          sincronizarVigenteLocal(siengeId, lista);
        })
        .finally(() => setCarregandoDetalhe(false));
    },
    [empresaId]
  );

  useEffect(() => {
    carregarDetalhe(expandidoId);
  }, [expandidoId, carregarDetalhe]);

  function toggleExpandir(siengeId) {
    setExpandidoId((atual) => {
      if (atual === siengeId) {
        setOrcamentos(null);
        return null;
      }
      setOrcamentos(null);
      return siengeId;
    });
  }

  async function handleCriarOrcamento(siengeId, mesISO) {
    const itens = categorias.map((c) => ({ categoria_id: c.id, valor: 0 }));
    const atualizado = await salvarOrcamentoCentroCusto(empresaId, siengeId, { data_inicio: mesISO, itens });
    setOrcamentos(atualizado);
    sincronizarVigenteLocal(siengeId, atualizado);
  }

  async function handleEditarCelula(siengeId, dataInicio, categoriaId, valor) {
    const atualizado = await salvarOrcamentoCentroCusto(empresaId, siengeId, {
      data_inicio: dataInicio,
      itens: [{ categoria_id: categoriaId, valor }],
    });
    setOrcamentos(atualizado);
    sincronizarVigenteLocal(siengeId, atualizado);
  }

  function abrirCategoria(categoria) {
    setEditandoCategoria(categoria);
    setNomeCategoria(categoria ? categoria.nome : '');
    setErroCategoria('');
    setModalCategoria(true);
  }

  useImperativeHandle(ref, () => ({ abrirNova: () => abrirCategoria(null) }), []);

  // Recarrega as categorias (colunas) e, se um centro está aberto, os orçamentos dele.
  function recarregarCategorias() {
    listCategoriasOrcamento(empresaId).then(setCategorias);
    if (expandidoId) carregarDetalhe(expandidoId);
  }

  async function salvarCategoria(e) {
    e.preventDefault();
    setErroCategoria('');
    setSalvandoCategoria(true);
    try {
      if (editandoCategoria) await updateCategoriaOrcamento(empresaId, editandoCategoria.id, { nome: nomeCategoria });
      else await createCategoriaOrcamento(empresaId, { nome: nomeCategoria });
      setModalCategoria(false);
      recarregarCategorias();
    } catch (err) {
      setErroCategoria(err.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setSalvandoCategoria(false);
    }
  }

  // Categoria com valor lançado em algum orçamento não pode ser removida (o backend recusa).
  async function removerCategoria(categoria) {
    const confirmado = await confirm({
      title: 'Remover categoria',
      description: `Remover "${categoria.nome}"?`,
      confirmLabel: 'Remover',
      variant: 'warning',
    });
    if (!confirmado) return;
    setErroRemoverCategoria('');
    try {
      await removeCategoriaOrcamento(empresaId, categoria.id);
      recarregarCategorias();
    } catch (err) {
      setErroRemoverCategoria(err.response?.data?.message || 'Não foi possível remover a categoria.');
    }
  }

  async function handleRemoverOrcamento(siengeId, dataInicio) {
    const confirmado = await confirm({
      title: 'Remover orçamento',
      description: `Remover o orçamento de ${nomeMesAno(dataInicio)}? Os valores lançados nele serão perdidos.`,
      confirmLabel: 'Remover',
      variant: 'warning',
    });
    if (!confirmado) return;
    setRemovendoData(dataInicio);
    try {
      await removerOrcamentoCentroCusto(empresaId, siengeId, dataInicio);
      carregarDetalhe(siengeId);
    } finally {
      setRemovendoData(null);
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Briefcase size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver e lançar o orçamento de cada centro de custo.
        </p>
      </div>
    );
  }

  const termo = search.trim().toLowerCase();
  const centrosFiltrados = (centros || []).filter(
    (c) => !termo || c.name.toLowerCase().includes(termo) || String(c.sienge_id).includes(termo)
  );
  const semCategorias = !carregando && categorias.length === 0;
  const semCentros = !carregando && !semCategorias && centrosFiltrados.length === 0;
  const totalColunas = 2 + categorias.length;

  return (
    <div className="rounded-card rounded-tl-none bg-white shadow-card">
      {erroRemoverCategoria && (
        <div className="flex items-center justify-between gap-3 rounded-t-card bg-red-50 px-4 py-2 text-xs text-red-600" role="status">
          {erroRemoverCategoria}
          <button type="button" onClick={() => setErroRemoverCategoria('')} title="Fechar" className="shrink-0 hover:text-red-800">
            <X size={14} />
          </button>
        </div>
      )}
      {carregando ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : semCategorias ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <Briefcase size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma categoria de orçamento cadastrada.</p>
          <p className="max-w-sm text-xs text-gray-400">
            Cadastre ao menos uma no botão "Nova categoria", acima, antes de lançar orçamentos aqui.
          </p>
        </div>
      ) : semCentros ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <Briefcase size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">
            {(centros || []).length === 0 ? 'Nenhum centro de custo com Realiza DRE.' : 'Nenhum centro de custo encontrado.'}
          </p>
          {(centros || []).length === 0 && (
            <p className="max-w-sm text-xs text-gray-400">Marque os centros na aba Centros Custos.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-b-card">
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-gray-400">
                <th className="border-b border-gray-200 bg-white py-2.5 pl-4 font-medium">Centro de Custo / Mês</th>
                {categorias.map((c) => (
                  <th key={c.id} className="group/cat relative border-b border-l border-gray-200 bg-white px-3 py-2.5 text-right font-medium">
                    {/* Renomear/remover sobrepostos no canto esquerdo (só no hover), sem ocupar espaço do nome. */}
                    <span className="absolute left-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 bg-white opacity-0 transition-opacity group-hover/cat:opacity-100">
                      <button
                        type="button"
                        onClick={() => abrirCategoria(c)}
                        title="Renomear categoria"
                        className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removerCategoria(c)}
                        title="Remover categoria"
                        className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={11} />
                      </button>
                    </span>
                    {c.nome}
                  </th>
                ))}
                <th className="w-14 border-b border-l border-gray-200 bg-white px-3 py-2.5 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {centrosFiltrados.map((centro) => {
                const expandido = expandidoId === centro.sienge_id;
                const vigente = vigentes[centro.sienge_id];
                return (
                  <Fragment key={centro.sienge_id}>
                    <tr onClick={() => toggleExpandir(centro.sienge_id)} className="group/grupo cursor-pointer">
                      <td className="border-b border-gray-200 bg-gray-50 py-2.5 pl-3 pr-2 group-hover/grupo:bg-gray-100">
                        <span className="flex items-center gap-2">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                            {expandido ? <Minus size={10} /> : <Plus size={10} />}
                          </span>
                          <span className="truncate text-xs font-semibold text-gray-900" title={centro.name}>
                            {centro.name}
                          </span>
                          <span className="shrink-0 text-[11px] text-gray-400">#{centro.sienge_id}</span>
                          {vigente && (
                            <span className="shrink-0 text-[11px] text-gray-400">
                              · vigente desde {nomeMesAno(vigente.data_inicio)}
                            </span>
                          )}
                        </span>
                      </td>
                      {categorias.map((c) => (
                        <td
                          key={c.id}
                          className="border-b border-l border-gray-200 bg-gray-50 px-3 py-2.5 text-right text-xs tabular-nums group-hover/grupo:bg-gray-100"
                        >
                          <ValorVigente valor={vigente?.valores?.[c.id]} />
                        </td>
                      ))}
                      <td className="border-b border-l border-gray-200 bg-gray-50 group-hover/grupo:bg-gray-100" />
                    </tr>

                    {expandido && carregandoDetalhe && (
                      <tr>
                        <td colSpan={totalColunas} className="py-6 text-center text-xs text-gray-400">
                          Carregando...
                        </td>
                      </tr>
                    )}

                    {expandido &&
                      !carregandoDetalhe &&
                      orcamentos &&
                      orcamentos.map((orc) => (
                        <tr key={orc.data_inicio}>
                          <td className="border-b border-gray-100 py-1.5 pl-9 pr-3 text-xs font-medium text-gray-700">
                            {nomeMesAno(orc.data_inicio)}
                          </td>
                          {categorias.map((c) => (
                            <td key={c.id} className="border-b border-l border-gray-100 p-1">
                              <CelulaValor
                                valor={orc.valores[c.id]}
                                onCommit={(novo) => handleEditarCelula(centro.sienge_id, orc.data_inicio, c.id, novo)}
                              />
                            </td>
                          ))}
                          <td className="border-b border-l border-gray-100 px-3 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoverOrcamento(centro.sienge_id, orc.data_inicio)}
                              disabled={removendoData === orc.data_inicio}
                              title="Remover orçamento"
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}

                    {expandido && !carregandoDetalhe && orcamentos && (
                      <LinhaNovoOrcamento
                        totalColunas={totalColunas}
                        mesesExistentes={new Set(orcamentos.map((o) => o.data_inicio))}
                        onCriar={(mesISO) => handleCriarOrcamento(centro.sienge_id, mesISO)}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalCategoria}
        onClose={() => setModalCategoria(false)}
        title={editandoCategoria ? 'Editar categoria' : 'Nova categoria'}
      >
        <form onSubmit={salvarCategoria} className="space-y-4">
          {erroCategoria && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erroCategoria}</div>}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
            <input
              type="text"
              value={nomeCategoria}
              onChange={(e) => setNomeCategoria(e.target.value.toUpperCase())}
              autoFocus
              maxLength={80}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalCategoria(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={salvandoCategoria}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
});

OrcamentoTab.displayName = 'OrcamentoTab';

export default OrcamentoTab;
