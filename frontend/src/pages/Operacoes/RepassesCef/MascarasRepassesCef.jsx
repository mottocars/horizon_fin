import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import MascaraItensEditor from '../../../components/MascaraItensEditor';
import { MACRO_ETAPAS_REPASSES } from '../../../config/macroEtapasRepasses';

// Cadastro das micro etapas de cada macro etapa do Kanban (máscara tipo
// REPASSES) — migrado de Cadastros/Máscaras pra cá de propósito, igualzinho
// ao que era lá: mesmo componente (MascaraItensEditor), mesmo agrupamento
// por macro etapa (MACRO_ETAPAS_REPASSES), mesmo comportamento de
// expandir/rolar.
export default function MascarasRepassesCef({ empresaId }) {
  const [expandidos, setExpandidos] = useState(new Set());
  const macroCardRefs = useRef(new Map());
  const macroAbertaRef = useRef(null);

  function toggleExpandido(value) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
        // marca qual card acabou de abrir pra rolar até ele assim que o
        // conteúdo expandido terminar de renderizar (efeito abaixo)
        macroAbertaRef.current = value;
      }
      return next;
    });
  }

  // Rolagem suave até o card recém-aberto, assim que o conteúdo expandido
  // (que empurra a tela pra baixo) já estiver no DOM.
  useEffect(() => {
    const value = macroAbertaRef.current;
    if (!value || !expandidos.has(value)) return;
    macroAbertaRef.current = null;
    const el = macroCardRefs.current.get(value);
    if (!el) return;
    // Espera dois frames: o primeiro garante que o layout do conteúdo
    // recém-expandido (que ainda pode estar montando, ex.: "Carregando...")
    // já foi computado antes de medir a posição pra rolar. `block: 'start'`
    // (em vez de 'nearest') força a rolagem sempre que o card não estiver
    // colado no topo, mesmo que já estivesse parcialmente visível.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }, [expandidos]);

  return (
    <div className="space-y-2">
      {MACRO_ETAPAS_REPASSES.map((macro) => {
        const expandido = expandidos.has(macro.value);
        return (
          <div
            key={macro.value}
            ref={(el) => {
              if (el) macroCardRefs.current.set(macro.value, el);
              else macroCardRefs.current.delete(macro.value);
            }}
            className="overflow-hidden rounded-card border border-gray-100"
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleExpandido(macro.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') toggleExpandido(macro.value);
              }}
              className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-5 py-2.5 text-left hover:bg-gray-50"
            >
              {expandido ? (
                <ChevronDown size={18} className="shrink-0 text-gray-400" />
              ) : (
                <ChevronRight size={18} className="shrink-0 text-gray-400" />
              )}

              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-600">
                {macro.numero}
              </span>

              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{macro.label}</p>

              <img
                src={macro.logo}
                alt={macro.integracaoNome}
                title={macro.integracaoNome}
                className="h-6 w-6 shrink-0 object-contain"
              />
            </div>

            {expandido && (
              <div className="border-t border-gray-100 px-5 py-4">
                {/* Indentação + linha-guia: sinaliza que as micro etapas
                    abaixo pertencem a esta macro etapa. */}
                <div className="border-l-2 border-primary-100 pl-20">
                  <MascaraItensEditor
                    tipo="REPASSES"
                    empresaId={empresaId}
                    grupo={macro.value}
                    itemLabel={macro.label}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
