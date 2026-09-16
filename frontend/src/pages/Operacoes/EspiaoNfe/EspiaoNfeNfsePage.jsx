import { useEffect, useMemo, useState } from 'react';
import {
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
  Plus,
  Minus,
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

// Uma linha de nota dentro da tabela única (ver bloco de render do
// certificado) — extraída à parte porque agora é usada duas vezes seguidas
// (produtos e serviços do mesmo certificado, um embaixo do outro), não mais
// escolhida por uma aba.
function LinhaNota({ nota, modoInativas, selecionada, onToggleSelecionada, onBaixarPdf, onBaixar }) {
  const { Icon: IconeSituacao, colorClass } = infoSituacao(nota.situacao);
  return (
    <tr className="border-b border-gray-50 last:border-0">
      {/* pl-14: nível 3 do drilldown (Certificado → Produtos/Serviços →
          Nota) — mesmo recuo da etapa em GestaoParcelasTab.jsx, só a
          primeira coluna cresce, o resto mantém alinhamento normal. */}
      <td className="py-2.5 pl-14 pr-3">
        <input
          type="checkbox"
          checked={selecionada}
          onChange={onToggleSelecionada}
          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-100"
        />
      </td>
      <td className="py-2.5 px-3 font-mono text-xs text-gray-600 whitespace-nowrap">
        {nota.numero_nota || '—'}
        {nota.serie_nota && <span className="text-gray-400"> / {nota.serie_nota}</span>}
      </td>
      <td className="py-2.5 px-3 text-gray-900">{nota.emissor || '—'}</td>
      <td className="py-2.5 px-3 text-gray-600">{formatarData(nota.data_emissao)}</td>
      <td className="py-2.5 px-3">
        {!nota.situacao || nota.situacao === 'Emitida' ? (
          <span className="text-xs text-gray-400">Emitida</span>
        ) : (
          <div className="group relative inline-block">
            <IconeSituacao size={17} className={colorClass} />
            {/* Abre pra cima e pra esquerda: a coluna fica perto da borda
                direita da tabela, e não dá pra saber se é uma das últimas
                linhas do certificado (a tabela inteira rola junto agora). */}
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
              <p className="mt-1 text-gray-400">Inativada em {formatarDataHora(nota.inativada_em)}</p>
            </div>
          </div>
        </td>
      )}
      <td className="py-2.5 pl-3 pr-5 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            title="Baixar PDF"
            onClick={onBaixarPdf}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-primary-600"
          >
            <FileText size={14} />
          </button>
          <button
            type="button"
            title="Baixar XML"
            onClick={onBaixar}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-primary-600"
          >
            <Download size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
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

  const [notasPorCertificado, setNotasPorCertificado] = useState({});
  const [loadingNotas, setLoadingNotas] = useState({});
  const [consultando, setConsultando] = useState({});

  // Drilldown de 3 níveis na mesma tabela (mesmo espírito de
  // GestaoParcelasTab.jsx: cada nível é mais uma <tr>, só com mais recuo,
  // nunca uma tabela aninhada à parte): Certificado → Produtos/Serviços →
  // Nota. As notas de todos os certificados já são carregadas de qualquer
  // jeito (ver carregarNotasDeTodosCertificados), então abrir/fechar aqui é
  // só uma questão de mostrar/esconder linhas, não de buscar dado. Ambos os
  // níveis começam sempre fechados.
  const [abertos, setAbertos] = useState(new Set());
  // Nível 2 (Produtos/Serviços) — chave `${certificadoId}:produtos` ou
  // `${certificadoId}:servicos`, independente por certificado: dá pra abrir
  // só Produtos de um certificado e só Serviços de outro ao mesmo tempo.
  const [secoesAbertas, setSecoesAbertas] = useState(new Set());

  function toggleAberto(certificadoId) {
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(certificadoId)) {
        next.delete(certificadoId);
        // Fecha junto o nível 2 deste certificado, senão reabrir o
        // certificado depois já viria com Produtos/Serviços expandidos.
        setSecoesAbertas((prevSecoes) => {
          const nextSecoes = new Set(prevSecoes);
          nextSecoes.delete(`${certificadoId}:produtos`);
          nextSecoes.delete(`${certificadoId}:servicos`);
          return nextSecoes;
        });
      } else {
        next.add(certificadoId);
      }
      return next;
    });
  }

  function toggleSecao(certificadoId, tipo) {
    setSecoesAbertas((prev) => {
      const next = new Set(prev);
      const chave = `${certificadoId}:${tipo}`;
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }
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
    setNotasPorCertificado({});
    setSelecionadas(new Map());
    carregarCertificados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  function handleEmpresaChange(novoId) {
    setEmpresaId(novoId);
  }

  // Trocar entre notas ativas/inativadas é um dataset diferente por
  // certificado — zera notas em cache e seleção, mas mantém empresa, datas e
  // filtros exatamente como estavam.
  function toggleModoInativas() {
    setModoInativas((prev) => !prev);
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

  // Busca as notas de TODOS os certificados da empresa de uma vez — a tela
  // não tem mais expandir/recolher por certificado (ver comentário no bloco
  // de render), então isso é o único jeito de popular a tabela inteira.
  async function carregarNotasDeTodosCertificados() {
    setFiltrando(true);
    try {
      const buscar = modoInativas ? listNotasInativadasPorCertificadoEspiao : listNotasPorCertificadoEspiao;
      await Promise.all(
        certificados.map(async (certificado) => {
          setLoadingNotas((prev) => ({ ...prev, [certificado.id]: true }));
          try {
            const dados = await buscar(certificado.id, { dataInicio, dataFim, ...filtros });
            setNotasPorCertificado((prev) => ({ ...prev, [certificado.id]: dados }));
          } finally {
            setLoadingNotas((prev) => ({ ...prev, [certificado.id]: false }));
          }
        })
      );
    } finally {
      setFiltrando(false);
    }
  }

  useEffect(() => {
    if (certificados.length === 0) return;
    carregarNotasDeTodosCertificados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicio, dataFim, filtros, certificados, modoInativas]);

  function limparFiltros() {
    setFiltroTexto(EMPTY_FILTROS);
    setFiltros(EMPTY_FILTROS);
  }

  async function handleConsultar(certificadoId) {
    setConsultando((prev) => ({ ...prev, [certificadoId]: true }));
    try {
      const resultado = await consultarCertificadoEspiao(certificadoId);
      await carregarCertificados();
      await carregarNotas(certificadoId);

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

  // Checkbox + Nº/Série + Emissor + Emissão + Situação + [Inativada por] +
  // Ações — quantas colunas a tabela única tem, pro colSpan das linhas de
  // seção (certificado, Produtos, Serviços).
  const totalColunas = modoInativas ? 7 : 6;

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

      {/* Tabs + conteúdo precisam ficar juntos, sem `space-y-*` entre eles —
          são um item SÓ dentro do space-y-4 da página (o vão vem antes desse
          bloco, não dentro dele), senão a margem empurra a caixa de baixo
          pra longe da barra de abas em vez dela ficar emendada (o
          rounded-tl-none do Card só faz efeito visual quando encostado; ver
          o mesmo padrão em GestaoCobrancasPage.jsx). */}
      <div>
        {/* Três estados das notas, no estilo de aba usado em Repasses CEF
            (ver TABS_NOTAS) — sempre visível, mesmo sem empresa (só não faz
            nada ainda, a ação de cada aba vem depois). */}
        <Tabs tabs={TABS_NOTAS} activeId={abaNotas} onChange={setAbaNotas} />

        {!empresaId ? (
          <Card className="rounded-tl-none">
            <p className="py-8 text-center text-sm text-gray-400">
              Selecione uma empresa acima para ver os certificados e as notas encontradas.
            </p>
          </Card>
        ) : (
          <>
            {loadingCertificados ? (
              <Card className="rounded-tl-none">
                <p className="py-8 text-center text-sm text-gray-400">Carregando certificados...</p>
              </Card>
            ) : certificados.length === 0 ? (
              <Card className="rounded-tl-none">
                <p className="py-8 text-center text-sm text-gray-400">
                  Esta empresa não tem nenhum certificado digital cadastrado.
                </p>
              </Card>
            ) : !filtrando && filtroAtivo && certificadosFiltrados.length === 0 ? (
              <Card className="rounded-tl-none">
                <p className="py-8 text-center text-sm text-gray-400">
                  {modoInativas
                    ? 'Nenhum certificado tem nota inativada que corresponda a esse filtro.'
                    : 'Nenhum certificado tem nota que corresponda a esse filtro.'}
                </p>
              </Card>
            ) : (
              <Card className="rounded-tl-none !p-0 overflow-hidden">
              {/* Drilldown de 3 níveis numa tabela única pra empresa inteira
                  (mesmo espírito de GestaoParcelasTab.jsx: cada nível é mais
                  uma <tr>, só com mais recuo, nunca uma tabela aninhada à
                  parte, e cada nível com seu próprio "+/−"): Certificado
                  (nome, contagem de produtos/serviços, última consulta e
                  botão de consultar) → Produtos/Serviços (linha de seção com
                  contagem) → Nota (checkbox à esquerda, número/série,
                  emissor, emissão, situação e download de PDF/XML). Um
                  <tbody> por certificado, um <thead> só no topo da tabela
                  inteira. */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                      <th className="py-2 pl-5 pr-3 font-medium">
                        <span className="sr-only">Selecionar</span>
                      </th>
                      <th className="py-2 px-3 font-medium whitespace-nowrap">Nº / Série</th>
                      <th className="py-2 px-3 font-medium">Emissor</th>
                      <th className="py-2 px-3 font-medium">Emissão</th>
                      <th className="py-2 px-3 font-medium">Situação</th>
                      {modoInativas && <th className="py-2 px-3 font-medium">Inativada por</th>}
                      <th className="py-2 pl-3 pr-5 font-medium"></th>
                    </tr>
                  </thead>

                  {filtrando && (
                    <tbody>
                      <tr>
                        <td colSpan={totalColunas} className="px-5 py-2.5">
                          <p className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Loader2 size={12} className="animate-spin" />
                            Verificando notas em todos os certificados...
                          </p>
                        </td>
                      </tr>
                    </tbody>
                  )}

                  {certificadosFiltrados.map((certificado) => {
                    const vencido = estaVencido(certificado.validade_ate);
                    const notas = notasPorCertificado[certificado.id];
                    const carregandoNotas = Boolean(loadingNotas[certificado.id]);
                    const emConsulta = Boolean(consultando[certificado.id]);
                    const aberto = abertos.has(certificado.id);
                    const produtosAberto = secoesAbertas.has(`${certificado.id}:produtos`);
                    const servicosAberto = secoesAbertas.has(`${certificado.id}:servicos`);
                    // Enquanto ainda não carregou, mostra "…" em vez de um
                    // número errado.
                    const totalNfeCard = notas ? notas.produtos.length : null;
                    const totalNfseCard = notas ? notas.servicos.length : null;

                    return (
                      <tbody key={certificado.id} className="border-b-8 border-gray-50 last:border-0">
                        <tr className={vencido ? 'bg-red-50' : 'bg-gray-50'}>
                          <td colSpan={totalColunas} className="px-5 py-2.5">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                              {/* Fechado por padrão (ver `abertos` — começa
                                  vazio) — as notas já estão carregadas de
                                  qualquer jeito, abrir só mostra as linhas. */}
                              <button
                                type="button"
                                onClick={() => toggleAberto(certificado.id)}
                                title={aberto ? 'Recolher' : 'Expandir'}
                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-500 hover:border-primary-300 hover:text-primary-600"
                              >
                                {aberto ? <Minus size={13} /> : <Plus size={13} />}
                              </button>

                              <p className="text-sm font-semibold text-gray-900">{certificado.nome}</p>

                              <span className="inline-flex items-center gap-2.5 text-xs text-gray-500">
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
                              </span>

                              {!modoInativas && certificado.ultima_consulta_em && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600">
                                  <Clock size={12} />
                                  Última consulta: {formatarDataHora(certificado.ultima_consulta_em)}
                                </span>
                              )}

                              <div className="ml-auto flex shrink-0 items-center gap-2">
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
                                    onClick={() => {
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
                                    onClick={() => {
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
                          </td>
                        </tr>

                        {!aberto ? null : carregandoNotas ? (
                          <tr>
                            <td colSpan={totalColunas} className="px-5 py-6 text-center text-sm text-gray-400">
                              Carregando notas...
                            </td>
                          </tr>
                        ) : (
                          <>
                            {/* Nível 2: linha de Produtos, com "+/−" próprio
                                (pl-9 — mesmo recuo do Cluster em
                                GestaoParcelasTab.jsx). Só mostra as notas
                                (nível 3) quando esta seção está aberta. */}
                            <tr
                              onClick={() => toggleSecao(certificado.id, 'produtos')}
                              className="cursor-pointer border-b border-gray-50 bg-white hover:bg-gray-50"
                            >
                              <td colSpan={totalColunas} className="py-2 pl-9 pr-5">
                                <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500">
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-200 text-gray-400">
                                    {produtosAberto ? <Minus size={9} /> : <Plus size={9} />}
                                  </span>
                                  <Package size={13} />
                                  Produtos (NF-e) · {notas ? notas.produtos.length : 0}
                                </span>
                              </td>
                            </tr>
                            {produtosAberto &&
                              (!notas || notas.produtos.length === 0 ? (
                                <tr>
                                  <td colSpan={totalColunas} className="pl-14 pr-5 pb-2.5 text-xs text-gray-400">
                                    {modoInativas
                                      ? 'Nenhum produto inativado no período selecionado.'
                                      : 'Nenhum produto encontrado no período selecionado.'}
                                  </td>
                                </tr>
                              ) : (
                                notas.produtos.map((nota) => (
                                  <LinhaNota
                                    key={nota.id}
                                    nota={nota}
                                    modoInativas={modoInativas}
                                    selecionada={selecionadas.has(nota.id)}
                                    onToggleSelecionada={() => toggleSelecionada(certificado.id, 'produtos', nota)}
                                    onBaixarPdf={() => handleDownloadPdf(nota)}
                                    onBaixar={() => handleDownload(nota)}
                                  />
                                ))
                              ))}

                            {/* Nível 2: linha de Serviços, independente da de
                                Produtos acima (cada uma com seu próprio
                                estado em secoesAbertas). */}
                            <tr
                              onClick={() => toggleSecao(certificado.id, 'servicos')}
                              className="cursor-pointer border-b border-gray-50 bg-white hover:bg-gray-50"
                            >
                              <td colSpan={totalColunas} className="py-2 pl-9 pr-5">
                                <span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500">
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-200 text-gray-400">
                                    {servicosAberto ? <Minus size={9} /> : <Plus size={9} />}
                                  </span>
                                  <Wrench size={13} />
                                  Serviços (NFS-e) · {notas ? notas.servicos.length : 0}
                                </span>
                              </td>
                            </tr>
                            {servicosAberto &&
                              (!notas || notas.servicos.length === 0 ? (
                                <tr>
                                  <td colSpan={totalColunas} className="pl-14 pr-5 pb-2.5 text-xs text-gray-400">
                                    {modoInativas
                                      ? 'Nenhum serviço inativado no período selecionado.'
                                      : 'Nenhum serviço encontrado no período selecionado.'}
                                  </td>
                                </tr>
                              ) : (
                                notas.servicos.map((nota) => (
                                  <LinhaNota
                                    key={nota.id}
                                    nota={nota}
                                    modoInativas={modoInativas}
                                    selecionada={selecionadas.has(nota.id)}
                                    onToggleSelecionada={() => toggleSelecionada(certificado.id, 'servicos', nota)}
                                    onBaixarPdf={() => handleDownloadPdf(nota)}
                                    onBaixar={() => handleDownload(nota)}
                                  />
                                ))
                              ))}
                          </>
                        )}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            </Card>
          )}
        </>
      )}
      </div>

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
