import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  Calculator,
  Download,
  FilePenLine,
  House,
  ListTree,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Trash2,
} from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { gerarPlano } from '../../../api/planosFinanceirosSienge.api';
import { excluirVersaoPlanoDre, exportarPlanoDreExcel, listVersoesPlanoDre } from '../../../api/drePlanoContas.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { useConfirm } from '../../../confirm/ConfirmContext';
import OrcamentoTab from './OrcamentoTab';
import MascarasTab from './MascarasTab';
import PlanoDeContasTab from './PlanoDeContasTab';
import PlanosContasLista from './PlanosContasLista';
import NovaVersaoPlanoModal from './NovaVersaoPlanoModal';
import CentrosCustosTab from './CentrosCustosTab';
import UnidadesTab from './UnidadesTab';
import CorrecoesTab from './CorrecoesTab';
import DreTab from './DreTab';

// O `{ divider: true }` separa a DRE (a demonstração em si) das abas de cadastro/parâmetro que
// dão suporte a ela — Centros Custos, Máscaras, Plano de Contas e Orçamento
// ficam juntas, sem divisor entre elas (mesmo padrão de SaldoContasBancariasPage.jsx, que separa
// "Saldos das Contas" de "Bancos" e as demais abas de cadastro/parâmetro). Ordem pedida pelo
// usuário: Centros Custos é a primeira depois da DRE (igual à aba da DFC, com a flag "Realiza DRE" —
// só os centros marcados aparecem nas abas seguintes: plano de contas próprio e Orçamento); na
// Máscaras se monta a estrutura da DRE (nível 1 e 2); no Plano de Contas cada conta recebe a
// Máscara DRE de nível 2. As categorias de orçamento são cadastradas na própria aba Orçamento
// (botão "Nova categoria" — a aba Categorias Orçamento saiu a pedido do usuário).
const TABS = [
  { id: 'dre', label: 'DRE', icon: BarChart3 },
  { divider: true },
  { id: 'centros-custos', label: 'Centros Custos', icon: Building2 },
  { id: 'mascaras', label: 'Máscaras', icon: Tags },
  { id: 'plano-de-contas', label: 'Plano Contas', icon: ListTree },
  { id: 'orcamento', label: 'Orçamento', icon: Calculator },
  { id: 'unidades', label: 'Unidades', icon: House },
  { id: 'correcoes', label: 'Correções', icon: FilePenLine },
];

// Empresa e aba vivem na URL (não em useState local) — mesmo motivo de todas as outras telas
// com esse padrão (Saldo Contas Bancárias, Gestão de Cobranças): o "Voltar" do navegador
// devolve o usuário pro mesmo lugar, com a mesma empresa e a mesma aba.
export default function DreGerencialPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();

  const empresaId = searchParams.get('empresa_id') || '';
  // Links antigos: a aba Categorias Orçamento (que saiu) abre a Orçamento, onde elas agora ficam; a
  // Fração Ideal virou Unidades.
  const ABAS_RENOMEADAS = { 'categorias-orcamento': 'orcamento', 'fracao-ideal': 'unidades' };
  const abaUrl = searchParams.get('aba') || 'dre';
  const abaAtiva = ABAS_RENOMEADAS[abaUrl] || abaUrl;

  function atualizarParams(patch) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([chave, valor]) => {
      const vazio = valor === null || valor === undefined || valor === '';
      if (vazio) next.delete(chave);
      else next.set(chave, String(valor));
    });
    setSearchParams(next, { replace: true });
  }

  function handleEmpresaChange(novoId) {
    atualizarParams({ empresa_id: novoId || null, plano: null });
    setTotalPlanoContas(0);
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

  // Botão "Nova categoria" (aba Orçamento) fica aqui no topo (padrão do resto do sistema), mas a
  // janela de criar continua vivendo em OrcamentoTab.jsx — dispara por ref, mesmo esquema de
  // ClassificacoesTab.jsx em Saldo Contas Bancárias.
  const orcamentoTabRef = useRef(null);

  // Mesmo esquema pro botão "Nova máscara" da aba Máscaras (igual à DFC Construtoras).
  const mascarasTabRef = useRef(null);

  // Busca (nome ou código do centro de custo) da aba Orçamento — só conveniência de navegador,
  // não fica na URL (mesma convenção de bancosSearch/contasSearch em SaldoContasBancariasPage.jsx).
  const [buscaOrcamento, setBuscaOrcamento] = useState('');

  // Busca (nome ou código da conta) da aba Plano de Contas — mesma convenção acima.
  const [buscaPlanoContas, setBuscaPlanoContas] = useState('');

  // Busca (código ou descrição) da aba Centros Custos — mesma convenção acima.
  const [buscaCentros, setBuscaCentros] = useState('');

  // Aba Unidades: busca (unidade ou centro) e o ícone de atualizar do Sienge — a sincronização e
  // o Log de Atualização vivem em UnidadesTab.jsx, disparados por ref (mesmo esquema do "Nova
  // categoria" do Orçamento); `atualizandoUnidades` só gira o ícone.
  const unidadesTabRef = useRef(null);
  const [buscaUnidades, setBuscaUnidades] = useState('');
  const [atualizandoUnidades, setAtualizandoUnidades] = useState(false);

  // Busca (cliente, unidade ou centro de custo) da aba Correções — mesma convenção acima.
  const [buscaCorrecoes, setBuscaCorrecoes] = useState('');

  // Geração/atualização do plano de contas (Sienge) — mesmo esquema de handleAtualizarContas
  // em SaldoContasBancariasPage.jsx. `totalPlanoContas` (reportado pela própria aba via
  // onTotal) decide qual ícone mostrar: "+" sem nenhuma conta gerada ainda, refresh depois de
  // gerado pela primeira vez (pedido explícito do usuário) — mesma mecânica de ícone que muda
  // conforme o estado do cadeado (Lock/LockOpen) da aba Saldos das Contas.
  const [totalPlanoContas, setTotalPlanoContas] = useState(0);
  const [gerandoPlanoContas, setGerandoPlanoContas] = useState(false);
  const [erroPlanoContas, setErroPlanoContas] = useState('');
  const [refreshTokenPlanoContas, setRefreshTokenPlanoContas] = useState(0);

  async function handleGerarOuAtualizarPlanoContas() {
    setErroPlanoContas('');
    setGerandoPlanoContas(true);
    try {
      await gerarPlano(Number(empresaId));
      setRefreshTokenPlanoContas((n) => n + 1);
    } catch (err) {
      setErroPlanoContas(err.response?.data?.message || 'Não foi possível gerar/atualizar o plano de contas.');
    } finally {
      setGerandoPlanoContas(false);
    }
  }

  // Aba Plano de Contas: mesmo esquema do Plano Contas da DFC (DfcConstrutorasPage.jsx). Abre nos
  // cards dos planos (PlanosContasLista); clicar num card abre o plano pra edição. Qual plano está
  // aberto vai na URL (`plano`: 'global' ou o id do centro com plano próprio), pra o "Voltar" do
  // navegador funcionar. Sem `plano` = os cards.
  const confirm = useConfirm();
  const [versoesPlano, setVersoesPlano] = useState([]);
  const versaoPlano = searchParams.get('plano') || '';
  const [novaVersaoAberta, setNovaVersaoAberta] = useState(false);
  const [refreshTokenCardsPlano, setRefreshTokenCardsPlano] = useState(0);
  const abrirPlano = (plano) => atualizarParams({ plano: plano || null });

  function carregarVersoesPlano() {
    if (!empresaId) {
      setVersoesPlano([]);
      return Promise.resolve([]);
    }
    return listVersoesPlanoDre(empresaId)
      .then((lista) => {
        setVersoesPlano(lista);
        return lista;
      })
      .catch(() => []);
  }

  useEffect(() => {
    if (abaAtiva === 'plano-de-contas') carregarVersoesPlano();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, abaAtiva]);

  // Plano de centro que não existe mais (excluído, ou link antigo): volta pros cards.
  const planoCentro = versaoPlano && versaoPlano !== 'global' ? versoesPlano.find((v) => String(v.centro_id) === versaoPlano) : null;
  const planoAberto = versaoPlano === 'global' || Boolean(planoCentro);

  async function excluirVersaoPlano() {
    if (!planoCentro) return;
    const ok = await confirm({
      title: 'Excluir versão do plano',
      description: `Excluir a versão própria do plano de contas de ${planoCentro.name}? As classificações dela serão apagadas e o centro volta a seguir o plano Global.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await excluirVersaoPlanoDre(empresaId, planoCentro.centro_id);
      abrirPlano(null);
      carregarVersoesPlano();
      setRefreshTokenCardsPlano((n) => n + 1);
    } catch (e) {
      setErroPlanoContas(e.response?.data?.message || 'Não foi possível excluir a versão.');
    }
  }

  // Exportar Excel do plano aberto (Global ou o do centro): espelho da tabela, montado no backend
  // (drePlanoContas.excel.js) — mesmo download do Exportar Excel da DFC.
  const [exportandoPlano, setExportandoPlano] = useState(false);
  async function exportarPlanoExcel() {
    setErroPlanoContas('');
    setExportandoPlano(true);
    try {
      const { blob, nome } = await exportarPlanoDreExcel(empresaId, planoCentro?.centro_id ?? null);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // Com responseType 'blob' a mensagem de erro do backend chega dentro de um Blob.
      let mensagem = 'Não foi possível gerar o Excel.';
      const dados = err.response?.data;
      try {
        mensagem = (dados instanceof Blob ? JSON.parse(await dados.text()) : dados)?.message || mensagem;
      } catch {
        // mantém a mensagem padrão
      }
      setErroPlanoContas(mensagem);
    } finally {
      setExportandoPlano(false);
    }
  }

  const semEmpresa = !empresaId;

  return (
    <div className="space-y-4">
      <Card className="shrink-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-1 sm:flex-row sm:flex-wrap">
            <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
              <SearchableSelect
                value={empresaId}
                onChange={handleEmpresaChange}
                disabled={loadingEmpresas || empresaTravada}
                options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
                placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
                emptyMessage="Nenhuma empresa encontrada."
              />
            </div>

            {abaAtiva === 'orcamento' && (
              <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={buscaOrcamento}
                    onChange={(e) => setBuscaOrcamento(e.target.value)}
                    disabled={semEmpresa}
                    placeholder={semEmpresa ? 'Selecione a empresa primeiro' : 'Buscar por centro de custo...'}
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
            )}

            {abaAtiva === 'plano-de-contas' && planoAberto && (
              <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={buscaPlanoContas}
                    onChange={(e) => setBuscaPlanoContas(e.target.value)}
                    disabled={semEmpresa}
                    placeholder={semEmpresa ? 'Selecione a empresa primeiro' : 'Buscar por código ou descrição...'}
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
            )}

            {abaAtiva === 'unidades' && (
              <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={buscaUnidades}
                    onChange={(e) => setBuscaUnidades(e.target.value)}
                    disabled={semEmpresa}
                    placeholder={semEmpresa ? 'Selecione a empresa primeiro' : 'Buscar por unidade ou centro de custo...'}
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
            )}

            {abaAtiva === 'correcoes' && (
              <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={buscaCorrecoes}
                    onChange={(e) => setBuscaCorrecoes(e.target.value)}
                    disabled={semEmpresa}
                    placeholder={semEmpresa ? 'Selecione a empresa primeiro' : 'Buscar por cliente, unidade ou centro de custo...'}
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
                    disabled={semEmpresa}
                    placeholder={semEmpresa ? 'Selecione a empresa primeiro' : 'Buscar por código ou descrição...'}
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
            )}
          </div>

          {abaAtiva === 'unidades' && (
            <div className="flex shrink-0 items-center gap-2">
              {/* Mesmo ícone de atualizar do Repasses CEF: busca unidades e contratos no Sienge. */}
              <button
                type="button"
                onClick={() => unidadesTabRef.current?.atualizar()}
                disabled={semEmpresa || atualizandoUnidades}
                title="Atualizar unidades e contratos a partir do Sienge"
                className="flex shrink-0 items-center justify-center rounded-lg bg-primary-600 p-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={18} className={atualizandoUnidades ? 'animate-spin' : ''} />
              </button>
            </div>
          )}

          {abaAtiva === 'mascaras' && (
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" onClick={() => mascarasTabRef.current?.abrirNova()} disabled={semEmpresa}>
                <Plus size={16} />
                Nova máscara
              </Button>
            </div>
          )}

          {abaAtiva === 'orcamento' && (
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" onClick={() => orcamentoTabRef.current?.abrirNova()} disabled={semEmpresa}>
                <Plus size={16} />
                Nova categoria
              </Button>
            </div>
          )}

          {abaAtiva === 'plano-de-contas' && planoAberto && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex shrink-0 items-center gap-2">
                {planoCentro && (
                  <button
                    type="button"
                    onClick={excluirVersaoPlano}
                    title="Excluir o plano deste centro (ele volta a seguir o Global)"
                    className="flex shrink-0 items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={exportarPlanoExcel}
                  disabled={semEmpresa || exportandoPlano}
                  title="Exportar Excel"
                  aria-label="Exportar Excel"
                  className="flex shrink-0 items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exportandoPlano ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                </button>
                {/* Só o ícone (pedido do usuário, mesmo padrão de ContasTab.jsx em Saldo Contas
                    Bancárias): "+" gera o plano de contas pela primeira vez, refresh atualiza
                    (traz novas contas) depois de já gerado — troca sozinho conforme
                    totalPlanoContas, reportado pela própria aba (onTotal). */}
                <button
                  type="button"
                  onClick={handleGerarOuAtualizarPlanoContas}
                  disabled={semEmpresa || gerandoPlanoContas}
                  title={totalPlanoContas === 0 ? 'Gerar plano de contas a partir do Sienge' : 'Atualizar a partir do Sienge'}
                  className="flex shrink-0 items-center justify-center rounded-lg bg-primary-600 p-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {totalPlanoContas === 0 ? (
                    <Plus size={18} />
                  ) : (
                    <RefreshCw size={18} className={gerandoPlanoContas ? 'animate-spin' : ''} />
                  )}
                </button>
              </div>
              {erroPlanoContas && <span className="text-xs text-red-600">{erroPlanoContas}</span>}
            </div>
          )}
        </div>
      </Card>

      <div>
        <Tabs tabs={TABS} activeId={abaAtiva} onChange={(aba) => atualizarParams({ aba })} />

        {abaAtiva === 'dre' && <DreTab empresaId={empresaId} />}

        {abaAtiva === 'mascaras' && <MascarasTab ref={mascarasTabRef} empresaId={empresaId} />}

        {abaAtiva === 'centros-custos' && <CentrosCustosTab empresaId={empresaId} search={buscaCentros} />}

        {abaAtiva === 'orcamento' && <OrcamentoTab ref={orcamentoTabRef} empresaId={empresaId} search={buscaOrcamento} />}

        {abaAtiva === 'unidades' && (
          <UnidadesTab
            ref={unidadesTabRef}
            empresaId={empresaId}
            search={buscaUnidades}
            onAtualizando={setAtualizandoUnidades}
          />
        )}

        {abaAtiva === 'correcoes' && <CorrecoesTab empresaId={empresaId} search={buscaCorrecoes} />}

        {abaAtiva === 'plano-de-contas' &&
          (planoAberto ? (
            <PlanoDeContasTab
              empresaId={empresaId}
              search={buscaPlanoContas}
              refreshToken={refreshTokenPlanoContas}
              onTotal={setTotalPlanoContas}
              centroVersao={planoCentro ? planoCentro.centro_id : null}
              tituloPlano={planoCentro ? planoCentro.name : 'Global'}
              onVoltar={() => {
                abrirPlano(null);
                setRefreshTokenCardsPlano((n) => n + 1);
              }}
            />
          ) : (
            <PlanosContasLista
              empresaId={empresaId}
              onAbrir={abrirPlano}
              onNovo={() => setNovaVersaoAberta(true)}
              refreshToken={refreshTokenCardsPlano}
            />
          ))}
      </div>

      <NovaVersaoPlanoModal
        open={novaVersaoAberta}
        onClose={() => setNovaVersaoAberta(false)}
        empresaId={empresaId}
        versoes={versoesPlano}
        onCriada={(criada) => {
          setNovaVersaoAberta(false);
          setRefreshTokenCardsPlano((n) => n + 1);
          carregarVersoesPlano().then(() => abrirPlano(String(criada.centro_id)));
        }}
      />
    </div>
  );
}
