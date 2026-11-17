import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import Tabs from '../../components/Tabs';
import { listarNovidades } from '../../api/novidades.api';
import { formatarDataNovidade, resumoDescricao } from '../../layout/Novidades';
import NovidadeModal from './NovidadeModal';

const CABECALHO = 'border-b-2 border-blue-500 bg-blue-50 text-xs uppercase tracking-wide text-blue-700';
const ABAS = [{ id: 'novidades', label: 'Novidades', icon: Megaphone }];

function textoPublico(n) {
  if (n.publico === 'TODOS') return 'Todos os usuários';
  return n.empresas.map((e) => `${e.nome}: ${e.todos_usuarios ? 'todos' : `${e.usuarios} usuário${e.usuarios === 1 ? '' : 's'}`}`).join(' · ');
}

// Cadastros › Novidades: as novidades do sistema — cada uma aparece numa
// janela, uma vez, para quem está no público dela, e fica no botão
// "Novidades" do topo (ver layout/Novidades.jsx). Clicar numa linha abre o
// cadastro (NovidadeModal).
export default function NovidadesPage() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [modal, setModal] = useState(null); // { id } | null — id nulo = nova

  const carregar = useCallback(() => {
    setErro('');
    listarNovidades()
      .then(setLista)
      .catch((e) => {
        setLista([]);
        setErro(e.response?.data?.message || 'Não foi possível carregar as novidades.');
      });
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div className="space-y-4">
      <div>
        <Tabs tabs={ABAS} activeId="novidades" onChange={() => {}} />
        <div className="rounded-card rounded-tl-none bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Novidades do sistema</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Quem está no público vê a novidade numa janela ao entrar, uma vez, e depois no botão Novidades do topo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModal({ id: null })}
              className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
            >
              <Plus size={16} />
              Nova novidade
            </button>
          </div>

          {erro && <p className="mx-5 mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

          {lista === null ? (
            <div className="py-14 text-center text-sm text-gray-400">Carregando...</div>
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                <Megaphone size={22} />
              </span>
              <p className="text-sm font-medium text-gray-800">Nenhuma novidade ainda.</p>
              <p className="mt-1 max-w-md text-xs text-gray-500">Use "Nova novidade" para avisar os usuários sobre um recurso novo.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead>
                  <tr className={CABECALHO}>
                    <th className="py-2.5 pl-5 pr-3 font-medium">Novidade</th>
                    <th className="py-2.5 pr-3 font-medium">Quem vê</th>
                    <th className="py-2.5 pr-3 text-center font-medium">Lançada em</th>
                    <th className="py-2.5 pr-5 text-right font-medium">Já viram</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((n) => (
                    <tr
                      key={n.id}
                      tabIndex={0}
                      onClick={() => setModal({ id: n.id })}
                      onKeyDown={(e) => e.key === 'Enter' && setModal({ id: n.id })}
                      className="cursor-pointer border-b border-gray-100 transition hover:bg-gray-50"
                    >
                      <td className="max-w-md py-3 pl-5 pr-3">
                        <p className="text-sm font-semibold text-gray-900">{n.nome}</p>
                        <p className="mt-0.5 line-clamp-1 text-gray-500">{resumoDescricao(n.descricao)}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <span className="inline-block max-w-xs rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-600">
                          {textoPublico(n)}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-center tabular-nums text-gray-600">{formatarDataNovidade(n.criado_em)}</td>
                      <td className="py-3 pr-5 text-right tabular-nums text-gray-700">
                        {n.vistas} de {n.publico_total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <NovidadeModal open={Boolean(modal)} novidadeId={modal?.id ?? null} onFechar={() => setModal(null)} onSalvo={carregar} />
    </div>
  );
}
