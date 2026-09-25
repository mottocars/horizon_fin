import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Calculator, Layers, ListTree, Plus, RefreshCw, Search } from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { gerarPlano } from '../../../api/planosFinanceirosSienge.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import CategoriasOrcamentoTab from './CategoriasOrcamentoTab';
import OrcamentoTab from './OrcamentoTab';
import PlanoDeContasTab from './PlanoDeContasTab';

// O `{ divider: true }` separa a DRE (a demonstração em si) das abas de cadastro/parâmetro que
// dão suporte a ela — Categorias Orçamento, Orçamento e Plano de Contas ficam juntas, sem
// divisor entre elas (mesmo padrão de SaldoContasBancariasPage.jsx, que separa "Saldos das
// Contas" de "Bancos" e as demais abas de cadastro/parâmetro).
const TABS = [
  { id: 'dre', label: 'DRE', icon: BarChart3 },
  { divider: true },
  { id: 'categorias-orcamento', label: 'Categorias Orçamento', icon: Layers },
  { id: 'orcamento', label: 'Orçamento', icon: Calculator },
  { id: 'plano-de-contas', label: 'Plano de Contas', icon: ListTree },
];

// Empresa e aba vivem na URL (não em useState local) — mesmo motivo de todas as outras telas
// com esse padrão (Saldo Contas Bancárias, Gestão de Cobranças): o "Voltar" do navegador
// devolve o usuário pro mesmo lugar, com a mesma empresa e a mesma aba.
export default function DreGerencialPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();

  const empresaId = searchParams.get('empresa_id') || '';
  const abaAtiva = searchParams.get('aba') || 'dre';

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
    atualizarParams({ empresa_id: novoId || null });
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

  // Botão "Nova categoria" fica aqui no topo (padrão do resto do sistema), mas o modal de criar
  // continua vivendo em CategoriasOrcamentoTab.jsx — dispara por ref, mesmo esquema de
  // ClassificacoesTab.jsx em Saldo Contas Bancárias.
  const categoriasOrcamentoTabRef = useRef(null);

  // Busca (nome ou código do centro de custo) da aba Orçamento — só conveniência de navegador,
  // não fica na URL (mesma convenção de bancosSearch/contasSearch em SaldoContasBancariasPage.jsx).
  const [buscaOrcamento, setBuscaOrcamento] = useState('');

  // Busca (nome ou código da conta) da aba Plano de Contas — mesma convenção acima.
  const [buscaPlanoContas, setBuscaPlanoContas] = useState('');

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

            {abaAtiva === 'plano-de-contas' && (
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
          </div>

          {abaAtiva === 'categorias-orcamento' && (
            <div className="flex shrink-0 items-center gap-2">
              <Button type="button" onClick={() => categoriasOrcamentoTabRef.current?.abrirNova()} disabled={semEmpresa}>
                <Plus size={16} />
                Nova categoria
              </Button>
            </div>
          )}

          {abaAtiva === 'plano-de-contas' && (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="flex shrink-0 items-center gap-2">
                {/* Só o ícone (pedido do usuário, mesmo padrão de ContasTab.jsx em Saldo Contas
                    Bancárias): "+" gera o plano de contas pela primeira vez, refresh atualiza
                    (traz novas contas) depois de já gerado — troca sozinho conforme
                    totalPlanoContas, reportado pela própria aba (onTotal). */}
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
              </div>
              {erroPlanoContas && <span className="text-xs text-red-600">{erroPlanoContas}</span>}
            </div>
          )}
        </div>
      </Card>

      <div>
        <Tabs tabs={TABS} activeId={abaAtiva} onChange={(aba) => atualizarParams({ aba })} />

        {abaAtiva === 'dre' && (
          <EmBreve icon={BarChart3} titulo="DRE" descricao="Demonstração do Resultado do Exercício — em desenvolvimento." />
        )}

        {abaAtiva === 'categorias-orcamento' && (
          <CategoriasOrcamentoTab ref={categoriasOrcamentoTabRef} empresaId={empresaId} />
        )}

        {abaAtiva === 'orcamento' && <OrcamentoTab empresaId={empresaId} search={buscaOrcamento} />}

        {abaAtiva === 'plano-de-contas' && (
          <PlanoDeContasTab
            empresaId={empresaId}
            search={buscaPlanoContas}
            refreshToken={refreshTokenPlanoContas}
            onTotal={setTotalPlanoContas}
          />
        )}
      </div>
    </div>
  );
}

function EmBreve({ icon: Icon, titulo, descricao }) {
  return (
    <Card className="flex min-h-70 flex-col items-center justify-center rounded-tl-none text-center">
      <Icon size={28} className="mb-3 text-gray-300" />
      <span className="mb-3 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary-600">
        Em breve
      </span>
      <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
      <p className="mt-1 max-w-sm text-xs text-gray-500">{descricao}</p>
    </Card>
  );
}
