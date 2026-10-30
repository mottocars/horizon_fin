import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, GripVertical, Loader2, TriangleAlert } from 'lucide-react';
import { Indicador } from '../../../components/MascarasArvoreEditor';
import { listCentrosCustoDre, reordenarCentrosCustoDre, updateCentroCustoDre } from '../../../api/dreCentros.api';

// Mesma grade no cabeçalho e nas linhas, pra a caixa ficar em coluna.
const GRADE = 'grid grid-cols-[minmax(0,1fr)_100px] items-center gap-3';

// Operações > DRE Gerencial > Centros Custos: mesma aba de DFC Construtoras > Centros Custos
// (DfcCentrosTab.jsx — pedido do usuário), só com a flag "Realiza DRE" (sem Tipo, Contrato Caixa e
// Código Prevision, que a DRE não usa). Todos os centros de custo da empresa, lista única, sem
// drilldown; só os marcados aparecem nas abas seguintes (plano de contas próprio e Orçamento). Cada
// mudança salva na hora, com o mesmo indicador de salvamento da aba Máscaras.
// Ordem: arrastando a linha pela alça, como na aba Máscaras (drag-and-drop nativo, mesma linha azul de
// destino); grava a lista inteira na nova ordem. É a ordem das colunas dos centros na aba DRE. Com
// busca digitada o arraste fica desligado (a lista estaria incompleta).
export default function CentrosCustosTab({ empresaId, search }) {
  const [centros, setCentros] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');

  const [pendentes, setPendentes] = useState(0);
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);
  const [arrastado, setArrastado] = useState(null); // sienge_id da linha sendo arrastada
  const [alvo, setAlvo] = useState(null); // posição (0…n) onde ela vai entrar

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErroCarga('');
    listCentrosCustoDre(empresaId)
      .then(setCentros)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar os centros de custo.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setCentros([]);
    setErroSalvar('');
    setSalvoAlgumaVez(false);
    carregar();
  }, [carregar]);

  const filtrados = useMemo(() => {
    const termo = search.trim().toLowerCase();
    if (!termo) return centros;
    return centros.filter(
      (c) =>
        String(c.sienge_id).includes(termo) ||
        c.name.toLowerCase().includes(termo) ||
        (c.apelido || '').toLowerCase().includes(termo)
    );
  }, [centros, search]);

  // Atualiza a linha na hora e grava; se falhar, volta a linha pro que estava.
  async function alterar(centro, realizaDre) {
    const novo = { ...centro, realiza_dre: realizaDre };
    setCentros((atual) => atual.map((c) => (c.sienge_id === centro.sienge_id ? novo : c)));
    setErroSalvar('');
    setPendentes((n) => n + 1);
    try {
      const salvo = await updateCentroCustoDre(empresaId, centro.sienge_id, realizaDre);
      setCentros((atual) => atual.map((c) => (c.sienge_id === centro.sienge_id ? salvo : c)));
      setSalvoAlgumaVez(true);
    } catch (err) {
      setCentros((atual) => atual.map((c) => (c.sienge_id === centro.sienge_id ? centro : c)));
      setErroSalvar(err.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setPendentes((n) => n - 1);
    }
  }

  const podeArrastar = !search.trim();

  function iniciarArraste(e, siengeId) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(siengeId));
    // adia pra o navegador capturar a "foto" da linha antes de esmaecer a original
    requestAnimationFrame(() => setArrastado(siengeId));
  }

  function encerrarArraste() {
    setArrastado(null);
    setAlvo(null);
  }

  // Metade de cima da linha = antes dela; metade de baixo = depois.
  function mirar(e, i) {
    if (arrastado === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = e.currentTarget.getBoundingClientRect();
    const posicao = e.clientY < r.top + r.height / 2 ? i : i + 1;
    if (posicao !== alvo) setAlvo(posicao);
  }

  // Move na tela na hora e grava a lista inteira; se falhar, volta pro que estava.
  async function soltar(e) {
    e.preventDefault();
    const id = arrastado;
    const posicao = alvo;
    encerrarArraste();
    if (id === null || posicao === null) return;
    const de = centros.findIndex((c) => c.sienge_id === id);
    const para = posicao > de ? posicao - 1 : posicao;
    if (de < 0 || para === de) return;
    const anterior = centros;
    const nova = [...centros];
    const [item] = nova.splice(de, 1);
    nova.splice(para, 0, item);
    setCentros(nova);
    setErroSalvar('');
    setPendentes((n) => n + 1);
    try {
      setCentros(await reordenarCentrosCustoDre(empresaId, nova.map((c) => c.sienge_id)));
      setSalvoAlgumaVez(true);
    } catch (err) {
      setCentros(anterior);
      setErroSalvar(err.response?.data?.message || 'Não foi possível salvar a ordem.');
    } finally {
      setPendentes((n) => n - 1);
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
          onDragOver={(e) => arrastado !== null && e.preventDefault()}
          onDrop={soltar}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setAlvo(null);
          }}
        >
          {/* Cabeçalho azul, mesmo da aba Máscaras, com os títulos das colunas dos campos. */}
          <div
            className={`${GRADE} sticky -top-6 z-20 rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700`}
          >
            <span className="pl-5" title="Arraste pela alça para mudar a ordem — é a ordem das colunas na aba DRE">
              Centro de custo
            </span>
            <span className="text-center">Realiza DRE</span>
          </div>

          {/* Cabeçalho sempre visível, mesmo sem nenhum registro (pedido do usuário). */}
          {filtrados.length === 0 ? (
            <div className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
              {centros.length === 0 ? 'Nenhum centro de custo nesta empresa.' : 'Nenhum centro de custo encontrado para essa busca.'}
            </div>
          ) : (
            filtrados.map((centro, i) => {
            return (
              <div
                key={centro.sienge_id}
                draggable={podeArrastar}
                onDragStart={(e) => iniciarArraste(e, centro.sienge_id)}
                onDragEnd={encerrarArraste}
                onDragOver={(e) => mirar(e, i)}
                className={`${GRADE} group/linha relative border-b border-gray-100 bg-white py-1.5 pl-1.5 pr-4 hover:bg-gray-50 ${
                  arrastado === centro.sienge_id ? 'opacity-40' : ''
                }`}
              >
                {alvo === i && <Indicador />}
                {alvo === filtrados.length && i === filtrados.length - 1 && <Indicador embaixo />}
                <div className="flex min-w-0 items-center gap-2">
                  <GripVertical
                    size={14}
                    className={`shrink-0 ${podeArrastar ? 'cursor-grab text-gray-300 group-hover/linha:text-gray-500' : 'text-gray-200'}`}
                    title={podeArrastar ? 'Arraste para mudar a ordem' : 'Limpe a busca para mudar a ordem'}
                  />
                  <span className="shrink-0 text-xs tabular-nums text-gray-400">{centro.sienge_id}</span>
                  <span className="min-w-0 truncate text-xs font-medium text-gray-800" title={centro.name}>
                    {centro.name}
                    {centro.apelido && <span className="font-normal text-gray-400"> · {centro.apelido}</span>}
                  </span>
                  {centro.status !== 'ATIVO' && (
                    <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                      Inativo
                    </span>
                  )}
                </div>
                {/* Só os marcados aparecem nas abas seguintes (plano de contas próprio e Orçamento). */}
                <span className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={Boolean(centro.realiza_dre)}
                    onChange={(e) => alterar(centro, e.target.checked)}
                    title="Realiza DRE"
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-100"
                  />
                </span>
              </div>
            );
          })
          )}
        </div>
      )}
    </div>
  );
}
