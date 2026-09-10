import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Boxes, Pencil, Ban, CheckCircle2 } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import IconButton from '../../../components/IconButton';
import Pagination from '../../../components/Pagination';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmailIntegracoes, setEmailStatus } from '../../../api/emailIntegracao.api';
import { formatCnpj } from '../../Empresas/format';
import { useConfirm } from '../../../confirm/ConfirmContext';

const LIMIT = 8;

// Mesmo padrão de SiengeList.jsx (lista + busca + filtro de status + paginação).
export default function EmailList() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todas');
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const loadItems = useCallback(async (page, searchTerm, status) => {
    setLoading(true);
    try {
      const ativo = status === 'ativas' ? true : status === 'inativas' ? false : undefined;
      const result = await listEmailIntegracoes({ page, limit: LIMIT, search: searchTerm, ativo });
      setItems(result.data);
      setPagination(result.pagination);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadItems(1, search, statusFilter);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, statusFilter, loadItems]);

  async function handleToggleStatus(item) {
    const novoStatus = !item.ativo;
    const acao = novoStatus ? 'reativar' : 'desativar';
    const confirmado = await confirm({
      title: `${novoStatus ? 'Reativar' : 'Desativar'} conexão`,
      description: `Deseja realmente ${acao} a conexão de e-mail "${item.nome_conexao}" (${item.empresa_razao_social})?`,
      confirmLabel: novoStatus ? 'Reativar' : 'Desativar',
      variant: novoStatus ? 'default' : 'warning',
    });
    if (!confirmado) return;

    setTogglingId(item.id);
    try {
      await setEmailStatus(item.id, novoStatus);
      loadItems(pagination.page, search, statusFilter);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por empresa, conexão, e-mail ou host..."
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
          <Button onClick={() => navigate('/integracoes/email/nova')}>
            <Plus size={16} />
            Nova Conexão
          </Button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-400">
            <Boxes size={28} className="text-gray-300" />
            Nenhuma conexão encontrada.
          </div>
        ) : (
          <>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-3 font-medium">Empresa</th>
                  <th className="py-3 font-medium">CNPJ</th>
                  <th className="py-3 font-medium">Nome da conexão</th>
                  <th className="py-3 font-medium">Host</th>
                  <th className="py-3 font-medium">E-mail</th>
                  <th className="py-3 font-medium">Status</th>
                  <th className="py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 text-gray-900">{item.empresa_razao_social}</td>
                    <td className="py-3 text-gray-600">{formatCnpj(item.empresa_cnpj)}</td>
                    <td className="py-3 text-gray-600">{item.nome_conexao}</td>
                    <td className="py-3 text-gray-600">
                      {item.host}:{item.porta}
                    </td>
                    <td className="py-3 text-gray-600">{item.email}</td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          item.ativo ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {item.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-1">
                        <IconButton title="Editar" onClick={() => navigate(`/integracoes/email/${item.id}`)}>
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton
                          title={item.ativo ? 'Desativar' : 'Reativar'}
                          onClick={() => handleToggleStatus(item)}
                          disabled={togglingId === item.id}
                          className={
                            item.ativo ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-emerald-50 hover:text-emerald-600'
                          }
                        >
                          {item.ativo ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              onChange={(page) => loadItems(page, search, statusFilter)}
            />
          </>
        )}
      </Card>
    </div>
  );
}
