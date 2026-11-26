import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  Banknote,
  Building2,
  CircleX,
  CopyPlus,
  History,
  Lock,
  LockOpen,
  PencilLine,
  Undo2,
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
  Settings,
  Upload,
  Trash2,
  FilePlus2,
  Maximize2,
  SlidersHorizontal,
  Tags,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { listCentrosDfc, listVersoesParametrosDfc } from '../../../api/dfcParametros.api';
import { listCentrosCustoDfc } from '../../../api/dfcCentros.api';
import { gerarPlano } from '../../../api/planosFinanceirosSienge.api';
import { excluirVersaoPlanoDfc, exportarPlanoDfcExcel, listVersoesPlanoDfc } from '../../../api/dfcPlanoContas.api';
import { exportarExcelDfc } from '../../../api/dfcExportacao.api';
import { baixarLayoutOrcamento } from '../../../api/dfcPlanilhaOrcamentaria.api';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { useSidebar } from '../../../layout/SidebarContext';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import {
  abrirVersaoDfc,
  aprovarVersaoDfc,
  excluirVersaoDfc,
  listarVersoesDfc,
  reprovarVersaoDfc,
  salvarVersaoDfc,
} from '../../../api/dfcVersoes.api';
import VersoesDfcTab from './VersoesDfcTab';
import { LeituraDfcContext, SoLeituraDfc } from './leituraDfc';
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
import ConfigSaldoDfcModal from './ConfigSaldoDfcModal';
import DfcDividaPjTab from './DfcDividaPjTab';
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
  { id: 'divida-pj', label: 'Dívida PJ', icon: HandCoins },
  { id: 'orcamentos', label: 'Projeções', icon: TrendingUp },
  // Versões da DFC (pedido do usuário, 25/11/2026 — a mesma aba da DRE Construtoras).
  { id: 'versoes', label: 'Versões', icon: History },
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
// Versões da DFC: `?versao=N` na URL é o "Visualizar" da aba Versões — a tela inteira como era naquela versão (o
// cabeçalho X-Dfc-Versao vai em todo pedido, ver api/http.js). Trocar de versão remonta a tela (key), e todas as
// abas buscam de novo.
export default function DfcConstrutorasPage() {
  const [searchParams] = useSearchParams();
  return <DfcConstrutorasConteudo key={searchParams.get('versao') || 'atual'} />;
}

function DfcConstrutorasConteudo() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();
  // Com o menu lateral aberto as abas ficam sem ícone (pedido do usuário, igual à DRE Construtoras).
  const { menuAberto } = useSidebar();

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

  // ------------------------------------------------------------------------------- versões da DFC
  // A versão aberta (área de trabalho) ou, sem ela, a última salva; `?versao=N` = visualizando uma salva. Sem
  // versão aberta ou visualizando, a tela é só leitura (os botões que gravam somem; as abas de cadastro desativam
  // o que grava — leituraDfc.jsx; o backend recusa de qualquer jeito). Mesmo comportamento da DRE Construtoras.
  const confirmarVersao = useConfirm();
  const versaoVisualizada = Number(searchParams.get('versao')) || null;
  const [estadoVersoes, setEstadoVersoes] = useState(null);
  const [erroVersoes, setErroVersoes] = useState('');
  const [processandoVersao, setProcessandoVersao] = useState(false);
  const carregarVersoesDfc = useCallback(() => {
    if (!empresaId) {
      setEstadoVersoes(null);
      return Promise.resolve();
    }
    return listarVersoesDfc(empresaId)
      .then(setEstadoVersoes)
      .catch((e) => setErroVersoes(e.response?.data?.message || 'Não foi possível carregar as versões da DFC.'));
  }, [empresaId]);
  useEffect(() => {
    setEstadoVersoes(null);
    setErroVersoes('');
    carregarVersoesDfc();
  }, [carregarVersoesDfc]);
  const versaoAberta = estadoVersoes?.aberta || null;
  const versaoPublicada = estadoVersoes?.publicada || null;
  const versaoPendente = estadoVersoes?.pendente || null;
  const versaoReprovada = estadoVersoes?.reprovada || null;
  const aprovadorDfc = estadoVersoes?.aprovador || null;
  const ultimaSalva = versaoPendente || (estadoVersoes?.versoes || []).find((v) => v.status === 'FECHADA') || versaoPublicada;
  const versaoVista = versaoVisualizada ? (estadoVersoes?.versoes || []).find((v) => v.numero === versaoVisualizada) || null : null;
  const somenteLeitura = Boolean(empresaId) && (Boolean(versaoVisualizada) || (Boolean(estadoVersoes) && !versaoAberta));
  const mesVersaoBR = (iso) => (iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
  const quandoBR = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
  const leituraDfc = {
    somenteLeitura,
    motivo: versaoVisualizada
      ? `Você está visualizando a versão ${versaoVisualizada} da DFC (só leitura).`
      : `A DFC está fechada na versão ${ultimaSalva?.numero ?? '—'}. Para alterar, gere uma nova versão ou edite a última na aba Versões.`,
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
    const ok = await confirmarVersao({
      title: `Gerar a versão ${numero} da DFC`,
      description: `A versão ${numero} começa com a configuração e o Orçamento da versão ${ultimaSalva?.numero} e o realizado até ${mesVersaoBR(
        estadoVersoes?.proximo_corte
      )} (o último mês fechado). Enquanto ela estiver aberta, o realizado acompanha o Monitor de Integrações. Gere o orçamento na aba Projeções e salve a versão aqui: só depois de salva (e aprovada) ela aparece no dashboard Fluxo de Caixa, no MCP e na Reforma Tributária.`,
      confirmLabel: 'Gerar nova versão',
    });
    if (ok) await acaoVersao(() => abrirVersaoDfc(empresaId, 'NOVA'));
  }

  async function editarUltimaVersao() {
    const numero = (estadoVersoes?.versoes?.[0]?.numero || 0) + 1;
    const ok = await confirmarVersao({
      title: `Editar a versão ${ultimaSalva?.numero} da DFC`,
      description: `A edição vira a versão ${numero}, com a configuração, o Orçamento e o realizado da versão ${ultimaSalva?.numero} (realizado congelado até ${mesVersaoBR(
        ultimaSalva?.corte
      )}).${versaoPendente ? ` A versão ${versaoPendente.numero} não foi aprovada e deixa de poder ser aprovada (só a última salva pode).` : ''} Você fica registrado como quem abriu a versão. As alterações só aparecem no dashboard depois de salvar (e aprovar).`,
      confirmLabel: 'Editar última versão',
    });
    if (ok) await acaoVersao(() => abrirVersaoDfc(empresaId, 'EDICAO'));
  }

  async function salvarVersaoAberta() {
    const salvas = (estadoVersoes?.versoes || []).filter((v) => v.status === 'FECHADA');
    const limite = estadoVersoes?.limite || 10;
    const sai = salvas.length >= limite ? salvas[salvas.length - 1] : null;
    const orc = estadoVersoes?.orcamento;
    const ok = await confirmarVersao({
      title: `Salvar a versão ${versaoAberta.numero} da DFC`,
      description: `${
        orc
          ? `O orçamento gerado em ${quandoBR(orc.criado_em)}${orc.usuario ? ` por ${orc.usuario}` : ''} fica cravado. `
          : `Atenção: o orçamento não foi gerado nesta versão — fica o da versão ${versaoAberta.base_numero ?? '—'} (aba Projeções › Gerar orçamento). `
      }A versão ${versaoAberta.numero} fica travada (configuração, realizado até ${mesVersaoBR(versaoAberta.corte)} e Orçamento) e ${
        aprovadorDfc
          ? `fica aguardando a aprovação de ${aprovadorDfc.nome} (Matriz de Alçadas). Só depois de aprovada ela passa a ser a publicada`
          : 'passa a ser a publicada (a empresa não tem Aprovador da DFC na Matriz de Alçadas)'
      }: dashboard Fluxo de Caixa, MCP, Excel do dashboard e Reforma Tributária.${sai ? ` Ficam só as ${limite} últimas: a versão ${sai.numero} será apagada.` : ''}`,
      confirmLabel: 'Salvar versão',
    });
    if (ok) await acaoVersao(() => salvarVersaoDfc(empresaId));
  }

  async function aprovarVersaoPendente() {
    const ok = await confirmarVersao({
      title: `Aprovar a versão ${versaoPendente.numero} da DFC`,
      description: `A versão ${versaoPendente.numero} (salva em ${quandoBR(versaoPendente.fechada_em)}${
        versaoPendente.fechada_por_nome ? ` por ${versaoPendente.fechada_por_nome}` : ''
      }, realizado até ${mesVersaoBR(versaoPendente.corte)}) passa a ser a publicada: dashboard Fluxo de Caixa, MCP, Excel do dashboard e Reforma Tributária.`,
      confirmLabel: 'Aprovar versão',
    });
    if (ok) await acaoVersao(() => aprovarVersaoDfc(empresaId));
  }

  // Reprovar (só o Aprovador): o motivo é obrigatório e vai para o responsável (Workflows).
  const [reprovando, setReprovando] = useState(false);
  const [motivoReprovacao, setMotivoReprovacao] = useState('');
  async function confirmarReprovacao() {
    if (!motivoReprovacao.trim()) return;
    setReprovando(false);
    await acaoVersao(() => reprovarVersaoDfc(empresaId, motivoReprovacao.trim()));
    setMotivoReprovacao('');
  }

  async function excluirVersaoAberta() {
    const ok = await confirmarVersao({
      title: `Excluir a versão ${versaoAberta.numero} da DFC`,
      description: `Tudo o que foi alterado na versão ${versaoAberta.numero} (em edição), inclusive o orçamento gerado nela, volta ao que está na versão ${
        versaoAberta.base_numero ?? versaoPublicada?.numero
      }. As alterações registradas nela são apagadas junto (fica o registro da exclusão na versão ${versaoAberta.base_numero ?? versaoPublicada?.numero}).`,
      confirmLabel: 'Excluir versão',
      variant: 'danger',
    });
    if (ok) await acaoVersao(() => excluirVersaoDfc(empresaId));
  }

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
  const [situacaoCentros, setSituacaoCentros] = useState('ATIVOS'); // aba Centros Custos: 'ATIVOS' | 'INATIVOS' | 'TODOS'

  // Aba Contas Correntes: busca (conveniência de navegador) e o ícone de buscar as contas no Sienge
  // (a aba faz a busca — `contasTabRef.current.sincronizar()`).
  const [buscaContas, setBuscaContas] = useState('');
  const [buscaDividaPj, setBuscaDividaPj] = useState('');
  const [sincronizandoContas, setSincronizandoContas] = useState(false);
  const [configSaldoAberta, setConfigSaldoAberta] = useState(false);
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
  // backend (dfc-exportacao): Fluxo de Caixa, Saldos das Contas, Base Realizado, Base Projetado, Plano
  // de Contas (por tipo de plano) e o dossiê da Projeção CEF de cada obra.
  // Filtro "Versão" da aba DFC: qual versão salva do Orçamento entra no Projetado (null = a última),
  // pra ver o projetado mudar ao longo das versões. A lista vem da própria aba (DfcFluxoTab).
  const [versaoFluxo, setVersaoFluxo] = useState(null);
  const [versoesFluxo, setVersoesFluxo] = useState([]);
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
        versao: versaoFluxo,
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
                  setVersaoFluxo(null);
                  setVersoesFluxo([]);
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
                {/* O filtro Versão saiu: as versões da DFC ficam na aba Versões (Visualizar). */}
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
                {/* Versões da DFC: o Orçamento mostrado é o gravado na versão (aberta ou salva); com um orçamento gerado
                    e ainda não gravado, dá pra alternar com a prévia. */}
                {versoesOrcamento.temNova && (
                  <div className="sm:min-w-48 sm:max-w-60 sm:flex-1">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Orçamento</label>
                    <SearchableSelect
                      value={versaoOrcamento === 'nova' ? 'nova' : 'gravado'}
                      onChange={(v) => v && setVersaoOrcamento(v === 'nova' ? 'nova' : null)}
                      disabled={!empresaId}
                      options={[
                        { value: 'nova', label: 'Gerado (ainda não gravado)' },
                        { value: 'gravado', label: `Gravado na versão ${versaoAberta?.numero ?? ultimaSalva?.numero ?? ''}` },
                      ]}
                      clearable={false}
                      larguraPainel={280}
                    />
                  </div>
                )}
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

            {/* Situação do centro no Sienge: por padrão só os ativos; também só os inativos ou todos (igual à
                aba Centros Custos da DRE Gerencial). */}
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
                  disabled={!empresaId}
                />
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

            {abaAtiva === 'divida-pj' && (
              <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={buscaDividaPj}
                    onChange={(e) => setBuscaDividaPj(e.target.value)}
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
              {/* Configuração do saldo: de onde vem o Saldo Inicial da aba DFC (ERP ou Saldo das Contas Horizon). */}
              <Button
                type="button"
                variant="secondary"
                className="!px-2.5"
                onClick={() => setConfigSaldoAberta(true)}
                disabled={!empresaId}
                title="Configurações"
                aria-label="Configurações"
              >
                <Settings size={18} />
              </Button>
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
              {/* Versões da DFC: "Gerar orçamento" (antes "Nova versão") e "Gravar orçamento" (antes "Salvar versão")
                  só com a versão da DFC aberta — o orçamento fica cravado ao salvar a versão na aba Versões. */}
              {!somenteLeitura && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-2.5"
                    onClick={() => setNovaVersaoOrcamentoAberta(true)}
                    disabled={!empresaId}
                    title="Gerar orçamento"
                    aria-label="Gerar orçamento"
                  >
                    <FilePlus2 size={18} />
                  </Button>
                  <Button
                    type="button"
                    className="!px-2.5"
                    onClick={async () => {
                      await orcamentosTabRef.current?.salvarVersao(versaoAberta?.numero);
                      carregarVersoesDfc();
                    }}
                    disabled={!empresaId || !orcamentoEmNova}
                    title={orcamentoEmNova ? `Gravar o orçamento na versão ${versaoAberta?.numero ?? ''}` : 'Gere o orçamento pra poder gravar'}
                    aria-label="Gravar orçamento"
                  >
                    <Save size={18} />
                  </Button>
                </>
              )}
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

          {abaAtiva === 'parametros' && !somenteLeitura && (
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

          {abaAtiva === 'mascaras' && !somenteLeitura && (
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" onClick={() => mascarasTabRef.current?.abrirNova()} disabled={!empresaId}>
                <Plus size={16} />
                Nova máscara
              </Button>
            </div>
          )}

          {abaAtiva === 'versoes' && empresaId && estadoVersoes && (
            // Gerar nova versão / Editar última versão (sem versão aberta) ou Excluir / Salvar a aberta; Aprovar e
            // Reprovar só pro Aprovador da DFC (Matriz de Alçadas).
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
                    <Button type="button" variant="secondary" onClick={editarUltimaVersao} disabled={processandoVersao || !ultimaSalva}>
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

      {/* Em qual versão da DFC a tela está (aba Versões) — o mesmo aviso da DRE Construtoras. */}
      {empresaId && estadoVersoes && (
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
                Visualizando a <strong>versão {versaoVisualizada}</strong> da DFC
                {versaoVista
                  ? `, salva em ${quandoBR(versaoVista.fechada_em)}${versaoVista.fechada_por_nome ? ` por ${versaoVista.fechada_por_nome}` : ''} (realizado até ${mesVersaoBR(versaoVista.corte)})`
                  : ''}
                . Só leitura: é a DFC como estava nessa versão.
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
                {mesVersaoBR(versaoAberta.corte)}
                {versaoAberta.origem === 'EDICAO' ? ' (congelado)' : ' (atualizado pelo Monitor de Integrações)'};{' '}
                {estadoVersoes.orcamento
                  ? `orçamento gerado em ${quandoBR(estadoVersoes.orcamento.criado_em)}${estadoVersoes.orcamento.usuario ? ` por ${estadoVersoes.orcamento.usuario}` : ''}`
                  : 'orçamento ainda não gerado nesta versão (aba Projeções › Gerar orçamento)'}
                . As alterações só são publicadas ao salvar a versão (aba Versões).
              </span>
            </>
          ) : versaoReprovada ? (
            <>
              <CircleX size={14} className="shrink-0 text-red-600" />
              <span>
                <strong className="text-red-700">Versão {versaoReprovada.numero} reprovada</strong>
                {versaoReprovada.reprovada_por_nome ? ` por ${versaoReprovada.reprovada_por_nome}` : ''} em {quandoBR(versaoReprovada.reprovada_em)}: “
                {versaoReprovada.reprovacao_motivo}” — para corrigir, use Editar última versão na aba Versões e salve de novo. O dashboard segue na versão{' '}
                {versaoPublicada?.numero}.
              </span>
            </>
          ) : versaoPendente ? (
            <>
              <Lock size={14} className="shrink-0" />
              <span>
                <strong>Versão {versaoPendente.numero} aguardando aprovação</strong>
                {aprovadorDfc ? ` de ${aprovadorDfc.nome}` : ''} — salva em {quandoBR(versaoPendente.fechada_em)}
                {versaoPendente.fechada_por_nome ? ` por ${versaoPendente.fechada_por_nome}` : ''} (realizado até {mesVersaoBR(versaoPendente.corte)}). O dashboard
                segue na versão {versaoPublicada?.numero} até a aprovação.
              </span>
            </>
          ) : (
            <>
              <Lock size={14} className="shrink-0" />
              <span>
                DFC fechada na <strong>versão {versaoPublicada?.numero}</strong>
                {versaoPublicada?.fechada_em
                  ? `, salva em ${quandoBR(versaoPublicada.fechada_em)}${versaoPublicada.fechada_por_nome ? ` por ${versaoPublicada.fechada_por_nome}` : ''}`
                  : ''}{' '}
                (realizado até {mesVersaoBR(versaoPublicada?.corte)}). Para alterar, gere uma nova versão ou edite a última na aba Versões.
              </span>
            </>
          )}
          {erroVersoes && <span className="w-full text-red-600">{erroVersoes}</span>}
        </div>
      )}

      <Modal open={reprovando} onClose={() => setReprovando(false)} title={`Reprovar a versão ${versaoPendente?.numero ?? ''} da DFC`} maxWidthClass="max-w-lg">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            A versão não é publicada (o dashboard segue na versão {versaoPublicada?.numero}). O motivo fica registrado na versão e vai para o responsável
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

      <LeituraDfcContext.Provider value={leituraDfc}>
      <div>
        <Tabs tabs={TABS} activeId={tabAtiva.id} onChange={(aba) => atualizarParams({ aba })} semIcones={menuAberto} />

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
            <SoLeituraDfc>
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
            </SoLeituraDfc>
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
          <SoLeituraDfc>
            <DfcCentrosTab empresaId={empresaId} search={buscaCentros} situacao={situacaoCentros} />
          </SoLeituraDfc>
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
          <SoLeituraDfc>
            <DfcMascarasTab ref={mascarasTabRef} empresaId={empresaId} />
          </SoLeituraDfc>
        ) : tabAtiva.id === 'contas-correntes' ? (
          <SoLeituraDfc>
            <DfcContasCorrentesTab
              ref={contasTabRef}
              empresaId={empresaId}
              search={buscaContas}
              onSincronizando={setSincronizandoContas}
            />
          </SoLeituraDfc>
        ) : tabAtiva.id === 'divida-pj' ? (
          <DfcDividaPjTab empresaId={empresaId} search={buscaDividaPj} />
        ) : tabAtiva.id === 'dfc' ? (
          <DfcFluxoTab
            empresaId={empresaId}
            inicio={inicioOrcamento}
            fim={fimOrcamento}
            centros={centrosFluxo}
            onVersoes={setVersoesFluxo}
            telaCheia={fluxoTelaCheia}
            onSairTelaCheia={() => setFluxoTelaCheia(false)}
          />
        ) : tabAtiva.id === 'versoes' ? (
          <VersoesDfcTab
            empresaId={empresaId}
            estado={estadoVersoes}
            erro={erroVersoes}
            versaoVisualizada={versaoVisualizada}
            onVisualizar={(numero) => atualizarParams(numero ? { versao: numero, aba: 'dfc' } : { versao: null })}
          />
        ) : (
          <AbaEmConstrucao key={tabAtiva.id} empresaId={empresaId} icon={tabAtiva.icon} titulo={tabAtiva.label} />
        )}
      </div>
      {configSaldoAberta && empresaId && (
        <ConfigSaldoDfcModal empresaId={empresaId} onClose={() => setConfigSaldoAberta(false)} />
      )}
      </LeituraDfcContext.Provider>

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
