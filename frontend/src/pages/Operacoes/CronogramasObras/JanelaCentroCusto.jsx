import { useState } from 'react';
import Modal from '../../../components/Modal';
import { useConfirm } from '../../../confirm/ConfirmContext';
import CentroCustoEditor from '../../CentrosCusto/CentroCustoEditor';

// Janela com o cadastro de um centro de custo (CentroCustoEditor — o mesmo da página Cadastros >
// Centros de Custos, abas Cadastro e Histórico de Etapas): o atalho pra alterar o cadastro a partir
// das abas de Cronogramas Obras (pedido do usuário). `centro`: o centro aberto (null = fechada).
// `onSalvo`: depois de salvar (a aba recarrega). Fechar com alteração não salva pede confirmação.
export default function JanelaCentroCusto({ empresaId, centro, onFechar, onSalvo }) {
  const confirm = useConfirm();
  const [pendente, setPendente] = useState(false);

  async function fechar() {
    if (pendente) {
      const ok = await confirm({
        title: 'Descartar alterações',
        description: 'Há alterações não salvas neste centro de custo. Fechar mesmo assim?',
        confirmLabel: 'Descartar',
        variant: 'danger',
      });
      if (!ok) return;
    }
    setPendente(false);
    onFechar();
  }

  return (
    <Modal open={Boolean(centro)} onClose={fechar} title="Cadastro do Centro de Custo" maxWidthClass="max-w-5xl">
      {centro && (
        <CentroCustoEditor
          key={centro.sienge_id}
          empresaId={empresaId}
          siengeId={centro.sienge_id}
          onSalvo={onSalvo}
          onAlteracoesPendentes={setPendente}
        />
      )}
    </Modal>
  );
}
