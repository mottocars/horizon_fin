import { useEffect, useRef } from 'react';
import { registrarAcesso } from '../api/logsAcesso.api';
import { resolveTelaCanonica } from '../config/telas';

// Registra uma visita por tela canônica visitada (ver resolveTelaCanonica) —
// navegar entre sub-rotas da mesma tela (ex.: filtrar uma lista) não conta
// como um novo acesso, só a troca de tela conta. Falha de rede aqui nunca
// pode quebrar a navegação, por isso o catch silencioso.
export function useLogAcesso(pathname, ativo = true) {
  const ultimaTelaRef = useRef(null);

  useEffect(() => {
    if (!ativo) return;
    const tela = resolveTelaCanonica(pathname);
    if (!tela || tela === ultimaTelaRef.current) return;
    ultimaTelaRef.current = tela;
    registrarAcesso(tela).catch(() => {});
  }, [pathname, ativo]);
}
