import { Percent } from 'lucide-react';

// Operações > DRE Gerencial > POC (logo depois da DRE, antes do divisor). Por enquanto só a casca da
// aba — o conteúdo ainda vai ser definido pelo usuário. As regras da POC (máscara da POC de Receita,
// fração ideal da POC de Despesa) ficam na aba Configurações.
export default function PocTab({ empresaId }) {
  return (
    <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
      <Percent size={28} className="mb-3 text-gray-300" />
      {empresaId ? (
        <>
          <h2 className="text-sm font-semibold text-gray-900">POC</h2>
          <p className="mt-1 max-w-sm text-xs text-gray-500">Percentual de obra concluída por obra.</p>
        </>
      ) : (
        <>
          <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
          <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver a POC.</p>
        </>
      )}
    </div>
  );
}
