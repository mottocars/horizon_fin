import { createContext, useContext } from 'react';

// Versões da DFC: a tela fica só leitura quando não há versão aberta (todos veem a última salva) ou quando uma
// versão antiga está sendo visualizada (aba Versões › Visualizar) — o mesmo da DRE (DreGerencial/leituraDre.js).
// As abas usam isto pra desativar o que grava; o backend recusa a gravação de qualquer jeito
// (dfc-versoes/contexto.js).
export const LeituraDfcContext = createContext({ somenteLeitura: false, motivo: '' });

export const useLeituraDfc = () => useContext(LeituraDfcContext);

// Desativa todo campo e botão de dentro (fieldset disabled) quando a DFC está só leitura — pras abas que são só
// edição (Centros Custos, Máscaras, Plano Contas, Contas, Parâmetros).
export function SoLeituraDfc({ children }) {
  const { somenteLeitura, motivo } = useLeituraDfc();
  return (
    <fieldset disabled={somenteLeitura} className="min-w-0" title={somenteLeitura ? motivo || 'Só leitura' : undefined}>
      {children}
    </fieldset>
  );
}
