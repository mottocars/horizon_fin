import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { ArrowLeftRight, DoorOpen, FileX, HandCoins, House, Minus, Plus, TriangleAlert } from 'lucide-react';
import {
  listarUnidadesDre,
  sincronizarContratosUnidadesDre,
  sincronizarUnidadesDre,
  statusSincronizacaoUnidadesDre,
} from '../../../api/dreUnidades.api';
import { statusConfig } from '../../../utils/statusUnidade';
import iconSienge from '../../../assets/integracoes/sienge.svg';
import AtualizacaoLogModal from '../RepassesCef/AtualizacaoLogModal';

// Largura mínima da primeira coluna (centro / unidade) — ela fica com o espaço que sobrar; as de
// dados têm largura fixa e parecida (antes a Fração ideal ficava com a sobra e ficava enorme).
const LARGURA_MINIMA_PRIMEIRA = 230;
const LARGURA_ICONE = 44;

const COLUNAS = [
  { chave: 'situacao_atual', rotulo: 'Situação atual', largura: 115 },
  {
    chave: 'contrato',
    rotulo: 'Contrato',
    largura: 85,
    titulo: 'Número do contrato de venda (Vendidas e Distratadas)',
  },
  {
    chave: 'data',
    rotulo: 'Data',
    largura: 95,
    titulo: 'Vendidas: data do contrato · Distratadas: data do cancelamento · Permuta: data da avaliação',
  },
  {
    chave: 'valor',
    rotulo: 'Valor',
    largura: 130,
    titulo:
      'Vendidas e Distratadas: valor do contrato · Permuta: valor da avaliação · Disponíveis: ticket médio das vendas do mesmo tipo no empreendimento',
  },
  {
    chave: 'receita_distrato',
    rotulo: 'Receita com distrato',
    largura: 125,
    titulo: 'Distratadas: o que o cliente pagou no contrato (recebimentos do título no extrato de contas do Sienge)',
  },
  {
    chave: 'despesa_distrato',
    rotulo: 'Despesa com distrato',
    largura: 125,
    titulo: 'Distratadas: valor devolvido ao cliente no cancelamento (total do distrato)',
  },
  { chave: 'fracao_ideal', rotulo: 'Fração ideal', largura: 115 },
];

// Os 4 clusters do drilldown, na ordem pedida, cada um com um ícone (venda, contrato cancelado,
// troca, porta aberta) na cor do estoque comercial correspondente (utils/statusUnidade.js: Vendida
// vermelho, Permuta roxo, Disponível verde; distrato em âmbar). Os ícones viram 4 colunas estreitas
// logo depois do nome — mesmo esquema da aba Gestão das Parcelas (GestaoParcelasTab.jsx): no centro,
// a quantidade de cada cluster; no cluster, o ícone dele destacado (`tag`); na unidade, destacados
// todos os clusters em que ela aparece (o resto cinza).
const CLUSTERS = [
  {
    chave: 'vendidas',
    rotulo: 'VENDIDAS',
    icone: HandCoins,
    cor: 'text-red-500',
    tag: 'bg-red-50 text-red-600',
    dica: 'Todo contrato de venda, inclusive os depois cancelados',
  },
  {
    chave: 'distratadas',
    rotulo: 'DISTRATADAS',
    icone: FileX,
    cor: 'text-amber-500',
    tag: 'bg-amber-50 text-amber-600',
    dica: 'Contratos de venda cancelados',
  },
  {
    chave: 'permuta',
    rotulo: 'PERMUTA',
    icone: ArrowLeftRight,
    cor: 'text-purple-500',
    tag: 'bg-purple-50 text-purple-600',
    dica: 'Unidades com estoque Permuta',
  },
  {
    chave: 'disponiveis',
    rotulo: 'UNIDADES DISPONÍVEIS',
    icone: DoorOpen,
    cor: 'text-emerald-500',
    tag: 'bg-emerald-50 text-emerald-600',
    dica: 'Unidades que hoje não estão vendidas nem em permuta',
  },
];

function numero(valor, casas) {
  if (valor === null || valor === undefined || valor === '') return '';
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function dataBr(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function dataHora(v) {
  return v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
}

function soma(linhas, campo) {
  return linhas.reduce((t, l) => t + (Number(l[campo]) || 0), 0);
}

// Receita / despesa com distrato: zero ou sem valor fica em branco; despesa (negativa) em vermelho.
function ValorDistrato({ valor, className = '' }) {
  const v = Number(valor) || 0;
  return (
    <td className={`${className} text-right tabular-nums ${v < 0 ? 'text-red-600' : 'text-gray-800'}`}>
      {v ? numero(v, 2) : ''}
    </td>
  );
}

const SEM_TIPO = 'SEM TIPO';

// Linhas de um cluster agrupadas pelo tipo da unidade (APARTAMENTO, GARAGEM, LOJA…), em ordem
// alfabética, com as sem tipo por último. Cada grupo mantém a ordem das linhas que veio do backend.
function agruparPorTipo(linhas) {
  const grupos = new Map();
  linhas.forEach((l) => {
    const tipo = l.tipo || SEM_TIPO;
    if (!grupos.has(tipo)) grupos.set(tipo, []);
    grupos.get(tipo).push(l);
  });
  return [...grupos.entries()]
    .map(([tipo, itens]) => ({ tipo, linhas: itens }))
    .sort((a, b) => (a.tipo === SEM_TIPO) - (b.tipo === SEM_TIPO) || a.tipo.localeCompare(b.tipo, 'pt-BR'));
}

// Mesma regra de RepassesCefPage.jsx: falta de integração não é erro, é "não integrado" no log.
function ehErroDeIntegracaoAusente(mensagem) {
  return /não possui uma integração .* ativa configurada/i.test(mensagem || '');
}

// Operações > DRE Gerencial > Unidades: as unidades dos empreendimentos (/units do Sienge, em
// sie_units) cruzadas com os contratos de venda (sie_sales_contracts), no layout da tabela da aba
// Avanços da DFC (DfcAvancosTab.jsx) — cabeçalho azul grudado no topo, primeira coluna fixa.
// Drilldown em 4 níveis: centro de custo (só os com "Realiza DRE") → cluster (Vendidas,
// Distratadas, Permuta, Unidades disponíveis — a mesma unidade aparece em todos em que se encaixa;
// regras em dre-unidades/unidades.service.js::listar) → tipo da unidade → unidades. Vários abertos
// ao mesmo tempo; com busca, abre tudo e mostra só as linhas que batem.
//
// A atualização segue a do Repasses CEF (RepassesCefPage.jsx::handleAtualizar): unidades e
// contratos sincronizam em paralelo (cada POST busca tudo paginado e substitui o que estava
// salvo), e a tela consulta o andamento a cada 0,7 s pra desenhar as barras no Log de
// Atualização. `ref` expõe `atualizar()` pro botão do topo da página (onAtualizando gira o ícone).
const UnidadesTab = forwardRef(function UnidadesTab({ empresaId, search = '', onAtualizando }, ref) {
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [centrosAbertos, setCentrosAbertos] = useState([]);
  const [clustersAbertos, setClustersAbertos] = useState([]); // `${centroId}:${cluster}`
  const [tiposAbertos, setTiposAbertos] = useState([]); // `${centroId}:${cluster}:${tipo}`
  const [logs, setLogs] = useState([]);
  const [logAberto, setLogAberto] = useState(false);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setDados(null);
      return Promise.resolve();
    }
    setCarregando(true);
    setErroCarga('');
    return listarUnidadesDre(empresaId)
      .then(setDados)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar as unidades.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setCentrosAbertos([]);
    setClustersAbertos([]);
    setTiposAbertos([]);
    carregar();
  }, [carregar]);

  async function atualizar() {
    if (!empresaId) return;
    onAtualizando?.(true);
    setLogs([
      { chave: 'unidades', logo: iconSienge, integracaoNome: 'Sienge — Unidades', status: 'carregando' },
      { chave: 'contratos', logo: iconSienge, integracaoNome: 'Sienge — Contratos', status: 'carregando' },
    ]);
    setLogAberto(true);

    const intervaloProgresso = setInterval(() => {
      statusSincronizacaoUnidadesDre(empresaId)
        .then((status) => {
          setLogs((prev) =>
            prev.map((log) => {
              if (log.status !== 'carregando') return log;
              const p = status[log.chave];
              return p ? { ...log, paginaAtual: p.paginaAtual, totalPaginas: p.totalPaginas } : log;
            })
          );
        })
        .catch(() => {});
    }, 700);

    const atualizarEtapa = async (chave, sincronizar) => {
      try {
        const resultado = await sincronizar();
        setLogs((prev) =>
          prev.map((log) =>
            log.chave === chave ? { ...log, status: 'sucesso', total: resultado.total_importado, paginaAtual: undefined } : log
          )
        );
      } catch (err) {
        const mensagem = err.response?.data?.message || 'Não foi possível sincronizar.';
        setLogs((prev) =>
          prev.map((log) =>
            log.chave === chave
              ? { ...log, status: ehErroDeIntegracaoAusente(mensagem) ? 'nao_integrado' : 'erro', mensagem, paginaAtual: undefined }
              : log
          )
        );
      }
    };

    await Promise.all([
      atualizarEtapa('unidades', () => sincronizarUnidadesDre(empresaId)),
      atualizarEtapa('contratos', () => sincronizarContratosUnidadesDre(empresaId)),
    ]);
    clearInterval(intervaloProgresso);
    await carregar();
    onAtualizando?.(false);
  }

  useImperativeHandle(ref, () => ({ atualizar }));

  // Com busca: só as linhas cuja unidade (ou centro) bate, e só os centros/clusters com alguma.
  const termo = search.trim().toLowerCase();
  const centros = useMemo(() => {
    const lista = dados?.centros || [];
    if (!termo) return lista;
    return lista
      .map((c) => {
        const centroBate = (c.nome || '').toLowerCase().includes(termo) || String(c.id).includes(termo);
        const clusters = Object.fromEntries(
          Object.entries(c.clusters).map(([k, linhas]) => [
            k,
            centroBate ? linhas : linhas.filter((l) => (l.unidade || '').toLowerCase().includes(termo)),
          ])
        );
        return { ...c, clusters };
      })
      .filter((c) => Object.values(c.clusters).some((l) => l.length));
  }, [dados, termo]);

  // centro -> unit_id -> clusters em que a unidade aparece (colunas de ícone da linha da unidade).
  const clustersDaUnidade = useMemo(() => {
    const mapa = new Map();
    (dados?.centros || []).forEach((c) => {
      const porUnidade = new Map();
      Object.entries(c.clusters).forEach(([k, linhas]) =>
        linhas.forEach((l) => {
          if (l.unit_id === null) return;
          if (!porUnidade.has(l.unit_id)) porUnidade.set(l.unit_id, new Set());
          porUnidade.get(l.unit_id).add(k);
        })
      );
      mapa.set(c.id, porUnidade);
    });
    return mapa;
  }, [dados]);

  function alternarCentro(id) {
    setCentrosAbertos((atual) => (atual.includes(id) ? atual.filter((v) => v !== id) : [...atual, id]));
  }

  function alternarCluster(chave) {
    setClustersAbertos((atual) => (atual.includes(chave) ? atual.filter((v) => v !== chave) : [...atual, chave]));
  }

  function alternarTipo(chave) {
    setTiposAbertos((atual) => (atual.includes(chave) ? atual.filter((v) => v !== chave) : [...atual, chave]));
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <House size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver as unidades.</p>
      </div>
    );
  }

  const totalColunas = 1 + CLUSTERS.length + COLUNAS.length;
  const ultima = dados?.ultima_atualizacao;
  const celulaCentro = 'border-b border-l border-gray-200 bg-gray-50 px-2 text-right text-xs tabular-nums group-hover/obra:bg-gray-100';

  return (
    // min-w-fit: com tabela mais larga que a tela, o quadro branco cresce junto (mesmo esquema da
    // aba Avanços da DFC).
    <div className="min-w-fit rounded-card rounded-tl-none bg-white p-5 shadow-card">
      <AtualizacaoLogModal open={logAberto} onClose={() => setLogAberto(false)} logs={logs} />

      {(ultima?.unidades || ultima?.contratos) && (
        <div className="-mt-1 mb-3 flex justify-end gap-3 text-xs text-gray-400">
          {ultima.unidades && <span>Unidades atualizadas do Sienge em {dataHora(ultima.unidades)}</span>}
          {ultima.contratos && <span>· Contratos em {dataHora(ultima.contratos)}</span>}
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
        // Sem wrapper com overflow próprio (mesmo motivo da aba Avanços): o cabeçalho gruda no topo
        // da página ao rolar. -top-6 cancela o p-6 do <main>.
        <div>
          <table
            className="border-separate border-spacing-0 text-left text-xs"
            style={{
              tableLayout: 'fixed',
              width: '100%',
              minWidth: LARGURA_MINIMA_PRIMEIRA + CLUSTERS.length * LARGURA_ICONE + COLUNAS.reduce((t, c) => t + c.largura, 0),
            }}
          >
            <colgroup>
              <col />
              {CLUSTERS.map((k) => (
                <col key={k.chave} style={{ width: LARGURA_ICONE }} />
              ))}
              {COLUNAS.map((c) => (
                <col key={c.chave} style={{ width: c.largura }} />
              ))}
            </colgroup>
            <thead>
              <tr className="[&>th:first-child]:rounded-tl-lg [&>th:last-child]:rounded-tr-lg">
                <th className="sticky -top-6 left-0 z-30 border-b-2 border-r border-b-blue-500 border-r-blue-100 bg-blue-50 py-2.5 pl-4 pr-3 text-xs font-medium uppercase tracking-wide text-blue-700">
                  Centro de custo / Unidade
                </th>
                {CLUSTERS.map((k) => (
                  <th
                    key={k.chave}
                    title={k.rotulo}
                    className="sticky -top-6 z-20 border-b-2 border-l border-b-blue-500 border-l-blue-100 bg-blue-50 py-2.5 text-center"
                  >
                    <k.icone size={15} className={`inline ${k.cor}`} />
                  </th>
                ))}
                {COLUNAS.map((c) => (
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
                      ? 'Nenhuma unidade encontrada para essa busca.'
                      : 'Nenhuma unidade de centro com "Realiza DRE". Atualize do Sienge (ícone acima) ou marque os centros na aba Centros Custos.'}
                  </td>
                </tr>
              )}
              {centros.map((c) => {
                const centroAberto = Boolean(termo) || centrosAbertos.includes(c.id);
                return (
                  <Fragment key={c.id}>
                    {/* Nível 1: o centro de custo */}
                    <tr onClick={() => alternarCentro(c.id)} className="group/obra cursor-pointer">
                      <td className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 py-2 pl-3 pr-2 group-hover/obra:bg-gray-100">
                        <span className="flex items-center gap-2">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                            {centroAberto ? <Minus size={10} /> : <Plus size={10} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-gray-900" title={c.nome}>
                              {c.nome}
                            </span>
                            <span className="block truncate text-[10px] text-gray-400">
                              {c.total_unidades} {c.total_unidades === 1 ? 'unidade' : 'unidades'}
                            </span>
                          </span>
                        </span>
                      </td>
                      {CLUSTERS.map((k) => (
                        <td
                          key={k.chave}
                          title={k.rotulo}
                          className="border-b border-l border-gray-200 bg-gray-50 text-center font-mono text-xs tabular-nums text-gray-900 group-hover/obra:bg-gray-100"
                        >
                          {(c.clusters[k.chave] || []).length}
                        </td>
                      ))}
                      <td className={celulaCentro} />
                      <td className={celulaCentro} />
                      <td className={celulaCentro} />
                      <td className={celulaCentro} />
                      <ValorDistrato valor={c.receita_distrato} className={`${celulaCentro} font-semibold`} />
                      <ValorDistrato valor={c.despesa_distrato} className={`${celulaCentro} font-semibold`} />
                      <td className={`${celulaCentro} font-semibold text-gray-900`}>
                        {numero(c.fracao_ideal, 8)}
                      </td>
                    </tr>

                    {/* Nível 2: os clusters */}
                    {centroAberto &&
                      CLUSTERS.map((k) => {
                        const linhas = c.clusters[k.chave] || [];
                        // Com busca, cluster sem nenhuma linha que bate não aparece (sem busca aparece com 0).
                        if (termo && linhas.length === 0) return null;
                        const chaveCluster = `${c.id}:${k.chave}`;
                        const temLinhas = linhas.length > 0;
                        const clusterAberto = temLinhas && (Boolean(termo) || clustersAbertos.includes(chaveCluster));
                        const estimado = k.chave === 'disponiveis';
                        return (
                          <Fragment key={k.chave}>
                            <tr
                              onClick={() => temLinhas && alternarCluster(chaveCluster)}
                              className={`group/cluster ${temLinhas ? 'cursor-pointer' : ''}`}
                            >
                              <td
                                className="sticky left-0 z-10 border-b border-r border-gray-100 border-r-gray-200 bg-white py-1.5 pl-9 pr-2 group-hover/cluster:bg-gray-50"
                                title={k.dica}
                              >
                                <span className="flex items-center gap-2">
                                  <span
                                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                                      temLinhas ? 'bg-primary-100 text-primary-600' : 'text-transparent'
                                    }`}
                                  >
                                    {clusterAberto ? <Minus size={10} /> : <Plus size={10} />}
                                  </span>
                                  <span className={`truncate text-xs font-semibold ${temLinhas ? 'text-gray-800' : 'text-gray-400'}`}>
                                    {k.rotulo}
                                  </span>
                                  <span className="shrink-0 rounded-full bg-white px-1.5 py-px text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                                    {linhas.length}
                                  </span>
                                </span>
                              </td>
                              {CLUSTERS.map((outro) => {
                                const proprio = outro.chave === k.chave;
                                return (
                                  <td
                                    key={outro.chave}
                                    className={`border-b border-l border-gray-100 text-center ${
                                      proprio && temLinhas ? outro.tag : 'bg-white group-hover/cluster:bg-gray-50'
                                    }`}
                                  >
                                    {proprio && (
                                      <outro.icone size={14} className={`inline ${temLinhas ? '' : 'text-gray-300'}`} />
                                    )}
                                  </td>
                                );
                              })}
                              <td className="border-b border-l border-gray-100 bg-white group-hover/cluster:bg-gray-50" />
                              <td className="border-b border-l border-gray-100 bg-white group-hover/cluster:bg-gray-50" />
                              <td className="border-b border-l border-gray-100 bg-white group-hover/cluster:bg-gray-50" />
                              <td
                                className={`border-b border-l border-gray-100 bg-white px-2 text-right text-xs font-semibold tabular-nums group-hover/cluster:bg-gray-50 ${
                                  estimado ? 'italic text-gray-500' : 'text-gray-900'
                                }`}
                                title={estimado && temLinhas ? 'Soma dos tickets médios (estimativa)' : undefined}
                              >
                                {temLinhas ? `${estimado ? '≈ ' : ''}${numero(soma(linhas, 'valor'), 2)}` : ''}
                              </td>
                              <ValorDistrato
                                valor={soma(linhas, 'receita_distrato')}
                                className="border-b border-l border-gray-100 bg-white px-2 text-xs font-semibold group-hover/cluster:bg-gray-50"
                              />
                              <ValorDistrato
                                valor={soma(linhas, 'despesa_distrato')}
                                className="border-b border-l border-gray-100 bg-white px-2 text-xs font-semibold group-hover/cluster:bg-gray-50"
                              />
                              <td className="border-b border-l border-gray-100 bg-white px-2 text-right text-xs font-semibold tabular-nums text-gray-900 group-hover/cluster:bg-gray-50">
                                {temLinhas ? numero(soma(linhas, 'fracao_ideal'), 8) : ''}
                              </td>
                            </tr>

                            {/* Nível 3: os tipos de unidade do cluster */}
                            {clusterAberto &&
                              agruparPorTipo(linhas).map((g) => {
                                const chaveTipo = `${chaveCluster}:${g.tipo}`;
                                const tipoAberto = Boolean(termo) || tiposAbertos.includes(chaveTipo);
                                return (
                                  <Fragment key={g.tipo}>
                                    <tr onClick={() => alternarTipo(chaveTipo)} className="group/tipo cursor-pointer">
                                      <td className="sticky left-0 z-10 border-b border-r border-gray-100 border-r-gray-200 bg-white py-1.5 pl-15 pr-2 group-hover/tipo:bg-gray-50">
                                        <span className="flex items-center gap-2">
                                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                                            {tipoAberto ? <Minus size={10} /> : <Plus size={10} />}
                                          </span>
                                          <span className="truncate text-xs font-medium text-gray-700" title={g.tipo}>
                                            {g.tipo}
                                          </span>
                                          <span className="shrink-0 rounded-full bg-white px-1.5 py-px text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                                            {g.linhas.length}
                                          </span>
                                        </span>
                                      </td>
                                      {CLUSTERS.map((outro) => (
                                        <td
                                          key={outro.chave}
                                          className="border-b border-l border-gray-100 bg-white text-center group-hover/tipo:bg-gray-50"
                                        >
                                          {outro.chave === k.chave && <outro.icone size={14} className={`inline ${outro.cor}`} />}
                                        </td>
                                      ))}
                                      <td className="border-b border-l border-gray-100 bg-white group-hover/tipo:bg-gray-50" />
                                      <td className="border-b border-l border-gray-100 bg-white group-hover/tipo:bg-gray-50" />
                                      <td className="border-b border-l border-gray-100 bg-white group-hover/tipo:bg-gray-50" />
                                      <td
                                        className={`border-b border-l border-gray-100 bg-white px-2 text-right text-xs font-medium tabular-nums group-hover/tipo:bg-gray-50 ${
                                          estimado ? 'italic text-gray-500' : 'text-gray-800'
                                        }`}
                                        title={estimado ? 'Soma dos tickets médios (estimativa)' : undefined}
                                      >
                                        {g.linhas.some((l) => l.valor !== null)
                                          ? `${estimado ? '≈ ' : ''}${numero(soma(g.linhas, 'valor'), 2)}`
                                          : ''}
                                      </td>
                                      <ValorDistrato
                                        valor={soma(g.linhas, 'receita_distrato')}
                                        className="border-b border-l border-gray-100 bg-white px-2 text-xs font-medium group-hover/tipo:bg-gray-50"
                                      />
                                      <ValorDistrato
                                        valor={soma(g.linhas, 'despesa_distrato')}
                                        className="border-b border-l border-gray-100 bg-white px-2 text-xs font-medium group-hover/tipo:bg-gray-50"
                                      />
                                      <td className="border-b border-l border-gray-100 bg-white px-2 text-right text-xs font-medium tabular-nums text-gray-800 group-hover/tipo:bg-gray-50">
                                        {numero(soma(g.linhas, 'fracao_ideal'), 8)}
                                      </td>
                                    </tr>

                                    {/* Nível 4: as unidades do tipo */}
                                    {tipoAberto &&
                                      g.linhas.map((l) => (
                                        <LinhaUnidade
                                          key={l.chave}
                                          linha={l}
                                          cluster={k.chave}
                                          clustersDaUnidade={clustersDaUnidade.get(c.id)?.get(l.unit_id) || new Set([k.chave])}
                                        />
                                      ))}
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
    </div>
  );
});

UnidadesTab.displayName = 'UnidadesTab';

// Linha de uma unidade dentro de um cluster. Colunas de ícone: destacados todos os clusters em que a
// unidade aparece (`clustersDaUnidade`), o resto cinza. Coluna Contrato: só o número do contrato (em
// Vendidas, com selo quando foi distratado). Em Disponíveis o valor é estimado (ticket médio) —
// itálico, com "≈" e de quantas vendas veio.
function LinhaUnidade({ linha: l, cluster, clustersDaUnidade }) {
  const situacao = statusConfig(l.situacao_atual);
  const celula = 'border-b border-l border-gray-100 bg-white px-2 py-1.5 text-xs';

  let valor;
  if (cluster === 'disponiveis') {
    valor =
      l.valor === null ? (
        <span className="text-gray-300" title="Sem venda desse tipo no empreendimento pra calcular o ticket médio">
          —
        </span>
      ) : (
        <span
          className="italic text-gray-500"
          title={`Ticket médio de ${l.estimado.vendas} ${l.estimado.vendas === 1 ? 'venda' : 'vendas'} de ${l.tipo} neste empreendimento`}
        >
          ≈ {numero(l.valor, 2)}
        </span>
      );
  } else {
    valor = numero(l.valor, 2);
  }

  return (
    <tr className="hover:[&>td]:bg-gray-50">
      <td className="sticky left-0 z-10 border-b border-r border-gray-100 border-r-gray-200 bg-white py-1.5 pl-21 pr-3">
        <span className="block truncate text-xs font-medium text-gray-800" title={l.unidade}>
          {l.unidade}
        </span>
      </td>
      {CLUSTERS.map((k) => {
        const tem = clustersDaUnidade.has(k.chave);
        return (
          <td
            key={k.chave}
            title={tem ? k.rotulo : undefined}
            className={`border-b border-l border-gray-100 text-center ${tem ? k.tag : 'bg-white'}`}
          >
            <k.icone size={14} className={`inline ${tem ? '' : 'text-gray-300'}`} />
          </td>
        );
      })}
      <td className={celula}>
        {l.situacao_atual && (
          <span className="flex items-center gap-1.5 truncate text-gray-700">
            <span className={`h-2 w-2 shrink-0 rounded-full ${situacao.dot}`} />
            {situacao.label}
          </span>
        )}
      </td>
      <td className={celula}>
        {l.contrato && (
          <span className="flex items-center gap-1.5">
            <span className="tabular-nums text-gray-700">{l.contrato.numero}</span>
            {cluster === 'vendidas' && l.contrato.cancelado && (
              <span className="rounded bg-amber-50 px-1 py-px text-[9px] font-semibold uppercase text-amber-700 ring-1 ring-amber-200">
                Distratado
              </span>
            )}
          </span>
        )}
      </td>
      <td className={`${celula} tabular-nums text-gray-700`}>{dataBr(l.data)}</td>
      <td className={`${celula} text-right tabular-nums text-gray-800`}>{valor}</td>
      <ValorDistrato valor={l.receita_distrato} className={celula} />
      <ValorDistrato valor={l.despesa_distrato} className={celula} />
      <td className={`${celula} text-right tabular-nums text-gray-800`}>
        {numero(l.fracao_ideal, 8)}
      </td>
    </tr>
  );
}

export default UnidadesTab;
