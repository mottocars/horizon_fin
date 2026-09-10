import { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import Modal from '../../../components/Modal';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import {
  listCentrosCurvaVendas,
  getCurvaVendas,
  salvarPrevistoVendas,
  listUnidadesDisponiveisCurvaVendas,
  salvarPrevistoPorUnidades,
  listUnidadesVendidasNoMes,
} from '../../../api/curva-vendas.api';
import { statusConfig } from '../../../utils/statusUnidade';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
function formatInteiroBR(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  const num = Number(valor);
  if (Number.isNaN(num)) return '';
  return Math.trunc(num).toLocaleString('pt-BR');
}

function maskInteiroBRInput(raw) {
  const digitos = raw.replace(/\D/g, '');
  return digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const MESES_ABREV = [
  '', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function PrevistoInput({ linha, onChangeValor }) {
  const [valor, setValor] = useState(formatInteiroBR(linha.previsto ?? 0));

  useEffect(() => {
    setValor(formatInteiroBR(linha.previsto ?? 0));
  }, [linha.previsto]);

  function handleChange(raw) {
    if (!/^[0-9.]*$/.test(raw)) return;
    const mascarado = maskInteiroBRInput(raw);
    setValor(mascarado);

    const numerico = mascarado.replace(/\./g, '');
    if (numerico === '' || Number.isNaN(Number(numerico))) return;
    onChangeValor(linha.ano, linha.mes, Number(numerico));
  }

  return (
    <div className="relative inline-block">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={valor}
        onChange={(e) => handleChange(e.target.value)}
        className="w-32 rounded-md border border-gray-200 py-1 pl-7 pr-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
      />
    </div>
  );
}

export default function CurvaDeVendasPage() {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');

  const [centros, setCentros] = useState([]);
  const [loadingCentros, setLoadingCentros] = useState(false);
  const [siengeId, setSiengeId] = useState('');

  const [curva, setCurva] = useState(null);
  const [loadingCurva, setLoadingCurva] = useState(false);

  const [unidadesDisponiveis, setUnidadesDisponiveis] = useState([]);
  const [loadingUnidadesDisponiveis, setLoadingUnidadesDisponiveis] = useState(false);
  const [modalUnidades, setModalUnidades] = useState(null);
  const [selecionadas, setSelecionadas] = useState(new Set());

  const [unidadesVendidas, setUnidadesVendidas] = useState([]);
  const [loadingUnidadesVendidas, setLoadingUnidadesVendidas] = useState(false);
  const [modalVendidas, setModalVendidas] = useState(null);

  const previstoPendenteRef = useRef(new Map());

  function chavePendenteStorage(empId, sId) {
    return `curvaVendasPendente:${empId}:${sId}`;
  }

  function lerPendenteStorage(empId, sId) {
    try {
      const raw = sessionStorage.getItem(chavePendenteStorage(empId, sId));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function persistirPendenteStorage(empId, sId) {
    try {
      const mapa = Object.fromEntries(previstoPendenteRef.current);
      if (Object.keys(mapa).length === 0) {
        sessionStorage.removeItem(chavePendenteStorage(empId, sId));
      } else {
        sessionStorage.setItem(chavePendenteStorage(empId, sId), JSON.stringify(mapa));
      }
    } catch {
      // sessionStorage indisponível — segue apenas com o estado em memória
    }
  }

  function limparPendenteStorage(empId, sId) {
    try {
      sessionStorage.removeItem(chavePendenteStorage(empId, sId));
    } catch {
      // ignora
    }
  }

  function registrarPrevistoPendente(ano, mes, valorPrevisto) {
    previstoPendenteRef.current.set(`${ano}-${mes}`, { ano, mes, valorPrevisto });
    persistirPendenteStorage(empresaId, siengeId);
  }

  async function flushPrevistoPendente(empId, sId) {
    const pendentes = [...previstoPendenteRef.current.values()];
    if (pendentes.length === 0 || !empId || !sId) return;
    previstoPendenteRef.current.clear();
    limparPendenteStorage(empId, sId);
    for (const p of pendentes) {
      try {
        await salvarPrevistoVendas(empId, sId, { ano: p.ano, mes: p.mes, valorPrevisto: p.valorPrevisto });
      } catch (err) {
        console.error('Falha ao salvar previsto pendente', err);
      }
    }
  }

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
    listCentrosCurvaVendas(empresaId)
      .then(setCentros)
      .finally(() => setLoadingCentros(false));
  }, [empresaId]);

  function carregarCurva() {
    if (!empresaId || !siengeId) return;
    setLoadingCurva(true);
    return getCurvaVendas(empresaId, siengeId)
      .then((dados) => {
        const pendentesSalvos = lerPendenteStorage(empresaId, siengeId);
        previstoPendenteRef.current = new Map(Object.entries(pendentesSalvos));

        if (previstoPendenteRef.current.size > 0 && dados?.curva) {
          dados = {
            ...dados,
            curva: dados.curva.map((linha) => {
              const pendente = previstoPendenteRef.current.get(`${linha.ano}-${linha.mes}`);
              return pendente ? { ...linha, previsto: pendente.valorPrevisto } : linha;
            }),
          };
        }

        setCurva(dados);
      })
      .finally(() => setLoadingCurva(false));
  }

  useEffect(() => {
    setCurva(null);
    setUnidadesDisponiveis([]);
    carregarCurva();
    return () => {
      flushPrevistoPendente(empresaId, siengeId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, siengeId]);

  function abrirModalUnidades(ano, mes, somenteLeitura = false) {
    setModalUnidades({ ano, mes, somenteLeitura });
    setSelecionadas(new Set());
    setUnidadesDisponiveis([]);
    setLoadingUnidadesDisponiveis(true);
    listUnidadesDisponiveisCurvaVendas(empresaId, siengeId, ano, mes)
      .then((lista) => {
        setUnidadesDisponiveis(lista);
        setSelecionadas(new Set(lista.filter((u) => u.alocada_neste_mes).map((u) => u.sienge_unit_id)));
      })
      .finally(() => setLoadingUnidadesDisponiveis(false));
  }

  function fecharModalUnidades() {
    setModalUnidades(null);
    setSelecionadas(new Set());
  }

  function abrirModalVendidas(ano, mes) {
    setModalVendidas({ ano, mes });
    setUnidadesVendidas([]);
    setLoadingUnidadesVendidas(true);
    listUnidadesVendidasNoMes(empresaId, siengeId, ano, mes)
      .then(setUnidadesVendidas)
      .finally(() => setLoadingUnidadesVendidas(false));
  }

  function fecharModalVendidas() {
    setModalVendidas(null);
  }

  function toggleUnidadeSelecionada(id) {
    if (modalUnidades?.somenteLeitura) return;
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalSelecionado = useMemo(() => {
    return unidadesDisponiveis
      .filter((u) => selecionadas.has(u.sienge_unit_id))
      .reduce((soma, u) => soma + (Number(u.valor) || 0), 0);
  }, [unidadesDisponiveis, selecionadas]);

  function grupoDaUnidade(u) {
    return u.alocada_em_outro_mes ? 'PROJETADO' : u.commercial_stock || 'Sem status';
  }

  const statusLegenda = useMemo(() => {
    const presentes = new Set(unidadesDisponiveis.map((u) => grupoDaUnidade(u)));
    return [...presentes].sort((a, b) =>
      statusConfig(a).label.localeCompare(statusConfig(b).label, 'pt-BR')
    );
  }, [unidadesDisponiveis]);

  const ORDEM_STATUS = ['D', 'R', 'V', 'PROJETADO'];

  const unidadesPorStatus = useMemo(() => {
    const grupos = new Map();
    const ordenadas = [...unidadesDisponiveis].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'pt-BR', { numeric: true })
    );
    for (const u of ordenadas) {
      const chave = grupoDaUnidade(u);
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(u);
    }
    return [...grupos.entries()].sort((a, b) => {
      const posA = ORDEM_STATUS.indexOf(a[0]);
      const posB = ORDEM_STATUS.indexOf(b[0]);
      if (posA === -1 && posB === -1) return a[0].localeCompare(b[0], 'pt-BR');
      if (posA === -1) return 1;
      if (posB === -1) return -1;
      return posA - posB;
    });
  }, [unidadesDisponiveis]);

  const totalVendidoNoMes = useMemo(
    () => unidadesVendidas.reduce((soma, u) => soma + (Number(u.valor) || 0), 0),
    [unidadesVendidas]
  );

  const vendidasPorTipo = useMemo(() => {
    const grupos = new Map();
    const ordenadas = [...unidadesVendidas].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'pt-BR', { numeric: true })
    );
    for (const u of ordenadas) {
      const chave = u.property_type && u.property_type.trim() !== '' ? u.property_type : 'Sem tipo';
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(u);
    }
    return [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [unidadesVendidas]);

  async function handleUsarValorSelecionado() {
    if (!modalUnidades) return;
    await salvarPrevistoPorUnidades(empresaId, siengeId, {
      ano: modalUnidades.ano,
      mes: modalUnidades.mes,
      unitIds: [...selecionadas],
    });
    await carregarCurva();
    fecharModalUnidades();
  }

  const centroSelecionado = useMemo(
    () => centros.find((c) => String(c.sienge_id) === String(siengeId)),
    [centros, siengeId]
  );

  const totais = useMemo(() => {
    if (!curva?.vinculado) return null;
    const totalValorContrato = curva.curva.reduce((soma, l) => soma + (l.valorContrato || 0), 0);
    const totalPrevisto = curva.curva.reduce((soma, l) => soma + (l.previsto || 0), 0);
    return { totalValorContrato, totalPrevisto };
  }, [curva]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <TrendingUp size={20} />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Curva de Vendas</h2>
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
                        ? 'Nenhum centro com Lançamento e Entrega cadastrados'
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
          <p className="py-8 text-center text-sm text-gray-400">Carregando curva de vendas...</p>
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
            {curva.curva.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Nenhum mês encontrado para este empreendimento.</p>
            ) : (
              <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-20">
                  <tr className="border-b-2 border-gray-200 bg-white text-xs uppercase tracking-wide text-gray-400">
                    <th className="border-b-2 border-gray-200 bg-white py-2 pl-4 pr-3 text-left align-bottom font-medium">Mês/Ano</th>
                    <th className="border-b-2 border-gray-200 bg-white px-3 py-2 text-center align-bottom font-medium">Valor do Contrato</th>
                    <th className="border-b-2 border-gray-200 bg-white px-3 py-2 text-center align-bottom font-medium">Previsto</th>
                    <th className="border-b-2 border-gray-200 bg-white px-3 py-2 text-center align-bottom font-medium">Unidades</th>
                  </tr>
                </thead>
                <tbody>
                  {curva.curva.map((linha) => (
                    <tr key={`${linha.ano}-${linha.mes}`} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pl-4 pr-3 text-gray-600">
                        {MESES_ABREV[linha.mes]}/{linha.ano}
                      </td>
                      <td className="py-2.5 px-3 text-center text-gray-900">
                        {formatarMoeda(linha.valorContrato)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {linha.previstoBloqueado ? (
                          <span className="inline-block text-gray-400">
                            {formatarMoeda(linha.previsto)}
                          </span>
                        ) : (
                          <PrevistoInput linha={linha} onChangeValor={registrarPrevistoPendente} />
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {linha.passado ? (
                          <button
                            type="button"
                            onClick={() => abrirModalVendidas(linha.ano, linha.mes)}
                            className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                          >
                            {linha.unidadesCount} vendidas
                          </button>
                        ) : linha.previstoBloqueado ? (
                          <button
                            type="button"
                            onClick={() => abrirModalUnidades(linha.ano, linha.mes, true)}
                            className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                          >
                            {linha.unidadesCount} disponíveis
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => abrirModalUnidades(linha.ano, linha.mes)}
                            className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-600 hover:bg-primary-100"
                          >
                            {linha.unidadesCount} disponíveis
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="sticky bottom-0 z-20 border-t-2 border-gray-200 bg-white font-semibold text-gray-900">
                    <td className="py-3 pl-4 pr-3">Total</td>
                    <td className="py-3 px-3 text-center">{formatarMoeda(totais.totalValorContrato)}</td>
                    <td className="py-3 px-3 text-center">{formatarMoeda(totais.totalPrevisto)}</td>
                    <td className="py-3 px-3" />
                  </tr>
                </tfoot>
              </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Modal
        open={Boolean(modalUnidades)}
        onClose={fecharModalUnidades}
        title={modalUnidades ? `Unidades disponíveis — ${MESES_ABREV[modalUnidades.mes]}/${modalUnidades.ano}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {modalUnidades && (
          <div className="space-y-4">
            {loadingUnidadesDisponiveis ? (
              <p className="py-6 text-center text-sm text-gray-400">Carregando unidades...</p>
            ) : unidadesDisponiveis.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Nenhuma unidade encontrada.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {statusLegenda.map((codigo) => {
                    const config = statusConfig(codigo);
                    return (
                      <span key={codigo} className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
                        {config.label}
                      </span>
                    );
                  })}
                </div>

                <div className="max-h-80 overflow-auto rounded-lg border border-gray-100 p-3">
                  {unidadesPorStatus.map(([codigoStatus, unidadesDoStatus]) => (
                    <div key={codigoStatus} className="mb-4 last:mb-0">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {statusConfig(codigoStatus).label} ({unidadesDoStatus.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {unidadesDoStatus.map((u) => {
                          const somenteLeitura = modalUnidades.somenteLeitura;
                          const marcada = !somenteLeitura && selecionadas.has(u.sienge_unit_id);
                          const clicavel = !somenteLeitura && u.selecionavel;
                          const config = statusConfig(grupoDaUnidade(u));
                          return (
                            <button
                              key={u.sienge_unit_id}
                              type="button"
                              disabled={!clicavel}
                              onClick={() => toggleUnidadeSelecionada(u.sienge_unit_id)}
                              title={`${u.name} — ${config.label}`}
                              className={`flex w-24 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-center transition-all ${config.bg} ${config.text} ${
                                clicavel ? 'hover:scale-105 cursor-pointer' : 'cursor-default'
                              } ${
                                somenteLeitura
                                  ? 'opacity-100'
                                  : !u.selecionavel
                                    ? 'opacity-30'
                                    : marcada
                                      ? 'opacity-100'
                                      : 'opacity-50'
                              }`}
                            >
                              <span className="text-sm font-semibold leading-tight">{u.name}</span>
                              <span className="text-[11px] leading-tight opacity-90">
                                {formatarMoeda(u.valor)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {!modalUnidades.somenteLeitura && (
              <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span className="text-gray-500">Total selecionado</span>
                <span className="font-semibold text-gray-900">{formatarMoeda(totalSelecionado)}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              {modalUnidades.somenteLeitura ? (
                <Button type="button" variant="secondary" onClick={fecharModalUnidades}>
                  Fechar
                </Button>
              ) : (
                <>
                  <Button type="button" variant="secondary" onClick={fecharModalUnidades}>
                    Cancelar
                  </Button>
                  <Button type="button" onClick={handleUsarValorSelecionado}>
                    Usar este valor no Previsto
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(modalVendidas)}
        onClose={fecharModalVendidas}
        title={modalVendidas ? `Unidades vendidas — ${MESES_ABREV[modalVendidas.mes]}/${modalVendidas.ano}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {modalVendidas && (
          <div className="space-y-4">
            {loadingUnidadesVendidas ? (
              <p className="py-6 text-center text-sm text-gray-400">Carregando unidades...</p>
            ) : unidadesVendidas.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                Nenhuma unidade vendida neste mês.
              </p>
            ) : (
              <div className="max-h-80 overflow-auto rounded-lg border border-gray-100 p-3">
                {vendidasPorTipo.map(([tipo, unidadesDoTipo]) => (
                  <div key={tipo} className="mb-4 last:mb-0">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {tipo} ({unidadesDoTipo.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {unidadesDoTipo.map((u) => {
                        const config = statusConfig(u.commercial_stock);
                        return (
                          <div
                            key={u.sienge_unit_id}
                            title={`${u.name} — ${config.label}`}
                            className={`flex w-24 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-center ${config.bg} ${config.text}`}
                          >
                            <span className="text-sm font-semibold leading-tight">{u.name}</span>
                            <span className="text-[11px] leading-tight opacity-90">
                              {formatarMoeda(u.valor)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span className="text-gray-500">Total vendido no mês</span>
              <span className="font-semibold text-gray-900">{formatarMoeda(totalVendidoNoMes)}</span>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="button" variant="secondary" onClick={fecharModalVendidas}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
