import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  FileText,
  CalendarClock,
  Filter,
  Package,
  Wrench,
  RefreshCw,
  Loader2,
  AlertTriangle,
  X,
  Ban,
  Archive,
  RotateCcw,
  User,
  Inbox,
  CheckCircle,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import IconButton from '../../../components/IconButton';
import Modal from '../../../components/Modal';
import Tabs from '../../../components/Tabs';
import { listEmpresas } from '../../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useAlert, useConfirm } from '../../../confirm/ConfirmContext';
import { useSidebar } from '../../../layout/SidebarContext';
import { explicarSituacao, infoSituacao } from './situacao';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import {
  listCertificadosEspiao,
  consultarCertificadoEspiao,
  listNotasPorCertificadoEspiao,
  listNotasInativadasPorCertificadoEspiao,
  getAgendamentoEspiao,
  salvarAgendamentoEspiao,
  baixarNotaEspiao,
  baixarNotaPdfEspiao,
  inativarNotasEspiao,
  reativarNotasEspiao,
} from '../../../api/espiao.api';

const INTERVALOS = [
  { value: 1, label: 'A cada 1 hora' },
  { value: 2, label: 'A cada 2 horas' },
  { value: 4, label: 'A cada 4 horas' },
  { value: 6, label: 'A cada 6 horas' },
  { value: 12, label: 'A cada 12 horas' },
  { value: 24, label: 'A cada 24 horas' },
];

const EMPTY_FILTROS = { chave: '', numero: '', emissor: '', destinatario: '' };

// Três estados das notas, no mesmo estilo de aba "navegador" usado em
// Repasses CEF (ver componente Tabs) — cor só no ícone de cada aba (não no
// fundo/texto), pra ficar reconhecível de relance sem virar um botão colorido
// gigante. Por enquanto só o visual; a ação de cada aba vem depois.
const TABS_NOTAS = [
  { id: 'novas', label: 'Novas Notas', icon: Inbox, iconColorClass: 'text-primary-600' },
  { id: 'cientes', label: 'Cientes', icon: CheckCircle, iconColorClass: 'text-emerald-600' },
  { id: 'inativas', label: 'Inativas', icon: Archive, iconColorClass: 'text-red-600' },
];

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatarDataHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function estaVencido(validadeAte) {
  if (!validadeAte) return false;
  return new Date(validadeAte) < new Date();
}

export default function EspiaoNfeNfsePage() {
  const alert = useAlert();
  const confirm = useConfirm();
  const { collapseTemporarily, restoreCollapse } = useSidebar();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');

  // Alterna entre "notas ativas" (comportamento normal) e "notas inativadas"
  // na MESMA tela — é só um filtro a mais, não uma tela separada. Mesma
  // empresa, mesmas datas, mesmo layout de cards por certificado.
  const [modoInativas, setModoInativas] = useState(false);

  // Aba de estado das notas (ver TABS_NOTAS) — sempre começa em "Novas
  // Notas". Só o visual por enquanto, sem filtrar nada ainda.
  const [abaNotas, setAbaNotas] = useState('novas');

  const [certificados, setCertificados] = useState([]);
  const [loadingCertificados, setLoadingCertificados] = useState(false);

  const [dataInicio, setDataInicio] = useState(hojeISO());
  const [dataFim, setDataFim] = useState(hojeISO());

  const [expandidos, setExpandidos] = useState(new Set());
  const [notasPorCertificado, setNotasPorCertificado] = useState({});
  const [loadingNotas, setLoadingNotas] = useState({});
  const [abaPorCertificado, setAbaPorCertificado] = useState({});
  const [consultando, setConsultando] = useState({});
  const [reativandoLote, setReativandoLote] = useState(false);

  // Notas marcadas pelo usuário — pra inativar (notas ativas) ou reativar
  // (notas inativadas), dependendo do modo. Guarda o objeto inteiro (não só
  // o id) porque, depois da ação, precisamos saber de qual certificado/aba
  // remover a linha na hora de atualizar a tela sem recarregar.
  const [selecionadas, setSelecionadas] = useState(new Map());
  const [modalInativar, setModalInativar] = useState(false);
  const [motivoInativacao, setMotivoInativacao] = useState('');
  const [inativando, setInativando] = useState(false);

  const [modalAgendamento, setModalAgendamento] = useState(false);
  const [intervaloSelecionado, setIntervaloSelecionado] = useState(1);
  const [salvandoAgendamento, setSalvandoAgendamento] = useState(false);

  // filtroTexto é o que o usuário está digitando, do jeito que ele digitou
  // (minúsculo inclusive). filtros é a versão em caixa alta, com um pequeno
  // debounce, que realmente dispara a busca — assim o campo não pula pra
  // maiúscula na frente dos olhos do usuário enquanto ele digita.
  const [filtroTexto, setFiltroTexto] = useState(EMPTY_FILTROS);
  const [filtros, setFiltros] = useState(EMPTY_FILTROS);
  const [painelFiltroAberto, setPainelFiltroAberto] = useState(false);
  const [filtrando, setFiltrando] = useState(false);

  const totalFiltrosAtivos = Object.values(filtros).filter(Boolean).length;
  const filtroAtivo = Boolean(filtros.chave || filtros.numero || filtros.emissor || filtros.destinatario);

  useEffect(() => {
    const handler = setTimeout(() => {
      setFiltros({
        chave: filtroTexto.chave.toUpperCase(),
        numero: filtroTexto.numero.toUpperCase(),
        emissor: filtroTexto.emissor.toUpperCase(),
        destinatario: filtroTexto.destinatario.toUpperCase(),
      });
    }, 300);
    return () => clearTimeout(handler);
  }, [filtroTexto]);

  // Com o painel de filtro aberto, recolhe o menu lateral pra ganhar espaço
  // de tela; ao fechar, o menu volta pro estado em que o usuário o deixou.
  useEffect(() => {
    if (painelFiltroAberto) {
      collapseTemporarily();
    } else {
      restoreCollapse();
    }
    return () => restoreCollapse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painelFiltroAberto]);

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  // Administrador é restrito à própria empresa — o seletor já vem
  // preenchido com ela e travado, sem opção de trocar.
  useEffect(() => {
    if (empresaTravada && empresaIdTravada) setEmpresaId(empresaIdTravada);
  }, [empresaTravada, empresaIdTravada]);

  function carregarCertificados() {
    if (!empresaId) return;
    setLoadingCertificados(true);
    return listCertificadosEspiao(empresaId)
      .then(setCertificados)
      .finally(() => setLoadingCertificados(false));
  }

  useEffect(() => {
    setCertificados([]);
    setExpandidos(new Set());
    setNotasPorCertificado({});
    setSelecionadas(new Map());
    carregarCertificados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  function handleEmpresaChange(novoId) {
    setEmpresaId(novoId);
  }

  // Trocar entre notas ativas/inativadas é um dataset diferente por
  // certificado — zera cards abertos, notas em cache e seleção, mas mantém
  // empresa, datas e filtros exatamente como estavam.
  function toggleModoInativas() {
    setModoInativas((prev) => !prev);
    setExpandidos(new Set());
    setNotasPorCertificado({});
    setSelecionadas(new Map());
  }

  const empresaSelecionada = useMemo(
    () => empresas.find((e) => String(e.id) === String(empresaId)),
    [empresas, empresaId]
  );

  // Certificado sempre aparece na tela, mesmo sem nenhuma nota ainda — é
  // como o usuário descobre que precisa consultar. Só quando há uma busca
  // ativa (chave/número/emissor/destinatário) é que escondemos quem não bate
  // com o filtro.
  const certificadosFiltrados = useMemo(() => {
    if (!filtroAtivo) return certificados;
    return certificados.filter((certificado) => {
      const dados = notasPorCertificado[certificado.id];
      return dados && (dados.produtos.length > 0 || dados.servicos.length > 0);
    });
  }, [certificados, notasPorCertificado, filtroAtivo]);

  function carregarNotas(certificadoId) {
    setLoadingNotas((prev) => ({ ...prev, [certificadoId]: true }));
    const buscar = modoInativas ? listNotasInativadasPorCertificadoEspiao : listNotasPorCertificadoEspiao;
    return buscar(certificadoId, { dataInicio, dataFim, ...filtros })
      .then((dados) => setNotasPorCertificado((prev) => ({ ...prev, [certificadoId]: dados })))
      .finally(() => setLoadingNotas((prev) => ({ ...prev, [certificadoId]: false })));
  }

  function toggleExpandido(certificadoId) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(certificadoId)) {
        next.delete(certificadoId);
      } else {
        next.add(certificadoId);
        // O carregamento em bloco (carregarNotasDeTodosCertificados) já
        // busca as notas de todo mundo pra saber quem tem nota e quem não
        // tem — se já tiver em cache, não busca de novo.
        if (!notasPorCertificado[certificadoId]) carregarNotas(certificadoId);
      }
      return next;
    });
  }

  // Busca as notas de TODOS os certificados da empresa (não só os
  // expandidos) — necessário sempre, porque o card mostra a contagem já
  // filtrada pelo período/busca atual mesmo fechado (é a mesma contagem que
  // aparece ao expandir, só que "adiantada"). Com busca ativa, também serve
  // pra abrir automaticamente só quem bate com o filtro.
  async function carregarNotasDeTodosCertificados(autoExpandir) {
    setFiltrando(true);
    try {
      const buscar = modoInativas ? listNotasInativadasPorCertificadoEspiao : listNotasPorCertificadoEspiao;
      const resultados = await Promise.all(
        certificados.map(async (certificado) => {
          setLoadingNotas((prev) => ({ ...prev, [certificado.id]: true }));
          try {
            const dados = await buscar(certificado.id, { dataInicio, dataFim, ...filtros });
            setNotasPorCertificado((prev) => ({ ...prev, [certificado.id]: dados }));
            return { id: certificado.id, temResultado: dados.produtos.length > 0 || dados.servicos.length > 0 };
          } finally {
            setLoadingNotas((prev) => ({ ...prev, [certificado.id]: false }));
          }
        })
      );
      if (autoExpandir) {
        setExpandidos(new Set(resultados.filter((r) => r.temResultado).map((r) => r.id)));
      }
    } finally {
      setFiltrando(false);
    }
  }

  useEffect(() => {
    if (certificados.length === 0) return;
    // autoExpandir (abrir automaticamente quem bate) só faz sentido com
    // busca ativa — sem busca, a contagem no card só atualiza, sem mexer
    // no que o usuário já tinha expandido/recolhido manualmente.
    carregarNotasDeTodosCertificados(filtroAtivo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicio, dataFim, filtros, certificados, modoInativas]);

  function limparFiltros() {
    setFiltroTexto(EMPTY_FILTROS);
    setFiltros(EMPTY_FILTROS);
    setExpandidos(new Set());
  }

  function abaAtiva(certificadoId) {
    return abaPorCertificado[certificadoId] || 'produtos';
  }

  function setAba(certificadoId, aba) {
    setAbaPorCertificado((prev) => ({ ...prev, [certificadoId]: aba }));
  }

  async function handleConsultar(certificadoId) {
    setConsultando((prev) => ({ ...prev, [certificadoId]: true }));
    try {
      const resultado = await consultarCertificadoEspiao(certificadoId);
      await carregarCertificados();
      if (expandidos.has(certificadoId)) await carregarNotas(certificadoId);

      if (!resultado.ok) {
        await alert({
          title: 'Não foi possível consultar',
          description: resultado.mensagem || 'Não foi possível consultar as notas deste certificado.',
          variant: 'warning',
        });
      } else {
        const resumo = [
          `Produtos (NF-e): ${resultado.notasProdutosSalvas} salva(s) de ${resultado.notasProdutosEncontradas} encontrada(s).`,
          `Serviços (NFS-e): ${resultado.notasServicosSalvas} salva(s) de ${resultado.notasServicosEncontradas} encontrada(s).`,
          resultado.mensagem,
        ]
          .filter(Boolean)
          .join('\n');
        await alert({
          title: 'Consulta concluída',
          description: resumo,
          variant: 'default',
        });
      }
    } catch (err) {
      await alert({
        title: 'Não foi possível consultar',
        description: err.response?.data?.message || 'Não foi possível consultar as notas deste certificado.',
        variant: 'warning',
      });
    } finally {
      setConsultando((prev) => ({ ...prev, [certificadoId]: false }));
    }
  }

  async function abrirAgendamento() {
    setModalAgendamento(true);
    setIntervaloSelecionado(1);
    try {
      const atual = await getAgendamentoEspiao(empresaId);
      if (atual?.intervalo_horas) setIntervaloSelecionado(atual.intervalo_horas);
    } catch {
      // sem agendamento salvo ainda — mantém o padrão de 1h
    }
  }

  async function handleSalvarAgendamento() {
    setSalvandoAgendamento(true);
    try {
      await salvarAgendamentoEspiao(empresaId, intervaloSelecionado);
      setModalAgendamento(false);
    } catch (err) {
      await alert({
        title: 'Não foi possível salvar',
        description: err.response?.data?.message || 'Não foi possível salvar o agendamento.',
        variant: 'warning',
      });
    } finally {
      setSalvandoAgendamento(false);
    }
  }

  async function handleDownload(nota) {
    const blob = await baixarNotaEspiao(nota.id);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${nota.chave_acesso}.xml`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  async function handleDownloadPdf(nota) {
    const blob = await baixarNotaPdfEspiao(nota.id);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${nota.chave_acesso}.pdf`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  function toggleSelecionada(certificadoId, tipo, nota) {
    setSelecionadas((prev) => {
      const next = new Map(prev);
      if (next.has(nota.id)) {
        next.delete(nota.id);
      } else {
        next.set(nota.id, { certificadoId, tipo });
      }
      return next;
    });
  }

  function limparSelecao() {
    setSelecionadas(new Map());
  }

  async function handleInativar(e) {
    e.preventDefault();
    if (selecionadas.size === 0) return;
    setInativando(true);
    try {
      const notaIds = Array.from(selecionadas.keys());
      await inativarNotasEspiao(notaIds, motivoInativacao.trim());

      // Some da tela na hora, sem precisar recarregar do zero.
      setNotasPorCertificado((prev) => {
        const next = { ...prev };
        selecionadas.forEach(({ certificadoId }, notaId) => {
          const dados = next[certificadoId];
          if (!dados) return;
          next[certificadoId] = {
            produtos: dados.produtos.filter((n) => n.id !== notaId),
            servicos: dados.servicos.filter((n) => n.id !== notaId),
          };
        });
        return next;
      });

      await alert({
        title: 'Notas inativadas',
        description: `${notaIds.length} nota(s) inativada(s). Clique em "Notas Inativadas" para vê-las.`,
        variant: 'default',
      });

      setModalInativar(false);
      setMotivoInativacao('');
      limparSelecao();
    } catch (err) {
      await alert({
        title: 'Não foi possível inativar',
        description: err.response?.data?.message || 'Não foi possível inativar as notas selecionadas.',
        variant: 'warning',
      });
    } finally {
      setInativando(false);
    }
  }

  async function handleReativarSelecionadas() {
    if (selecionadas.size === 0) return;
    const notaIds = Array.from(selecionadas.keys());
    const confirmado = await confirm({
      title: 'Reativar notas selecionadas',
      description: `${notaIds.length} nota(s) vão voltar a aparecer nas notas ativas.`,
      confirmLabel: 'Reativar',
    });
    if (!confirmado) return;

    setReativandoLote(true);
    try {
      await reativarNotasEspiao(notaIds);

      // Some da lista de inativadas na hora, sem precisar recarregar do zero.
      setNotasPorCertificado((prev) => {
        const next = { ...prev };
        selecionadas.forEach(({ certificadoId }, notaId) => {
          const dados = next[certificadoId];
          if (!dados) return;
          next[certificadoId] = {
            produtos: dados.produtos.filter((n) => n.id !== notaId),
            servicos: dados.servicos.filter((n) => n.id !== notaId),
          };
        });
        return next;
      });

      await alert({
        title: 'Notas reativadas',
        description: `${notaIds.length} nota(s) reativada(s). Elas voltaram a aparecer nas notas ativas.`,
        variant: 'default',
      });

      limparSelecao();
    } catch (err) {
      await alert({
        title: 'Não foi possível reativar',
        description: err.response?.data?.message || 'Não foi possível reativar as notas selecionadas.',
        variant: 'warning',
      });
    } finally {
      setReativandoLote(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        {/* justify-between separa filtros (esquerda) de botões (direita) —
            sem isso, com Empresa e Data início/fim ambos com max-w (ver
            comentário abaixo), sobrava espaço DEPOIS dos botões em vez deles
            ficarem colados na borda direita do card. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-1 sm:items-end">
            <div className="min-w-0 flex-1 sm:max-w-xs">
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

            {/* Sem outros campos flex-1 disputando espaço nessa tela (como
                Centro de Custo/Responsável fazem em Gestão de Cobranças), esse
                bloco sozinho engoliria toda a largura sobrando — por isso o
                max-w explícito, calibrado pro mesmo tamanho por campo (~229px)
                de lá, em vez de só copiar o `sm:flex-1` sem mais nada. */}
            <div className="flex min-w-0 gap-3 sm:max-w-[470px] sm:flex-1">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Data início</label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Data fim</label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
          </div>

          {/* Sempre visíveis, mesmo sem empresa escolhida — só desabilitados,
              em vez de sumirem da tela. */}
          <div className="flex shrink-0 items-end gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setPainelFiltroAberto(true)}
                disabled={!empresaId}
                title="Filtros"
                className="flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Filter size={18} />
              </button>
              {totalFiltrosAtivos > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[10px] font-semibold text-white">
                  {totalFiltrosAtivos}
                </span>
              )}
            </div>
            {!modoInativas && (
              <button
                type="button"
                onClick={abrirAgendamento}
                disabled={!empresaId}
                title="Consultas Automáticas"
                className="flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <CalendarClock size={18} />
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Três estados das notas, no estilo de aba usado em Repasses CEF (ver
          TABS_NOTAS) — sempre visível, mesmo sem empresa (só não faz nada
          ainda, a ação de cada aba vem depois). */}
      <Tabs tabs={TABS_NOTAS} activeId={abaNotas} onChange={setAbaNotas} />

      {!empresaId ? (
        <Card>
          <p className="py-8 text-center text-sm text-gray-400">
            Selecione uma empresa acima para ver os certificados e as notas encontradas.
          </p>
        </Card>
      ) : (
        <>
          {loadingCertificados ? (
            <Card>
              <p className="py-8 text-center text-sm text-gray-400">Carregando certificados...</p>
            </Card>
          ) : certificados.length === 0 ? (
            <Card>
              <p className="py-8 text-center text-sm text-gray-400">
                Esta empresa não tem nenhum certificado digital cadastrado.
              </p>
            </Card>
          ) : !filtrando && filtroAtivo && certificadosFiltrados.length === 0 ? (
            <Card>
              <p className="py-8 text-center text-sm text-gray-400">
                {modoInativas
                  ? 'Nenhum certificado tem nota inativada que corresponda a esse filtro.'
                  : 'Nenhum certificado tem nota que corresponda a esse filtro.'}
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtrando && (
                <p className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Loader2 size={12} className="animate-spin" />
                  Verificando notas em todos os certificados...
                </p>
              )}
              {certificadosFiltrados.map((certificado) => {
                const vencido = estaVencido(certificado.validade_ate);
                const expandido = expandidos.has(certificado.id);
                const notas = notasPorCertificado[certificado.id];
                const carregandoNotas = Boolean(loadingNotas[certificado.id]);
                const aba = abaAtiva(certificado.id);
                const totalNotas = notas ? notas.produtos.length + notas.servicos.length : 0;
                const emConsulta = Boolean(consultando[certificado.id]);
                // Mesma contagem que aparece dentro do card ao expandir (já
                // filtrada pelo período/busca atual) — só que "adiantada",
                // direto no cabeçalho, sem precisar abrir. Enquanto ainda não
                // carregou, mostra "…" em vez de um número errado.
                const totalNfeCard = notas ? notas.produtos.length : null;
                const totalNfseCard = notas ? notas.servicos.length : null;

                return (
                  <Card key={certificado.id} className="!p-0 overflow-hidden">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleExpandido(certificado.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') toggleExpandido(certificado.id);
                      }}
                      className={`flex min-h-[52px] w-full cursor-pointer items-center gap-3 px-5 py-2.5 text-left hover:bg-gray-50 ${
                        vencido ? 'border-l-4 border-l-red-500 bg-red-100' : ''
                      }`}
                    >
                      {expandido ? (
                        <ChevronDown size={18} className="shrink-0 text-gray-400" />
                      ) : (
                        <ChevronRight size={18} className="shrink-0 text-gray-400" />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{certificado.nome}</p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <div className="flex items-center gap-2.5 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <Package size={12} />
                            {totalNfeCard === null ? '…' : totalNfeCard} produto
                            {totalNfeCard !== 1 ? 's' : ''}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Wrench size={12} />
                            {totalNfseCard === null ? '…' : totalNfseCard} serviço
                            {totalNfseCard !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {!modoInativas && certificado.ultima_consulta_em && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                            <Clock size={12} />
                            Última consulta: {formatarDataHora(certificado.ultima_consulta_em)}
                          </span>
                        )}

                        {vencido ? (
                          <span
                            title="Certificado vencido — não é possível consultar novas notas com ele"
                            className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            <AlertTriangle size={12} />
                            Certificado vencido
                          </span>
                        ) : modoInativas ? null : certificado.ultima_consulta_em ? (
                          <IconButton
                            title="Consultar novamente"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!emConsulta) handleConsultar(certificado.id);
                            }}
                            className="hover:text-primary-600"
                          >
                            {emConsulta ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <RefreshCw size={15} />
                            )}
                          </IconButton>
                        ) : (
                          <span
                            role="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!emConsulta) handleConsultar(certificado.id);
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white ${
                              emConsulta ? 'bg-primary-400' : 'bg-primary-600 hover:bg-primary-700'
                            }`}
                          >
                            {emConsulta ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <RefreshCw size={12} />
                            )}
                            Gerar 1ª Consulta
                          </span>
                        )}
                      </div>
                    </div>

                    {expandido && (
                      <div className="border-t border-gray-100 px-5 py-4">
                        {carregandoNotas ? (
                          <p className="py-6 text-center text-sm text-gray-400">Carregando notas...</p>
                        ) : totalNotas === 0 ? (
                          <p className="py-6 text-center text-sm text-gray-400">
                            {modoInativas
                              ? 'Nenhuma nota inativada no período selecionado.'
                              : 'Nenhuma nota encontrada no período selecionado.'}
                          </p>
                        ) : (
                          <>
                            <div className="mb-3 flex gap-2">
                              <button
                                type="button"
                                onClick={() => setAba(certificado.id, 'produtos')}
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                  aba === 'produtos'
                                    ? 'bg-primary-50 text-primary-600'
                                    : 'text-gray-500 hover:bg-gray-50'
                                }`}
                              >
                                <Package size={13} />
                                Produtos (NF-e) · {notas.produtos.length}
                              </button>
                              <button
                                type="button"
                                onClick={() => setAba(certificado.id, 'servicos')}
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                  aba === 'servicos'
                                    ? 'bg-primary-50 text-primary-600'
                                    : 'text-gray-500 hover:bg-gray-50'
                                }`}
                              >
                                <Wrench size={13} />
                                Serviços (NFS-e) · {notas.servicos.length}
                              </button>
                            </div>

                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                                  <th className="py-2 pr-3 font-medium">
                                    <span className="sr-only">Selecionar</span>
                                  </th>
                                  <th className="py-2 px-3 font-medium whitespace-nowrap">Nº / Série</th>
                                  <th className="py-2 px-3 font-medium">Emissor</th>
                                  <th className="py-2 px-3 font-medium">Destinatário</th>
                                  <th className="py-2 px-3 font-medium">Emissão</th>
                                  <th className="py-2 px-3 font-medium">Situação</th>
                                  {modoInativas && <th className="py-2 px-3 font-medium">Inativada por</th>}
                                  <th className="py-2 pl-3 font-medium"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {(aba === 'produtos' ? notas.produtos : notas.servicos).map((nota) => {
                                  const { Icon: IconeSituacao, colorClass } = infoSituacao(nota.situacao);
                                  return (
                                    <tr key={nota.id} className="border-b border-gray-50 last:border-0">
                                      <td className="py-2.5 pr-3">
                                        <input
                                          type="checkbox"
                                          checked={selecionadas.has(nota.id)}
                                          onChange={() => toggleSelecionada(certificado.id, aba, nota)}
                                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-100"
                                        />
                                      </td>
                                      <td className="py-2.5 px-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                                        {nota.numero_nota || '—'}
                                        {nota.serie_nota && (
                                          <span className="text-gray-400"> / {nota.serie_nota}</span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-3 text-gray-900">{nota.emissor || '—'}</td>
                                      <td className="py-2.5 px-3 text-gray-600">{nota.destinatario || '—'}</td>
                                      <td className="py-2.5 px-3 text-gray-600">
                                        {formatarData(nota.data_emissao)}
                                      </td>
                                      <td className="py-2.5 px-3">
                                        {!nota.situacao || nota.situacao === 'Emitida' ? (
                                          <span className="text-xs text-gray-400">Emitida</span>
                                        ) : (
                                          <div className="group relative inline-block">
                                            <IconeSituacao size={17} className={colorClass} />
                                            {/* Abre pra cima e pra esquerda: o card tem
                                                overflow-hidden (bordas arredondadas), a
                                                última linha não tem espaço abaixo, e essa
                                                coluna fica perto da borda direita da tabela. */}
                                            <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-1.5 hidden w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-snug text-white shadow-lg group-hover:block">
                                              <p className="mb-1 font-semibold">{nota.situacao}</p>
                                              <p>{explicarSituacao(nota.situacao)}</p>
                                            </div>
                                          </div>
                                        )}
                                      </td>
                                      {modoInativas && (
                                        <td className="py-2.5 px-3">
                                          {/* Hover mostra o motivo dado pelo usuário na hora da inativação. */}
                                          <div className="group relative inline-block">
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                                              <User size={12} />
                                              {nota.inativada_por_nome || 'Usuário removido'}
                                            </span>
                                            <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-1.5 hidden w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs leading-snug text-white shadow-lg group-hover:block">
                                              <p className="mb-1 flex items-center gap-1 font-semibold text-amber-300">
                                                <AlertTriangle size={12} />
                                                Motivo da inativação
                                              </p>
                                              <p>{nota.motivo_inativacao || 'Nenhum motivo informado.'}</p>
                                              <p className="mt-1 text-gray-400">
                                                Inativada em {formatarDataHora(nota.inativada_em)}
                                              </p>
                                            </div>
                                          </div>
                                        </td>
                                      )}
                                      <td className="py-2.5 pl-3 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <button
                                            type="button"
                                            title="Baixar PDF"
                                            onClick={() => handleDownloadPdf(nota)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-primary-600"
                                          >
                                            <FileText size={14} />
                                          </button>
                                          <button
                                            type="button"
                                            title="Baixar XML"
                                            onClick={() => handleDownload(nota)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-primary-600"
                                          >
                                            <Download size={14} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={modalAgendamento}
        onClose={() => setModalAgendamento(false)}
        title={empresaSelecionada ? `Agendar consulta — ${nomeExibicaoEmpresa(empresaSelecionada)}` : ''}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Defina de quanto em quanto tempo o sistema deve buscar novas notas para esta empresa
            (mínimo 1 hora). Quando a rotina disparar, ela varre todos os certificados válidos da
            empresa — não é um agendamento por certificado.
          </p>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Intervalo</label>
            <SearchableSelect
              value={intervaloSelecionado}
              onChange={setIntervaloSelecionado}
              disabled={salvandoAgendamento}
              options={INTERVALOS}
              clearable={false}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalAgendamento(false)}
              disabled={salvandoAgendamento}
            >
              Cancelar
            </Button>
            <Button type="button" loading={salvandoAgendamento} onClick={handleSalvarAgendamento}>
              Salvar agendamento
            </Button>
          </div>
        </div>
      </Modal>

      {/* Painel lateral de filtro — sempre montado pra transição de translate
          funcionar (fechado fica fora da tela em vez de desmontar). */}
      <div className={`fixed inset-0 z-50 ${painelFiltroAberto ? '' : 'pointer-events-none'}`}>
        <div className="absolute inset-0 cursor-pointer" onClick={() => setPainelFiltroAberto(false)} />
        <div
          className={`absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-white shadow-card transition-transform duration-300 ${
            painelFiltroAberto ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">Filtrar notas</h2>
            <button
              type="button"
              onClick={() => setPainelFiltroAberto(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            <p className="text-xs text-gray-500">A busca acontece automaticamente enquanto você digita</p>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Número da nota</label>
              <input
                type="text"
                value={filtroTexto.numero}
                onChange={(e) => setFiltroTexto((prev) => ({ ...prev, numero: e.target.value }))}
                placeholder="Busca pelo número da nota"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Chave da nota fiscal</label>
              <input
                type="text"
                value={filtroTexto.chave}
                onChange={(e) => setFiltroTexto((prev) => ({ ...prev, chave: e.target.value }))}
                placeholder="Busca por parte da chave de acesso"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Emissor</label>
              <input
                type="text"
                value={filtroTexto.emissor}
                onChange={(e) => setFiltroTexto((prev) => ({ ...prev, emissor: e.target.value }))}
                placeholder="Busca por parte do nome do emissor"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Destinatário</label>
              <input
                type="text"
                value={filtroTexto.destinatario}
                onChange={(e) => setFiltroTexto((prev) => ({ ...prev, destinatario: e.target.value }))}
                placeholder="Busca por parte do nome do destinatário"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
          </div>

          <div className="flex justify-between gap-2 border-t border-gray-100 p-5">
            <Button type="button" variant="secondary" onClick={limparFiltros}>
              Limpar filtros
            </Button>
            <Button type="button" onClick={() => setPainelFiltroAberto(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </div>

      {selecionadas.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4">
          <div className="flex items-center gap-3 rounded-full border border-gray-200 bg-white px-4 py-2.5 shadow-card">
            <span className="text-sm font-medium text-gray-700">
              {selecionadas.size} nota{selecionadas.size > 1 ? 's' : ''} selecionada{selecionadas.size > 1 ? 's' : ''}
            </span>
            <Button variant="secondary" onClick={limparSelecao}>
              Cancelar
            </Button>
            {modoInativas ? (
              <Button
                className="!border-emerald-600 !bg-emerald-600 !text-white hover:!bg-emerald-700"
                loading={reativandoLote}
                onClick={handleReativarSelecionadas}
              >
                <RotateCcw size={15} />
                Reativar
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setModalInativar(true)}>
                <Ban size={15} />
                Inativar
              </Button>
            )}
          </div>
        </div>
      )}

      <Modal
        open={modalInativar}
        onClose={() => !inativando && setModalInativar(false)}
        title="Inativar notas selecionadas"
      >
        <form onSubmit={handleInativar} className="space-y-4">
          <p className="text-sm text-gray-500">
            {selecionadas.size} nota{selecionadas.size > 1 ? 's' : ''} vai{selecionadas.size > 1 ? 'ão' : ''} sair
            da lista de notas ativas. Explique o motivo.
          </p>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Motivo da inativação</label>
            <textarea
              value={motivoInativacao}
              onChange={(e) => setMotivoInativacao(e.target.value)}
              placeholder="Explique por que essas notas estão sendo inativadas"
              rows={4}
              required
              minLength={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalInativar(false)}
              disabled={inativando}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="danger" loading={inativando}>
              Inativar {selecionadas.size} nota{selecionadas.size > 1 ? 's' : ''}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
