import { useEffect, useMemo, useRef, useState } from 'react';
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
  declararCienciaEspiao,
  desmarcarCienciaEspiao,
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

// "há 20 minutos" / "há 2 horas" / "há 3 dias" — usado no status de última
// consulta do certificado (ver render); a data/hora exata continua
// disponível no title (tooltip) do badge, via formatarDataHora.
function formatarTempoRelativo(iso) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutos = Math.floor(diffMs / 60000);
  if (minutos < 1) return 'agora mesmo';
  if (minutos < 60) return `há ${minutos} minuto${minutos !== 1 ? 's' : ''}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} hora${horas !== 1 ? 's' : ''}`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} dia${dias !== 1 ? 's' : ''}`;
}

function estaVencido(validadeAte) {
  if (!validadeAte) return false;
  return new Date(validadeAte) < new Date();
}

// Quantos dias faltam pro certificado vencer — null quando não tem data.
// Usado só pro aviso "vence em breve" (ver DIAS_AVISO_VENCIMENTO abaixo);
// vencido de fato continua sendo estaVencido() acima.
function diasParaVencer(validadeAte) {
  if (!validadeAte) return null;
  const diffMs = new Date(validadeAte) - new Date();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

const DIAS_AVISO_VENCIMENTO = 30;

// 'novas'/'cientes' (ver TABS_NOTAS) filtram, do lado do cliente, o MESMO
// dataset de notas ativas — o backend já manda `ciente_em` em cada nota
// (ver espiao.service.js::listNotasPorCertificado), então não precisa de
// outra chamada à API pra trocar de aba. 'inativas' é um dataset à parte
// (endpoint próprio, ver carregarNotas/carregarNotasDeTodosCertificados),
// então passa direto sem filtrar de novo.
function filtrarNotasPorAba(lista, aba, inativas) {
  if (inativas) return lista;
  if (aba === 'cientes') return lista.filter((n) => n.ciente_em);
  return lista.filter((n) => !n.ciente_em);
}

// Cabeçalho de coluna só do nível 3 (Nota) — não é mais um <thead> fixo no
// topo da tabela inteira, porque essas colunas (Nº/Série, Emissor...) só
// fazem sentido logo acima das notas, não acima do certificado/seção (que
// usam uma única célula com colSpan, sem essas colunas). Aparece de novo a
// cada seção de Produtos/Serviços aberta que tenha ao menos 1 nota.
function CabecalhoNotas({ modoInativas, checked, indeterminate, onToggleTodas }) {
  const checkboxRef = useRef(null);
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
      <th className="py-2 pl-14 pr-3 font-medium">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={checked}
          onChange={onToggleTodas}
          aria-label="Selecionar todas as notas desta seção"
          className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-100"
        />
      </th>
      <th className="py-2 px-3 font-medium whitespace-nowrap">Nº / Série</th>
      <th className="py-2 px-3 font-medium">Emissor</th>
      <th className="py-2 px-3 font-medium">Emissão</th>
      <th className="py-2 px-3 font-medium">Situação</th>
      {modoInativas && <th className="py-2 px-3 font-medium">Inativada por</th>}
      <th className="py-2 pl-3 pr-5 font-medium"></th>
    </tr>
  );
}

// Uma linha de nota dentro da tabela única (ver bloco de render do
// certificado) — extraída à parte porque agora é usada duas vezes seguidas
// (produtos e serviços do mesmo certificado, um embaixo do outro), não mais
// escolhida por uma aba.
function LinhaNota({
  nota,
  modoInativas,
  selecionada,
  onToggleSelecionada,
  onBaixarPdf,
  onBaixar,
  baixandoPdf,
  baixandoXml,
}) {
  const { Icon: IconeSituacao, colorClass, borderClass } = infoSituacao(nota.situacao);
  return (
    // border-l-2 sempre presente (mesmo transparente em "Emitida") pra não
    // deslocar o conteúdo 2px entre uma linha e outra — só a cor muda.
    <tr className={`border-b border-gray-50 border-l-2 last:border-0 ${borderClass}`}>
      {/* pl-14: nível 3 do drilldown (Certificado → Produtos/Serviços →
          Nota) — mesmo recuo da etapa em GestaoParcelasTab.jsx, só a
          primeira coluna cresce, o resto mantém alinhamento normal. */}
      <td className="py-1.5 pl-14 pr-3">
        <input
          type="checkbox"
          checked={selecionada}
          onChange={onToggleSelecionada}
          className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-100"
        />
      </td>
      <td className="py-1.5 px-3 font-mono text-xs text-gray-600 whitespace-nowrap">
        {nota.numero_nota || '—'}
        {nota.serie_nota && <span className="text-gray-400"> / {nota.serie_nota}</span>}
      </td>
      <td className="py-1.5 px-3 text-gray-900">{nota.emissor || '—'}</td>
      <td className="py-1.5 px-3 text-gray-600">{formatarData(nota.data_emissao)}</td>
      <td className="py-1.5 px-3">
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
        <td className="py-1.5 px-3">
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
      <td className="py-1.5 pl-3 pr-5 text-right">
        <div className="flex items-center justify-end gap-1">
          {/* Spinner no lugar do ícone enquanto baixa — antes não tinha
              nenhum retorno visual entre o clique e o arquivo aparecer. */}
          <button
            type="button"
            title="Baixar PDF"
            onClick={onBaixarPdf}
            disabled={baixandoPdf}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-primary-600 disabled:opacity-60 disabled:hover:bg-transparent"
          >
            {baixandoPdf ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
          </button>
          <button
            type="button"
            title="Baixar XML"
            onClick={onBaixar}
            disabled={baixandoXml}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-primary-600 disabled:opacity-60 disabled:hover:bg-transparent"
          >
            {baixandoXml ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
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

  // Aba de estado das notas (ver TABS_NOTAS) — sempre começa em "Novas
  // Notas". "Inativas" troca o dataset inteiro (endpoint próprio, mesmo
  // efeito que o antigo toggle "notas ativas/inativadas"); "Novas"/
  // "Cientes" filtram do lado do cliente o mesmo dataset de notas ativas
  // por `ciente_em` (ver filtrarNotasPorAba).
  const [abaNotas, setAbaNotas] = useState('novas');
  const modoInativas = abaNotas === 'inativas';

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
  // níveis começam sempre fechados. Chaves prefixadas com `abaNotas` (ver
  // TABS_NOTAS) — o mesmo certificado tem estado de aberto/fechado
  // independente em cada aba, já que Novas/Cientes/Inativas mostram um
  // recorte diferente das notas dele.
  const [abertos, setAbertos] = useState(new Set());
  // Nível 2 (Produtos/Serviços) — chave `${abaNotas}:${certificadoId}:produtos`
  // ou `...:servicos`, independente por certificado E por aba: dá pra abrir
  // só Produtos de um certificado e só Serviços de outro ao mesmo tempo, sem
  // vazar entre abas.
  const [secoesAbertas, setSecoesAbertas] = useState(new Set());

  function toggleAberto(certificadoId) {
    const chave = `${abaNotas}:${certificadoId}`;
    setAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) {
        next.delete(chave);
        // Fecha junto o nível 2 deste certificado (nesta aba), senão
        // reabrir o certificado depois já viria com Produtos/Serviços
        // expandidos.
        setSecoesAbertas((prevSecoes) => {
          const nextSecoes = new Set(prevSecoes);
          nextSecoes.delete(`${chave}:produtos`);
          nextSecoes.delete(`${chave}:servicos`);
          return nextSecoes;
        });
      } else {
        next.add(chave);
      }
      return next;
    });
  }

  function toggleSecao(certificadoId, tipo) {
    setSecoesAbertas((prev) => {
      const next = new Set(prev);
      const chave = `${abaNotas}:${certificadoId}:${tipo}`;
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  }
  const [reativandoLote, setReativandoLote] = useState(false);
  const [declarandoCiencia, setDeclarandoCiencia] = useState(false);
  const [desmarcandoCiencia, setDesmarcandoCiencia] = useState(false);

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

  // Entrar/sair da aba "Inativas" troca o dataset inteiro por certificado
  // (endpoint próprio) — zera notas em cache e seleção, mas mantém empresa,
  // datas e filtros exatamente como estavam. Só entre 'novas'/'cientes' não
  // passa por aqui: é o mesmo dataset, só muda o filtro do lado do cliente.
  useEffect(() => {
    setNotasPorCertificado({});
    setSelecionadas(new Map());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoInativas]);

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

  // Dois clusters (ver render): certificados COM nota no período primeiro,
  // os SEM nenhuma nota depois, separados por um divisor — quem tem algo
  // pra revisar não fica misturado/perdido entre quem não tem nada agora.
  // Um certificado cujas notas ainda não carregaram (notas == null) conta
  // como "com nota" até a resposta chegar, pra não pular de cluster na tela
  // se acabar dando vazio.
  const certificadosAgrupados = useMemo(() => {
    const comNotas = [];
    const semNotas = [];
    certificadosFiltrados.forEach((certificado) => {
      const dados = notasPorCertificado[certificado.id];
      if (dados == null) {
        comNotas.push(certificado);
        return;
      }
      const produtosVisiveis = filtrarNotasPorAba(dados.produtos, abaNotas, modoInativas);
      const servicosVisiveis = filtrarNotasPorAba(dados.servicos, abaNotas, modoInativas);
      const vazio = produtosVisiveis.length === 0 && servicosVisiveis.length === 0;
      (vazio ? semNotas : comNotas).push(certificado);
    });
    return { comNotas, semNotas };
  }, [certificadosFiltrados, notasPorCertificado, abaNotas, modoInativas]);

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

  // Filtro (data ou texto) mudou: o resultado por trás muda, então o que
  // estava aberto não corresponde mais ao que a tela vai mostrar — fecha
  // tudo em vez de deixar seção/certificado aberto com dado desatualizado.
  useEffect(() => {
    setAbertos(new Set());
    setSecoesAbertas(new Set());
  }, [dataInicio, dataFim, filtros]);

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

  // Baixando um arquivo por vez, por nota+tipo (`${nota.id}:xml` ou
  // `${nota.id}:pdf`) — antes não tinha nenhum retorno visual entre o
  // clique e o arquivo aparecer, e o usuário não sabia se o download
  // realmente disparou (ver LinhaNota, que troca o ícone por um spinner
  // enquanto a chave está neste Set).
  const [baixando, setBaixando] = useState(new Set());

  function marcarBaixando(chave, emAndamento) {
    setBaixando((prev) => {
      const next = new Set(prev);
      if (emAndamento) next.add(chave);
      else next.delete(chave);
      return next;
    });
  }

  async function handleDownload(nota) {
    const chave = `${nota.id}:xml`;
    marcarBaixando(chave, true);
    try {
      const blob = await baixarNotaEspiao(nota.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${nota.chave_acesso}.xml`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      await alert({
        title: 'Não foi possível baixar o XML',
        description: err.response?.data?.message || 'Não foi possível baixar o XML desta nota.',
        variant: 'warning',
      });
    } finally {
      marcarBaixando(chave, false);
    }
  }

  async function handleDownloadPdf(nota) {
    const chave = `${nota.id}:pdf`;
    marcarBaixando(chave, true);
    try {
      const blob = await baixarNotaPdfEspiao(nota.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${nota.chave_acesso}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      await alert({
        title: 'Não foi possível baixar o PDF',
        description: err.response?.data?.message || 'Não foi possível baixar o PDF desta nota.',
        variant: 'warning',
      });
    } finally {
      marcarBaixando(chave, false);
    }
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

  // Checkbox "selecionar todas" do cabeçalho de uma seção (ver
  // CabecalhoNotas) — se já estão todas marcadas, desmarca todas; senão,
  // marca as que faltam. Sempre olha pro estado atual (prev), não pro
  // `checked` que a UI calculou no último render, pra não perder cliques em
  // sequência rápida.
  function toggleTodasNaSecao(certificadoId, tipo, notasDaSecao) {
    setSelecionadas((prev) => {
      const next = new Map(prev);
      const todasSelecionadas = notasDaSecao.length > 0 && notasDaSecao.every((n) => next.has(n.id));
      notasDaSecao.forEach((nota) => {
        if (todasSelecionadas) next.delete(nota.id);
        else next.set(nota.id, { certificadoId, tipo });
      });
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

  // destino: 'novas' ou 'cientes' — escolha explícita de pra qual aba a
  // nota reativada vai (ver espiao.service.js::reativarNotas). Sempre some
  // da lista local de inativadas, já que esse dataset só existe aqui
  // enquanto a aba Inativas está aberta.
  async function handleReativarSelecionadas(destino) {
    if (selecionadas.size === 0) return;
    const notaIds = Array.from(selecionadas.keys());
    const nomeAba = destino === 'cientes' ? 'Cientes' : 'Novas Notas';
    const confirmado = await confirm({
      title: `Reativar para ${nomeAba}`,
      description: `${notaIds.length} nota(s) vão voltar a aparecer em "${nomeAba}".`,
      confirmLabel: 'Reativar',
    });
    if (!confirmado) return;

    setReativandoLote(true);
    try {
      await reativarNotasEspiao(notaIds, destino);

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
        description: `${notaIds.length} nota(s) reativada(s) para "${nomeAba}".`,
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

  // Desfaz a ciência das notas selecionadas — voltam a aparecer em "Novas
  // Notas". Continua na aba Cientes (não muda de aba), mesma lógica de
  // handleDeclararCiencia: quem processa em lote quer seguir na mesma tela.
  async function handleVoltarParaNovas() {
    if (selecionadas.size === 0) return;
    const notaIds = Array.from(selecionadas.keys());
    const confirmado = await confirm({
      title: 'Voltar para Novas Notas',
      description: `${notaIds.length} nota(s) vão voltar a aparecer em "Novas Notas".`,
      confirmLabel: 'Voltar',
    });
    if (!confirmado) return;

    setDesmarcandoCiencia(true);
    try {
      await desmarcarCienciaEspiao(notaIds);

      setNotasPorCertificado((prev) => {
        const next = { ...prev };
        selecionadas.forEach(({ certificadoId }, notaId) => {
          const dados = next[certificadoId];
          if (!dados) return;
          const desmarcar = (lista) => lista.map((n) => (n.id === notaId ? { ...n, ciente_em: null } : n));
          next[certificadoId] = { produtos: desmarcar(dados.produtos), servicos: desmarcar(dados.servicos) };
        });
        return next;
      });

      await alert({
        title: 'Notas movidas',
        description: `${notaIds.length} nota(s) voltaram para "Novas Notas".`,
        variant: 'default',
      });

      limparSelecao();
    } catch (err) {
      await alert({
        title: 'Não foi possível mover as notas',
        description: err.response?.data?.message || 'Não foi possível mover as notas selecionadas para Novas Notas.',
        variant: 'warning',
      });
    } finally {
      setDesmarcandoCiencia(false);
    }
  }

  // Marca as notas selecionadas como cientes — saem da aba "Novas" e passam
  // a aparecer em "Cientes" (ver TABS_NOTAS/filtrarNotasPorAba). Diferente
  // de inativar: a nota continua na tela comum, só muda de aba; por isso
  // não some da lista local, só ganha `ciente_em`.
  async function handleDeclararCiencia() {
    if (selecionadas.size === 0) return;
    const notaIds = Array.from(selecionadas.keys());
    const confirmado = await confirm({
      title: 'Declarar ciência das notas selecionadas',
      description: `${notaIds.length} nota(s) vão passar da aba "Novas" para "Cientes".`,
      confirmLabel: 'Declarar ciência',
    });
    if (!confirmado) return;

    setDeclarandoCiencia(true);
    try {
      const notas = await declararCienciaEspiao(notaIds);
      const cienteEmPorId = new Map(notas.map((n) => [n.id, n.ciente_em]));

      setNotasPorCertificado((prev) => {
        const next = { ...prev };
        selecionadas.forEach(({ certificadoId }, notaId) => {
          const dados = next[certificadoId];
          if (!dados || !cienteEmPorId.has(notaId)) return;
          const marcar = (lista) =>
            lista.map((n) => (n.id === notaId ? { ...n, ciente_em: cienteEmPorId.get(notaId) } : n));
          next[certificadoId] = { produtos: marcar(dados.produtos), servicos: marcar(dados.servicos) };
        });
        return next;
      });

      // Fica em Novas Notas (não troca de aba) — quem está processando um
      // lote quer continuar na mesma tela pra seguir com o resto da lista.
      await alert({
        title: 'Ciência declarada',
        description: `${notaIds.length} nota(s) marcada(s) como ciente.`,
        variant: 'default',
      });

      limparSelecao();
    } catch (err) {
      await alert({
        title: 'Não foi possível declarar ciência',
        description: err.response?.data?.message || 'Não foi possível declarar ciência das notas selecionadas.',
        variant: 'warning',
      });
    } finally {
      setDeclarandoCiencia(false);
    }
  }

  // Checkbox + Nº/Série + Emissor + Emissão + Situação + [Inativada por] +
  // Ações — quantas colunas a tabela única tem, pro colSpan das linhas de
  // seção (certificado, Produtos, Serviços).
  const totalColunas = modoInativas ? 7 : 6;

  // A caixa "Sem nota no período" só faz sentido em "Novas Notas" — é onde
  // se quer saber quais certificados não têm nada de novo pra revisar. Nas
  // outras abas, um certificado sem nenhuma nota que bata com o filtro
  // simplesmente não aparece (nem na Caixa 1 nem numa Caixa 2).
  const mostrarCaixaSemNotas = abaNotas === 'novas' && certificadosAgrupados.semNotas.length > 0;
  const nadaNestaAba = certificadosAgrupados.comNotas.length === 0 && !mostrarCaixaSemNotas;

  // Extraído do JSX (era um .map() inline) pra poder ser chamado duas vezes
  // — uma pro cluster "com nota", outra pro cluster "sem nota" (ver
  // certificadosAgrupados e o render da tabela) — sem duplicar todo esse
  // bloco.
  function renderCertificado(certificado) {
    const vencido = estaVencido(certificado.validade_ate);
    const notas = notasPorCertificado[certificado.id];
    // 'novas'/'cientes' filtram o MESMO dataset de notas ativas por
    // ciente_em (ver filtrarNotasPorAba); 'inativas' já veio como um
    // dataset totalmente à parte, então passa direto.
    const produtosVisiveis = notas ? filtrarNotasPorAba(notas.produtos, abaNotas, modoInativas) : null;
    const servicosVisiveis = notas ? filtrarNotasPorAba(notas.servicos, abaNotas, modoInativas) : null;
    const carregandoNotas = Boolean(loadingNotas[certificado.id]);
    const emConsulta = Boolean(consultando[certificado.id]);
    const aberto = abertos.has(`${abaNotas}:${certificado.id}`);
    const produtosAberto = secoesAbertas.has(`${abaNotas}:${certificado.id}:produtos`);
    const servicosAberto = secoesAbertas.has(`${abaNotas}:${certificado.id}:servicos`);
    // Enquanto ainda não carregou, mostra "…" em vez de um
    // número errado.
    const totalNfeCard = produtosVisiveis ? produtosVisiveis.length : null;
    const totalNfseCard = servicosVisiveis ? servicosVisiveis.length : null;
    // Sem nenhuma nota (já carregado e os dois totais deram
    // zero) — não faz sentido oferecer o "+", não tem nada
    // pra mostrar dentro.
    const semNotas = notas != null && totalNfeCard === 0 && totalNfseCard === 0;
    // "Vence em breve" é um aviso mais cedo que o vermelho
    // de vencido — mesma info (validade_ate) que já existe,
    // só avisando com antecedência em vez de só quando já
    // venceu.
    const diasVencimento = diasParaVencer(certificado.validade_ate);
    const vencendoEmBreve = !vencido && diasVencimento !== null && diasVencimento <= DIAS_AVISO_VENCIMENTO;

    return (
      <tbody key={certificado.id}>
        {/* Aberto usa bg-primary-50 (azul clarinho) nas abas Novas Notas/
            Cientes; na aba Inativas usa bg-gray-100 — mesmo tom neutro do
            nível aberto em Gestão das Parcelas (pedido do usuário: "as
            cores quando os níveis abrem na gestão de parcelas"), já que ali
            o cinza marca "arquivado", não "ativo". `vencido` (certificado
            expirado) sempre vence os dois, em qualquer aba. */}
        <tr className={vencido ? 'bg-red-50' : aberto ? (modoInativas ? 'bg-gray-100' : 'bg-primary-50') : 'bg-white'}>
          <td colSpan={totalColunas} className="px-5 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {/* Fechado por padrão (ver `abertos` — começa
                  vazio) — as notas já estão carregadas de
                  qualquer jeito, abrir só mostra as linhas.
                  Mesmo tamanho do "+" do nível 2 (Produtos/
                  Serviços, h-4 w-4, ícone 10) — os dois níveis
                  usam o mesmo padrão de botão agora. */}
              {semNotas ? (
                <span className="h-4 w-4 shrink-0" />
              ) : (
                <button
                  type="button"
                  onClick={() => toggleAberto(certificado.id)}
                  title={aberto ? 'Recolher' : 'Expandir'}
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600"
                >
                  {aberto ? <Minus size={10} /> : <Plus size={10} />}
                </button>
              )}

              <p className="text-sm text-gray-900">{certificado.nome}</p>

              {/* Canto direito: 5 colunas de largura FIXA (vencimento,
                  produtos, serviços, última consulta, ação) — cada uma
                  sempre ocupa o mesmo espaço e centraliza o conteúdo,
                  mesmo quando o status não se aplica (fica vazia, mas com a
                  largura reservada) ou quando o número muda de 1 pra 2
                  dígitos. Sem isso, produtos/serviços "andavam" pra
                  esquerda/direita de uma linha pra outra, porque cada
                  badge só tinha a largura do próprio conteúdo. */}
              <div className="ml-auto grid shrink-0 grid-cols-[140px_56px_56px_130px_170px] items-center gap-2">
                <div className="flex justify-center">
                  {vencendoEmBreve && (
                    <span
                      title={`Certificado vence em ${diasVencimento} dia${diasVencimento !== 1 ? 's' : ''}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700"
                    >
                      <Clock size={12} />
                      Vence em {diasVencimento} dia{diasVencimento !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="flex justify-center">
                  <span
                    title={`${totalNfeCard === null ? '…' : totalNfeCard} produto${totalNfeCard !== 1 ? 's' : ''} (NF-e)`}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      totalNfeCard ? 'bg-primary-100 text-primary-700' : 'text-primary-200'
                    }`}
                  >
                    <Package size={12} />
                    {totalNfeCard === null ? '…' : totalNfeCard}
                  </span>
                </div>
                <div className="flex justify-center">
                  <span
                    title={`${totalNfseCard === null ? '…' : totalNfseCard} serviço${totalNfseCard !== 1 ? 's' : ''} (NFS-e)`}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      totalNfseCard ? 'bg-violet-100 text-violet-700' : 'text-violet-200'
                    }`}
                  >
                    <Wrench size={12} />
                    {totalNfseCard === null ? '…' : totalNfseCard}
                  </span>
                </div>

                <div className="flex justify-center">
                  {!modoInativas && certificado.ultima_consulta_em && (
                    <span
                      title={`Última consulta: ${formatarDataHora(certificado.ultima_consulta_em)}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600"
                    >
                      <Clock size={12} />
                      {formatarTempoRelativo(certificado.ultima_consulta_em)}
                    </span>
                  )}
                </div>

                <div className="flex justify-center">
                  {vencido ? (
                    <span
                      title="Certificado vencido — não é possível consultar novas notas com ele"
                      className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      <AlertTriangle size={12} />
                      Certificado vencido
                    </span>
                  ) : abaNotas !== 'novas' ? null : certificado.ultima_consulta_em ? (
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
                GestaoParcelasTab.jsx, mesmo tamanho de botão
                também: h-4 w-4, ícone 10). Só existe quando tem
                pelo menos 1 produto (sem nenhum, não precisa
                mostrar a linha em vão). Mesma cor do nível 1 quando
                aberta (primary-50 nas abas Novas/Cientes, gray-100 em
                Inativas — ver renderCertificado) — border-t marca a
                virada de nível. Só o botão "+/−" abre/fecha (a
                linha inteira não é mais clicável, igual ao
                nível 1). */}
            {totalNfeCard > 0 && (
              <>
                <tr
                  className={`border-t border-t-gray-200 border-b border-b-gray-50 ${
                    produtosAberto ? (modoInativas ? 'bg-gray-100' : 'bg-primary-50') : 'bg-white'
                  }`}
                >
                  <td colSpan={totalColunas} className="py-2 pl-9 pr-5">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500">
                      <button
                        type="button"
                        onClick={() => toggleSecao(certificado.id, 'produtos')}
                        title={produtosAberto ? 'Recolher' : 'Expandir'}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600"
                      >
                        {produtosAberto ? <Minus size={10} /> : <Plus size={10} />}
                      </button>
                      <Package size={13} />
                      Produtos (NF-e) · {totalNfeCard}
                    </span>
                  </td>
                </tr>
                {produtosAberto && (
                  <>
                    <CabecalhoNotas
                      modoInativas={modoInativas}
                      checked={produtosVisiveis.every((n) => selecionadas.has(n.id))}
                      indeterminate={
                        produtosVisiveis.some((n) => selecionadas.has(n.id)) &&
                        !produtosVisiveis.every((n) => selecionadas.has(n.id))
                      }
                      onToggleTodas={() => toggleTodasNaSecao(certificado.id, 'produtos', produtosVisiveis)}
                    />
                    {produtosVisiveis.map((nota) => (
                      <LinhaNota
                        key={nota.id}
                        nota={nota}
                        modoInativas={modoInativas}
                        selecionada={selecionadas.has(nota.id)}
                        onToggleSelecionada={() => toggleSelecionada(certificado.id, 'produtos', nota)}
                        onBaixarPdf={() => handleDownloadPdf(nota)}
                        onBaixar={() => handleDownload(nota)}
                        baixandoPdf={baixando.has(`${nota.id}:pdf`)}
                        baixandoXml={baixando.has(`${nota.id}:xml`)}
                      />
                    ))}
                  </>
                )}
              </>
            )}

            {/* Nível 2: linha de Serviços, independente da de
                Produtos acima (cada uma com seu próprio estado
                em secoesAbertas) — mesma regra: só existe quando
                tem pelo menos 1 serviço. */}
            {totalNfseCard > 0 && (
              <>
                <tr
                  className={`border-t border-t-gray-100 border-b border-b-gray-50 ${
                    servicosAberto ? (modoInativas ? 'bg-gray-100' : 'bg-primary-50') : 'bg-white'
                  }`}
                >
                  <td colSpan={totalColunas} className="py-2 pl-9 pr-5">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500">
                      <button
                        type="button"
                        onClick={() => toggleSecao(certificado.id, 'servicos')}
                        title={servicosAberto ? 'Recolher' : 'Expandir'}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600"
                      >
                        {servicosAberto ? <Minus size={10} /> : <Plus size={10} />}
                      </button>
                      <Wrench size={13} />
                      Serviços (NFS-e) · {totalNfseCard}
                    </span>
                  </td>
                </tr>
                {servicosAberto && (
                  <>
                    <CabecalhoNotas
                      modoInativas={modoInativas}
                      checked={servicosVisiveis.every((n) => selecionadas.has(n.id))}
                      indeterminate={
                        servicosVisiveis.some((n) => selecionadas.has(n.id)) &&
                        !servicosVisiveis.every((n) => selecionadas.has(n.id))
                      }
                      onToggleTodas={() => toggleTodasNaSecao(certificado.id, 'servicos', servicosVisiveis)}
                    />
                    {servicosVisiveis.map((nota) => (
                      <LinhaNota
                        key={nota.id}
                        nota={nota}
                        modoInativas={modoInativas}
                        selecionada={selecionadas.has(nota.id)}
                        onToggleSelecionada={() => toggleSelecionada(certificado.id, 'servicos', nota)}
                        onBaixarPdf={() => handleDownloadPdf(nota)}
                        onBaixar={() => handleDownload(nota)}
                        baixandoPdf={baixando.has(`${nota.id}:pdf`)}
                        baixandoXml={baixando.has(`${nota.id}:xml`)}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </tbody>
    );
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
            ) : nadaNestaAba ? (
              <Card className="rounded-tl-none">
                <p className="py-8 text-center text-sm text-gray-400">
                  {modoInativas
                    ? 'Nenhuma nota inativada no período selecionado.'
                    : abaNotas === 'cientes'
                    ? 'Nenhuma nota ciente no período selecionado.'
                    : 'Nenhum certificado tem nota no período selecionado.'}
                </p>
              </Card>
            ) : (
              <>
                {/* Caixa 1: certificados com nota no período — o drilldown
                    de 3 níveis de sempre (mesmo espírito de
                    GestaoParcelasTab.jsx: cada nível é mais uma <tr>, só
                    com mais recuo, nunca uma tabela aninhada à parte, e
                    cada nível com seu próprio "+/−"): Certificado → Produtos/
                    Serviços → Nota. Sem <thead> fixo — o cabeçalho de
                    coluna (CabecalhoNotas) só existe logo acima das notas.
                    Só aparece quando tem pelo menos 1 certificado com nota;
                    senão a Caixa 2 (só em Novas Notas, ver
                    mostrarCaixaSemNotas) já cobre a tela sozinha. */}
                {certificadosAgrupados.comNotas.length > 0 && (
                  <Card className="rounded-tl-none !p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
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

                        {certificadosAgrupados.comNotas.map(renderCertificado)}
                      </table>
                    </div>
                  </Card>
                )}

                {/* Caixa 2: só na aba Novas Notas (ver mostrarCaixaSemNotas)
                    — nas outras abas, um certificado sem nota que bata com
                    o filtro simplesmente não aparece em lugar nenhum.
                    rounded-tl-none só quando é a única caixa na tela (Caixa
                    1 vazia); senão leva mt-4 pra abrir vão da Caixa 1, já
                    que o wrapper delas (ver comentário "Tabs + conteúdo"
                    acima) não tem espaçamento automático entre os filhos. */}
                {mostrarCaixaSemNotas && (
                  <Card
                    className={`!p-0 overflow-hidden ${
                      certificadosAgrupados.comNotas.length === 0 ? 'rounded-tl-none' : 'mt-4'
                    }`}
                  >
                    <div className="border-b border-gray-100 px-5 py-3 text-xs font-medium text-gray-400">
                      Sem nota no período selecionado · {certificadosAgrupados.semNotas.length} certificado
                      {certificadosAgrupados.semNotas.length !== 1 ? 's' : ''}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">{certificadosAgrupados.semNotas.map(renderCertificado)}</table>
                    </div>
                  </Card>
                )}
              </>
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
              <>
                <Button
                  className="!border-primary-600 !bg-primary-600 !text-white hover:!bg-primary-700"
                  loading={reativandoLote}
                  onClick={() => handleReativarSelecionadas('novas')}
                >
                  <RotateCcw size={15} />
                  Reativar p/ Novas
                </Button>
                <Button
                  className="!border-emerald-600 !bg-emerald-600 !text-white hover:!bg-emerald-700"
                  loading={reativandoLote}
                  onClick={() => handleReativarSelecionadas('cientes')}
                >
                  <RotateCcw size={15} />
                  Reativar p/ Cientes
                </Button>
              </>
            ) : abaNotas === 'cientes' ? (
              <>
                <Button
                  className="!border-primary-600 !bg-primary-600 !text-white hover:!bg-primary-700"
                  loading={desmarcandoCiencia}
                  onClick={handleVoltarParaNovas}
                >
                  <RotateCcw size={15} />
                  Voltar p/ Novas
                </Button>
                <Button variant="danger" onClick={() => setModalInativar(true)}>
                  <Ban size={15} />
                  Inativar
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="!border-emerald-600 !bg-emerald-600 !text-white hover:!bg-emerald-700"
                  loading={declarandoCiencia}
                  onClick={handleDeclararCiencia}
                >
                  <CheckCircle size={15} />
                  Declarar Ciência
                </Button>
                <Button variant="danger" onClick={() => setModalInativar(true)}>
                  <Ban size={15} />
                  Inativar
                </Button>
              </>
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
