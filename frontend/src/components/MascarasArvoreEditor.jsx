import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Check, GripVertical, Loader2, Minus, Pencil, Plus, Sigma, Tags, Trash2, TriangleAlert, Wand2 } from 'lucide-react';
import Button from './Button';
import { useConfirm } from '../confirm/ConfirmContext';

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
// (só se não tiver filhos — isso é barrado antes, em podeSerFilho). As marcações (`flags`) vão
// junto; quem troca de nível perde as que não valem no nível novo (mesma regra do backend).
function aplicarMovimento(arvore, arrastado, alvo, flags) {
  const soDoNivel = (item, nivel) => {
    const limpo = { ...item };
    flags.forEach((f) => {
      if (f.nivel && f.nivel !== nivel) limpo[f.campo] = f.opcoes ? null : false;
    });
    return limpo;
  };

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
    nova.splice(destino, 0, { ...soDoNivel(item, 1), filhos: item.filhos || [] });
  } else {
    const filho = soDoNivel(item, 2);
    delete filho.filhos;
    nova.find((g) => g.id === alvo.parentId).filhos.splice(destino, 0, filho);
  }
  return nova;
}

// Campo de texto usado tanto pra criar quanto pra renomear: Enter salva, Esc cancela, sair do
// campo com texto salva (sem texto, só fecha). `onSalvar(texto, viaEnter)` — só o Enter
// "emenda" o próximo campo de criação; sair clicando fora não. CampoNome, BotaoAcao e Indicador
// também são usados pelo editor da máscara Etapas do Centro de Custo (EtapasCentroCustoEditor.jsx).
export function CampoNome({ valorInicial = '', placeholder, onSalvar, onCancelar, onColarVarias, className = '' }) {
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

export function BotaoAcao({ title, onClick, perigo = false, children }) {
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

// Coluna dos botões de ação (acrescentar / renomear / remover), sempre a última à direita. Largura
// fixa = 3 botões (o nível 2 tem 2, alinhados à direita) pra as colunas de flag ficarem na mesma
// posição nos dois níveis.
const COLUNA_ACOES = 'ml-3 flex w-[76px] shrink-0 items-center justify-end gap-0.5';

// Largura da coluna de uma flag (combobox precisa de mais espaço que checkbox; `largura` sobrepõe
// pra opções de texto longo), com um respiro à esquerda separando uma coluna da outra.
const larguraFlag = (flag) => `ml-3 ${flag.largura || (flag.opcoes ? 'w-28' : 'w-[72px]')}`;

// Opções com `pai` dependem do valor da flag `requer` (o Cálculo da DRE, filtrado pela Origem).
const opcoesDaFlag = (flag, item) => flag.opcoes.filter((o) => !o.pai || o.pai === item[flag.requer]);

// Colunas de marcação (`flags`) à direita de uma linha: campo só nas flags do `nivel` da linha,
// espaço vazio nas outras (mantém as colunas alinhadas entre nível 1 e nível 2). Flag com
// `opcoes` é combobox (valor ou null), habilitada só quando a flag `requer` está marcada (ou
// escolhida, se também for combobox); as demais são checkbox. `travadaMotivo(flag)` devolve o texto de por que está travada, ou null.
function ColunasFlags({ flags, nivel, item, onDefinir, travadaMotivo = () => null }) {
  return flags.map((flag) => {
    const largura = larguraFlag(flag);
    if (flag.nivel && flag.nivel !== nivel) return <span key={flag.campo} className={`${largura} shrink-0`} />;
    const substituto = flag.substituir?.(item, (valor) => onDefinir(flag, valor));
    if (substituto) {
      return (
        <span key={flag.campo} className={`flex ${largura} shrink-0 justify-center`} onClick={(e) => e.stopPropagation()}>
          {substituto}
        </span>
      );
    }
    const motivo = travadaMotivo(flag) || (flag.requer && !item[flag.requer] ? requerTexto(flags, flag.requer) : null);
    if (flag.opcoes) {
      const vazio = !item[flag.campo];
      const opcoes = opcoesDaFlag(flag, item);
      const escolhida = opcoes.find((o) => o.value === item[flag.campo]);
      return (
        <span key={flag.campo} className={`flex ${largura} shrink-0 justify-center`} onClick={(e) => e.stopPropagation()}>
          <select
            value={item[flag.campo] || ''}
            disabled={!!motivo}
            onChange={(e) => onDefinir(flag, e.target.value || null)}
            title={motivo || escolhida?.label || flag.label}
            className={`w-full rounded-md border px-1.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300 ${
              vazio ? 'border-amber-200 bg-amber-50 text-gray-400' : 'border-primary-100 bg-primary-50 text-gray-900'
            }`}
          >
            <option value="">Selecione...</option>
            {opcoes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </span>
      );
    }
    return (
      <span key={flag.campo} className={`flex ${largura} shrink-0 justify-center`} onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={!!item[flag.campo]}
          disabled={!!motivo}
          onChange={() => onDefinir(flag, !item[flag.campo])}
          title={motivo || flag.label}
          className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-40"
        />
      </span>
    );
  });
}

function requerTexto(flags, campo) {
  const requerida = flags.find((f) => f.campo === campo);
  return `${requerida?.opcoes ? 'Escolha' : 'Marque'} ${requerida?.label || campo} antes`;
}

// Linha azul que marca onde o item arrastado vai cair.
export function Indicador({ recuo = false, embaixo = false }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute right-2 z-10 h-0.5 rounded-full bg-primary-500 ${recuo ? 'left-20' : 'left-2'} ${
        embaixo ? '-bottom-px' : '-top-px'
      }`}
    />
  );
}

// Editor da estrutura de máscaras de um demonstrativo em 2 níveis — usado por Operações > DFC
// Construtoras > Máscaras (DfcMascarasTab.jsx) e Operações > DRE Gerencial > Máscaras
// (DreGerencial/MascarasTab.jsx), que só mudam a API (`api`: listar/criar/renomear/remover/
// reordenar, todas recebendo o empresaId primeiro; atualizar recebe campos parciais), o
// `modeloSugerido` e os textos. Visual de
// drilldown igual à grade de Saldos das Contas (SaldosContasTab.jsx — linha cinza com +/- e
// contador no nível 1, linhas brancas recuadas no nível 2). Tudo se reordena arrastando, com o
// drag-and-drop nativo do navegador (mesmo esquema do Kanban do Plano de Voo): um item de nível 2
// pode ir pra outro grupo ou virar nível 1, e um nível 1 sem filhos pode entrar num grupo.
// Cada mudança salva na hora (reordenação regrava a árvore inteira — ver dfcMascaras.service.js).
//
// `flags` (opcional, só a DRE usa): marcações, cada uma uma coluna à direita — `{ campo, label,
// title, nivel, semFilhos, opcoes, requer }`, com o campo só nas linhas do `nivel` (1 ou 2; sem
// `nivel`, nos dois).
// Checkbox, ou combobox quando tem `opcoes` ([{ value, label, pai }]); `requer` = campo de outra
// flag que precisa estar marcada/escolhida (desmarcá-la limpa esta — o backend faz o mesmo). Opção
// com `pai` só aparece quando a flag `requer` vale `pai`, e trocar aquela limpa esta. `largura`
// (classe Tailwind, opcional) alarga a coluna; `substituir(item, definir)` (opcional) devolve o que
// mostrar na célula no lugar do campo (ex.: um botão; `definir(valor)` grava a flag), ou null pra
// mostrar o campo; `junto(valor)` (opcional) devolve outros campos que mudam junto na tela (o que o
// backend também muda no mesmo UPDATE). Com `semFilhos` (só nível 1), o grupo marcado não tem drilldown nem nível 2 (a
// Totaliza da DRE): não abre,
// não recebe item arrastado e a marcação fica travada enquanto ele tiver filhos.
//
// `ref` expõe `abrirNova()` pro botão "Nova máscara" do topo da página (mesmo padrão de
// CategoriasOrcamentoTab na DRE).
const MascarasArvoreEditor = forwardRef(function MascarasArvoreEditor(
  { empresaId, api, modeloSugerido, demonstrativo, exemploNivel1, flags = [] },
  ref
) {
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
    api.listar(empresaId)
      .then(setArvore)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar as máscaras.'))
      .finally(() => setCarregando(false));
  }, [empresaId, api]);

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

  // Grupo marcado com uma flag `semFilhos` (Totalizadora): sem drilldown, sem nível 2.
  const fechado = (grupo) => flags.some((f) => f.semFilhos && grupo[f.campo]);

  function alternarGrupo(id) {
    setAbertos((atual) => (atual.includes(id) ? atual.filter((v) => v !== id) : [...atual, id]));
  }

  // ------------------------------------------------------------------ criar / renomear / remover
  async function criar(parentId, descricoes, continuar) {
    const criados = await salvar(() => api.criar(empresaId, { parentId, descricoes }));
    if (!criados) return;
    setArvore((atual) =>
      parentId === null
        ? [...atual, ...criados.map((c) => ({ ...c, filhos: [] }))]
        : atual.map((g) =>
            g.id === parentId ? { ...g, filhos: [...g.filhos, ...criados] } : g
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
    await salvar(() => api.atualizar(empresaId, id, { descricao }));
  }

  // `item` é um grupo (nível 1) ou um filho (nível 2) — vale pros dois. Desmarcar uma flag limpa
  // as que dependem dela (`requer`); trocar o valor limpa as que filtram as opções por ela (`pai`).
  async function definirFlag(item, flag, valor) {
    const dependentes = Object.fromEntries(
      flags
        .filter((f) => f.requer === flag.campo && (!valor || f.opcoes?.some((o) => o.pai)))
        .map((f) => [f.campo, null])
    );
    const trocar = (x) => (x.id === item.id ? { ...x, [flag.campo]: valor, ...dependentes, ...flag.junto?.(valor) } : x);
    setArvore((atual) => atual.map((g) => ({ ...trocar(g), filhos: g.filhos.map(trocar) })));
    if (valor && flag.semFilhos) {
      setAbertos((atual) => atual.filter((v) => v !== item.id));
      if (criando?.parentId === item.id) setCriando(null);
    }
    await salvar(() => api.atualizar(empresaId, item.id, { [flag.campo]: valor }));
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
    await salvar(() => api.remover(empresaId, item.id));
  }

  async function usarModelo() {
    await salvar(async () => {
      const grupos = await api.criar(empresaId, {
        parentId: null,
        descricoes: modeloSugerido.map((g) => g.descricao),
      });
      for (let i = 0; i < grupos.length; i += 1) {
        await api.criar(empresaId, { parentId: grupos[i].id, descricoes: modeloSugerido[i].filhos });
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
    else if (podeSerFilho && grupo.id !== arrastado.id && !fechado(grupo)) mirar(e, { parentId: grupo.id, index: 0 });
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
    const nova = aplicarMovimento(arvore, item, destino, flags);
    if (!nova) return;
    setArvore(nova);
    if (destino.parentId !== null) setAbertos((atual) => (atual.includes(destino.parentId) ? atual : [...atual, destino.parentId]));
    const estrutura = nova.map((g) => ({ id: g.id, filhos: g.filhos.map((f) => f.id) }));
    const salva = await salvar(() => api.reordenar(empresaId, estrutura));
    if (salva) setArvore(salva);
  }

  const marca = (parentId, index) => alvo && alvo.parentId === parentId && alvo.index === index;

  // ------------------------------------------------------------------ renderização
  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Tags size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para montar as máscaras da {demonstrativo}.</p>
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
      ) : (
        <div
          onDragOver={(e) => arrastado && e.preventDefault()}
          onDrop={soltar}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setAlvo(null);
          }}
        >
          <div
            className={`sticky -top-6 z-20 flex items-center gap-2 rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 text-xs font-medium uppercase tracking-wide text-blue-700 ${
              flags.length ? 'pr-2' : 'pr-4'
            }`}
          >
            <span className="flex-1">Nível 1 / Nível 2</span>
            {/* Agrupadas sem o gap-2 da linha, igual às colunas das linhas (ColunasFlags dentro de um
                span) — senão cada coluna do cabeçalho fica 8px mais à esquerda que a anterior. */}
            <span className="flex shrink-0 items-center">
              {flags.map((flag) => (
                <span
                  key={flag.campo}
                  title={flag.title}
                  className={`${larguraFlag(flag)} shrink-0 ${flag.opcoes ? 'pl-2 text-left' : 'text-center'}`}
                >
                  {flag.label}
                </span>
              ))}
            </span>
            {flags.length > 0 && <span className={COLUNA_ACOES} />}
          </div>

          {/* Cabeçalho sempre visível, mesmo sem nenhuma máscara (pedido do usuário). */}
          {vazio && !criando && (
            <div className="flex flex-col items-center gap-1 border-b border-gray-100 py-12 text-center">
              <Tags size={26} className="mb-1 text-gray-300" />
              <p className="text-sm text-gray-600">Nenhuma máscara da {demonstrativo} cadastrada ainda.</p>
              <p className="max-w-md text-xs text-gray-400">
                Crie as máscaras de nível 1 (ex.: {exemploNivel1}) e, dentro de cada uma, as de nível 2. Ou comece pelo
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
          )}

          {arvore.map((grupo, i) => {
            const semDrilldown = fechado(grupo);
            const aberto = !semDrilldown && abertos.includes(grupo.id);
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
                  onClick={() => !semDrilldown && alternarGrupo(grupo.id)}
                  onDoubleClick={() => setEditandoId(grupo.id)}
                  className={`group/linha relative flex items-center gap-2 border-b border-gray-200 py-2.5 pl-1.5 pr-2 ${
                    semDrilldown ? '' : 'cursor-pointer'
                  } ${
                    recebendo ? 'bg-primary-50 ring-1 ring-inset ring-primary-300' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  {marca(null, i) && <Indicador />}
                  <GripVertical size={14} className="shrink-0 cursor-grab text-gray-300 group-hover/linha:text-gray-500" />
                  {semDrilldown ? (
                    <span
                      title="Totaliza — sem máscaras de nível 2"
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-gray-200 text-gray-600"
                    >
                      <Sigma size={10} />
                    </span>
                  ) : (
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                      {aberto ? <Minus size={10} /> : <Plus size={10} />}
                    </span>
                  )}
                  {editandoId === grupo.id ? (
                    <CampoNome
                      valorInicial={grupo.descricao}
                      onSalvar={(texto) => renomear(grupo.id, texto)}
                      onCancelar={() => setEditandoId(null)}
                      className="font-semibold"
                    />
                  ) : (
                    <span className="min-w-0 break-words text-xs font-semibold text-gray-900" title={grupo.descricao}>
                      {grupo.descricao}
                    </span>
                  )}
                  {!semDrilldown && (
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                      {grupo.filhos.length}
                    </span>
                  )}
                  <span className="ml-auto flex shrink-0 items-center">
                    <ColunasFlags
                      flags={flags}
                      nivel={1}
                      item={grupo}
                      onDefinir={(flag, valor) => definirFlag(grupo, flag, valor)}
                      travadaMotivo={(flag) =>
                        flag.semFilhos && !grupo[flag.campo] && grupo.filhos.length > 0
                          ? `Remova ou mova as máscaras de nível 2 antes de marcar ${flag.label}`
                          : null
                      }
                    />
                  </span>
                  <span className={`${COLUNA_ACOES} opacity-0 transition-opacity group-hover/linha:opacity-100`}>
                    {!semDrilldown && (
                      <BotaoAcao
                        title="Adicionar máscara de nível 2"
                        onClick={() => {
                          setAbertos((atual) => (atual.includes(grupo.id) ? atual : [...atual, grupo.id]));
                          setCriando({ parentId: grupo.id });
                        }}
                      >
                        <Plus size={14} />
                      </BotaoAcao>
                    )}
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
                        <span className="min-w-0 flex-1 break-words text-xs font-medium text-gray-800" title={filho.descricao}>
                          {filho.descricao}
                        </span>
                      )}
                      <span className="ml-auto flex shrink-0 items-center">
                        <ColunasFlags flags={flags} nivel={2} item={filho} onDefinir={(flag, valor) => definirFlag(filho, flag, valor)} />
                      </span>
                      <span className={`${COLUNA_ACOES} opacity-0 transition-opacity group-hover/linha:opacity-100`}>
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
          {!(vazio && !criando) && (
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
          )}
        </div>
      )}
    </div>
  );
});

MascarasArvoreEditor.displayName = 'MascarasArvoreEditor';

export default MascarasArvoreEditor;
