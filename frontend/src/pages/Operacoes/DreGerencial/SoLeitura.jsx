import { useLeituraDre } from './leituraDre';

// Desativa todo campo e botão de dentro (fieldset disabled) quando a DRE está só leitura — sem versão aberta ou
// visualizando uma versão antiga (leituraDre.js). Pras abas que são só edição (Centros Custos, Máscaras,
// Orçamento, Configurações, a tabela do Plano Contas). O backend recusa a gravação de qualquer jeito.
export default function SoLeitura({ children }) {
  const { somenteLeitura } = useLeituraDre();
  return (
    <fieldset disabled={somenteLeitura} className="min-w-0" title={somenteLeitura ? 'Só leitura' : undefined}>
      {children}
    </fieldset>
  );
}
