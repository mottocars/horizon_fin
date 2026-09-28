import { Fragment, useCallback, useEffect, useState } from 'react';
import { Building2, Minus, Plus, RefreshCw, TriangleAlert } from 'lucide-react';
import Button from '../../../components/Button';
import { listFasesEmpreendimentosMasa, listEmpreendimentosMasa } from '../../../api/relatorioMasa.api';

// Matriz do relatório Empreendimentos Masa (exclusivo da empresa Masa, via a integração
// Actioon dela). Nível 1 (linhas) são as fases (action_types), ordenadas pela tag `order`
// da própria API. Cada fase expande num drilldown com os empreendimentos (clients, na
// terminologia da Actioon), também ordenados por `order` — mesma mecânica de "+/-" já usada
// em Orçamento/Máscaras (aba DRE POC Gerencial). A Actioon ainda não expõe em qual fase cada
// empreendimento está, então a mesma lista completa aparece sob qualquer fase aberta — a
// lista só é buscada uma vez (na primeira fase aberta) e reaproveitada nas seguintes.
export default function EmpreendimentosMasaPage() {
  const [fases, setFases] = useState(null);
  const [carregandoFases, setCarregandoFases] = useState(true);
  const [erroFases, setErroFases] = useState('');

  const [expandidoId, setExpandidoId] = useState(null);
  const [empreendimentos, setEmpreendimentos] = useState(null);
  const [carregandoEmpreendimentos, setCarregandoEmpreendimentos] = useState(false);
  const [erroEmpreendimentos, setErroEmpreendimentos] = useState('');

  const [atualizando, setAtualizando] = useState(false);

  const carregarFases = useCallback(() => {
    setCarregandoFases(true);
    setErroFases('');
    return listFasesEmpreendimentosMasa()
      .then(setFases)
      .catch((err) => setErroFases(err.response?.data?.message || 'Não foi possível carregar as fases da Actioon.'))
      .finally(() => setCarregandoFases(false));
  }, []);

  useEffect(() => {
    carregarFases();
  }, [carregarFases]);

  function toggleExpandir(faseId) {
    setExpandidoId((atual) => (atual === faseId ? null : faseId));
  }

  const carregarEmpreendimentos = useCallback(() => {
    setCarregandoEmpreendimentos(true);
    setErroEmpreendimentos('');
    return listEmpreendimentosMasa()
      .then(setEmpreendimentos)
      .catch((err) =>
        setErroEmpreendimentos(err.response?.data?.message || 'Não foi possível carregar os empreendimentos da Actioon.')
      )
      .finally(() => setCarregandoEmpreendimentos(false));
  }, []);

  useEffect(() => {
    if (!expandidoId || empreendimentos || carregandoEmpreendimentos) return;
    carregarEmpreendimentos();
  }, [expandidoId, empreendimentos, carregandoEmpreendimentos, carregarEmpreendimentos]);

  // Busca tudo de novo direto na Actioon — fases sempre, e os empreendimentos também quando
  // já tiverem sido carregados (senão só na próxima vez que uma fase for aberta).
  async function handleAtualizar() {
    setAtualizando(true);
    try {
      await Promise.all([carregarFases(), empreendimentos !== null ? carregarEmpreendimentos() : Promise.resolve()]);
    } finally {
      setAtualizando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card bg-white shadow-card">
        {carregandoFases ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : erroFases ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <TriangleAlert size={26} className="text-red-400" />
            <p className="text-sm text-gray-600">{erroFases}</p>
          </div>
        ) : fases.length === 0 ? (
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
                {fases.map((fase) => {
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
                          </span>
                        </td>
                      </tr>

                      {aberto && carregandoEmpreendimentos && (
                        <tr>
                          <td className="border-b border-gray-100 py-6 text-center text-xs text-gray-400">
                            Carregando...
                          </td>
                        </tr>
                      )}

                      {aberto && !carregandoEmpreendimentos && erroEmpreendimentos && (
                        <tr>
                          <td className="border-b border-gray-100 py-4 pl-9 text-xs text-red-600">
                            {erroEmpreendimentos}
                          </td>
                        </tr>
                      )}

                      {aberto &&
                        !carregandoEmpreendimentos &&
                        !erroEmpreendimentos &&
                        empreendimentos &&
                        empreendimentos.map((empreendimento) => (
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
