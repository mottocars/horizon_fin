import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Landmark, RefreshCw, Search } from 'lucide-react';
import Card from '../../components/Card';
import SearchableSelect from '../../components/SearchableSelect';
import { listContas, gerarContasBancarias } from '../../api/contasBancariasSienge.api';
import iconSienge from '../../assets/integracoes/sienge.svg';

const LIMIT = 2000;

const STATUS_OPCOES = [
  { value: 'ENABLED', label: 'Ativa' },
  { value: 'DISABLED', label: 'Inativa' },
];

export default function ContaBancariaDetalhe() {
  const { empresaId } = useParams();
  const navigate = useNavigate();

  const [contas, setContas] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFiltro, setStatusFiltro] = useState([]);
  const [empresasFiltro, setEmpresasFiltro] = useState([]);
  const [empresasOpcoes, setEmpresasOpcoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadContas = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listContas(empresaId, {
        page: 1,
        limit: LIMIT,
        search,
        status: statusFiltro,
        companyIds: empresasFiltro,
      });
      setContas(result.data);
      setTotal(result.pagination.total);
      setEmpresasOpcoes(
        result.empresas.map((e) => ({
          value: String(e.company_id),
          label: e.company_name || `Empresa ${e.company_id}`,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [empresaId, search, statusFiltro, empresasFiltro]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadContas();
    }, 300);
    return () => clearTimeout(timeout);
  }, [loadContas]);

  const temFiltro = statusFiltro.length > 0 || empresasFiltro.length > 0;

  function limparFiltros() {
    setStatusFiltro([]);
    setEmpresasFiltro([]);
  }

  async function handleRefresh() {
    setError('');
    setRefreshing(true);
    try {
      await gerarContasBancarias(Number(empresaId));
      await loadContas();
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível atualizar as contas bancárias.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/cadastros/contas-bancarias')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Contas Bancárias
      </button>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <img src={iconSienge} alt="" className="h-6 w-6" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Contas bancárias — Sienge</h2>
              <p className="text-xs text-gray-500">{total} conta(s) sincronizada(s)</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por conta, nome ou banco..."
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Atualizar a partir do Sienge"
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:w-64">
            <SearchableSelect
              multiple
              value={statusFiltro}
              onChange={setStatusFiltro}
              options={STATUS_OPCOES}
              placeholder="Todos os status"
            />
          </div>
          <div className="w-full sm:w-72">
            <SearchableSelect
              multiple
              value={empresasFiltro}
              onChange={setEmpresasFiltro}
              options={empresasOpcoes}
              placeholder="Todas as empresas"
            />
          </div>
          {temFiltro && (
            <button
              type="button"
              onClick={limparFiltros}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : contas.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            Nenhuma conta bancária encontrada.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="py-3 font-medium">Conta</th>
                <th className="py-3 font-medium">Empresa</th>
                <th className="py-3 font-medium">Tipo</th>
                <th className="py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((conta) => (
                <tr
                  key={`${conta.numero_conta}-${conta.company_id}`}
                  onClick={() =>
                    navigate(
                      `/cadastros/contas-bancarias/${empresaId}/${conta.company_id}/${encodeURIComponent(conta.numero_conta)}`
                    )
                  }
                  className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                >
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                        <Landmark size={15} />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{conta.nome || '—'}</div>
                        <div className="text-xs text-gray-400">{conta.numero_conta}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-gray-600">{conta.company_name || '—'}</td>
                  <td className="py-3">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                      {conta.tipo_descricao || '—'}
                    </span>
                  </td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        conta.status === 'ENABLED'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {conta.status === 'ENABLED' ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
