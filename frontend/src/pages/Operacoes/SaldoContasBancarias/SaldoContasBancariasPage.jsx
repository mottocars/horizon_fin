import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Download, Landmark, Layers, Loader2, Lock, LockOpen, RefreshCw, Search, Settings, Wallet } from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { getFiltrosSaldos, getPeriodoAberto, encerrarPeriodoSaldos } from '../../../api/saldoContasBancarias.api';
import { gerarContasBancarias } from '../../../api/contasBancariasSienge.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { useAuth } from '../../../auth/AuthContext';
import SaldosContasTab from './SaldosContasTab';
import AbaEmConstrucao from './AbaEmConstrucao';
import BancosTab from './BancosTab';
import ClassificacoesTab from './ClassificacoesTab';
import ContasTab from './ContasTab';
import AbrirPeriodoModal from './AbrirPeriodoModal';
import SeletorSemana from './SeletorSemana';
import { formatarDataBR, semanaAtual, semanaDe } from './constantes';

// Pra adicionar uma aba nova no futuro basta incluir um item aqui `{ id, label, icon }` e o
// caso correspondente no bloco de conteúdo mais abaixo (mesmo esquema de GestaoCobrancasPage).
// O `{ divider: true }` separa "Saldos das Contas" (a aba operacional, o dia a dia de
// lançar saldo) das 3 de cadastro/parâmetro — mesmo padrão de GestaoCobrancasPage.jsx, que
// separa "Clusters de Clientes" (operacional) de "Motor de Risco" e as demais (parâmetro).
const TABS = [
  { id: 'saldos', label: 'Saldos das Contas', icon: Wallet },
  { divider: true },
  { id: 'bancos', label: 'Bancos', icon: Landmark },
  { id: 'classificacao', label: 'Classificação', icon: Layers },
  { id: 'contas', label: 'Contas Bancárias', icon: CreditCard },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
];

const STATUS_CONTAS_OPCOES = [
  { value: 'ENABLED', label: 'Ativa' },
  { value: 'DISABLED', label: 'Inativa' },
];

// Empresa, aba e filtros vivem na URL (não em useState local) pelo mesmo motivo da Gestão
// de Cobranças: o "Voltar" do navegador devolve o usuário pro mesmo lugar, com os mesmos
// filtros. Toda troca usa `replace`, pra escolher um filtro não empilhar histórico.
// A grade sempre mostra 1 semana inteira (domingo a sábado), nunca mais nem menos (pedido do
// usuário — período livre gerava tabela larga demais, precisava rolar na horizontal e
// "desformatava" a tela): a URL guarda só `semana` (a data do domingo), não um par de datas
// soltas — dataInicio/dataFim vêm sempre juntos, calculados a partir dela (ver semanaDe).
// Sem parâmetro na URL vale a semana atual, recalculada a cada abertura da tela.
export default function SaldoContasBancariasPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();

  const empresaId = searchParams.get('empresa_id') || '';
  const abaAtiva = searchParams.get('aba') || 'saldos';

  // Arrays com `useMemo` sobre a string crua da URL: o grid recebe estes arrays como
  // dependência de `useCallback`/`useEffect` — sem isso, cada render criaria um array novo
  // (mesmo com o mesmo conteúdo) e a grade recarregaria à toa.
  const companyIdsParam = searchParams.get('company_ids') || '';
  const companyIds = useMemo(() => companyIdsParam.split(',').filter(Boolean).map(Number), [companyIdsParam]);
  const bancosParam = searchParams.get('bancos') || '';
  const bancos = useMemo(() => bancosParam.split(',').filter(Boolean), [bancosParam]);
  const contasParam = searchParams.get('contas') || '';
  const contasSelecionadas = useMemo(() => contasParam.split(',').filter(Boolean), [contasParam]);

  const padrao = useMemo(() => semanaAtual(), []);
  const semanaParam = searchParams.get('semana') || padrao.inicio;
  // semanaDe normaliza sozinho: mesmo se `semana` na URL não cair num domingo (editada à mão,
  // por exemplo), a grade sempre resolve pra semana (domingo–sábado) que contém aquela data.
  const { inicio: dataInicio, fim: dataFim } = useMemo(() => semanaDe(semanaParam), [semanaParam]);

  const [refreshToken, setRefreshToken] = useState(0);

  // Filtros das abas Bancos e Contas Bancárias — não vivem na URL (diferente dos de Saldos
  // das Contas) porque são só conveniência de busca no navegador, sem link compartilhável.
  const [bancosSearch, setBancosSearch] = useState('');
  const [contasSearch, setContasSearch] = useState('');
  const [contasStatus, setContasStatus] = useState([]);
  const [atualizandoContas, setAtualizandoContas] = useState(false);
  const [erroAtualizarContas, setErroAtualizarContas] = useState('');

  // Empresas (do Sienge) pra aba Contas Bancárias — diferente da lista da aba Saldos das
  // Contas (ver opcoesEmpresasSienge mais abaixo): aqui entram TODAS as empresas com conta
  // cadastrada, inclusive as que só têm conta sem classificação — é justamente onde ela é
  // classificada pela primeira vez. Vem do próprio resultado de listContas (ContasTab avisa
  // por callback), não de uma consulta própria.
  const [empresasOpcoesContas, setEmpresasOpcoesContas] = useState([]);

  // Dia liberado pra lançar saldo (cadeado) — só existe na aba Saldos das Contas.
  // `periodoToken` força recarregar do servidor sem esperar trocar de empresa/aba — usado
  // quando SaldosContasTab detecta que salvou fora do período (outra aba/pessoa mudou o
  // período liberado enquanto esta tela estava aberta).
  const [dataAberta, setDataAberta] = useState('');
  const [carregandoPeriodo, setCarregandoPeriodo] = useState(false);
  const [modalPeriodoAberto, setModalPeriodoAberto] = useState(false);
  const [periodoToken, setPeriodoToken] = useState(0);

  // Exportar relatório em PDF — a montagem/captura de verdade acontece dentro de
  // SaldosContasTab (é lá que os dados da grade já estão calculados); a página só junta os
  // rótulos dos filtros aplicados e dispara via ref.
  const saldosTabRef = useRef(null);
  const [exportandoRelatorio, setExportandoRelatorio] = useState(false);
  const [erroExportarRelatorio, setErroExportarRelatorio] = useState('');

  // Duas alterações seguidas antes de o React re-renderizar (ex.: mexer nas duas datas em
  // sequência rápida) partiriam do mesmo `searchParams` velho e a segunda apagaria a
  // primeira. O ref guarda o que já foi pedido, então cada chamada soma à anterior.
  const paramsRef = useRef(searchParams);
  paramsRef.current = searchParams;

  function atualizarParams(patch) {
    const next = new URLSearchParams(paramsRef.current);
    Object.entries(patch).forEach(([chave, valor]) => {
      const vazio = valor === null || valor === undefined || valor === '' || (Array.isArray(valor) && valor.length === 0);
      if (vazio) next.delete(chave);
      else next.set(chave, Array.isArray(valor) ? valor.join(',') : String(valor));
    });
    paramsRef.current = next;
    setSearchParams(next, { replace: true });
  }

  // Empresas do Sienge e bancos são da empresa escolhida — trocar de empresa zera os dois.
  function handleEmpresaChange(novoId) {
    atualizarParams({ empresa_id: novoId || null, company_ids: null, bancos: null, contas: null });
  }

  // SeletorSemana já entrega sempre o domingo (ISO) da semana escolhida — nada pra normalizar
  // aqui, só gravar na URL.
  function handleSemana(domingoIso) {
    atualizarParams({ semana: domingoIso });
  }

  // Quem só tem 1 empresa já vem com ela preenchida e travada.
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

  // Só existe uma empresa pra escolher: não há o que decidir, já abre nela.
  useEffect(() => {
    if (!loadingEmpresas && !empresaId && empresas.length === 1) {
      atualizarParams({ empresa_id: empresas[0].id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingEmpresas, empresas, empresaId]);

  // Opções de Empresas (do Sienge) e Banco da empresa selecionada.
  const [filtros, setFiltros] = useState({ empresas: [], bancos: [] });
  const [loadingFiltros, setLoadingFiltros] = useState(false);

  // Só busca na aba que usa essas opções (Saldos das Contas) — nas outras seria uma consulta
  // ao banco à toa. Empresa da conta aqui só traz quem TEM conta classificada (ver
  // saldos.service.js::getFiltros) — a aba Contas Bancárias usa sua própria lista (sem esse
  // filtro), recebida da própria ContasTab por callback (ver empresasOpcoesContas acima).
  useEffect(() => {
    if (!empresaId || abaAtiva !== 'saldos') {
      setFiltros({ empresas: [], bancos: [] });
      return;
    }
    let ativo = true;
    setLoadingFiltros(true);
    getFiltrosSaldos(empresaId)
      .then((dados) => {
        if (ativo) setFiltros(dados);
      })
      .catch(() => {
        if (ativo) setFiltros({ empresas: [], bancos: [] });
      })
      .finally(() => {
        if (ativo) setLoadingFiltros(false);
      });
    return () => {
      ativo = false;
    };
  }, [empresaId, abaAtiva, refreshToken]);

  // Dia liberado pra lançar saldo — null = nenhum período aberto (cadeado trancado/azul, nada
  // é editável até alguém abrir um explicitamente).
  useEffect(() => {
    if (!empresaId || abaAtiva !== 'saldos') {
      setDataAberta('');
      return;
    }
    let ativo = true;
    setCarregandoPeriodo(true);
    getPeriodoAberto(empresaId)
      .then((r) => {
        if (ativo) setDataAberta(r.data || '');
      })
      .catch(() => {
        if (ativo) setDataAberta('');
      })
      .finally(() => {
        if (ativo) setCarregandoPeriodo(false);
      });
    return () => {
      ativo = false;
    };
  }, [empresaId, abaAtiva, periodoToken]);

  // código do banco -> { codigo, nome, logo } — a grade usa pra desenhar a logomarca de cada conta.
  const infoBancos = useMemo(() => new Map(filtros.bancos.map((b) => [b.codigo, b])), [filtros.bancos]);

  const opcoesEmpresasSienge = useMemo(
    () => filtros.empresas.map((e) => ({ value: e.company_id, label: e.company_name || `Empresa ${e.company_id}` })),
    [filtros.empresas]
  );
  const opcoesBancos = useMemo(
    () => filtros.bancos.map((b) => ({ value: b.codigo, label: `${b.codigo} - ${b.nome}` })),
    [filtros.bancos]
  );
  const opcoesContasFiltro = useMemo(() => filtros.contas || [], [filtros.contas]);

  const semEmpresa = !empresaId;

  // Rótulo da empresa (a de cima, não a "da conta") e a lista de filtros ativos com nome
  // legível — vai pro cabeçalho do relatório em PDF (pedido do usuário: "todos os filtros que
  // estavam aplicados na tela"). Sempre inclui a semana, os demais só entram se estiverem
  // realmente filtrando algo.
  const empresaLabel = useMemo(() => {
    const emp = empresas.find((e) => String(e.id) === String(empresaId));
    return emp ? nomeExibicaoEmpresa(emp) : '';
  }, [empresas, empresaId]);

  const filtrosRelatorio = useMemo(() => {
    const lista = [{ label: 'Semana', valor: `${formatarDataBR(dataInicio)} a ${formatarDataBR(dataFim)}` }];
    if (companyIds.length) {
      lista.push({
        label: 'Empresa da conta',
        valor: companyIds.map((id) => opcoesEmpresasSienge.find((o) => o.value === id)?.label || id).join(', '),
      });
    }
    if (bancos.length) {
      lista.push({ label: 'Banco', valor: bancos.map((b) => opcoesBancos.find((o) => o.value === b)?.label || b).join(', ') });
    }
    if (contasParam) {
      lista.push({
        label: 'Conta bancária',
        valor: contasSelecionadas.map((c) => opcoesContasFiltro.find((o) => o.value === c)?.label || c).join(', '),
      });
    }
    return lista;
  }, [dataInicio, dataFim, companyIds, bancos, contasParam, contasSelecionadas, opcoesEmpresasSienge, opcoesBancos, opcoesContasFiltro]);

  async function handleExportarRelatorio() {
    setErroExportarRelatorio('');
    setExportandoRelatorio(true);
    try {
      await saldosTabRef.current?.exportarPDF({
        empresaLabel,
        filtros: filtrosRelatorio,
        nomeUsuario: user?.nome || 'Usuário',
      });
    } catch (err) {
      setErroExportarRelatorio(err.message || 'Não foi possível gerar o relatório.');
    } finally {
      setExportandoRelatorio(false);
    }
  }

  // Sincroniza as contas bancárias a partir do Sienge e, ao terminar, reaproveita o mesmo
  // `refreshToken` de Saldos das Contas pra recarregar tanto a tabela da aba Contas Bancárias
  // quanto as opções de "Empresas" (podem ter mudado com a sincronização).
  async function handleAtualizarContas() {
    setErroAtualizarContas('');
    setAtualizandoContas(true);
    try {
      await gerarContasBancarias(Number(empresaId));
      setRefreshToken((n) => n + 1);
    } catch (err) {
      setErroAtualizarContas(err.response?.data?.message || 'Não foi possível atualizar as contas bancárias.');
    } finally {
      setAtualizandoContas(false);
    }
  }

  // Cadeado trancado (azul, nada aberto): clicar abre a janela de "Abrir período". Cadeado
  // aberto (âmbar): clicar já pergunta se quer encerrar — direto, sem janela própria, mesmo
  // padrão usado em qualquer outra confirmação do sistema.
  async function handleCliqueCadeado() {
    if (!dataAberta) {
      setModalPeriodoAberto(true);
      return;
    }
    const confirmado = await confirm({
      title: 'Encerrar período',
      description: `O período de ${formatarDataBR(dataAberta)} está aberto pra lançamento. Depois de encerrado, será preciso reabri-lo pra lançar nesse dia de novo.`,
      confirmLabel: 'Encerrar período',
      variant: 'warning',
    });
    if (!confirmado) return;
    try {
      await encerrarPeriodoSaldos(empresaId);
      setDataAberta('');
    } catch {
      // Se algo já mudou por fora (outra aba encerrou primeiro, etc.) o próximo carregamento
      // do período corrige sozinho — não precisa de tratamento especial aqui.
      setPeriodoToken((n) => n + 1);
    }
  }

  const temFiltroContas = contasSearch || contasStatus.length > 0 || companyIds.length > 0;
  function limparFiltrosContas() {
    setContasSearch('');
    setContasStatus([]);
    atualizarParams({ company_ids: null });
  }

  return (
    <div className="space-y-4">
      <Card className="shrink-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          {/* flex-wrap: até 6 controles na aba Saldos das Contas — em telas de notebook a barra
              quebra numa segunda linha em vez de espremer os campos até ficarem ilegíveis. Todo
              filtro de cada aba mora aqui, junto do seletor de Empresa — abaixo das abas só os
              registros (pedido do usuário). Configurações não tem filtro nenhum ainda. */}
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

            {abaAtiva === 'saldos' && (
              <>
                <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Empresa da conta</label>
                  <SearchableSelect
                    multiple
                    value={companyIds}
                    onChange={(ids) => atualizarParams({ company_ids: ids })}
                    disabled={semEmpresa || loadingFiltros}
                    options={opcoesEmpresasSienge}
                    placeholder={semEmpresa ? 'Selecione a empresa primeiro' : loadingFiltros ? 'Carregando...' : 'Todas as empresas da conta'}
                    emptyMessage="Nenhuma empresa da conta encontrada."
                  />
                </div>

                <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Banco</label>
                  <SearchableSelect
                    multiple
                    value={bancos}
                    onChange={(codigos) => atualizarParams({ bancos: codigos })}
                    disabled={semEmpresa || loadingFiltros}
                    options={opcoesBancos}
                    placeholder={semEmpresa ? 'Selecione a empresa primeiro' : loadingFiltros ? 'Carregando...' : 'Todos os bancos'}
                    emptyMessage="Nenhum banco encontrado."
                  />
                </div>

                <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Conta bancária</label>
                  <SearchableSelect
                    multiple
                    value={contasSelecionadas}
                    onChange={(valores) => atualizarParams({ contas: valores })}
                    disabled={semEmpresa || loadingFiltros}
                    options={opcoesContasFiltro}
                    placeholder={semEmpresa ? 'Selecione a empresa primeiro' : loadingFiltros ? 'Carregando...' : 'Todas as contas'}
                    emptyMessage="Nenhuma conta encontrada."
                  />
                </div>

                {/* Calendário próprio (SeletorSemana): mostra o intervalo por extenso e, ao
                    passar o mouse por cima de um dia no painel, colore a semana inteira
                    daquela linha — prévia de qual semana seria escolhida (pedido do usuário). */}
                <div className="sm:min-w-64 sm:max-w-72 sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Semana</label>
                  <SeletorSemana value={dataInicio} onChange={handleSemana} disabled={semEmpresa} />
                </div>
              </>
            )}

            {abaAtiva === 'bancos' && (
              <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={bancosSearch}
                    onChange={(e) => setBancosSearch(e.target.value)}
                    placeholder="Buscar por código ou nome..."
                    className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              </div>
            )}

            {abaAtiva === 'contas' && (
              <>
                <div className="sm:min-w-56 sm:max-w-sm sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Buscar</label>
                  <div className="relative">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={contasSearch}
                      onChange={(e) => setContasSearch(e.target.value)}
                      disabled={semEmpresa}
                      placeholder="Buscar por conta, nome ou banco..."
                      className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                </div>

                <div className="sm:min-w-36 sm:max-w-44 sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
                  <SearchableSelect
                    multiple
                    value={contasStatus}
                    onChange={setContasStatus}
                    disabled={semEmpresa}
                    options={STATUS_CONTAS_OPCOES}
                    placeholder="Todos os status"
                  />
                </div>

                <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Empresa da conta</label>
                  <SearchableSelect
                    multiple
                    value={companyIds}
                    onChange={(ids) => atualizarParams({ company_ids: ids })}
                    disabled={semEmpresa}
                    options={empresasOpcoesContas}
                    placeholder={semEmpresa ? 'Selecione a empresa primeiro' : 'Todas as empresas da conta'}
                    emptyMessage="Nenhuma empresa da conta encontrada."
                  />
                </div>
              </>
            )}
          </div>

          {abaAtiva === 'saldos' && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex shrink-0 items-center gap-2">
                {/* Espelha a grade inteira (grupos expandidos, logos, cores) num PDF — ver
                    RelatorioSaldosImpressao.jsx / gerarRelatorioPdf.js. */}
                <button
                  type="button"
                  onClick={handleExportarRelatorio}
                  disabled={semEmpresa || exportandoRelatorio}
                  title="Exportar relatório em PDF"
                  className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {exportandoRelatorio ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {exportandoRelatorio ? 'Gerando...' : 'Exportar relatório'}
                </button>

                {/* Só o cadeado (pedido do usuário) — azul/trancado sem período aberto, âmbar/
                    destrancado com um aberto. Clicar abre a janela de abrir (trancado) ou já
                    pergunta se quer encerrar (aberto) — ver handleCliqueCadeado. */}
                <button
                  type="button"
                  onClick={handleCliqueCadeado}
                  disabled={semEmpresa || carregandoPeriodo}
                  title={
                    dataAberta
                      ? `Período aberto em ${formatarDataBR(dataAberta)} — clique para encerrar`
                      : 'Nenhum período aberto — clique para abrir'
                  }
                  className={`flex shrink-0 items-center justify-center rounded-lg p-2.5 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    dataAberta ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary-600 hover:bg-primary-700'
                  }`}
                >
                  {dataAberta ? <LockOpen size={18} /> : <Lock size={18} />}
                </button>
              </div>
              {erroExportarRelatorio && <span className="text-xs text-red-600">{erroExportarRelatorio}</span>}
            </div>
          )}

          {abaAtiva === 'contas' && (
            <div className="flex shrink-0 items-center gap-2">
              {temFiltroContas && (
                <button
                  type="button"
                  onClick={limparFiltrosContas}
                  className="shrink-0 whitespace-nowrap text-sm text-gray-500 hover:text-gray-700"
                >
                  Limpar filtros
                </button>
              )}
              <button
                type="button"
                onClick={handleAtualizarContas}
                disabled={semEmpresa || atualizandoContas}
                title="Atualizar a partir do Sienge"
                className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={16} className={atualizandoContas ? 'animate-spin' : ''} />
                Atualizar
              </button>
            </div>
          )}
        </div>
      </Card>

      <div>
        <Tabs tabs={TABS} activeId={abaAtiva} onChange={(aba) => atualizarParams({ aba })} />

        {abaAtiva === 'saldos' && (
          <SaldosContasTab
            ref={saldosTabRef}
            empresaId={empresaId}
            dataInicio={dataInicio}
            dataFim={dataFim}
            companyIds={companyIds}
            bancos={bancos}
            contas={contasSelecionadas}
            infoBancos={infoBancos}
            refreshToken={refreshToken}
            dataAberta={dataAberta}
            onPeriodoDessincronizado={() => setPeriodoToken((n) => n + 1)}
          />
        )}

        {abaAtiva === 'bancos' && <BancosTab search={bancosSearch} />}

        {abaAtiva === 'classificacao' && <ClassificacoesTab empresaId={empresaId} />}

        {abaAtiva === 'contas' && (
          <ContasTab
            empresaId={empresaId}
            search={contasSearch}
            status={contasStatus}
            companyIds={companyIds}
            refreshToken={refreshToken}
            erroAtualizar={erroAtualizarContas}
            onEmpresas={setEmpresasOpcoesContas}
          />
        )}

        {abaAtiva === 'configuracoes' && (
          <AbaEmConstrucao
            icon={Settings}
            titulo="Configurações"
            descricao="Parâmetros da tela de Saldo Contas Bancárias — em desenvolvimento."
          />
        )}
      </div>

      <AbrirPeriodoModal
        open={modalPeriodoAberto}
        onClose={() => {
          setModalPeriodoAberto(false);
          // a busca automática na VanPix (rodada dentro do modal) pode ter gravado saldo antes
          // de fechar — recarrega a grade pra já aparecer preenchido.
          setRefreshToken((n) => n + 1);
        }}
        empresaId={empresaId}
        onAberto={setDataAberta}
      />
    </div>
  );
}
