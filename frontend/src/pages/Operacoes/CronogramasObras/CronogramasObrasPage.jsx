import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, ChartGantt, History, Search, Settings } from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { useAuth } from '../../../auth/AuthContext';
import { filtrarAbas } from '../../../utils/permissoes';
import CronogramaCentrosTab from './CronogramaCentrosTab';
import CronogramasTab from './CronogramasTab';
import ConfiguracoesCronogramas from './ConfiguracoesCronogramas';
import VersoesCronograma from './VersoesCronograma';

// Mesmo padrão de DfcConstrutorasPage.jsx: o `{ divider: true }` separa os Cronogramas (a tela em
// si) das abas que dão suporte a eles. A aba Etapas saiu (pedido do usuário): as etapas se cadastram
// em Cadastros > Máscaras > Etapas do Centro de Custo. Configurações: só o Administrador da tela (ou
// Master) vê — `nivel`, como em Repasses CEF (ver utils/permissoes.js::filtrarAbas). Versões: o
// histórico das versões gravadas do cronograma (versionamento — pedido do usuário).
const TABS = [
  { id: 'cronogramas', label: 'Cronogramas', icon: ChartGantt },
  { divider: true },
  { id: 'centros-custos', label: 'Centros de Custos', icon: Building2 },
  { id: 'versoes', label: 'Versões', icon: History },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, nivel: 'ADMINISTRADOR' },
];

// Empresa e aba vivem na URL (não em useState local) — mesmo motivo de DfcConstrutorasPage.jsx:
// o "Voltar" do navegador devolve o usuário pro mesmo lugar, com a mesma empresa e a mesma aba.
export default function CronogramasObrasPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const abas = useMemo(() => filtrarAbas(user, '/operacoes/cronogramas-obras', TABS), [user]);

  const empresaId = searchParams.get('empresa_id') || '';
  const abaAtiva = searchParams.get('aba') || 'cronogramas';
  const tabAtiva = abas.find((t) => t.id === abaAtiva) || abas[0];

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

  // Busca (código ou descrição) da aba Centros de Custos — só conveniência de navegador, fora da
  // URL (mesma convenção da DFC).
  const [buscaCentros, setBuscaCentros] = useState('');

  return (
    <div className="space-y-4">
      <Card className="shrink-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-1 sm:flex-row sm:flex-wrap">
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

            {abaAtiva === 'centros-custos' && (
              <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={buscaCentros}
                    onChange={(e) => setBuscaCentros(e.target.value)}
                    disabled={!empresaId}
                    placeholder={!empresaId ? 'Selecione a empresa primeiro' : 'Buscar por código ou descrição...'}
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
            )}
          </div>

        </div>
      </Card>

      <div>
        <Tabs tabs={abas} activeId={tabAtiva.id} onChange={(aba) => atualizarParams({ aba })} />

        {tabAtiva.id === 'centros-custos' ? (
          <CronogramaCentrosTab empresaId={empresaId} search={buscaCentros} />
        ) : tabAtiva.id === 'versoes' ? (
          <VersoesCronograma empresaId={empresaId} />
        ) : tabAtiva.id === 'configuracoes' ? (
          <ConfiguracoesCronogramas empresaId={empresaId} />
        ) : (
          <CronogramasTab empresaId={empresaId} />
        )}
      </div>
    </div>
  );
}
