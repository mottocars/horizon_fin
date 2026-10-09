import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, Clock, FileDown, HandCoins, Minus, Plus, Shuffle, TriangleAlert } from 'lucide-react';
import Card from '../../../components/Card';
import Tabs from '../../../components/Tabs';
import SearchableSelect from '../../../components/SearchableSelect';
import FiltroColuna, { passaNoFiltro } from '../../../components/FiltroColuna';
import RotuloAgrupador from '../../../components/RotuloAgrupador';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { listEmpresas } from '../../../api/empresas.api';
import { listSiengeIntegracoes } from '../../../api/sienge.api';
import { getDesempenhoCobranca } from '../../../api/relatorioDesempenhoCobranca.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import HistoricoParcelaModal from '../../Operacoes/GestaoCobrancas/GestaoParcelas/HistoricoParcelaModal';

// ─── formatação ────────────────────────────────────────────────────────────

function formatarData(iso) {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const inicioDoMes = (iso) => `${iso.slice(0, 8)}01`;
const textoDias = (n) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

// Abas no mesmo padrão do Acervo NF-e / NFS-e: cada uma pinta o cabeçalho e o
// totalizador da tabela com a sua cor. Classes por extenso pro Tailwind achar.
const ABAS = [
  {
    id: 'pagas',
    label: 'Parcelas Pagas',
    icon: CircleCheck,
    iconColorClass: 'text-emerald-600',
    vazio: 'Nenhuma parcela paga no período.',
    rotuloInicio: 'Pago de',
    rotuloFim: 'Pago até',
    tema: { th: 'border-b-emerald-500 bg-emerald-50', tf: 'border-t-emerald-500 bg-emerald-50', texto: 'text-emerald-700', divisor: 'border-l-emerald-100' },
  },
  {
    id: 'abertas',
    label: 'Parcelas em Aberto',
    icon: Clock,
    iconColorClass: 'text-amber-600',
    vazio: 'Nenhuma parcela em aberto com vencimento no período.',
    rotuloInicio: 'Vencimento de',
    rotuloFim: 'Vencimento até',
    tema: { th: 'border-b-amber-500 bg-amber-50', tf: 'border-t-amber-500 bg-amber-50', texto: 'text-amber-700', divisor: 'border-l-amber-100' },
  },
  {
    id: 'distribuidas',
    label: 'Parcelas Distribuídas',
    icon: Shuffle,
    iconColorClass: 'text-sky-600',
    vazio: 'Nenhuma parcela distribuída no período (só a Distribuição automática entra aqui).',
    rotuloInicio: 'Distribuída de',
    rotuloFim: 'Distribuída até',
    tema: { th: 'border-b-sky-500 bg-sky-50', tf: 'border-t-sky-500 bg-sky-50', texto: 'text-sky-700', divisor: 'border-l-sky-100' },
  },
];

const NOME_CANAL = { whatsapp: 'WhatsApp', email: 'E-mail', ligacao: 'Ligação' };

function resumir(linhas) {
  return {
    parcelas: linhas.length,
    clientes: new Set(linhas.map((p) => p.clientId)).size,
    valor: linhas.reduce((s, p) => s + p.valor, 0),
    feitas: linhas.reduce((s, p) => s + p.interacoesFeitas, 0),
    devidas: linhas.reduce((s, p) => s + p.interacoesDevidas, 0),
  };
}

// Colunas analíticas — `abas` diz em quais abas a coluna aparece; `celula`
// desenha 1 parcela (recebe também `acoes`, ex.: abrir o histórico);
// `resumo` a linha da atendente e o total (null = vazio).
const COLUNAS = [
  {
    chave: 'distribuicao',
    label: 'Distribuição',
    largura: 'w-24',
    abas: ['distribuidas'],
    celula: (p) => <span className="font-medium text-sky-700">{formatarData(p.dataDistribuicao)}</span>,
    resumo: () => null,
  },
  {
    chave: 'etapa',
    label: 'Etapa',
    largura: 'w-20',
    centro: true,
    abas: ['distribuidas'],
    celula: (p) => p.etapa,
    resumo: () => null,
  },
  {
    chave: 'vencimento',
    label: 'Vencimento',
    largura: 'w-24',
    celula: (p) => formatarData(p.vencimento),
    resumo: () => null,
  },
  {
    chave: 'pagamento',
    label: 'Pagamento',
    largura: 'w-24',
    abas: ['pagas', 'distribuidas'],
    // Na aba Distribuídas: só pagamento que veio depois da distribuição.
    celula: (p) => formatarData(p.dataPagamento) ?? <span className="text-gray-400">—</span>,
    resumo: () => null,
  },
  {
    chave: 'diasAtraso',
    label: 'Dias Atraso',
    largura: 'w-24',
    centro: true,
    celula: (p) => {
      if (p.diasAtraso > 0) {
        const dica = {
          pagas: 'Dias entre o vencimento e o pagamento',
          abertas: 'Dias desde o vencimento',
          distribuidas: 'Dias de atraso no dia da distribuição',
        }[p.aba];
        return (
          <span className="font-medium text-red-600" title={dica}>
            {textoDias(p.diasAtraso)}
          </span>
        );
      }
      if (p.aba === 'pagas') return <span className="text-emerald-700">em dia</span>;
      if (p.diasAtraso === 0) return <span className="text-gray-400">{p.aba === 'distribuidas' ? 'no vencimento' : 'vence hoje'}</span>;
      return <span className="text-gray-400">a vencer</span>;
    },
    resumo: () => null,
  },
  {
    chave: 'valor',
    label: 'Valor',
    largura: 'w-32',
    celula: (p) => (
      <span
        className={{ pagas: 'font-medium text-emerald-700', abertas: 'text-amber-700', distribuidas: 'text-sky-700' }[p.aba]}
        title={{ pagas: 'Valor recebido', abertas: 'Saldo em aberto', distribuidas: 'Saldo da parcela no dia da distribuição' }[p.aba]}
      >
        {formatarMoeda(p.valor)}
      </span>
    ),
    resumo: (r) => <span className="font-semibold text-gray-800">{formatarMoeda(r.valor)}</span>,
  },
  {
    chave: 'interacoes',
    label: 'Interações',
    largura: 'w-28',
    centro: true,
    // Clicar abre o Histórico da Parcela — o mesmo modal da Rotina e da
    // Gestão das Parcelas (HistoricoParcelaModal.jsx).
    celula: (p, acoes) => {
      const detalhe = Object.keys(NOME_CANAL)
        .filter((c) => p.interacoesPorCanal[c][1])
        .map((c) => `${NOME_CANAL[c]}: ${p.interacoesPorCanal[c][0]} de ${p.interacoesPorCanal[c][1]}`)
        .join(' · ');
      return (
        <button
          type="button"
          onClick={() => acoes.abrirHistorico(p)}
          title={`${detalhe ? `${detalhe} — ` : ''}clique para ver o histórico da parcela`}
          className="tabular-nums text-primary-600 hover:text-primary-700 hover:underline"
        >
          {p.interacoesDevidas ? `${p.interacoesFeitas} / ${p.interacoesDevidas}` : '—'}
        </button>
      );
    },
    resumo: (r) =>
      r.devidas ? (
        <span className="font-semibold text-gray-800" title="Interações feitas ÷ interações que deveriam ter sido feitas">
          {r.feitas.toLocaleString('pt-BR')} / {r.devidas.toLocaleString('pt-BR')}
        </span>
      ) : null,
  },
  {
    chave: 'ultimaInteracao',
    label: 'Última interação',
    largura: 'w-24',
    celula: (p) =>
      p.ultimaInteracao ? (
        <span title={p.diasUltimaInteracao ? `Há ${textoDias(p.diasUltimaInteracao)}` : 'Hoje'}>{formatarData(p.ultimaInteracao)}</span>
      ) : (
        <span className="text-gray-400">nenhuma</span>
      ),
    resumo: () => null,
  },
];

const B_GRUPO = 'border-b-2 border-b-gray-400';
const B_LINHA = 'border-b border-b-gray-200';

function classeCelula(borda, centro) {
  return `${borda} border-l border-l-gray-100 py-1.5 text-xs tabular-nums text-gray-700 ${centro ? 'px-1 text-center' : 'pl-2 2xl:pl-4'}`;
}

// Atendente → parcelas (sem agrupar por cliente: um cliente com mais de uma
// parcela ou título aparece em mais de uma linha). Atendentes do maior valor
// pro menor; linhas por cliente e vencimento — na aba Distribuídas, primeiro
// pela data da distribuição (nas outras abas ela não existe e não interfere).
function construirArvore(linhas) {
  const atendentes = new Map();
  for (const p of linhas) {
    if (!atendentes.has(p.usuarioId)) atendentes.set(p.usuarioId, { id: p.usuarioId, nome: p.atendente, linhas: [] });
    atendentes.get(p.usuarioId).linhas.push(p);
  }
  return [...atendentes.values()]
    .map((a) => ({
      ...a,
      resumo: resumir(a.linhas),
      linhas: [...a.linhas].sort(
        (x, y) =>
          (x.dataDistribuicao || '').localeCompare(y.dataDistribuicao || '') ||
          x.cliente.localeCompare(y.cliente, 'pt-BR') ||
          (x.vencimento || '').localeCompare(y.vencimento || '')
      ),
    }))
    .sort((x, y) => y.resumo.valor - x.resumo.valor || x.nome.localeCompare(y.nome, 'pt-BR'));
}

// Relatório "Desempenho da Cobrança": por atendente, as parcelas que eram
// dela — em 3 abas: Parcelas Pagas (pela data do pagamento, com os dias de
// atraso no pagamento), Parcelas em Aberto (pela data de vencimento) e
// Parcelas Distribuídas (só a Distribuição automática, pela data da
// distribuição: 1 linha por parcela × dia, com as interações da etapa
// daquele dia). Nas 2 primeiras, as interações feitas de quantas deveriam em
// toda a vida da parcela e a data da última. Regras no backend
// (relatorio-desempenho-cobranca/desempenhoCobranca.service.js). Mesmo
// desenho do relatório de Repasses CEF (matriz, cabeçalho e total fixos,
// filtros por coluna, Exportar no botão direito) com as abas do Acervo NF-e.
export default function DesempenhoCobrancaPage() {
  const { travada: empresaTravada, empresaIdTravada, empresaIds } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');
  const [dataInicio, setDataInicio] = useState(() => inicioDoMes(hojeIso()));
  const [dataFim, setDataFim] = useState(() => hojeIso());
  const [aba, setAba] = useState('pagas');
  const abaAtual = ABAS.find((a) => a.id === aba);
  const tema = abaAtual.tema;
  const colunas = useMemo(() => COLUNAS.filter((c) => !c.abas || c.abas.includes(aba)), [aba]);

  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  // Parcela com o Histórico aberto (clique na coluna Interações).
  const [parcelaHistorico, setParcelaHistorico] = useState(null);
  const acoes = { abrirHistorico: setParcelaHistorico };

  const [filtroAtendente, setFiltroAtendente] = useState(null);
  const [filtroCliente, setFiltroCliente] = useState(null);
  const thAtendenteRef = useRef(null);
  const thClienteRef = useRef(null);
  const theadRef = useRef(null);
  const [alturaCabecalho, setAlturaCabecalho] = useState(48);

  // Tenant do Sienge pro link do título (mesmo padrão de RotinasTab.jsx).
  const [siengeTenant, setSiengeTenant] = useState('');

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((r) => setEmpresas(r.data))
      .finally(() => setCarregandoEmpresas(false));
  }, []);

  useEffect(() => {
    if (empresaTravada && empresaIdTravada) setEmpresaId(empresaIdTravada);
  }, [empresaTravada, empresaIdTravada]);

  const opcoesEmpresa = useMemo(
    () =>
      empresas
        .filter((e) => !empresaIds || empresaIds.includes(String(e.id)))
        .map((e) => ({ value: e.id, label: nomeExibicaoEmpresa(e) })),
    [empresas, empresaIds]
  );

  useEffect(() => {
    if (!empresaId && opcoesEmpresa.length === 1) setEmpresaId(opcoesEmpresa[0].value);
  }, [empresaId, opcoesEmpresa]);

  useEffect(() => {
    if (!empresaId) return;
    listSiengeIntegracoes({ ativo: true, limit: 100 })
      .then((r) => setSiengeTenant(r.data.find((i) => String(i.empresa_id) === String(empresaId))?.tenant || ''))
      .catch(() => setSiengeTenant(''));
  }, [empresaId]);

  // Só a resposta da última busca vale — trocar a data rápido dispara várias
  // buscas, e uma mais antiga que chegue depois não pode sobrescrever a atual.
  // Uma busca traz as 2 abas; trocar de aba não vai ao servidor.
  const requisicaoRef = useRef(0);
  const carregar = useCallback(() => {
    if (!empresaId || !dataInicio || !dataFim) {
      setDados(null);
      return;
    }
    const minha = ++requisicaoRef.current;
    setCarregando(true);
    setErro('');
    getDesempenhoCobranca(empresaId, { dataInicio, dataFim })
      .then((r) => minha === requisicaoRef.current && setDados(r))
      .catch((err) => minha === requisicaoRef.current && setErro(err.response?.data?.message || 'Não foi possível carregar o relatório.'))
      .finally(() => minha === requisicaoRef.current && setCarregando(false));
  }, [empresaId, dataInicio, dataFim]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const todas = useMemo(() => dados?.parcelas ?? [], [dados]);
  const linhas = useMemo(() => todas.filter((p) => p.aba === aba), [todas, aba]);

  // Opções dos filtros a partir da aba aberta (sem encolher com o próprio filtro).
  const opcoesAtendente = useMemo(
    () =>
      [...new Map(linhas.map((p) => [p.usuarioId, p.atendente])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
        .map(([id, nome]) => ({ value: id, label: nome })),
    [linhas]
  );
  const opcoesCliente = useMemo(
    () => [...new Set(linhas.map((p) => p.cliente))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((n) => ({ value: n, label: n })),
    [linhas]
  );

  const passaNosFiltros = useCallback(
    (p) => passaNoFiltro(filtroAtendente, p.usuarioId) && passaNoFiltro(filtroCliente, p.cliente),
    [filtroAtendente, filtroCliente]
  );
  const linhasFiltradas = useMemo(() => linhas.filter(passaNosFiltros), [linhas, passaNosFiltros]);
  const arvore = useMemo(() => construirArvore(linhasFiltradas), [linhasFiltradas]);
  const total = useMemo(() => resumir(linhasFiltradas), [linhasFiltradas]);
  const filtroAtivo = filtroAtendente != null || filtroCliente != null;

  const tabs = useMemo(
    () =>
      ABAS.map((a) => {
        const n = todas.filter((p) => p.aba === a.id && passaNosFiltros(p)).length;
        return { id: a.id, label: dados ? `${a.label} (${n.toLocaleString('pt-BR')})` : a.label, icon: a.icon, iconColorClass: a.iconColorClass };
      }),
    [todas, dados, passaNosFiltros]
  );

  // Atendentes começam recolhidas; cada aba guarda as suas abertas.
  const [abertas, setAbertas] = useState(() => new Set());
  const chave = (id) => `${aba}:${id}`;
  const tudoExpandido = arvore.length > 0 && arvore.every((a) => abertas.has(chave(a.id)));

  function alternar(id) {
    setAbertas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave(id))) proximo.delete(chave(id));
      else proximo.add(chave(id));
      return proximo;
    });
  }

  function toggleTudo() {
    setAbertas((atual) => {
      const proximo = new Set(atual);
      for (const a of arvore) {
        if (tudoExpandido) proximo.delete(chave(a.id));
        else proximo.add(chave(a.id));
      }
      return proximo;
    });
  }

  // Menu de contexto com "Exportar" — mesmo comportamento do Repasses CEF.
  const [menuContexto, setMenuContexto] = useState(null);
  useEffect(() => {
    if (!menuContexto) return;
    const fechar = () => setMenuContexto(null);
    window.addEventListener('click', fechar);
    window.addEventListener('scroll', fechar, true);
    return () => {
      window.removeEventListener('click', fechar);
      window.removeEventListener('scroll', fechar, true);
    };
  }, [menuContexto]);

  // Exporta só a aba aberta, já filtrada: 1 linha por parcela, datas como
  // data e valores como número, pra somar e filtrar no Excel.
  async function handleExportar() {
    setMenuContexto(null);
    const XLSX = await import('xlsx');
    const data = (iso) => {
      if (!iso) return '';
      const [ano, mes, dia] = iso.split('-').map(Number);
      return new Date(ano, mes - 1, dia);
    };
    const distribuidas = aba === 'distribuidas';
    const comPagamento = aba !== 'abertas';
    const rotuloValor = { pagas: 'Valor recebido', abertas: 'Saldo em aberto', distribuidas: 'Saldo na distribuição' }[aba];
    const saida = [];
    for (const a of arvore) {
      for (const p of a.linhas) {
        saida.push({
          Atendente: a.nome,
          ...(distribuidas ? { Distribuição: data(p.dataDistribuicao), Etapa: p.etapa } : {}),
          Cliente: p.cliente,
          'Centro de Custo': p.centroCusto || '',
          Título: Number(p.billId),
          Parcela: p.parcela,
          Condição: p.condicao || '',
          Vencimento: data(p.vencimento),
          ...(comPagamento ? { Pagamento: data(p.dataPagamento) } : {}),
          'Dias Atraso': Math.max(p.diasAtraso, 0),
          [rotuloValor]: p.valor,
          'Interações feitas': p.interacoesFeitas,
          'Interações devidas': p.interacoesDevidas,
          'Última interação': data(p.ultimaInteracao),
        });
      }
    }
    const planilha = XLSX.utils.json_to_sheet(saida, { cellDates: true, dateNF: 'dd/mm/yyyy' });
    const largura = { Atendente: 24, Distribuição: 12, Etapa: 10, Cliente: 36, 'Centro de Custo': 26, Título: 10, Parcela: 8, Condição: 20 };
    const cabecalhos = Object.keys(saida[0] || {});
    planilha['!cols'] = cabecalhos.map((h) => ({ wch: largura[h] ?? (h === rotuloValor ? 15 : 12) }));
    const colunaValor = cabecalhos.indexOf(rotuloValor);
    const range = XLSX.utils.decode_range(planilha['!ref']);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const celula = planilha[XLSX.utils.encode_cell({ r, c: colunaValor })];
      if (celula && celula.t === 'n') celula.z = '"R$" #,##0.00';
    }
    planilha['!autofilter'] = { ref: planilha['!ref'] };
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, ABAS.find((a) => a.id === aba).label);
    XLSX.writeFile(livro, `desempenho-cobranca-${aba}_${dataInicio}_a_${dataFim}.xlsx`);
  }

  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const medir = () => setAlturaCabecalho(el.getBoundingClientRect().height);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [dados, aba]);
  const topoRotuloGrudado = alturaCabecalho - 24 + 8;

  const thBase = `sticky -top-6 z-20 border-b-2 ${tema.th} py-2.5 text-center font-medium`;

  function cabecalhoComFiltro(ref, filtro, setFiltro, opcoes, labelFiltro, titulo, classes) {
    return (
      <th ref={ref} className={`${thBase} px-2 ${classes}`}>
        <span className="inline-flex items-center justify-center gap-1.5">
          <FiltroColuna filtro={filtro} onChange={setFiltro} opcoes={opcoes} label={labelFiltro} colunaRef={ref} />
          {titulo}
        </span>
      </th>
    );
  }

  function celulaParcela(p, borda) {
    const rotulo = `${p.billId} / ${p.parcela}`;
    const dica = [p.condicao, p.centroCusto].filter(Boolean).join(' · ');
    return (
      <td className={`${borda} border-l border-l-gray-100 py-1.5 pl-2 pr-1 text-xs text-gray-700 2xl:pl-4`}>
        {siengeTenant ? (
          <a
            href={`https://${siengeTenant}.sienge.com.br/sienge/CRC/editTitulo.do?entity.tituloPK.nuTitulo=${p.billId}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Abrir título no Sienge${dica ? ` · ${dica}` : ''}`}
            className="tabular-nums text-primary-600 hover:text-primary-700 hover:underline"
          >
            {rotulo}
          </a>
        ) : (
          <span className="tabular-nums" title={dica || undefined}>
            {rotulo}
          </span>
        )}
      </td>
    );
  }

  const semResultadoFiltro = linhas.length > 0 && linhasFiltradas.length === 0;
  const temDados = !carregando && !erro && linhas.length > 0;
  const TOTAL_COLUNAS = 3 + colunas.length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="min-w-0 flex-1 lg:max-w-xs">
            <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
            <SearchableSelect
              value={empresaId}
              onChange={(v) => setEmpresaId(v || '')}
              disabled={carregandoEmpresas || empresaTravada}
              options={opcoesEmpresa}
              placeholder={carregandoEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
              emptyMessage="Nenhuma empresa encontrada."
            />
          </div>
          <div className="flex gap-3">
            <div>
              <label htmlFor="desempenho-inicio" className="mb-1 block text-sm font-medium text-gray-700">
                {abaAtual.rotuloInicio}
              </label>
              <input
                id="desempenho-inicio"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <div>
              <label htmlFor="desempenho-fim" className="mb-1 block text-sm font-medium text-gray-700">
                {abaAtual.rotuloFim}
              </label>
              <input
                id="desempenho-fim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
          </div>
          {filtroAtivo && (
            <button
              type="button"
              onClick={() => {
                setFiltroAtendente(null);
                setFiltroCliente(null);
              }}
              className="self-start text-xs text-gray-400 underline decoration-dotted hover:text-gray-600 lg:mb-2.5 lg:self-end"
            >
              Mostrar tudo
            </button>
          )}
          {temDados && (
            <button
              type="button"
              onClick={toggleTudo}
              disabled={arvore.length === 0}
              className="inline-flex items-center gap-1.5 self-start rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-800 disabled:opacity-50 lg:ml-auto lg:self-end"
            >
              {tudoExpandido ? <Minus size={14} /> : <Plus size={14} />}
              {tudoExpandido ? 'Recolher' : 'Expandir'}
            </button>
          )}
        </div>
      </Card>

      {/* Abas + painel num item só (mesmo padrão do Acervo NF-e / NFS-e):
          o canto superior esquerdo do painel fica reto pra encaixar na
          primeira aba. */}
      <div>
        <Tabs tabs={tabs} activeId={aba} onChange={setAba} />

        <div className="rounded-card rounded-tl-none bg-white shadow-card">
          {!empresaId ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <HandCoins size={26} className="text-gray-300" />
              <p className="text-sm text-gray-600">Selecione uma empresa para ver o relatório.</p>
            </div>
          ) : carregando && !dados ? (
            <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
          ) : erro ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <TriangleAlert size={26} className="text-red-400" />
              <p className="text-sm text-gray-600">{erro}</p>
            </div>
          ) : linhas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-14 text-center">
              <HandCoins size={26} className="text-gray-300" />
              <p className="text-sm text-gray-600">{abaAtual.vazio}</p>
            </div>
          ) : (
            <div
              className={`rounded-card rounded-tl-none transition-opacity ${carregando ? 'opacity-60' : ''}`}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuContexto({ x: e.clientX, y: e.clientY });
              }}
            >
              <table className="w-full border-separate border-spacing-0 text-left text-xs">
                <thead ref={theadRef}>
                  <tr className={`text-xs uppercase tracking-wide ${tema.texto}`}>
                    {cabecalhoComFiltro(thAtendenteRef, filtroAtendente, setFiltroAtendente, opcoesAtendente, 'atendente', 'Atendente', 'w-36 2xl:w-48')}
                    {cabecalhoComFiltro(thClienteRef, filtroCliente, setFiltroCliente, opcoesCliente, 'cliente', 'Cliente', `w-60 border-l ${tema.divisor} 2xl:w-80`)}
                    <th className={`${thBase} w-28 border-l ${tema.divisor} px-2`}>Título / Parcela</th>
                    {colunas.map((coluna, i) => (
                      <th
                        key={coluna.chave}
                        className={`${thBase} ${coluna.largura} border-l ${tema.divisor} px-1 2xl:px-2 ${i === colunas.length - 1 ? 'rounded-tr-card' : ''}`}
                      >
                        {coluna.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {semResultadoFiltro && (
                    <tr>
                      <td colSpan={TOTAL_COLUNAS} className="py-12 text-center text-sm text-gray-500">
                        <p className="font-medium text-gray-700">Nenhuma parcela corresponde aos filtros selecionados.</p>
                      </td>
                    </tr>
                  )}
                  {arvore.map((a) => {
                    if (!abertas.has(chave(a.id))) {
                      return (
                        <tr key={a.id}>
                          <td className={`${B_GRUPO} border-r border-r-gray-200 bg-white px-2 py-2.5 align-middle 2xl:px-4`}>
                            <RotuloAgrupador aberto={false} negrito nome={a.nome} contagem={a.resumo.clientes} onClick={() => alternar(a.id)} />
                          </td>
                          <td className={classeCelula(B_GRUPO)}>
                            {a.resumo.clientes} {a.resumo.clientes === 1 ? 'cliente' : 'clientes'}
                          </td>
                          <td className={classeCelula(B_GRUPO)}>
                            {a.resumo.parcelas} {a.resumo.parcelas === 1 ? 'parcela' : 'parcelas'}
                          </td>
                          {colunas.map((coluna) => (
                            <td key={coluna.chave} className={classeCelula(B_GRUPO, coluna.centro)}>
                              {coluna.resumo(a.resumo)}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    return (
                      <Fragment key={a.id}>
                        {a.linhas.map((p, i) => {
                          const borda = i === a.linhas.length - 1 ? B_GRUPO : B_LINHA;
                          return (
                            <tr key={`${a.id}-${p.billId}-${p.installmentId}-${p.dataDistribuicao || ''}`}>
                              {i === 0 && (
                                <td rowSpan={a.linhas.length} className={`${B_GRUPO} border-r border-r-gray-200 bg-white px-2 py-2.5 align-top 2xl:px-4`}>
                                  <RotuloAgrupador
                                    aberto
                                    negrito
                                    nome={a.nome}
                                    contagem={a.resumo.clientes}
                                    onClick={() => alternar(a.id)}
                                    topoGrudado={topoRotuloGrudado}
                                  />
                                </td>
                              )}
                              <td className={`${borda} border-l border-l-gray-100 py-1.5 pl-2 pr-1 text-xs text-gray-800 2xl:pl-4`}>{p.cliente}</td>
                              {celulaParcela(p, borda)}
                              {colunas.map((coluna) => (
                                <td key={coluna.chave} className={classeCelula(borda, coluna.centro)}>
                                  {coluna.celula(p, acoes)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className={`text-xs font-semibold ${tema.texto}`}>
                    <td className={`sticky -bottom-6 z-10 rounded-bl-card border-t-2 ${tema.tf} px-4 py-2.5`}>
                      Total · {arvore.length} {arvore.length === 1 ? 'atendente' : 'atendentes'}
                    </td>
                    <td className={`sticky -bottom-6 z-10 border-t-2 ${tema.tf} border-l ${tema.divisor} py-2.5 pl-2 tabular-nums 2xl:pl-4`}>
                      {total.clientes.toLocaleString('pt-BR')} {total.clientes === 1 ? 'cliente' : 'clientes'}
                    </td>
                    <td className={`sticky -bottom-6 z-10 border-t-2 ${tema.tf} border-l ${tema.divisor} py-2.5 pl-2 tabular-nums 2xl:pl-4`}>
                      {total.parcelas.toLocaleString('pt-BR')} {total.parcelas === 1 ? 'parcela' : 'parcelas'}
                    </td>
                    {colunas.map((coluna, i) => (
                      <td
                        key={coluna.chave}
                        className={`sticky -bottom-6 z-10 border-t-2 ${tema.tf} border-l ${tema.divisor} py-2.5 tabular-nums ${
                          coluna.centro ? 'px-1 text-center' : 'pl-2 2xl:pl-4'
                        } ${i === colunas.length - 1 ? 'rounded-br-card' : ''}`}
                      >
                        {coluna.resumo(total)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      <HistoricoParcelaModal
        open={Boolean(parcelaHistorico)}
        onClose={() => setParcelaHistorico(null)}
        empresaId={empresaId}
        billId={parcelaHistorico?.billId}
        installmentId={parcelaHistorico?.installmentId}
        clientName={parcelaHistorico?.cliente}
      />

      {menuContexto &&
        createPortal(
          <div
            style={{ position: 'fixed', top: menuContexto.y, left: menuContexto.x }}
            className="z-100 min-w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              onClick={handleExportar}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileDown size={14} className="text-gray-400" />
              Exportar
            </button>
          </div>,
          document.body
        )}
    </div>
  );
}
