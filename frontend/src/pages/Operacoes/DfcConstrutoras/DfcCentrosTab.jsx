import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, Loader2, TriangleAlert } from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';
import {
  listCentrosCustoDfc,
  listContratosCaixaDfc,
  listProjetosPrevisionDfc,
  updateCentroCustoDfc,
} from '../../../api/dfcCentros.api';

const NATUREZAS = [
  { value: 'OBRA', label: 'Obra' },
  { value: 'ADMINISTRATIVO', label: 'Administrativo' },
];

// Mesmo par de cores dos campos obrigatórios do resto da DFC (CampoParametro.jsx): em branco
// fica âmbar, pra achar de relance o que falta classificar; preenchido fica azul claro.
function corCampo(valor) {
  return valor ? 'border-primary-100 bg-primary-50' : 'border-amber-300 bg-amber-50';
}

// Opções de uma combobox garantindo que o valor já gravado apareça mesmo se não estiver mais na
// lista (contrato que saiu do extrato, projeto apagado no Prevision) — mesmo cuidado da
// combobox "Código Prevision" de CentroCustoItemDetalhe.jsx.
function opcoesComValorAtual(opcoes, valor) {
  if (!valor || opcoes.some((o) => String(o.value) === String(valor))) return opcoes;
  return [{ value: valor, label: String(valor) }, ...opcoes];
}

// Operações > DFC Construtoras > Centros Custos: todos os centros de custo da empresa (mesma
// lista de Cadastros > Centros de Custos), com 3 campos pra classificar cada um. Contrato Caixa e
// Código Prevision só aparecem pra Obra e são as MESMAS colunas do cadastro do centro de custo
// (Código Contrato Caixa / Código Prevision) — mudar aqui muda lá. Cada mudança salva na hora,
// com o mesmo indicador de salvamento da aba Máscaras.
export default function DfcCentrosTab({ empresaId, search }) {
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
    listCentrosCustoDfc(empresaId)
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
    listContratosCaixaDfc(empresaId)
      .then(setContratos)
      .catch(() => setContratos([]));
    setErroProjetos('');
    listProjetosPrevisionDfc(empresaId)
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
      const salvo = await updateCentroCustoDfc(empresaId, centro.sienge_id, novo);
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
    // overflow-hidden: o cabeçalho azul da tabela não vaza do canto arredondado (as comboboxes
    // abrem num portal, então não são cortadas).
    <div className="overflow-hidden rounded-card rounded-tl-none bg-white shadow-card">
      {statusSalvamento && (
        <div className="flex items-center justify-end border-b border-gray-100 px-5 py-2 text-xs" aria-live="polite">
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
        <div className="mx-5 mb-3 mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="status">
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
      ) : filtrados.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          {centros.length === 0 ? 'Nenhum centro de custo nesta empresa.' : 'Nenhum centro de custo encontrado para essa busca.'}
        </div>
      ) : (
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-blue-700">
              <th className="w-24 border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 font-medium">Código</th>
              <th className="border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 font-medium">Descrição</th>
              <th className="w-24 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 font-medium">Status</th>
              <th className="w-48 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 font-medium">Obra ou Administrativo</th>
              <th className="w-72 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 font-medium">Contrato Caixa</th>
              <th className="w-72 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 pr-4 font-medium">
                Código Prevision
                {erroProjetos && (
                  <span className="mt-0.5 block text-[10px] font-normal normal-case tracking-normal text-amber-600" title={erroProjetos}>
                    Lista do Prevision indisponível
                  </span>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((centro) => {
              const obra = centro.natureza === 'OBRA';
              return (
                <tr key={centro.sienge_id} className="group">
                  <td className="border-b border-gray-100 py-2 pl-4 text-gray-600 group-hover:bg-gray-50">{centro.sienge_id}</td>
                  <td className="border-b border-gray-100 px-3 py-2 group-hover:bg-gray-50">
                    <div className="text-gray-900">{centro.name}</div>
                    {centro.apelido && <div className="text-xs text-gray-400">{centro.apelido}</div>}
                  </td>
                  <td className="border-b border-gray-100 px-3 py-2 group-hover:bg-gray-50">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        centro.status === 'ATIVO' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {centro.status === 'ATIVO' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="border-b border-gray-100 px-3 py-2 group-hover:bg-gray-50">
                    <SearchableSelect
                      value={centro.natureza || ''}
                      onChange={(v) => alterar(centro, { natureza: v || null })}
                      options={NATUREZAS}
                      placeholder="Selecione"
                      corClasses={corCampo(centro.natureza)}
                    />
                  </td>
                  <td className="border-b border-gray-100 px-3 py-2 group-hover:bg-gray-50">
                    {obra ? (
                      <SearchableSelect
                        value={centro.codigo_contrato_caixa || ''}
                        onChange={(v) => alterar(centro, { codigo_contrato_caixa: v || null })}
                        options={opcoesComValorAtual(opcoesContrato, centro.codigo_contrato_caixa)}
                        placeholder="Selecione o contrato"
                        emptyMessage="Nenhum contrato no extrato do Portal das Construtoras."
                        corClasses={corCampo(centro.codigo_contrato_caixa)}
                      />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="border-b border-gray-100 px-3 py-2 pr-4 group-hover:bg-gray-50">
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
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
