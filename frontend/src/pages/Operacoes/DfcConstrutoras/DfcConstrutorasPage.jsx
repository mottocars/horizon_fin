import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Banknote,
  Building2,
  Calculator,
  HandCoins,
  HardHat,
  ListTree,
  Plus,
  Save,
  SlidersHorizontal,
  Tags,
  Wallet,
} from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { listCentrosDfc, listVersoesParametrosDfc } from '../../../api/dfcParametros.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import AbaEmConstrucao from './AbaEmConstrucao';
import DfcMascarasTab from './DfcMascarasTab';
import DfcParametrosTab from './DfcParametrosTab';

// Mesmo padrão de DreGerencialPage.jsx: o `{ divider: true }` separa a DFC (a demonstração em
// si) das abas de cadastro/parâmetro que dão suporte a ela, que ficam juntas, sem divisor entre
// elas. Ordem das abas definida pelo usuário.
const TABS = [
  { id: 'dfc', label: 'DFC', icon: Wallet },
  { divider: true },
  { id: 'parametros', label: 'Parâmetros', icon: SlidersHorizontal },
  { id: 'mascaras', label: 'Máscaras', icon: Tags },
  { id: 'plano-contas', label: 'Plano Contas', icon: ListTree },
  { id: 'centros-custos', label: 'Centros Custos', icon: Building2 },
  { id: 'avancos-obras', label: 'Avanços Obras', icon: HardHat },
  { id: 'repasses', label: 'Repasses', icon: Banknote },
  { id: 'vendas', label: 'Vendas', icon: HandCoins },
  { id: 'orcamentos', label: 'Orçamentos', icon: Calculator },
];

function formatarDataHora(data) {
  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Empresa e aba vivem na URL (não em useState local) — mesmo motivo de DreGerencialPage.jsx:
// o "Voltar" do navegador devolve o usuário pro mesmo lugar, com a mesma empresa e a mesma aba.
export default function DfcConstrutorasPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();

  const empresaId = searchParams.get('empresa_id') || '';
  const centroId = searchParams.get('centro_id') || '';
  const abaAtiva = searchParams.get('aba') || 'dfc';
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

  // Empreendimentos (centros de custo) da empresa — os Parâmetros são de cada um deles. Fica na
  // URL como a empresa (`centro_id`); trocar de empresa limpa o centro.
  const [centros, setCentros] = useState([]);
  const [loadingCentros, setLoadingCentros] = useState(false);

  useEffect(() => {
    if (!empresaId) {
      setCentros([]);
      return;
    }
    setLoadingCentros(true);
    listCentrosDfc(empresaId)
      .then(setCentros)
      .catch(() => setCentros([]))
      .finally(() => setLoadingCentros(false));
  }, [empresaId]);

  const centroSelecionado = centros.find((c) => String(c.sienge_id) === String(centroId)) || null;

  // Versões dos Parâmetros do empreendimento escolhido — mesmo esquema da Gestão de Cobranças
  // com o Motor de Risco: a lista vem da mais nova pra mais antiga, a primeira (vigente) abre
  // selecionada, e publicar uma versão nova recarrega a lista e seleciona a recém-criada.
  const [versoes, setVersoes] = useState([]);
  const [loadingVersoes, setLoadingVersoes] = useState(false);
  const [versaoId, setVersaoId] = useState('');

  function carregarVersoes() {
    if (!empresaId || !centroId) {
      setVersoes([]);
      setVersaoId('');
      return;
    }
    setLoadingVersoes(true);
    listVersoesParametrosDfc(empresaId, centroId)
      .then((lista) => {
        setVersoes(lista);
        setVersaoId(lista[0]?.id ?? '');
      })
      .catch(() => {
        setVersoes([]);
        setVersaoId('');
      })
      .finally(() => setLoadingVersoes(false));
  }

  useEffect(() => {
    carregarVersoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, centroId]);

  const versaoSelecionada = versoes.find((v) => v.id === versaoId) || null;
  const opcoesVersao = versoes.map((v, i) => ({
    value: v.id,
    label: `Versão ${v.versao}${i === 0 ? ' (atual)' : ''} — ${formatarDataHora(v.criado_em)}`,
  }));

  // "Publicar Versão" fica na barra de filtros (padrão do Motor de Risco); a aba expõe salvar()
  // por ref e avisa o estado do botão por onStatusChange.
  const parametrosTabRef = useRef(null);
  const [statusParametros, setStatusParametros] = useState({ podeSalvar: false, salvando: false });

  // Botão "Nova máscara" fica no topo (padrão do resto do sistema, igual "Nova categoria" na
  // DRE), mas o campo de criar vive em DfcMascarasTab.jsx — dispara por ref.
  const mascarasTabRef = useRef(null);

  return (
    <div className="space-y-4">
      <Card className="shrink-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-1 sm:flex-row sm:flex-wrap">
            <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
              <SearchableSelect
                value={empresaId}
                onChange={(novoId) => atualizarParams({ empresa_id: novoId || null, centro_id: null })}
                disabled={loadingEmpresas || empresaTravada}
                options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
                placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
                emptyMessage="Nenhuma empresa encontrada."
              />
            </div>

            {abaAtiva === 'parametros' && (
              <>
                <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Centro de Custo</label>
                  <SearchableSelect
                    value={centroId}
                    onChange={(id) => atualizarParams({ centro_id: id || null })}
                    disabled={!empresaId || loadingCentros}
                    options={centros.map((c) => ({ value: c.sienge_id, label: `${c.sienge_id} - ${c.name}` }))}
                    placeholder={
                      !empresaId
                        ? 'Selecione a empresa primeiro'
                        : loadingCentros
                          ? 'Carregando centros de custo...'
                          : 'Selecione um centro de custo'
                    }
                    emptyMessage="Nenhum centro de custo encontrado."
                  />
                </div>

                <div className="sm:min-w-[160px] sm:max-w-xs sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Versão</label>
                  <SearchableSelect
                    clearable={false}
                    value={versaoId}
                    onChange={setVersaoId}
                    disabled={!centroId || loadingVersoes || versoes.length === 0}
                    options={opcoesVersao}
                    placeholder={
                      !centroId
                        ? 'Selecione o centro de custo primeiro'
                        : loadingVersoes
                          ? 'Carregando versões...'
                          : 'Nenhuma versão salva ainda'
                    }
                    emptyMessage="Nenhuma versão encontrada."
                  />
                </div>
              </>
            )}
          </div>

          {abaAtiva === 'parametros' && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                onClick={() => parametrosTabRef.current?.salvar()}
                disabled={!statusParametros.podeSalvar}
                loading={statusParametros.salvando}
              >
                <Save size={16} />
                Publicar Versão
              </Button>
            </div>
          )}

          {abaAtiva === 'mascaras' && (
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" onClick={() => mascarasTabRef.current?.abrirNova()} disabled={!empresaId}>
                <Plus size={16} />
                Nova máscara
              </Button>
            </div>
          )}
        </div>
      </Card>

      <div>
        <Tabs tabs={TABS} activeId={tabAtiva.id} onChange={(aba) => atualizarParams({ aba })} />

        {tabAtiva.id === 'parametros' ? (
          <DfcParametrosTab
            ref={parametrosTabRef}
            empresaId={empresaId}
            centro={centroSelecionado}
            versaoSelecionada={versaoSelecionada}
            versaoMaisRecenteId={versoes[0]?.id ?? null}
            versaoVigenteNumero={versoes[0]?.versao ?? null}
            onVersaoCriada={carregarVersoes}
            onStatusChange={setStatusParametros}
          />
        ) : tabAtiva.id === 'mascaras' ? (
          <DfcMascarasTab ref={mascarasTabRef} empresaId={empresaId} />
        ) : (
          <AbaEmConstrucao key={tabAtiva.id} empresaId={empresaId} icon={tabAtiva.icon} titulo={tabAtiva.label} />
        )}
      </div>
    </div>
  );
}
