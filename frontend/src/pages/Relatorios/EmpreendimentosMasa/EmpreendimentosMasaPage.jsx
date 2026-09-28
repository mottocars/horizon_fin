import { Fragment, useCallback, useEffect, useState } from 'react';
import { Building2, Minus, Plus, RefreshCw, TriangleAlert } from 'lucide-react';
import Button from '../../../components/Button';
import { getMatrizEmpreendimentosMasa } from '../../../api/relatorioMasa.api';

// Matriz do relatório Empreendimentos Masa (exclusivo da empresa Masa, via a integração
// Actioon dela). Nível 1 (linhas) são as fases (action_types), ordenadas pela tag `order`.
// Cada fase já vem do backend com os empreendimentos (clients) que estão NELA — e só nela: um
// empreendimento pode ter ações em várias fases ao longo do tempo, mas só aparece na mais
// avançada (maior order), nunca nas anteriores (ver relatorioMasa.service.js::listMatriz).
// O "+/-" aqui é só visual (mostrar/esconder), sem busca sob demanda — tudo já veio na mesma
// chamada, calculado no backend a partir de /api/actions.
export default function EmpreendimentosMasaPage() {
  const [matriz, setMatriz] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [expandidoId, setExpandidoId] = useState(null);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback((comIndicadorProprio = true) => {
    if (comIndicadorProprio) setCarregando(true);
    setErro('');
    return getMatrizEmpreendimentosMasa()
      .then(setMatriz)
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar a matriz da Actioon.'))
      .finally(() => {
        if (comIndicadorProprio) setCarregando(false);
      });
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function toggleExpandir(faseId) {
    setExpandidoId((atual) => (atual === faseId ? null : faseId));
  }

  async function handleAtualizar() {
    setAtualizando(true);
    try {
      await carregar(false);
    } finally {
      setAtualizando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-white shadow-card">
        {carregando ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : erro ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <TriangleAlert size={26} className="text-red-400" />
            <p className="text-sm text-gray-600">{erro}</p>
          </div>
        ) : matriz.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <Building2 size={26} className="text-gray-300" />
            <p className="text-sm text-gray-600">Nenhuma fase cadastrada na Actioon.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-card">
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-400">
                  <th className="border-b border-gray-200 bg-white py-2.5 pl-4 font-medium">Fase</th>
                </tr>
              </thead>
              <tbody>
                {matriz.map((fase) => {
                  const aberto = expandidoId === fase.id;
                  return (
                    <Fragment key={fase.id}>
                      <tr onClick={() => toggleExpandir(fase.id)} className="group/fase cursor-pointer">
                        <td className="border-b border-gray-200 bg-gray-50 py-2.5 pl-3 pr-4 group-hover/fase:bg-gray-100">
                          <span className="flex items-center gap-2">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                              {aberto ? <Minus size={10} /> : <Plus size={10} />}
                            </span>
                            <span className="text-xs font-semibold text-gray-900">{fase.name}</span>
                            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                              {fase.empreendimentos.length}
                            </span>
                          </span>
                        </td>
                      </tr>

                      {aberto && fase.empreendimentos.length === 0 && (
                        <tr>
                          <td className="border-b border-gray-100 py-3 pl-9 text-xs italic text-gray-400">
                            Nenhum empreendimento nesta fase.
                          </td>
                        </tr>
                      )}

                      {aberto &&
                        fase.empreendimentos.map((empreendimento) => (
                          <tr key={empreendimento.id} className="hover:bg-gray-50">
                            <td className="border-b border-gray-100 py-1.5 pl-9 text-xs text-gray-700">
                              {empreendimento.name}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Button variant="secondary" onClick={handleAtualizar} disabled={atualizando}>
        <RefreshCw size={16} className={atualizando ? 'animate-spin' : ''} />
        {atualizando ? 'Atualizando...' : 'Atualizar'}
      </Button>
    </div>
  );
}
