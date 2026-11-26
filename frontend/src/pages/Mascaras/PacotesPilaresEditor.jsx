import { useCallback, useEffect, useState } from 'react';
import { Boxes, Check, Columns3, GripVertical, Loader2, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import Button from '../../components/Button';
import SearchableSelect from '../../components/SearchableSelect';
import { useConfirm } from '../../confirm/ConfirmContext';
import {
  createMascaraItens,
  deleteMascaraItem,
  listMascaras,
  listResponsaveisMascara,
  reordenarMascara,
  updateMascaraItem,
} from '../../api/mascaras.api';
import { BotaoAcao, CampoNome, Indicador } from '../../components/MascarasArvoreEditor';

// Cadastros > Máscaras > Pacotes / Pilares (pedido do usuário, 26/11/2026): a mesma tabela das Etapas do Centro
// de Custo (EtapasCentroCustoEditor.jsx — cabeçalho azul, linhas cinza, arrastar pra reordenar, duplo clique
// renomeia, colar várias linhas cria várias, status de salvamento), com o Responsável de cada item num seletor à
// direita (usuário ativo com acesso à empresa). O pacote fica no cadastro das contas do plano financeiro e o pilar
// no dos centros de custo; os dois, com o responsável, formam a Gestão Matricial do dashboard Econômico/Financeiro.
// Cada mudança salva na hora (rotas genéricas de mascara_itens — mascaras.routes.js).
const TEXTOS = {
  PACOTES: {
    titulo: 'Pacotes',
    novo: 'Novo pacote',
    primeiro: 'Criar o primeiro pacote',
    vazio: 'Nenhum pacote cadastrado ainda.',
    dica: 'Crie os pacotes de gasto (ex.: Pessoal, Utilitários, Marketing) e escolha o responsável de cada um. O pacote de cada conta é escolhido em Cadastros › Planos Financeiros.',
    remover: 'As contas do plano financeiro com este pacote ficam sem pacote.',
    icone: Boxes,
  },
  PILARES: {
    titulo: 'Pilares',
    novo: 'Novo pilar',
    primeiro: 'Criar o primeiro pilar',
    vazio: 'Nenhum pilar cadastrado ainda.',
    dica: 'Crie os pilares (ex.: Obras, Landbank, ADM / FIN) e escolha o responsável de cada um. O pilar de cada centro de custo é escolhido em Cadastros › Centros de Custos.',
    remover: 'Os centros de custo com este pilar ficam sem pilar.',
    icone: Columns3,
  },
};

export default function PacotesPilaresEditor({ tipo, empresaId, aviso }) {
  const t = TEXTOS[tipo];
  const confirm = useConfirm();
  const [itens, setItens] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');

  // Status de salvamento (mesmo indicador das Etapas e da aba Máscaras da DFC).
  const [pendentes, setPendentes] = useState(0);
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);

  // criando: null | { chave } (a chave recria o campo depois de salvar com Enter). editandoId: item sendo renomeado.
  const [criando, setCriando] = useState(null);
  const [editandoId, setEditandoId] = useState(null);

  // arrastado: id do item. alvo: posição (0..n) onde ele vai cair.
  const [arrastado, setArrastado] = useState(null);
  const [alvo, setAlvo] = useState(null);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    listMascaras(tipo, empresaId)
      .then(setItens)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar a lista.'))
      .finally(() => setCarregando(false));
  }, [tipo, empresaId]);

  useEffect(() => {
    setItens([]);
    setCriando(null);
    setEditandoId(null);
    setErroSalvar('');
    setSalvoAlgumaVez(false);
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!empresaId) return undefined;
    let vivo = true;
    listResponsaveisMascara(empresaId)
      .then((lista) => vivo && setResponsaveis(lista))
      .catch(() => vivo && setResponsaveis([]));
    return () => {
      vivo = false;
    };
  }, [empresaId]);

  const opcoesResponsaveis = responsaveis.map((u) => ({ value: String(u.id), label: u.nome }));

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

  // ------------------------------------------------------------------ criar / renomear / responsável / remover
  async function criar(descricoes, continuar) {
    const criados = await salvar(() => createMascaraItens(tipo, Number(empresaId), descricoes));
    if (!criados) return;
    setItens((atual) => [...atual, ...criados]);
    // Depois de criar com Enter já abre o campo do próximo.
    setCriando(continuar ? { chave: Date.now() } : null);
  }

  // O PUT genérico regrava a descrição sempre — manda a atual junto quando só muda o responsável.
  async function renomear(item, descricao) {
    setEditandoId(null);
    setItens((atual) => atual.map((i) => (i.id === item.id ? { ...i, descricao } : i)));
    await salvar(() => updateMascaraItem(item.id, { descricao, sla_dias: null }));
  }

  async function mudarResponsavel(item, valor) {
    const responsavelId = valor ? Number(valor) : null;
    if (responsavelId === (item.responsavel_id ?? null)) return;
    setItens((atual) => atual.map((i) => (i.id === item.id ? { ...i, responsavel_id: responsavelId } : i)));
    await salvar(() => updateMascaraItem(item.id, { descricao: item.descricao, sla_dias: null, responsavel_id: responsavelId }));
  }

  async function remover(item) {
    const confirmado = await confirm({
      title: `Remover ${tipo === 'PACOTES' ? 'pacote' : 'pilar'}`,
      description: `Remover "${item.descricao || 'Sem nome'}"? ${t.remover}`,
      confirmLabel: 'Remover',
      variant: 'danger',
    });
    if (!confirmado) return;
    setItens((atual) => atual.filter((i) => i.id !== item.id));
    const ok = await salvar(() => deleteMascaraItem(item.id).then(() => true));
    // O remover genérico renumera a sequência — recarrega pra ficar igual ao banco.
    if (ok) carregar();
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
    const origem = itens.findIndex((i) => i.id === id);
    const posicao = origem < destino ? destino - 1 : destino;
    if (origem === -1 || origem === posicao) return;
    const nova = [...itens];
    nova.splice(posicao, 0, nova.splice(origem, 1)[0]);
    setItens(nova);
    const salva = await salvar(() => reordenarMascara(tipo, Number(empresaId), nova.map((i) => i.id)));
    if (salva) setItens(salva);
  }

  // ------------------------------------------------------------------ renderização
  const statusSalvamento = pendentes > 0 ? 'salvando' : erroSalvar ? 'erro' : salvoAlgumaVez ? 'salvo' : null;
  const vazio = !carregando && !erroCarga && itens.length === 0;
  const Icone = t.icone;

  return (
    <div>
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

      {carregando && itens.length === 0 ? (
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
            <span>{t.titulo}</span>
            <span className="flex items-center gap-4">
              <span className="hidden normal-case tracking-normal text-blue-500 lg:inline">
                Arraste pelas linhas para reordenar · duplo clique renomeia
              </span>
              {/* rótulo da coluna do seletor de cada linha: a largura dele (w-64) + o espaço dos dois botões (2 × 1,5rem
                  + 0,125rem) menos a diferença de margem direita do cabeçalho (pr-4) para a linha (pr-2) */}
              {itens.length > 0 && (
                <span className="flex items-center gap-2">
                  <span className="w-64 text-left">Responsável</span>
                  <span className="w-10.5" />
                </span>
              )}
            </span>
          </div>

          {/* Cabeçalho sempre visível, mesmo sem nenhum item (mesmo esquema das Etapas). */}
          {vazio && !criando && (
            <div className="flex flex-col items-center gap-1 border-b border-gray-100 py-12 text-center">
              <Icone size={26} className="mb-1 text-gray-300" />
              <p className="text-sm text-gray-600">{t.vazio}</p>
              <p className="max-w-md text-xs text-gray-400">{t.dica} Colar várias linhas cria um por linha.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={() => setCriando({ chave: Date.now() })}>
                  <Plus size={16} />
                  {t.primeiro}
                </Button>
              </div>
            </div>
          )}

          {itens.map((item, i) => (
            <div
              key={item.id}
              draggable={editandoId !== item.id}
              onDragStart={(e) => iniciarArraste(e, item.id)}
              onDragEnd={encerrarArraste}
              onDragOver={(e) => mirarLinha(e, i)}
              onDoubleClick={() => setEditandoId(item.id)}
              className={`group/linha relative flex items-center gap-2 border-b border-gray-200 bg-gray-50 py-2 pl-1.5 pr-2 hover:bg-gray-100 ${
                arrastado === item.id ? 'opacity-40' : ''
              }`}
            >
              {alvo === i && <Indicador />}
              <GripVertical size={14} className="shrink-0 cursor-grab text-gray-300 group-hover/linha:text-gray-500" />
              {editandoId === item.id ? (
                <CampoNome
                  valorInicial={item.descricao}
                  onSalvar={(texto) => renomear(item, texto)}
                  onCancelar={() => setEditandoId(null)}
                  className="font-semibold"
                />
              ) : (
                <span className="min-w-0 truncate text-xs font-semibold text-gray-900" title={item.descricao}>
                  {item.descricao || <span className="font-normal italic text-gray-400">Sem nome</span>}
                </span>
              )}
              {/* Seletor do responsável: arrastar começa na linha, não nele; duplo clique nele não renomeia. */}
              <div
                className="ml-auto w-64 shrink-0"
                draggable={false}
                onDragStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <SearchableSelect
                  value={item.responsavel_id ? String(item.responsavel_id) : ''}
                  onChange={(v) => mudarResponsavel(item, v)}
                  options={opcoesResponsaveis}
                  compacto
                  placeholder="Selecione o responsável"
                  emptyMessage="Nenhum usuário ativo com acesso a esta empresa."
                  corClasses={item.responsavel_id ? 'border-primary-100 bg-primary-50 hover:border-primary-500' : 'border-amber-300 bg-amber-50 hover:border-amber-400'}
                />
              </div>
              <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/linha:opacity-100">
                <BotaoAcao title="Renomear" onClick={() => setEditandoId(item.id)}>
                  <Pencil size={13} />
                </BotaoAcao>
                <BotaoAcao title="Remover" perigo onClick={() => remover(item)}>
                  <Trash2 size={13} />
                </BotaoAcao>
              </span>
            </div>
          ))}

          {/* Fim da lista: novo item (e alvo pra soltar no fim) */}
          {!(vazio && !criando) && (
            <div onDragOver={(e) => mirar(e, itens.length)} className="relative px-2 py-2">
              {alvo === itens.length && <Indicador />}
              {criando ? (
                <CampoNome
                  key={criando.chave}
                  placeholder="Nome — Enter salva e abre o próximo, Esc cancela (cole várias linhas para criar várias)"
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
                  {t.novo}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
