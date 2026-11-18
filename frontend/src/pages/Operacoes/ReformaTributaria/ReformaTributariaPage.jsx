import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Percent, RefreshCw, Scale } from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { useAuth } from '../../../auth/AuthContext';
import { filtrarAbas } from '../../../utils/permissoes';
import ImpactoTab from './ImpactoTab';
import CentrosReformaTab from './CentrosReformaTab';
import AliquotasReformaTab from './AliquotasReformaTab';

// Operações › Reforma Tributária (pedido do usuário, 18/11/2026): o impacto da CBS/IBS (LC 214/2025) na
// DRE projetada. Impacto é a tela; Centros de Custos (o regime de cada obra) e Alíquotas (os parâmetros
// da empresa) são o que alimenta o impacto — o mesmo `{ divider: true }` de Cronogramas Obras separa os
// dois grupos. Empresa, aba e filtros vivem na URL (o "Voltar" do navegador volta pro mesmo lugar).
const TABS = [
  { id: 'impacto', label: 'Impacto', icon: Scale },
  { divider: true },
  { id: 'centros-custos', label: 'Centros de Custos', icon: Building2 },
  { id: 'aliquotas', label: 'Alíquotas', icon: Percent },
];

export default function ReformaTributariaPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const abas = useMemo(() => filtrarAbas(user, '/operacoes/reforma-tributaria', TABS), [user]);

  const empresaId = searchParams.get('empresa_id') || '';
  const abaAtiva = searchParams.get('aba') || 'impacto';
  const tabAtiva = abas.find((t) => t.id === abaAtiva) || abas[0];
  const textoCentros = searchParams.getAll('centro').join('|');
  const centrosMarcados = useMemo(() => (textoCentros ? textoCentros.split('|') : []), [textoCentros]);
  const ano = searchParams.get('ano') || '';

  function atualizarParams(patch) {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([chave, valor]) => {
      if (Array.isArray(valor)) {
        next.delete(chave);
        valor.forEach((v) => next.append(chave, String(v)));
        return;
      }
      const vazio = valor === null || valor === undefined || valor === '';
      if (vazio) next.delete(chave);
      else next.set(chave, String(valor));
    });
    setSearchParams(next, { replace: true });
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

  // Opções dos filtros do Impacto (centros com projeção e anos), devolvidas pela própria aba.
  const [opcoes, setOpcoes] = useState({ centros: [], anos: [] });
  const [recarregar, setRecarregar] = useState(0);
  const [carregando, setCarregando] = useState(false);

  return (
    <div className="space-y-4">
      <Card className="shrink-0">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-1 sm:flex-row sm:flex-wrap">
            <div className="sm:min-w-44 sm:max-w-xs sm:flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
              <SearchableSelect
                value={empresaId}
                onChange={(novoId) => atualizarParams({ empresa_id: novoId || null, centro: null, ano: null })}
                disabled={loadingEmpresas || empresaTravada}
                options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
                placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
                emptyMessage="Nenhuma empresa encontrada."
              />
            </div>

            {tabAtiva.id === 'impacto' && (
              <>
                <div className="sm:min-w-52 sm:max-w-xs sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Centro de custo</label>
                  <SearchableSelect
                    multiple
                    todosELimpar
                    value={centrosMarcados}
                    onChange={(v) => atualizarParams({ centro: v })}
                    disabled={!empresaId}
                    options={opcoes.centros.map((c) => ({ value: String(c.id), label: c.nome }))}
                    placeholder="Todos os centros"
                    larguraPainel={320}
                    alturaLista="max-h-80"
                  />
                </div>
                <div className="sm:min-w-40 sm:max-w-[12rem] sm:flex-1">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Período</label>
                  <SearchableSelect
                    value={ano}
                    onChange={(v) => atualizarParams({ ano: v || null })}
                    disabled={!empresaId}
                    clearable={false}
                    options={[{ value: '', label: 'Toda a projeção' }, ...opcoes.anos.map((a) => ({ value: String(a), label: String(a) }))]}
                  />
                </div>
              </>
            )}
          </div>

          {tabAtiva.id === 'impacto' && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setRecarregar((n) => n + 1)}
                disabled={carregando || !empresaId}
                title="Atualizar o impacto"
                className="flex items-center justify-center rounded-lg bg-primary-600 p-2 text-white hover:bg-primary-700 disabled:opacity-60"
              >
                <RefreshCw size={18} className={carregando ? 'animate-spin' : ''} />
              </button>
            </div>
          )}
        </div>
      </Card>

      <div>
        <Tabs tabs={abas} activeId={tabAtiva.id} onChange={(aba) => atualizarParams({ aba })} />

        {tabAtiva.id === 'centros-custos' ? (
          <CentrosReformaTab empresaId={empresaId} />
        ) : tabAtiva.id === 'aliquotas' ? (
          <AliquotasReformaTab empresaId={empresaId} />
        ) : (
          <ImpactoTab
            empresaId={empresaId}
            centros={centrosMarcados}
            ano={ano}
            recarregar={recarregar}
            onOpcoes={setOpcoes}
            onCarregando={setCarregando}
            onFiltrarCentro={(id) => atualizarParams({ centro: id ? [String(id)] : [] })}
            onIrPara={(aba) => atualizarParams({ aba })}
          />
        )}
      </div>
    </div>
  );
}
