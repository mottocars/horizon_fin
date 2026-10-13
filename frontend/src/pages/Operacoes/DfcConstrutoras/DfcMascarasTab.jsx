import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Check, GripVertical, Loader2, Minus, Pencil, Plus, Tags, Trash2, TriangleAlert, Wand2 } from 'lucide-react';
import Button from '../../../components/Button';
import { useConfirm } from '../../../confirm/ConfirmContext';
import {
  createDfcMascaras,
  listDfcMascaras,
  removeDfcMascara,
  reordenarDfcMascaras,
  updateDfcMascara,
} from '../../../api/dfcMascaras.api';

// Estrutura de exemplo passada pelo usuário — oferecida só quando a empresa ainda não tem
// nenhuma máscara (botão "Usar modelo sugerido"); depois disso é tudo editável normalmente.
const MODELO_SUGERIDO = [
  {
    descricao: 'FLUXO DE CAIXA OPERACIONAL',
    filhos: [
      'RECEITA DE VENDAS',
      'OUTRAS RECEITAS OPERACIONAIS',
      'CUSTO DO TERRENO',
      'CUSTO DE CONSTRUCAO (OBRA)',
      'INCORPORACAO E LEGALIZACAO',
      'DESPESAS COMERCIAIS E MARKETING',
      'DESPESAS COM PESSOAL',
      'DESPESAS ADMINISTRATIVAS',
      'IMPOSTOS E TRIBUTOS',
      'DISTRATOS, ENCARGOS E AJUSTES OPERACIONAIS',
      'CAPTACAO DE FINANCIAMENTOS',
      'SERVICO DA DIVIDA (AMORTIZACAO E JUROS)',
      'ENCARGOS E TARIFAS FINANCEIRAS',
    ],
  },
  {
    descricao: 'FLUXO DE CAIXA DOS INVESTIMENTOS',
    filhos: ['APLICACOES E RESGATES FINANCEIROS', 'RENDIMENTOS DE APLICACOES', 'INVESTIMENTO PRODUTOS'],
  },
  {
    descricao: 'RETIRADAS / INTEGRALIZAÇÕES E ACERTOS',
    filhos: [
      'TRANSFERENCIAS E MOVIMENTACOES BANCARIAS',
      'APORTES E INTEGRALIZACOES DE CAPITAL',
      'REMUNERACAO E DISTRIBUICAO AOS SOCIOS',
      'MOVIMENTACAO E DEVOLUCAO DE CAPITAL',
      'OUTRAS RECEITAS',
    ],
  },
];

// Colar várias linhas no campo de criar cria uma máscara por linha (atalho pra quem já tem a
// lista pronta numa planilha).
function linhasColadas(texto) {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// Move `arrastado` pra posição `alvo` ({ parentId: null = nível 1 | id do grupo, index }) e
// devolve a árvore nova — ou null se a posição final é a mesma de antes. Um item de nível 2
// solto no nível 1 vira um grupo (vazio); um de nível 1 solto dentro de um grupo vira nível 2
// (só se não tiver filhos — isso é barrado antes, em podeSerFilho).
function aplicarMovimento(arvore, arrastado, alvo) {
  let origemParentId = null;
  let origemIndex = arvore.findIndex((g) => g.id === arrastado.id);
  if (origemIndex === -1) {
    const grupo = arvore.find((g) => g.filhos.some((f) => f.id === arrastado.id));
    if (!grupo) return null;
    origemParentId = grupo.id;
    origemIndex = grupo.filhos.findIndex((f) => f.id === arrastado.id);
  }

  let destino = alvo.index;
  if (origemParentId === alvo.parentId && origemIndex < destino) destino -= 1;
  if (origemParentId === alvo.parentId && origemIndex === destino) return null;

  const nova = arvore.map((g) => ({ ...g, filhos: [...g.filhos] }));
  const item =
    origemParentId === null
      ? nova.splice(origemIndex, 1)[0]
      : nova.find((g) => g.id === origemParentId).filhos.splice(origemIndex, 1)[0];

  if (alvo.parentId === null) {
    nova.splice(destino, 0, { id: item.id, descricao: item.descricao, filhos: item.filhos || [] });
  } else {
    nova.find((g) => g.id === alvo.parentId).filhos.splice(destino, 0, { id: item.id, descricao: item.descricao });
  }
  return nova;
}

// Campo de texto usado tanto pra criar quanto pra renomear: Enter salva, Esc cancela, sair do
// campo com texto salva (sem texto, só fecha). `onSalvar(texto, viaEnter)` — só o Enter
// "emenda" o próximo campo de criação; sair clicando fora não.
function CampoNome({ valorInicial = '', placeholder, onSalvar, onCancelar, onColarVarias, className = '' }) {
  const [valor, setValor] = useState(valorInicial);
  const encerrado = useRef(false);

  function salvar(viaEnter = false) {
    if (encerrado.current) return;
    const texto = valor.trim();
    if (!texto || texto === valorInicial) {
      encerrado.current = true;
      onCancelar();
      return;
    }
    encerrado.current = true;
    onSalvar(texto, viaEnter);
  }

  return (
    <input
      type="text"
      autoFocus
      value={valor}
      maxLength={150}
      placeholder={placeholder}
      onChange={(e) => setValor(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          salvar(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          encerrado.current = true;
          onCancelar();
        }
      }}
      onBlur={() => salvar()}
      onPaste={(e) => {
        if (!onColarVarias) return;
        const linhas = linhasColadas(e.clipboardData.getData('text'));
        if (linhas.length < 2) return;
        e.preventDefault();
        encerrado.current = true;
        onColarVarias(linhas);
      }}
      className={`w-full min-w-0 rounded-md border border-primary-300 bg-white px-2 py-1 text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 ${className}`}
    />
  );
}

function BotaoAcao({ title, onClick, perigo = false, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors ${
        perigo ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-white hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

// Linha azul que marca onde o item arrastado vai cair.
function Indicador({ recuo = false, embaixo = false }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute right-2 z-10 h-0.5 rounded-full bg-primary-500 ${recuo ? 'left-20' : 'left-2'} ${
        embaixo ? '-bottom-px' : '-top-px'
      }`}
    />
  );
}

// Operações > DFC Construtoras > Máscaras: estrutura da DFC da empresa em 2 níveis. Visual de
// drilldown igual à grade de Saldos das Contas (SaldosContasTab.jsx — linha cinza com +/- e
// contador no nível 1, linhas brancas recuadas no nível 2). Tudo se reordena arrastando, com o
// drag-and-drop nativo do navegador (mesmo esquema do Kanban do Plano de Voo): um item de nível 2
// pode ir pra outro grupo ou virar nível 1, e um nível 1 sem filhos pode entrar num grupo.
// Cada mudança salva na hora (reordenação regrava a árvore inteira — ver dfcMascaras.service.js).
//
// `ref` expõe `abrirNova()` pro botão "Nova máscara" do topo da página (mesmo padrão de
// CategoriasOrcamentoTab na DRE).
const DfcMascarasTab = forwardRef(function DfcMascarasTab({ empresaId }, ref) {
  const confirm = useConfirm();
  const [arvore, setArvore] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [abertos, setAbertos] = useState([]);

  // Status de salvamento (mesmo indicador de SaldosContasTab.jsx).
  const [pendentes, setPendentes] = useState(0);
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);

  // criando: null | { parentId } (null = nível 1). editandoId: id da máscara sendo renomeada.
  const [criando, setCriando] = useState(null);
  const [editandoId, setEditandoId] = useState(null);

  const [arrastado, setArrastado] = useState(null);
  const [alvo, setAlvo] = useState(null);

  // Os grupos começam fechados (pedido do usuário) — só abrem sozinhos quando o usuário está
  // trabalhando neles: grupo novo, item novo, ou item solto dentro de um grupo.
  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    listDfcMascaras(empresaId)
      .then(setArvore)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar as máscaras.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setArvore([]);
    setCriando(null);
    setEditandoId(null);
    setErroSalvar('');
    setSalvoAlgumaVez(false);
    setAbertos([]);
    carregar();
  }, [carregar]);

  useImperativeHandle(ref, () => ({ abrirNova: () => setCriando({ parentId: null }) }), []);

  // Toda escrita passa por aqui: conta pendência, mostra erro e, se falhar, recarrega do banco
  // pra tela nunca ficar mostrando algo que não foi salvo.
  async function salvar(acao) {
    setErroSalvar('');
    setPendentes((n) => n + 1);
    try {
      const resultado = await acao();
      setSalvoAlgumaVez(true);
      return resultado;
    } catch (err) {
      setErroSalvar(err.response?.data?.message || 'Não foi possível salvar.');
      carregar();
      return null;
    } finally {
      setPendentes((n) => n - 1);
    }
  }

  function alternarGrupo(id) {
    setAbertos((atual) => (atual.includes(id) ? atual.filter((v) => v !== id) : [...atual, id]));
  }

  // ------------------------------------------------------------------ criar / renomear / remover
  async function criar(parentId, descricoes, continuar) {
    const criados = await salvar(() => createDfcMascaras(empresaId, { parentId, descricoes }));
    if (!criados) return;
    setArvore((atual) =>
      parentId === null
        ? [...atual, ...criados.map((c) => ({ id: c.id, descricao: c.descricao, filhos: [] }))]
        : atual.map((g) =>
            g.id === parentId ? { ...g, filhos: [...g.filhos, ...criados.map((c) => ({ id: c.id, descricao: c.descricao }))] } : g
          )
    );
    // Grupo novo já nasce aberto, pronto pra receber os itens de nível 2.
    if (parentId === null) setAbertos((atual) => [...atual, ...criados.map((c) => c.id)]);
    // Depois de criar com Enter já abre o próximo campo: num grupo, a próxima máscara de nível 2;
    // depois de um nível 1 novo, a primeira de nível 2 dentro dele.
    if (!continuar) setCriando(null);
    else if (parentId === null) setCriando({ parentId: criados[criados.length - 1].id, chave: Date.now() });
    else setCriando({ parentId, chave: Date.now() });
  }

  async function renomear(id, descricao) {
    setEditandoId(null);
    setArvore((atual) =>
      atual.map((g) =>
        g.id === id ? { ...g, descricao } : { ...g, filhos: g.filhos.map((f) => (f.id === id ? { ...f, descricao } : f)) }
      )
    );
    await salvar(() => updateDfcMascara(empresaId, id, { descricao }));
  }

  async function remover(item, grupo) {
    const qtdFilhos = grupo ? 0 : item.filhos.length;
    const confirmado = await confirm({
      title: 'Remover máscara',
      description:
        qtdFilhos > 0
          ? `Remover "${item.descricao}" e as ${qtdFilhos} máscara(s) de nível 2 dentro dela?`
          : `Remover "${item.descricao}"?`,
      confirmLabel: 'Remover',
      variant: 'danger',
    });
    if (!confirmado) return;
    setArvore((atual) =>
      grupo
        ? atual.map((g) => (g.id === grupo.id ? { ...g, filhos: g.filhos.filter((f) => f.id !== item.id) } : g))
        : atual.filter((g) => g.id !== item.id)
    );
    await salvar(() => removeDfcMascara(empresaId, item.id));
  }

  async function usarModelo() {
    await salvar(async () => {
      const grupos = await createDfcMascaras(empresaId, {
        parentId: null,
        descricoes: MODELO_SUGERIDO.map((g) => g.descricao),
      });
      for (let i = 0; i < grupos.length; i += 1) {
        await createDfcMascaras(empresaId, { parentId: grupos[i].id, descricoes: MODELO_SUGERIDO[i].filhos });
      }
    });
    carregar();
  }

  // ------------------------------------------------------------------ arrastar e soltar
  // Nível 1 com filhos não pode entrar noutro grupo (viraria um 3º nível).
  const podeSerFilho = arrastado && (arrastado.nivel === 2 || !arrastado.temFilhos);

  function iniciarArraste(e, info) {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(info.id));
    // adia pra o navegador capturar a "foto" da linha antes de esmaecer a original
    requestAnimationFrame(() => setArrastado(info));
  }

  function encerrarArraste() {
    setArrastado(null);
    setAlvo(null);
  }

  function metadeDeCima(e) {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY < r.top + r.height / 2;
  }

  function mirar(e, novoAlvo) {
    if (!arrastado) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!alvo || alvo.parentId !== novoAlvo.parentId || alvo.index !== novoAlvo.index) setAlvo(novoAlvo);
  }

  // Sobre a linha de um grupo: metade de cima = antes dele (nível 1); metade de baixo = dentro
  // dele, no começo (se o item puder ser nível 2), senão depois dele.
  function mirarGrupo(e, grupo, i) {
    if (metadeDeCima(e)) mirar(e, { parentId: null, index: i });
    else if (podeSerFilho && grupo.id !== arrastado.id) mirar(e, { parentId: grupo.id, index: 0 });
    else mirar(e, { parentId: null, index: i + 1 });
  }

  function mirarFilho(e, grupo, i, j) {
    if (!podeSerFilho) mirar(e, { parentId: null, index: i + 1 });
    else mirar(e, { parentId: grupo.id, index: metadeDeCima(e) ? j : j + 1 });
  }

  async function soltar(e) {
    e.preventDefault();
    const item = arrastado;
    const destino = alvo;
    encerrarArraste();
    if (!item || !destino) return;
    const nova = aplicarMovimento(arvore, item, destino);
    if (!nova) return;
    setArvore(nova);
    if (destino.parentId !== null) setAbertos((atual) => (atual.includes(destino.parentId) ? atual : [...atual, destino.parentId]));
    const estrutura = nova.map((g) => ({ id: g.id, filhos: g.filhos.map((f) => f.id) }));
    const salva = await salvar(() => reordenarDfcMascaras(empresaId, estrutura));
    if (salva) setArvore(salva);
  }

  const marca = (parentId, index) => alvo && alvo.parentId === parentId && alvo.index === index;

  // ------------------------------------------------------------------ renderização
  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Tags size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para montar as máscaras da DFC.</p>
      </div>
    );
  }

  const statusSalvamento = pendentes > 0 ? 'salvando' : erroSalvar ? 'erro' : salvoAlgumaVez ? 'salvo' : null;
  const vazio = !carregando && !erroCarga && arvore.length === 0;

  return (
    // Tabela dentro do quadro branco, com margem em volta (p-5) e cabeçalho de cantos de cima
    // arredondados — mesmo padrão da tabela do Espião NFe / NFSe (pedido do usuário).
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {statusSalvamento && (
        <div className="-mt-1 mb-3 flex items-center justify-end text-xs" aria-live="polite">
          {statusSalvamento === 'salvando' ? (
            <span className="flex items-center gap-1.5 text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Salvando...
            </span>
          ) : statusSalvamento === 'erro' ? (
            <span className="flex items-center gap-1.5 text-red-600" title={erroSalvar}>
              <TriangleAlert size={14} /> Erro ao salvar
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-600">
              <Check size={14} /> Alterações salvas
            </span>
          )}
        </div>
      )}

      {erroSalvar && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="status">
          {erroSalvar}
        </div>
      )}

      {carregando && arvore.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erroCarga ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TriangleAlert size={26} className="text-red-400" />
          <p className="text-sm text-gray-600">{erroCarga}</p>
          <button
            type="button"
            onClick={() => carregar()}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Tentar de novo
          </button>
        </div>
      ) : vazio && !criando ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <Tags size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma máscara da DFC cadastrada ainda.</p>
          <p className="max-w-md text-xs text-gray-400">
            Crie as máscaras de nível 1 (ex.: Fluxo de Caixa Operacional) e, dentro de cada uma, as de nível 2. Ou comece pelo
            modelo sugerido e ajuste depois.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={() => setCriando({ parentId: null })}>
              <Plus size={16} />
              Criar a primeira máscara
            </Button>
            <Button type="button" variant="secondary" onClick={usarModelo} loading={pendentes > 0}>
              <Wand2 size={16} />
              Usar modelo sugerido
            </Button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => arrastado && e.preventDefault()}
          onDrop={soltar}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setAlvo(null);
          }}
        >
          <div className="flex items-center justify-between rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700">
            <span>Nível 1 / Nível 2</span>
            <span className="hidden normal-case tracking-normal text-blue-500 sm:inline">
              Arraste pelas linhas para reordenar ou mudar de grupo · duplo clique renomeia
            </span>
          </div>

          {arvore.map((grupo, i) => {
            const aberto = abertos.includes(grupo.id);
            const sendoArrastado = arrastado?.id === grupo.id;
            const recebendo = alvo?.parentId === grupo.id;
            const criandoAqui = criando && criando.parentId === grupo.id;
            return (
              <div key={grupo.id} className={sendoArrastado ? 'opacity-40' : ''}>
                {/* Linha do nível 1 */}
                <div
                  draggable={editandoId !== grupo.id}
                  onDragStart={(e) => iniciarArraste(e, { id: grupo.id, nivel: 1, temFilhos: grupo.filhos.length > 0 })}
                  onDragEnd={encerrarArraste}
                  onDragOver={(e) => mirarGrupo(e, grupo, i)}
                  onClick={() => alternarGrupo(grupo.id)}
                  onDoubleClick={() => setEditandoId(grupo.id)}
                  className={`group/linha relative flex cursor-pointer items-center gap-2 border-b border-gray-200 py-2.5 pl-1.5 pr-2 ${
                    recebendo ? 'bg-primary-50 ring-1 ring-inset ring-primary-300' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  {marca(null, i) && <Indicador />}
                  <GripVertical size={14} className="shrink-0 cursor-grab text-gray-300 group-hover/linha:text-gray-500" />
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                    {aberto ? <Minus size={10} /> : <Plus size={10} />}
                  </span>
                  {editandoId === grupo.id ? (
                    <CampoNome
                      valorInicial={grupo.descricao}
                      onSalvar={(texto) => renomear(grupo.id, texto)}
                      onCancelar={() => setEditandoId(null)}
                      className="font-semibold"
                    />
                  ) : (
                    <span className="min-w-0 truncate text-xs font-semibold text-gray-900" title={grupo.descricao}>
                      {grupo.descricao}
                    </span>
                  )}
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                    {grupo.filhos.length}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/linha:opacity-100">
                    <BotaoAcao
                      title="Adicionar máscara de nível 2"
                      onClick={() => {
                        setAbertos((atual) => (atual.includes(grupo.id) ? atual : [...atual, grupo.id]));
                        setCriando({ parentId: grupo.id });
                      }}
                    >
                      <Plus size={14} />
                    </BotaoAcao>
                    <BotaoAcao title="Renomear" onClick={() => setEditandoId(grupo.id)}>
                      <Pencil size={13} />
                    </BotaoAcao>
                    <BotaoAcao title="Remover" perigo onClick={() => remover(grupo, null)}>
                      <Trash2 size={13} />
                    </BotaoAcao>
                  </span>
                </div>

                {/* Linhas do nível 2 */}
                {aberto &&
                  grupo.filhos.map((filho, j) => (
                    <div
                      key={filho.id}
                      draggable={editandoId !== filho.id}
                      onDragStart={(e) => iniciarArraste(e, { id: filho.id, nivel: 2 })}
                      onDragEnd={encerrarArraste}
                      onDragOver={(e) => mirarFilho(e, grupo, i, j)}
                      onDoubleClick={() => setEditandoId(filho.id)}
                      className={`group/linha relative flex items-center gap-2 border-b border-gray-100 bg-white py-1.5 pl-20 pr-2 hover:bg-gray-50 ${
                        arrastado?.id === filho.id ? 'opacity-40' : ''
                      }`}
                    >
                      {marca(grupo.id, j) && <Indicador recuo />}
                      <GripVertical size={14} className="-ml-5 shrink-0 cursor-grab text-gray-300 group-hover/linha:text-gray-500" />
                      {editandoId === filho.id ? (
                        <CampoNome
                          valorInicial={filho.descricao}
                          onSalvar={(texto) => renomear(filho.id, texto)}
                          onCancelar={() => setEditandoId(null)}
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800" title={filho.descricao}>
                          {filho.descricao}
                        </span>
                      )}
                      <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/linha:opacity-100">
                        <BotaoAcao title="Renomear" onClick={() => setEditandoId(filho.id)}>
                          <Pencil size={13} />
                        </BotaoAcao>
                        <BotaoAcao title="Remover" perigo onClick={() => remover(filho, grupo)}>
                          <Trash2 size={13} />
                        </BotaoAcao>
                      </span>
                    </div>
                  ))}

                {/* Fim do grupo: adicionar nível 2 (e alvo pra soltar no fim do grupo) */}
                {aberto && (
                  <div
                    onDragOver={(e) =>
                      mirar(e, podeSerFilho ? { parentId: grupo.id, index: grupo.filhos.length } : { parentId: null, index: i + 1 })
                    }
                    className="relative border-b border-gray-100 bg-white py-1.5 pl-20 pr-2"
                  >
                    {marca(grupo.id, grupo.filhos.length) && <Indicador recuo />}
                    {criandoAqui ? (
                      <CampoNome
                        key={criando.chave}
                        placeholder="Nome da máscara de nível 2 — Enter salva e abre a próxima, Esc cancela"
                        onSalvar={(texto, viaEnter) => criar(grupo.id, [texto], viaEnter)}
                        onCancelar={() => setCriando(null)}
                        onColarVarias={(linhas) => criar(grupo.id, linhas, false)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCriando({ parentId: grupo.id })}
                        className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium text-gray-400 transition-colors hover:text-primary-600"
                      >
                        <Plus size={13} />
                        Adicionar máscara de nível 2
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Fim da lista: novo nível 1 (e alvo pra soltar no fim, como nível 1) */}
          <div
            onDragOver={(e) => mirar(e, { parentId: null, index: arvore.length })}
            className="relative px-2 py-2"
          >
            {marca(null, arvore.length) && <Indicador />}
            {criando && criando.parentId === null ? (
              <CampoNome
                key={criando.chave}
                placeholder="Nome da máscara de nível 1 — Enter salva e já abre o nível 2 dela, Esc cancela (cole várias linhas para criar várias)"
                onSalvar={(texto, viaEnter) => criar(null, [texto], viaEnter)}
                onCancelar={() => setCriando(null)}
                onColarVarias={(linhas) => criar(null, linhas, false)}
                className="font-semibold"
              />
            ) : (
              <button
                type="button"
                onClick={() => setCriando({ parentId: null })}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 transition hover:border-primary-500 hover:text-primary-600"
              >
                <Plus size={14} />
                Nova máscara de nível 1
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

DfcMascarasTab.displayName = 'DfcMascarasTab';

export default DfcMascarasTab;
