import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Banknote,
  Building2,
  Calculator,
  Globe,
  HandCoins,
  HardHat,
  ListTree,
  Plus,
  RefreshCw,
  Save,
  Search,
  Upload,
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
import { gerarPlano } from '../../../api/planosFinanceirosSienge.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import AbaEmConstrucao from './AbaEmConstrucao';
import DfcMascarasTab from './DfcMascarasTab';
import DfcParametrosTab from './DfcParametrosTab';
import DfcCentrosTab from './DfcCentrosTab';
import DfcCiwebTab from './DfcCiwebTab';
import DfcPlanoContasTab from './DfcPlanoContasTab';
import DfcAvancosTab from './DfcAvancosTab';

// Mesmo padrão de DreGerencialPage.jsx: o `{ divider: true }` separa a DFC (a demonstração em
// si) das abas de cadastro/parâmetro que dão suporte a ela, que ficam juntas, sem divisor entre
// elas. Ordem das abas definida pelo usuário.
const TABS = [
  { id: 'dfc', label: 'DFC', icon: Wallet },
  { divider: true },
  { id: 'ciweb', label: 'CIWEB', icon: Globe },
  { id: 'centros-custos', label: 'Centros Custos', icon: Building2 },
  { id: 'parametros', label: 'Parâmetros', icon: SlidersHorizontal },
  { id: 'mascaras', label: 'Máscaras', icon: Tags },
  { id: 'plano-contas', label: 'Plano Contas', icon: ListTree },
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

  // Obras (centros de custo com Tipo = Obra na aba Centros Custos) da empresa, com a versão
  // vigente dos parâmetros de cada uma — os Parâmetros são de cada obra. O centro escolhido fica
  // na URL como a empresa (`centro_id`); trocar de empresa limpa o centro. Recarrega ao entrar na
  // aba Parâmetros (o Tipo pode ter mudado na aba Centros Custos) e depois de publicar.
  const [centros, setCentros] = useState([]);
  const [loadingCentros, setLoadingCentros] = useState(false);

  function carregarCentros() {
    if (!empresaId) {
      setCentros([]);
      return;
    }
    setLoadingCentros(true);
    listCentrosDfc(empresaId)
      .then(setCentros)
      .catch(() => setCentros([]))
      .finally(() => setLoadingCentros(false));
  }

  useEffect(() => {
    if (abaAtiva === 'parametros') carregarCentros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, abaAtiva]);

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
    // Versões criadas sozinhas ao importar DCD / Geral levam a origem no rótulo.
    label: `Versão ${v.versao}${i === 0 ? ' (atual)' : ''} — ${formatarDataHora(v.criado_em)}${
      v.origem === 'DCD' ? ' · DCD importado' : v.origem === 'GERAL' ? ' · Geral importado' : ''
    }`,
  }));

  // "Publicar Versão" fica na barra de filtros (padrão do Motor de Risco); a aba expõe salvar()
  // por ref e avisa o estado do botão por onStatusChange.
  const parametrosTabRef = useRef(null);
  const [statusParametros, setStatusParametros] = useState({ podeSalvar: false, salvando: false });

  // Busca (código ou descrição) da aba Centros Custos — só conveniência de navegador, não fica
  // na URL (mesma convenção das buscas da DRE).
  const [buscaCentros, setBuscaCentros] = useState('');

  // Aba CIWEB: busca e filtro de tipo (só conveniência de navegador, fora da URL); o botão de
  // importar chama a aba por ref (a janela de importação vive lá).
  const [buscaCiweb, setBuscaCiweb] = useState('');
  const [tipoCiweb, setTipoCiweb] = useState('');
  const ciwebTabRef = useRef(null);

  // Aba Plano Contas: busca (só conveniência de navegador) e o ícone de gerar/atualizar o plano a
  // partir do Sienge — mesmo esquema da aba Plano de Contas da DRE (DreGerencialPage.jsx): "+"
  // quando ainda não há nenhuma conta, refresh depois de gerado.
  const [buscaPlano, setBuscaPlano] = useState('');
  const [totalPlano, setTotalPlano] = useState(0);
  const [gerandoPlano, setGerandoPlano] = useState(false);
  const [erroPlano, setErroPlano] = useState('');
  const [refreshTokenPlano, setRefreshTokenPlano] = useState(0);

  async function handleGerarOuAtualizarPlano() {
    setErroPlano('');
    setGerandoPlano(true);
    try {
      await gerarPlano(Number(empresaId));
      setRefreshTokenPlano((n) => n + 1);
    } catch (err) {
      setErroPlano(err.response?.data?.message || 'Não foi possível gerar/atualizar o plano de contas.');
    } finally {
      setGerandoPlano(false);
    }
  }

  // Aba Avanços Obras: período (Data início / Data fim) — padrão sempre o ano atual inteiro
  // (pedido do usuário). Só conveniência de navegador, fora da URL.
  const anoAtual = new Date().getFullYear();
  const [inicioAvancos, setInicioAvancos] = useState(`${anoAtual}-01-01`);
  const [fimAvancos, setFimAvancos] = useState(`${anoAtual}-12-31`);

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

            {abaAtiva === 'ciweb' && (
              <>
                <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                  <div className="relative">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={buscaCiweb}
                      onChange={(e) => setBuscaCiweb(e.target.value)}
                      disabled={!empresaId}
                      placeholder={!empresaId ? 'Selecione a empresa primeiro' : 'Buscar por contrato ou empreendimento...'}
                      className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>

                <div className="sm:min-w-[140px] sm:max-w-[12rem] sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
                  <SearchableSelect
                    value={tipoCiweb}
                    onChange={(v) => setTipoCiweb(v || '')}
                    disabled={!empresaId}
                    options={[
                      { value: 'DCD', label: 'DCD' },
                      { value: 'EXTRATO', label: 'Geral' },
                    ]}
                    placeholder="Todos"
                  />
                </div>
              </>
            )}

            {abaAtiva === 'avancos-obras' && (
              <>
                <div className="sm:w-44">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Data início</label>
                  <input
                    type="date"
                    value={inicioAvancos}
                    onChange={(e) => setInicioAvancos(e.target.value)}
                    disabled={!empresaId}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div className="sm:w-44">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Data fim</label>
                  <input
                    type="date"
                    value={fimAvancos}
                    onChange={(e) => setFimAvancos(e.target.value)}
                    disabled={!empresaId}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </>
            )}

            {abaAtiva === 'plano-contas' && (
              <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={buscaPlano}
                    onChange={(e) => setBuscaPlano(e.target.value)}
                    disabled={!empresaId}
                    placeholder={!empresaId ? 'Selecione a empresa primeiro' : 'Buscar por código ou descrição...'}
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
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

            {abaAtiva === 'parametros' && (
              <>
                <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Centro de Custo</label>
                  <SearchableSelect
                    value={centroId}
                    onChange={(id) => atualizarParams({ centro_id: id || null })}
                    disabled={!empresaId || loadingCentros}
                    options={centros.map((c) => ({ value: c.sienge_id, label: c.name }))}
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

          {abaAtiva === 'plano-contas' && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <button
                type="button"
                onClick={handleGerarOuAtualizarPlano}
                disabled={!empresaId || gerandoPlano}
                title={totalPlano === 0 ? 'Gerar plano de contas a partir do Sienge' : 'Atualizar a partir do Sienge'}
                className="flex shrink-0 items-center justify-center rounded-lg bg-primary-600 p-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {totalPlano === 0 ? <Plus size={18} /> : <RefreshCw size={18} className={gerandoPlano ? 'animate-spin' : ''} />}
              </button>
              {erroPlano && <span className="text-xs text-red-600">{erroPlano}</span>}
            </div>
          )}

          {abaAtiva === 'ciweb' && (
            <div className="flex shrink-0 items-center gap-2">
              {/* Só o ícone (mesmo botão do "gerar plano de contas" da DRE); abre a janela onde se
                  escolhe DCD ou Geral e os arquivos. */}
              <button
                type="button"
                onClick={() => ciwebTabRef.current?.abrirImportacao()}
                disabled={!empresaId}
                title="Importar DCD ou Geral"
                className="flex shrink-0 items-center justify-center rounded-lg bg-primary-600 p-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload size={18} />
              </button>
            </div>
          )}

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

        {tabAtiva.id === 'avancos-obras' ? (
          <DfcAvancosTab empresaId={empresaId} inicio={inicioAvancos} fim={fimAvancos} />
        ) : tabAtiva.id === 'plano-contas' ? (
          <DfcPlanoContasTab
            empresaId={empresaId}
            search={buscaPlano}
            refreshToken={refreshTokenPlano}
            onTotal={setTotalPlano}
          />
        ) : tabAtiva.id === 'ciweb' ? (
          <DfcCiwebTab ref={ciwebTabRef} empresaId={empresaId} search={buscaCiweb} tipo={tipoCiweb} />
        ) : tabAtiva.id === 'centros-custos' ? (
          <DfcCentrosTab empresaId={empresaId} search={buscaCentros} />
        ) : tabAtiva.id === 'parametros' ? (
          <DfcParametrosTab
            ref={parametrosTabRef}
            empresaId={empresaId}
            centro={centroSelecionado}
            centros={centros}
            carregandoCentros={loadingCentros}
            onSelecionarCentro={(id) => atualizarParams({ centro_id: id })}
            versaoSelecionada={versaoSelecionada}
            versaoMaisRecenteId={versoes[0]?.id ?? null}
            versaoVigenteNumero={versoes[0]?.versao ?? null}
            onVersaoCriada={() => {
              carregarVersoes();
              carregarCentros();
            }}
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
