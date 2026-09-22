// Painel-espaço-reservado pras abas Bancos/Contas Bancárias/Configurações — mesmo visual de
// "Em breve" do ComingSoon.jsx (usado nas telas inteiras "em desenvolvimento" do App.jsx),
// só que com `rounded-tl-none`, porque aqui o painel fica colado embaixo da barra de abas
// (mesma convenção de SaldosContasTab.jsx e do resto do app com abas — ver Tabs.jsx).
export default function AbaEmConstrucao({ icon: Icon, titulo, descricao }) {
  return (
    <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
      <Icon size={28} className="mb-3 text-gray-300" />
      <span className="mb-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary-600">
        Em breve
      </span>
      <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
      {descricao && <p className="mt-1 max-w-sm text-xs text-gray-500">{descricao}</p>}
    </div>
  );
}
