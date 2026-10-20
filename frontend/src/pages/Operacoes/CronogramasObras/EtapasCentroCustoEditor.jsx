import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Check, GripVertical, Loader2, Milestone, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import Button from '../../../components/Button';
import { useConfirm } from '../../../confirm/ConfirmContext';
import {
  createEtapasCentroCusto,
  listEtapasCentroCusto,
  removeEtapaCentroCusto,
  reordenarEtapasCentroCusto,
  updateEtapaCentroCusto,
} from '../../../api/etapasCentroCusto.api';
import { corPadrao } from '../../../utils/coresPadrao';
import { BotaoAcao, CampoNome, Indicador } from '../DfcConstrutoras/DfcMascarasTab';

// Painel padrão: embaixo da aba ativa (Cronogramas Obras). Em Cadastros > Máscaras o editor já
// está dentro de um Card, então lá vem sem quadro.
const QUADRO_ABA = 'rounded-card rounded-tl-none bg-white p-5 shadow-card';

// Editor da máscara "Etapas do Centro de Custo" — a lista única de etapas de obra da empresa
// (pedido do usuário), usada na aba Etapas de Operações > Cronogramas Obras e em Cadastros >
// Máscaras: editar num lugar muda no outro, no Histórico de Etapas dos centros de custo e no
// cronograma das obras. Igual à aba Máscaras da DFC (DfcMascarasTab.jsx: mesmo quadro, cabeçalho
// azul, linha cinza do nível 1, arrastar pra reordenar, duplo clique renomeia, colar várias linhas
// cria várias), mas num nível só: sem grupos, sem +/- e sem contador. Cada etapa tem a sua cor —
// bolinha de input[type=color], mesmo seletor do ConfigurarFiltrosModal.jsx dos Repasses CEF; etapa
// nova nasce com a cor da paleta padrão pela posição. Cada mudança salva na hora (reordenação
// regrava a lista inteira — ver etapasCentroCusto.service.js).
//
// `ref` expõe `abrirNova()` pro botão "Nova etapa" do topo da página (mesmo padrão do "Nova
// máscara" da DFC). `aviso`: texto curto acima da lista (de onde mais a lista é editada).
const EtapasCentroCustoEditor = forwardRef(function EtapasCentroCustoEditor(
  { empresaId, aviso, className = QUADRO_ABA },
  ref
) {
  const confirm = useConfirm();
  const [etapas, setEtapas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');

  // Status de salvamento (mesmo indicador da aba Máscaras).
  const [pendentes, setPendentes] = useState(0);
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);

  // criando: null | { chave } (a chave recria o campo depois de salvar com Enter). editandoId: id
  // da etapa sendo renomeada.
  const [criando, setCriando] = useState(null);
  const [editandoId, setEditandoId] = useState(null);

  // arrastado: id da etapa. alvo: posição (0..n) onde ela vai cair.
  const [arrastado, setArrastado] = useState(null);
  const [alvo, setAlvo] = useState(null);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    listEtapasCentroCusto(empresaId)
      .then(setEtapas)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar as etapas.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setEtapas([]);
    setCriando(null);
    setEditandoId(null);
    setErroSalvar('');
    setSalvoAlgumaVez(false);
    carregar();
  }, [carregar]);

  useImperativeHandle(ref, () => ({ abrirNova: () => setCriando({ chave: Date.now() }) }), []);

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

  // ------------------------------------------------------------------ criar / renomear / remover
  async function criar(descricoes, continuar) {
    const cores = descricoes.map((_, i) => corPadrao(etapas.length + i));
    const criadas = await salvar(() => createEtapasCentroCusto(empresaId, descricoes, cores));
    if (!criadas) return;
    setEtapas((atual) => [...atual, ...criadas]);
    // Depois de criar com Enter já abre o campo da próxima etapa.
    setCriando(continuar ? { chave: Date.now() } : null);
  }

  async function renomear(id, descricao) {
    setEditandoId(null);
    setEtapas((atual) => atual.map((e) => (e.id === id ? { ...e, descricao } : e)));
    await salvar(() => updateEtapaCentroCusto(empresaId, id, { descricao }));
  }

  // O seletor de cor do navegador dispara a cada movimento enquanto está aberto — a tela muda na
  // hora, mas só grava quando a cor para de mudar (um pedido por etapa, não um por movimento).
  const timersCor = useRef({});
  function mudarCor(id, cor) {
    setEtapas((atual) => atual.map((e) => (e.id === id ? { ...e, cor } : e)));
    clearTimeout(timersCor.current[id]);
    timersCor.current[id] = setTimeout(() => {
      delete timersCor.current[id];
      salvar(() => updateEtapaCentroCusto(empresaId, id, { cor }));
    }, 400);
  }

  async function remover(etapa) {
    const confirmado = await confirm({
      title: 'Remover etapa',
      description: `Remover "${etapa.descricao || 'Sem nome'}"? As datas dessa etapa no cronograma das obras (Cronogramas Obras > Centros de Custos) também serão apagadas.`,
      confirmLabel: 'Remover',
      variant: 'danger',
    });
    if (!confirmado) return;
    setEtapas((atual) => atual.filter((e) => e.id !== etapa.id));
    await salvar(() => removeEtapaCentroCusto(empresaId, etapa.id));
  }

  // ------------------------------------------------------------------ arrastar e soltar
  function iniciarArraste(e, id) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(id));
    // adia pra o navegador capturar a "foto" da linha antes de esmaecer a original
    requestAnimationFrame(() => setArrastado(id));
  }

  function encerrarArraste() {
    setArrastado(null);
    setAlvo(null);
  }

  function mirar(e, index) {
    if (arrastado === null) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (alvo !== index) setAlvo(index);
  }

  // Metade de cima da linha = antes dela; metade de baixo = depois.
  function mirarLinha(e, i) {
    const r = e.currentTarget.getBoundingClientRect();
    mirar(e, e.clientY < r.top + r.height / 2 ? i : i + 1);
  }

  async function soltar(e) {
    e.preventDefault();
    const id = arrastado;
    const destino = alvo;
    encerrarArraste();
    if (id === null || destino === null) return;
    const origem = etapas.findIndex((et) => et.id === id);
    const posicao = origem < destino ? destino - 1 : destino;
    if (origem === -1 || origem === posicao) return;
    const nova = [...etapas];
    nova.splice(posicao, 0, nova.splice(origem, 1)[0]);
    setEtapas(nova);
    const salva = await salvar(() => reordenarEtapasCentroCusto(empresaId, nova.map((et) => et.id)));
    if (salva) setEtapas(salva);
  }

  // ------------------------------------------------------------------ renderização
  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Milestone size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para cadastrar as etapas.</p>
      </div>
    );
  }

  const statusSalvamento = pendentes > 0 ? 'salvando' : erroSalvar ? 'erro' : salvoAlgumaVez ? 'salvo' : null;
  const vazio = !carregando && !erroCarga && etapas.length === 0;

  return (
    <div className={className}>
      {(aviso || statusSalvamento) && (
        <div className="-mt-1 mb-3 flex items-center justify-between gap-3 text-xs" aria-live="polite">
          <span className="text-gray-400">{aviso}</span>
          {!statusSalvamento ? null : statusSalvamento === 'salvando' ? (
            <span className="flex shrink-0 items-center gap-1.5 text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Salvando...
            </span>
          ) : statusSalvamento === 'erro' ? (
            <span className="flex shrink-0 items-center gap-1.5 text-red-600" title={erroSalvar}>
              <TriangleAlert size={14} /> Erro ao salvar
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5 text-emerald-600">
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

      {carregando && etapas.length === 0 ? (
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
          onDragOver={(e) => arrastado !== null && e.preventDefault()}
          onDrop={soltar}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setAlvo(null);
          }}
        >
          <div className="sticky -top-6 z-20 flex items-center justify-between rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700">
            <span>Etapas</span>
            <span className="hidden normal-case tracking-normal text-blue-500 sm:inline">
              Arraste pelas linhas para reordenar · duplo clique renomeia · clique na cor para trocar
            </span>
          </div>

          {/* Cabeçalho sempre visível, mesmo sem nenhuma etapa (mesmo esquema das Máscaras). */}
          {vazio && !criando && (
            <div className="flex flex-col items-center gap-1 border-b border-gray-100 py-12 text-center">
              <Milestone size={26} className="mb-1 text-gray-300" />
              <p className="text-sm text-gray-600">Nenhuma etapa cadastrada ainda.</p>
              <p className="max-w-md text-xs text-gray-400">
                Crie as etapas da obra (ex.: Lançamento, Construção, Entrega) na ordem em que acontecem. Dá pra reordenar arrastando
                depois, e colar várias linhas cria uma etapa por linha.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={() => setCriando({ chave: Date.now() })}>
                  <Plus size={16} />
                  Criar a primeira etapa
                </Button>
              </div>
            </div>
          )}

          {etapas.map((etapa, i) => (
            <div
              key={etapa.id}
              draggable={editandoId !== etapa.id}
              onDragStart={(e) => iniciarArraste(e, etapa.id)}
              onDragEnd={encerrarArraste}
              onDragOver={(e) => mirarLinha(e, i)}
              onDoubleClick={() => setEditandoId(etapa.id)}
              className={`group/linha relative flex items-center gap-2 border-b border-gray-200 bg-gray-50 py-2.5 pl-1.5 pr-2 hover:bg-gray-100 ${
                arrastado === etapa.id ? 'opacity-40' : ''
              }`}
            >
              {alvo === i && <Indicador />}
              <GripVertical size={14} className="shrink-0 cursor-grab text-gray-300 group-hover/linha:text-gray-500" />
              <input
                type="color"
                value={etapa.cor || corPadrao(i)}
                onChange={(e) => mudarCor(etapa.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                title={`Cor da etapa "${etapa.descricao || 'Sem nome'}"`}
                aria-label={`Cor da etapa ${etapa.descricao || 'Sem nome'}`}
                className="h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border border-gray-200 p-0"
              />
              {editandoId === etapa.id ? (
                <CampoNome
                  valorInicial={etapa.descricao}
                  onSalvar={(texto) => renomear(etapa.id, texto)}
                  onCancelar={() => setEditandoId(null)}
                  className="font-semibold"
                />
              ) : (
                <span className="min-w-0 truncate text-xs font-semibold text-gray-900" title={etapa.descricao}>
                  {etapa.descricao || <span className="font-normal italic text-gray-400">Sem nome</span>}
                </span>
              )}
              <span className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/linha:opacity-100">
                <BotaoAcao title="Renomear" onClick={() => setEditandoId(etapa.id)}>
                  <Pencil size={13} />
                </BotaoAcao>
                <BotaoAcao title="Remover" perigo onClick={() => remover(etapa)}>
                  <Trash2 size={13} />
                </BotaoAcao>
              </span>
            </div>
          ))}

          {/* Fim da lista: nova etapa (e alvo pra soltar no fim) */}
          {!(vazio && !criando) && (
            <div onDragOver={(e) => mirar(e, etapas.length)} className="relative px-2 py-2">
              {alvo === etapas.length && <Indicador />}
              {criando ? (
                <CampoNome
                  key={criando.chave}
                  placeholder="Nome da etapa — Enter salva e abre a próxima, Esc cancela (cole várias linhas para criar várias)"
                  onSalvar={(texto, viaEnter) => criar([texto], viaEnter)}
                  onCancelar={() => setCriando(null)}
                  onColarVarias={(linhas) => criar(linhas, false)}
                  className="font-semibold"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setCriando({ chave: Date.now() })}
                  className="flex w-full items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-500 transition hover:border-primary-500 hover:text-primary-600"
                >
                  <Plus size={14} />
                  Nova etapa
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

EtapasCentroCustoEditor.displayName = 'EtapasCentroCustoEditor';

export default EtapasCentroCustoEditor;
