import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { temAcessoATela } from '../../utils/permissoes';
import { INTEGRACOES } from '../../config/integracoes';

// Busca sem acento e sem diferença de maiúsculas ("convenios" acha "Convênios Bancários").
function normalizar(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Integrações: em vez de um submenu comprido, o menu abre esta tela com um card
// quadradinho por integração (só as que o usuário acessa). Cada tela de integração
// tem o "Voltar para Integrações" (ver layout/AppShell.jsx).
export default function IntegracoesHub() {
  const { user } = useAuth();
  const [busca, setBusca] = useState('');
  const permitidas = useMemo(() => INTEGRACOES.filter((i) => temAcessoATela(user, i.to)), [user]);
  const termo = normalizar(busca.trim());
  const itens = termo ? permitidas.filter((i) => normalizar(i.label).includes(termo)) : permitidas;

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar integração..."
          autoFocus
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </div>

      {itens.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma integração encontrada para “{busca.trim()}”.</p>
      ) : (
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
                  {item.image ? <img src={item.image} alt="" className="h-7 w-7" /> : <Icon size={24} />}
                </span>
                <span className="text-[13px] font-medium leading-tight text-gray-700 group-hover:text-primary-700">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
