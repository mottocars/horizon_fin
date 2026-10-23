import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, Loader2, TriangleAlert } from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';
import {
  listCentrosCustoDre,
  listContratosCaixaDre,
  listProjetosPrevisionDre,
  updateCentroCustoDre,
} from '../../../api/dreCentros.api';

const NATUREZAS = [
  { value: 'OBRA', label: 'Obra' },
  { value: 'ADMINISTRATIVO', label: 'Administrativo' },
];

// Mesma grade no cabeçalho e nas linhas, pra as comboboxes ficarem em coluna.
const GRADE = 'grid grid-cols-[minmax(0,1fr)_190px_100px_300px_300px] items-center gap-3';

// Mesmo par de cores da aba da DFC (CampoParametro.jsx): em branco
// fica âmbar, pra achar de relance o que falta classificar; preenchido fica azul claro.
function corCampo(valor) {
  return valor ? 'border-primary-100 bg-primary-50' : 'border-amber-300 bg-amber-50';
}

// Opções de uma combobox garantindo que o valor já gravado apareça mesmo se não estiver mais na
// lista (contrato que saiu do Geral, projeto apagado no Prevision) — mesmo cuidado da
// combobox "Código Prevision" de CentroCustoItemDetalhe.jsx.
function opcoesComValorAtual(opcoes, valor) {
  if (!valor || opcoes.some((o) => String(o.value) === String(valor))) return opcoes;
  return [{ value: valor, label: String(valor) }, ...opcoes];
}

// Operações > DRE Gerencial > Centros Custos: mesma aba de DFC Construtoras > Centros Custos
// (DfcCentrosTab.jsx — pedido do usuário), com a flag "Realiza DRE" no lugar do "Projeta DFC". Todos
// os centros de custo da empresa, lista única, sem drilldown. Tipo, Contrato Caixa e Código
// Prevision são as MESMAS colunas do cadastro do centro de custo e da aba da DFC — mudar aqui muda
// lá. Contrato Caixa e Código Prevision só aparecem pra Obra. Cada mudança salva na hora, com o
// mesmo indicador de salvamento da aba Máscaras.
export default function CentrosCustosTab({ empresaId, search }) {
  const [centros, setCentros] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [erroProjetos, setErroProjetos] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');

  const [pendentes, setPendentes] = useState(0);
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);

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
    if (!empresaId) return;
    listContratosCaixaDre(empresaId)
      .then(setContratos)
      .catch(() => setContratos([]));
    setErroProjetos('');
    listProjetosPrevisionDre(empresaId)
      .then(setProjetos)
      .catch((err) => {
        setProjetos([]);
        setErroProjetos(err.response?.data?.message || 'Não foi possível carregar os projetos do Prevision.');
      });
  }, [carregar, empresaId]);

  const opcoesContrato = useMemo(
    () => contratos.map((c) => ({ value: c.contrato, label: `${c.contrato} - ${c.nome}` })),
    [contratos]
  );
  const opcoesPrevision = useMemo(
    () => projetos.map((p) => ({ value: String(p.codigo), label: `${p.codigo} - ${p.nome}` })),
    [projetos]
  );

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
  async function alterar(centro, patch) {
    const novo = { ...centro, ...patch };
    setCentros((atual) => atual.map((c) => (c.sienge_id === centro.sienge_id ? novo : c)));
    setErroSalvar('');
    setPendentes((n) => n + 1);
    try {
      const salvo = await updateCentroCustoDre(empresaId, centro.sienge_id, novo);
      setCentros((atual) => atual.map((c) => (c.sienge_id === centro.sienge_id ? salvo : c)));
      setSalvoAlgumaVez(true);
    } catch (err) {
      setCentros((atual) => atual.map((c) => (c.sienge_id === centro.sienge_id ? centro : c)));
      setErroSalvar(err.response?.data?.message || 'Não foi possível salvar.');
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
        <div>
          {/* Cabeçalho azul, mesmo da aba Máscaras, com os títulos das colunas dos campos. */}
          <div
            className={`${GRADE} sticky -top-6 z-20 rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700`}
          >
            <span>Centro de custo</span>
            <span>Tipo</span>
            <span className="text-center">Realiza DRE</span>
            <span>Contrato Caixa</span>
            <span>
              Código Prevision
              {erroProjetos && (
                <span className="ml-1.5 font-normal normal-case tracking-normal text-amber-600" title={erroProjetos}>
                  (lista indisponível)
                </span>
              )}
            </span>
          </div>

          {/* Cabeçalho sempre visível, mesmo sem nenhum registro (pedido do usuário). */}
          {filtrados.length === 0 ? (
            <div className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
              {centros.length === 0 ? 'Nenhum centro de custo nesta empresa.' : 'Nenhum centro de custo encontrado para essa busca.'}
            </div>
          ) : (
            filtrados.map((centro) => {
            const obra = centro.natureza === 'OBRA';
            return (
              <div
                key={centro.sienge_id}
                className={`${GRADE} border-b border-gray-100 bg-white py-1.5 pl-4 pr-4 hover:bg-gray-50`}
              >
                <div className="flex min-w-0 items-center gap-2">
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
                <SearchableSelect
                  value={centro.natureza || ''}
                  onChange={(v) => alterar(centro, { natureza: v || null })}
                  options={NATUREZAS}
                  placeholder="Selecione"
                  corClasses={corCampo(centro.natureza)}
                />
                {/* Só os marcados podem ter plano de contas próprio na aba Plano de Contas. */}
                <span className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={Boolean(centro.realiza_dre)}
                    onChange={(e) => alterar(centro, { realiza_dre: e.target.checked })}
                    title="Realiza DRE"
                    className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-100"
                  />
                </span>
                {obra ? (
                  <SearchableSelect
                    value={centro.codigo_contrato_caixa || ''}
                    onChange={(v) => alterar(centro, { codigo_contrato_caixa: v || null })}
                    options={opcoesComValorAtual(opcoesContrato, centro.codigo_contrato_caixa)}
                    placeholder="Selecione o contrato"
                    emptyMessage="Nenhum contrato no Geral dos Empreendimentos do Portal das Construtoras."
                    corClasses={corCampo(centro.codigo_contrato_caixa)}
                  />
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
                {obra ? (
                  <SearchableSelect
                    value={centro.codigo_prevision || ''}
                    onChange={(v) => alterar(centro, { codigo_prevision: v ? String(v) : null })}
                    options={opcoesComValorAtual(opcoesPrevision, centro.codigo_prevision)}
                    placeholder="Selecione o projeto"
                    emptyMessage="Nenhum projeto encontrado."
                    corClasses={corCampo(centro.codigo_prevision)}
                  />
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </div>
            );
          })
          )}
        </div>
      )}
    </div>
  );
}
