// Cabeçalho dos Dashboards (pedido do usuário, no esquema do painel-cfo.html de referência, um pouco
// menor): linha pequena em caixa-alta com o nome do dashboard, o título da tela embaixo, filete escuro
// fechando o cabeçalho e, à direita, etiquetas com o contexto (filtros em uso — os filtros ficam
// escondidos no painel do botão).
// `etiquetas`: [{ rotulo, valor }].
export default function CabecalhoDashboard({ dashboard, titulo, etiquetas = [] }) {
  return (
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b-2 border-[#13202a] pb-2.5">
      <div className="min-w-0">
        <div className="font-display text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b7780] [font-stretch:125%]">{dashboard}</div>
        <h1 className="font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.01em] text-[#13202a] [font-stretch:112%]">{titulo}</h1>
      </div>
      {etiquetas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {etiquetas.map((e) => (
            <span
              key={e.rotulo}
              className="whitespace-nowrap rounded-full border border-[#d3dade] bg-[#fbfcfc] px-2 py-0.5 font-mono text-[11px] text-[#44525c]"
            >
              {e.rotulo} <b className="font-medium text-[#13202a]">{e.valor}</b>
            </span>
          ))}
        </div>
      )}
    </header>
  );
}
