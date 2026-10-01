import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Boxes, Pencil, Ban, CheckCircle2 } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import IconButton from '../../../components/IconButton';
import SearchableSelect from '../../../components/SearchableSelect';
import { listVanpixIntegracoes, setVanpixStatus } from '../../../api/vanpix.api';
import { listItauIntegracoes, setItauStatus } from '../../../api/itau.api';
import { formatCnpj } from '../../Empresas/format';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { STATUS_ITAU } from './camposConexao';

const LIMITE_POR_TIPO = 100;

// Cada tipo de conexão tem tabela/API própria (VanPix, API Itaú).
const TIPOS = {
  VANPIX: {
    rotulo: 'VanPix',
    classes: 'bg-primary-50 text-primary-600',
    setStatus: setVanpixStatus,
    rota: (id) => `/integracoes/contas-bancarias/${id}`,
  },
  ITAU: {
    rotulo: 'API Itaú',
    classes: 'bg-orange-50 text-orange-600',
    setStatus: setItauStatus,
    rota: (id) => `/integracoes/contas-bancarias/itau/${id}`,
  },
};

// Selo extra da conexão Itaú: a situação (conexoes_itau.status) e, com certificado, o vencimento.
function avisoItau(item) {
  if (item.certificado_vencido) return { rotulo: 'Certificado vencido', classes: 'bg-red-50 text-red-700' };
  if (item.pode_renovar) return { rotulo: 'Renovar certificado', classes: 'bg-amber-50 text-amber-700' };
  return STATUS_ITAU[item.status] || null;
}

function descricaoItens(item) {
  if (item.tipo === 'ITAU') {
    return item.identificador_conta
      ? { texto: `Ag. ${item.agencia} · CC ${item.conta}-${item.dac}`, titulo: `Identificador: ${item.identificador_conta}` }
      : { texto: 'Sem conta', titulo: 'Cadastre a conta na tela da conexão.' };
  }
  const n = item.apelidos.length;
  return { texto: `${n} convênio${n === 1 ? '' : 's'}`, titulo: item.apelidos.join(', ') };
}

// Mesmo padrão de ZapiList.jsx (lista + busca + filtro de status), mas sem paginação: busca os dois
// tipos de conexão (são poucas por empresa, então vem tudo de uma vez), junta, ordena pela
// criação e mostra tudo numa lista só.
export default function ConveniosBancariosList() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [todos, setTodos] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todas');
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState(null);

  const loadItems = useCallback(async (searchTerm, status) => {
    setLoading(true);
    try {
      const ativo = status === 'ativas' ? true : status === 'inativas' ? false : undefined;
      const filtros = { page: 1, limit: LIMITE_POR_TIPO, search: searchTerm, ativo };
      const [vanpix, itau] = await Promise.all([listVanpixIntegracoes(filtros), listItauIntegracoes(filtros)]);
      const juntos = [
        ...vanpix.data.map((i) => ({ ...i, tipo: 'VANPIX' })),
        ...itau.data.map((i) => ({ ...i, nome_conexao: i.nome, tipo: 'ITAU' })),
      ].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
      setTodos(juntos);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadItems(search, statusFilter);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, statusFilter, loadItems]);

  async function handleToggleStatus(item) {
    const novoStatus = !item.ativo;
    const acao = novoStatus ? 'reativar' : 'desativar';
    const confirmado = await confirm({
      title: `${novoStatus ? 'Reativar' : 'Desativar'} conexão`,
      description: `Deseja realmente ${acao} a conexão "${item.nome_conexao}" (${item.empresa_razao_social})?`,
      confirmLabel: novoStatus ? 'Reativar' : 'Desativar',
      variant: novoStatus ? 'default' : 'warning',
    });
    if (!confirmado) return;

    setTogglingId(`${item.tipo}-${item.id}`);
    try {
      await TIPOS[item.tipo].setStatus(item.id, novoStatus);
      loadItems(search, statusFilter);
    } finally {
      setTogglingId(null);
    }
  }

  const items = todos;

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
                placeholder="Buscar por empresa ou conexão..."
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
          <Button onClick={() => navigate('/integracoes/contas-bancarias/nova')}>
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
                  <th className="py-3 font-medium">Tipo</th>
                  <th className="py-3 font-medium">Convênios / Contas</th>
                  <th className="py-3 font-medium">Status</th>
                  <th className="py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const tipo = TIPOS[item.tipo];
                  const chave = `${item.tipo}-${item.id}`;
                  const itens = descricaoItens(item);
                  const avisoCert = item.tipo === 'ITAU' ? avisoItau(item) : null;
                  return (
                    <tr key={chave} className="border-b border-gray-50 last:border-0">
                      <td className="py-3 text-gray-900">{item.empresa_razao_social}</td>
                      <td className="py-3 text-gray-600">{formatCnpj(item.empresa_cnpj)}</td>
                      <td className="py-3 text-gray-600">{item.nome_conexao}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tipo.classes}`}>
                          {tipo.rotulo}
                        </span>
                      </td>
                      <td className="py-3 text-gray-600">
                        <span title={itens.titulo}>{itens.texto}</span>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                              item.ativo ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {item.ativo ? 'Ativa' : 'Inativa'}
                          </span>
                          {avisoCert && (
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${avisoCert.classes}`}>
                              {avisoCert.rotulo}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-1">
                          <IconButton title="Editar" onClick={() => navigate(tipo.rota(item.id))}>
                            <Pencil size={16} />
                          </IconButton>
                          <IconButton
                            title={item.ativo ? 'Desativar' : 'Reativar'}
                            onClick={() => handleToggleStatus(item)}
                            disabled={togglingId === chave}
                            className={
                              item.ativo ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-emerald-50 hover:text-emerald-600'
                            }
                          >
                            {item.ativo ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  );
}
