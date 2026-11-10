import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, ReceiptText } from 'lucide-react';
import Card from '../../components/Card';
import Tabs from '../../components/Tabs';
import SearchableSelect from '../../components/SearchableSelect';
import { listEmpresas } from '../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../utils/empresa';
import { useEmpresaTravada } from '../../hooks/useEmpresaTravada';
import TitulosTab from './TitulosTab';
import TituloModal from './TituloModal';
import { mesAtual } from './util';

const TABS = [{ id: 'titulos', label: 'Títulos', icon: ReceiptText }];

const INPUT_DATA = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400';

// Cadastros › Contas Pagar / Receber. Empresa, aba e período (vencimento) na URL, como na DRE Gerencial —
// o "Voltar" do navegador volta pro mesmo lugar. Sem período na URL = o mês atual.
export default function ContasPagarReceberPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();
  const mes = mesAtual();
  const empresaId = searchParams.get('empresa_id') || '';
  const abaAtiva = searchParams.get('aba') || 'titulos';
  const inicio = searchParams.get('de') || mes.inicio;
  const fim = searchParams.get('ate') || mes.fim;

  function atualizarParams(patch) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([chave, valor]) => {
      if (valor === null || valor === undefined || valor === '') next.delete(chave);
      else next.set(chave, String(valor));
    });
    setSearchParams(next, { replace: true });
  }

  useEffect(() => {
    if (empresaTravada && empresaIdTravada && empresaId !== String(empresaIdTravada)) atualizarParams({ empresa_id: empresaIdTravada });
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
    if (!loadingEmpresas && !empresaId && empresas.length === 1) atualizarParams({ empresa_id: empresas[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingEmpresas, empresas, empresaId]);

  // Janela do título: 'novo' (o "+") ou o id do título clicado na listagem.
  const [tituloAberto, setTituloAberto] = useState(null);
  const [versao, setVersao] = useState(0);
  useEffect(() => setTituloAberto(null), [empresaId]);

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
                onChange={(v) => atualizarParams({ empresa_id: v || null })}
                disabled={loadingEmpresas || empresaTravada}
                options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
                placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
                emptyMessage="Nenhuma empresa encontrada."
              />
            </div>
            <div className="sm:w-40">
              <label className="mb-1 block text-sm font-medium text-gray-700">Data início</label>
              <input
                type="date"
                value={inicio}
                max={fim || undefined}
                onChange={(e) => e.target.value && atualizarParams({ de: e.target.value })}
                disabled={semEmpresa}
                className={INPUT_DATA}
              />
            </div>
            <div className="sm:w-40">
              <label className="mb-1 block text-sm font-medium text-gray-700">Data fim</label>
              <input
                type="date"
                value={fim}
                min={inicio || undefined}
                onChange={(e) => e.target.value && atualizarParams({ ate: e.target.value })}
                disabled={semEmpresa}
                className={INPUT_DATA}
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setTituloAberto('novo')}
              disabled={semEmpresa}
              title="Novo contas a pagar / a receber"
              aria-label="Novo título"
              className="flex shrink-0 items-center justify-center rounded-lg bg-primary-600 p-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </Card>

      <div>
        <Tabs tabs={TABS} activeId={abaAtiva} onChange={(aba) => atualizarParams({ aba })} />
        {semEmpresa ? (
          <div className="flex min-h-62 flex-col items-center justify-center rounded-card rounded-tl-none bg-white px-6 py-16 text-center shadow-card">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <ReceiptText size={22} />
            </span>
            <p className="text-sm font-medium text-gray-800">Selecione uma empresa para ver os títulos.</p>
          </div>
        ) : (
          abaAtiva === 'titulos' && (
            <TitulosTab empresaId={empresaId} inicio={inicio} fim={fim} versao={versao} onAbrir={(id) => setTituloAberto(id)} />
          )
        )}
      </div>

      {empresaId && tituloAberto && (
        <TituloModal
          empresaId={empresaId}
          id={tituloAberto === 'novo' ? null : tituloAberto}
          onClose={() => setTituloAberto(null)}
          onSalvo={() => setVersao((n) => n + 1)}
        />
      )}
    </div>
  );
}
