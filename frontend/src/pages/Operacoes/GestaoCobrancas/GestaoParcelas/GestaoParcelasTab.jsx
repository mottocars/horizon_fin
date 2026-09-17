import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus, Receipt } from 'lucide-react';
import Card from '../../../../components/Card';
import HistoricoParcelaModal from './HistoricoParcelaModal';
import { getResumoPorCentroCustoParcelas, listClientesPorCentroCusto } from '../../../../api/gestaoParcelas.api';
import { CLUSTER_ORDEM, CLUSTER_LABEL, CLUSTER_ICON, CLUSTER_ICON_COR, formatarMoeda } from '../ClustersCobranca/constantes';

const TOTAL_COLUNAS = 2 + CLUSTER_ORDEM.length + 3;

// Vida de um cliente (ou, mais precisamente, de 1 título dele — ver
// listClientesPorCentroCusto) dentro do Centro de Custo: Nível 1 agrega por
// Centro de Custo (quantidade de CLIENTES por cluster — mesmos 4 clusters de
// "Clusters de Clientes" — mais os valores pago/vencido/a vencer); Nível 2,
// ao expandir, lista os clientes desse centro, 1 linha por cliente+título,
// com o cluster do cliente marcado (ícone aceso na coluna dele, cinza nas
// outras) e a parcela atual (a mais antiga em aberto; sem nenhuma em
// aberto, a última — título quitado). Etapa da régua/responsável/canais
// saíram da tela por enquanto (retomamos depois).
export default function GestaoParcelasTab({ empresaId, centroCustoIds = [], busca = '', refreshToken = 0 }) {
  const [centros, setCentros] = useState([]);
  const [carregandoCentros, setCarregandoCentros] = useState(false);
  const [centroExpandidoId, setCentroExpandidoId] = useState(null);

  const [clientes, setClientes] = useState([]);
  const [carregandoClientes, setCarregandoClientes] = useState(false);

  const [parcelaHistorico, setParcelaHistorico] = useState(null);

  // Guarda contra corrida — mesmo padrão do resto da tela de Gestão de
  // Cobranças (1 ref por nível, requisições independentes).
  const requisicaoCentrosRef = useRef(0);
  const requisicaoClientesRef = useRef(0);

  const carregarCentros = useCallback(() => {
    if (!empresaId) {
      setCentros([]);
      return;
    }
    const minhaRequisicao = ++requisicaoCentrosRef.current;
    setCarregandoCentros(true);
    getResumoPorCentroCustoParcelas(empresaId, { costCenterIds: centroCustoIds, search: busca })
      .then((dados) => {
        if (minhaRequisicao === requisicaoCentrosRef.current) setCentros(dados);
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoCentrosRef.current) setCarregandoCentros(false);
      });
  }, [empresaId, centroCustoIds, busca]);

  // Reset "duro" só quando empresa/Centro de Custo mudam de verdade — mesmo
  // espírito de ClientesTab.jsx (a busca por si só não fecha o drilldown).
  useEffect(() => {
    setCentroExpandidoId(null);
    setClientes([]);
  }, [empresaId, centroCustoIds]);

  useEffect(() => {
    carregarCentros();
  }, [carregarCentros, refreshToken]);

  const carregarClientes = useCallback(() => {
    if (!centroExpandidoId) return;
    const minhaRequisicao = ++requisicaoClientesRef.current;
    setCarregandoClientes(true);
    listClientesPorCentroCusto(empresaId, centroExpandidoId, { search: busca })
      .then((dados) => {
        if (minhaRequisicao === requisicaoClientesRef.current) setClientes(dados);
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoClientesRef.current) setCarregandoClientes(false);
      });
  }, [empresaId, centroExpandidoId, busca]);

  useEffect(() => {
    carregarClientes();
  }, [carregarClientes, refreshToken]);

  function toggleCentro(id) {
    setCentroExpandidoId((atual) => {
      setClientes([]);
      return atual === id ? null : id;
    });
  }

  if (!empresaId) {
    return (
      <Card className="flex min-h-[280px] rounded-tl-none flex-col items-center justify-center text-center">
        <Receipt size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver as parcelas em cobrança.
        </p>
      </Card>
    );
  }

  // Centro sem nenhum cliente com parcela (paga ou aberta) já vem filtrado
  // pelo backend (mesmo critério de cobrancaClusters.service.js::
  // getResumoPorCentroCusto) — não precisa filtrar de novo aqui.
  const semDados = !carregandoCentros && centros.length === 0;

  return (
    <div className="space-y-4">
      <Card className="rounded-tl-none">
        {carregandoCentros ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : semDados ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center text-center">
            <p className="text-sm text-gray-500">
              {busca ? 'Nenhum cliente encontrado com essa busca.' : 'Nenhuma parcela em cobrança encontrada.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* table-layout fixed + colgroup: sem isso, a largura de cada
                coluna é recalculada a partir do conteúdo das linhas
                visíveis (mesmo problema e mesma solução de RotinasTab.jsx)
                — abrir um Centro de Custo troca as linhas na tela e as
                colunas de cima (ícones de cluster, valores) "andavam" pra
                acomodar o conteúdo novo. Com largura fixa por coluna, elas
                ficam sempre no mesmo lugar, aberto ou fechado. */}
            <table className="w-full text-left text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col />
                <col className="w-27.5" />
                <col className="w-14" />
                <col className="w-14" />
                <col className="w-14" />
                <col className="w-14" />
                <col className="w-32.5" />
                <col className="w-32.5" />
                <col className="w-32.5" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-3 pl-3 font-medium">Centro de Custo</th>
                  <th className="py-3 text-center font-medium">Título</th>
                  {CLUSTER_ORDEM.map((cluster) => {
                    const Icone = CLUSTER_ICON[cluster];
                    return (
                      <th key={cluster} className="py-3 text-center font-medium" title={CLUSTER_LABEL[cluster]}>
                        {Icone && <Icone size={15} className={`inline ${CLUSTER_ICON_COR[cluster]}`} />}
                      </th>
                    );
                  })}
                  <th className="py-3 text-center font-medium">Pagas</th>
                  <th className="py-3 text-center font-medium">Vencidas</th>
                  <th className="py-3 pr-3 text-center font-medium">A vencer</th>
                </tr>
              </thead>
              <tbody>
                {centros.map((centro) => {
                  const centroAberto = centroExpandidoId === centro.cost_center_id;
                  return (
                    <Fragment key={centro.cost_center_id}>
                      <tr
                        onClick={() => toggleCentro(centro.cost_center_id)}
                        className={`cursor-pointer border-b border-gray-50 hover:bg-gray-100 ${centroAberto ? 'bg-gray-100 font-semibold' : ''}`}
                      >
                        <td className="py-3 pl-3 text-gray-900">
                          <span className="flex items-center gap-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-200 text-gray-500">
                              {centroAberto ? <Minus size={12} /> : <Plus size={12} />}
                            </span>
                            {centro.cost_center_name}
                          </span>
                        </td>
                        <td></td>
                        {CLUSTER_ORDEM.map((cluster) => (
                          <td key={cluster} className="py-3 text-center font-mono tabular-nums text-gray-900">
                            {centro.clusters[cluster]}
                          </td>
                        ))}
                        <td className="py-3 text-center tabular-nums text-gray-700">{formatarMoeda(centro.valor_pago)}</td>
                        <td className="py-3 text-center tabular-nums text-red-600">{formatarMoeda(centro.valor_vencido)}</td>
                        <td className="py-3 pr-3 text-center tabular-nums text-gray-700">{formatarMoeda(centro.valor_a_vencer)}</td>
                      </tr>

                      {centroAberto && carregandoClientes && (
                        <tr>
                          <td colSpan={TOTAL_COLUNAS} className="bg-gray-50 py-6 text-center text-sm text-gray-400">
                            Carregando...
                          </td>
                        </tr>
                      )}

                      {centroAberto && !carregandoClientes && clientes.length === 0 && (
                        <tr>
                          <td colSpan={TOTAL_COLUNAS} className="bg-gray-50 py-6 text-center text-sm text-gray-400">
                            Nenhum cliente encontrado.
                          </td>
                        </tr>
                      )}

                      {centroAberto &&
                        !carregandoClientes &&
                        clientes.map((cliente) => (
                          <tr
                            key={`${cliente.client_id}-${cliente.bill_id}`}
                            onClick={() =>
                              setParcelaHistorico({
                                billId: cliente.bill_id,
                                installmentId: cliente.parcela_atual_installment_id,
                                clientName: cliente.client_name,
                              })
                            }
                            className="cursor-pointer border-b border-gray-50 bg-gray-50 hover:bg-gray-100"
                          >
                            <td className="py-2.5 pl-9 text-gray-900">
                              {cliente.client_name || `Cliente ${cliente.client_id}`}
                            </td>
                            <td className="py-2.5 text-center text-xs text-gray-500">{cliente.bill_id}</td>
                            {CLUSTER_ORDEM.map((cluster) => {
                              const Icone = CLUSTER_ICON[cluster];
                              const doCliente = cluster === cliente.cluster;
                              return (
                                <td key={cluster} className="py-2.5 text-center">
                                  {Icone && (
                                    <Icone size={15} className={`inline ${doCliente ? CLUSTER_ICON_COR[cluster] : 'text-gray-300'}`} />
                                  )}
                                </td>
                              );
                            })}
                            <td className="py-2.5 text-center tabular-nums text-gray-700">{formatarMoeda(cliente.valor_pago)}</td>
                            <td className="py-2.5 text-center tabular-nums text-red-600">{formatarMoeda(cliente.valor_vencido)}</td>
                            <td className="py-2.5 pr-3 text-center tabular-nums text-gray-700">{formatarMoeda(cliente.valor_a_vencer)}</td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <HistoricoParcelaModal
        open={Boolean(parcelaHistorico)}
        onClose={() => setParcelaHistorico(null)}
        empresaId={empresaId}
        billId={parcelaHistorico?.billId}
        installmentId={parcelaHistorico?.installmentId}
        clientName={parcelaHistorico?.clientName}
      />
    </div>
  );
}
