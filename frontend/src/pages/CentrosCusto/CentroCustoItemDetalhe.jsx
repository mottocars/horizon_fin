import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Card from '../../components/Card';
import CentroCustoEditor from './CentroCustoEditor';

// Cadastros > Centros de Custos > detalhe de um centro. O conteúdo (abas Cadastro e Histórico de
// Etapas) é o CentroCustoEditor — o mesmo da janela aberta pela aba Centros de Custos de
// Cronogramas Obras.
export default function CentroCustoItemDetalhe() {
  const { empresaId, siengeId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(`/cadastros/centros-de-custo/${empresaId}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Centros de Custo
      </button>

      <Card>
        <CentroCustoEditor key={`${empresaId}-${siengeId}`} empresaId={empresaId} siengeId={siengeId} />
      </Card>
    </div>
  );
}
