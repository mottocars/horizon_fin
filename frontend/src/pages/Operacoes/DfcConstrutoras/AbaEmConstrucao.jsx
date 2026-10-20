// Conteúdo provisório de cada aba de DFC Construtoras — as abas já existem (pedido do usuário),
// o que cada uma mostra será definido depois. Mesmo card de "Selecione uma empresa" de DreTab.jsx
// (rounded-tl-none pra encaixar embaixo da aba ativa). Também usado pelas abas de Cronogramas Obras.
export default function AbaEmConstrucao({ empresaId, icon: Icon, titulo }) {
  return (
    <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
      <Icon size={28} className="mb-3 text-gray-300" />
      {empresaId ? (
        <>
          <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
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
