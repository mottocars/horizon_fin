import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2 } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { listCentrosGerados } from '../../api/centrosCustoSienge.api';
import { formatCnpj } from '../Empresas/format';
import iconSienge from '../../assets/integracoes/sienge.svg';
import GerarCentroCustoModal from './GerarCentroCustoModal';
import { useEmpresaTravada } from '../../hooks/useEmpresaTravada';

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CentrosCustoList() {
  const navigate = useNavigate();
  const { empresaIds } = useEmpresaTravada();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listCentrosGerados();
      setItems(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  function handleGerado(result) {
    setModalOpen(false);
    loadItems();
    navigate(`/cadastros/centros-de-custo/${result.empresa_id}`);
  }

  // Quem não é Master só vê as próprias empresas nesta lista.
  const itemsVisiveis = empresaIds
    ? items.filter((item) => empresaIds.includes(String(item.empresa_id)))
    : items;

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Centros de custo gerados</h2>
            <p className="text-xs text-gray-500">
              Centros de custo importados por empresa a partir dos sistemas integrados.
            </p>
          </div>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            Gerar Centros de Custo
          </Button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : itemsVisiveis.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-gray-400">
            <Building2 size={28} className="text-gray-300" />
            Nenhum centro de custo gerado ainda.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="py-3 font-medium">Sistema</th>
                <th className="py-3 font-medium">Empresa</th>
                <th className="py-3 font-medium">CNPJ</th>
                <th className="py-3 font-medium">Itens</th>
                <th className="py-3 font-medium">Atualizado em</th>
              </tr>
            </thead>
            <tbody>
              {itemsVisiveis.map((item) => (
                <tr
                  key={item.empresa_id}
                  onClick={() => navigate(`/cadastros/centros-de-custo/${item.empresa_id}`)}
                  className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50"
                >
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <img src={iconSienge} alt="" className="h-5 w-5" />
                      <span className="text-gray-900">Sienge</span>
                    </div>
                  </td>
                  <td className="py-3 text-gray-900">{item.empresa_razao_social}</td>
                  <td className="py-3 text-gray-600">{formatCnpj(item.empresa_cnpj)}</td>
                  <td className="py-3 text-gray-600">{item.total_itens}</td>
                  <td className="py-3 text-gray-600">{formatDateTime(item.atualizado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <GerarCentroCustoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onGerado={handleGerado}
      />
    </div>
  );
}
