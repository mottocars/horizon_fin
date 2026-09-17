import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertOctagon,
  Contact,
  Download,
  MessageCircle,
  RefreshCw,
  Repeat,
  Save,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Tabs from '../../../components/Tabs';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { exportarClientesCustomersSienge } from '../../../api/customersSienge.api';
import { listVersoesMotorRisco } from '../../../api/motorRisco.api';
import { listCentrosRepassesCef } from '../../../api/repassesCef.api';
import {
  getDataSistemaReguaCobranca,
  listResponsaveisReguaCobranca,
  getComunicacaoAutomaticaReguaCobranca,
} from '../../../api/reguaCobranca.api';
import { useAuth } from '../../../auth/AuthContext';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import MotorRiscoTab from './MotorRisco/MotorRiscoTab';
import CentrosCustoResumo from './ClustersCobranca/CentrosCustoResumo';
import SincronizarModal from './ClustersCobranca/SincronizarModal';
import GestaoParcelasTab from './GestaoParcelas/GestaoParcelasTab';
import ComunicacaoTab from './Comunicacao/ComunicacaoTab';
import ReguaCobrancaTab from './ReguaCobranca/ReguaCobrancaTab';
import ClientesTab from './ClientesTab';
import RotinasTab from './RotinasTab';

// Lista de abas da tela. Pra adicionar uma aba nova no futuro basta incluir
// um item aqui `{ id, label, icon }` e o caso correspondente no switch de
// conteúdo logo abaixo. Rotinas vem primeiro de todas, seguida de Gestão
// das Parcelas (o dia a dia de cobrança) e só depois Clusters de Clientes
// (a visão analítica). O `{ divider: true }` no meio é só um separador
// visual (ver components/Tabs.jsx) entre as abas operacionais (Rotinas,
// Gestão das Parcelas, Clusters de Clientes) e as de parâmetro/configuração
// (Motor de Risco, Comunicação, Régua de Cobrança, Clientes). A aba padrão
// ao abrir a tela é 'rotinas' (ver abaAtiva abaixo) — é a landing tab,
// primeira coisa que o responsável pela cobrança vê.
const TABS = [
  { id: 'rotinas', label: 'Rotinas', icon: Repeat },
  { id: 'inadimplencia', label: 'Gestão das Parcelas', icon: AlertOctagon },
  { id: 'clusters', label: 'Clusters de Clientes', icon: Users },
  { divider: true },
  { id: 'motor-risco', label: 'Motor de Risco', icon: ShieldAlert },
  { id: 'comunicacao', label: 'Comunicação', icon: MessageCircle },
  { id: 'mascaras', label: 'Régua de Cobrança', icon: SlidersHorizontal },
  { id: 'clientes', label: 'Clientes', icon: Contact },
];

// Mesmo vocabulário de GestaoParcelasTab.jsx::STATUS_PARCELA (duplicado aqui
// de propósito) — filtro "Tipo de Parcela" do topo, só na aba Gestão das
// Parcelas. Ordem pensada pra leitura ("o que ainda não venceu" →
// "o problema" → "já resolvido"), não a mesma ordem das colunas da tabela.
const OPCOES_STATUS_PARCELA = [
  { value: 'a_vencer', label: 'A vencer' },
  { value: 'inadimplente', label: 'Inadimplente' },
  { value: 'atraso', label: 'Paga com Atraso' },
  { value: 'em_dia', label: 'Paga em Dia' },
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

// Empresa, aba e Centro de Custo vivem na URL (não em useState local) de
// propósito: é o que faz o botão "Voltar" do próprio
// navegador (não só o link "Voltar" desta tela) devolver o usuário pro
// mesmo lugar, com a mesma empresa e os mesmos filtros — sem isso, ir pra
// nível 2/3 e apertar "voltar" físico do navegador algumas vezes pousa numa
// tela sem empresa selecionada (o estado nunca esteve na URL pra história
// do navegador "lembrar"). Toda troca usa `replace` (não `push`), pra
// escolher uma empresa ou marcar um filtro não empilhar histórico — só
// entrar num nível 2/3 (ver ClustersCobranca/CentrosCustoResumo.jsx) empilha
// de verdade.
export default function GestaoCobrancasPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const { user } = useAuth();
  // Só Master e Administrador enxergam a rotina de outra pessoa — Básico só
  // tem a própria (ver rotinas.service.js::resolverUsuarioAlvo, que ignora
  // o filtro de qualquer jeito pra quem não é um dos dois, então isto aqui é
  // só pra não nem mostrar o combobox nesse caso).
  const podeFiltrarResponsavel = user?.permissao === 'MASTER' || user?.permissao === 'ADMINISTRADOR';
  const [searchParams, setSearchParams] = useSearchParams();

  const empresaId = searchParams.get('empresa_id') || '';
  const abaAtiva = searchParams.get('aba') || 'rotinas';
  // `useMemo` (não só derivar direto) de propósito: CentrosCustoResumo.jsx e
  // ClientesTab.jsx recebem este array como prop e o usam como dependência
  // de `useCallback`/`useEffect` próprios — sem o useMemo, cada render desta
  // página (ex.: a cada tecla digitada em "Buscar cliente", que também mora
  // aqui) criava um array NOVO com o mesmo conteúdo, e essa troca de
  // referência (mesmo com valor igual) disparava o efeito que fecha
  // qualquer centro de custo expandido — colapsando o drilldown a cada
  // tecla. `costCenterIdsParam` (a string crua) é a dependência real; o
  // array só é recriado quando o parâmetro de verdade muda.
  const costCenterIdsParam = searchParams.get('cost_center_ids') || '';
  const centroCustoIds = useMemo(
    () => costCenterIdsParam.split(',').filter(Boolean).map(Number),
    [costCenterIdsParam]
  );

  // Filtro "Tipo de Parcela" (Gestão das Parcelas) — mesma convenção do
  // Centro de Custo acima: mora na URL, e o array só é recriado quando o
  // parâmetro de verdade muda (senão o efeito que fecha o drilldown em
  // GestaoParcelasTab.jsx dispararia a cada render à toa).
  const statusParcelaParam = searchParams.get('status_parcela') || '';
  const statusParcelaFiltro = useMemo(() => statusParcelaParam.split(',').filter(Boolean), [statusParcelaParam]);

  // Atualiza só as chaves passadas (mantendo as outras), sempre com
  // `replace` — nunca cria uma entrada nova no histórico do navegador só
  // por causa de um filtro trocado.
  function atualizarParams(patch) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([chave, valor]) => {
      const vazio = valor === null || valor === undefined || valor === '' || (Array.isArray(valor) && valor.length === 0);
      if (vazio) next.delete(chave);
      else next.set(chave, Array.isArray(valor) ? valor.join(',') : String(valor));
    });
    setSearchParams(next, { replace: true });
  }

  // Trocar de empresa é sempre uma escolha explícita do usuário — e como o
  // filtro de Centro de Custo da empresa anterior não faz sentido pra nova,
  // já zera ele na mesma atualização.
  function handleEmpresaChange(novoId) {
    atualizarParams({ empresa_id: novoId || null, cost_center_ids: null });
    setDataInicioRotinas('');
    setDataFimRotinas('');
    setUsuarioIdRotinas('');
  }

  // Administrador é restrito à própria empresa — o seletor já vem
  // preenchido com ela e travado.
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

  // Centros de custo com a etapa "Lançamento" já registrada (Histórico de
  // Etapas) — mesma lista/critério usado no filtro de Centro de Custo dos
  // Repasses CEF (ver RepassesCefPage.jsx e repassesCef.service.js::
  // listCentrosComLancamento).
  const [centrosCusto, setCentrosCusto] = useState([]);
  const [loadingCentrosCusto, setLoadingCentrosCusto] = useState(false);

  useEffect(() => {
    if (!empresaId) {
      setCentrosCusto([]);
      return;
    }
    setLoadingCentrosCusto(true);
    listCentrosRepassesCef(empresaId)
      .then(setCentrosCusto)
      .finally(() => setLoadingCentrosCusto(false));
  }, [empresaId]);

  // Versões salvas do Motor de Risco da empresa selecionada — o combobox
  // "Versão" só faz sentido ali do lado de Empresa quando essa aba está
  // ativa (as demais ainda não têm nada versionado).
  const [versoes, setVersoes] = useState([]);
  const [loadingVersoes, setLoadingVersoes] = useState(false);
  const [versaoId, setVersaoId] = useState('');

  function carregarVersoes(empresa) {
    if (!empresa) {
      setVersoes([]);
      setVersaoId('');
      return;
    }
    setLoadingVersoes(true);
    listVersoesMotorRisco(empresa)
      .then((lista) => {
        setVersoes(lista);
        // Lista já vem ordenada da mais nova pra mais antiga — a primeira é
        // sempre a vigente, e é ela que abre selecionada por padrão.
        setVersaoId(lista[0]?.id ?? '');
      })
      .finally(() => setLoadingVersoes(false));
  }

  useEffect(() => {
    carregarVersoes(empresaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // Chamado pelo MotorRiscoTab depois de gravar uma versão nova — recarrega
  // a lista (a recém-criada some no topo) e já deixa ela selecionada.
  function handleVersaoCriada() {
    carregarVersoes(empresaId);
  }

  const versaoSelecionada = versoes.find((v) => v.id === versaoId) || null;
  const opcoesVersao = versoes.map((v, i) => ({
    value: v.id,
    label: `Versão ${v.versao}${i === 0 ? ' (atual)' : ''} — ${formatarDataHora(v.criado_em)}`,
  }));

  // Todos os botões de ação da tela ficam aqui, no canto direito da barra
  // de filtros — nunca dentro do conteúdo da aba (ver MotorRiscoTab.jsx e
  // ClustersCobranca/CentrosCustoResumo.jsx, que só reportam o estado pra cá
  // em vez de desenharem o próprio botão).
  const motorRiscoRef = useRef(null);
  const [statusMotorRisco, setStatusMotorRisco] = useState({ podeSalvar: false, salvando: false });

  const [sincronizarAberto, setSincronizarAberto] = useState(false);
  const [refreshClusters, setRefreshClusters] = useState(0);
  const [refreshClientes, setRefreshClientes] = useState(0);
  // Gestão das Parcelas e Rotinas leem tudo ao vivo (sem cache próprio),
  // mas o componente já montado não refaz a busca sozinho só porque o
  // banco mudou — precisam do mesmo empurrão de "refreshToken" que
  // Clusters de Clientes e Clientes já usam. Tanto recalcular clusters
  // quanto atualizar clientes afetam a classificação/os nomes que essas 2
  // abas mostram, então os dois botões do modal disparam as 4 recargas.
  const [refreshParcelas, setRefreshParcelas] = useState(0);
  const [refreshRotinas, setRefreshRotinas] = useState(0);

  // Busca de cliente (aba Clientes) — ao lado do filtro de Centro de Custo,
  // não dentro do card (ver ClientesTab.jsx). Fica em useState local (não
  // na URL como empresa/aba/Centro de Custo): é só um refinamento de texto
  // sobre o centro de custo expandido no momento, não um estado que faça
  // sentido restaurar sozinho num "Voltar" do navegador.
  const [buscaClientes, setBuscaClientes] = useState('');
  const [exportandoClientes, setExportandoClientes] = useState(false);

  // Baixa em Excel exatamente a matriz Centro de Custo → Cliente que está
  // na tela agora (mesmo Centro de Custo/busca já filtrados) — ver
  // customersSienge.api.js::exportarClientesCustomersSienge e
  // customers.controller.js::exportExcel. Mesmo padrão de download via
  // blob já usado em Repasses CEF/Centros de Custo (createObjectURL + link
  // temporário, sem precisar de uma lib nova).
  async function handleExportarClientes() {
    setExportandoClientes(true);
    try {
      const blob = await exportarClientesCustomersSienge(empresaId, { costCenterIds: centroCustoIds, search: buscaClientes });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `clientes-empresa-${empresaId}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setExportandoClientes(false);
    }
  }

  // Período das Rotinas — início e fim, os dois nascendo na "data de hoje"
  // da empresa (real ou fictícia, mesma configuração de "Data do Sistema"
  // da Régua de Cobrança — ver ConfiguracoesGlobaisPainel.jsx), pra poder
  // simular um dia de teste sem depender do calendário andar. Guardado só
  // em useState local (não na URL): é um refinamento de quando o usuário
  // olha a lista de hoje, não algo que faça sentido restaurar num "Voltar".
  // `atual || ...` preserva a escolha manual do usuário ao trocar de aba e
  // voltar — só reseta de verdade quando a empresa muda (handleEmpresaChange).
  const [dataInicioRotinas, setDataInicioRotinas] = useState('');
  const [dataFimRotinas, setDataFimRotinas] = useState('');

  useEffect(() => {
    if (!empresaId || abaAtiva !== 'rotinas') return;
    getDataSistemaReguaCobranca(empresaId).then((dataSistema) => {
      setDataInicioRotinas((atual) => atual || dataSistema.data_efetiva);
      setDataFimRotinas((atual) => atual || dataSistema.data_efetiva);
    });
  }, [empresaId, abaAtiva]);

  // Filtro de "rotina de quem" — só existe pra Master/Administrador (ver
  // podeFiltrarResponsavel acima). Mesma lista de usuários elegíveis a
  // responsável de etapa da régua (Administrador ou Básico, com esta
  // empresa vinculada) — é literalmente quem pode ter uma rotina pra
  // mostrar (ver reguaCobranca.service.js::listResponsaveis).
  const [responsaveisRotinas, setResponsaveisRotinas] = useState([]);
  const [usuarioIdRotinas, setUsuarioIdRotinas] = useState('');

  useEffect(() => {
    if (!empresaId || abaAtiva !== 'rotinas' || !podeFiltrarResponsavel) {
      setResponsaveisRotinas([]);
      return;
    }
    listResponsaveisReguaCobranca(empresaId).then(setResponsaveisRotinas);
  }, [empresaId, abaAtiva, podeFiltrarResponsavel]);

  // "Ativar Comunicação Automática" (Configurações Globais) — decide como
  // a Rotina desenha WhatsApp/E-mail: ligada, são só status de leitura
  // (esperando o disparo automático); desligada (padrão, nasce desligada),
  // viram checkbox manual do responsável, igual à Ligação (ver
  // RotinasTab.jsx). Nasce `true` no estado local só pra não piscar
  // checkbox antes da 1ª resposta chegar — o valor de verdade sempre vem
  // do backend assim que a empresa muda.
  const [comunicacaoAutomaticaAtiva, setComunicacaoAutomaticaAtiva] = useState(true);

  useEffect(() => {
    if (!empresaId || abaAtiva !== 'rotinas') return;
    getComunicacaoAutomaticaReguaCobranca(empresaId).then((r) => setComunicacaoAutomaticaAtiva(r.ativa));
  }, [empresaId, abaAtiva]);

  return (
    <div className="space-y-4">
      <Card className="shrink-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          {/* `sm:flex-1` é o que faz este grupo CRESCER até preencher o
              espaço sobrando (com a barra lateral recolhida, cada filtro
              cresce até o próprio `max-w`, ficando do tamanho de sempre) —
              sem isso, cada filtro ficava travado no piso mínimo
              (`min-w`) o tempo todo, mesmo sobrando espaço de sobra.
              `min-w-0` é o que deixa esse mesmo grupo ENCOLHER de verdade
              quando a barra lateral abre e sobra menos espaço (senão o
              flexbox usa a largura de conteúdo como piso e nunca cede
              espaço pro botão de Sincronizar). Os dois precisam andar
              juntos — só um dos dois não basta. */}
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-1">
            <div className="sm:min-w-[160px] sm:max-w-xs sm:flex-1">
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

            {abaAtiva === 'motor-risco' && (
              <div className="sm:min-w-[160px] sm:max-w-xs sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Versão</label>
                <SearchableSelect
                  clearable={false}
                  value={versaoId}
                  onChange={setVersaoId}
                  disabled={!empresaId || loadingVersoes || versoes.length === 0}
                  options={opcoesVersao}
                  placeholder={
                    !empresaId
                      ? 'Selecione a empresa primeiro'
                      : loadingVersoes
                        ? 'Carregando versões...'
                        : 'Nenhuma versão salva ainda'
                  }
                  emptyMessage="Nenhuma versão encontrada."
                />
              </div>
            )}

            {(abaAtiva === 'clusters' || abaAtiva === 'clientes' || abaAtiva === 'inadimplencia' || abaAtiva === 'rotinas') && (
              <div className="sm:min-w-[160px] sm:max-w-xs sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Centro de Custo</label>
                <SearchableSelect
                  multiple
                  value={centroCustoIds}
                  onChange={(ids) => atualizarParams({ cost_center_ids: ids })}
                  disabled={!empresaId || loadingCentrosCusto}
                  options={centrosCusto.map((centro) => ({ value: centro.sienge_id, label: centro.name }))}
                  placeholder={
                    !empresaId
                      ? 'Selecione a empresa primeiro'
                      : loadingCentrosCusto
                        ? 'Carregando centros de custo...'
                        : centrosCusto.length === 0
                          ? 'Nenhum centro com Lançamento cadastrado'
                          : 'Todos os centros de custo'
                  }
                  emptyMessage="Nenhum centro de custo encontrado."
                />
              </div>
            )}

            {abaAtiva === 'inadimplencia' && (
              <div className="sm:min-w-[160px] sm:max-w-xs sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de Parcela</label>
                <SearchableSelect
                  multiple
                  value={statusParcelaFiltro}
                  onChange={(valores) => atualizarParams({ status_parcela: valores })}
                  disabled={!empresaId}
                  options={OPCOES_STATUS_PARCELA}
                  placeholder={!empresaId ? 'Selecione a empresa primeiro' : 'Todos os tipos'}
                  emptyMessage="Nenhum tipo encontrado."
                />
              </div>
            )}

            {abaAtiva === 'rotinas' && (
              <div className="flex min-w-0 gap-3 sm:flex-1">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Data início</label>
                  <input
                    type="date"
                    value={dataInicioRotinas}
                    onChange={(e) => setDataInicioRotinas(e.target.value)}
                    disabled={!empresaId}
                    className="w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Data fim</label>
                  <input
                    type="date"
                    value={dataFimRotinas}
                    onChange={(e) => setDataFimRotinas(e.target.value)}
                    disabled={!empresaId}
                    className="w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
            )}

            {abaAtiva === 'rotinas' && podeFiltrarResponsavel && (
              <div className="sm:min-w-[140px] sm:max-w-[220px] sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Responsável</label>
                <SearchableSelect
                  value={usuarioIdRotinas}
                  onChange={setUsuarioIdRotinas}
                  disabled={!empresaId}
                  options={responsaveisRotinas.map((usuario) => ({ value: usuario.id, label: usuario.nome }))}
                  placeholder={!empresaId ? 'Selecione a empresa primeiro' : 'Minha rotina'}
                  emptyMessage="Nenhum usuário elegível nesta empresa."
                />
              </div>
            )}

            {(abaAtiva === 'clientes' || abaAtiva === 'inadimplencia') && (
              <div className="sm:min-w-[160px] sm:max-w-xs sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar cliente</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="search"
                    value={buscaClientes}
                    onChange={(e) => setBuscaClientes(e.target.value)}
                    disabled={!empresaId}
                    placeholder={
                      !empresaId ? 'Selecione a empresa primeiro' : abaAtiva === 'clientes' ? 'Nome, CPF ou CNPJ' : 'Nome do cliente'
                    }
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {abaAtiva === 'motor-risco' && (
              <Button
                onClick={() => motorRiscoRef.current?.salvar()}
                disabled={!statusMotorRisco.podeSalvar}
                loading={statusMotorRisco.salvando}
              >
                <Save size={16} />
                Publicar Versão
              </Button>
            )}
            {(abaAtiva === 'rotinas' ||
              abaAtiva === 'clusters' ||
              abaAtiva === 'inadimplencia' ||
              abaAtiva === 'clientes') && (
              // Só ícone, de propósito (pedido do usuário) — por isso não é
              // o componente Button (ele sempre vem com padding horizontal
              // maior que o vertical, o que deixa um botão só-ícone
              // retangular, não quadrado). Mesma paleta do variant
              // "primary" de Button, só com padding igual dos 4 lados.
              <button
                type="button"
                onClick={() => setSincronizarAberto(true)}
                disabled={!empresaId}
                title="Sincronizar"
                className="flex shrink-0 items-center justify-center rounded-lg bg-primary-600 p-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={18} />
              </button>
            )}
            {abaAtiva === 'clientes' && (
              // Mesmo tamanho/formato do botão "Sincronizar" ao lado (pra
              // alinhar certinho), mas com paleta secundária (borda cinza)
              // pra não competir visualmente com ele — "Sincronizar" busca
              // dado novo do Sienge, "Exportar" só baixa o que já está na
              // tela, são ações de peso bem diferente. p-1.75 (7px, em vez
              // do mesmo p-2 do Sincronizar) compensa a borda de 1px deste
              // botão, que o Sincronizar não tem — sem isso ele ficava 2px
              // maior, quebrando o alinhamento certinho do comentário acima.
              <button
                type="button"
                onClick={handleExportarClientes}
                disabled={!empresaId || exportandoClientes}
                title="Exportar em Excel"
                className="flex shrink-0 items-center justify-center rounded-lg border border-gray-200 p-1.75 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Download size={18} className={exportandoClientes ? 'animate-pulse' : ''} />
              </button>
            )}
          </div>
        </div>
      </Card>

      <div>
        <Tabs tabs={TABS} activeId={abaAtiva} onChange={(aba) => atualizarParams({ aba })} />

        {abaAtiva === 'motor-risco' && (
          <MotorRiscoTab
            ref={motorRiscoRef}
            empresaId={empresaId}
            versaoSelecionada={versaoSelecionada}
            versaoMaisRecenteId={versoes[0]?.id ?? null}
            onVersaoCriada={handleVersaoCriada}
            onStatusChange={setStatusMotorRisco}
          />
        )}

        {abaAtiva === 'rotinas' && (
          <RotinasTab
            empresaId={empresaId}
            centroCustoIds={centroCustoIds}
            dataInicio={dataInicioRotinas}
            dataFim={dataFimRotinas}
            usuarioId={podeFiltrarResponsavel ? usuarioIdRotinas : ''}
            refreshToken={refreshRotinas}
            comunicacaoAutomaticaAtiva={comunicacaoAutomaticaAtiva}
          />
        )}

        {abaAtiva === 'clusters' && (
          <CentrosCustoResumo empresaId={empresaId} centroCustoIds={centroCustoIds} refreshToken={refreshClusters} />
        )}

        {abaAtiva === 'inadimplencia' && (
          <GestaoParcelasTab
            empresaId={empresaId}
            centroCustoIds={centroCustoIds}
            busca={buscaClientes}
            statusParcela={statusParcelaFiltro}
            refreshToken={refreshParcelas}
          />
        )}

        {abaAtiva === 'mascaras' && <ReguaCobrancaTab empresaId={empresaId} />}

        {abaAtiva === 'comunicacao' && <ComunicacaoTab empresaId={empresaId} />}

        {abaAtiva === 'clientes' && (
          <ClientesTab
            empresaId={empresaId}
            centroCustoIds={centroCustoIds}
            busca={buscaClientes}
            refreshToken={refreshClientes}
          />
        )}
      </div>

      <SincronizarModal
        open={sincronizarAberto}
        onClose={() => setSincronizarAberto(false)}
        empresaId={empresaId}
        onClustersRecalculados={() => {
          setRefreshClusters((n) => n + 1);
          setRefreshParcelas((n) => n + 1);
          setRefreshRotinas((n) => n + 1);
        }}
        onClientesAtualizados={() => {
          setRefreshClientes((n) => n + 1);
          setRefreshParcelas((n) => n + 1);
          setRefreshRotinas((n) => n + 1);
        }}
      />
    </div>
  );
}
