import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, ChartGantt, History, Search, Settings } from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { listVersoesCronograma } from '../../../api/cronogramaCentros.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { useAuth } from '../../../auth/AuthContext';
import { filtrarAbas } from '../../../utils/permissoes';
import CronogramaCentrosTab from './CronogramaCentrosTab';
import CronogramasTab from './CronogramasTab';
import ConfiguracoesCronogramas from './ConfiguracoesCronogramas';
import VersoesCronograma from './VersoesCronograma';
import { obrasNasLocalidades, opcoesFiltroObras, opcoesLocalidade } from './cronogramaObras';

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
      // lista (filtros de marcação múltipla): a chave repetida na URL, uma vez por valor
      if (Array.isArray(valor)) {
        next.delete(chave);
        valor.forEach((v) => next.append(chave, String(v)));
        return;
      }
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

  // Filtros da aba Cronogramas ao lado da empresa (pedidos do usuário), na URL: "Obras" (?obra=,
  // repetido — os centros de custo marcados, pelo sienge_id), "Localidade"
  // (?local=, repetido — Cidade - UF) e "Mudanças" (?versao= — uma versão gravada: o Gantt mostra as
  // obras alteradas nela). Os centros das opções vêm da aba (CronogramasTab `onCentros`).
  const textoObras = searchParams.getAll('obra').join('|');
  const textoLocal = searchParams.getAll('local').join('|');
  const obrasMarcadas = useMemo(() => (textoObras ? textoObras.split('|') : []), [textoObras]);
  const localidades = useMemo(() => (textoLocal ? textoLocal.split('|') : []), [textoLocal]);
  const versaoId = searchParams.get('versao') || '';
  const [centrosObras, setCentrosObras] = useState([]);
  const opcoesObras = useMemo(() => opcoesFiltroObras(centrosObras, localidades), [centrosObras, localidades]);
  const opcoesLocal = useMemo(() => opcoesLocalidade(centrosObras), [centrosObras]);
  const [versoes, setVersoes] = useState([]);
  // Zoom do Gantt — fica no estado da página (persiste ao trocar de aba). Sem filtro de período aqui
  // (pedido do usuário): o De/Até é só do dashboard Cronogramas de Obras.
  const [zoom, setZoom] = useState('mensal');
  useEffect(() => {
    setVersoes([]);
    if (!empresaId || abaAtiva !== 'cronogramas') return;
    listVersoesCronograma(empresaId)
      .then(setVersoes)
      .catch(() => setVersoes([]));
  }, [empresaId, abaAtiva]);

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
                onChange={(novoId) => atualizarParams({ empresa_id: novoId || null, versao: null, local: null, obra: null })}
                disabled={loadingEmpresas || empresaTravada}
                options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
                placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
                emptyMessage="Nenhuma empresa encontrada."
              />
            </div>

            {tabAtiva.id === 'cronogramas' && (
              <>
                <div className="sm:min-w-52 sm:max-w-xs sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Obras</label>
                  <SearchableSelect
                    multiple
                    todosELimpar
                    value={obrasMarcadas}
                    onChange={(v) => atualizarParams({ obra: v })}
                    disabled={!empresaId}
                    options={opcoesObras}
                    placeholder="Todas as obras"
                    larguraPainel={320}
                    alturaLista="max-h-80"
                  />
                </div>
                <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Localidade</label>
                  <SearchableSelect
                    multiple
                    todosELimpar
                    value={localidades}
                    onChange={(v) => atualizarParams({ local: v, obra: obrasNasLocalidades(obrasMarcadas, v, centrosObras) })}
                    disabled={!empresaId}
                    options={opcoesLocal}
                    placeholder="Todas as localidades"
                  />
                </div>
                <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Mudanças</label>
                  <SearchableSelect
                    value={versaoId}
                    onChange={(v) => atualizarParams({ versao: v || null })}
                    disabled={!empresaId || !versoes.length}
                    options={[
                      { value: '', label: 'Cronograma atual' },
                      ...versoes.map((v) => ({
                        value: String(v.id),
                        label: `Versão ${v.numero} · ${new Date(v.criado_em).toLocaleDateString('pt-BR')} · ${
                          v.alteracoes.length === 1 ? '1 obra alterada' : `${v.alteracoes.length} obras alteradas`
                        }`,
                      })),
                    ]}
                    placeholder={versoes.length ? 'Cronograma atual' : 'Nenhuma versão gravada'}
                    clearable={false}
                  />
                </div>
              </>
            )}
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
          <CronogramasTab
            empresaId={empresaId}
            obrasMarcadas={obrasMarcadas}
            localidades={localidades}
            versaoId={versaoId}
            onLimparVersao={() => atualizarParams({ versao: null })}
            zoom={zoom}
            onZoom={setZoom}
            onCentros={setCentrosObras}
          />
        )}
      </div>
    </div>
  );
}
