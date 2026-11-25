import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  BarChart3,
  CircleX,
  Building2,
  Calculator,
  CopyPlus,
  Download,
  FilePlus2,
  FileSpreadsheet,
  FilePenLine,
  History,
  House,
  ListTree,
  Loader2,
  Lock,
  LockOpen,
  Maximize2,
  PencilLine,
  Percent,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Tags,
  Trash2,
  TrendingUp,
  Undo2,
  Upload,
  Wallet,
} from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import SeletorMes from '../../../components/SeletorMes';
import { listEmpresas } from '../../../api/empresas.api';
import { gerarPlano } from '../../../api/planosFinanceirosSienge.api';
import { excluirVersaoPlanoDre, exportarPlanoDreExcel, listVersoesPlanoDre } from '../../../api/drePlanoContas.api';
import { exportarExcelDre } from '../../../api/dreExportacao.api';
import { exportarCentrosDreExcel, listUnidadesDre } from '../../../api/dreCentros.api';
import { exportarFinanceiroDreExcel } from '../../../api/dreFinanceiro.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { useSidebar } from '../../../layout/SidebarContext';
import { abrirVersaoDre, aprovarVersaoDre, excluirVersaoDre, listarVersoesDre, reprovarVersaoDre, salvarVersaoDre } from '../../../api/dreVersoes.api';
import Modal from '../../../components/Modal';
import VersoesDreTab from './VersoesDreTab';
import { LeituraDreContext } from './leituraDre';
import SoLeitura from './SoLeitura';
import OrcamentoTab from './OrcamentoTab';
import MascarasTab from './MascarasTab';
import PlanoDeContasTab from './PlanoDeContasTab';
import PlanosContasLista from './PlanosContasLista';
import NovaVersaoPlanoModal from './NovaVersaoPlanoModal';
import CentrosCustosTab from './CentrosCustosTab';
import UnidadesTab from './UnidadesTab';
import CorrecoesTab from './CorrecoesTab';
import FinanceiroTab from './FinanceiroTab';
import ConfiguracoesDreTab from './ConfiguracoesDreTab';
import ProjecoesDreTab from './ProjecoesDreTab';
import DreTab from './DreTab';
import PocTab from './PocTab';

// O `{ divider: true }` separa a DRE (a demonstração em si) e a POC (logo depois dela, a pedido do
// usuário) das abas de cadastro/parâmetro que
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
  { id: 'poc', label: 'POC', icon: Percent },
  { divider: true },
  { id: 'centros-custos', label: 'Centros Custos', icon: Building2 },
  { id: 'mascaras', label: 'Máscaras', icon: Tags },
  { id: 'plano-de-contas', label: 'Plano Contas', icon: ListTree },
  { id: 'orcamento', label: 'Orçamento', icon: Calculator },
  { id: 'unidades', label: 'Unidades', icon: House },
  { id: 'correcoes', label: 'Correções', icon: FilePenLine },
  { id: 'financeiro', label: 'Financeiro', icon: Wallet },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
  { id: 'projecoes', label: 'Projeções', icon: TrendingUp },
  // Versões da DRE (pedido do usuário, como a aba Versões de Cronogramas Obras): VersoesDreTab.jsx.
  { id: 'versoes', label: 'Versões', icon: History },
];

// Colunas da aba DRE (filtro "Colunas"): cada centro / mês mostra as marcadas.
const COLUNAS_DRE = [
  { value: 'valor', label: 'Valor' },
  { value: 'pct', label: 'AV.R % / AH %' },
  { value: 'proj', label: 'Projetado' },
  { value: 'pctp', label: 'AV.P %' },
  { value: 'desvio', label: 'Desvio %' },
];

// Último dia do mês 'AAAA-MM' -> 'AAAA-MM-DD'.
function ultimoDiaDoMes(anoMes) {
  const [a, m] = anoMes.split('-').map(Number);
  return `${anoMes}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
}

// O período da DRE é por mês, sem dia (pedido do usuário — o realizado já para em hoje e o projetado
// vale o mês inteiro), no SeletorMes (mês abreviado, "nov/2026").

// Empresa e aba vivem na URL (não em useState local) — mesmo motivo de todas as outras telas
// com esse padrão (Saldo Contas Bancárias, Gestão de Cobranças): o "Voltar" do navegador
// devolve o usuário pro mesmo lugar, com a mesma empresa e a mesma aba.
// Versões da DRE: `?versao=N` na URL é o "Visualizar" da aba Versões — a tela inteira como era naquela versão
// (o cabeçalho X-Dre-Versao vai em todo pedido, ver api/http.js). Trocar de versão remonta a tela (key), e
// todas as abas buscam de novo.
export default function DreGerencialPage() {
  const [searchParams] = useSearchParams();
  return <DreGerencialConteudo key={searchParams.get('versao') || 'atual'} />;
}

function DreGerencialConteudo() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();
  // Com o menu lateral aberto as abas ficam sem ícone (pedido do usuário — falta espaço pras 12 abas).
  const { menuAberto } = useSidebar();

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
    atualizarParams({ empresa_id: novoId || null, plano: null, exercicio: null, centros: null });
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
  // Botão Novo agrupador da aba Centros Custos (CentrosCustosTab, pela ref).
  const centrosTabRef = useRef(null);

  // Busca (nome ou código do centro de custo) da aba Orçamento — só conveniência de navegador,
  // não fica na URL (mesma convenção de bancosSearch/contasSearch em SaldoContasBancariasPage.jsx).
  const [buscaOrcamento, setBuscaOrcamento] = useState('');

  // Busca (nome ou código da conta) da aba Plano de Contas — mesma convenção acima.
  const [buscaPlanoContas, setBuscaPlanoContas] = useState('');

  // Busca (código ou descrição) da aba Centros Custos — mesma convenção acima.
  const [buscaCentros, setBuscaCentros] = useState('');
  const [situacaoCentros, setSituacaoCentros] = useState('ATIVOS'); // aba Centros Custos: 'ATIVOS' | 'INATIVOS' | 'TODOS'

  // Aba Unidades: busca (unidade ou centro) e o ícone de atualizar do Sienge — a sincronização e
  // o Log de Atualização vivem em UnidadesTab.jsx, disparados por ref (mesmo esquema do "Nova
  // categoria" do Orçamento); `atualizandoUnidades` só gira o ícone.
  const unidadesTabRef = useRef(null);
  const [buscaUnidades, setBuscaUnidades] = useState('');
  const [atualizandoUnidades, setAtualizandoUnidades] = useState(false);

  // Busca (cliente, unidade ou centro de custo) da aba Correções — mesma convenção acima.
  const [buscaCorrecoes, setBuscaCorrecoes] = useState('');

  // Aba Financeiro: o exercício aberto vai na URL (`exercicio`: o ano; sem ele = os cards), pra o
  // "Voltar" do navegador funcionar — mesmo esquema do `plano` da aba Plano Contas. Busca dos
  // lançamentos do exercício aberto.
  const exercicioAberto = Number(searchParams.get('exercicio')) || null;
  const abrirExercicio = (ano) => atualizarParams({ exercicio: ano || null });
  const [buscaFinanceiro, setBuscaFinanceiro] = useState('');
  // Ícone "Novo lançamento" (exercício aberto): cada clique muda o token e a listagem abre a janela.
  // Exercício do ano atual ou futuro é só visualização — o ícone fica desabilitado (o backend recusa).
  const [novoLancamentoToken, setNovoLancamentoToken] = useState(0);
  const exercicioTravado = Boolean(exercicioAberto) && exercicioAberto >= new Date().getFullYear();
  useEffect(() => setBuscaFinanceiro(''), [empresaId, exercicioAberto]);

  // Aba DRE: período (de/até) e centros de custo na URL, como o resto dos filtros da tela. O período é
  // por mês: de = dia 1 do mês de início, até = último dia do mês de fim (uma data quebrada na URL, de
  // um link antigo, vale pelo mês dela). Sem período = de janeiro ao mês atual; sem centro = todos com
  // "Realiza DRE", somados.
  const hojeIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const dreMesDe = (searchParams.get('de') || `${hojeIso.slice(0, 4)}-01`).slice(0, 7);
  const dreMesAte = (searchParams.get('ate') || hojeIso).slice(0, 7);
  const dreDe = `${dreMesDe}-01`;
  const dreAte = ultimoDiaDoMes(dreMesAte);
  const dreCentros = (searchParams.get('centros') || '').split(',').filter(Boolean);
  // Aba DRE: colunas de cada centro / mês (Valor, AV.R % / AH %, Projetado, AV.P %, Desvio %) — na URL,
  // como os outros filtros.
  const dreColunas = (searchParams.get('colunas') || 'valor,pct,proj,pctp,desvio').split(',').filter((k) => COLUNAS_DRE.some((c) => c.value === k));
  // O projetado das colunas Projetado / Desvio é o da versão da DRE que a tela mostra (a aberta, a última
  // salva ou a visualizada) — o filtro "Versão" da aba DRE saiu (pedido do usuário: a escolha de versão fica
  // na aba Versões).
  const [dreTelaCheia, setDreTelaCheia] = useState(false);
  // "Tela cheia" da aba Projeções (ícone no topo); sai pelo botão da própria tela cheia ou com Esc.
  const [projecoesTelaCheia, setProjecoesTelaCheia] = useState(false);
  // Botões Layout / Importar / Novo orçamento da aba Projeções (ProjecoesDreTab, pela ref).
  const projecoesTabRef = useRef(null);
  const [baixandoLayoutProjecoes, setBaixandoLayoutProjecoes] = useState(false);
  const [centrosDre, setCentrosDre] = useState([]);
  useEffect(() => {
    if ((abaAtiva !== 'dre' && abaAtiva !== 'poc') || !empresaId) return;
    // Agrupadores e centros fora de agrupador (a DRE é montada por eles).
    listUnidadesDre(empresaId)
      .then(setCentrosDre)
      .catch(() => setCentrosDre([]));
  }, [abaAtiva, empresaId]);

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

  // Exportar Excel da aba Centros Custos: a base inteira dos centros, na ordem da aba (dreCentros.excel.js).
  // Também o da aba Financeiro: todos os exercícios de uma vez, uma aba por ano (financeiro.excel.js).
  const [exportandoCentros, setExportandoCentros] = useState(false);
  const [erroExportarCentros, setErroExportarCentros] = useState('');
  const [exportandoFinanceiro, setExportandoFinanceiro] = useState(false);
  const [erroExportarFinanceiro, setErroExportarFinanceiro] = useState('');
  useEffect(() => setErroExportarFinanceiro(''), [empresaId]);
  async function exportarFinanceiroExcel() {
    setErroExportarFinanceiro('');
    setExportandoFinanceiro(true);
    try {
      baixar(await exportarFinanceiroDreExcel(empresaId));
    } catch (err) {
      setErroExportarFinanceiro(await mensagemDoBlob(err));
    } finally {
      setExportandoFinanceiro(false);
    }
  }
  function baixar({ blob, nome }) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }
  // Com responseType 'blob' a mensagem de erro do backend chega dentro de um Blob.
  async function mensagemDoBlob(err) {
    const dados = err.response?.data;
    try {
      return (dados instanceof Blob ? JSON.parse(await dados.text()) : dados)?.message || 'Não foi possível gerar o Excel.';
    } catch {
      return 'Não foi possível gerar o Excel.';
    }
  }
  async function exportarCentrosExcel() {
    setErroExportarCentros('');
    setExportandoCentros(true);
    try {
      const { blob, nome } = await exportarCentrosDreExcel(empresaId);
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
      setErroExportarCentros(mensagem);
    } finally {
      setExportandoCentros(false);
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

  // Exportar Excel de auditoria (abas DRE e POC): a DRE do filtro recalculada em fórmulas, a memória de
  // cálculo, as POCs e as bases linha a linha (backend dre-exportacao) — mesmo download do DFC.
  const [exportandoDre, setExportandoDre] = useState(false);
  const [erroExportacaoDre, setErroExportacaoDre] = useState('');
  useEffect(() => setErroExportacaoDre(''), [empresaId, dreDe, dreAte, searchParams]);
  async function exportarDreExcel() {
    setErroExportacaoDre('');
    setExportandoDre(true);
    try {
      // A versão do Excel é a da tela (a aberta, a última salva ou a visualizada — cabeçalho X-Dre-Versao).
      const { blob, nome } = await exportarExcelDre(empresaId, {
        de: dreDe,
        ate: dreAte,
        centros: dreCentros,
        projecao: { fonte: 'atual' },
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
      setErroExportacaoDre(mensagem);
    } finally {
      setExportandoDre(false);
    }
  }

  // ------------------------------------------------------------------------------- versões da DRE
  // A versão aberta (área de trabalho) ou, sem ela, a última salva; `?versao=N` = visualizando uma salva.
  // Sem versão aberta ou visualizando, a tela é só leitura (os botões que gravam somem; as abas desativam o
  // que grava — leituraDre.js; o backend recusa de qualquer jeito).
  const versaoVisualizada = Number(searchParams.get('versao')) || null;
  const [estadoVersoes, setEstadoVersoes] = useState(null);
  const [erroVersoes, setErroVersoes] = useState('');
  const [processandoVersao, setProcessandoVersao] = useState(false);
  const carregarVersoes = useCallback(() => {
    if (!empresaId) {
      setEstadoVersoes(null);
      return Promise.resolve();
    }
    return listarVersoesDre(empresaId)
      .then(setEstadoVersoes)
      .catch((e) => setErroVersoes(e.response?.data?.message || 'Não foi possível carregar as versões da DRE.'));
  }, [empresaId]);
  useEffect(() => {
    setEstadoVersoes(null);
    setErroVersoes('');
    carregarVersoes();
  }, [carregarVersoes]);
  const versaoAberta = estadoVersoes?.aberta || null;
  const versaoPublicada = estadoVersoes?.publicada || null;
  // Aprovação (Cadastros › Matriz de Alçadas › DRE › Aprovador): a última salva pode estar aguardando o Aprovador
  // — o Operações mostra ela; os dashboards, a publicada (a última aprovada).
  const versaoPendente = estadoVersoes?.pendente || null;
  const versaoReprovada = estadoVersoes?.reprovada || null;
  const aprovadorDre = estadoVersoes?.aprovador || null;
  const ultimaSalva = versaoPendente || versaoPublicada;
  const versaoVista = versaoVisualizada ? (estadoVersoes?.versoes || []).find((v) => v.numero === versaoVisualizada) || null : null;
  const somenteLeitura = Boolean(empresaId) && (Boolean(versaoVisualizada) || (Boolean(estadoVersoes) && !versaoAberta));
  const mesBR = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
  const quandoBR = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const leitura = {
    somenteLeitura,
    motivo: versaoVisualizada
      ? `Você está visualizando a versão ${versaoVisualizada} (só leitura).`
      : `A DRE está fechada na versão ${ultimaSalva?.numero ?? '—'}. Para alterar, gere uma nova versão ou edite a última na aba Versões.`,
  };

  async function acaoVersao(fn) {
    setErroVersoes('');
    setProcessandoVersao(true);
    try {
      const r = await fn();
      if (r) setEstadoVersoes(r);
      // Visualizando uma versão antiga: a ação vale pra versão atual — volta pra ela.
      if (versaoVisualizada) atualizarParams({ versao: null });
    } catch (e) {
      setErroVersoes(e.response?.data?.message || 'Não foi possível concluir a operação.');
    } finally {
      setProcessandoVersao(false);
    }
  }

  async function gerarNovaVersao() {
    const numero = (estadoVersoes?.versoes?.[0]?.numero || 0) + 1;
    const ok = await confirm({
      title: `Gerar a versão ${numero}`,
      description: `A versão ${numero} começa com a configuração da versão ${ultimaSalva?.numero} e o realizado até ${mesBR(
        estadoVersoes?.proximo_corte
      )} (o último mês fechado). Enquanto ela estiver aberta, o realizado acompanha o Monitor de Integrações. As alterações só aparecem nos dashboards, no MCP e na Reforma Tributária depois de salvar a versão.`,
      confirmLabel: 'Gerar nova versão',
    });
    if (ok) await acaoVersao(() => abrirVersaoDre(empresaId, 'NOVA'));
  }

  async function editarUltimaVersao() {
    const numero = (estadoVersoes?.versoes?.[0]?.numero || 0) + 1;
    const ok = await confirm({
      title: `Editar a versão ${ultimaSalva?.numero}`,
      description: `A edição vira a versão ${numero}, com a configuração e o realizado da versão ${ultimaSalva?.numero} (realizado congelado até ${mesBR(
        ultimaSalva?.corte
      )}).${versaoPendente ? ` A versão ${versaoPendente.numero} não foi aprovada e deixa de poder ser aprovada (só a última salva pode).` : ''} Você fica registrado como quem abriu a versão. As alterações só aparecem nos dashboards depois de salvar.`,
      confirmLabel: 'Editar última versão',
    });
    if (ok) await acaoVersao(() => abrirVersaoDre(empresaId, 'EDICAO'));
  }

  async function salvarVersaoAberta() {
    const salvas = (estadoVersoes?.versoes || []).filter((v) => v.status === 'FECHADA');
    const limite = estadoVersoes?.limite || 10;
    const sai = salvas.length >= limite ? salvas[salvas.length - 1] : null;
    const ok = await confirm({
      title: `Salvar a versão ${versaoAberta.numero}`,
      description: `A versão ${versaoAberta.numero} fica travada (configuração, realizado até ${mesBR(versaoAberta.corte)} e projeção) e ${
        aprovadorDre
          ? `fica aguardando a aprovação de ${aprovadorDre.nome} (Matriz de Alçadas). Só depois de aprovada ela passa a ser a publicada`
          : 'passa a ser a publicada (a empresa não tem Aprovador da DRE na Matriz de Alçadas)'
      }: dashboards, MCP, Excel do dashboard e Reforma Tributária.${
        sai ? ` Ficam só as ${limite} últimas: a versão ${sai.numero} será apagada.` : ''
      }`,
      confirmLabel: 'Salvar versão',
    });
    if (ok) await acaoVersao(() => salvarVersaoDre(empresaId));
  }

  async function aprovarVersaoPendente() {
    const ok = await confirm({
      title: `Aprovar a versão ${versaoPendente.numero}`,
      description: `A versão ${versaoPendente.numero} (salva em ${quandoBR(versaoPendente.fechada_em)}${
        versaoPendente.fechada_por_nome ? ` por ${versaoPendente.fechada_por_nome}` : ''
      }, realizado até ${mesBR(versaoPendente.corte)}) passa a ser a publicada: dashboards, MCP, Excel do dashboard e Reforma Tributária.`,
      confirmLabel: 'Aprovar versão',
    });
    if (ok) await acaoVersao(() => aprovarVersaoDre(empresaId));
  }

  // Reprovar (só o Aprovador): o motivo é obrigatório e vai para o responsável (Workflows).
  const [reprovando, setReprovando] = useState(false);
  const [motivoReprovacao, setMotivoReprovacao] = useState('');
  async function confirmarReprovacao() {
    if (!motivoReprovacao.trim()) return;
    setReprovando(false);
    await acaoVersao(() => reprovarVersaoDre(empresaId, motivoReprovacao.trim()));
    setMotivoReprovacao('');
  }

  async function excluirVersaoAberta() {
    const ok = await confirm({
      title: `Excluir a versão ${versaoAberta.numero}`,
      description: `Tudo o que foi alterado na versão ${versaoAberta.numero} (em edição) volta ao que está na versão ${
        versaoAberta.base_numero ?? versaoPublicada?.numero
      }. As alterações registradas nela são apagadas junto (fica o registro da exclusão na versão ${versaoAberta.base_numero ?? versaoPublicada?.numero}).`,
      confirmLabel: 'Excluir versão',
      variant: 'danger',
    });
    if (ok) await acaoVersao(() => excluirVersaoDre(empresaId));
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

            {(abaAtiva === 'dre' || abaAtiva === 'poc') && (
              <>
                <div className="sm:w-32">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Início</label>
                  <SeletorMes valor={dreMesDe} onChange={(v) => atualizarParams({ de: `${v}-01` })} disabled={semEmpresa} />
                </div>
                <div className="sm:w-32">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Fim</label>
                  <SeletorMes valor={dreMesAte} onChange={(v) => atualizarParams({ ate: ultimoDiaDoMes(v) })} disabled={semEmpresa} />
                </div>
                <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Centro de custo</label>
                  <SearchableSelect
                    multiple
                    todosELimpar
                    rotuloTodos="Todos"
                    rotuloLimpar="Limpar"
                    value={dreCentros}
                    onChange={(lista) => atualizarParams({ centros: lista.join(',') })}
                    disabled={semEmpresa}
                    options={centrosDre
                      // Na aba POC, só as obras (natureza OBRA), que são as colunas dela.
                      .filter((c) => abaAtiva !== 'poc' || c.natureza === 'OBRA')
                      .map((c) => ({ value: String(c.sienge_id), label: c.agrupador ? c.agrupador : `${c.sienge_id} - ${c.apelido || c.name}` }))}
                    placeholder="Todos os centros"
                    emptyMessage="Nenhum centro com Realiza DRE."
                  />
                </div>
                {abaAtiva === 'dre' && (
                  <>
                    <div className="sm:w-44">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Colunas</label>
                      <SearchableSelect
                        multiple
                        value={dreColunas}
                        onChange={(lista) => atualizarParams({ colunas: (lista.length ? lista : ['valor']).join(',') })}
                        disabled={semEmpresa}
                        options={COLUNAS_DRE}
                        placeholder="Valor"
                        emptyMessage="—"
                      />
                    </div>
                  </>
                )}
              </>
            )}

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

            {abaAtiva === 'financeiro' && exercicioAberto && (
              <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={buscaFinanceiro}
                    onChange={(e) => setBuscaFinanceiro(e.target.value)}
                    disabled={semEmpresa}
                    placeholder="Cliente, fornecedor, documento, natureza..."
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

            {/* Situação do centro no Sienge: por padrão só os ativos (pedido do usuário); também só os inativos ou todos. */}
            {abaAtiva === 'centros-custos' && (
              <div className="sm:w-40">
                <label className="mb-1 block text-sm font-medium text-gray-700">Situação</label>
                <SearchableSelect
                  value={situacaoCentros}
                  onChange={(v) => setSituacaoCentros(v || 'ATIVOS')}
                  options={[
                    { value: 'ATIVOS', label: 'Ativos' },
                    { value: 'INATIVOS', label: 'Inativos' },
                    { value: 'TODOS', label: 'Todos' },
                  ]}
                  clearable={false}
                  disabled={semEmpresa}
                />
              </div>
            )}
          </div>

          {(abaAtiva === 'dre' || abaAtiva === 'poc') && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-2.5"
                  onClick={exportarDreExcel}
                  disabled={semEmpresa || exportandoDre || dreDe > dreAte}
                  title="Exportar Excel de auditoria (DRE recalculada, memória de cálculo, POCs e bases)"
                  aria-label="Exportar Excel de auditoria"
                >
                  {exportandoDre ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!px-2.5"
                  onClick={() => setDreTelaCheia(true)}
                  disabled={semEmpresa}
                  title="Tela cheia"
                  aria-label="Tela cheia"
                >
                  <Maximize2 size={18} />
                </Button>
              </div>
              {erroExportacaoDre && <span className="text-xs text-red-600">{erroExportacaoDre}</span>}
            </div>
          )}

          {abaAtiva === 'projecoes' && (
            // Botões só com ícone (dica no title): layout (a planilha da empresa, todos os centros,
            // preenchida com os orçamentos atuais), importar planilha e novo orçamento (só com versão
            // aberta) e tela cheia — ProjecoesDreTab.jsx. A planilha de um centro só fica nas etapas do
            // assistente. Salvar versão fica na aba Versões.
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="!px-2.5"
                onClick={async () => {
                  setBaixandoLayoutProjecoes(true);
                  try {
                    await projecoesTabRef.current?.baixarLayout();
                  } finally {
                    setBaixandoLayoutProjecoes(false);
                  }
                }}
                disabled={semEmpresa || baixandoLayoutProjecoes}
                title="Layout da projeção (planilha de todos os centros, preenchida com os orçamentos atuais)"
                aria-label="Layout da projeção"
              >
                {baixandoLayoutProjecoes ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />}
              </Button>
              {!somenteLeitura && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-2.5"
                    onClick={() => projecoesTabRef.current?.importar()}
                    disabled={semEmpresa}
                    title="Importar planilha da projeção"
                    aria-label="Importar planilha da projeção"
                  >
                    <Upload size={18} />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-2.5"
                    onClick={() => projecoesTabRef.current?.novo()}
                    disabled={semEmpresa}
                    title="Novo orçamento"
                    aria-label="Novo orçamento"
                  >
                    <FilePlus2 size={18} />
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="secondary"
                className="!px-2.5"
                onClick={() => setProjecoesTelaCheia(true)}
                disabled={semEmpresa}
                title="Tela cheia"
                aria-label="Tela cheia"
              >
                <Maximize2 size={18} />
              </Button>
            </div>
          )}

          {abaAtiva === 'unidades' && !versaoVisualizada && (
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

          {abaAtiva === 'financeiro' && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex shrink-0 items-center gap-2">
                {/* Exportar Excel: todos os exercícios (cards) de uma vez, uma aba por ano — também na versão só leitura. */}
                <button
                  type="button"
                  onClick={exportarFinanceiroExcel}
                  disabled={semEmpresa || exportandoFinanceiro}
                  title="Exportar Excel de todos os exercícios (uma aba por ano)"
                  aria-label="Exportar Excel de todos os exercícios"
                  className="flex shrink-0 items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exportandoFinanceiro ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                </button>
                {exercicioAberto && !somenteLeitura && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-2.5"
                    onClick={() => setNovoLancamentoToken((n) => n + 1)}
                    disabled={semEmpresa || exercicioTravado}
                    title={exercicioTravado ? 'Exercício em andamento: só visualização' : 'Novo lançamento'}
                    aria-label="Novo lançamento"
                  >
                    <FilePlus2 size={18} />
                  </Button>
                )}
              </div>
              {exportandoFinanceiro && <span className="text-xs text-gray-400">Gerando o Excel de todos os exercícios…</span>}
              {erroExportarFinanceiro && <span className="text-xs text-red-600">{erroExportarFinanceiro}</span>}
            </div>
          )}

          {abaAtiva === 'centros-custos' && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex shrink-0 items-center gap-2">
                {/* Exportar Excel: só o ícone, como o do Plano Contas (também na versão só leitura). */}
                <button
                  type="button"
                  onClick={exportarCentrosExcel}
                  disabled={semEmpresa || exportandoCentros}
                  title="Exportar Excel"
                  aria-label="Exportar Excel"
                  className="flex shrink-0 items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exportandoCentros ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                </button>
                {!somenteLeitura && (
                  <Button
                    type="button"
                    onClick={() => centrosTabRef.current?.abrirNovoAgrupador()}
                    disabled={semEmpresa}
                    title="Agrupador: junta centros de custo numa obra só na DRE (arraste os centros para dentro dele)"
                  >
                    <Plus size={16} />
                    Novo agrupador
                  </Button>
                )}
              </div>
              {erroExportarCentros && <span className="text-xs text-red-600">{erroExportarCentros}</span>}
            </div>
          )}

          {abaAtiva === 'mascaras' && !somenteLeitura && (
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" onClick={() => mascarasTabRef.current?.abrirNova()} disabled={semEmpresa}>
                <Plus size={16} />
                Nova máscara
              </Button>
            </div>
          )}

          {abaAtiva === 'orcamento' && !somenteLeitura && (
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
                {planoCentro && !somenteLeitura && (
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
                {!somenteLeitura && (
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
                )}
              </div>
              {erroPlanoContas && <span className="text-xs text-red-600">{erroPlanoContas}</span>}
            </div>
          )}

          {abaAtiva === 'versoes' && !semEmpresa && estadoVersoes && (
            // Gerar nova versão / Editar última versão (sem versão aberta) ou Excluir / Salvar a aberta.
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex shrink-0 items-center gap-2">
                {estadoVersoes.pode_aprovar && (
                  <Button type="button" variant="secondary" onClick={() => setReprovando(true)} disabled={processandoVersao} className="!text-red-600">
                    <CircleX size={16} />
                    Reprovar versão {versaoPendente.numero}
                  </Button>
                )}
                {estadoVersoes.pode_aprovar && (
                  <Button type="button" onClick={aprovarVersaoPendente} disabled={processandoVersao} className="!bg-emerald-600 hover:!bg-emerald-700">
                    <BadgeCheck size={16} />
                    Aprovar versão {versaoPendente.numero}
                  </Button>
                )}
                {versaoAberta ? (
                  <>
                    <Button type="button" variant="secondary" onClick={excluirVersaoAberta} disabled={processandoVersao}>
                      <Trash2 size={16} />
                      Excluir versão {versaoAberta.numero}
                    </Button>
                    <Button type="button" onClick={salvarVersaoAberta} disabled={processandoVersao}>
                      {processandoVersao ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      Salvar versão {versaoAberta.numero}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="secondary" onClick={editarUltimaVersao} disabled={processandoVersao || !versaoPublicada}>
                      <PencilLine size={16} />
                      Editar última versão
                    </Button>
                    <Button type="button" onClick={gerarNovaVersao} disabled={processandoVersao}>
                      {processandoVersao ? <Loader2 size={16} className="animate-spin" /> : <CopyPlus size={16} />}
                      Gerar nova versão
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Em qual versão da DRE a tela está (aba Versões). */}
      {!semEmpresa && estadoVersoes && (
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs ${
            versaoVisualizada
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : versaoAberta
                ? 'border-primary-100 bg-primary-50/60 text-primary-800'
                : 'border-gray-200 bg-white text-gray-600'
          }`}
        >
          {versaoVisualizada ? (
            <>
              <Lock size={14} className="shrink-0" />
              <span>
                Visualizando a <strong>versão {versaoVisualizada}</strong>
                {versaoVista ? `, salva em ${quandoBR(versaoVista.fechada_em)}${versaoVista.fechada_por_nome ? ` por ${versaoVista.fechada_por_nome}` : ''} (realizado até ${mesBR(versaoVista.corte)})` : ''}
                . Só leitura: é a DRE como estava nessa versão.
              </span>
              <button
                type="button"
                onClick={() => atualizarParams({ versao: null })}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100"
              >
                <Undo2 size={13} /> Voltar para a versão atual
              </button>
            </>
          ) : versaoAberta ? (
            <>
              <LockOpen size={14} className="shrink-0" />
              <span>
                <strong>Versão {versaoAberta.numero} em edição</strong> — aberta por {versaoAberta.aberta_por_nome || '—'} em {quandoBR(versaoAberta.aberta_em)}; realizado até{' '}
                {mesBR(versaoAberta.corte)}
                {versaoAberta.origem === 'EDICAO' ? ' (congelado)' : ' (atualizado pelo Monitor de Integrações)'}. As alterações só são publicadas ao salvar a versão (aba Versões).
              </span>
            </>
          ) : versaoReprovada ? (
            <>
              <CircleX size={14} className="shrink-0 text-red-600" />
              <span>
                <strong className="text-red-700">Versão {versaoReprovada.numero} reprovada</strong>
                {versaoReprovada.reprovada_por_nome ? ` por ${versaoReprovada.reprovada_por_nome}` : ''} em {quandoBR(versaoReprovada.reprovada_em)}: “
                {versaoReprovada.reprovacao_motivo}” — para corrigir, use Editar última versão na aba Versões e salve de novo. Os dashboards seguem na versão{' '}
                {versaoPublicada?.numero}.
              </span>
            </>
          ) : versaoPendente ? (
            <>
              <Lock size={14} className="shrink-0" />
              <span>
                <strong>Versão {versaoPendente.numero} aguardando aprovação</strong>
                {aprovadorDre ? ` de ${aprovadorDre.nome}` : ''} — salva em {quandoBR(versaoPendente.fechada_em)}
                {versaoPendente.fechada_por_nome ? ` por ${versaoPendente.fechada_por_nome}` : ''} (realizado até {mesBR(versaoPendente.corte)}). Os dashboards
                seguem na versão {versaoPublicada?.numero} até a aprovação.
              </span>
            </>
          ) : (
            <>
              <Lock size={14} className="shrink-0" />
              <span>
                DRE fechada na <strong>versão {versaoPublicada?.numero}</strong>
                {versaoPublicada?.fechada_em ? `, salva em ${quandoBR(versaoPublicada.fechada_em)}${versaoPublicada.fechada_por_nome ? ` por ${versaoPublicada.fechada_por_nome}` : ''}` : ''} (realizado
                até {mesBR(versaoPublicada?.corte)}). Para alterar, gere uma nova versão ou edite a última na aba Versões.
              </span>
            </>
          )}
        </div>
      )}

      <Modal open={reprovando} onClose={() => setReprovando(false)} title={`Reprovar a versão ${versaoPendente?.numero ?? ''}`} maxWidthClass="max-w-lg">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            A versão não é publicada (os dashboards seguem na versão {versaoPublicada?.numero}). O motivo fica registrado na versão e vai para o responsável
            (Workflows).
          </p>
          <textarea
            value={motivoReprovacao}
            onChange={(e) => setMotivoReprovacao(e.target.value)}
            rows={4}
            maxLength={2000}
            autoFocus
            placeholder="Motivo da reprovação (obrigatório)"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-100"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setReprovando(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirmarReprovacao} disabled={!motivoReprovacao.trim()} className="!bg-red-600 hover:!bg-red-700">
              <CircleX size={16} /> Reprovar versão
            </Button>
          </div>
        </div>
      </Modal>

      <LeituraDreContext.Provider value={leitura}>
      <div>
        <Tabs tabs={TABS} activeId={abaAtiva} onChange={(aba) => atualizarParams({ aba })} semIcones={menuAberto} />

        {abaAtiva === 'dre' && (
          <DreTab
            empresaId={empresaId}
            de={dreDe}
            ate={dreAte}
            centros={dreCentros}
            telaCheia={dreTelaCheia}
            onSairTelaCheia={() => setDreTelaCheia(false)}
            colunasVisiveis={dreColunas}
            projecao={{ fonte: 'atual', versao: null }}
          />
        )}
        {abaAtiva === 'poc' && (
          <PocTab
            empresaId={empresaId}
            de={dreDe}
            ate={dreAte}
            centros={dreCentros}
            telaCheia={dreTelaCheia}
            onSairTelaCheia={() => setDreTelaCheia(false)}
          />
        )}

        {abaAtiva === 'mascaras' && (
          <SoLeitura>
            <MascarasTab ref={mascarasTabRef} empresaId={empresaId} />
          </SoLeitura>
        )}

        {abaAtiva === 'centros-custos' && (
          <SoLeitura>
            <CentrosCustosTab ref={centrosTabRef} empresaId={empresaId} search={buscaCentros} situacao={situacaoCentros} />
          </SoLeitura>
        )}

        {abaAtiva === 'orcamento' && (
          <SoLeitura>
            <OrcamentoTab ref={orcamentoTabRef} empresaId={empresaId} search={buscaOrcamento} />
          </SoLeitura>
        )}

        {abaAtiva === 'unidades' && (
          <UnidadesTab
            ref={unidadesTabRef}
            empresaId={empresaId}
            search={buscaUnidades}
            onAtualizando={setAtualizandoUnidades}
          />
        )}

        {abaAtiva === 'correcoes' && <CorrecoesTab empresaId={empresaId} search={buscaCorrecoes} />}
        {abaAtiva === 'financeiro' && (
          <FinanceiroTab
            empresaId={empresaId}
            exercicio={exercicioAberto}
            onAbrir={abrirExercicio}
            search={buscaFinanceiro}
            novoToken={novoLancamentoToken}
          />
        )}
        {abaAtiva === 'configuracoes' && (
          <SoLeitura>
            <ConfiguracoesDreTab empresaId={empresaId} />
          </SoLeitura>
        )}
        {abaAtiva === 'projecoes' && (
          <ProjecoesDreTab
            ref={projecoesTabRef}
            empresaId={empresaId}
            telaCheia={projecoesTelaCheia}
            onSairTelaCheia={() => setProjecoesTelaCheia(false)}
          />
        )}
        {abaAtiva === 'versoes' && (
          <VersoesDreTab
            empresaId={empresaId}
            estado={estadoVersoes}
            erro={erroVersoes}
            versaoVisualizada={versaoVisualizada}
            onVisualizar={(numero) => atualizarParams(numero ? { versao: numero, aba: 'dre' } : { versao: null })}
          />
        )}

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
              onNovo={somenteLeitura ? null : () => setNovaVersaoAberta(true)}
              refreshToken={refreshTokenCardsPlano}
            />
          ))}
      </div>
      </LeituraDreContext.Provider>

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
