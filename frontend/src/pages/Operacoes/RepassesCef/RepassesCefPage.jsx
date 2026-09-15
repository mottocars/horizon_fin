import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CalendarCheck,
  Clock,
  Download,
  FileText,
  Hash,
  History,
  LayoutGrid,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  User,
} from 'lucide-react';
import Card from '../../../components/Card';
import SearchableSelect from '../../../components/SearchableSelect';
import Tabs from '../../../components/Tabs';
import { listEmpresas } from '../../../api/empresas.api';
import {
  listCentrosRepassesCef,
  sincronizarReservasRepassesCef,
  listReservasRepassesCef,
  getCoresReservaRepassesCef,
  sincronizarContratosRepassesCef,
  listContratosRepassesCef,
  listAssinaturasRepassesCef,
  listRegistrosRepassesCef,
  getStatusSincronizacaoRepassesCef,
  getUltimasAtualizacoesRepassesCef,
  exportarRepassesCefExcel,
} from '../../../api/repassesCef.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { MACRO_ETAPAS_REPASSES } from '../../../config/macroEtapasRepasses';
import ConfigurarFiltrosModal from './ConfigurarFiltrosModal';
import AtualizacaoLogModal from './AtualizacaoLogModal';
import HistoricoEtapasModal from './HistoricoEtapasModal';
import MascarasRepassesCef from './MascarasRepassesCef';

// Lista de abas da tela. Pra adicionar uma aba nova no futuro basta incluir
// um item aqui `{ id, label, icon }` e o caso correspondente no bloco de
// conteúdo do return.
const TABS = [
  { id: 'kanban', label: 'Kanban', icon: LayoutGrid },
  { id: 'mascaras', label: 'Máscaras', icon: SlidersHorizontal },
];

const LOGO_SIENGE = MACRO_ETAPAS_REPASSES.find((m) => m.value === 'CONTRATO').logo;
const LOGO_CONSTRUTOR_VENDAS = MACRO_ETAPAS_REPASSES.find((m) => m.value === 'VENDA').logo;

// Uma mensagem "não possui uma integração ... ativa configurada" vinda do
// backend não é um erro de verdade — é só a empresa não ter aquela
// integração configurada ainda. Detecta esse caso pra mostrar um estado
// informativo no log, em vez de vermelho de erro.
function ehErroDeIntegracaoAusente(mensagem) {
  return /não possui uma integração .* ativa configurada/i.test(mensagem || '');
}

export default function RepassesCefPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');

  // Kanban começa selecionada — é a visão principal da tela.
  const [abaAtiva, setAbaAtiva] = useState('kanban');

  const [centros, setCentros] = useState([]);
  const [loadingCentros, setLoadingCentros] = useState(false);
  const [centroCustoIds, setCentroCustoIds] = useState([]);
  const [busca, setBusca] = useState('');
  // Combobox de seleção única "Detalhes" (Sim/Não) — controla se os cards
  // mostram código/número/datas ou só o essencial (empreendimento, cliente,
  // status). `clearable={false}` no SearchableSelect garante que sempre tem
  // um valor selecionado.
  const [detalhes, setDetalhes] = useState('sim');
  const mostrarDetalhes = detalhes === 'sim';

  const [reservas, setReservas] = useState([]);
  const [loadingReservas, setLoadingReservas] = useState(false);
  const [cores, setCores] = useState({ tipovenda: {}, situacao: {} });

  const [contratos, setContratos] = useState([]);
  const [loadingContratos, setLoadingContratos] = useState(false);

  const [assinaturas, setAssinaturas] = useState([]);
  const [loadingAssinaturas, setLoadingAssinaturas] = useState(false);

  const [registros, setRegistros] = useState([]);
  const [loadingRegistros, setLoadingRegistros] = useState(false);

  const [ultimasAtualizacoes, setUltimasAtualizacoes] = useState({});

  const [atualizando, setAtualizando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [modalFiltrosAberto, setModalFiltrosAberto] = useState(false);
  const [modalLogAberto, setModalLogAberto] = useState(false);
  const [logsAtualizacao, setLogsAtualizacao] = useState([]);
  // { tipo: 'reserva'|'contrato'|'assinatura'|'registro', id } — id é o
  // idreserva, sienge_contract_id ou extrato_unidades.id conforme o tipo
  // (ver HistoricoEtapasModal.jsx e getHistoricoEtapas no backend).
  const [historicoAberto, setHistoricoAberto] = useState(null);

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  // Administrador é restrito à própria empresa — o seletor já vem
  // preenchido com ela e travado.
  useEffect(() => {
    if (empresaTravada && empresaIdTravada) setEmpresaId(empresaIdTravada);
  }, [empresaTravada, empresaIdTravada]);

  // Só entram no filtro os centros de custo que já têm a etapa "Lançamento"
  // (Histórico de Etapas) com data informada — mesmo critério da Curva de
  // Vendas/Obras.
  const loadCentros = useCallback(() => {
    if (!empresaId) {
      setCentros([]);
      return Promise.resolve();
    }
    setLoadingCentros(true);
    return listCentrosRepassesCef(empresaId)
      .then(setCentros)
      .finally(() => setLoadingCentros(false));
  }, [empresaId]);

  // Reservas já salvas localmente (puxadas do Construtor de Vendas na
  // última sincronização) — alimentam o bucket "Reserva" do kanban. O filtro
  // de Centro de Custo é aplicado direto na consulta (via
  // codigo_construtor_vendas ↔ codigointerno_empreendimento no backend).
  const loadReservas = useCallback(() => {
    if (!empresaId) {
      setReservas([]);
      return Promise.resolve();
    }
    setLoadingReservas(true);
    return listReservasRepassesCef(empresaId, centroCustoIds)
      .then(setReservas)
      .finally(() => setLoadingReservas(false));
  }, [empresaId, centroCustoIds]);

  // Cores escolhidas em "Configurar Filtros de Visualização" pra cada valor
  // de tipo de venda/situação — usadas nos badges do card.
  const loadCores = useCallback(() => {
    if (!empresaId) {
      setCores({ tipovenda: {}, situacao: {} });
      return Promise.resolve();
    }
    return getCoresReservaRepassesCef(empresaId).then(setCores);
  }, [empresaId]);

  // Contratos já salvos localmente (puxados do Sienge na última
  // sincronização) — alimentam o bucket "Contrato" do kanban. O filtro de
  // Centro de Custo é aplicado direto na consulta (aqui a ligação é direta:
  // centros_custo_sienge.sienge_id É o enterprise_id do contrato, sem
  // indireção nenhuma, diferente das reservas).
  const loadContratos = useCallback(() => {
    if (!empresaId) {
      setContratos([]);
      return Promise.resolve();
    }
    setLoadingContratos(true);
    return listContratosRepassesCef(empresaId, centroCustoIds)
      .then(setContratos)
      .finally(() => setLoadingContratos(false));
  }, [empresaId, centroCustoIds]);

  // Unidades assinadas (extrato_unidades, importada manualmente na tela
  // Extrato — sem sincronização própria por API) — alimentam o bucket
  // "Assinatura" do kanban. O filtro de Centro de Custo é aplicado direto na
  // consulta (via codigo_contrato_caixa ↔ contrato_empreendimento no backend).
  const loadAssinaturas = useCallback(() => {
    if (!empresaId) {
      setAssinaturas([]);
      return Promise.resolve();
    }
    setLoadingAssinaturas(true);
    return listAssinaturasRepassesCef(empresaId, centroCustoIds)
      .then(setAssinaturas)
      .finally(() => setLoadingAssinaturas(false));
  }, [empresaId, centroCustoIds]);

  // Unidades já registradas (mesma extrato_unidades, mas com
  // data_inclusao_dados_registro_cri preenchida) — alimentam o bucket
  // "Registro" do kanban. Nunca aparece a mesma unidade nos dois buckets ao
  // mesmo tempo (ver listUnidadesExtrato no backend).
  const loadRegistros = useCallback(() => {
    if (!empresaId) {
      setRegistros([]);
      return Promise.resolve();
    }
    setLoadingRegistros(true);
    return listRegistrosRepassesCef(empresaId, centroCustoIds)
      .then(setRegistros)
      .finally(() => setLoadingRegistros(false));
  }, [empresaId, centroCustoIds]);

  // Data/hora da última atualização de cada bucket, mostrada discretamente
  // embaixo do título no Kanban.
  const loadUltimasAtualizacoes = useCallback(() => {
    if (!empresaId) {
      setUltimasAtualizacoes({});
      return Promise.resolve();
    }
    return getUltimasAtualizacoesRepassesCef(empresaId, centroCustoIds).then(setUltimasAtualizacoes);
  }, [empresaId, centroCustoIds]);

  useEffect(() => {
    setCentroCustoIds([]);
    setBusca('');
    loadCentros();
    loadCores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // Recarrega reservas, contratos, assinaturas e registros sempre que o
  // filtro de Centro de Custo mudar (e também na primeira carga, quando a
  // empresa muda e o filtro zera).
  useEffect(() => {
    loadReservas();
    loadContratos();
    loadAssinaturas();
    loadRegistros();
    loadUltimasAtualizacoes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, centroCustoIds]);

  // Puxa as reservas de verdade da API do Construtor de Vendas (CVCRM) e os
  // contratos da API do Sienge, substituindo tudo que já estava salvo pra
  // essa empresa — nunca duplica, porque o backend apaga e reinsere a cada
  // chamada. Assinatura/Registro não têm sincronização própria (vêm do
  // módulo Extrato), só recarregam o que já está salvo. Cada integração
  // sincroniza de forma independente (uma pode não estar configurada sem
  // travar a outra) e o progresso de cada uma aparece no log de atualização.
  async function handleAtualizar() {
    setAtualizando(true);
    setLogsAtualizacao([
      { chave: 'sienge', logo: LOGO_SIENGE, integracaoNome: 'Sienge — Contratos', status: 'carregando' },
      {
        chave: 'cvcrm',
        logo: LOGO_CONSTRUTOR_VENDAS,
        integracaoNome: 'Construtor de Vendas — Reservas',
        status: 'carregando',
      },
    ]);
    setModalLogAberto(true);

    // Enquanto sincroniza, faz polling no status (página atual/total de
    // cada integração) pra desenhar a barra de progresso — a sincronização
    // roda dentro do próprio POST (não é um job em background), mas o
    // backend guarda o progresso em memória entre uma página e outra, então
    // dá pra consultar em paralelo.
    const intervaloProgresso = setInterval(() => {
      getStatusSincronizacaoRepassesCef(empresaId)
        .then((status) => {
          setLogsAtualizacao((prev) =>
            prev.map((log) => {
              if (log.status !== 'carregando') return log;
              const p = status[log.chave];
              return p ? { ...log, paginaAtual: p.paginaAtual, totalPaginas: p.totalPaginas } : log;
            })
          );
        })
        .catch(() => {});
    }, 700);

    const atualizarEtapa = async (chave, sincronizar) => {
      try {
        const resultado = await sincronizar();
        setLogsAtualizacao((prev) =>
          prev.map((log) =>
            log.chave === chave
              ? { ...log, status: 'sucesso', total: resultado.total_importado, paginaAtual: undefined }
              : log
          )
        );
      } catch (err) {
        const mensagem = err.response?.data?.message || 'Não foi possível sincronizar.';
        setLogsAtualizacao((prev) =>
          prev.map((log) =>
            log.chave === chave
              ? {
                  ...log,
                  status: ehErroDeIntegracaoAusente(mensagem) ? 'nao_integrado' : 'erro',
                  mensagem,
                  paginaAtual: undefined,
                }
              : log
          )
        );
      }
    };

    await Promise.all([
      atualizarEtapa('sienge', () => sincronizarContratosRepassesCef(empresaId)),
      atualizarEtapa('cvcrm', () => sincronizarReservasRepassesCef(empresaId)),
    ]);
    clearInterval(intervaloProgresso);

    await Promise.all([
      loadCentros(),
      loadReservas(),
      loadContratos(),
      loadAssinaturas(),
      loadRegistros(),
      loadUltimasAtualizacoes(),
    ]);
    setAtualizando(false);
  }

  // Exporta os 4 buckets num Excel único e empilhado (uma linha por
  // cartão, coluna "Bucket" identificando a etapa) — respeita o mesmo
  // filtro de Centro de Custo aplicado na tela (a busca livre por texto é
  // só um filtro visual do frontend, não entra no arquivo).
  async function handleExportar() {
    setExportando(true);
    try {
      const blob = await exportarRepassesCefExcel(empresaId, centroCustoIds);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `repasses-cef-empresa-${empresaId}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  }

  // Busca livre por cliente, código da reserva ou número do contrato —
  // filtra em cima do que já foi carregado (sem ida ao backend), tanto no
  // bucket Reserva quanto no Contrato. Ignora acento e maiúsculas/minúsculas.
  const normalizar = (texto) =>
    (texto ?? '')
      .toString()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();

  const buscaNormalizada = useMemo(() => normalizar(busca.trim()), [busca]);

  const reservasFiltradas = useMemo(() => {
    if (!buscaNormalizada) return reservas;
    return reservas.filter(
      (r) =>
        normalizar(r.titular_nome).includes(buscaNormalizada) ||
        normalizar(r.idreserva).includes(buscaNormalizada)
    );
  }, [reservas, buscaNormalizada]);

  const contratosFiltrados = useMemo(() => {
    if (!buscaNormalizada) return contratos;
    return contratos.filter(
      (c) =>
        normalizar(c.titular_nome).includes(buscaNormalizada) ||
        normalizar(c.idreserva).includes(buscaNormalizada) ||
        normalizar(c.number).includes(buscaNormalizada)
    );
  }, [contratos, buscaNormalizada]);

  const assinaturasFiltradas = useMemo(() => {
    if (!buscaNormalizada) return assinaturas;
    return assinaturas.filter(
      (a) =>
        normalizar(a.titular_nome).includes(buscaNormalizada) ||
        normalizar(a.numero_contrato_unidade).includes(buscaNormalizada)
    );
  }, [assinaturas, buscaNormalizada]);

  const registrosFiltrados = useMemo(() => {
    if (!buscaNormalizada) return registros;
    return registros.filter(
      (r) =>
        normalizar(r.titular_nome).includes(buscaNormalizada) ||
        normalizar(r.numero_contrato_unidade).includes(buscaNormalizada)
    );
  }, [registros, buscaNormalizada]);

  return (
    <div className="flex h-full flex-col gap-4">
      <Card className="shrink-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
            <SearchableSelect
              value={empresaId}
              onChange={setEmpresaId}
              disabled={loadingEmpresas || empresaTravada}
              options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
              placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
              emptyMessage="Nenhuma empresa encontrada."
            />
          </div>

          {/* Filtros e ações do Kanban — só fazem sentido nessa aba, então
              somem quando a aba Máscaras está ativa (ela só usa Empresa). */}
          {abaAtiva === 'kanban' && (
            <>
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Centro de Custo</label>
                <SearchableSelect
                  multiple
                  value={centroCustoIds}
                  onChange={setCentroCustoIds}
                  disabled={!empresaId || loadingCentros}
                  options={centros.map((centro) => ({ value: centro.sienge_id, label: centro.name }))}
                  placeholder={
                    !empresaId
                      ? 'Selecione a empresa primeiro'
                      : loadingCentros
                        ? 'Carregando centros de custo...'
                        : centros.length === 0
                          ? 'Nenhum centro com Lançamento cadastrado'
                          : 'Todos os centros de custo'
                  }
                  emptyMessage="Nenhum centro de custo encontrado."
                />
              </div>

              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    disabled={!empresaId}
                    className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>

              <div className="flex shrink-0 items-end gap-2">
                <div className="w-32">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Detalhes</label>
                  <SearchableSelect
                    clearable={false}
                    value={detalhes}
                    onChange={setDetalhes}
                    options={[
                      { value: 'sim', label: 'Sim' },
                      { value: 'nao', label: 'Não' },
                    ]}
                  />
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={handleAtualizar}
                    disabled={atualizando || !empresaId}
                    title="Atualizar dados desta tela"
                    className="flex items-center justify-center rounded-lg bg-primary-600 p-2 text-white hover:bg-primary-700 disabled:opacity-60"
                  >
                    <RefreshCw size={18} className={atualizando ? 'animate-spin' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={handleExportar}
                    disabled={exportando || !empresaId}
                    title="Exportar tudo que está na tela em Excel"
                    className="flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <Download size={18} className={exportando ? 'animate-pulse' : ''} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalFiltrosAberto(true)}
                    disabled={!empresaId}
                    title="Configurar filtros de visualização"
                    className="flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <Settings size={18} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      <ConfigurarFiltrosModal
        open={modalFiltrosAberto}
        onClose={() => setModalFiltrosAberto(false)}
        empresaId={empresaId}
        onFiltrosSalvos={() => {
          loadReservas();
          loadCores();
          loadContratos();
        }}
      />

      <AtualizacaoLogModal
        open={modalLogAberto}
        onClose={() => setModalLogAberto(false)}
        logs={logsAtualizacao}
      />

      <HistoricoEtapasModal
        open={Boolean(historicoAberto)}
        onClose={() => setHistoricoAberto(null)}
        empresaId={empresaId}
        identificador={historicoAberto}
        onSalvo={() => {
          // Também dispara ao registrar uma micro etapa manual (qualquer
          // bucket, inclusive Reserva) — recarrega os quatro pra mostrar a
          // "última etapa" nova no card sem precisar atualizar a tela.
          // Salvar o Nº Contrato Caixa, especificamente, liga o contrato a
          // uma unidade — o card pode sair do bucket Contrato e entrar em
          // Assinatura ou Registro (dependendo se essa unidade já tem data
          // de registro), então os quatro precisam recarregar mesmo aqui.
          loadReservas();
          loadContratos();
          loadAssinaturas();
          loadRegistros();
          loadUltimasAtualizacoes();
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <Tabs tabs={TABS} activeId={abaAtiva} onChange={setAbaAtiva} />

        {abaAtiva === 'kanban' &&
          (!empresaId ? (
            <Card className="shrink-0 rounded-tl-none">
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Building2 size={22} />
                </div>
                <p className="text-sm font-medium text-gray-700">
                  Selecione uma empresa para ver o kanban de repasses.
                </p>
              </div>
            </Card>
          ) : (
            // Um quadro geral só, encostado na aba (sem o "mt-4" que antes
            // deixava um vão entre a aba e o conteúdo) —
            // os 4 buckets do kanban viram seções internas dele, não mais
            // 4 cartões soltos com sombra própria cada um. Não usa o
            // componente <Card> (padding p-5 fixo) pra não desperdiçar altura
            // e largura em cima do buckets — mesmo visual (fundo branco,
            // cantos, sombra), só com padding mais enxuto (p-3).
            <div className="flex min-h-0 flex-1 flex-col rounded-card rounded-tl-none bg-white p-3 shadow-card">
              <KanbanRepasses
                reservas={reservasFiltradas}
                loadingReservas={loadingReservas}
                cores={cores}
                contratos={contratosFiltrados}
                loadingContratos={loadingContratos}
                assinaturas={assinaturasFiltradas}
                loadingAssinaturas={loadingAssinaturas}
                registros={registrosFiltrados}
                loadingRegistros={loadingRegistros}
                mostrarDetalhes={mostrarDetalhes}
                ultimasAtualizacoes={ultimasAtualizacoes}
                onAbrirHistorico={(tipo, id) => setHistoricoAberto({ tipo, id })}
              />
            </div>
          ))}

        {abaAtiva === 'mascaras' && (
          <Card className="rounded-tl-none">
            {!empresaId ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Building2 size={22} />
                </div>
                <p className="text-sm font-medium text-gray-700">
                  Selecione uma empresa para ver ou cadastrar a máscara.
                </p>
              </div>
            ) : (
              <MascarasRepassesCef empresaId={empresaId} />
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function KanbanRepasses({
  reservas,
  loadingReservas,
  cores,
  contratos,
  loadingContratos,
  assinaturas,
  loadingAssinaturas,
  registros,
  loadingRegistros,
  mostrarDetalhes,
  ultimasAtualizacoes,
  onAbrirHistorico,
}) {
  return (
    // Sem largura fixa nem overflow-x: cada bucket é `flex-1 min-w-0`, então
    // eles dividem igualmente a largura disponível e encolhem junto com a
    // tela (ou com o menu lateral abrindo/fechando) em vez de gerar barra de
    // rolagem horizontal. `min-h-0` na linha e em cada coluna é o que permite
    // a rolagem vertical ficar presa dentro de cada bucket (min-h-0 destrava
    // o encolhimento do flex item — sem isso ele cresce pra caber o conteúdo
    // inteiro e quem rola é a página toda, não o bucket). Cada bucket tem seu
    // próprio contorno azul (em vez de uma linha fina cinza, quase invisível
    // em fundo branco) — são seções de um quadro geral só (ver Card em
    // volta, no componente pai), mas com separação bem visível entre elas.
    <div className="flex min-h-0 flex-1 gap-3">
      {MACRO_ETAPAS_REPASSES.map((macro) => {
        // Os quatro buckets já têm base de dados real.
        const ehReserva = macro.value === 'VENDA';
        const ehContrato = macro.value === 'CONTRATO';
        const ehAssinatura = macro.value === 'ASSINATURA';
        const ehRegistro = macro.value === 'REGISTRO';
        const carregando =
          (ehReserva && loadingReservas) ||
          (ehContrato && loadingContratos) ||
          (ehAssinatura && loadingAssinaturas) ||
          (ehRegistro && loadingRegistros);
        const totalCartoes = ehReserva
          ? reservas.length
          : ehContrato
            ? contratos.length
            : ehAssinatura
              ? assinaturas.length
              : ehRegistro
                ? registros.length
                : 0;

        // Reserva/Contrato vêm da última sincronização (CVCRM/Sienge);
        // Assinatura e Registro compartilham a mesma fonte (extrato_empreendimentos,
        // upload manual) — ver getUltimasAtualizacoes no backend.
        const chaveAtualizacao = ehReserva
          ? 'reserva'
          : ehContrato
            ? 'contrato'
            : ehAssinatura
              ? 'assinatura'
              : ehRegistro
                ? 'registro'
                : null;
        const ultimaAtualizacao = chaveAtualizacao ? ultimasAtualizacoes?.[chaveAtualizacao] : null;

        return (
          <div
            key={macro.value}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-primary-200"
          >
            {/* cursor-pointer + hover só de propósito visual por enquanto —
                sem onClick ainda, é preparo pra uma ação futura no cabeçalho
                (ver pedido do usuário: "só indicar que é clicável"). */}
            <div className="flex shrink-0 cursor-pointer flex-col border-b border-primary-100 px-3 py-3 transition-colors hover:bg-primary-100">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{macro.label}</p>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                  {carregando ? '…' : totalCartoes}
                </span>
                <img
                  src={macro.logo}
                  alt={macro.integracaoNome}
                  title={macro.integracaoNome}
                  className="h-6 w-6 shrink-0 object-contain"
                />
              </div>
              {ultimaAtualizacao && (
                <p
                  className={`-mt-0.5 flex items-center gap-1 truncate text-[10px] ${
                    foiAtualizadoHoje(ultimaAtualizacao) ? 'text-gray-400' : 'font-medium text-red-600'
                  }`}
                >
                  {!foiAtualizadoHoje(ultimaAtualizacao) && <AlertTriangle size={10} className="shrink-0" />}
                  Atualizado em {formatarDataHora(ultimaAtualizacao)}
                </p>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3">
              {ehReserva && loadingReservas ? (
                <p className="py-8 text-center text-xs text-gray-400">Carregando reservas...</p>
              ) : ehReserva && reservas.length > 0 ? (
                reservas.map((reserva) => (
                  <ReservaCard
                    key={reserva.id}
                    reserva={reserva}
                    cores={cores}
                    mostrarDetalhes={mostrarDetalhes}
                    onClick={() => onAbrirHistorico('reserva', reserva.idreserva)}
                  />
                ))
              ) : ehContrato && loadingContratos ? (
                <p className="py-8 text-center text-xs text-gray-400">Carregando contratos...</p>
              ) : ehContrato && contratos.length > 0 ? (
                contratos.map((contrato) => (
                  <ContratoCard
                    key={contrato.sienge_contract_id}
                    contrato={contrato}
                    cores={cores}
                    mostrarDetalhes={mostrarDetalhes}
                    onClick={() => onAbrirHistorico('contrato', contrato.sienge_contract_id)}
                  />
                ))
              ) : ehAssinatura && loadingAssinaturas ? (
                <p className="py-8 text-center text-xs text-gray-400">Carregando assinaturas...</p>
              ) : ehAssinatura && assinaturas.length > 0 ? (
                assinaturas.map((assinatura) => (
                  <AssinaturaCard
                    key={assinatura.id}
                    assinatura={assinatura}
                    mostrarDetalhes={mostrarDetalhes}
                    onClick={() => onAbrirHistorico('assinatura', assinatura.id)}
                  />
                ))
              ) : ehRegistro && loadingRegistros ? (
                <p className="py-8 text-center text-xs text-gray-400">Carregando registros...</p>
              ) : ehRegistro && registros.length > 0 ? (
                registros.map((registro) => (
                  <RegistroCard
                    key={registro.id}
                    registro={registro}
                    mostrarDetalhes={mostrarDetalhes}
                    onClick={() => onAbrirHistorico('registro', registro.id)}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-200 py-8 text-center">
                  <LayoutGrid size={18} className="text-gray-300" />
                  <p className="text-xs text-gray-400">Nenhum cartão ainda.</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Preto ou branco, o que for mais legível em cima da cor de fundo escolhida
// (luminância relativa simples — YIQ).
function corTextoContraste(hex) {
  if (!hex) return undefined;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#1f2937' : '#ffffff';
}

function BadgeCor({ texto, cor }) {
  if (cor) {
    return (
      <span
        className="rounded-full px-2 py-0.5 text-[9px]"
        style={{ backgroundColor: cor, color: corTextoContraste(cor) }}
      >
        {texto}
      </span>
    );
  }
  return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] text-gray-600">{texto}</span>;
}

// Última micro etapa registrada manualmente (ver "Registrar Movimentação"
// no modal de Histórico de Etapas) pro cliente daquele card — mostrada no
// topo, pequena, separada do resto do card por uma linha fina embaixo dela.
function UltimaMicroEtapa({ nome, data }) {
  if (!nome) return null;
  return (
    <div className="mb-1 flex items-center justify-between gap-1.5 border-b border-gray-100 pb-1 text-[9px] font-medium text-primary-600">
      <span className="flex min-w-0 items-center gap-1">
        <History size={10} className="shrink-0" />
        <span className="truncate">{nome}</span>
      </span>
      {data && (
        <span className="shrink-0 text-gray-400" title={formatarData(data)}>
          {formatarDiasSemNovaEtapa(data)}
        </span>
      )}
    </div>
  );
}

function ReservaCard({ reserva, cores, mostrarDetalhes, onClick }) {
  return (
    <div
      onClick={onClick}
      title="Clique para ver o histórico de etapas"
      className="cursor-pointer rounded-lg border border-gray-200 p-2.5 text-[11px] shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50/30"
    >
      <UltimaMicroEtapa nome={reserva.ultima_microetapa_nome} data={reserva.ultima_microetapa_data} />
      <p className="truncate text-[11px] font-medium text-gray-900">{reserva.empreendimento || '—'}</p>
      {reserva.titular_nome && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-600">
          <User size={12} className="shrink-0" />
          {reserva.titular_nome}
        </p>
      )}
      {mostrarDetalhes && reserva.idreserva && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-400" title="Código da reserva (CV)">
          <Hash size={12} className="shrink-0" />
          {reserva.idreserva}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {reserva.tipovenda && (
          <BadgeCor texto={reserva.tipovenda} cor={cores?.tipovenda?.[reserva.tipovenda]} />
        )}
        {reserva.situacao && (
          <BadgeCor texto={reserva.situacao} cor={cores?.situacao?.[reserva.situacao]} />
        )}
      </div>
    </div>
  );
}

// tipovenda/situacao aqui são os da reserva de origem (ligada via o
// idreserva embutido no `number` do contrato) — mesma cor configurada em
// "Configurar Filtros de Visualização" pro bucket Reserva.
function ContratoCard({ contrato, cores, mostrarDetalhes, onClick }) {
  return (
    <div
      onClick={onClick}
      title="Clique para ver o histórico de etapas"
      className="cursor-pointer rounded-lg border border-gray-200 p-2.5 text-[11px] shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50/30"
    >
      <UltimaMicroEtapa nome={contrato.ultima_microetapa_nome} data={contrato.ultima_microetapa_data} />
      <p className="truncate text-[11px] font-medium text-gray-900">{contrato.empreendimento || '—'}</p>
      {contrato.titular_nome && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-600">
          <User size={12} className="shrink-0" />
          {contrato.titular_nome}
        </p>
      )}
      {mostrarDetalhes && contrato.idreserva && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-400" title="Código da reserva (CV) de origem">
          <Hash size={12} className="shrink-0" />
          {contrato.idreserva}
        </p>
      )}
      {mostrarDetalhes && contrato.number && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-400" title="Número do contrato">
          <FileText size={12} className="shrink-0" />
          {contrato.number}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {contrato.tipovenda && (
          <BadgeCor texto={contrato.tipovenda} cor={cores?.tipovenda?.[contrato.tipovenda]} />
        )}
        {contrato.situacao && (
          <BadgeCor texto={contrato.situacao} cor={cores?.situacao?.[contrato.situacao]} />
        )}
      </div>
    </div>
  );
}

// Data vem como "YYYY-MM-DD..." (coluna DATE) — recorta a parte da data em
// vez de usar `new Date(...).toLocaleDateString()`, que pode voltar um dia
// por causa do fuso horário (DATE não tem hora, o parse assume UTC).
function formatarData(iso) {
  if (!iso) return null;
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

// Quantos dias corridos se passaram desde a data (sem hora — mesmo cuidado
// de fuso do formatarData acima, comparando só as partes de calendário, não
// timestamps) até hoje. Usado no card pra mostrar há quanto tempo o cliente
// está parado na última etapa, em vez da data crua.
function diasSemNovaEtapa(iso) {
  if (!iso) return null;
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  const dataEtapa = Date.UTC(ano, mes - 1, dia);
  const agora = new Date();
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((hoje - dataEtapa) / 86400000);
}

function formatarDiasSemNovaEtapa(iso) {
  const dias = diasSemNovaEtapa(iso);
  if (dias === null) return null;
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

// Aqui sim é TIMESTAMP de verdade (com hora), então dá pra usar
// Date/toLocaleString direto sem o problema de fuso do formatarData acima.
function formatarDataHora(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Aqui sim compara com "agora" de verdade (fuso do navegador) — diferente
// de formatarData/diasParada acima, que tratam coluna DATE como texto puro
// de propósito. ultimaAtualizacao é TIMESTAMP de verdade, então dá pra usar
// Date normalmente.
function foiAtualizadoHoje(iso) {
  if (!iso) return false;
  const data = new Date(iso);
  const hoje = new Date();
  return (
    data.getFullYear() === hoje.getFullYear() &&
    data.getMonth() === hoje.getMonth() &&
    data.getDate() === hoje.getDate()
  );
}

// Dias corridos entre a data de assinatura e hoje — quanto tempo essa
// unidade está parada sem dar entrada no registro. Compara só as datas (sem
// hora), em UTC, pro mesmo motivo do formatarData acima.
function diasParada(iso) {
  if (!iso) return null;
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  const dataAssinatura = Date.UTC(ano, mes - 1, dia);
  const hoje = new Date();
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((hojeUtc - dataAssinatura) / 86400000);
}

// >90 dias: vermelho (crítico) · 60–90: amarelo (atenção) · <60: azul
// (dentro do esperado) — tons suaves (bg-*-50/text-*-600), sem contraste
// forte, pra não competir com o resto do card.
function corDiasParada(dias) {
  if (dias > 90) return 'bg-red-50 text-red-600';
  if (dias >= 60) return 'bg-amber-50 text-amber-600';
  return 'bg-blue-50 text-blue-600';
}

// Todos os campos essenciais de extrato_unidades (importada manualmente na
// tela Extrato, arquivo da Caixa): empreendimento (nome do Horizon, ligado
// via codigo_contrato_caixa), número do contrato da unidade, mutuário e
// data de assinatura.
// idreserva/numero_contrato/titular_nome aqui vêm da reserva de origem,
// achada por dois saltos: extrato_unidades.numero_contrato_unidade ↔
// sie_sales_contracts.financial_institution_number, e desse contrato até a
// reserva (mesma ligação usada no bucket Contrato — ver listUnidadesExtrato
// no backend). titular_nome prioriza o nome da reserva sobre o
// nome_mutuario do extrato, pra ficar igual ao dos cards de Reserva/Contrato.
function AssinaturaCard({ assinatura, mostrarDetalhes, onClick }) {
  const dias = diasParada(assinatura.data_assinatura_contrato);
  return (
    <div
      onClick={onClick}
      title="Clique para ver o histórico de etapas"
      className="cursor-pointer rounded-lg border border-gray-200 p-2.5 text-[11px] shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50/30"
    >
      <UltimaMicroEtapa nome={assinatura.ultima_microetapa_nome} data={assinatura.ultima_microetapa_data} />
      <p className="truncate text-[11px] font-medium text-gray-900">{assinatura.empreendimento || '—'}</p>
      {assinatura.titular_nome && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-600">
          <User size={12} className="shrink-0" />
          {assinatura.titular_nome}
        </p>
      )}
      {mostrarDetalhes && assinatura.idreserva && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-400" title="Código da reserva (CV) de origem">
          <Hash size={12} className="shrink-0" />
          {assinatura.idreserva}
        </p>
      )}
      {mostrarDetalhes && assinatura.numero_contrato && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-400" title="Número do contrato">
          <FileText size={12} className="shrink-0" />
          {assinatura.numero_contrato}
        </p>
      )}
      {mostrarDetalhes && assinatura.numero_contrato_unidade && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-400" title="Número do contrato da unidade">
          <FileText size={12} className="shrink-0" />
          {assinatura.numero_contrato_unidade}
        </p>
      )}
      {mostrarDetalhes && assinatura.data_assinatura_contrato && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-400" title="Data de assinatura do contrato">
          <Calendar size={12} className="shrink-0" />
          {formatarData(assinatura.data_assinatura_contrato)}
        </p>
      )}
      {dias !== null && (
        <div className="mt-1">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium ${corDiasParada(dias)}`}
            title="Dias parada sem registro, desde a assinatura"
          >
            <Clock size={11} className="shrink-0" />
            {dias} {dias === 1 ? 'dia' : 'dias'} parada
          </span>
        </div>
      )}
    </div>
  );
}

// Mesmo enriquecimento do AssinaturaCard (idreserva/numero_contrato/
// titular_nome vindos da reserva de origem), mais a data de registro.
function RegistroCard({ registro, mostrarDetalhes, onClick }) {
  return (
    <div
      onClick={onClick}
      title="Clique para ver o histórico de etapas"
      className="cursor-pointer rounded-lg border border-gray-200 p-2.5 text-[11px] shadow-sm transition-colors hover:border-primary-200 hover:bg-primary-50/30"
    >
      <UltimaMicroEtapa nome={registro.ultima_microetapa_nome} data={registro.ultima_microetapa_data} />
      <p className="truncate text-[11px] font-medium text-gray-900">{registro.empreendimento || '—'}</p>
      {registro.titular_nome && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-600">
          <User size={12} className="shrink-0" />
          {registro.titular_nome}
        </p>
      )}
      {mostrarDetalhes && registro.idreserva && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-400" title="Código da reserva (CV) de origem">
          <Hash size={12} className="shrink-0" />
          {registro.idreserva}
        </p>
      )}
      {mostrarDetalhes && registro.numero_contrato && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-400" title="Número do contrato">
          <FileText size={12} className="shrink-0" />
          {registro.numero_contrato}
        </p>
      )}
      {mostrarDetalhes && registro.numero_contrato_unidade && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-400" title="Número do contrato da unidade">
          <FileText size={12} className="shrink-0" />
          {registro.numero_contrato_unidade}
        </p>
      )}
      {mostrarDetalhes && registro.data_assinatura_contrato && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-400" title="Data de assinatura do contrato">
          <Calendar size={12} className="shrink-0" />
          {formatarData(registro.data_assinatura_contrato)}
        </p>
      )}
      {mostrarDetalhes && registro.data_registro && (
        <p className="mt-0.5 flex items-center gap-1 truncate text-gray-400" title="Data de registro (CRI)">
          <CalendarCheck size={12} className="shrink-0" />
          {formatarData(registro.data_registro)}
        </p>
      )}
    </div>
  );
}
