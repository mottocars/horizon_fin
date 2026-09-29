import { Fragment, useCallback, useEffect, useState } from 'react';
import { Building2, Minus, Plus, RefreshCw, TriangleAlert } from 'lucide-react';
import Button from '../../../components/Button';
import { getMatrizEmpreendimentosMasa } from '../../../api/relatorioMasa.api';

// Matriz do relatório Empreendimentos Masa (exclusivo da empresa Masa, via a integração
// Actioon dela). Coluna "Etapa Atual" (fase, action_types) sempre aberta — pedido do usuário —
// e fixa: 1 célula só por fase, com `rowSpan` cobrindo todas as linhas dos empreendimentos
// dela (incluindo as linhas de histórico abertas) e centralizada verticalmente
// (`align-middle`). Cada empreendimento aparece só na fase mais avançada entre todas as suas
// ações (ver relatorioMasa.service.js::listMatriz) — nunca repetido em mais de uma linha de
// etapa. A "Micro Etapa Atual" tem seu próprio drilldown: abre pra revelar as micro etapas
// anteriores daquele empreendimento (a atual nunca se repete ali), em ordem decrescente.
export default function EmpreendimentosMasaPage() {
  const [matriz, setMatriz] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const [expandidos, setExpandidos] = useState(() => new Set());

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

  async function handleAtualizar() {
    setAtualizando(true);
    try {
      await carregar(false);
    } finally {
      setAtualizando(false);
    }
  }

  function toggleExpandir(empreendimentoId) {
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(empreendimentoId)) proximo.delete(empreendimentoId);
      else proximo.add(empreendimentoId);
      return proximo;
    });
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
                  <th className="w-64 border-b border-gray-200 bg-white py-2.5 pl-4 font-medium">Etapa Atual</th>
                  <th className="border-b border-l border-gray-200 bg-white py-2.5 pl-4 font-medium">
                    Empreendimento
                  </th>
                  <th className="border-b border-l border-gray-200 bg-white py-2.5 pl-4 font-medium">
                    Micro Etapa Atual
                  </th>
                  <th className="w-28 border-b border-l border-gray-200 bg-white py-2.5 pl-4 font-medium">
                    Qtd Tarefas
                  </th>
                  <th className="w-28 border-b border-l border-gray-200 bg-white py-2.5 pl-4 font-medium">
                    Qtd Tarefas Totais
                  </th>
                  <th className="w-28 border-b border-l border-gray-200 bg-white py-2.5 pl-4 font-medium">
                    Duração
                  </th>
                </tr>
              </thead>
              <tbody>
                {matriz.map((fase) => {
                  // Fase sem nenhum empreendimento ainda ocupa 1 linha (com um traço no lugar
                  // do nome) — senão ela desaparece da matriz inteira, o que esconderia que
                  // aquela etapa existe e está vazia.
                  const linhas = fase.empreendimentos.length > 0 ? fase.empreendimentos : [null];
                  // A célula da fase precisa cobrir também as linhas de histórico abertas —
                  // senão o rowSpan fica curto e desalinha a tabela assim que alguém expande.
                  const totalLinhas = linhas.reduce((soma, emp) => {
                    const extras = emp && expandidos.has(emp.id) ? emp.historicoMicroEtapas.length : 0;
                    return soma + 1 + extras;
                  }, 0);

                  return (
                    <Fragment key={fase.id}>
                      {linhas.map((empreendimento, indice) => {
                        const aberto = Boolean(empreendimento && expandidos.has(empreendimento.id));
                        const temHistorico = Boolean(empreendimento?.historicoMicroEtapas?.length);
                        return (
                          <Fragment key={`${fase.id}-${empreendimento?.id ?? 'vazia'}`}>
                            <tr>
                              {indice === 0 && (
                                <td
                                  rowSpan={totalLinhas}
                                  className="border-b border-r border-gray-200 bg-gray-50 px-4 py-2.5 align-middle"
                                >
                                  <span className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-gray-900">{fase.name}</span>
                                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                                      {fase.empreendimentos.length}
                                    </span>
                                  </span>
                                </td>
                              )}
                              <td
                                rowSpan={1 + (aberto ? empreendimento.historicoMicroEtapas.length : 0)}
                                className="border-b border-gray-100 bg-white py-1.5 pl-4 text-xs text-gray-700 align-middle"
                              >
                                {empreendimento ? (
                                  empreendimento.name
                                ) : (
                                  <span className="italic text-gray-400">Nenhum empreendimento nesta fase.</span>
                                )}
                              </td>
                              <td className="border-b border-l border-gray-100 py-1.5 pl-4 text-xs text-gray-700">
                                {!empreendimento?.microEtapaAtual ? (
                                  <span className="text-gray-300">—</span>
                                ) : temHistorico ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpandir(empreendimento.id)}
                                    className="flex items-center gap-2 text-left text-xs text-gray-700"
                                  >
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                                      {aberto ? <Minus size={10} /> : <Plus size={10} />}
                                    </span>
                                    {empreendimento.microEtapaAtual}
                                  </button>
                                ) : (
                                  <span className="flex items-center gap-2 text-left text-xs text-gray-700">
                                    <span className="h-4 w-4 shrink-0" />
                                    {empreendimento.microEtapaAtual}
                                  </span>
                                )}
                              </td>
                              <td className="border-b border-l border-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700">
                                {empreendimento?.qtdTarefas || <span className="text-gray-300">—</span>}
                              </td>
                              <td className="border-b border-l border-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700">
                                {empreendimento?.qtdTarefasTotais || <span className="text-gray-300">—</span>}
                              </td>
                              <td className="border-b border-l border-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-700">
                                {empreendimento?.duracaoDias != null ? (
                                  `${empreendimento.duracaoDias.toLocaleString('pt-BR')} dias`
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            </tr>

                            {aberto &&
                              empreendimento.historicoMicroEtapas.map((historico, i) => (
                                <tr key={i} className="bg-gray-50/60">
                                  <td className="border-b border-l border-gray-100 py-1.5 pl-10 text-xs text-gray-500">
                                    {historico.name}
                                  </td>
                                  <td className="border-b border-l border-gray-100 py-1.5 pl-4 text-xs tabular-nums text-gray-500">
                                    {historico.qtdTarefas || <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="border-b border-l border-gray-100" />
                                  <td className="border-b border-l border-gray-100" />
                                </tr>
                              ))}
                          </Fragment>
                        );
                      })}
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
