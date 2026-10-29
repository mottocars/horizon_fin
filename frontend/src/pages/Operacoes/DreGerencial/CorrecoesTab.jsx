import { FilePenLine } from 'lucide-react';

// Operações > DRE Gerencial > Correções: a aba já existe (pedido do usuário), o que ela mostra
// será definido depois — mesmo card provisório das abas da DFC Construtoras (AbaEmConstrucao.jsx).
export default function CorrecoesTab({ empresaId }) {
  return (
    <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
      <FilePenLine size={28} className="mb-3 text-gray-300" />
      {empresaId ? (
        <>
          <h2 className="text-sm font-semibold text-gray-900">Correções</h2>
          <p className="mt-1 max-w-sm text-xs text-gray-500">Em construção.</p>
        </>
      ) : (
        <>
          <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
          <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima.</p>
        </>
      )}
    </div>
  );
}
