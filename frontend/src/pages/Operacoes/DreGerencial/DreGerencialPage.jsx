import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Calculator } from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';

// Só 2 abas por enquanto — o `{ divider: true }` separa a DRE (a demonstração em si) do
// Orçamento (o parâmetro por trás da projeção), mesmo padrão de SaldoContasBancariasPage.jsx
// (que separa "Saldos das Contas" de "Bancos" e as demais abas de cadastro/parâmetro).
const TABS = [
  { id: 'dre', label: 'DRE', icon: BarChart3 },
  { divider: true },
  { id: 'orcamento', label: 'Orçamento', icon: Calculator },
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
          </div>
        </div>
      </Card>

      <div>
        <Tabs tabs={TABS} activeId={abaAtiva} onChange={(aba) => atualizarParams({ aba })} />

        {abaAtiva === 'dre' && (
          <EmBreve icon={BarChart3} titulo="DRE" descricao="Demonstração do Resultado do Exercício — em desenvolvimento." />
        )}

        {abaAtiva === 'orcamento' && (
          <EmBreve icon={Calculator} titulo="Orçamento" descricao="Parâmetros de orçamento da DRE — em desenvolvimento." />
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
