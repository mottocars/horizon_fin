import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, ChartGantt, Milestone } from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import AbaEmConstrucao from '../DfcConstrutoras/AbaEmConstrucao';

// Mesmo padrão de DfcConstrutorasPage.jsx: o `{ divider: true }` separa os Cronogramas (a tela em
// si) das abas de cadastro que dão suporte a eles. Abas pedidas pelo usuário; o que cada uma mostra
// será definido depois.
const TABS = [
  { id: 'cronogramas', label: 'Cronogramas', icon: ChartGantt },
  { divider: true },
  { id: 'etapas', label: 'Etapas', icon: Milestone },
  { id: 'centros-custos', label: 'Centros de Custos', icon: Building2 },
];

// Empresa e aba vivem na URL (não em useState local) — mesmo motivo de DfcConstrutorasPage.jsx:
// o "Voltar" do navegador devolve o usuário pro mesmo lugar, com a mesma empresa e a mesma aba.
export default function CronogramasObrasPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();

  const empresaId = searchParams.get('empresa_id') || '';
  const abaAtiva = searchParams.get('aba') || 'cronogramas';
  const tabAtiva = TABS.find((t) => t.id === abaAtiva) || TABS[0];

  function atualizarParams(patch) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([chave, valor]) => {
      const vazio = valor === null || valor === undefined || valor === '';
      if (vazio) next.delete(chave);
      else next.set(chave, String(valor));
    });
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    if (empresaTravada && empresaIdTravada && empresaId !== String(empresaIdTravada)) {
      atualizarParams({ empresa_id: empresaIdTravada });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaTravada, empresaIdTravada]);

  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  useEffect(() => {
    if (!loadingEmpresas && !empresaId && empresas.length === 1) {
      atualizarParams({ empresa_id: empresas[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingEmpresas, empresas, empresaId]);

  return (
    <div className="space-y-4">
      <Card className="shrink-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
            <SearchableSelect
              value={empresaId}
              onChange={(novoId) => atualizarParams({ empresa_id: novoId || null })}
              disabled={loadingEmpresas || empresaTravada}
              options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
              placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
              emptyMessage="Nenhuma empresa encontrada."
            />
          </div>
        </div>
      </Card>

      <div>
        <Tabs tabs={TABS} activeId={tabAtiva.id} onChange={(aba) => atualizarParams({ aba })} />

        <AbaEmConstrucao key={tabAtiva.id} empresaId={empresaId} icon={tabAtiva.icon} titulo={tabAtiva.label} />
      </div>
    </div>
  );
}
