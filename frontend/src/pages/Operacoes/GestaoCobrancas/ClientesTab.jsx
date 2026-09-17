import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Contact, Minus, Plus } from 'lucide-react';
import Card from '../../../components/Card';
import Pagination from '../../../components/Pagination';
import {
  getResumoCentroCustoCustomers,
  listClientesPorCentroCusto,
  setComunicarCentroCusto,
  setComunicarCliente,
} from '../../../api/customersSienge.api';

const LIMITE_PAGINA = 50;

// Drilldown de 2 níveis, mesmo estilo "acordeão" de
// ClustersCobranca/CentrosCustoResumo.jsx (nível 0 = Centro de Custo,
// +/- expande/recolhe, só 1 aberto por vez) — mas sem o nível de cluster
// no meio: aqui o próprio drill de baixo já é a lista de clientes daquele
// centro, direto. "Cliente" aqui é sempre "cliente ATIVO" — alguém com
// pelo menos 1 conta em aberto (saldo <> 0) naquele centro de custo (ver
// customers.service.js::getResumoPorCentroCusto/listClientesPorCentroCusto)
// — quem já quitou tudo não aparece, mesmo se já foi cliente daquele
// centro algum dia.
// `busca` (o texto de busca de cliente) vem de fora agora — mora ao lado do
// filtro de Centro de Custo, no topo da tela (ver GestaoCobrancasPage.jsx),
// não mais dentro do card. A MATRIZ INTEIRA reage a ela, não só a lista de
// dentro de um centro já expandido: um centro sem nenhum cliente ativo
// batendo com a busca some do nível 1 (ver carregar abaixo), e a contagem
// "Clientes ativos" mostrada já é a filtrada (ver
// customers.service.js::getResumoPorCentroCusto).
export default function ClientesTab({ empresaId, centroCustoIds = [], busca = '', refreshToken = 0 }) {
  const [centros, setCentros] = useState([]);
  const [carregando, setCarregando] = useState(false);

  const [centroExpandidoId, setCentroExpandidoId] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [clientes, setClientes] = useState(null);
  const [carregandoClientes, setCarregandoClientes] = useState(false);
  // Id do cliente com o próprio checkbox em voo (aguardando resposta do PUT)
  // — só trava aquela linha, não a tabela inteira. `'todos'` trava o
  // checkbox do cabeçalho enquanto o "marcar/desmarcar todos" está em voo.
  const [marcandoId, setMarcandoId] = useState(null);

  // Mesma guarda contra corrida usada em CentrosCustoResumo.jsx — uma pra
  // lista de centros, outra pro detalhe (clientes) do centro expandido.
  const requisicaoListaRef = useRef(0);
  const requisicaoDetalheRef = useRef(0);

  // Recarrega a cada tecla da busca (é dependência aqui) — por isso NÃO
  // fecha o drilldown incondicionalmente a cada chamada (só fecharia a
  // cada letra digitada). Só solta o centro expandido se ele mesmo sumiu
  // do resultado novo (a busca não bate com nenhum cliente ativo dele) —
  // o reset incondicional (mudança de empresa/filtro de cima) é outro
  // efeito, logo abaixo.
  const carregar = useCallback(() => {
    if (!empresaId) {
      setCentros([]);
      return;
    }
    const minhaRequisicao = ++requisicaoListaRef.current;
    setCarregando(true);
    getResumoCentroCustoCustomers(empresaId, { costCenterIds: centroCustoIds, search: busca })
      .then((dados) => {
        if (minhaRequisicao !== requisicaoListaRef.current) return;
        setCentros(dados);
        setCentroExpandidoId((atual) => {
          if (atual && !dados.some((c) => c.cost_center_id === atual)) {
            setClientes(null);
            return null;
          }
          return atual;
        });
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoListaRef.current) setCarregando(false);
      });
  }, [empresaId, centroCustoIds, busca]);

  // Reset "duro": empresa ou filtro de Centro de Custo mudaram de verdade
  // (ou uma sincronização nova terminou) — fecha o drilldown incondicional,
  // mesmo que por coincidência o mesmo cost_center_id ainda apareça no
  // resultado novo (poderia ser outro centro, de outra empresa). A busca
  // NÃO entra aqui de propósito — ela usa o reset condicional de dentro de
  // `carregar` acima, senão fechava o drilldown a cada tecla digitada.
  useEffect(() => {
    setCentroExpandidoId(null);
    setClientes(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, centroCustoIds, refreshToken]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  const carregarClientes = useCallback(() => {
    if (!centroExpandidoId) return;
    const minhaRequisicao = ++requisicaoDetalheRef.current;
    setCarregandoClientes(true);
    listClientesPorCentroCusto(empresaId, centroExpandidoId, { search: busca, page: pagina, limit: LIMITE_PAGINA })
      .then((dados) => {
        if (minhaRequisicao === requisicaoDetalheRef.current) setClientes(dados);
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoDetalheRef.current) setCarregandoClientes(false);
      });
  }, [centroExpandidoId, empresaId, busca, pagina]);

  useEffect(() => {
    carregarClientes();
  }, [carregarClientes, refreshToken]);

  // Busca agora é um filtro de fora (ver comentário no topo do arquivo) —
  // muda de valor sem ninguém aqui "saber" além deste efeito, então quem
  // zera a página pra não sobrar numa página que não existe mais no
  // resultado novo é este useEffect, não mais um handler local.
  useEffect(() => {
    setPagina(1);
  }, [busca]);

  function toggleExpandido(id) {
    setCentroExpandidoId((atual) => {
      const abrindo = atual !== id;
      setClientes(null);
      setPagina(1);
      return abrindo ? id : null;
    });
  }

  // Cada cliente tem a própria flag: alterna só a linha clicada, espera a
  // resposta do servidor (mesmo espírito do Switch de EtapasTabela.jsx —
  // sem otimismo, o valor exibido é sempre o que o backend confirmou) e
  // atualiza só aquele item na lista já carregada. Recarrega também o
  // resumo (nível 1), já que o "Comunicar" do centro de custo (ver
  // handleToggleComunicarCentro abaixo) reflete se TODOS os clientes dele
  // estão marcados — mudar 1 cliente pode mudar esse agregado.
  async function handleToggleComunicar(clientId, valorAtual) {
    setMarcandoId(clientId);
    try {
      const resultado = await setComunicarCliente(empresaId, clientId, !valorAtual);
      setClientes((prev) =>
        prev
          ? { ...prev, data: prev.data.map((c) => (c.client_id === clientId ? { ...c, comunicar: resultado.comunicar } : c)) }
          : prev
      );
      carregar();
    } finally {
      setMarcandoId(null);
    }
  }

  // Checkbox "Comunicar" do PRÓPRIO nível de Centro de Custo — ao lado da
  // linha, funciona sem precisar expandir (ver `stopPropagation` no
  // onClick, senão clicar nele também abriria/fecharia o drilldown, já que
  // a linha inteira é clicável). Marca/desmarca todo cliente ativo do
  // centro que bater com a busca atual (mesmo filtro que já decide se este
  // centro aparece e qual a contagem dele, ver carregar acima — a matriz é
  // toda consistente com a mesma busca). Reflete `centro.todos_comunicam`
  // (TRUE só quando ninguém do filtro está desmarcado, ver
  // customers.service.js::getResumoPorCentroCusto).
  async function handleToggleComunicarCentro(centro) {
    setMarcandoId(`centro-${centro.cost_center_id}`);
    try {
      await setComunicarCentroCusto(empresaId, centro.cost_center_id, !centro.todos_comunicam, busca);
      carregar();
      if (centroExpandidoId === centro.cost_center_id) carregarClientes();
    } finally {
      setMarcandoId(null);
    }
  }

  if (!empresaId) {
    return (
      <Card className="flex min-h-[280px] rounded-tl-none flex-col items-center justify-center text-center">
        <Contact size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver os clientes com conta em aberto, por centro de custo.
        </p>
      </Card>
    );
  }

  const semDados = !carregando && centros.length === 0;

  return (
    <Card className="rounded-tl-none">
      {carregando ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : semDados ? (
        <div className="flex min-h-[120px] flex-col items-center justify-center text-center">
          <p className="text-sm text-gray-500">
            Nenhum cliente com conta em aberto encontrado{centroCustoIds.length > 0 ? ' com o filtro escolhido' : ''}.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="py-3 pl-3 font-medium">Centro de Custo</th>
                <th className="py-3 text-center font-medium">Clientes ativos</th>
                {/* Largura/padding em px fixo (não a escala padrão do
                    Tailwind) pra fazer este checkbox cair exatamente em
                    cima do checkbox "Comunicar" da tabela de clientes
                    aninhada mais abaixo (2 tabelas diferentes, larguras de
                    coluna diferentes — sem isso as duas colunas "Comunicar"
                    ficam desalinhadas). Valores calibrados medindo a
                    posição real dos dois checkboxes lado a lado, não
                    chutados — se mexer no texto/ícone de "Centro de Custo"
                    ou "Clientes ativos" (que empurram a largura desta
                    coluna), meça de novo. */}
                <th className="w-[140px] py-3 pr-[18px] text-center font-medium">Comunicar</th>
              </tr>
            </thead>
            <tbody>
              {centros.map((centro) => {
                const expandido = centroExpandidoId === centro.cost_center_id;
                return (
                  <Fragment key={centro.cost_center_id}>
                    <tr
                      onClick={() => toggleExpandido(centro.cost_center_id)}
                      className={`cursor-pointer border-b border-gray-50 hover:bg-gray-100 ${expandido ? 'bg-gray-100 font-semibold' : ''}`}
                    >
                      <td className="py-3 pl-3 text-gray-900">
                        <span className="flex items-center gap-2">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                            {expandido ? <Minus size={10} /> : <Plus size={10} />}
                          </span>
                          {centro.cost_center_name}
                        </span>
                      </td>
                      <td className="py-3 text-center tabular-nums text-gray-900">
                        {centro.total_clientes_ativos.toLocaleString('pt-BR')}
                      </td>
                      <td className="w-[140px] py-3 pr-[18px] text-center">
                        <input
                          type="checkbox"
                          checked={centro.todos_comunicam}
                          disabled={marcandoId !== null}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => handleToggleComunicarCentro(centro)}
                          className="h-3.5 w-3.5 accent-primary-600 disabled:opacity-40"
                          aria-label={
                            centro.todos_comunicam
                              ? `Desmarcar todos os clientes de ${centro.cost_center_name}`
                              : `Marcar todos os clientes de ${centro.cost_center_name}`
                          }
                          title="Marca/desmarca todos os clientes ativos deste centro de custo"
                        />
                      </td>
                    </tr>

                    {expandido && (
                      <tr>
                        <td colSpan={3} className="bg-gray-50 p-4">
                          {carregandoClientes ? (
                            <div className="py-6 text-center text-sm text-gray-400">Carregando...</div>
                          ) : !clientes || clientes.data.length === 0 ? (
                            <div className="py-6 text-center text-sm text-gray-400">
                              {busca ? 'Nada encontrado com essa busca.' : 'Nenhum cliente ativo neste centro de custo.'}
                            </div>
                          ) : (
                            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                              <table className="w-full text-left text-sm">
                                <thead>
                                  <tr className="border-b border-gray-100 text-[10.5px] uppercase tracking-wide text-gray-400">
                                    <th className="py-2 pl-3 font-medium">Cliente</th>
                                    <th className="py-2 font-medium">CPF/CNPJ</th>
                                    <th className="py-2 font-medium">Telefone</th>
                                    <th className="py-2 font-medium">E-mail</th>
                                    {/* Sem checkbox de "marcar todos" aqui — é redundante com o
                                        checkbox do próprio Centro de Custo (nível de cima, ver
                                        handleToggleComunicarCentro), que já marca/desmarca todos os
                                        clientes ativos dele. */}
                                    <th className="w-28 py-2 pr-3 text-center font-medium">Comunicar</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {clientes.data.map((c) => (
                                    <tr key={c.client_id} className="border-t border-gray-50">
                                      <td className="py-2 pl-3 text-gray-900">{c.name || '—'}</td>
                                      <td className="py-2 font-mono text-xs text-gray-500">{c.cpf || c.cnpj || '—'}</td>
                                      <td className="py-2 font-mono text-xs text-gray-500">{c.telefone || '—'}</td>
                                      <td className="py-2 text-xs text-gray-500">{c.email || '—'}</td>
                                      <td className="w-28 py-2 pr-3 text-center">
                                        <input
                                          type="checkbox"
                                          checked={c.comunicar}
                                          disabled={marcandoId !== null}
                                          onChange={() => handleToggleComunicar(c.client_id, c.comunicar)}
                                          className="h-3.5 w-3.5 accent-primary-600 disabled:opacity-40"
                                          aria-label={`Comunicar com ${c.name || 'este cliente'}`}
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {clientes.pagination.totalPages > 1 && (
                                <div className="border-t border-gray-100 px-2">
                                  <Pagination page={pagina} totalPages={clientes.pagination.totalPages} onChange={setPagina} />
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
