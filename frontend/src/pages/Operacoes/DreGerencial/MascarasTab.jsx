import { Tags } from 'lucide-react';
import MascaraItensEditor from '../../../components/MascaraItensEditor';

// Cadastro da Máscara DRE da empresa, direto na DRE POC Gerencial — antes só dava pra cadastrar
// em Cadastros → Máscaras (precisava sair da tela pra criar uma classificação e voltar pra usar
// na aba Plano de Contas). Mesmo componente reaproveitado nas outras telas com máscara
// (MascarasPage.jsx, RepassesCef/MascarasRepassesCef.jsx) — só tipo="DRE" fixo, é o único usado
// aqui (Categorias Orçamento e Plano de Contas não usam DFC/Pacotes/etc.).
export default function MascarasTab({ empresaId }) {
  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Tags size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver e cadastrar as Máscaras DRE.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      <MascaraItensEditor tipo="DRE" empresaId={empresaId} grupo="" itemLabel="Máscara DRE" />
    </div>
  );
}
