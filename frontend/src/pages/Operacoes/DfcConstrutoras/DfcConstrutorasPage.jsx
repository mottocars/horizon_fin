import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Banknote,
  Building2,
  Calculator,
  Download,
  Globe,
  HandCoins,
  HardHat,
  Landmark,
  ListTree,
  Loader2,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Save,
  Search,
  Upload,
  Trash2,
  FilePlus2,
  Maximize2,
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
import { listCentrosCustoDfc } from '../../../api/dfcCentros.api';
import { gerarPlano } from '../../../api/planosFinanceirosSienge.api';
import { excluirVersaoPlanoDfc, exportarPlanoDfcExcel, listVersoesPlanoDfc } from '../../../api/dfcPlanoContas.api';
import { exportarExcelDfc } from '../../../api/dfcExportacao.api';
import { baixarLayoutOrcamento } from '../../../api/dfcPlanilhaOrcamentaria.api';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import AbaEmConstrucao from './AbaEmConstrucao';
import DfcMascarasTab from './DfcMascarasTab';
import DfcParametrosTab from './DfcParametrosTab';
import DfcCentrosTab from './DfcCentrosTab';
import DfcCiwebTab from './DfcCiwebTab';
import DfcPlanoContasTab from './DfcPlanoContasTab';
import DfcAvancosTab from './DfcAvancosTab';
import DfcRepassesTab from './DfcRepassesTab';
import DfcOrcamentosTab from './DfcOrcamentosTab';
import NovaVersaoOrcamentoModal from './NovaVersaoOrcamentoModal';
import DfcFluxoTab from './DfcFluxoTab';
import DfcContasCorrentesTab from './DfcContasCorrentesTab';
import NovaVersaoPlanoModal from './NovaVersaoPlanoModal';
import { ORIGENS_PROJECAO, ORIGEM_NAO_INFORMADA } from './orcamentoValores';
import PlanosContasLista from './PlanosContasLista';

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
  { id: 'avancos-obras', label: 'Avanços', icon: HardHat },
  { id: 'repasses', label: 'Repasses', icon: Banknote },
  { id: 'contas-correntes', label: 'Contas', icon: Landmark },
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
  const tabAtiva = TABS.find((t) => t.id === abaAtiva && !t.disabled) || TABS[0];

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
  // De qual centro é a lista em `versoes` — enquanto a lista do centro novo não chega, nenhuma versão
  // fica selecionada (a aba não pede a versão do centro anterior pro centro novo).
  const [versoesCentro, setVersoesCentro] = useState(null);

  // Só a resposta do pedido mais recente vale (trocar de centro rápido não deixa a lista de outro
  // centro por cima).
  const pedidoVersoes = useRef(0);
  function carregarVersoes() {
    const pedido = ++pedidoVersoes.current;
    if (!empresaId || !centroId) {
      setVersoes([]);
      setVersaoId('');
      return;
    }
    setLoadingVersoes(true);
    listVersoesParametrosDfc(empresaId, centroId)
      .then((lista) => {
        if (pedido !== pedidoVersoes.current) return;
        setVersoes(lista);
        setVersoesCentro(String(centroId));
        setVersaoId(lista[0]?.id ?? '');
      })
      .catch(() => {
        if (pedido !== pedidoVersoes.current) return;
        setVersoes([]);
        setVersaoId('');
      })
      .finally(() => pedido === pedidoVersoes.current && setLoadingVersoes(false));
  }

  // Trocou de centro: zera a versão escolhida e recarrega a lista (ver `versoesCentro`).
  useEffect(() => {
    setVersoes([]);
    setVersaoId('');
    setVersoesCentro(null);
    carregarVersoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, centroId]);

  const versaoSelecionada = versoesCentro === String(centroId) ? versoes.find((v) => v.id === versaoId) || null : null;
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

  // Aba Contas Correntes: busca (conveniência de navegador) e o ícone de buscar as contas no Sienge
  // (a aba faz a busca — `contasTabRef.current.sincronizar()`).
  const [buscaContas, setBuscaContas] = useState('');
  const [sincronizandoContas, setSincronizandoContas] = useState(false);
  const contasTabRef = useRef(null);

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

  // Aba Avanços: período (Data início / Data fim) — padrão sempre o ano atual inteiro
  // (pedido do usuário). Só conveniência de navegador, fora da URL.
  const anoAtual = new Date().getFullYear();
  const [inicioAvancos, setInicioAvancos] = useState(`${anoAtual}-01-01`);
  const [fimAvancos, setFimAvancos] = useState(`${anoAtual}-12-31`);

  // Aba Repasses: busca por mutuário ou contrato (só conveniência de navegador, fora da URL).
  const [buscaRepasses, setBuscaRepasses] = useState('');

  // Aba Orçamentos (e DFC): período das colunas — padrão do mês anterior ao atual até 4 meses depois do
  // atual (pedido do usuário: em out/26, de set/26 a fev/27 — o mesmo do dashboard, histórico 1 +
  // horizonte 5). Só conveniência de navegador, fora da URL.
  const [inicioOrcamento, setInicioOrcamento] = useState(() => {
    const d = new Date();
    const ini = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return `${ini.getFullYear()}-${String(ini.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [fimOrcamento, setFimOrcamento] = useState(() => {
    const d = new Date();
    const fim = new Date(d.getFullYear(), d.getMonth() + 5, 0); // último dia de (mês atual + 4)
    return `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}`;
  });

  // Aba DFC (fluxo de caixa): mesmo período do Orçamentos e filtro de centros de custo (os com
  // "Projeta DFC"; vazio = todos).
  const [centrosFluxo, setCentrosFluxo] = useState([]);
  const [fluxoTelaCheia, setFluxoTelaCheia] = useState(false);
  const [centrosFluxoOpcoes, setCentrosFluxoOpcoes] = useState([]);
  useEffect(() => {
    setCentrosFluxo([]);
    if (!empresaId) {
      setCentrosFluxoOpcoes([]);
      return;
    }
    listCentrosCustoDfc(empresaId)
      .then((lista) =>
        setCentrosFluxoOpcoes(
          lista
            .filter((c) => c.projeta_dfc)
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
            .map((c) => ({ value: c.sienge_id, label: c.name }))
        )
      )
      .catch(() => setCentrosFluxoOpcoes([]));
  }, [empresaId]);

  // Aba Orçamentos: filtro "Origem DFC" (Origem Projeção das contas no plano do centro); vazio =
  // todas.
  const [origensOrcamento, setOrigensOrcamento] = useState([]);

  // Aba Plano Contas: abre nos cards dos planos (PlanosContasLista); clicar num card abre o plano
  // pra edição. Qual plano está aberto vai na URL (`plano`: 'global' ou o id do centro com plano
  // próprio — tem prioridade no Orçamento / Projeção CEF dele), pra o "Voltar" do navegador
  // funcionar. Sem `plano` = os cards.
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
    return listVersoesPlanoDfc(empresaId)
      .then((lista) => {
        setVersoesPlano(lista);
        return lista;
      })
      .catch(() => []);
  }

  useEffect(() => {
    if (abaAtiva === 'plano-contas') carregarVersoesPlano();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, abaAtiva]);

  // Plano de centro que não existe mais (excluído, ou link antigo): volta pros cards.
  const planoCentro = versaoPlano && versaoPlano !== 'global' ? versoesPlano.find((v) => String(v.centro_id) === versaoPlano) : null;
  const planoAberto = versaoPlano === 'global' || Boolean(planoCentro);

  async function excluirVersaoPlano() {
    const versao = versoesPlano.find((v) => String(v.centro_id) === String(versaoPlano));
    if (!versao) return;
    const ok = await confirm({
      title: 'Excluir versão do plano',
      description: `Excluir a versão própria do plano de contas de ${versao.name}? As classificações dela serão apagadas e o centro volta a seguir o plano Global.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await excluirVersaoPlanoDfc(empresaId, versao.centro_id);
      abrirPlano(null);
      carregarVersoesPlano();
      setRefreshTokenCardsPlano((n) => n + 1);
    } catch (e) {
      setErroPlano(e.response?.data?.message || 'Não foi possível excluir a versão.');
    }
  }

  // Exportar Excel do plano aberto (Global ou o do centro): espelho da tabela, montado no backend
  // (dfcPlanoContas.excel.js) — mesmo download do Exportar Excel da aba DFC.
  const [exportandoPlano, setExportandoPlano] = useState(false);
  async function exportarPlanoExcel() {
    setErroPlano('');
    setExportandoPlano(true);
    try {
      const { blob, nome } = await exportarPlanoDfcExcel(empresaId, planoCentro?.centro_id ?? null);
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
      setErroPlano(mensagem);
    } finally {
      setExportandoPlano(false);
    }
  }

  // Aba Orçamentos — versões (ver DfcOrcamentosTab): o filtro "Versão" começa sempre na última
  // (null); 'nova' = a nova versão montada pelo ícone "Nova versão" (janela NovaVersaoOrcamentoModal,
  // que atualiza as bases e monta a versão — `novaVersaoToken`). Salva, ela vira a última.
  const [versaoOrcamento, setVersaoOrcamento] = useState(null);
  const [versoesOrcamento, setVersoesOrcamento] = useState({ lista: [], temNova: false });
  const [novaVersaoToken, setNovaVersaoToken] = useState(0);
  const [novaVersaoPeriodos, setNovaVersaoPeriodos] = useState('atual_em_diante');
  const [novaVersaoOrcamentoAberta, setNovaVersaoOrcamentoAberta] = useState(false);
  const orcamentoEmNova = versaoOrcamento === 'nova';
  // "Tela cheia" da grade do Orçamento (ícone no topo); sai pelo botão da própria tela cheia ou com
  // Esc — ver DfcOrcamentosTab.
  const [orcamentoTelaCheia, setOrcamentoTelaCheia] = useState(false);

  // Aba Orçamentos: "Layout do orçamento" — Excel travado com todos os centros × naturezas HORIZON -
  // INFORMADO × meses e os valores da última versão (Planilha Orçamentária; importa na Nova versão).
  const [baixandoLayout, setBaixandoLayout] = useState(false);
  const [erroLayout, setErroLayout] = useState('');
  useEffect(() => setErroLayout(''), [empresaId, abaAtiva]);
  async function baixarLayout() {
    setErroLayout('');
    setBaixandoLayout(true);
    try {
      const { blob, nome } = await baixarLayoutOrcamento(empresaId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      let mensagem = 'Não foi possível gerar o layout do orçamento.';
      const dados = err.response?.data;
      try {
        mensagem = (dados instanceof Blob ? JSON.parse(await dados.text()) : dados)?.message || mensagem;
      } catch {
        // mantém a mensagem padrão
      }
      setErroLayout(mensagem);
    } finally {
      setBaixandoLayout(false);
    }
  }

  // Aba DFC: "Exportar Excel" — o .xlsx do que está filtrado (empresa, período, centros), montado no
  // backend (dfc-exportacao): Fluxo de Caixa, Saldos das Contas, Base Realizado, Base Projetado e o
  // dossiê da Projeção CEF de cada obra.
  const [exportandoFluxo, setExportandoFluxo] = useState(false);
  const [erroExportacao, setErroExportacao] = useState('');
  useEffect(() => setErroExportacao(''), [empresaId, abaAtiva]);
  async function exportarFluxoExcel() {
    setErroExportacao('');
    setExportandoFluxo(true);
    try {
      const { blob, nome } = await exportarExcelDfc(empresaId, {
        inicio: inicioOrcamento.slice(0, 7),
        fim: fimOrcamento.slice(0, 7),
        centros: centrosFluxo,
      });
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
      setErroExportacao(mensagem);
    } finally {
      setExportandoFluxo(false);
    }
  }
  const periodoFluxoValido = Boolean(inicioOrcamento && fimOrcamento && fimOrcamento >= inicioOrcamento);

  // Botão "Nova máscara" fica no topo (padrão do resto do sistema, igual "Nova categoria" na
  // DRE), mas o campo de criar vive em DfcMascarasTab.jsx — dispara por ref.
  const mascarasTabRef = useRef(null);
  const orcamentosTabRef = useRef(null);

  return (
    <div className="space-y-4">
      <Card className="shrink-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-1 sm:flex-row sm:flex-wrap">
            <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
              <SearchableSelect
                value={empresaId}
                onChange={(novoId) => {
                  setVersaoOrcamento(null);
                  setVersoesOrcamento({ lista: [], temNova: false });
                  atualizarParams({ empresa_id: novoId || null, centro_id: null, plano: null });
                }}
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

            {(abaAtiva === 'orcamentos' || abaAtiva === 'dfc') && (
              <>
                <div className="sm:w-36">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Data início</label>
                  <input
                    type="date"
                    value={inicioOrcamento}
                    onChange={(e) => setInicioOrcamento(e.target.value)}
                    disabled={!empresaId}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div className="sm:w-36">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Data fim</label>
                  <input
                    type="date"
                    value={fimOrcamento}
                    onChange={(e) => setFimOrcamento(e.target.value)}
                    disabled={!empresaId}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                {abaAtiva === 'dfc' && (
                  <div className="sm:min-w-56 sm:max-w-xs sm:flex-1">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Centro de custo</label>
                    <SearchableSelect
                      multiple
                      value={centrosFluxo}
                      onChange={(lista) => setCentrosFluxo(lista || [])}
                      disabled={!empresaId}
                      options={centrosFluxoOpcoes}
                      placeholder="Todos os centros"
                      larguraPainel={320}
                    />
                  </div>
                )}
                {abaAtiva === 'orcamentos' && (
                <>
                <div className="sm:min-w-56 sm:max-w-xs sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Origem DFC</label>
                  <SearchableSelect
                    multiple
                    value={origensOrcamento}
                    onChange={(lista) => setOrigensOrcamento(lista || [])}
                    disabled={!empresaId}
                    options={[{ value: ORIGEM_NAO_INFORMADA, label: 'NÃO INFORMADO' }, ...ORIGENS_PROJECAO]}
                    placeholder="Todas as origens"
                    larguraPainel={320}
                  />
                </div>
                <div className="sm:min-w-48 sm:max-w-60 sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Versão</label>
                  <SearchableSelect
                    value={versaoOrcamento === 'nova' ? 'nova' : (versaoOrcamento ?? versoesOrcamento.lista[0]?.numero ?? '')}
                    onChange={(v) => {
                      if (!v) return;
                      setVersaoOrcamento(v === 'nova' ? 'nova' : Number(v));
                    }}
                    disabled={!empresaId || (!versoesOrcamento.lista.length && !versoesOrcamento.temNova)}
                    options={[
                      ...(versoesOrcamento.temNova ? [{ value: 'nova', label: 'Nova versão (não salva)' }] : []),
                      ...versoesOrcamento.lista.map((v, i) => ({
                        value: v.numero,
                        label: `Versão ${v.numero}${i === 0 ? ' (última)' : ''} · ${new Date(v.criado_em).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                        })}`,
                      })),
                    ]}
                    placeholder="Nenhuma versão salva"
                    clearable={false}
                    larguraPainel={280}
                  />
                </div>
                </>
                )}
              </>
            )}

            {abaAtiva === 'repasses' && (
              <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={buscaRepasses}
                    onChange={(e) => setBuscaRepasses(e.target.value)}
                    disabled={!empresaId}
                    placeholder={!empresaId ? 'Selecione a empresa primeiro' : 'Buscar por mutuário ou contrato...'}
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
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

            {abaAtiva === 'plano-contas' && planoAberto && (
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

            {abaAtiva === 'contas-correntes' && (
              <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={buscaContas}
                    onChange={(e) => setBuscaContas(e.target.value)}
                    disabled={!empresaId}
                    placeholder={!empresaId ? 'Selecione a empresa primeiro' : 'Buscar por conta, banco ou empresa...'}
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

          {abaAtiva === 'contas-correntes' && (
            <div className="flex shrink-0 items-center gap-2">
              {/* Mesmo ícone do "gerar/atualizar plano de contas": busca as contas no Sienge. */}
              <button
                type="button"
                onClick={() => contasTabRef.current?.sincronizar()}
                disabled={!empresaId || sincronizandoContas}
                title="Buscar as contas no Sienge"
                aria-label="Buscar as contas no Sienge"
                className="flex shrink-0 items-center justify-center rounded-lg bg-primary-600 p-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={18} className={sincronizandoContas ? 'animate-spin' : ''} />
              </button>
            </div>
          )}

          {abaAtiva === 'dfc' && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="!px-2.5"
                onClick={() => setFluxoTelaCheia(true)}
                disabled={!empresaId}
                title="Tela cheia"
                aria-label="Tela cheia"
              >
                <Maximize2 size={18} />
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="!px-2.5"
                onClick={exportarFluxoExcel}
                disabled={!empresaId || !periodoFluxoValido || exportandoFluxo}
                title="Exportar Excel"
                aria-label="Exportar Excel"
              >
                {exportandoFluxo ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
              </Button>
            </div>
            {erroExportacao && <span className="max-w-xs text-right text-xs text-red-600">{erroExportacao}</span>}
            </div>
          )}

          {abaAtiva === 'orcamentos' && (
            // Só ícones (dica no title): layout do orçamento, nova versão, salvar a nova versão e tela cheia.
            <div className="flex shrink-0 flex-col items-end gap-1">
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="!px-2.5"
                onClick={baixarLayout}
                disabled={!empresaId || baixandoLayout}
                title="Layout do orçamento (Planilha Orçamentária)"
                aria-label="Layout do orçamento"
              >
                {baixandoLayout ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="!px-2.5"
                onClick={() => setNovaVersaoOrcamentoAberta(true)}
                disabled={!empresaId}
                title="Nova versão"
                aria-label="Nova versão"
              >
                <FilePlus2 size={18} />
              </Button>
              <Button
                type="button"
                className="!px-2.5"
                onClick={() => orcamentosTabRef.current?.salvarVersao()}
                disabled={!empresaId || !orcamentoEmNova}
                title={orcamentoEmNova ? 'Salvar versão' : 'Monte uma nova versão pra poder salvar'}
                aria-label="Salvar versão"
              >
                <Save size={18} />
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="!px-2.5"
                onClick={() => setOrcamentoTelaCheia(true)}
                disabled={!empresaId}
                title="Tela cheia"
                aria-label="Tela cheia"
              >
                <Maximize2 size={18} />
              </Button>
            </div>
            {erroLayout && <span className="max-w-xs text-right text-xs text-red-600">{erroLayout}</span>}
            </div>
          )}

          {abaAtiva === 'plano-contas' && planoAberto && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
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
                  disabled={!empresaId || exportandoPlano}
                  title="Exportar Excel"
                  aria-label="Exportar Excel"
                  className="flex shrink-0 items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exportandoPlano ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                </button>
                <button
                  type="button"
                  onClick={handleGerarOuAtualizarPlano}
                  disabled={!empresaId || gerandoPlano}
                  title={totalPlano === 0 ? 'Gerar plano de contas a partir do Sienge' : 'Atualizar a partir do Sienge'}
                  className="flex shrink-0 items-center justify-center rounded-lg bg-primary-600 p-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {totalPlano === 0 ? <Plus size={18} /> : <RefreshCw size={18} className={gerandoPlano ? 'animate-spin' : ''} />}
                </button>
              </div>
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

        {tabAtiva.id === 'orcamentos' ? (
          <DfcOrcamentosTab
            ref={orcamentosTabRef}
            empresaId={empresaId}
            inicio={inicioOrcamento}
            fim={fimOrcamento}
            origens={origensOrcamento}
            versao={versaoOrcamento}
            novaVersaoToken={novaVersaoToken}
            novaVersaoPeriodos={novaVersaoPeriodos}
            onVersoes={(lista, temNova) => setVersoesOrcamento({ lista, temNova })}
            onVersaoSalva={() => setVersaoOrcamento(null)}
            telaCheia={orcamentoTelaCheia}
            onSairTelaCheia={() => setOrcamentoTelaCheia(false)}
          />
        ) : tabAtiva.id === 'repasses' ? (
          <DfcRepassesTab empresaId={empresaId} search={buscaRepasses} />
        ) : tabAtiva.id === 'avancos-obras' ? (
          <DfcAvancosTab empresaId={empresaId} inicio={inicioAvancos} fim={fimAvancos} />
        ) : tabAtiva.id === 'plano-contas' ? (
          planoAberto ? (
            <DfcPlanoContasTab
              empresaId={empresaId}
              search={buscaPlano}
              refreshToken={refreshTokenPlano}
              onTotal={setTotalPlano}
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
          )
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
            versaoVigenteNumero={versoesCentro === String(centroId) ? (versoes[0]?.versao ?? null) : null}
            onVersaoCriada={() => {
              carregarVersoes();
              carregarCentros();
            }}
            onStatusChange={setStatusParametros}
          />
        ) : tabAtiva.id === 'mascaras' ? (
          <DfcMascarasTab ref={mascarasTabRef} empresaId={empresaId} />
        ) : tabAtiva.id === 'contas-correntes' ? (
          <DfcContasCorrentesTab
            ref={contasTabRef}
            empresaId={empresaId}
            search={buscaContas}
            onSincronizando={setSincronizandoContas}
          />
        ) : tabAtiva.id === 'dfc' ? (
          <DfcFluxoTab
            empresaId={empresaId}
            inicio={inicioOrcamento}
            fim={fimOrcamento}
            centros={centrosFluxo}
            telaCheia={fluxoTelaCheia}
            onSairTelaCheia={() => setFluxoTelaCheia(false)}
          />
        ) : (
          <AbaEmConstrucao key={tabAtiva.id} empresaId={empresaId} icon={tabAtiva.icon} titulo={tabAtiva.label} />
        )}
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

      <NovaVersaoOrcamentoModal
        open={novaVersaoOrcamentoAberta}
        onClose={() => setNovaVersaoOrcamentoAberta(false)}
        empresaId={empresaId}
        onGerar={({ periodos }) => {
          setNovaVersaoOrcamentoAberta(false);
          setNovaVersaoPeriodos(periodos);
          setVersaoOrcamento('nova');
          setNovaVersaoToken((n) => n + 1);
        }}
      />
    </div>
  );
}
