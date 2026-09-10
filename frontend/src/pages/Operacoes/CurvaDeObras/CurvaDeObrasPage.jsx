import { useEffect, useMemo, useState } from 'react';
import { HardHat, AlertTriangle } from 'lucide-react';
import Card from '../../../components/Card';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { listCentrosCurva, getCurvaObra, salvarCalibragemManual } from '../../../api/curva-obras.api';
import { useAlert } from '../../../confirm/ConfirmContext';
import iconCef from '../../../assets/integracoes/portal-construtoras.svg';
import iconPrevision from '../../../assets/integracoes/prevision.svg';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';

const MESES_ABREV = [
  '', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

function formatarPercentual(valor) {
  if (valor === null || valor === undefined) return '—';
  return `${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function CalibragemInput({ linha, onSalvar }) {
  const [valor, setValor] = useState(linha.calibragemManual ?? '');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setValor(linha.calibragemManual ?? '');
  }, [linha.calibragemManual]);

  async function salvar() {
    if (valor === '' || Number.isNaN(Number(valor))) return;
    if (Number(valor) === linha.calibragemManual) return;
    setSalvando(true);
    try {
      await onSalvar(linha.ano, linha.mes, Number(valor));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <input
      type="number"
      step="0.01"
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      disabled={salvando}
      className="w-24 rounded-md border border-gray-200 px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
    />
  );
}

export default function CurvaDeObrasPage() {
  const alert = useAlert();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');

  const [centros, setCentros] = useState([]);
  const [loadingCentros, setLoadingCentros] = useState(false);
  const [siengeId, setSiengeId] = useState('');

  const [curva, setCurva] = useState(null);
  const [loadingCurva, setLoadingCurva] = useState(false);

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
    setCurva(null);
    setCentros([]);
    if (!empresaId) return;
    setLoadingCentros(true);
    listCentrosCurva(empresaId)
      .then(setCentros)
      .finally(() => setLoadingCentros(false));
  }, [empresaId]);

  function carregarCurva() {
    if (!empresaId || !siengeId) return;
    setLoadingCurva(true);
    return getCurvaObra(empresaId, siengeId)
      .then(setCurva)
      .finally(() => setLoadingCurva(false));
  }

  useEffect(() => {
    setCurva(null);
    carregarCurva();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, siengeId]);

  const centroSelecionado = useMemo(
    () => centros.find((c) => String(c.sienge_id) === String(siengeId)),
    [centros, siengeId]
  );

  async function handleSalvarCalibragem(ano, mes, avancoMes) {
    try {
      await salvarCalibragemManual(empresaId, siengeId, { ano, mes, avancoMes });
      await carregarCurva();
    } catch (err) {
      await alert({
        title: 'Não foi possível salvar a calibragem',
        description: err.response?.data?.message || 'Tente novamente em instantes.',
        variant: 'warning',
      });
    }
  }

  const totalCalibragem = curva?.vinculado ? curva.totalizador.totalCalibragem : null;
  const totalCalibragemOk = totalCalibragem !== null && Math.abs(totalCalibragem - 100) < 0.01;
  const showCef = Boolean(curva?.showCef);
  const showPrevision = Boolean(curva?.showPrevision);
  const showComparacao = showCef || showPrevision;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <HardHat size={20} />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Curva de Obras</h2>
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
                        ? 'Nenhum centro com Código Caixa, Prevision ou etapa de Obras cadastrada'
                        : 'Selecione um centro de custo'
                }
                emptyMessage="Nenhum centro de custo encontrado."
              />
            </div>
          </div>
        </div>
      </Card>

      {loadingCurva && (
        <Card>
          <p className="py-8 text-center text-sm text-gray-400">Carregando curva de obra...</p>
        </Card>
      )}

      {!loadingCurva && curva && !curva.vinculado && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <AlertTriangle size={22} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                {centroSelecionado?.name || 'Centro de custo'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">{curva.motivo}</p>
            </div>
          </div>
        </Card>
      )}

      {!loadingCurva && curva && curva.vinculado && (
        <>
          <Card className="!p-0 overflow-hidden">
            {curva.pls.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                Nenhum mês encontrado para esta obra.
              </p>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-white text-xs uppercase tracking-wide text-gray-400">
                      <th className="border-b-2 border-gray-200 bg-white py-2 pl-4 pr-3 text-left align-bottom font-medium">
                        Mês/Ano
                      </th>
                      {showCef && (
                        <>
                          <th className="border-b-2 border-l-2 border-orange-200 bg-orange-50 pb-2 pt-5 text-center align-bottom font-medium text-orange-700">
                            Avanço mês
                          </th>
                          <th className="relative border-b-2 border-orange-200 bg-orange-50 pb-2 pt-5 text-center align-bottom font-medium text-orange-700">
                            <span className="absolute left-1/2 top-1 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap text-[10px] normal-case tracking-normal text-orange-600">
                              <img src={iconCef} alt="" className="h-3 w-3" /> PLS CEF
                            </span>
                            Acumulado
                          </th>
                          <th className="border-b-2 border-r-2 border-orange-200 bg-orange-50 pb-2 pt-5 text-center align-bottom font-medium text-orange-700">
                            A avançar
                          </th>
                        </>
                      )}
                      {showPrevision && (
                        <>
                          <th className="border-b-2 border-l-2 border-indigo-300 bg-indigo-50 pb-2 pt-5 text-center align-bottom font-medium text-indigo-700">
                            Avanço mês
                          </th>
                          <th className="relative border-b-2 border-indigo-200 bg-indigo-50 pb-2 pt-5 text-center align-bottom font-medium text-indigo-700">
                            <span className="absolute left-1/2 top-1 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap text-[10px] normal-case tracking-normal text-indigo-600">
                              <img src={iconPrevision} alt="" className="h-3 w-3" /> Prevision
                            </span>
                            Acumulado
                          </th>
                          <th className="border-b-2 border-r-2 border-indigo-200 bg-indigo-50 pb-2 pt-5 text-center align-bottom font-medium text-indigo-700">
                            A avançar
                          </th>
                        </>
                      )}
                      <th className="border-b-2 border-gray-200 bg-white py-2 px-3 text-center align-bottom font-medium">
                        Calibragem Manual
                      </th>
                      {showComparacao && (
                        <th className="border-b-2 border-gray-200 bg-white py-2 px-3 text-center align-bottom font-medium">
                          Desvio PLS/Prevision
                        </th>
                      )}
                      <th className="border-b-2 border-gray-200 bg-white py-2 pl-3 pr-4 text-left align-bottom font-medium">
                        Enviado por
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {curva.pls.map((linha) => (
                      <tr key={`${linha.ano}-${linha.mes}`} className="border-b border-gray-50 last:border-0">
                        <td className="py-2.5 pl-4 pr-3 text-gray-600">
                          {MESES_ABREV[linha.mes]}/{linha.ano}
                        </td>
                        {showCef && (
                          <>
                            <td className="border-l-2 border-orange-100 bg-orange-50/40 py-2.5 text-center text-orange-900">
                              {formatarPercentual(linha.pls.avancoMes)}
                            </td>
                            <td className="bg-orange-50/40 py-2.5 text-center text-orange-900">
                              {formatarPercentual(linha.pls.avancoAcumulado)}
                            </td>
                            <td className="border-r-2 border-orange-100 bg-orange-50/40 py-2.5 text-center text-orange-700">
                              {formatarPercentual(linha.pls.aAvancar)}
                            </td>
                          </>
                        )}
                        {showPrevision && (
                          <>
                            <td className="border-l-2 border-indigo-200 bg-indigo-50/40 py-2.5 text-center text-indigo-900">
                              {formatarPercentual(linha.prevision.avancoMes)}
                            </td>
                            <td className="bg-indigo-50/40 py-2.5 text-center text-indigo-900">
                              {formatarPercentual(linha.prevision.avancoAcumulado)}
                            </td>
                            <td className="border-r-2 border-indigo-200 bg-indigo-50/40 py-2.5 text-center text-indigo-700">
                              {formatarPercentual(linha.prevision.aAvancar)}
                            </td>
                          </>
                        )}
                        <td className="py-2.5 px-3 text-center">
                          {linha.calibragemBloqueada ? (
                            <span className="inline-block rounded-md bg-amber-50 px-2 py-1 text-amber-700">
                              {formatarPercentual(linha.calibragemManual)}
                            </span>
                          ) : (
                            <CalibragemInput linha={linha} onSalvar={handleSalvarCalibragem} />
                          )}
                        </td>
                        {showComparacao && (
                          <td className="py-2.5 px-3 text-center text-gray-600">
                            {formatarPercentual(linha.desvioPlsPrevision)}
                          </td>
                        )}
                        <td className="py-2.5 pl-3 pr-4 text-gray-600">
                          {linha.calibragemBloqueada ? curva.enviadoPor || '—' : linha.calibradoPor || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="sticky bottom-0 z-20 border-t-2 border-gray-200 bg-white font-semibold text-gray-900">
                      <td className="py-3 pl-4 pr-3">Total</td>
                      {showCef && (
                        <>
                          <td className="border-l-2 border-orange-200 bg-orange-50 py-3 text-center text-orange-900">
                            {formatarPercentual(curva.totalizador.avancoMesTotal)}
                          </td>
                          <td className="bg-orange-50 py-3 text-center text-orange-900">
                            {formatarPercentual(curva.totalizador.avancoAcumuladoFinal)}
                          </td>
                          <td className="border-r-2 border-orange-200 bg-orange-50 py-3 text-center text-orange-900">
                            {formatarPercentual(curva.totalizador.aAvancarFinal)}
                          </td>
                        </>
                      )}
                      {showPrevision && (
                        <>
                          <td className="border-l-2 border-indigo-300 bg-indigo-50 py-3 text-center text-indigo-900">
                            {formatarPercentual(curva.totalizador.previsionMesTotal)}
                          </td>
                          <td className="bg-indigo-50 py-3 text-center text-indigo-900">
                            {formatarPercentual(curva.totalizador.previsionAcumuladoFinal)}
                          </td>
                          <td className="border-r-2 border-indigo-200 bg-indigo-50 py-3 text-center text-indigo-900">
                            {formatarPercentual(curva.totalizador.previsionAAvancarFinal)}
                          </td>
                        </>
                      )}
                      <td className={`py-3 px-3 text-center ${totalCalibragemOk ? '' : 'text-red-600'}`}>
                        {formatarPercentual(totalCalibragem)}
                      </td>
                      {showComparacao && <td className="py-3 px-3" />}
                      <td className="py-3 pl-3 pr-4" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
