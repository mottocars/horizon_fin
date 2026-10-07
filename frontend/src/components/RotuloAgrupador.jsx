import { Minus, Plus } from 'lucide-react';

// Rótulo das células agrupadas dos relatórios em matriz (Empreendimentos Masa,
// Repasses CEF): botão de abrir/recolher, nome e contagem. Em tela grande,
// tudo numa linha (como sempre foi); em tela menor (colunas agrupadoras
// estreitas pra tabela caber — ver o <thead> de cada relatório), ícone e
// contagem sobem pra uma linha própria e o nome ganha a largura inteira da
// célula embaixo, quebrando entre palavras (com hifenização) em vez de
// letra a letra. `grudado` = nome acompanha a rolagem (sticky) — só nas
// células que agrupam várias linhas.
export default function RotuloAgrupador({ aberto, nome, contagem, onClick, negrito = false, topoGrudado }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={topoGrudado != null ? { top: topoGrudado } : undefined}
      className={`${topoGrudado != null ? 'sticky ' : ''}flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left 2xl:flex-nowrap 2xl:items-start`}
    >
      <span className="order-1 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
        {aberto ? <Minus size={10} /> : <Plus size={10} />}
      </span>
      <span className="order-2 ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200 2xl:order-3 2xl:ml-0">
        {contagem}
      </span>
      <span
        className={`order-3 basis-full hyphens-auto break-words text-xs 2xl:order-2 2xl:basis-auto 2xl:flex-1 ${
          negrito ? 'font-semibold text-gray-900' : 'text-gray-700'
        }`}
      >
        {nome || <span className="text-gray-300">—</span>}
      </span>
    </button>
  );
}
