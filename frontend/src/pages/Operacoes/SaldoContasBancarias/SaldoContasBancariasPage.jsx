import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, Landmark, RefreshCw, Settings, TriangleAlert, Wallet } from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { getFiltrosSaldos } from '../../../api/saldoContasBancarias.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import SaldosContasTab from './SaldosContasTab';
import AbaEmConstrucao from './AbaEmConstrucao';
import BancosTab from './BancosTab';
import ContasTab from './ContasTab';
import { OPCOES_CLASSIFICACAO, semanaAtual, validarPeriodo } from './constantes';

// Pra adicionar uma aba nova no futuro basta incluir um item aqui `{ id, label, icon }` e o
// caso correspondente no bloco de conteúdo mais abaixo (mesmo esquema de GestaoCobrancasPage).
// O `{ divider: true }` separa "Saldos das Contas" (a aba operacional, o dia a dia de
// lançar saldo) das 3 de cadastro/parâmetro — mesmo padrão de GestaoCobrancasPage.jsx, que
// separa "Clusters de Clientes" (operacional) de "Motor de Risco" e as demais (parâmetro).
const TABS = [
  { id: 'saldos', label: 'Saldos das Contas', icon: Wallet },
  { divider: true },
  { id: 'bancos', label: 'Bancos', icon: Landmark },
  { id: 'contas', label: 'Contas Bancárias', icon: CreditCard },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
];

const CLASSE_DATA =
  'w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400';

// Empresa, aba e filtros vivem na URL (não em useState local) pelo mesmo motivo da Gestão
// de Cobranças: o "Voltar" do navegador devolve o usuário pro mesmo lugar, com os mesmos
// filtros. Toda troca usa `replace`, pra escolher um filtro não empilhar histórico.
// Datas: sem parâmetro na URL valem sempre a semana atual, domingo a sábado — o padrão não é
// gravado na URL, então abrir a tela numa semana nova já abre nela. Sem setas de navegação
// de período (pedido do usuário) — pra ver outra semana é só digitar as datas.
export default function SaldoContasBancariasPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();

  const empresaId = searchParams.get('empresa_id') || '';
  const abaAtiva = searchParams.get('aba') || 'saldos';

  // Arrays com `useMemo` sobre a string crua da URL: o grid recebe estes arrays como
  // dependência de `useCallback`/`useEffect` — sem isso, cada render criaria um array novo
  // (mesmo com o mesmo conteúdo) e a grade recarregaria à toa.
  const companyIdsParam = searchParams.get('company_ids') || '';
  const companyIds = useMemo(() => companyIdsParam.split(',').filter(Boolean).map(Number), [companyIdsParam]);
  const classificacoesParam = searchParams.get('classificacoes') || '';
  const classificacoes = useMemo(() => classificacoesParam.split(',').filter(Boolean), [classificacoesParam]);
  const bancosParam = searchParams.get('bancos') || '';
  const bancos = useMemo(() => bancosParam.split(',').filter(Boolean), [bancosParam]);

  const padrao = useMemo(() => semanaAtual(), []);
  const dataInicio = searchParams.get('data_inicio') || padrao.inicio;
  const dataFim = searchParams.get('data_fim') || padrao.fim;
  const erroPeriodo = validarPeriodo(dataInicio, dataFim);

  const [refreshToken, setRefreshToken] = useState(0);

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
    atualizarParams({ empresa_id: novoId || null, company_ids: null, bancos: null });
  }

  // Um input de data só dispara onChange com '' quando é apagado/incompleto; ignorar isso
  // deixa o valor anterior (o padrão é sempre a semana atual, não existe "sem data").
  function handleData(chave, valor) {
    if (valor) atualizarParams({ [chave]: valor });
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

  // Só busca nas abas que realmente usam isso (Saldos das Contas) — nas outras (Bancos,
  // Contas Bancárias, Configurações) seria 2 consultas ao banco à toa, pra opções de filtro
  // que nem aparecem na tela.
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

  const semEmpresa = !empresaId;

  return (
    <div className="space-y-4">
      <Card className="shrink-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          {/* flex-wrap: até 6 controles na aba Saldos das Contas — em telas de notebook a barra
              quebra numa segunda linha em vez de espremer os campos até ficarem ilegíveis. As
              outras abas (Bancos/Contas Bancárias/Configurações) só têm o seletor de Empresa —
              o resto dos filtros é específico da matriz de saldos. */}
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">Empresas</label>
                  <SearchableSelect
                    multiple
                    value={companyIds}
                    onChange={(ids) => atualizarParams({ company_ids: ids })}
                    disabled={semEmpresa || loadingFiltros}
                    options={opcoesEmpresasSienge}
                    placeholder={semEmpresa ? 'Selecione a empresa primeiro' : loadingFiltros ? 'Carregando...' : 'Todas as empresas'}
                    emptyMessage="Nenhuma empresa encontrada."
                  />
                </div>

                <div className="sm:min-w-40 sm:max-w-64 sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Classificação</label>
                  <SearchableSelect
                    multiple
                    value={classificacoes}
                    onChange={(valores) => atualizarParams({ classificacoes: valores })}
                    disabled={semEmpresa}
                    options={OPCOES_CLASSIFICACAO}
                    placeholder={semEmpresa ? 'Selecione a empresa primeiro' : 'Todas as classificações'}
                    emptyMessage="Nenhuma classificação encontrada."
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

                {/* min-w-72: cada campo de data precisa de ~140px pra mostrar o ano inteiro
                    (dd/mm/aaaa + o ícone do calendário) — abaixo disso o ano é cortado, então
                    o grupo prefere quebrar pra segunda linha a ficar mais estreito. Sem as
                    setas de navegação de período (pedido do usuário), sobra só os 2 campos. */}
                <div className="flex min-w-0 items-end gap-1.5 sm:min-w-72 sm:max-w-sm sm:flex-1">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Data início</label>
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => handleData('data_inicio', e.target.value)}
                      disabled={semEmpresa}
                      className={CLASSE_DATA}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Data fim</label>
                    <input
                      type="date"
                      value={dataFim}
                      onChange={(e) => handleData('data_fim', e.target.value)}
                      disabled={semEmpresa}
                      className={CLASSE_DATA}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {abaAtiva === 'saldos' && (
            <div className="flex shrink-0 items-center gap-2">
              {/* Só ícone, no mesmo formato do botão Sincronizar da Gestão de Cobranças. */}
              <button
                type="button"
                onClick={() => setRefreshToken((n) => n + 1)}
                disabled={semEmpresa}
                title="Recarregar saldos"
                className="flex shrink-0 items-center justify-center rounded-lg bg-primary-600 p-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={18} />
              </button>
            </div>
          )}
        </div>
      </Card>

      <div>
        <Tabs tabs={TABS} activeId={abaAtiva} onChange={(aba) => atualizarParams({ aba })} />

        {abaAtiva === 'saldos' &&
          (erroPeriodo ? (
            <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
              <TriangleAlert size={28} className="mb-3 text-amber-500" />
              <h2 className="text-sm font-semibold text-gray-900">Período inválido</h2>
              <p className="mt-1 max-w-sm text-xs text-gray-500">{erroPeriodo}</p>
            </div>
          ) : (
            <SaldosContasTab
              empresaId={empresaId}
              dataInicio={dataInicio}
              dataFim={dataFim}
              companyIds={companyIds}
              classificacoes={classificacoes}
              bancos={bancos}
              infoBancos={infoBancos}
              refreshToken={refreshToken}
            />
          ))}

        {abaAtiva === 'bancos' && <BancosTab />}

        {abaAtiva === 'contas' && <ContasTab empresaId={empresaId} />}

        {abaAtiva === 'configuracoes' && (
          <AbaEmConstrucao
            icon={Settings}
            titulo="Configurações"
            descricao="Parâmetros da tela de Saldo Contas Bancárias — em desenvolvimento."
          />
        )}
      </div>
    </div>
  );
}
