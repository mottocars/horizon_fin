import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Users as UsersIcon, Crown, ShieldCheck, User as UserIcon } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Pagination from '../../components/Pagination';
import SearchableSelect from '../../components/SearchableSelect';
import { listUsuarios } from '../../api/usuarios.api';
import { useAuth } from '../../auth/AuthContext';
import { podeCriarUsuario } from '../../utils/permissoes';

const LIMIT = 8;

const PERMISSAO_INFO = {
  MASTER: { label: 'Master', className: 'bg-purple-50 text-purple-600', Icon: Crown },
  ADMINISTRADOR: { label: 'Administrador', className: 'bg-blue-50 text-blue-600', Icon: ShieldCheck },
  BASICO: { label: 'Básico', className: 'bg-gray-100 text-gray-600', Icon: UserIcon },
};

export default function UsuariosList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const podeCriar = podeCriarUsuario(user);
  // Só Master vê usuários de todas as empresas — Administrador e Básico só
  // enxergam quem é da própria empresa, e nem faz sentido mostrar a coluna
  // Empresa pra eles (é sempre a mesma).
  const isMaster = user?.permissao === 'MASTER';
  const [usuarios, setUsuarios] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [loading, setLoading] = useState(false);

  // O backend já restringe sozinho (empresas em comum + esconde Master) —
  // não precisa mandar nenhum filtro daqui.
  const loadUsuarios = useCallback(async (page, searchTerm, status) => {
    setLoading(true);
    try {
      const ativo = status === 'ativos' ? true : status === 'inativos' ? false : undefined;
      const result = await listUsuarios({ page, limit: LIMIT, search: searchTerm, ativo });
      setUsuarios(result.data);
      setPagination(result.pagination);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadUsuarios(1, search, statusFilter);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, statusFilter, loadUsuarios]);

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
                placeholder="Buscar por nome, e-mail ou usuário..."
                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div className="w-40">
              <SearchableSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: 'todos', label: 'Todos' },
                  { value: 'ativos', label: 'Ativos' },
                  { value: 'inativos', label: 'Inativos' },
                ]}
                clearable={false}
              />
            </div>
          </div>
          {podeCriar && (
            <Button onClick={() => navigate('/cadastros/usuarios/novo')}>
              <Plus size={16} />
              Novo Usuário
            </Button>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : usuarios.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-400">
            <UsersIcon size={28} className="text-gray-300" />
            Nenhum usuário encontrado.
          </div>
        ) : (
          <>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-3 font-medium">Nome</th>
                  {isMaster && <th className="py-3 font-medium">Empresas</th>}
                  <th className="py-3 font-medium">Permissão</th>
                  <th className="py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => {
                  const permissao = PERMISSAO_INFO[usuario.permissao] || PERMISSAO_INFO.BASICO;
                  const PermissaoIcon = permissao.Icon;
                  // Ninguém pode se editar por aqui — evita o usuário mudar
                  // a própria permissão/telas e se dar mais acesso do que devia.
                  const isSelf = String(usuario.id) === String(user?.id);
                  return (
                    <tr
                      key={usuario.id}
                      onClick={isSelf ? undefined : () => navigate(`/cadastros/usuarios/${usuario.id}`)}
                      title={isSelf ? 'Você não pode editar seu próprio usuário por aqui.' : undefined}
                      className={`border-b border-gray-50 last:border-0 ${
                        isSelf ? 'cursor-default' : 'cursor-pointer hover:bg-gray-50'
                      }`}
                    >
                      <td className="py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-50 text-primary-600">
                            {usuario.avatar_url ? (
                              <img src={usuario.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <UserIcon size={14} />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 text-gray-900">
                              {usuario.nome}
                              {isSelf && (
                                <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                  Você
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400">
                              {usuario.email}
                              {usuario.username && ` · @${usuario.username}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      {isMaster && (
                        <td className="py-3 text-gray-600">
                          {usuario.permissao === 'MASTER'
                            ? 'Todas as empresas'
                            : usuario.empresa_nomes?.length
                              ? usuario.empresa_nomes.join(', ')
                              : '—'}
                        </td>
                      )}
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${permissao.className}`}
                        >
                          <PermissaoIcon size={12} />
                          {permissao.label}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                            usuario.ativo ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {usuario.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              onChange={(page) => loadUsuarios(page, search, statusFilter)}
            />
          </>
        )}
      </Card>
    </div>
  );
}
