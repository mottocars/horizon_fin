import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus, Receipt } from 'lucide-react';
import Card from '../../../../components/Card';
import HistoricoParcelaModal from './HistoricoParcelaModal';
import {
  getResumoPorCentroCustoParcelas,
  listClientesPorCentroCusto,
  listParcelasPorTitulo,
} from '../../../../api/gestaoParcelas.api';
import { listSiengeIntegracoes } from '../../../../api/sienge.api';
import {
  CLUSTER_ORDEM,
  CLUSTER_LABEL,
  CLUSTER_ICON,
  CLUSTER_ICON_COR,
  CLUSTER_TAG_ESTILO,
  formatarData,
} from '../ClustersCobranca/constantes';

// Nome(1) + Título(1) + Vencimento(1) + clusters/status(4) + valores(3).
const TOTAL_COLUNAS = 3 + CLUSTER_ORDEM.length + 3;

// Divisores da grade — mesmo tom (gray-200) nos dois sentidos, de propósito
// (pedido do usuário: "escureça também com o mesmo tom" a linha que já
// existia entre as linhas). DIV_V só entra nas colunas depois da 1ª (Nome),
// senão sobraria uma borda solta colada na lateral esquerda da tabela.
const DIV_H = 'border-b border-gray-200';
const DIV_V = 'border-l border-gray-200';

// Borda de baixo do cabeçalho — mais grossa/escura que DIV_H de propósito
// (pedido do usuário: "borda evidente... quando ele estiver flutuando"),
// pra marcar bem o limite entre o cabeçalho fixo (sticky) e as linhas
// deslizando por baixo dele durante a rolagem.
const DIV_H_CABECALHO = 'border-b-2 border-gray-300';

// Mesmo formatarMoeda de ClustersCobranca/constantes.js, sem os centavos —
// só nesta tabela (pedido do usuário: "pode retirar os números após a
// vírgula"), pra não mexer no formato usado no resto do módulo.
function formatarMoedaSemCentavos(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

// installment_number (sie_income) vem no formato "3/12" (parcela 3 de 12) —
// mesmo helper de RotinasTab.jsx::numeroParcela, duplicado aqui de
// propósito (mesma convenção do módulo de não compartilhar entre abas). Só
// o número antes da barra, pra colar com bill_id na coluna Título.
function numeroParcela(installmentNumber) {
  return String(installmentNumber ?? '').split('/')[0];
}

// Mesmo link de RotinasTab.jsx::urlTituloSienge — direto pro título dentro
// do Sienge de verdade (precisa do tenant da integração desta empresa).
function urlTituloSienge(tenant, billId) {
  return `https://${tenant}.sienge.com.br/sienge/CRC/editTitulo.do?entity.tituloPK.nuTitulo=${billId}`;
}

// Os 4 status possíveis de 1 parcela (Nível 3) — nunca mais que isso (ver
// gestaoParcelas.service.js::listParcelasPorTitulo): paga em dia, paga com
// atraso, inadimplente (mesmo limite de dias do Motor de Risco da régua de
// Inadimplência) ou a vencer (em aberto e ainda dentro do limite). Cada um
// colore o retângulo inteiro do badge, não só o texto.
const STATUS_PARCELA = {
  em_dia: { label: 'Paga em Dia', className: 'bg-emerald-50 text-emerald-700' },
  atraso: { label: 'Paga com Atraso', className: 'bg-amber-50 text-amber-700' },
  inadimplente: { label: 'Inadimplente', className: 'bg-red-50 text-red-700' },
  a_vencer: { label: 'A vencer', className: 'bg-blue-50 text-blue-700' },
};

// Vida de um cliente (ou, mais precisamente, de 1 título dele — ver
// listClientesPorCentroCusto) dentro do Centro de Custo, até a parcela:
// Nível 1 agrega por Centro de Custo (quantidade de CLIENTES por cluster —
// mesmos 4 clusters de "Clusters de Clientes" — mais os valores pago/
// vencido/a vencer); Nível 2 lista os clientes desse centro, 1 linha por
// cliente+título, com o cluster do cliente marcado (ícone aceso na coluna
// dele, cinza nas outras); Nível 3, ao abrir um título, lista as parcelas
// individuais dele — aqui a coluna de cluster vira status (paga em dia/com
// atraso/inadimplente) e a de Título mostra bill_id/parcela, igual à aba
// Rotinas. Etapa da régua/responsável/canais saíram da tela por enquanto
// (retomamos depois).
export default function GestaoParcelasTab({
  empresaId,
  centroCustoIds = [],
  busca = '',
  statusParcela = [],
  refreshToken = 0,
}) {
  const [centros, setCentros] = useState([]);
  const [carregandoCentros, setCarregandoCentros] = useState(false);
  const [centroExpandidoId, setCentroExpandidoId] = useState(null);

  const [clientes, setClientes] = useState([]);
  const [carregandoClientes, setCarregandoClientes] = useState(false);

  // Nível 3: qual (cliente, título) está com as parcelas abertas — só 1 por
  // vez, mesmo acordeão exclusivo dos níveis de cima.
  const [tituloAberto, setTituloAberto] = useState(null);
  const [parcelas, setParcelas] = useState([]);
  const [carregandoParcelas, setCarregandoParcelas] = useState(false);

  const [parcelaHistorico, setParcelaHistorico] = useState(null);

  // Tenant da integração Sienge desta empresa — só pra montar o link da
  // coluna Título no Nível 3 (mesmo padrão de RotinasTab.jsx). Sem Sienge
  // configurado pra esta empresa, o Título continua aparecendo, só sem
  // virar link.
  const [siengeTenant, setSiengeTenant] = useState('');

  useEffect(() => {
    if (!empresaId) {
      setSiengeTenant('');
      return;
    }
    let ativo = true;
    listSiengeIntegracoes({ ativo: true, limit: 100 })
      .then((resultado) => {
        if (!ativo) return;
        const integracao = resultado.data.find((i) => String(i.empresa_id) === String(empresaId));
        setSiengeTenant(integracao?.tenant || '');
      })
      .catch(() => {
        if (ativo) setSiengeTenant('');
      });
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  // Guarda contra corrida — mesmo padrão do resto da tela de Gestão de
  // Cobranças (1 ref por nível, requisições independentes).
  const requisicaoCentrosRef = useRef(0);
  const requisicaoClientesRef = useRef(0);
  const requisicaoParcelasRef = useRef(0);

  const carregarCentros = useCallback(() => {
    if (!empresaId) {
      setCentros([]);
      return;
    }
    const minhaRequisicao = ++requisicaoCentrosRef.current;
    setCarregandoCentros(true);
    getResumoPorCentroCustoParcelas(empresaId, { costCenterIds: centroCustoIds, search: busca, statusParcela })
      .then((dados) => {
        if (minhaRequisicao === requisicaoCentrosRef.current) setCentros(dados);
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoCentrosRef.current) setCarregandoCentros(false);
      });
  }, [empresaId, centroCustoIds, busca, statusParcela]);

  // Reset "duro" só quando empresa/Centro de Custo/Tipo de Parcela mudam de
  // verdade — mesmo espírito de ClientesTab.jsx (a busca por si só não
  // fecha o drilldown). Trocar o filtro de tipo pode fazer o centro/cliente
  // aberto sumir da lista nova, então fecha o drilldown junto.
  useEffect(() => {
    setCentroExpandidoId(null);
    setClientes([]);
    setTituloAberto(null);
    setParcelas([]);
  }, [empresaId, centroCustoIds, statusParcela]);

  useEffect(() => {
    carregarCentros();
  }, [carregarCentros, refreshToken]);

  const carregarClientes = useCallback(() => {
    if (!centroExpandidoId) return;
    const minhaRequisicao = ++requisicaoClientesRef.current;
    setCarregandoClientes(true);
    listClientesPorCentroCusto(empresaId, centroExpandidoId, { search: busca, statusParcela })
      .then((dados) => {
        if (minhaRequisicao === requisicaoClientesRef.current) setClientes(dados);
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoClientesRef.current) setCarregandoClientes(false);
      });
  }, [empresaId, centroExpandidoId, busca, statusParcela]);

  useEffect(() => {
    carregarClientes();
  }, [carregarClientes, refreshToken]);

  const carregarParcelas = useCallback(() => {
    if (!tituloAberto || !centroExpandidoId) return;
    const minhaRequisicao = ++requisicaoParcelasRef.current;
    setCarregandoParcelas(true);
    listParcelasPorTitulo(empresaId, centroExpandidoId, tituloAberto.billId, { search: busca, statusParcela })
      .then((dados) => {
        if (minhaRequisicao === requisicaoParcelasRef.current) setParcelas(dados);
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoParcelasRef.current) setCarregandoParcelas(false);
      });
  }, [empresaId, centroExpandidoId, tituloAberto, busca, statusParcela]);

  useEffect(() => {
    carregarParcelas();
  }, [carregarParcelas, refreshToken]);

  function toggleCentro(id) {
    setCentroExpandidoId((atual) => {
      setClientes([]);
      setTituloAberto(null);
      setParcelas([]);
      return atual === id ? null : id;
    });
  }

  function toggleTitulo(clientId, billId) {
    setTituloAberto((atual) => {
      setParcelas([]);
      if (atual && atual.clientId === clientId && atual.billId === billId) return null;
      return { clientId, billId };
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

  // Cabeçalho da 1ª coluna reage a quantos níveis estão abertos agora.
  const tituloColuna = tituloAberto
    ? 'Centro de Custo / Cliente / Parcela'
    : centroExpandidoId
      ? 'Centro de Custo / Cliente'
      : 'Centro de Custo';

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
          // Nenhum wrapper com overflow-x/overflow-y próprio aqui de
          // propósito (pedido do usuário: só a barra de rolagem da página,
          // nunca uma 2ª barra dentro do card) — QUALQUER overflow
          // diferente de visible neste meio de caminho vira o "teto" onde o
          // `sticky` do thead passa a colar, e como essa div nunca teria
          // altura própria pra rolar de verdade, o cabeçalho ficava preso
          // nela e "fugia" junto quando a PÁGINA rolava (esse foi o bug que
          // o truque antigo de max-h+overflow-auto contornava, trocando por
          // uma 2ª barra de rolagem — o que o usuário não quer mais). Sem
          // overflow aqui, quem rola (nos 2 eixos) é o <main> do AppShell —
          // ele já tem overflow-y-auto, e o próprio CSS força overflow-x a
          // virar "auto" também nesse caso (regra do overflow computado),
          // então a rolagem horizontal da tabela larga continua funcionando,
          // só que na barra da página mesmo.
          <div>
            {/* table-layout fixed + colgroup: sem isso, a largura de cada
                coluna é recalculada a partir do conteúdo das linhas
                visíveis (mesmo problema e mesma solução de RotinasTab.jsx)
                — abrir um Centro de Custo troca as linhas na tela e as
                colunas de cima (ícones de cluster, valores) "andavam" pra
                acomodar o conteúdo novo. Com largura fixa por coluna, elas
                ficam sempre no mesmo lugar, aberto ou fechado.
                border-separate + spacing 0 (em vez do collapse padrão do
                Tailwind): é o que deixa as bordas de coluna (DIV_V) e de
                linha (DIV_H) previsíveis célula a célula, sem o navegador
                fundir/descartar uma borda por "conflito" com a vizinha. */}
            {/* text-xs na tabela inteira (era text-sm) — pedido do usuário:
                fontes um pouco menores, pra abrir espaço pra próxima coluna
                (Etapas) que ainda vai entrar. Boa parte da tabela (Nível 2/3)
                já usava text-xs antes; agora fica uniforme em todo canto. */}
            <table className="border-separate border-spacing-0 text-left text-xs" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col className="w-96" />
                <col className="w-10" />
                <col className="w-10" />
                <col className="w-10" />
                <col className="w-10" />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-44" />
                <col className="w-44" />
                <col className="w-44" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-white shadow-sm">
                <tr className="text-xs uppercase tracking-wide text-gray-400">
                  <th className={`${DIV_H_CABECALHO} py-2.5 pl-3 font-medium`}>{tituloColuna}</th>
                  {CLUSTER_ORDEM.map((cluster) => {
                    const Icone = CLUSTER_ICON[cluster];
                    return (
                      <th key={cluster} className={`${DIV_H_CABECALHO} ${DIV_V} py-2.5 text-center font-medium`} title={CLUSTER_LABEL[cluster]}>
                        {Icone && <Icone size={15} className={`inline ${CLUSTER_ICON_COR[cluster]}`} />}
                      </th>
                    );
                  })}
                  <th className={`${DIV_H_CABECALHO} ${DIV_V} px-2 py-2.5 text-center font-medium`}>Título</th>
                  <th className={`${DIV_H_CABECALHO} ${DIV_V} px-2 py-2.5 text-center font-medium`}>Vencimento</th>
                  <th className={`${DIV_H_CABECALHO} ${DIV_V} px-2 py-2.5 text-center font-medium`}>Pagas</th>
                  <th className={`${DIV_H_CABECALHO} ${DIV_V} px-2 py-2.5 text-center font-medium`}>Vencidas</th>
                  <th className={`${DIV_H_CABECALHO} ${DIV_V} px-2 py-2.5 text-center font-medium`}>A vencer</th>
                </tr>
              </thead>
              <tbody>
                {centros.map((centro) => {
                  const centroAberto = centroExpandidoId === centro.cost_center_id;
                  return (
                    <Fragment key={centro.cost_center_id}>
                      <tr
                        onClick={() => toggleCentro(centro.cost_center_id)}
                        className={`cursor-pointer hover:bg-gray-100 ${centroAberto ? 'bg-gray-100 font-semibold' : ''}`}
                      >
                        <td className={`${DIV_H} py-3 pl-3 text-gray-900`}>
                          <span className="flex items-center gap-2">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                              {centroAberto ? <Minus size={10} /> : <Plus size={10} />}
                            </span>
                            {centro.cost_center_name}
                          </span>
                        </td>
                        {CLUSTER_ORDEM.map((cluster) => (
                          <td key={cluster} className={`${DIV_H} ${DIV_V} py-3 text-center font-mono tabular-nums text-gray-900`}>
                            {centro.clusters[cluster]}
                          </td>
                        ))}
                        <td className={`${DIV_H} ${DIV_V} px-2 py-3 text-center`}></td>
                        <td className={`${DIV_H} ${DIV_V} px-2 py-3 text-center`}></td>
                        <td className={`${DIV_H} ${DIV_V} px-2 py-3 text-center tabular-nums text-gray-700`}>{formatarMoedaSemCentavos(centro.valor_pago)}</td>
                        <td className={`${DIV_H} ${DIV_V} px-2 py-3 text-center tabular-nums text-red-600`}>{formatarMoedaSemCentavos(centro.valor_vencido)}</td>
                        <td className={`${DIV_H} ${DIV_V} px-2 py-3 text-center tabular-nums text-gray-700`}>{formatarMoedaSemCentavos(centro.valor_a_vencer)}</td>
                      </tr>

                      {centroAberto && carregandoClientes && (
                        <tr>
                          <td colSpan={TOTAL_COLUNAS} className={`${DIV_H} bg-gray-50 py-6 text-center text-xs text-gray-400`}>
                            Carregando...
                          </td>
                        </tr>
                      )}

                      {centroAberto && !carregandoClientes && clientes.length === 0 && (
                        <tr>
                          <td colSpan={TOTAL_COLUNAS} className={`${DIV_H} bg-gray-50 py-6 text-center text-xs text-gray-400`}>
                            Nenhum cliente encontrado.
                          </td>
                        </tr>
                      )}

                      {centroAberto &&
                        !carregandoClientes &&
                        clientes.map((cliente) => {
                          const clienteAberto =
                            tituloAberto?.clientId === cliente.client_id && tituloAberto?.billId === cliente.bill_id;
                          return (
                            <Fragment key={`${cliente.client_id}-${cliente.bill_id}`}>
                              <tr
                                onClick={() => toggleTitulo(cliente.client_id, cliente.bill_id)}
                                className={`cursor-pointer bg-gray-50 hover:bg-gray-100 ${clienteAberto ? 'font-semibold' : ''}`}
                              >
                                <td className={`${DIV_H} py-2.5 pl-9 text-gray-900`}>
                                  <span className="flex items-center gap-2">
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                                      {clienteAberto ? <Minus size={10} /> : <Plus size={10} />}
                                    </span>
                                    {cliente.client_name || `Cliente ${cliente.client_id}`}
                                  </span>
                                </td>
                                {CLUSTER_ORDEM.map((cluster) => {
                                  const Icone = CLUSTER_ICON[cluster];
                                  const doCliente = cluster === cliente.cluster;
                                  return (
                                    <td
                                      key={cluster}
                                      className={`${DIV_H} ${DIV_V} py-2.5 text-center ${doCliente ? CLUSTER_TAG_ESTILO[cluster] : ''}`}
                                    >
                                      {Icone && <Icone size={14} className={`inline ${doCliente ? '' : 'text-gray-300'}`} />}
                                    </td>
                                  );
                                })}
                                <td className={`${DIV_H} ${DIV_V} px-2 py-2.5 text-center text-xs text-gray-500`}>{cliente.bill_id}</td>
                                <td className={`${DIV_H} ${DIV_V} px-2 py-2.5 text-center`}></td>
                                <td className={`${DIV_H} ${DIV_V} px-2 py-2.5 text-center tabular-nums text-gray-700`}>{formatarMoedaSemCentavos(cliente.valor_pago)}</td>
                                <td className={`${DIV_H} ${DIV_V} px-2 py-2.5 text-center tabular-nums text-red-600`}>{formatarMoedaSemCentavos(cliente.valor_vencido)}</td>
                                <td className={`${DIV_H} ${DIV_V} px-2 py-2.5 text-center tabular-nums text-gray-700`}>{formatarMoedaSemCentavos(cliente.valor_a_vencer)}</td>
                              </tr>

                              {clienteAberto && carregandoParcelas && (
                                <tr>
                                  <td colSpan={TOTAL_COLUNAS} className={`${DIV_H} bg-white py-6 text-center text-xs text-gray-400`}>
                                    Carregando...
                                  </td>
                                </tr>
                              )}

                              {clienteAberto && !carregandoParcelas && parcelas.length === 0 && (
                                <tr>
                                  <td colSpan={TOTAL_COLUNAS} className={`${DIV_H} bg-white py-6 text-center text-xs text-gray-400`}>
                                    Nenhuma parcela encontrada.
                                  </td>
                                </tr>
                              )}

                              {clienteAberto &&
                                !carregandoParcelas &&
                                parcelas.map((parcela) => {
                                  const status = parcela.status ? STATUS_PARCELA[parcela.status] : null;
                                  return (
                                    <tr
                                      key={parcela.installment_id}
                                      onClick={() =>
                                        setParcelaHistorico({
                                          billId: parcela.bill_id,
                                          installmentId: parcela.installment_id,
                                          clientName: cliente.client_name,
                                        })
                                      }
                                      className="cursor-pointer bg-white hover:bg-gray-50"
                                    >
                                      <td className={`${DIV_H} py-2 pl-16 text-gray-700`}>
                                        {parcela.payment_term_description || 'Parcela'} - {parcela.installment_number}
                                      </td>
                                      <td
                                        colSpan={CLUSTER_ORDEM.length}
                                        className={`${DIV_H} ${DIV_V} py-2 text-center text-xs font-medium ${status ? status.className : ''}`}
                                      >
                                        {status?.label}
                                      </td>
                                      <td className={`${DIV_H} ${DIV_V} whitespace-nowrap px-2 py-2 text-center text-xs text-gray-500`}>
                                        {siengeTenant ? (
                                          <a
                                            href={urlTituloSienge(siengeTenant, parcela.bill_id)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            title="Abrir título no Sienge"
                                            className="text-primary-600 hover:text-primary-700 hover:underline"
                                          >
                                            {parcela.bill_id} / {numeroParcela(parcela.installment_number)}
                                          </a>
                                        ) : (
                                          <>
                                            {parcela.bill_id} / {numeroParcela(parcela.installment_number)}
                                          </>
                                        )}
                                      </td>
                                      <td className={`${DIV_H} ${DIV_V} px-2 py-2 text-center text-xs text-gray-500`}>{formatarData(parcela.due_date)}</td>
                                      <td className={`${DIV_H} ${DIV_V} px-2 py-2 text-center text-xs tabular-nums text-gray-700`}>{formatarMoedaSemCentavos(parcela.valor_pago)}</td>
                                      <td className={`${DIV_H} ${DIV_V} px-2 py-2 text-center text-xs tabular-nums text-red-600`}>{formatarMoedaSemCentavos(parcela.valor_vencido)}</td>
                                      <td className={`${DIV_H} ${DIV_V} px-2 py-2 text-center text-xs tabular-nums text-gray-700`}>{formatarMoedaSemCentavos(parcela.valor_a_vencer)}</td>
                                    </tr>
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
