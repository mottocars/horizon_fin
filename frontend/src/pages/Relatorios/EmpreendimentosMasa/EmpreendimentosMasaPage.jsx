import { useEffect, useState } from 'react';
import { Building2, TriangleAlert } from 'lucide-react';
import { listFasesEmpreendimentosMasa } from '../../../api/relatorioMasa.api';

// Matriz do relatório Empreendimentos Masa (exclusivo da empresa Masa, via a integração
// Actioon dela) — 1ª coluna são as fases (action_types da Actioon), ordenadas pela tag
// `order` que a própria API devolve, não por nome nem id. As próximas colunas (por
// empreendimento) entram numa próxima rodada — por enquanto só a estrutura da matriz com a
// coluna de fases já preenchida com dado real.
export default function EmpreendimentosMasaPage() {
  const [fases, setFases] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setCarregando(true);
    setErro('');
    listFasesEmpreendimentosMasa()
      .then(setFases)
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar as fases da Actioon.'))
      .finally(() => setCarregando(false));
  }, []);

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
                {fases.map((fase) => (
                  <tr key={fase.id} className="hover:bg-gray-50">
                    <td className="border-b border-gray-100 py-2.5 pl-4 text-sm text-gray-900">{fase.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
