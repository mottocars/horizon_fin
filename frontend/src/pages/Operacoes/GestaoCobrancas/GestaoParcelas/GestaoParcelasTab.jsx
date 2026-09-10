import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Eye, Mail, MessageCircle, Minus, Phone, Plus, Receipt, User } from 'lucide-react';
import Card from '../../../../components/Card';
import Pagination from '../../../../components/Pagination';
import TemplatePreviewModal from '../../../../components/TemplatePreviewModal';
import HistoricoParcelaModal from './HistoricoParcelaModal';
import { substituirVariaveis } from '../Comunicacao/constantes';
import {
  getResumoPorCentroCustoParcelas,
  getEtapasPorCluster,
  listParcelasPorEtapa,
  listParcelasCliente,
} from '../../../../api/gestaoParcelas.api';
import { CLUSTER_ORDEM, CLUSTER_LABEL, CLUSTER_TAG_ESTILO, CLUSTER_ICON, CLUSTER_ICON_COR, formatarData } from './constantes';

const LIMIT_PARCELAS = 50;

// Mesmo visual do Flag de EtapasTabela.jsx (Régua de Cobrança), só que
// somente leitura — aqui não dá pra ligar/desligar canal, só mostrar o que
// já está configurado pra esta etapa.
function IconeCanal({ ativo, tipo, Icone, label }) {
  const coresAtivo = {
    zap: 'border-emerald-200 bg-emerald-50 text-emerald-600',
    mail: 'border-primary-100 bg-primary-50 text-primary-600',
    call: 'border-amber-200 bg-amber-50 text-amber-600',
  };
  const cores = ativo ? coresAtivo[tipo] : 'border-gray-200 bg-gray-50 text-gray-300';
  return (
    <span title={label} aria-label={label} className={`flex h-6 w-6 items-center justify-center rounded border ${cores}`}>
      <Icone size={13} />
    </span>
  );
}

// Responsável pela etapa, em formato de status (mesmo espírito do selo
// "Regra dura" de ClusterClientesList.jsx) — cinza neutro por padrão
// (não é um aviso nem uma classificação, só uma informação), e um tom mais
// apagado quando ninguém está atribuído.
function StatusResponsavel({ nome }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        nome ? 'border-gray-200 bg-gray-100 text-gray-700' : 'border-gray-100 bg-gray-50 text-gray-400'
      }`}
    >
      <User size={11} />
      {nome || 'Sem responsável'}
    </span>
  );
}

// Drilldown inteiro numa tela só (mesmo espírito "acordeão" de
// ClientesTab.jsx/ClustersCobranca/CentrosCustoResumo.jsx, só que mais
// fundo): Centro de Custo → Cluster → Etapa → Cliente → Parcela (este
// último só aparece quando o cliente tem mais de 1 parcela na etapa — com
// 1 só, o clique no cliente já pula direto pro histórico dela, ver
// abrirCliente). Todo nível expandido é mais uma linha da MESMA tabela (só
// recuo/coluna crescentes, nunca uma tabela aninhada à parte) — nunca
// navega pra outra rota. Só 1
// item fica aberto por vez em cada nível (accordion exclusivo). `busca`
// (nome do cliente, vindo do filtro compartilhado no topo da tela, ver
// GestaoCobrancasPage.jsx) refaz a matriz inteira nos 3 níveis — mesmo
// espírito do filtro de cliente da aba Clientes (ClientesTab.jsx).
export default function GestaoParcelasTab({ empresaId, centroCustoIds = [], busca = '', refreshToken = 0 }) {
  const [centros, setCentros] = useState([]);
  const [carregandoCentros, setCarregandoCentros] = useState(false);
  const [centroExpandidoId, setCentroExpandidoId] = useState(null);

  const [clusterExpandido, setClusterExpandido] = useState(null);
  const [etapasResultado, setEtapasResultado] = useState(null);
  const [carregandoEtapas, setCarregandoEtapas] = useState(false);

  const [etapaExpandidaId, setEtapaExpandidaId] = useState(null);
  const [parcelasResultado, setParcelasResultado] = useState({ data: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  const [carregandoParcelas, setCarregandoParcelas] = useState(false);
  const [paginaParcelas, setPaginaParcelas] = useState(1);

  // Template sendo pré-visualizado no momento (ver TemplatePreviewModal.jsx)
  // — guarda a etapa inteira (já traz o template junto, ver
  // gestaoParcelas.service.js::getEtapasPorCluster).
  const [previewEtapa, setPreviewEtapa] = useState(null);

  // Nível 4 (folha de verdade): parcelas individuais de 1 cliente, dentro
  // da etapa aberta — só existe quando o cliente clicado tem mais de 1
  // parcela ali (com 1 só, pula direto pro histórico dela, ver
  // abrirCliente). `clienteParcelasId` guarda de quem é a lista aberta.
  const [clienteParcelasId, setClienteParcelasId] = useState(null);
  const [parcelasCliente, setParcelasCliente] = useState([]);
  const [carregandoParcelasCliente, setCarregandoParcelasCliente] = useState(false);

  // Parcela específica (bill_id+installment_id) cujo histórico de etapas
  // está aberto (ver HistoricoParcelaModal.jsx) — o histórico é sempre de 1
  // parcela só, nunca do cliente inteiro (um cliente pode ter outras
  // parcelas em etapas completamente diferentes).
  const [parcelaHistorico, setParcelaHistorico] = useState(null);

  // Guarda contra corrida — 1 ref por nível, cada um com requisições
  // independentes (mesmo padrão do resto da tela de Gestão de Cobranças).
  const requisicaoCentrosRef = useRef(0);
  const requisicaoEtapasRef = useRef(0);
  const requisicaoParcelasRef = useRef(0);
  const requisicaoParcelasClienteRef = useRef(0);

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

  // Reset "duro" só quando empresa/Centro de Custo mudam de verdade — a
  // busca por si só NÃO fecha o drilldown (mesmo espírito de
  // ClientesTab.jsx). Não precisa checar se o centro/cluster/etapa aberto
  // ainda existe no resultado novo: cada nível já só renderiza os itens com
  // `total_parcelas > 0` (ver `centrosComParcela`/`clustersComParcela`/
  // `etapasComParcela` abaixo) — um item que sumir da busca simplesmente
  // não aparece mais, sem UI órfã, e reaparece expandido sozinho se a busca
  // for limpa depois.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setCentroExpandidoId(null);
    setClusterExpandido(null);
    setEtapasResultado(null);
    setEtapaExpandidaId(null);
    setClienteParcelasId(null);
    setParcelasCliente([]);
  }, [empresaId, centroCustoIds]);

  // `refreshToken` não entra no corpo de `carregarCentros` — só precisa
  // disparar o efeito de novo toda vez que o botão "Sincronizar" terminar
  // uma ação, já que a tela lê tudo ao vivo e não teria outro jeito de
  // saber que o banco mudou (mesmo padrão de ClustersCobranca/
  // CentrosCustoResumo.jsx).
  useEffect(() => {
    carregarCentros();
  }, [carregarCentros, refreshToken]);

  const carregarEtapas = useCallback(() => {
    if (!clusterExpandido || !centroExpandidoId) return;
    const minhaRequisicao = ++requisicaoEtapasRef.current;
    setCarregandoEtapas(true);
    getEtapasPorCluster(empresaId, clusterExpandido, { costCenterIds: [centroExpandidoId], search: busca })
      .then((dados) => {
        if (minhaRequisicao === requisicaoEtapasRef.current) setEtapasResultado(dados);
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoEtapasRef.current) setCarregandoEtapas(false);
      });
  }, [empresaId, clusterExpandido, centroExpandidoId, busca]);

  useEffect(() => {
    carregarEtapas();
  }, [carregarEtapas]);

  const carregarParcelas = useCallback(
    (pagina) => {
      if (!etapaExpandidaId || !clusterExpandido || !centroExpandidoId) return;
      const minhaRequisicao = ++requisicaoParcelasRef.current;
      setCarregandoParcelas(true);
      listParcelasPorEtapa(empresaId, clusterExpandido, etapaExpandidaId, {
        page: pagina,
        limit: LIMIT_PARCELAS,
        costCenterIds: [centroExpandidoId],
        search: busca,
      })
        .then((dados) => {
          if (minhaRequisicao === requisicaoParcelasRef.current) setParcelasResultado(dados);
        })
        .finally(() => {
          if (minhaRequisicao === requisicaoParcelasRef.current) setCarregandoParcelas(false);
        });
    },
    [empresaId, clusterExpandido, centroExpandidoId, etapaExpandidaId, busca]
  );

  useEffect(() => {
    setPaginaParcelas(1);
    carregarParcelas(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregarParcelas]);

  useEffect(() => {
    if (paginaParcelas !== 1) carregarParcelas(paginaParcelas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginaParcelas]);

  function toggleCentro(id) {
    setCentroExpandidoId((atual) => {
      setClusterExpandido(null);
      setEtapasResultado(null);
      setEtapaExpandidaId(null);
      setClienteParcelasId(null);
      setParcelasCliente([]);
      return atual === id ? null : id;
    });
  }

  function toggleCluster(cluster) {
    setClusterExpandido((atual) => {
      setEtapaExpandidaId(null);
      setClienteParcelasId(null);
      setParcelasCliente([]);
      return atual === cluster ? null : cluster;
    });
  }

  function toggleEtapa(etapaId) {
    setEtapaExpandidaId((atual) => (atual === etapaId ? null : etapaId));
    setClienteParcelasId(null);
    setParcelasCliente([]);
  }

  // Clique num cliente: sempre busca as parcelas individuais dele nesta
  // etapa (a linha do cliente só tem nome+contagem, não os bill_id/
  // installment_id) — com 1 parcela só, pula direto pro histórico dela; com
  // mais de 1, abre a lista (nível 5) pra escolher qual.
  function abrirCliente(cliente, cluster) {
    if (clienteParcelasId === cliente.client_id) {
      setClienteParcelasId(null);
      setParcelasCliente([]);
      return;
    }
    setClienteParcelasId(cliente.client_id);
    setParcelasCliente([]);
    const minhaRequisicao = ++requisicaoParcelasClienteRef.current;
    setCarregandoParcelasCliente(true);
    listParcelasCliente(empresaId, cluster, etapaExpandidaId, cliente.client_id, {
      costCenterIds: [centroExpandidoId],
      search: busca,
    })
      .then((lista) => {
        if (minhaRequisicao !== requisicaoParcelasClienteRef.current) return;
        if (lista.length === 1) {
          setClienteParcelasId(null);
          setParcelaHistorico({
            billId: lista[0].bill_id,
            installmentId: lista[0].installment_id,
            clientName: cliente.client_name,
          });
        } else {
          setParcelasCliente(lista);
        }
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoParcelasClienteRef.current) setCarregandoParcelasCliente(false);
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

  // Centro/cluster/etapa sem nenhuma parcela não aparecem — mesmo critério
  // em todo nível (ver pedido: "não precisa existir esta linha").
  const centrosComParcela = centros.filter((c) => c.total_parcelas > 0);
  const semDados = !carregandoCentros && centrosComParcela.length === 0;

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
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="py-3 pl-3 font-medium">Centro de Custo</th>
                  <th className="py-3 text-center font-medium">Parcelas</th>
                  {CLUSTER_ORDEM.map((cluster) => {
                    const Icone = CLUSTER_ICON[cluster];
                    return (
                      <th key={cluster} className="py-3 text-center font-medium" title={CLUSTER_LABEL[cluster]}>
                        {Icone && <Icone size={15} className={`inline ${CLUSTER_ICON_COR[cluster]}`} />}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {centrosComParcela.map((centro) => {
                  const centroAberto = centroExpandidoId === centro.cost_center_id;
                  const clustersComParcela = CLUSTER_ORDEM.filter((cluster) => (centro.clusters[cluster] || 0) > 0);
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
                        <td className="py-3 text-center tabular-nums text-gray-900">
                          {centro.total_parcelas.toLocaleString('pt-BR')}
                        </td>
                        {CLUSTER_ORDEM.map((cluster) => (
                          <td key={cluster} className="py-3 text-center font-mono tabular-nums text-gray-900">
                            {centro.clusters[cluster]}
                          </td>
                        ))}
                      </tr>

                      {centroAberto &&
                        clustersComParcela.map((cluster) => {
                          const total = centro.clusters[cluster] || 0;
                          const Icone = CLUSTER_ICON[cluster];
                          const clusterAberto = clusterExpandido === cluster;
                          const etapasComParcela = etapasResultado?.etapas.filter((etapa) => etapa.total_parcelas > 0) || [];
                          return (
                            <Fragment key={cluster}>
                              <tr
                                onClick={() => toggleCluster(cluster)}
                                className={`cursor-pointer border-b border-gray-50 bg-gray-100 hover:bg-gray-200 ${clusterAberto ? 'font-semibold' : ''}`}
                              >
                                <td className="py-2.5 pl-9">
                                  <span className="flex items-center gap-2">
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-300 text-gray-500">
                                      {clusterAberto ? <Minus size={10} /> : <Plus size={10} />}
                                    </span>
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${CLUSTER_TAG_ESTILO[cluster]}`}
                                    >
                                      {Icone && <Icone size={13} className={CLUSTER_ICON_COR[cluster]} />}
                                      {CLUSTER_LABEL[cluster]}
                                    </span>
                                  </span>
                                </td>
                                <td className="py-2.5 text-center tabular-nums text-gray-900">
                                  {total.toLocaleString('pt-BR')}
                                </td>
                                <td colSpan={CLUSTER_ORDEM.length}></td>
                              </tr>

                              {clusterAberto && carregandoEtapas && (
                                <tr>
                                  <td colSpan={2 + CLUSTER_ORDEM.length} className="bg-gray-50 py-6 text-center text-sm text-gray-400">
                                    Carregando...
                                  </td>
                                </tr>
                              )}

                              {/* Etapa: mesmo nível de tabela de Centro de Custo/Cluster (não
                                  uma tabela aninhada à parte) — só mais uma coluna de recuo
                                  (pl-14), reaproveitando a mesma coluna "Parcelas" pra
                                  contagem e o mesmo colSpan de preenchimento à direita. */}
                              {clusterAberto &&
                                !carregandoEtapas &&
                                etapasComParcela.map((etapa) => {
                                  const etapaAberta = etapaExpandidaId === etapa.etapa_id;
                                  return (
                                    <Fragment key={etapa.etapa_id}>
                                      <tr
                                        className={`border-b border-gray-50 bg-gray-50 hover:bg-gray-100 ${etapaAberta ? 'font-semibold' : ''}`}
                                      >
                                        {/* justify-between deixa os ícones de canal + o botão de
                                            pré-visualizar sempre encostados na borda direita desta
                                            célula, alinhados na mesma posição em toda etapa —
                                            independente do tamanho do nome dela. */}
                                        <td className="py-2 pl-14 pr-3 text-gray-900">
                                          <span className="flex items-center justify-between gap-3">
                                            <span
                                              onClick={() => toggleEtapa(etapa.etapa_id)}
                                              className="flex min-w-0 cursor-pointer items-center gap-2"
                                            >
                                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-gray-200 text-gray-400">
                                                {etapaAberta ? <Minus size={9} /> : <Plus size={9} />}
                                              </span>
                                              <span className="truncate">{etapa.etapa_nome}</span>
                                            </span>
                                            <span className="flex shrink-0 items-center gap-2">
                                              <StatusResponsavel nome={etapa.responsavel_nome} />
                                              <IconeCanal ativo={etapa.canal_whatsapp} tipo="zap" Icone={MessageCircle} label="WhatsApp" />
                                              <IconeCanal ativo={etapa.canal_email} tipo="mail" Icone={Mail} label="E-mail" />
                                              <IconeCanal ativo={etapa.canal_ligacao} tipo="call" Icone={Phone} label="Ligação" />
                                              <button
                                                type="button"
                                                onClick={() => setPreviewEtapa(etapa)}
                                                disabled={!etapa.template}
                                                aria-label="Pré-visualizar template"
                                                title={etapa.template ? 'Pré-visualizar template' : 'Esta etapa não tem template configurado'}
                                                className="ml-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-gray-200 bg-white text-gray-400 hover:border-primary-100 hover:bg-primary-50 hover:text-primary-600 disabled:opacity-30 disabled:hover:border-gray-200 disabled:hover:bg-white disabled:hover:text-gray-400"
                                              >
                                                <Eye size={13} />
                                              </button>
                                            </span>
                                          </span>
                                        </td>
                                        <td
                                          onClick={() => toggleEtapa(etapa.etapa_id)}
                                          className="cursor-pointer py-2 text-center font-mono tabular-nums text-gray-900"
                                        >
                                          {etapa.total_parcelas}
                                        </td>
                                        <td onClick={() => toggleEtapa(etapa.etapa_id)} className="cursor-pointer" colSpan={CLUSTER_ORDEM.length}></td>
                                      </tr>

                                      {/* Cliente: mesmo nível de tabela dos de cima — só o nome
                                          e a quantidade de parcelas dele nesta etapa, na mesma
                                          coluna "Parcelas", com mais um passo de recuo (pl-24 —
                                          um degrau mais largo que os de cima, pra deixar clara a
                                          hierarquia de 4 níveis). Sem cabeçalho próprio: a busca
                                          que filtra esta lista já fica no topo da tela (mesmo
                                          filtro de cliente da aba Clientes), não precisa repetir
                                          aqui. */}
                                      {etapaAberta && carregandoParcelas && (
                                        <tr>
                                          <td colSpan={2 + CLUSTER_ORDEM.length} className="bg-gray-50 py-6 text-center text-sm text-gray-400">
                                            Carregando...
                                          </td>
                                        </tr>
                                      )}

                                      {etapaAberta && !carregandoParcelas && parcelasResultado.data.length === 0 && (
                                        <tr>
                                          <td colSpan={2 + CLUSTER_ORDEM.length} className="bg-gray-50 py-6 text-center text-sm text-gray-400">
                                            Nenhum cliente encontrado.
                                          </td>
                                        </tr>
                                      )}

                                      {etapaAberta &&
                                        !carregandoParcelas &&
                                        parcelasResultado.data.map((cliente) => {
                                          const clienteAberto = clienteParcelasId === cliente.client_id;
                                          return (
                                            <Fragment key={cliente.client_id}>
                                              <tr
                                                onClick={() => abrirCliente(cliente, cluster)}
                                                className={`cursor-pointer border-b border-gray-50 bg-gray-50 hover:bg-gray-100 ${clienteAberto ? 'font-semibold' : ''}`}
                                              >
                                                <td className="py-2 pl-24 text-gray-900">
                                                  {cliente.client_name || `Cliente ${cliente.client_id}`}
                                                </td>
                                                <td className="py-2 text-center font-mono tabular-nums text-gray-900">
                                                  {cliente.total_parcelas}
                                                </td>
                                                <td colSpan={CLUSTER_ORDEM.length}></td>
                                              </tr>

                                              {/* Parcela: nível 5 (folha de verdade), mesma tabela —
                                                  só aparece quando o cliente tem mais de 1 parcela
                                                  nesta etapa (com 1 só, o clique acima já pula direto
                                                  pro histórico dela). Mostra o número do documento
                                                  (pra diferenciar contratos) e o vencimento de cada
                                                  uma. */}
                                              {clienteAberto && carregandoParcelasCliente && (
                                                <tr>
                                                  <td colSpan={2 + CLUSTER_ORDEM.length} className="bg-gray-50 py-4 text-center text-sm text-gray-400">
                                                    Carregando...
                                                  </td>
                                                </tr>
                                              )}

                                              {clienteAberto &&
                                                !carregandoParcelasCliente &&
                                                parcelasCliente.map((parcela) => {
                                                  const documento = [parcela.document_identification_name, parcela.document_number]
                                                    .filter(Boolean)
                                                    .join(' ');
                                                  return (
                                                    <tr
                                                      key={`${parcela.bill_id}-${parcela.installment_id}`}
                                                      onClick={() =>
                                                        setParcelaHistorico({
                                                          billId: parcela.bill_id,
                                                          installmentId: parcela.installment_id,
                                                          clientName: cliente.client_name,
                                                        })
                                                      }
                                                      className="cursor-pointer border-b border-gray-50 bg-white hover:bg-gray-50"
                                                    >
                                                      <td className="py-2 pl-32 text-gray-700">
                                                        <span className="flex flex-wrap items-baseline gap-x-2">
                                                          <span className="font-medium text-gray-900">
                                                            Parcela {parcela.installment_number || parcela.installment_id}
                                                          </span>
                                                          {documento && <span className="text-xs text-gray-400">{documento}</span>}
                                                          <span className="text-xs text-gray-400">
                                                            Venc. {formatarData(parcela.due_date)}
                                                          </span>
                                                        </span>
                                                      </td>
                                                      <td colSpan={1 + CLUSTER_ORDEM.length}></td>
                                                    </tr>
                                                  );
                                                })}
                                            </Fragment>
                                          );
                                        })}

                                      {etapaAberta && !carregandoParcelas && parcelasResultado.pagination.totalPages > 1 && (
                                        <tr>
                                          <td colSpan={2 + CLUSTER_ORDEM.length} className="bg-gray-50 px-2 pb-2">
                                            <Pagination
                                              page={paginaParcelas}
                                              totalPages={parcelasResultado.pagination.totalPages}
                                              onChange={setPaginaParcelas}
                                            />
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })}
                            </Fragment>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <TemplatePreviewModal
        open={Boolean(previewEtapa)}
        onClose={() => setPreviewEtapa(null)}
        mensagemWhatsApp={substituirVariaveis(previewEtapa?.template?.corpo)}
        mensagemEmail={substituirVariaveis(previewEtapa?.template?.corpo)}
        assuntoEmail={substituirVariaveis(previewEtapa?.template?.assunto)}
        anexo={Boolean(previewEtapa?.template?.enviar_boleto)}
        contatoNome="Horizon Financeiro"
        legenda={
          <>
            Simulação de como a mensagem apareceria pro cliente, com as variáveis (@nome_cliente etc.) já substituídas
            por dados de exemplo — texto real do template{' '}
            <b className="font-medium text-gray-700">{previewEtapa?.template?.nome}</b>, cadastrado na aba Comunicação.
          </>
        }
      />

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
