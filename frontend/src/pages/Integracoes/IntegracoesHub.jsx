import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { temAcessoATela } from '../../utils/permissoes';
import { INTEGRACOES } from '../../config/integracoes';

// Integrações: em vez de um submenu comprido, o menu abre esta tela com um card
// quadradinho por integração (só as que o usuário acessa).
export default function IntegracoesHub() {
  const { user } = useAuth();
  const itens = useMemo(() => INTEGRACOES.filter((i) => temAcessoATela(user, i.to)), [user]);

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-4">
      {itens.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className="group flex aspect-square flex-col items-center justify-center gap-3 rounded-card bg-white p-3 text-center shadow-card ring-1 ring-transparent transition hover:-translate-y-0.5 hover:ring-primary-100 hover:shadow-[0_10px_24px_-12px_rgba(59,130,246,0.45)]"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#f2f6fd] text-primary-600 transition group-hover:bg-primary-50">
              {item.image ? (
                <img src={item.image} alt="" className="h-7 w-7" />
              ) : (
                <Icon size={24} />
              )}
            </span>
            <span className="text-[13px] font-medium leading-tight text-gray-700 group-hover:text-primary-700">
              {item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
