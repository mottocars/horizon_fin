import { createContext, useContext } from 'react';

// Versões da DRE: a tela fica só leitura quando não há versão aberta (todos veem a última salva) ou quando
// uma versão antiga está sendo visualizada (aba Versões › Visualizar). As abas usam isto pra desativar o que
// grava; o backend recusa a gravação de qualquer jeito (dre-versoes/contexto.js).
export const LeituraDreContext = createContext({ somenteLeitura: false, motivo: '' });

export const useLeituraDre = () => useContext(LeituraDreContext);
