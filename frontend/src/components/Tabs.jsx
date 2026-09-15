// Abas no estilo "navegador" (Chrome): cantos de cima arredondados "pra
// dentro" (border-radius normal) e, na aba ativa, cantos de baixo curvados
// "pra fora" — o clássico recorte côncavo que faz a aba parecer que se
// funde com o painel abaixo, em vez de encostar nele com um ângulo reto.
// O recorte é feito com dois pontinhos (spans) com radial-gradient: dentro
// do raio fica transparente (mostra o fundo por trás da barra de abas),
// fora do raio fica branco (cor do painel), criando a curva invertida.
// (As classes bg-[radial-gradient(...)] precisam ficar como texto literal
// pra ferramenta de build do Tailwind conseguir encontrá-las no código.)
// Usado junto com <Card className="rounded-tl-none"> como painel: o canto
// superior esquerdo do painel fica reto de propósito, pra encaixar direto
// com o canto inferior esquerdo da primeira aba (sempre reto também, sem
// CantoInvertido do lado esquerdo — ver abaixo). A barra de abas não tem
// padding à esquerda (sem `pl-*`) justamente pra isso: a borda esquerda do
// botão da primeira aba cai exatamente em cima da borda esquerda do painel
// — mesma coluna, sem vão nem curva sobrando — fazendo a aba parecer
// fisicamente parte do painel, não só um elemento em cima dele.
function CantoInvertido({ className }) {
  return <span aria-hidden="true" className={`pointer-events-none absolute bottom-0 h-2 w-2 ${className}`} />;
}

// Um item `{ divider: true }` no meio da lista de `tabs` desenha uma
// pequena linha vertical ali (não é uma aba clicável) — usado pra agrupar
// visualmente abas relacionadas (ex.: "operacional" vs. "parâmetros" em
// GestaoCobrancasPage.jsx), sem precisar de duas barras de abas separadas.
function Divisor() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 self-center bg-gray-400" />;
}

export default function Tabs({ tabs, activeId, onChange, className = '' }) {
  return (
    <div role="tablist" className={`flex items-end gap-2 border-b border-gray-200 pr-1 ${className}`}>
      {tabs.map((tab, i) => {
        if (tab.divider) return <Divisor key={`divisor-${i}`} />;
        const Icon = tab.icon;
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative -mb-px flex items-center gap-2 rounded-t-xl border border-b-0 px-4 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'border-gray-200 bg-white text-gray-900'
                : 'border-transparent text-gray-500 hover:bg-gray-100/70 hover:text-gray-700'
            }`}
          >
            {active && (
              <>
                {/* A primeira aba nunca ganha a curva do lado esquerdo — o
                    canto inferior esquerdo dela fica sempre reto, pra
                    encaixar direto no canto superior esquerdo (também reto,
                    `rounded-tl-none`) do painel abaixo, sem vão nem curva
                    sobrando entre os dois. */}
                {i !== 0 && (
                  <CantoInvertido className="-left-2 bg-[radial-gradient(circle_at_0_0,_transparent_8px,_white_8px)]" />
                )}
                <CantoInvertido className="-right-2 bg-[radial-gradient(circle_at_100%_0,_transparent_8px,_white_8px)]" />
              </>
            )}
            {/* `iconColorClass` deixa uma aba com o ícone numa cor fixa própria
                (ex.: cada estado de nota no Espião NFe/NFSe com sua cor),
                em vez do padrão "azul quando ativa, cinza quando não" — a
                cor fica só no ícone, o resto da aba continua neutro. */}
            {Icon && (
              <Icon size={15} className={tab.iconColorClass ?? (active ? 'text-primary-600' : 'text-gray-400')} />
            )}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
