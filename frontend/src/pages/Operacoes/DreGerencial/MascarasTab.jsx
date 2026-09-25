import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import MascaraItensEditor from '../../../components/MascaraItensEditor';
import { ESTRUTURA_DRE } from '../../../config/estruturaDre';
import OperadorBadge from './OperadorBadge';

// Cadastro da Máscara DRE da empresa, organizado pela mesma estrutura de nível 1 usada na aba
// DRE (ESTRUTURA_DRE) — mesmo padrão de RepassesCef/MascarasRepassesCef.jsx (macro etapa fixa,
// expande pra cadastrar as linhas de nível 2 dentro dela, mesmo MascaraItensEditor). Os 4 grupos
// "calculado" (RECEITA LÍQUIDA, LUCRO BRUTO, EBITDA, LUCRO LÍQUIDO) não têm cadastro — são
// subtotais somados a partir dos grupos acima — aparecem só como uma barra cinza informativa,
// sem expandir (mesmo "cinza = não editável" já usado na totalizadora do Plano de Contas).
export default function MascarasTab({ empresaId }) {
  const [expandido, setExpandido] = useState(null);
  const cardRefs = useRef(new Map());
  const grupoAbertoRef = useRef(null);

  function toggleExpandido(value) {
    setExpandido((atual) => {
      if (atual === value) return null;
      grupoAbertoRef.current = value;
      return value;
    });
  }

  useEffect(() => {
    const value = grupoAbertoRef.current;
    if (!value || expandido !== value) return;
    grupoAbertoRef.current = null;
    const el = cardRefs.current.get(value);
    if (!el) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }, [expandido]);

  return (
    <div className="space-y-2">
      {ESTRUTURA_DRE.map((grupo) => {
        if (grupo.calculado) {
          return (
            <div
              key={grupo.value}
              className="flex min-h-[52px] items-center gap-3 rounded-card bg-gray-100 px-5 py-2.5"
            >
              <OperadorBadge operador={grupo.operador} />
              <p className="flex-1 text-sm font-semibold text-gray-500">{grupo.label}</p>
              <span className="shrink-0 text-xs italic text-gray-400">Subtotal calculado automaticamente</span>
            </div>
          );
        }

        const aberto = expandido === grupo.value;
        return (
          <div
            key={grupo.value}
            ref={(el) => {
              if (el) cardRefs.current.set(grupo.value, el);
              else cardRefs.current.delete(grupo.value);
            }}
            className="overflow-hidden rounded-card border border-gray-100"
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleExpandido(grupo.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') toggleExpandido(grupo.value);
              }}
              className="flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-5 py-2.5 text-left hover:bg-gray-50"
            >
              {aberto ? (
                <ChevronDown size={18} className="shrink-0 text-gray-400" />
              ) : (
                <ChevronRight size={18} className="shrink-0 text-gray-400" />
              )}
              <OperadorBadge operador={grupo.operador} />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{grupo.label}</p>
            </div>

            {aberto && (
              <div className="border-t border-gray-100 px-5 py-4">
                <div className="border-l-2 border-primary-100 pl-8">
                  <MascaraItensEditor tipo="DRE" empresaId={empresaId} grupo={grupo.value} itemLabel={grupo.label} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
