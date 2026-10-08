import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, HandCoins, Minus, Plus, TriangleAlert } from 'lucide-react';
import Card from '../../../components/Card';
import SearchableSelect from '../../../components/SearchableSelect';
import FiltroColuna, { passaNoFiltro } from '../../../components/FiltroColuna';
import RotuloAgrupador from '../../../components/RotuloAgrupador';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { listEmpresas } from '../../../api/empresas.api';
import { listSiengeIntegracoes } from '../../../api/sienge.api';
import { getDesempenhoCobranca } from '../../../api/relatorioDesempenhoCobranca.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';

// ─── formatação ────────────────────────────────────────────────────────────

function formatarData(iso) {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function Vazio() {
  return <span className="text-gray-300">—</span>;
}

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const inicioDoMes = (iso) => `${iso.slice(0, 8)}01`;

function textoDias(dias) {
  if (dias == null) return null;
  if (dias === 0) return 'hoje';
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

// Status da parcela PARA A ATENDENTE da linha (ver backend
// relatorio-desempenho-cobranca/desempenhoCobranca.service.js).
const STATUS = {
  pago: { label: 'Pago', classe: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  aberto: { label: 'Em aberto', classe: 'bg-amber-50 text-amber-700 ring-amber-200' },
  encerrada: { label: 'Encerrada sem pagamento', classe: 'bg-violet-50 text-violet-700 ring-violet-200' },
  transferida: { label: 'Transferida', classe: 'bg-gray-50 text-gray-500 ring-gray-200' },
};

function textoStatus(p) {
  if (p.status === 'encerrada' && p.operacaoEncerramento) return `Encerrada · ${p.operacaoEncerramento}`;
  if (p.status === 'transferida' && p.transferidaPara) return `Transferida · ${p.transferidaPara}`;
  return STATUS[p.status].label;
}

function tituloStatus(p) {
  if (p.status === 'encerrada') return 'Saldo zerado no Sienge sem Recebimento (reparcelamento, distrato, substituição). Não conta como pago.';
  if (p.status === 'transferida') return 'O cliente passou para outra atendente. Pagamento e saldo aparecem na linha dela.';
  return undefined;
}

// Cor do "feitas / devidas": tudo feito = verde; parte = âmbar; nada = vermelho.
function corCumprimento(feitas, devidas) {
  if (!devidas) return 'text-gray-400';
  if (feitas >= devidas) return 'text-emerald-700';
  return feitas > 0 ? 'text-amber-700' : 'text-red-600';
}

function SeloPercentual({ feitas, devidas }) {
  if (!devidas) return null;
  const pct = Math.round((feitas / devidas) * 100);
  const cor =
    pct >= 100
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : pct > 0
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-red-50 text-red-700 ring-red-200';
  return <span className={`ml-1.5 rounded-full px-1.5 py-px text-[10px] font-semibold ring-1 ${cor}`}>{pct}%</span>;
}

// Resumo de um conjunto de linhas (grupo recolhido, linha de grupo, total).
function resumir(linhas) {
  const pagas = linhas.filter((p) => p.status === 'pago');
  const abertas = linhas.filter((p) => p.status === 'aberto');
  const dias = linhas.map((p) => p.diasUltimaInteracao).filter((d) => d != null);
  return {
    parcelas: linhas.length,
    clientes: new Set(linhas.map((p) => p.clientId)).size,
    pagas: pagas.length,
    abertas: abertas.length,
    valorRecebido: pagas.reduce((s, p) => s + p.valor, 0),
    valorAberto: abertas.reduce((s, p) => s + p.valor, 0),
    feitas: linhas.reduce((s, p) => s + p.interacoesFeitas, 0),
    devidas: linhas.reduce((s, p) => s + p.interacoesDevidas, 0),
    maisRecente: dias.length ? Math.min(...dias) : null,
  };
}

const NOME_CANAL = { whatsapp: 'WhatsApp', email: 'E-mail', ligacao: 'Ligação' };

// Colunas analíticas. `celula` desenha 1 parcela; `resumo` um grupo/total.
const COLUNAS = [
  {
    chave: 'vencimento',
    label: 'Vencimento',
    largura: 'w-24',
    celula: (p) => formatarData(p.vencimento) || <Vazio />,
    resumo: () => <Vazio />,
  },
  {
    chave: 'pagamento',
    label: 'Pagamento',
    largura: 'w-24',
    celula: (p) => formatarData(p.dataPagamento) || <Vazio />,
    resumo: () => <Vazio />,
  },
  {
    chave: 'valor',
    label: 'Valor',
    largura: 'w-36',
    celula: (p) =>
      p.status === 'pago' ? (
        <span className="font-medium text-emerald-700" title="Valor recebido">
          {formatarMoeda(p.valor)}
        </span>
      ) : p.status === 'aberto' ? (
        <span className="text-amber-700" title="Saldo em aberto">
          {formatarMoeda(p.valor)}
        </span>
      ) : (
        <Vazio />
      ),
    resumo: (r) =>
      r.valorRecebido || r.valorAberto ? (
        <span className="block leading-tight">
          <span className="block font-semibold text-emerald-700" title="Valor recebido">
            {formatarMoeda(r.valorRecebido)}
          </span>
          <span className="block text-[11px] text-amber-700" title="Saldo em aberto">
            {formatarMoeda(r.valorAberto)} em aberto
          </span>
        </span>
      ) : (
        <Vazio />
      ),
  },
  {
    chave: 'interacoes',
    label: 'Interações',
    largura: 'w-32',
    celula: (p) =>
      p.interacoesDevidas ? (
        <span
          className={`font-medium ${corCumprimento(p.interacoesFeitas, p.interacoesDevidas)}`}
          title={Object.keys(NOME_CANAL)
            .filter((c) => p.interacoesPorCanal[c][1])
            .map((c) => `${NOME_CANAL[c]}: ${p.interacoesPorCanal[c][0]} de ${p.interacoesPorCanal[c][1]}`)
            .join(' · ')}
        >
          {p.interacoesFeitas} / {p.interacoesDevidas}
        </span>
      ) : (
        <span className="text-gray-400" title="Nenhuma tarefa da atendente nesta parcela (os envios são automáticos)">
          —
        </span>
      ),
    resumo: (r) =>
      r.devidas ? (
        <span title="Interações feitas ÷ interações que deveriam ter sido feitas">
          <span className={`font-semibold ${corCumprimento(r.feitas, r.devidas)}`}>
            {r.feitas.toLocaleString('pt-BR')} / {r.devidas.toLocaleString('pt-BR')}
          </span>
          <SeloPercentual feitas={r.feitas} devidas={r.devidas} />
        </span>
      ) : (
        <Vazio />
      ),
  },
  {
    chave: 'diasUltimaInteracao',
    label: 'Dias última interação',
    largura: 'w-24',
    celula: (p) =>
      p.diasUltimaInteracao != null ? (
        <span title={`Última interação em ${formatarData(p.ultimaInteracao)}`}>{textoDias(p.diasUltimaInteracao)}</span>
      ) : (
        <span className="text-gray-400">nenhuma</span>
      ),
    resumo: (r) =>
      r.maisRecente != null ? (
        <span title="Interação mais recente do grupo">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">última </span>
          {textoDias(r.maisRecente)}
        </span>
      ) : (
        <span className="text-gray-400">nenhuma</span>
      ),
  },
  {
    chave: 'status',
    label: 'Status',
    largura: 'w-44',
    celula: (p) => (
      <span title={tituloStatus(p)} className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${STATUS[p.status].classe}`}>
        {textoStatus(p)}
      </span>
    ),
    resumo: (r) => (
      <span>
        <b className="font-semibold text-emerald-700">{r.pagas}</b> {r.pagas === 1 ? 'paga' : 'pagas'}
        <span className="text-gray-300"> · </span>
        <b className="font-semibold text-amber-700">{r.abertas}</b> em aberto
      </span>
    ),
  },
];

const B_GRUPO = 'border-b-2 border-b-gray-400';
const B_LINHA = 'border-b border-b-gray-200';
const B_CLIENTE = 'border-b border-b-gray-300';

function CelulaResumo({ children, borda }) {
  return <td className={`${borda} border-l border-l-gray-100 py-1.5 pl-2 text-xs tabular-nums text-gray-700 2xl:pl-4`}>{children}</td>;
}

function CelulasResumo({ resumo, borda }) {
  return COLUNAS.map((coluna) => (
    <CelulaResumo key={coluna.chave} borda={borda}>
      {coluna.resumo(resumo)}
    </CelulaResumo>
  ));
}

// Atendente → Cliente → Parcela. Atendentes do maior valor recebido pro
// menor; clientes idem; parcelas pelo vencimento.
function construirArvore(linhas) {
  const atendentes = new Map();
  for (const p of linhas) {
    if (!atendentes.has(p.usuarioId)) atendentes.set(p.usuarioId, { id: p.usuarioId, nome: p.atendente, linhas: [], clientes: new Map() });
    const a = atendentes.get(p.usuarioId);
    a.linhas.push(p);
    const chaveCliente = `${p.usuarioId}::${p.clientId}`;
    if (!a.clientes.has(chaveCliente)) a.clientes.set(chaveCliente, { chave: chaveCliente, nome: p.cliente, linhas: [] });
    a.clientes.get(chaveCliente).linhas.push(p);
  }
  return [...atendentes.values()]
    .map((a) => ({
      ...a,
      resumo: resumir(a.linhas),
      clientes: [...a.clientes.values()]
        .map((c) => ({
          ...c,
          resumo: resumir(c.linhas),
          linhas: [...c.linhas].sort((x, y) => (x.vencimento || '').localeCompare(y.vencimento || '')),
        }))
        .sort((x, y) => y.resumo.valorRecebido - x.resumo.valorRecebido || x.nome.localeCompare(y.nome, 'pt-BR')),
    }))
    .sort((x, y) => y.resumo.valorRecebido - x.resumo.valorRecebido || x.nome.localeCompare(y.nome, 'pt-BR'));
}

// Relatório "Desempenho da Cobrança": por atendente, cada parcela que ela teve
// sob responsabilidade — interações feitas de quantas deveria ter feito em
// toda a vida da parcela, dias desde a última, e se foi paga (data e valor
// recebido) ou continua em aberto (saldo). Mesmo desenho do relatório de
// Repasses CEF (matriz com agrupadores, cabeçalho e total fixos, filtros por
// coluna e Exportar no botão direito).
export default function DesempenhoCobrancaPage() {
  const { travada: empresaTravada, empresaIdTravada, empresaIds } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');
  const [dataInicio, setDataInicio] = useState(() => inicioDoMes(hojeIso()));
  const [dataFim, setDataFim] = useState(() => hojeIso());

  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const [filtroAtendente, setFiltroAtendente] = useState(null);
  const [filtroCliente, setFiltroCliente] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState(null);
  const thAtendenteRef = useRef(null);
  const thClienteRef = useRef(null);
  const thStatusRef = useRef(null);
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

  const linhas = useMemo(() => dados?.parcelas ?? [], [dados]);

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
  const opcoesStatus = useMemo(() => {
    const presentes = new Set(linhas.map((p) => p.status));
    return Object.entries(STATUS)
      .filter(([k]) => presentes.has(k))
      .map(([k, s]) => ({ value: k, label: s.label }));
  }, [linhas]);

  const linhasFiltradas = useMemo(
    () =>
      linhas.filter(
        (p) => passaNoFiltro(filtroAtendente, p.usuarioId) && passaNoFiltro(filtroCliente, p.cliente) && passaNoFiltro(filtroStatus, p.status)
      ),
    [linhas, filtroAtendente, filtroCliente, filtroStatus]
  );

  const arvore = useMemo(() => construirArvore(linhasFiltradas), [linhasFiltradas]);
  const total = useMemo(() => resumir(linhasFiltradas), [linhasFiltradas]);
  const filtroAtivo = [filtroAtendente, filtroCliente, filtroStatus].some((f) => f != null);

  function limparFiltros() {
    setFiltroAtendente(null);
    setFiltroCliente(null);
    setFiltroStatus(null);
  }

  // Atendentes começam recolhidas; clientes abertos dentro de uma atendente aberta.
  const [atendentesAbertas, setAtendentesAbertas] = useState(() => new Set());
  const [clientesRecolhidos, setClientesRecolhidos] = useState(() => new Set());
  const tudoExpandido = arvore.length > 0 && arvore.every((a) => atendentesAbertas.has(a.id));

  function alternar(setter, chave) {
    setter((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  function toggleTudo() {
    if (tudoExpandido) setAtendentesAbertas(new Set());
    else {
      setAtendentesAbertas(new Set(arvore.map((a) => a.id)));
      setClientesRecolhidos(new Set());
    }
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

  // 1 linha por atendente × parcela, já filtrada — datas como data e valores
  // como número, pra somar e filtrar no Excel.
  async function handleExportar() {
    setMenuContexto(null);
    const XLSX = await import('xlsx');
    const data = (iso) => {
      if (!iso) return '';
      const [ano, mes, dia] = iso.split('-').map(Number);
      return new Date(ano, mes - 1, dia);
    };
    const saida = [];
    for (const a of arvore) {
      for (const c of a.clientes) {
        for (const p of c.linhas) {
          saida.push({
            Atendente: a.nome,
            Cliente: p.cliente,
            'Centro de Custo': p.centroCusto || '',
            Título: Number(p.billId),
            Parcela: p.parcela,
            Condição: p.condicao || '',
            Vencimento: data(p.vencimento),
            Pagamento: data(p.dataPagamento),
            Status: textoStatus(p),
            'Valor recebido': p.status === 'pago' ? p.valor : '',
            'Saldo em aberto': p.status === 'aberto' ? p.valor : '',
            'Interações feitas': p.interacoesFeitas,
            'Interações devidas': p.interacoesDevidas,
            'Cumprimento (%)': p.interacoesDevidas ? Math.round((p.interacoesFeitas / p.interacoesDevidas) * 100) : '',
            'Última interação': data(p.ultimaInteracao),
            'Dias desde a última interação': p.diasUltimaInteracao ?? '',
          });
        }
      }
    }
    const planilha = XLSX.utils.json_to_sheet(saida, { cellDates: true, dateNF: 'dd/mm/yyyy' });
    planilha['!cols'] = [24, 36, 26, 10, 8, 20, 12, 12, 26, 15, 15, 10, 10, 12, 14, 12].map((wch) => ({ wch }));
    const range = XLSX.utils.decode_range(planilha['!ref']);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      for (const col of [9, 10]) {
        const celula = planilha[XLSX.utils.encode_cell({ r, c: col })];
        if (celula && celula.t === 'n') celula.z = '"R$" #,##0.00';
      }
    }
    planilha['!autofilter'] = { ref: planilha['!ref'] };
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Desempenho');
    XLSX.writeFile(livro, `desempenho-cobranca_${dataInicio}_a_${dataFim}.xlsx`);
  }

  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const medir = () => setAlturaCabecalho(el.getBoundingClientRect().height);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [dados]);
  const topoRotuloGrudado = alturaCabecalho - 24 + 8;

  function cabecalho(ref, filtro, setFiltro, opcoes, labelFiltro, titulo, classes) {
    return (
      <th ref={ref} className={`sticky -top-6 z-20 border-b-2 border-b-primary-500 bg-primary-50 px-2 py-2.5 text-center font-medium ${classes}`}>
        <span className="inline-flex items-center justify-center gap-1.5">
          {opcoes && <FiltroColuna filtro={filtro} onChange={setFiltro} opcoes={opcoes} label={labelFiltro} colunaRef={ref} />}
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
        {/* Condição (ATO, Parcela mensal, Desconto...) — sem ela, "19078 / 1"
            do ATO e do Desconto pareciam a mesma parcela repetida. */}
        {p.condicao && <span className="block truncate text-[10px] uppercase tracking-wide text-gray-400">{p.condicao.toLowerCase()}</span>}
      </td>
    );
  }

  const semResultadoFiltro = linhas.length > 0 && linhasFiltradas.length === 0;
  const temDados = !carregando && !erro && linhas.length > 0;
  const TOTAL_COLUNAS = 3 + COLUNAS.length;

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
                Data início
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
                Data fim
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
              onClick={limparFiltros}
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

      <div className="rounded-card bg-white shadow-card">
        {!empresaId ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <HandCoins size={26} className="text-gray-300" />
            <p className="text-sm text-gray-600">Selecione uma empresa para ver o relatório.</p>
          </div>
        ) : carregando ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : erro ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <TriangleAlert size={26} className="text-red-400" />
            <p className="text-sm text-gray-600">{erro}</p>
          </div>
        ) : linhas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <HandCoins size={26} className="text-gray-300" />
            <p className="text-sm text-gray-600">Nenhuma parcela na Rotina nem paga no período.</p>
          </div>
        ) : (
          <div
            className="rounded-card"
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuContexto({ x: e.clientX, y: e.clientY });
            }}
          >
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <thead ref={theadRef}>
                <tr className="text-xs uppercase tracking-wide text-primary-700">
                  {cabecalho(thAtendenteRef, filtroAtendente, setFiltroAtendente, opcoesAtendente, 'atendente', 'Atendente', 'w-36 rounded-tl-card 2xl:w-48')}
                  {cabecalho(thClienteRef, filtroCliente, setFiltroCliente, opcoesCliente, 'cliente', 'Cliente', 'w-56 border-l border-l-primary-100 2xl:w-72')}
                  {cabecalho(null, null, null, null, null, 'Título / Parcela', 'w-28 border-l border-l-primary-100')}
                  {COLUNAS.map((coluna, i) =>
                    coluna.chave === 'status' ? (
                      <Fragment key={coluna.chave}>
                        {cabecalho(
                          thStatusRef,
                          filtroStatus,
                          setFiltroStatus,
                          opcoesStatus,
                          'status',
                          coluna.label,
                          `${coluna.largura} border-l border-l-primary-100 ${i === COLUNAS.length - 1 ? 'rounded-tr-card' : ''}`
                        )}
                      </Fragment>
                    ) : (
                      <th
                        key={coluna.chave}
                        className={`sticky -top-6 z-20 ${coluna.largura} border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-1 py-2.5 text-center font-medium 2xl:px-2 ${
                          i === COLUNAS.length - 1 ? 'rounded-tr-card' : ''
                        }`}
                      >
                        {coluna.label}
                      </th>
                    )
                  )}
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
                  if (!atendentesAbertas.has(a.id)) {
                    return (
                      <tr key={a.id}>
                        <td className={`${B_GRUPO} border-r border-r-gray-200 bg-white px-2 py-2.5 align-middle 2xl:px-4`}>
                          <RotuloAgrupador aberto={false} negrito nome={a.nome} contagem={a.clientes.length} onClick={() => alternar(setAtendentesAbertas, a.id)} />
                        </td>
                        <CelulaResumo borda={B_GRUPO}>
                          {a.resumo.clientes} {a.resumo.clientes === 1 ? 'cliente' : 'clientes'}
                        </CelulaResumo>
                        <CelulaResumo borda={B_GRUPO}>
                          {a.resumo.parcelas} {a.resumo.parcelas === 1 ? 'parcela' : 'parcelas'}
                        </CelulaResumo>
                        <CelulasResumo resumo={a.resumo} borda={B_GRUPO} />
                      </tr>
                    );
                  }

                  const blocos = a.clientes.map((c) => ({ ...c, recolhido: clientesRecolhidos.has(c.chave) }));
                  const totalLinhas = blocos.reduce((s, c) => s + (c.recolhido ? 1 : c.linhas.length), 0);
                  let primeiraLinha = true;
                  return (
                    <Fragment key={a.id}>
                      {blocos.map((c, iCliente) => {
                        const ultimoCliente = iCliente === blocos.length - 1;
                        const celulaAtendente = primeiraLinha && (
                          <td rowSpan={totalLinhas} className={`${B_GRUPO} border-r border-r-gray-200 bg-white px-2 py-2.5 align-top 2xl:px-4`}>
                            <RotuloAgrupador
                              aberto
                              negrito
                              nome={a.nome}
                              contagem={a.clientes.length}
                              onClick={() => alternar(setAtendentesAbertas, a.id)}
                              topoGrudado={topoRotuloGrudado}
                            />
                          </td>
                        );
                        primeiraLinha = false;
                        const bordaCliente = ultimoCliente ? B_GRUPO : B_CLIENTE;

                        if (c.recolhido) {
                          return (
                            <tr key={c.chave}>
                              {celulaAtendente}
                              <td className={`${bordaCliente} border-l border-l-gray-200 bg-white px-2 py-2.5 align-middle 2xl:px-4`}>
                                <RotuloAgrupador aberto={false} nome={c.nome} contagem={c.linhas.length} onClick={() => alternar(setClientesRecolhidos, c.chave)} />
                              </td>
                              <CelulaResumo borda={bordaCliente}>
                                {c.linhas.length} {c.linhas.length === 1 ? 'parcela' : 'parcelas'}
                              </CelulaResumo>
                              <CelulasResumo resumo={c.resumo} borda={bordaCliente} />
                            </tr>
                          );
                        }

                        return c.linhas.map((p, iLinha) => {
                          const borda = iLinha === c.linhas.length - 1 ? bordaCliente : B_LINHA;
                          return (
                            <tr key={`${c.chave}-${p.billId}-${p.installmentId}`}>
                              {iLinha === 0 && celulaAtendente}
                              {iLinha === 0 && (
                                <td rowSpan={c.linhas.length} className={`${bordaCliente} border-l border-l-gray-200 bg-white px-2 py-2.5 align-top 2xl:px-4`}>
                                  <RotuloAgrupador
                                    aberto
                                    nome={c.nome}
                                    contagem={c.linhas.length}
                                    onClick={() => alternar(setClientesRecolhidos, c.chave)}
                                    topoGrudado={topoRotuloGrudado}
                                  />
                                </td>
                              )}
                              {celulaParcela(p, borda)}
                              {COLUNAS.map((coluna) => (
                                <td key={coluna.chave} className={`${borda} border-l border-l-gray-100 py-1.5 pl-2 text-xs tabular-nums text-gray-700 2xl:pl-4`}>
                                  {coluna.celula(p)}
                                </td>
                              ))}
                            </tr>
                          );
                        });
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="text-xs font-semibold text-primary-700">
                  <td className="sticky -bottom-6 z-10 rounded-bl-card border-t-2 border-t-primary-500 bg-primary-50 px-4 py-2.5">
                    Total · {arvore.length} {arvore.length === 1 ? 'atendente' : 'atendentes'}
                  </td>
                  <td className="sticky -bottom-6 z-10 border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-2 tabular-nums 2xl:pl-4">
                    {total.clientes.toLocaleString('pt-BR')} {total.clientes === 1 ? 'cliente' : 'clientes'}
                  </td>
                  <td className="sticky -bottom-6 z-10 border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-2 tabular-nums 2xl:pl-4">
                    {total.parcelas.toLocaleString('pt-BR')} {total.parcelas === 1 ? 'parcela' : 'parcelas'}
                  </td>
                  {COLUNAS.map((coluna, i) => (
                    <td
                      key={coluna.chave}
                      className={`sticky -bottom-6 z-10 border-t-2 border-t-primary-500 border-l border-l-primary-100 bg-primary-50 py-2.5 pl-2 tabular-nums 2xl:pl-4 ${
                        i === COLUNAS.length - 1 ? 'rounded-br-card' : ''
                      }`}
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
