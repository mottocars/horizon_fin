import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Search } from 'lucide-react';
import Card from '../../components/Card';
import { listContas, gerarPlano } from '../../api/planosFinanceirosSienge.api';
import iconSienge from '../../assets/integracoes/sienge.svg';

const LIMIT = 2000;

function formatarCodigoMascara(codigo, larguras) {
  const digitos = String(codigo);
  const segmentos = [];
  let pos = 0;

  for (const largura of larguras) {
    if (pos >= digitos.length) break;
    if (!largura) {
      segmentos[segmentos.length - 1] += digitos.slice(pos);
      pos = digitos.length;
      break;
    }
    segmentos.push(digitos.slice(pos, pos + largura));
    pos += largura;
  }

  if (pos < digitos.length && segmentos.length > 0) {
    segmentos[segmentos.length - 1] += digitos.slice(pos);
  }

  return segmentos.length > 0 ? segmentos.join('.') : digitos;
}

export default function PlanoFinanceiroDetalhe() {
  const { empresaId } = useParams();
  const navigate = useNavigate();

  const [contas, setContas] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadContas = useCallback(
    async (searchTerm) => {
      setLoading(true);
      try {
        const result = await listContas(empresaId, { page: 1, limit: LIMIT, search: searchTerm });
        setContas(result.data);
        setTotal(result.pagination.total);
      } finally {
        setLoading(false);
      }
    },
    [empresaId]
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadContas(search);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, loadContas]);

  async function handleRefresh() {
    setError('');
    setRefreshing(true);
    try {
      await gerarPlano(Number(empresaId));
      await loadContas(search);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível atualizar o plano financeiro.');
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/cadastros/planos-financeiros')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Planos Financeiros
      </button>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <img src={iconSienge} alt="" className="h-6 w-6" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Plano de contas — Sienge</h2>
              <p className="text-xs text-gray-500">
                {total} conta(s) sincronizada(s)
              </p>
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
        ) : contas.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            Nenhuma conta encontrada.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="py-3 font-medium">Código</th>
                <th className="py-3 font-medium">Descrição</th>
                <th className="py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {contas.map((conta) => {
                const travada = conta.tp_conta === 'T';
                return (
                <tr
                  key={conta.sienge_id}
                  onClick={
                    travada
                      ? undefined
                      : () => navigate(`/cadastros/planos-financeiros/${empresaId}/${conta.sienge_id}`)
                  }
                  className={`border-b border-gray-50 last:border-0 ${
                    travada ? 'bg-primary-50' : 'cursor-pointer hover:bg-gray-50'
                  }`}
                >
                  <td className="py-3 text-gray-600">
                    {formatarCodigoMascara(conta.sienge_id, [
                      conta.mascara_nivel_1,
                      conta.mascara_nivel_2,
                      conta.mascara_nivel_3,
                      conta.mascara_nivel_4,
                      conta.mascara_nivel_5,
                      conta.mascara_nivel_6,
                      conta.mascara_nivel_7,
                    ])}
                  </td>
                  <td className="py-3 text-gray-900">{conta.name}</td>
                  <td className="py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        conta.fl_ativa === 'S'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {conta.fl_ativa === 'S' ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
