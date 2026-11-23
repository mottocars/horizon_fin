import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronRight, GripVertical, Layers, Loader2, Pencil, Trash2, TriangleAlert, X } from 'lucide-react';
import { Indicador } from '../../../components/MascarasArvoreEditor';
import SearchableSelect from '../../../components/SearchableSelect';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { useLeituraDre } from './leituraDre';
import {
  atualizarAgrupadorDre,
  criarAgrupadorDre,
  excluirAgrupadorDre,
  listAgrupadoresDre,
  listCentrosCustoDre,
  moverCentroDre,
  reordenarCentrosCustoDre,
  updateCentroCustoDre,
} from '../../../api/dreCentros.api';

// Mesmas opções do Tipo da aba Centros Custos da DFC (DfcCentrosTab.jsx).
const NATUREZAS = [
  { value: 'OBRA', label: 'Obra' },
  { value: 'ADMINISTRATIVO', label: 'Administrativo' },
];
const ROTULO_NATUREZA = { OBRA: 'Obra', ADMINISTRATIVO: 'Administrativo' };

// Mesmo par de cores da DFC: em branco fica âmbar, preenchido fica azul claro.
function corCampo(valor) {
  return valor ? 'border-primary-100 bg-primary-50' : 'border-amber-300 bg-amber-50';
}

// Mesma grade no cabeçalho e nas linhas, pra a combobox e a caixa ficarem em coluna (Tipo com os
// mesmos 190px da DFC).
const GRADE = 'grid grid-cols-[minmax(0,1fr)_190px_100px] items-center gap-3';

const erroDe = (err, padrao) => err.response?.data?.message || padrao;

// Operações > DRE Gerencial > Centros Custos: mesma aba de DFC Construtoras > Centros Custos
// (DfcCentrosTab.jsx — pedido do usuário), com o Tipo e a flag "Realiza DRE" (sem Contrato Caixa e
// Código Prevision, que a DRE não usa). O Tipo é o MESMO campo do Tipo da DFC (centros_custo_sienge.
// natureza): alterou numa aba, muda na outra. Só os marcados aparecem nas abas seguintes (plano de contas
// próprio e Orçamento). Cada mudança salva na hora, com o mesmo indicador de salvamento da aba Máscaras.
// Ordem: arrastando a linha pela alça, como na aba Máscaras (drag-and-drop nativo, mesma linha azul de
// destino); grava a lista inteira na nova ordem. É a ordem das colunas na aba DRE. Arrasta também com a busca e o
// filtro de situação preenchidos (a posição na lista visível vira a posição na lista inteira).
//
// AGRUPADORES (pedido de 23/11/2026 — backend/src/modules/dre-agrupadores): um agrupador junta centros numa
// obra só (ex.: EASY = EASY 1 + EASY 2) e a DRE passa a ser montada por ele. Botão "Novo agrupador" no topo
// da página; arrastar um centro e soltar SOBRE o agrupador põe o centro nele; soltar entre dois centros do
// agrupador também; soltar fora tira. O agrupador se arrasta inteiro pela alça dele. O "Realiza DRE" é o do
// agrupador (vale pros centros dele). Quando o centro e o agrupador têm projeção, a tela pergunta qual fica.
const CentrosCustosTab = forwardRef(function CentrosCustosTab({ empresaId, search, situacao = 'ATIVOS' }, ref) {
  const [centros, setCentros] = useState([]);
  const [agrupadores, setAgrupadores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');

  const [pendentes, setPendentes] = useState(0);
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);
  // Arraste: { tipo: 'centro' | 'grupo', id } e o destino — { posicao } (entre linhas) ou { grupo } (sobre o agrupador).
  const [arrastado, setArrastado] = useState(null);
  const [alvo, setAlvo] = useState(null);

  const [novoNome, setNovoNome] = useState(null); // null = fechado
  const [editando, setEditando] = useState(null); // { id, nome }
  const [excluindo, setExcluindo] = useState(null); // agrupador
  const [escolha, setEscolha] = useState(null); // { opcoes, repetir(projecaoFica) }
  const novoRef = useRef(null);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    Promise.all([listCentrosCustoDre(empresaId), listAgrupadoresDre(empresaId)])
      .then(([c, a]) => {
        setCentros(c);
        setAgrupadores(a);
      })
      .catch((err) => setErroCarga(erroDe(err, 'Não foi possível carregar os centros de custo.')))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setCentros([]);
    setAgrupadores([]);
    setErroSalvar('');
    setSalvoAlgumaVez(false);
    setNovoNome(null);
    carregar();
  }, [carregar]);

  useImperativeHandle(ref, () => ({
    abrirNovoAgrupador: () => {
      setNovoNome('');
      requestAnimationFrame(() => novoRef.current?.focus());
    },
  }));

  // Roda uma gravação com o indicador "Salvando / Alterações salvas"; erro vai pra faixa vermelha.
  async function gravar(fn, padrao) {
    setErroSalvar('');
    setPendentes((n) => n + 1);
    try {
      const r = await fn();
      setSalvoAlgumaVez(true);
      return r;
    } catch (err) {
      setErroSalvar(erroDe(err, padrao));
      throw err;
    } finally {
      setPendentes((n) => n - 1);
    }
  }

  // ------------------------------------------------------------------ linhas (agrupadores + centros)

  // Pedido do usuário (23/11): SEMPRE os agrupadores primeiro (os vazios no topo, onde a gente acabou de criar;
  // os outros na ordem do primeiro centro de cada um), cada um com os centros logo abaixo; depois os centros
  // fora de agrupador, na ordem da DRE. É a mesma ordem das colunas da DRE (agrupadores.service.unidades).
  const linhas = useMemo(() => {
    const porId = new Map(agrupadores.map((g) => [g.id, g]));
    const grupos = [];
    const soltos = [];
    agrupadores
      .filter((g) => !centros.some((c) => c.agrupador_id === g.id))
      .forEach((g) => grupos.push({ tipo: 'grupo', g, membros: [] }));
    const vistos = new Set();
    centros.forEach((c) => {
      const g = c.agrupador_id ? porId.get(c.agrupador_id) : null;
      if (!g) {
        soltos.push({ tipo: 'centro', c, g: null });
        return;
      }
      if (vistos.has(g.id)) return;
      vistos.add(g.id);
      const membros = centros.filter((x) => x.agrupador_id === g.id);
      grupos.push({ tipo: 'grupo', g, membros });
      membros.forEach((m) => grupos.push({ tipo: 'centro', c: m, g }));
    });
    return [...grupos, ...soltos];
  }, [centros, agrupadores]);

  // Drilldown dos agrupadores: fechados por padrão (pedido do usuário); com a busca, abrem sozinhos os que têm
  // centro achado.
  const [abertos, setAbertos] = useState(() => new Set());
  const alternar = (id) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const termo = search.trim().toLowerCase();
  const casa = (c) =>
    String(c.sienge_id).includes(termo) || c.name.toLowerCase().includes(termo) || (c.apelido || '').toLowerCase().includes(termo);
  const casaGrupo = (g) => g.nome.toLowerCase().includes(termo);
  // Situação (filtro ao lado do Buscar): 'ATIVOS' (padrão), 'INATIVOS' ou 'TODOS'.
  const situacaoOk = (c) => situacao === 'TODOS' || (situacao === 'INATIVOS') === (c.status !== 'ATIVO');
  // O centro passa nos filtros (situação e busca); dentro de agrupador cujo nome bate na busca, vale a situação.
  const centroOk = (c, g) => situacaoOk(c) && (!termo || casa(c) || (g && casaGrupo(g)));
  // Aberto = o usuário abriu, ou a busca achou um centro dentro dele.
  const aberto = (l) => abertos.has(l.g.id) || Boolean(termo && l.membros.some((m) => casa(m) && situacaoOk(m)));
  // Busca filtra TUDO (pedido do usuário): o agrupador só aparece se o nome dele ou algum centro dele bater. Na
  // situação, o agrupador some se nenhum centro dele for daquela situação (o vazio só aparece em Ativos e Todos,
  // e na busca só se o nome bater). Centros de agrupador fechado não aparecem.
  const visiveis = useMemo(() => {
    const grupoDe = new Map(linhas.filter((l) => l.tipo === 'grupo').map((l) => [l.g.id, l]));
    return linhas.filter((l) => {
      if (l.tipo === 'grupo') {
        const membros = l.membros.filter((m) => centroOk(m, l.g));
        if (termo) return casaGrupo(l.g) ? l.membros.length === 0 || l.membros.some(situacaoOk) : membros.length > 0;
        return l.membros.length ? membros.length > 0 : situacao !== 'INATIVOS';
      }
      if (l.g && !aberto(grupoDe.get(l.g.id))) return false;
      return centroOk(l.c, l.g);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, termo, situacao, abertos]);

  // ------------------------------------------------------------------ campos

  // Atualiza a linha na hora e grava só o campo mudado (`patch`: { realiza_dre } ou { natureza }); se
  // falhar, volta a linha pro que estava.
  async function alterar(centro, patch) {
    const novo = { ...centro, ...patch };
    setCentros((atual) => atual.map((c) => (c.sienge_id === centro.sienge_id ? novo : c)));
    try {
      const salvo = await gravar(() => updateCentroCustoDre(empresaId, centro.sienge_id, patch), 'Não foi possível salvar.');
      setCentros((atual) => atual.map((c) => (c.sienge_id === centro.sienge_id ? salvo : c)));
    } catch {
      setCentros((atual) => atual.map((c) => (c.sienge_id === centro.sienge_id ? centro : c)));
    }
  }

  async function criarAgrupador() {
    const nome = (novoNome || '').trim();
    if (!nome) return;
    try {
      const g = await gravar(() => criarAgrupadorDre(empresaId, nome), 'Não foi possível criar o agrupador.');
      setAgrupadores((atual) => [...atual, g]);
      setNovoNome(null);
    } catch {
      /* a faixa vermelha mostra o erro */
    }
  }

  async function renomear() {
    const { id, nome } = editando;
    const atual = agrupadores.find((g) => g.id === id);
    setEditando(null);
    if (!nome.trim() || nome.trim() === atual?.nome) return;
    try {
      const g = await gravar(() => atualizarAgrupadorDre(empresaId, id, { nome: nome.trim() }), 'Não foi possível renomear o agrupador.');
      setAgrupadores((lista) => lista.map((x) => (x.id === id ? g : x)));
    } catch {
      /* idem */
    }
  }

  // O Realiza DRE do agrupador vale pros centros dele.
  async function alterarRealizaGrupo(g, valor) {
    try {
      const salvo = await gravar(() => atualizarAgrupadorDre(empresaId, g.id, { realiza_dre: valor }), 'Não foi possível salvar.');
      setAgrupadores((lista) => lista.map((x) => (x.id === g.id ? salvo : x)));
      setCentros((lista) => lista.map((c) => (c.agrupador_id === g.id ? { ...c, realiza_dre: valor } : c)));
    } catch {
      /* idem */
    }
  }

  async function confirmarExclusao() {
    const g = excluindo;
    setExcluindo(null);
    try {
      await gravar(() => excluirAgrupadorDre(empresaId, g.id), 'Não foi possível excluir o agrupador.');
      setAgrupadores((lista) => lista.filter((x) => x.id !== g.id));
      setCentros((lista) => lista.map((c) => (c.agrupador_id === g.id ? { ...c, agrupador_id: null, principal: false } : c)));
    } catch {
      /* idem */
    }
  }

  // ------------------------------------------------------------------ arrastar

  // Só leitura (versões da DRE): sem arrastar nem editar.
  const { somenteLeitura } = useLeituraDre();
  // Arrasta também com a busca e o filtro de situação: as posições da lista visível viram posições da lista
  // inteira em `soltar` (naLista / vizinhos visíveis).
  const podeArrastar = !somenteLeitura;

  function iniciarArraste(e, item) {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${item.tipo}:${item.id}`);
    // adia pra o navegador capturar a "foto" da linha antes de esmaecer a original
    requestAnimationFrame(() => setArrastado(item));
  }

  function encerrarArraste() {
    setArrastado(null);
    setAlvo(null);
  }

  // Sobre uma linha: metade de cima = antes dela; metade de baixo = depois. Arrastando um centro por cima do
  // cabeçalho de outro agrupador, o alvo é o agrupador inteiro (entrar nele).
  function mirar(e, i) {
    if (!arrastado) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const l = visiveis[i];
    if (arrastado.tipo === 'centro' && l.tipo === 'grupo') {
      if (!alvo || alvo.grupo !== l.g.id) setAlvo({ grupo: l.g.id });
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const posicao = e.clientY < r.top + r.height / 2 ? i : i + 1;
    if (!alvo || alvo.posicao !== posicao) setAlvo({ posicao });
  }

  // A ordem inteira dos centros (os de cada agrupador juntos), a partir das linhas.
  // Sempre os centros dos agrupadores primeiro, depois os soltos (a mesma ordem da tela).
  const ordemDe = (ls) => {
    const cs = ls.filter((l) => l.tipo === 'centro');
    return [...cs.filter((l) => l.g), ...cs.filter((l) => !l.g)].map((l) => l.c.sienge_id);
  };

  async function soltar(e) {
    e.preventDefault();
    const item = arrastado;
    const destino = alvo;
    encerrarArraste();
    if (!item || !destino) return;

    // As posições do arraste são da lista VISÍVEL (com os inativos escondidos, ela não é a lista inteira): cada
    // posição vira "antes desta linha" (ou "depois da última visível") na lista inteira.
    let novas = [...linhas];
    const naLista = (pos) =>
      pos < visiveis.length ? linhas.indexOf(visiveis[pos]) : visiveis.length ? linhas.indexOf(visiveis[visiveis.length - 1]) + 1 : linhas.length;
    let grupoNovo; // undefined = não muda de agrupador
    if (item.tipo === 'grupo') {
      // Bloco inteiro (cabeçalho + centros) pra posição; dentro de outro bloco, vai pro fim dele.
      const ini = novas.findIndex((l) => l.tipo === 'grupo' && l.g.id === item.id);
      const bloco = [novas[ini], ...novas.filter((l) => l.tipo === 'centro' && l.g?.id === item.id)];
      let pos = naLista(destino.posicao);
      while (pos < novas.length && pos > 0 && novas[pos].tipo === 'centro' && novas[pos].g && novas[pos - 1].g?.id === novas[pos].g.id) pos += 1;
      const antes = novas.slice(0, pos).filter((l) => !bloco.includes(l));
      const depois = novas.slice(pos).filter((l) => !bloco.includes(l));
      novas = [...antes, ...bloco, ...depois];
    } else {
      const de = novas.findIndex((l) => l.tipo === 'centro' && l.c.sienge_id === item.id);
      const linha = novas[de];
      if (destino.grupo !== undefined) {
        // Sobre o agrupador: entra no fim do bloco dele.
        grupoNovo = destino.grupo;
        novas.splice(de, 1);
        let fim = novas.findIndex((l) => l.tipo === 'grupo' && l.g.id === grupoNovo) + 1;
        while (fim < novas.length && novas[fim].tipo === 'centro' && novas[fim].g?.id === grupoNovo) fim += 1;
        novas.splice(fim, 0, { ...linha, g: agrupadores.find((g) => g.id === grupoNovo) });
      } else {
        // Entre linhas: o agrupador é o de cima, se a linha de cima for o cabeçalho dele ou se as duas
        // linhas em volta forem dele; senão fica fora de agrupador.
        const pos = destino.posicao;
        const cima = visiveis[pos - 1];
        const baixo = visiveis[pos];
        // (Agrupador fechado: soltar logo abaixo dele não entra nele — pra entrar, solte em cima do cabeçalho.)
        const g =
          cima?.tipo === 'grupo' && aberto(cima)
            ? cima.g
            : cima?.tipo === 'centro' && cima.g && baixo?.tipo === 'centro' && baixo.g?.id === cima.g.id
              ? cima.g
              : null;
        grupoNovo = (g?.id ?? null) === (linha.g?.id ?? null) ? undefined : g?.id ?? null;
        novas.splice(de, 1);
        let para;
        if (baixo === linha || (!baixo && cima === linha)) para = de;
        else if (baixo) para = novas.indexOf(baixo);
        else para = novas.indexOf(cima) + 1;
        // Fora de agrupador logo abaixo de um: depois dos centros (inclusive os escondidos) dele.
        if (!g && cima?.g) while (para < novas.length && novas[para].tipo === 'centro' && novas[para].g?.id === cima.g.id) para += 1;
        novas.splice(para, 0, { ...linha, g });
      }
    }

    const ordem = ordemDe(novas);
    const mudouOrdem = ordem.join(',') !== centros.map((c) => c.sienge_id).join(',');
    if (grupoNovo === undefined && !mudouOrdem) return;
    await aplicar(item.tipo === 'centro' ? item.id : null, grupoNovo, ordem);
  }

  // Grava a mudança de agrupador (se houver) e a ordem. 409 com `escolher_projecao`: pergunta qual projeção fica.
  async function aplicar(centroId, grupoNovo, ordem, projecaoFica = null) {
    try {
      await gravar(async () => {
        if (grupoNovo !== undefined) {
          const r = await moverCentroDre(empresaId, centroId, grupoNovo, projecaoFica);
          setAgrupadores(r.agrupadores);
          setCentros(r.centros);
          // Abre o agrupador que recebeu o centro (pra mostrar que ele entrou).
          if (grupoNovo !== null) setAbertos((atual) => new Set(atual).add(grupoNovo));
        }
        setCentros(await reordenarCentrosCustoDre(empresaId, ordem));
      }, 'Não foi possível salvar.');
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.escolher_projecao) {
        setErroSalvar('');
        setEscolha({
          mensagem: err.response.data.message,
          opcoes: err.response.data.escolher_projecao,
          repetir: (fica) => aplicar(centroId, grupoNovo, ordem, fica),
        });
      }
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Building2 size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para classificar os centros de custo.</p>
      </div>
    );
  }

  const statusSalvamento = pendentes > 0 ? 'salvando' : erroSalvar ? 'erro' : salvoAlgumaVez ? 'salvo' : null;
  const naturezaDoGrupo = (membros) =>
    membros.some((m) => m.natureza === 'OBRA') ? 'OBRA' : membros.some((m) => m.natureza === 'ADMINISTRATIVO') ? 'ADMINISTRATIVO' : null;

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

      {carregando && centros.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erroCarga ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TriangleAlert size={26} className="text-red-400" />
          <p className="text-sm text-gray-600">{erroCarga}</p>
          <button
            type="button"
            onClick={carregar}
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
          {/* Cabeçalho azul, mesmo da aba Máscaras, com os títulos das colunas dos campos. */}
          <div
            className={`${GRADE} sticky -top-6 z-20 rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700`}
          >
            <span className="pl-5" title="Arraste pela alça para mudar a ordem — é a ordem das colunas na aba DRE. Solte um centro sobre um agrupador para colocá-lo nele.">
              Centro de custo
            </span>
            <span title="Mesmo Tipo da aba Centros Custos da DFC Construtoras — alterar aqui altera lá">Tipo</span>
            <span className="text-center">Realiza DRE</span>
          </div>

          {/* Novo agrupador (botão no topo da página). */}
          {novoNome !== null && (
            <div className={`${GRADE} border-b border-gray-100 bg-primary-50/40 py-1.5 pl-1.5 pr-4`}>
              <div className="flex min-w-0 items-center gap-2">
                <Layers size={14} className="ml-px shrink-0 text-primary-600" />
                <input
                  ref={novoRef}
                  type="text"
                  value={novoNome}
                  maxLength={120}
                  onChange={(e) => setNovoNome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') criarAgrupador();
                    if (e.key === 'Escape') setNovoNome(null);
                  }}
                  placeholder="Nome do agrupador (ex.: EASY)"
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <button
                  type="button"
                  onClick={criarAgrupador}
                  disabled={!novoNome.trim()}
                  className="rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  Criar
                </button>
                <button type="button" onClick={() => setNovoNome(null)} className="text-gray-400 hover:text-gray-600" aria-label="Cancelar">
                  <X size={15} />
                </button>
              </div>
              <span className="col-span-2 text-[11px] text-gray-500">Depois, arraste os centros de custo para dentro dele.</span>
            </div>
          )}

          {/* Cabeçalho sempre visível, mesmo sem nenhum registro (pedido do usuário). */}
          {visiveis.length === 0 ? (
            <div className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
              {centros.length === 0 ? 'Nenhum centro de custo nesta empresa.' : 'Nenhum centro de custo encontrado para essa busca.'}
            </div>
          ) : (
            visiveis.map((l, i) => {
              const indicadores = (
                <>
                  {alvo?.posicao === i && <Indicador />}
                  {alvo?.posicao === visiveis.length && i === visiveis.length - 1 && <Indicador embaixo />}
                </>
              );

              if (l.tipo === 'grupo') {
                const { g, membros } = l;
                const natureza = naturezaDoGrupo(membros);
                const sobre = alvo?.grupo === g.id;
                return (
                  <div
                    key={`g${g.id}`}
                    draggable={podeArrastar && editando?.id !== g.id}
                    onDragStart={(e) => iniciarArraste(e, { tipo: 'grupo', id: g.id })}
                    onDragEnd={encerrarArraste}
                    onDragOver={(e) => mirar(e, i)}
                    className={`${GRADE} group/linha relative border-b border-gray-100 py-1.5 pl-1.5 pr-4 ${
                      sobre ? 'bg-primary-100 ring-2 ring-inset ring-primary-400' : 'bg-primary-50/60 hover:bg-primary-50'
                    } ${arrastado?.tipo === 'grupo' && arrastado.id === g.id ? 'opacity-40' : ''}`}
                  >
                    {indicadores}
                    <div className="flex min-w-0 items-center gap-2">
                      <GripVertical
                        size={14}
                        className={`shrink-0 ${podeArrastar ? 'cursor-grab text-gray-300 group-hover/linha:text-gray-500' : 'text-gray-200'}`}
                        title={podeArrastar ? 'Arraste para mudar a ordem do agrupador' : 'Só leitura'}
                      />
                      {/* Drilldown (span, não button: a aba fica num fieldset desativado na versão só leitura e abrir
                          continua valendo). */}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={() => membros.length && alternar(g.id)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && membros.length && alternar(g.id)}
                        aria-expanded={aberto(l)}
                        title={membros.length ? (aberto(l) ? 'Fechar' : 'Abrir os centros') : 'Agrupador vazio'}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                          membros.length ? 'cursor-pointer text-primary-600 hover:bg-white' : 'text-gray-300'
                        }`}
                      >
                        <ChevronRight size={14} className={`transition-transform ${aberto(l) ? 'rotate-90' : ''}`} />
                      </span>
                      <Layers size={14} className="shrink-0 text-primary-600" />
                      {editando?.id === g.id ? (
                        <input
                          autoFocus
                          type="text"
                          value={editando.nome}
                          maxLength={120}
                          onChange={(e) => setEditando({ id: g.id, nome: e.target.value })}
                          onBlur={renomear}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setEditando(null);
                          }}
                          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-100"
                        />
                      ) : (
                        <span
                          onClick={() => membros.length && alternar(g.id)}
                          className={`min-w-0 truncate text-xs font-semibold text-gray-900 ${membros.length ? 'cursor-pointer' : ''}`}
                          title="Agrupador: a DRE trata os centros dele como uma obra só"
                        >
                          {g.nome}
                        </span>
                      )}
                      {/* Conta só os centros da situação escolhida no filtro (pedido do usuário): VIBRANT ALTO, com um
                          centro inativo, mostra "1 centro" em Ativos e "2 centros" em Todos. */}
                      {(() => {
                        const mostrados = membros.filter(situacaoOk).length;
                        return (
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                            {membros.length === 0 ? 'vazio' : `${mostrados} ${mostrados === 1 ? 'centro' : 'centros'}`}
                          </span>
                        );
                      })()}
                      {!somenteLeitura && editando?.id !== g.id && (
                        <span className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/linha:opacity-100">
                          <button
                            type="button"
                            onClick={() => setEditando({ id: g.id, nome: g.nome })}
                            className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700"
                            title="Renomear agrupador"
                            aria-label="Renomear agrupador"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setExcluindo(g)}
                            className="rounded p-1 text-gray-400 hover:bg-white hover:text-red-600"
                            title="Excluir agrupador"
                            aria-label="Excluir agrupador"
                          >
                            <Trash2 size={13} />
                          </button>
                        </span>
                      )}
                    </div>
                    <span className="pl-3 text-xs text-gray-500" title="O Tipo do agrupador vem dos centros dele">
                      {membros.length === 0 ? (
                        <span className="text-gray-400">Solte os centros aqui</span>
                      ) : (
                        ROTULO_NATUREZA[natureza] || <span className="text-amber-700">Sem tipo</span>
                      )}
                    </span>
                    <span className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={Boolean(g.realiza_dre)}
                        onChange={(e) => alterarRealizaGrupo(g, e.target.checked)}
                        title="Realiza DRE do agrupador (vale para todos os centros dele)"
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-100"
                      />
                    </span>
                  </div>
                );
              }

              const { c: centro, g } = l;
              return (
                <div
                  key={centro.sienge_id}
                  draggable={podeArrastar}
                  onDragStart={(e) => iniciarArraste(e, { tipo: 'centro', id: centro.sienge_id })}
                  onDragEnd={encerrarArraste}
                  onDragOver={(e) => mirar(e, i)}
                  className={`${GRADE} group/linha relative border-b border-gray-100 bg-white py-1.5 pr-4 hover:bg-gray-50 ${g ? 'pl-7' : 'pl-1.5'} ${
                    arrastado?.tipo === 'centro' && arrastado.id === centro.sienge_id ? 'opacity-40' : ''
                  }`}
                >
                  {indicadores}
                  {g && <span className="absolute bottom-0 left-3.5 top-0 w-px bg-primary-200" aria-hidden />}
                  <div className="flex min-w-0 items-center gap-2">
                    <GripVertical
                      size={14}
                      className={`shrink-0 ${podeArrastar ? 'cursor-grab text-gray-300 group-hover/linha:text-gray-500' : 'text-gray-200'}`}
                      title={podeArrastar ? 'Arraste para mudar a ordem ou soltar num agrupador' : 'Só leitura'}
                    />
                    <span className="shrink-0 text-xs tabular-nums text-gray-400">{centro.sienge_id}</span>
                    <span className="min-w-0 truncate text-xs font-medium text-gray-800" title={centro.name}>
                      {centro.name}
                      {centro.apelido && <span className="font-normal text-gray-400"> · {centro.apelido}</span>}
                    </span>
                    {centro.status !== 'ATIVO' && (
                      <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">Inativo</span>
                    )}
                  </div>
                  <SearchableSelect
                    value={centro.natureza || ''}
                    onChange={(v) => alterar(centro, { natureza: v || null })}
                    options={NATUREZAS}
                    placeholder="Selecione"
                    corClasses={corCampo(centro.natureza)}
                    compacto
                  />

                  {/* Só os marcados aparecem nas abas seguintes (plano de contas próprio e Orçamento). Dentro de
                      agrupador, o Realiza DRE é o dele. */}
                  <span className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={Boolean(centro.realiza_dre)}
                      onChange={(e) => alterar(centro, { realiza_dre: e.target.checked })}
                      disabled={Boolean(g)}
                      title={g ? `Definido pelo agrupador ${g.nome}` : 'Realiza DRE'}
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      <Modal open={Boolean(excluindo)} title="Excluir agrupador" onClose={() => setExcluindo(null)}>
        {excluindo && (
          <div className="space-y-4 text-sm text-gray-700">
            <p>
              Excluir o agrupador <strong>{excluindo.nome}</strong>?{' '}
              {excluindo.centros.length > 0
                ? 'Os centros dele voltam a ser calculados separados na DRE, cada um com a própria POC.'
                : 'Ele está vazio.'}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setExcluindo(null)}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={confirmarExclusao}>
                Excluir
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(escolha)} title="Qual projeção fica?" onClose={() => setEscolha(null)} maxWidthClass="max-w-lg">
        {escolha && (
          <div className="space-y-4 text-sm text-gray-700">
            <p>
              {escolha.mensagem} A projeção da DRE é uma só por agrupador: a outra é descartada. A que ficar volta para Em andamento, para
              ser revisada com os dois centros juntos.
            </p>
            <div className="space-y-2">
              {escolha.opcoes.map((o) => (
                <button
                  key={o.centro_id}
                  type="button"
                  onClick={() => {
                    const r = escolha.repetir;
                    setEscolha(null);
                    r(o.centro_id);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-left hover:border-primary-300 hover:bg-primary-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-900">
                      {o.agrupador ? `Do agrupador ${o.agrupador}` : `De ${o.centro_id} - ${o.centro}`}
                    </span>
                    <span className="block text-xs text-gray-500">
                      Ciclo {o.ciclo_inicio.slice(5)}/{o.ciclo_inicio.slice(0, 4)} a {o.ciclo_fim.slice(5)}/{o.ciclo_fim.slice(0, 4)} ·{' '}
                      {o.status === 'CONCLUIDO' ? 'Concluída' : 'Em andamento'}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-primary-600">Manter esta</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setEscolha(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
});

export default CentrosCustosTab;
