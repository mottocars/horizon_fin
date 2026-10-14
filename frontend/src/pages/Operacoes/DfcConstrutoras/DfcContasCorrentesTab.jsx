import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Check, Landmark, Loader2, TriangleAlert } from 'lucide-react';
import { listContasCorrentesDfc, sincronizarContasCorrentesDfc, updateContaCorrenteDfc } from '../../../api/dfcContas.api';
import { useAlert } from '../../../confirm/ConfirmContext';

// Mesma grade no cabeçalho e nas linhas.
const GRADE = 'grid grid-cols-[minmax(0,1fr)_220px_90px_minmax(0,0.8fr)_110px_100px] items-center gap-3';

const chave = (c) => `${c.company_id}|${c.numero_conta}`;

// Operações > DFC Construtoras > Contas Correntes: as contas bancárias da empresa no Sienge
// (endpoint v1/checking-accounts — mesma tabela e mesma sincronização da tela Saldo de Contas
// Bancárias), com a flag "Projeta DFC" (pedido do usuário). Mesmo modelo e estética da aba Centros
// Custos: lista única, cabeçalho azul, cada mudança salva na hora. O ícone de buscar no Sienge
// fica no topo da página e chama `ref.sincronizar()`.
const DfcContasCorrentesTab = forwardRef(function DfcContasCorrentesTab({ empresaId, search = '', onSincronizando }, ref) {
  const alert = useAlert();
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  const [pendentes, setPendentes] = useState(0);
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);

  const carregar = useCallback(() => {
    if (!empresaId) return Promise.resolve();
    setCarregando(true);
    setErroCarga('');
    return listContasCorrentesDfc(empresaId)
      .then(setContas)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar as contas.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setContas([]);
    setErroSalvar('');
    setSalvoAlgumaVez(false);
    carregar();
  }, [carregar]);

  async function sincronizar() {
    onSincronizando?.(true);
    try {
      const r = await sincronizarContasCorrentesDfc(empresaId);
      await carregar();
      await alert({
        title: 'Contas atualizadas',
        description: `${r.total_importado} conta(s) buscada(s) no Sienge. O "Projeta DFC" das contas que já existiam foi mantido.`,
      });
    } catch (err) {
      await alert({
        title: 'Não foi possível buscar as contas',
        description: err.response?.data?.message || 'Erro ao buscar as contas no Sienge.',
        variant: 'warning',
      });
    } finally {
      onSincronizando?.(false);
    }
  }

  useImperativeHandle(ref, () => ({ sincronizar }));

  const filtradas = useMemo(() => {
    const termo = search.trim().toLowerCase();
    if (!termo) return contas;
    return contas.filter((c) =>
      [c.numero_conta, c.nome, c.agencia, c.banco_nome, c.banco_numero, c.company_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(termo))
    );
  }, [contas, search]);

  // Atualiza a linha na hora e grava; se falhar, volta o que estava.
  async function alterar(conta, projetaDfc) {
    const k = chave(conta);
    setContas((atual) => atual.map((c) => (chave(c) === k ? { ...c, projeta_dfc: projetaDfc } : c)));
    setErroSalvar('');
    setPendentes((n) => n + 1);
    try {
      const salvo = await updateContaCorrenteDfc(empresaId, conta.company_id, conta.numero_conta, { projeta_dfc: projetaDfc });
      setContas((atual) => atual.map((c) => (chave(c) === k ? salvo : c)));
      setSalvoAlgumaVez(true);
    } catch (err) {
      setContas((atual) => atual.map((c) => (chave(c) === k ? conta : c)));
      setErroSalvar(err.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setPendentes((n) => n - 1);
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Landmark size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver as contas correntes.</p>
      </div>
    );
  }

  const statusSalvamento = pendentes > 0 ? 'salvando' : erroSalvar ? 'erro' : salvoAlgumaVez ? 'salvo' : null;
  const marcadas = contas.filter((c) => c.projeta_dfc).length;

  return (
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      <div className="-mt-1 mb-3 flex items-center justify-between gap-3 text-xs">
        <span className="text-gray-500">
          {contas.length > 0 && `${contas.length} conta(s) · ${marcadas} com Projeta DFC`}
        </span>
        {statusSalvamento && (
          <span aria-live="polite">
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
          </span>
        )}
      </div>

      {erroSalvar && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="status">
          {erroSalvar}
        </div>
      )}

      {carregando && contas.length === 0 ? (
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
          <div
            className={`${GRADE} sticky -top-6 z-20 rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700`}
          >
            <span>Conta</span>
            <span>Banco</span>
            <span>Agência</span>
            <span>Empresa</span>
            <span className="text-center">Projeta DFC</span>
            <span>Status</span>
          </div>

          {filtradas.length === 0 ? (
            <div className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
              {contas.length === 0
                ? 'Nenhuma conta bancária desta empresa. Use o ícone no canto direito, acima, para buscar no Sienge.'
                : 'Nenhuma conta encontrada para essa busca.'}
            </div>
          ) : (
            filtradas.map((conta) => {
              const ativa = conta.status === 'ENABLED';
              return (
                <div key={chave(conta)} className={`${GRADE} border-b border-gray-100 bg-white py-2 pl-4 pr-4 hover:bg-gray-50`}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-xs tabular-nums text-gray-400">{conta.numero_conta}</span>
                    <span className="min-w-0 truncate text-xs font-medium text-gray-800" title={conta.nome}>
                      {conta.nome || '—'}
                    </span>
                    {conta.tipo_descricao && conta.tipo_id !== 'B' && (
                      <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        {conta.tipo_descricao}
                      </span>
                    )}
                  </div>
                  <span className="min-w-0 truncate text-xs text-gray-700" title={conta.banco_nome}>
                    {conta.banco_numero && <span className="tabular-nums text-gray-400">{conta.banco_numero} · </span>}
                    {conta.banco_nome || '—'}
                  </span>
                  <span className="text-xs tabular-nums text-gray-700">{conta.agencia || '—'}</span>
                  <span className="min-w-0 truncate text-xs text-gray-600" title={conta.company_name}>
                    {conta.company_name || '—'}
                  </span>
                  <span className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={Boolean(conta.projeta_dfc)}
                      onChange={(e) => alterar(conta, e.target.checked)}
                      title="Projeta DFC"
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-100"
                    />
                  </span>
                  <span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        ativa ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {ativa ? 'Ativa' : 'Inativa'}
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
});

export default DfcContasCorrentesTab;
