import { useEffect, useMemo, useState } from 'react';
import { Map as MapIcon, RefreshCw } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import SearchableSelect from '../../components/SearchableSelect';
import { listEmpresas } from '../../api/empresas.api';
import { listItens } from '../../api/centrosCustoSienge.api';
import {
  listUnidadesPorCentro,
  gerarUnidades,
  listCentrosComUnidades,
  updateValorUnidade,
} from '../../api/unidadesSienge.api';
import { statusConfig } from '../../utils/statusUnidade';
import { nomeExibicaoEmpresa } from '../../utils/empresa';
import { parseBRNumber, formatBRNumber, maskBRNumberInput } from '../../utils/brNumber';
import { useEmpresaTravada } from '../../hooks/useEmpresaTravada';

const LIMIT = 2000;

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function formatarFracao(valor) {
  return `${(Number(valor || 0) * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}%`;
}

function formatarFracaoTotal(valor) {
  return `${(Number(valor || 0) * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export default function MapaDeUnidadesPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');

  const [centros, setCentros] = useState([]);
  const [loadingCentros, setLoadingCentros] = useState(false);
  const [siengeId, setSiengeId] = useState('');

  const [unidades, setUnidades] = useState([]);
  const [loadingUnidades, setLoadingUnidades] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erroSincronizacao, setErroSincronizacao] = useState('');

  const [statusFiltro, setStatusFiltro] = useState(null);

  const [unidadeEditando, setUnidadeEditando] = useState(null);
  const [valorEditado, setValorEditado] = useState('');
  const [salvandoValor, setSalvandoValor] = useState(false);
  const [erroValor, setErroValor] = useState('');

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

  useEffect(() => {
    setSiengeId('');
    setCentros([]);
    if (!empresaId) return;
    setLoadingCentros(true);
    Promise.all([listItens(empresaId, { limit: LIMIT }), listCentrosComUnidades(empresaId)])
      .then(([itensResult, enterpriseIds]) => {
        const idsComUnidades = new Set(enterpriseIds.map(String));
        setCentros(itensResult.data.filter((c) => idsComUnidades.has(String(c.sienge_id))));
      })
      .finally(() => setLoadingCentros(false));
  }, [empresaId]);

  function carregarUnidades() {
    if (!empresaId || !siengeId) return;
    setLoadingUnidades(true);
    return listUnidadesPorCentro(empresaId, siengeId)
      .then(setUnidades)
      .finally(() => setLoadingUnidades(false));
  }

  useEffect(() => {
    setUnidades([]);
    setStatusFiltro(null);
    carregarUnidades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, siengeId]);

  async function handleSincronizar() {
    setErroSincronizacao('');
    setSincronizando(true);
    try {
      await gerarUnidades(empresaId);
      await carregarUnidades();
    } catch (err) {
      setErroSincronizacao(
        err.response?.data?.message || 'Não foi possível sincronizar as unidades.'
      );
    } finally {
      setSincronizando(false);
    }
  }

  const agregados = useMemo(() => {
    const porStatus = {};
    let vgvTotal = 0;
    let fracaoIdealTotal = 0;
    let vgvVendido = 0;
    let vgvDisponivel = 0;

    for (const u of unidades) {
      const codigo = u.commercial_stock || '';
      porStatus[codigo] = (porStatus[codigo] || 0) + 1;

      const valor = Number(u.contract_sale_value) || Number(u.sale_value_price) || 0;
      vgvTotal += valor;
      fracaoIdealTotal += Number(u.ideal_fraction) || 0;
      if (codigo === 'V') vgvVendido += valor;
      if (codigo === 'D') vgvDisponivel += valor;
    }

    return { porStatus, vgvTotal, fracaoIdealTotal, vgvVendido, vgvDisponivel };
  }, [unidades]);

  const porTipo = useMemo(() => {
    const grupos = new Map();
    const ordenadas = [...unidades].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'pt-BR', { numeric: true })
    );
    for (const u of ordenadas) {
      const chave = u.property_type && u.property_type.trim() !== '' ? u.property_type : 'Sem tipo';
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(u);
    }
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [unidades]);

  const statusPresentes = useMemo(() => {
    return Object.keys(agregados.porStatus).sort((a, b) => {
      const labelA = statusConfig(a).label;
      const labelB = statusConfig(b).label;
      return labelA.localeCompare(labelB, 'pt-BR');
    });
  }, [agregados.porStatus]);

  function toggleFiltro(codigo) {
    setStatusFiltro((prev) => (prev === codigo ? null : codigo));
  }

  function abrirEdicaoValor(unidade) {
    setUnidadeEditando(unidade);
    setValorEditado(formatBRNumber(unidade.sale_value_price));
    setErroValor('');
  }

  function fecharEdicaoValor() {
    if (salvandoValor) return;
    setUnidadeEditando(null);
    setValorEditado('');
    setErroValor('');
  }

  async function handleSalvarValor(e) {
    e.preventDefault();
    setErroValor('');

    const valorNumerico = parseBRNumber(valorEditado);
    if (valorEditado !== '' && Number.isNaN(Number(valorNumerico))) {
      setErroValor('Informe um valor válido.');
      return;
    }

    setSalvandoValor(true);
    try {
      const atualizada = await updateValorUnidade(
        empresaId,
        unidadeEditando.sienge_unit_id,
        valorNumerico === '' ? 0 : Number(valorNumerico)
      );
      setUnidades((prev) =>
        prev.map((u) => (u.sienge_unit_id === atualizada.sienge_unit_id ? atualizada : u))
      );
      setUnidadeEditando(null);
    } catch (err) {
      setErroValor(err.response?.data?.message || 'Não foi possível salvar o valor.');
    } finally {
      setSalvandoValor(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
              <MapIcon size={20} />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Mapa de Unidades</h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="sm:w-96">
              <label className="mb-1 block text-xs font-medium text-gray-500">Empresa</label>
              <SearchableSelect
                value={empresaId}
                onChange={setEmpresaId}
                disabled={loadingEmpresas || empresaTravada}
                options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
                placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
                emptyMessage="Nenhuma empresa encontrada."
              />
            </div>

            <div className="sm:w-96">
              <label className="mb-1 block text-xs font-medium text-gray-500">Centro de Custo</label>
              <SearchableSelect
                value={siengeId}
                onChange={setSiengeId}
                disabled={!empresaId || loadingCentros}
                options={centros.map((centro) => ({ value: centro.sienge_id, label: centro.name }))}
                placeholder={
                  !empresaId
                    ? 'Selecione a empresa primeiro'
                    : loadingCentros
                      ? 'Carregando centros de custo...'
                      : centros.length === 0
                        ? 'Nenhum centro de custo com unidades importadas'
                        : 'Selecione um centro de custo'
                }
                emptyMessage="Nenhum centro de custo com unidades importadas."
              />
            </div>
          </div>
        </div>
      </Card>

      {siengeId && (
        <>
          {erroSincronizacao && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {erroSincronizacao}
            </div>
          )}

          {loadingUnidades ? (
            <Card>
              <p className="py-8 text-center text-sm text-gray-400">Carregando unidades...</p>
            </Card>
          ) : unidades.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-sm text-gray-500">
                  Nenhuma unidade encontrada para este centro de custo ainda.
                </p>
                <button
                  type="button"
                  onClick={handleSincronizar}
                  disabled={sincronizando}
                  className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                >
                  <RefreshCw size={16} className={sincronizando ? 'animate-spin' : ''} />
                  Sincronizar unidades do Sienge
                </button>
              </div>
            </Card>
          ) : (
            <>
              <Card>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-wrap gap-6">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        Unidades Totais
                      </p>
                      <p className="text-2xl font-semibold text-gray-900">{unidades.length}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        VGV Total
                      </p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {formatarMoeda(agregados.vgvTotal)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        VGV Vendido
                      </p>
                      <p className="text-2xl font-semibold text-red-600">
                        {formatarMoeda(agregados.vgvVendido)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        VGV Disponível
                      </p>
                      <p className="text-2xl font-semibold text-emerald-600">
                        {formatarMoeda(agregados.vgvDisponivel)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        Fração Ideal Total
                      </p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {formatarFracaoTotal(agregados.fracaoIdealTotal)}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSincronizar}
                    disabled={sincronizando}
                    title="Sincronizar unidades do Sienge"
                    className="flex shrink-0 items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <RefreshCw size={16} className={sincronizando ? 'animate-spin' : ''} />
                    Sincronizar
                  </button>
                </div>

                <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                  {statusPresentes.map((codigo) => {
                    const config = statusConfig(codigo);
                    const percentual = (agregados.porStatus[codigo] / unidades.length) * 100;
                    return (
                      <div
                        key={codigo}
                        className={config.bg}
                        style={{ width: `${percentual}%` }}
                        title={`${config.label}: ${agregados.porStatus[codigo]}`}
                      />
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                  {statusPresentes.map((codigo) => {
                    const config = statusConfig(codigo);
                    const ativo = statusFiltro === codigo;
                    const outroAtivo = statusFiltro !== null && !ativo;
                    return (
                      <button
                        key={codigo}
                        type="button"
                        onClick={() => toggleFiltro(codigo)}
                        className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs transition-opacity ${
                          outroAtivo ? 'opacity-40' : 'opacity-100'
                        } ${ativo ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
                        <span className="text-gray-600">{config.label}</span>
                        <span className="font-semibold text-gray-900">
                          {agregados.porStatus[codigo]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>

              <Card className="!p-0 overflow-hidden">
                <div className="p-4">
                  {porTipo.map(([tipo, unidadesDoTipo]) => {
                    const unidadesVisiveis =
                      statusFiltro === null
                        ? unidadesDoTipo
                        : unidadesDoTipo.filter((u) => (u.commercial_stock || '') === statusFiltro);

                    if (unidadesVisiveis.length === 0) return null;

                    return (
                      <div key={tipo} className="mb-5 last:mb-0">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {tipo}
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {unidadesVisiveis.map((u) => {
                            const config = statusConfig(u.commercial_stock);
                            return (
                              <button
                                key={u.sienge_unit_id}
                                type="button"
                                onClick={() => abrirEdicaoValor(u)}
                                title={`${u.name} — ${config.label} (clique para alterar o valor)`}
                                className={`flex w-28 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-center transition-transform hover:scale-105 hover:ring-2 hover:ring-offset-1 ${config.bg} ${config.text}`}
                              >
                                <span className="text-sm font-semibold leading-tight">{u.name}</span>
                                <span className="text-[11px] leading-tight opacity-90">
                                  {formatarMoeda(u.contract_sale_value || u.sale_value_price)}
                                </span>
                                <span className="text-[10px] leading-tight opacity-80">
                                  {formatarFracao(u.ideal_fraction)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}
        </>
      )}

      <Modal
        open={Boolean(unidadeEditando)}
        onClose={fecharEdicaoValor}
        title={unidadeEditando ? `Unidade ${unidadeEditando.name}` : ''}
        maxWidthClass="max-w-xs"
      >
        {unidadeEditando && (
          <form onSubmit={handleSalvarValor} className="space-y-4">
            {erroValor && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erroValor}</div>
            )}

            <p className="text-xs text-gray-400">
              Valor original da importação (Sienge):{' '}
              <span className="font-medium text-gray-600">
                {unidadeEditando.sale_value_price_original !== null &&
                unidadeEditando.sale_value_price_original !== undefined
                  ? formatarMoeda(unidadeEditando.sale_value_price_original)
                  : 'não informado'}
              </span>
            </p>

            {unidadeEditando.contract_sale_value !== null &&
              unidadeEditando.contract_sale_value !== undefined && (
                <p className="text-xs text-gray-400">
                  Valor do contrato de venda ({unidadeEditando.contract_situation}):{' '}
                  <span className="font-medium text-gray-600">
                    {formatarMoeda(unidadeEditando.contract_sale_value)}
                  </span>
                </p>
              )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Valor sugerido</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  R$
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  disabled={salvandoValor}
                  value={valorEditado}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (/^[0-9.,]*$/.test(raw)) setValorEditado(maskBRNumberInput(raw));
                  }}
                  className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={fecharEdicaoValor} disabled={salvandoValor}>
                Cancelar
              </Button>
              <Button type="submit" loading={salvandoValor}>
                Salvar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
