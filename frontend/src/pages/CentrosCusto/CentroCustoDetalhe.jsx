import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, RefreshCw, Search } from 'lucide-react';
import Card from '../../components/Card';
import { listItens, gerarCentrosCusto, exportarCentrosCusto } from '../../api/centrosCustoSienge.api';
import iconSienge from '../../assets/integracoes/sienge.svg';

const LIMIT = 2000;

export default function CentroCustoDetalhe() {
  const { empresaId } = useParams();
  const navigate = useNavigate();

  const [itens, setItens] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const loadItens = useCallback(
    async (searchTerm) => {
      setLoading(true);
      try {
        const result = await listItens(empresaId, { page: 1, limit: LIMIT, search: searchTerm });
        setItens(result.data);
        setTotal(result.pagination.total);
      } finally {
        setLoading(false);
      }
    },
    [empresaId]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadItens(search);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, loadItens]);

  async function handleRefresh() {
    setError('');
    setRefreshing(true);
    try {
      await gerarCentrosCusto(Number(empresaId));
      await loadItens(search);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível atualizar os centros de custo.');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleExport() {
    setError('');
    setExporting(true);
    try {
      const blob = await exportarCentrosCusto(empresaId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `centros-de-custo-empresa-${empresaId}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível exportar os centros de custo.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/cadastros/centros-de-custo')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Centros de Custo
      </button>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <img src={iconSienge} alt="" className="h-6 w-6" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Centros de custo — Sienge</h2>
              <p className="text-xs text-gray-500">{total} item(ns) sincronizado(s)</p>
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
                placeholder="Buscar por código ou descrição..."
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || itens.length === 0}
              title="Exportar para Excel"
              className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              <Download size={16} className={exporting ? 'animate-pulse' : ''} />
              Exportar
            </button>
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

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : itens.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            Nenhum centro de custo encontrado.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="py-3 font-medium">Código</th>
                <th className="py-3 font-medium">Descrição</th>
                <th className="py-3 font-medium">CNPJ</th>
                <th className="py-3 font-medium">Empresa</th>
                <th className="py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr
                  key={item.sienge_id}
                  onClick={() => navigate(`/cadastros/centros-de-custo/${empresaId}/${item.sienge_id}`)}
                  className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50"
                >
                  <td className="py-3 text-gray-600">{item.sienge_id}</td>
                  <td className="py-3">
                    <div className="text-gray-900">{item.name}</div>
                    {item.apelido && <div className="text-xs text-gray-400">{item.apelido}</div>}
                  </td>
                  <td className="py-3 text-gray-600">{item.cnpj || '—'}</td>
                  <td className="py-3 text-gray-600">{item.company_name || '—'}</td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        item.status === 'ATIVO'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {item.status === 'ATIVO' ? 'Ativo' : 'Inativo'}
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
