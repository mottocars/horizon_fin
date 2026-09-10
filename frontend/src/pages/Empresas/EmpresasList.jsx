import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Building } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Pagination from '../../components/Pagination';
import SearchableSelect from '../../components/SearchableSelect';
import { listEmpresas } from '../../api/empresas.api';
import { formatCnpj } from './format';
import { useAuth } from '../../auth/AuthContext';

const LIMIT = 8;

export default function EmpresasList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMaster = user?.permissao === 'MASTER';
  const [empresas, setEmpresas] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todas');
  const [loading, setLoading] = useState(false);

  // O backend já restringe sozinho às empresas do usuário quando ele não é
  // Master — não precisa mandar nenhum filtro daqui.
  const loadEmpresas = useCallback(async (page, searchTerm, status) => {
    setLoading(true);
    try {
      const ativo = status === 'ativas' ? true : status === 'inativas' ? false : undefined;
      const result = await listEmpresas({ page, limit: LIMIT, search: searchTerm, ativo });
      setEmpresas(result.data);
      setPagination(result.pagination);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadEmpresas(1, search, statusFilter);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, statusFilter, loadEmpresas]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por razão social, fantasia ou CNPJ..."
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div className="w-40">
              <SearchableSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'todas', label: 'Todas' },
                  { value: 'ativas', label: 'Ativas' },
                  { value: 'inativas', label: 'Inativas' },
                ]}
                clearable={false}
              />
            </div>
          </div>
          {isMaster && (
            <Button onClick={() => navigate('/cadastros/empresas/nova')}>
              <Plus size={16} />
              Nova Empresa
            </Button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : empresas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-400">
            <Building size={28} className="text-gray-300" />
            Nenhuma empresa encontrada.
          </div>
        ) : (
          <>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-3 font-medium">Razão Social</th>
                  <th className="py-3 font-medium">CNPJ</th>
                  <th className="py-3 font-medium">Cidade/UF</th>
                  <th className="py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map((empresa) => (
                  <tr
                    key={empresa.id}
                    onClick={() => navigate(`/cadastros/empresas/${empresa.id}`)}
                    className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50"
                  >
                    <td className="py-3">
                      <div className="text-gray-900">{empresa.razao_social}</div>
                      {empresa.nome_fantasia && (
                        <div className="text-xs text-gray-400">{empresa.nome_fantasia}</div>
                      )}
                    </td>
                    <td className="py-3 text-gray-600">{formatCnpj(empresa.cnpj)}</td>
                    <td className="py-3 text-gray-600">
                      {empresa.cidade ? `${empresa.cidade}/${empresa.estado}` : '—'}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          empresa.ativo
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {empresa.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              onChange={(page) => loadEmpresas(page, search, statusFilter)}
            />
          </>
        )}
      </Card>
    </div>
  );
}
