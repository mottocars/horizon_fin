import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { FilePenLine, Minus, Plus, TriangleAlert } from 'lucide-react';
import { listarCorrecoesDre, listarParcelasCorrecaoDre } from '../../../api/dreCorrecoes.api';

// Mesmo esquema de colunas da aba Orçamento (OrcamentoTab.jsx — pedido do usuário): primeira coluna
// fixa (fica com o espaço que sobrar), Total em azul logo depois e as colunas de valor. Depois dos
// valores, os dados da parcela (só preenchidos na linha da parcela; Unidade também no cliente).
const LARGURA_MINIMA_PRIMEIRA = 270;
const LARGURA_TOTAL = 130;

const COLUNAS_VALOR = [
  {
    chave: 'paga',
    rotulo: 'Paga',
    largura: 120,
    titulo: 'Correção das baixas em que o cliente pagou (recebimento, adiantamento…)',
  },
  {
    chave: 'reparcelada',
    rotulo: 'Reparcelada',
    largura: 120,
    titulo:
      'Correção das parcelas trocadas por outras num reparcelamento ou substituição — não entrou dinheiro, mas virou principal das parcelas novas',
  },
  {
    chave: 'em_aberto',
    rotulo: 'Em aberto',
    largura: 120,
    titulo: 'Saldo corrigido menos saldo das parcelas em aberto: a correção já acumulada e ainda não recebida',
  },
];

const COLUNAS_INFO = [
  { chave: 'unidade', rotulo: 'Unidade', largura: 95 },
  { chave: 'indexador', rotulo: 'Indexador', largura: 100 },
  { chave: 'vencimento', rotulo: 'Vencimento', largura: 100 },
  {
    chave: 'data_baixa',
    rotulo: 'Baixa',
    largura: 100,
    titulo: 'Data da última baixa com correção (recebimento ou reparcelamento)',
  },
];

// Zero aparece em branco (mesma convenção da aba Orçamento).
function valor(v) {
  const n = Number(v || 0);
  return n === 0 ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function total(linha) {
  return Number(linha.paga || 0) + Number(linha.reparcelada || 0) + Number(linha.em_aberto || 0);
}

function dataBr(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function dataHora(v) {
  return v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
}

function plural(n, um, varios) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

// Operações > DRE Gerencial > Correções: a correção monetária das parcelas a receber do Sienge, paga,
// reparcelada e em aberto (premissas em dre-correcoes/correcoes.service.js). Drilldown em 3 níveis:
// centro de custo (só os com "Realiza DRE", todos, como no Orçamento) → cliente → parcela. As parcelas
// de um cliente só são buscadas ao abri-lo (a GENESIS tem 40 mil parcelas com correção). Vários abertos
// ao mesmo tempo; com busca (cliente, unidade ou centro), abre os centros e mostra só os clientes que batem.
export default function CorrecoesTab({ empresaId, search = '' }) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [centrosAbertos, setCentrosAbertos] = useState([]);
  const [clientesAbertos, setClientesAbertos] = useState([]); // `${centroId}:${clienteId}`
  // `${centroId}:${clienteId}` -> lista de parcelas | 'carregando' | { erro }
  const [parcelas, setParcelas] = useState({});

  const carregar = useCallback(() => {
    if (!empresaId) {
      setDados(null);
      return;
    }
    setCarregando(true);
    setErroCarga('');
    listarCorrecoesDre(empresaId)
      .then(setDados)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar as correções.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setCentrosAbertos([]);
    setClientesAbertos([]);
    setParcelas({});
    carregar();
  }, [carregar]);

  const termo = search.trim().toLowerCase();
  const centros = useMemo(() => {
    const lista = dados?.centros || [];
    if (!termo) return lista;
    return lista
      .map((c) => {
        const centroBate = (c.nome || '').toLowerCase().includes(termo) || String(c.id).includes(termo);
        if (centroBate) return c;
        const clientes = c.clientes.filter(
          (k) => (k.nome || '').toLowerCase().includes(termo) || (k.unidades || '').toLowerCase().includes(termo)
        );
        // Totais do centro só com os clientes que bateram (a linha soma o que aparece embaixo).
        const soma = (campo) => clientes.reduce((t, k) => t + Number(k[campo] || 0), 0);
        return {
          ...c,
          clientes,
          paga: soma('paga'),
          reparcelada: soma('reparcelada'),
          em_aberto: soma('em_aberto'),
          parcelas: soma('parcelas'),
        };
      })
      .filter((c) => c.clientes.length);
  }, [dados, termo]);

  function alternarCentro(id) {
    setCentrosAbertos((atual) => (atual.includes(id) ? atual.filter((v) => v !== id) : [...atual, id]));
  }

  function alternarCliente(centroId, clienteId) {
    const chave = `${centroId}:${clienteId}`;
    const abrindo = !clientesAbertos.includes(chave);
    setClientesAbertos((atual) => (abrindo ? [...atual, chave] : atual.filter((v) => v !== chave)));
    if (abrindo && !Array.isArray(parcelas[chave]) && parcelas[chave] !== 'carregando') {
      setParcelas((atual) => ({ ...atual, [chave]: 'carregando' }));
      listarParcelasCorrecaoDre(empresaId, centroId, clienteId)
        .then((lista) => setParcelas((atual) => ({ ...atual, [chave]: lista })))
        .catch((err) =>
          setParcelas((atual) => ({
            ...atual,
            [chave]: { erro: err.response?.data?.message || 'Não foi possível carregar as parcelas.' },
          }))
        );
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <FilePenLine size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver as correções monetárias.</p>
      </div>
    );
  }

  const totalColunas = 2 + COLUNAS_VALOR.length + COLUNAS_INFO.length;
  const larguraMinima =
    LARGURA_MINIMA_PRIMEIRA +
    LARGURA_TOTAL +
    COLUNAS_VALOR.reduce((t, c) => t + c.largura, 0) +
    COLUNAS_INFO.reduce((t, c) => t + c.largura, 0);
  const celulaCentro = 'border-b border-l border-gray-200 bg-gray-50 px-2 text-right text-xs tabular-nums group-hover/obra:bg-gray-100';
  const celulaCliente = 'border-b border-l border-gray-100 bg-white px-2 text-xs group-hover/cliente:bg-gray-50';
  const celulaParcela = 'border-b border-l border-gray-100 bg-white px-2 py-1.5 text-xs';

  return (
    // min-w-fit: com tabela mais larga que a tela, o quadro branco cresce junto (mesmo esquema da
    // aba Orçamento).
    <div className="min-w-fit rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {dados?.ultima_atualizacao && (
        <div className="-mt-1 mb-3 flex justify-end text-xs text-gray-400">
          Contas a receber atualizadas do Sienge em {dataHora(dados.ultima_atualizacao)}
        </div>
      )}

      {carregando && !dados ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erroCarga ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TriangleAlert size={26} className="text-red-400" />
          <p className="text-sm text-gray-600">{erroCarga}</p>
          <button
            type="button"
            onClick={carregar}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        // Sem wrapper com overflow próprio (mesmo motivo da aba Orçamento): o cabeçalho gruda no topo
        // da página ao rolar. -top-6 cancela o p-6 do <main>.
        <div>
          <table
            className="border-separate border-spacing-0 text-left text-xs"
            style={{ tableLayout: 'fixed', width: '100%', minWidth: larguraMinima }}
          >
            <colgroup>
              <col />
              <col style={{ width: LARGURA_TOTAL }} />
              {[...COLUNAS_VALOR, ...COLUNAS_INFO].map((c) => (
                <col key={c.chave} style={{ width: c.largura }} />
              ))}
            </colgroup>
            <thead>
              <tr className="[&>th:first-child]:rounded-tl-lg [&>th:last-child]:rounded-tr-lg">
                <th className="sticky -top-6 left-0 z-30 border-b-2 border-r border-b-blue-500 border-r-blue-100 bg-blue-50 py-2.5 pl-4 pr-3 text-xs font-medium uppercase tracking-wide text-blue-700">
                  Centro de custo / Cliente / Parcela
                </th>
                <th className="sticky -top-6 z-20 border-b-2 border-l border-b-blue-500 border-l-blue-100 bg-blue-100 px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-blue-800">
                  Total
                </th>
                {[...COLUNAS_VALOR, ...COLUNAS_INFO].map((c) => (
                  <th
                    key={c.chave}
                    title={c.titulo}
                    className={`sticky -top-6 z-20 border-b-2 border-l border-b-blue-500 border-l-blue-100 bg-blue-50 px-2 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-blue-700 ${
                      c.titulo ? 'cursor-help' : ''
                    }`}
                  >
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {centros.length === 0 && (
                <tr>
                  <td colSpan={totalColunas} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                    {termo
                      ? 'Nenhum cliente encontrado para essa busca.'
                      : 'Nenhum centro de custo com "Realiza DRE" marcado. Marque na aba Centros Custos.'}
                  </td>
                </tr>
              )}
              {centros.map((c) => {
                const temClientes = c.clientes.length > 0;
                const centroAberto = temClientes && (Boolean(termo) || centrosAbertos.includes(c.id));
                return (
                  <Fragment key={c.id}>
                    {/* Nível 1: o centro de custo */}
                    <tr
                      onClick={() => temClientes && alternarCentro(c.id)}
                      className={`group/obra ${temClientes ? 'cursor-pointer' : ''}`}
                    >
                      <td className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 py-2 pl-3 pr-2 group-hover/obra:bg-gray-100">
                        <span className="flex items-center gap-2">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                              temClientes ? 'bg-primary-100 text-primary-600' : 'text-transparent'
                            }`}
                          >
                            {centroAberto ? <Minus size={10} /> : <Plus size={10} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-gray-900" title={c.nome}>
                              {c.nome}
                            </span>
                            <span className="block truncate text-[10px] text-gray-400">
                              {temClientes
                                ? `${plural(c.clientes.length, 'cliente', 'clientes')} · ${plural(c.parcelas, 'parcela', 'parcelas')}`
                                : 'Sem correção monetária'}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="border-b border-l border-blue-100 bg-blue-50 px-2 text-right text-xs font-bold tabular-nums text-blue-700 group-hover/obra:bg-blue-100">
                        {valor(total(c))}
                      </td>
                      {COLUNAS_VALOR.map((col) => (
                        <td key={col.chave} className={`${celulaCentro} font-semibold text-gray-900`}>
                          {valor(c[col.chave])}
                        </td>
                      ))}
                      {COLUNAS_INFO.map((col) => (
                        <td key={col.chave} className={celulaCentro} />
                      ))}
                    </tr>

                    {/* Nível 2: os clientes */}
                    {centroAberto &&
                      c.clientes.map((k) => {
                        const chave = `${c.id}:${k.id}`;
                        const clienteAberto = clientesAbertos.includes(chave);
                        const lista = parcelas[chave];
                        return (
                          <Fragment key={k.id}>
                            <tr onClick={() => alternarCliente(c.id, k.id)} className="group/cliente cursor-pointer">
                              <td className="sticky left-0 z-10 border-b border-r border-gray-100 border-r-gray-200 bg-white py-1.5 pl-9 pr-2 group-hover/cliente:bg-gray-50">
                                <span className="flex items-center gap-2">
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                                    {clienteAberto ? <Minus size={10} /> : <Plus size={10} />}
                                  </span>
                                  <span className="truncate text-xs font-medium text-gray-800" title={k.nome}>
                                    {k.nome}
                                  </span>
                                  <span
                                    className="shrink-0 rounded-full bg-white px-1.5 py-px text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200"
                                    title={plural(k.parcelas, 'parcela com correção', 'parcelas com correção')}
                                  >
                                    {k.parcelas}
                                  </span>
                                </span>
                              </td>
                              <td className="border-b border-l border-blue-100 bg-blue-50/60 px-2 text-right text-xs font-semibold tabular-nums text-blue-700">
                                {valor(total(k))}
                              </td>
                              {COLUNAS_VALOR.map((col) => (
                                <td key={col.chave} className={`${celulaCliente} text-right font-medium tabular-nums text-gray-800`}>
                                  {valor(k[col.chave])}
                                </td>
                              ))}
                              <td className={`${celulaCliente} truncate text-gray-700`} title={k.unidades || undefined}>
                                {k.unidades || ''}
                              </td>
                              <td className={celulaCliente} />
                              <td className={celulaCliente} />
                              <td className={celulaCliente} />
                            </tr>

                            {/* Nível 3: as parcelas do cliente (buscadas ao abrir) */}
                            {clienteAberto && !Array.isArray(lista) && (
                              <tr>
                                <td
                                  colSpan={totalColunas}
                                  className={`border-b border-gray-100 bg-white py-2 pl-15 text-xs ${
                                    lista?.erro ? 'text-red-600' : 'text-gray-400'
                                  }`}
                                >
                                  {lista?.erro || 'Carregando parcelas...'}
                                </td>
                              </tr>
                            )}
                            {clienteAberto &&
                              Array.isArray(lista) &&
                              lista.map((p) => (
                                <tr key={`${p.titulo}-${p.parcela_id}`} className="hover:[&>td]:bg-gray-50">
                                  <td
                                    className="sticky left-0 z-10 border-b border-r border-gray-100 border-r-gray-200 bg-white py-1.5 pl-15 pr-3"
                                    title={p.documento ? `${p.documento} ${p.documento_numero || ''}`.trim() : undefined}
                                  >
                                    <span className="block truncate text-xs text-gray-800">
                                      Título {p.titulo} · Parcela {p.parcela || p.parcela_id}
                                    </span>
                                  </td>
                                  <td className="border-b border-l border-blue-100 bg-blue-50/30 px-2 text-right text-xs tabular-nums text-blue-700">
                                    {valor(total(p))}
                                  </td>
                                  {COLUNAS_VALOR.map((col) => (
                                    <td key={col.chave} className={`${celulaParcela} text-right tabular-nums text-gray-800`}>
                                      {valor(p[col.chave])}
                                    </td>
                                  ))}
                                  <td className={`${celulaParcela} truncate text-gray-700`}>{p.unidade || ''}</td>
                                  <td className={`${celulaParcela} truncate text-gray-700`}>{p.indexador || ''}</td>
                                  <td className={`${celulaParcela} tabular-nums text-gray-700`}>{dataBr(p.vencimento)}</td>
                                  <td className={`${celulaParcela} tabular-nums text-gray-700`}>{dataBr(p.data_baixa)}</td>
                                </tr>
                              ))}
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
    </div>
  );
}
