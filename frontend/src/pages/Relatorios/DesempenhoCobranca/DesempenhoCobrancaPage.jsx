import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, FileDown, HandCoins, Minus, Plus, TriangleAlert } from 'lucide-react';
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

function mediaDe(valores) {
  const v = valores.filter((x) => x != null);
  if (v.length === 0) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

function ResumoMedia({ valor, sufixo = '' }) {
  if (valor == null) return <Vazio />;
  return (
    <span title="Média das parcelas pagas do grupo">
      <span className="text-[10px] uppercase tracking-wide text-gray-400">média </span>
      {valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
      {sufixo}
    </span>
  );
}

// Situação da parcela PARA A ATENDENTE da linha (ver desempenhoCobranca.service.js).
const SITUACOES = {
  paga: { label: 'Paga', classe: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  outra: { label: 'Paga · crédito de outra', classe: 'bg-gray-50 text-gray-500 ring-gray-200' },
  sem_credito: { label: 'Paga · sem crédito', classe: 'bg-gray-50 text-gray-500 ring-gray-200' },
  encerrada: { label: 'Encerrada sem pagamento', classe: 'bg-violet-50 text-violet-700 ring-violet-200' },
  aberta: { label: 'Em aberto', classe: 'bg-amber-50 text-amber-700 ring-amber-200' },
};

function textoSituacao(p) {
  if (p.situacao === 'outra') return `Paga · crédito de ${p.creditoDe}`;
  if (p.situacao === 'encerrada' && p.operacaoEncerramento) return `Encerrada · ${p.operacaoEncerramento}`;
  return SITUACOES[p.situacao].label;
}

function tituloSituacao(p) {
  if (p.situacao === 'sem_credito') return 'Pago no período, mas a última interação foi depois do pagamento ou antes da janela de crédito.';
  if (p.situacao === 'encerrada') return 'Saldo zerado no Sienge sem um Recebimento (reparcelamento, distrato, substituição...). Não conta como pagamento.';
  if (p.situacao === 'outra') return 'O pagamento ficou com quem fez a última interação antes dele.';
  return undefined;
}

function textoAtraso(dias) {
  if (dias == null) return null;
  if (dias === 0) return 'no vencimento';
  return dias > 0 ? `${dias} ${dias === 1 ? 'dia' : 'dias'} após` : `${-dias} ${dias === -1 ? 'dia' : 'dias'} antes`;
}

// Resumo de um conjunto de parcelas (grupo recolhido, linha do grupo e total).
function resumir(parcelas) {
  const pagas = parcelas.filter((p) => p.situacao === 'paga');
  return {
    parcelas: parcelas.length,
    clientes: new Set(parcelas.map((p) => p.clientId)).size,
    interacoes: parcelas.reduce((s, p) => s + p.interacoes, 0),
    ultimaInteracao: parcelas.reduce((m, p) => (p.ultimaInteracao && (!m || p.ultimaInteracao > m) ? p.ultimaInteracao : m), null),
    pagas: pagas.length,
    conversao: parcelas.length ? pagas.length / parcelas.length : 0,
    valorRecebido: pagas.reduce((s, p) => s + p.valorRecebido, 0),
    interacoesAtePagar: mediaDe(pagas.map((p) => p.interacoesAtePagar)),
    diasAtePagar: mediaDe(pagas.map((p) => p.diasAtePagar)),
    // Recuperadas = pagas depois do vencimento; em dia = no vencimento ou antes
    // (lembrete). Contagem em vez de média: vencimentos provisórios do Sienge
    // (ex.: 01/01/2050) distorcem qualquer média de dias.
    recuperadas: pagas.filter((p) => p.atrasoNoPagamento > 0).length,
    emDia: pagas.filter((p) => p.atrasoNoPagamento != null && p.atrasoNoPagamento <= 0).length,
  };
}

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
    chave: 'interacoes',
    label: 'Interações',
    largura: 'w-24',
    celula: (p) =>
      p.interacoes ? (
        <span
          title={`WhatsApp ${p.interacoesPorCanal.whatsapp} · E-mail ${p.interacoesPorCanal.email} · Ligação ${p.interacoesPorCanal.ligacao}`}
        >
          {p.interacoes}
        </span>
      ) : (
        <span className="text-gray-400" title="Nenhuma interação no período (o pagamento veio de uma interação anterior)">
          0
        </span>
      ),
    resumo: (r) => r.interacoes.toLocaleString('pt-BR'),
  },
  {
    chave: 'ultimaInteracao',
    label: 'Última interação',
    largura: 'w-24',
    celula: (p) => formatarData(p.ultimaInteracao) || <Vazio />,
    resumo: (r) => formatarData(r.ultimaInteracao) || <Vazio />,
  },
  {
    chave: 'situacao',
    label: 'Situação',
    largura: 'w-44',
    celula: (p) => (
      <span
        title={tituloSituacao(p)}
        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${SITUACOES[p.situacao].classe}`}
      >
        {textoSituacao(p)}
      </span>
    ),
    resumo: (r) => (
      <span title="Parcelas pagas com crédito para a atendente ÷ parcelas acompanhadas">
        <b className="font-semibold text-emerald-700">{r.pagas}</b> de {r.parcelas} pagas
        <span className="ml-1.5 rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
          {Math.round(r.conversao * 100)}%
        </span>
      </span>
    ),
  },
  {
    chave: 'dataPagamento',
    label: 'Data do pagamento',
    largura: 'w-24',
    celula: (p) => formatarData(p.dataPagamento) || <Vazio />,
    resumo: () => <Vazio />,
  },
  {
    chave: 'valorRecebido',
    label: 'Valor recebido',
    largura: 'w-28',
    celula: (p) => (p.situacao === 'paga' ? <span className="font-medium text-emerald-700">{formatarMoeda(p.valorRecebido)}</span> : <Vazio />),
    resumo: (r) => (r.valorRecebido ? <span className="font-semibold text-emerald-700">{formatarMoeda(r.valorRecebido)}</span> : <Vazio />),
  },
  {
    chave: 'interacoesAtePagar',
    label: 'Interações até pagar',
    largura: 'w-24',
    celula: (p) => (p.interacoesAtePagar != null ? p.interacoesAtePagar : <Vazio />),
    resumo: (r) => <ResumoMedia valor={r.interacoesAtePagar} />,
  },
  {
    chave: 'diasAtePagar',
    label: 'Dias até pagar',
    largura: 'w-24',
    celula: (p) => (p.diasAtePagar != null ? p.diasAtePagar : <Vazio />),
    resumo: (r) => <ResumoMedia valor={r.diasAtePagar} />,
  },
  {
    chave: 'atraso',
    label: 'Pago em relação ao vencimento',
    largura: 'w-28',
    celula: (p) =>
      p.atrasoNoPagamento != null ? (
        <span className={p.atrasoNoPagamento > 0 ? 'text-red-600' : 'text-emerald-700'}>{textoAtraso(p.atrasoNoPagamento)}</span>
      ) : (
        <Vazio />
      ),
    resumo: (r) =>
      r.pagas ? (
        <span title="Recuperadas: pagas depois do vencimento. Em dia: pagas no vencimento ou antes.">
          <span className="text-red-600">
            {r.recuperadas} {r.recuperadas === 1 ? 'recuperada' : 'recuperadas'}
          </span>
          <span className="text-gray-300"> · </span>
          <span className="text-emerald-700">{r.emDia} em dia</span>
        </span>
      ) : (
        <Vazio />
      ),
  },
];

const B_GRUPO = 'border-b-2 border-b-gray-400';
const B_LINHA = 'border-b border-b-gray-200';
const B_CLIENTE = 'border-b border-b-gray-300';

const JANELAS = [7, 15, 30, 45, 60, 90].map((d) => ({ value: d, label: `${d} dias` }));

function CelulaResumo({ children, borda, fundo = '' }) {
  return <td className={`${borda} border-l border-l-gray-100 py-1.5 pl-2 text-xs tabular-nums text-gray-700 2xl:pl-4 ${fundo}`}>{children}</td>;
}

function CelulasResumo({ resumo, borda, fundo = '' }) {
  return COLUNAS.map((coluna) => (
    <CelulaResumo key={coluna.chave} borda={borda} fundo={fundo}>
      {coluna.resumo(resumo)}
    </CelulaResumo>
  ));
}

// Atendente → Cliente → Parcela. Atendentes do maior valor recebido pro
// menor; clientes idem; parcelas pelo vencimento.
function construirArvore(parcelas) {
  const atendentes = new Map();
  for (const p of parcelas) {
    if (!atendentes.has(p.usuarioId)) atendentes.set(p.usuarioId, { id: p.usuarioId, nome: p.atendente, parcelas: [], clientes: new Map() });
    const a = atendentes.get(p.usuarioId);
    a.parcelas.push(p);
    const chaveCliente = `${p.usuarioId}::${p.clientId}`;
    if (!a.clientes.has(chaveCliente)) a.clientes.set(chaveCliente, { chave: chaveCliente, nome: p.cliente, parcelas: [] });
    a.clientes.get(chaveCliente).parcelas.push(p);
  }
  return [...atendentes.values()]
    .map((a) => ({
      ...a,
      resumo: resumir(a.parcelas),
      clientes: [...a.clientes.values()]
        .map((c) => ({
          ...c,
          resumo: resumir(c.parcelas),
          parcelas: [...c.parcelas].sort((x, y) => (x.vencimento || '').localeCompare(y.vencimento || '')),
        }))
        .sort((x, y) => y.resumo.valorRecebido - x.resumo.valorRecebido || x.nome.localeCompare(y.nome, 'pt-BR')),
    }))
    .sort((x, y) => y.resumo.valorRecebido - x.resumo.valorRecebido || y.resumo.interacoes - x.resumo.interacoes);
}

// Relatório "Desempenho da Cobrança": quanto cada atendente interagiu e quanto
// do que ela trabalhou foi pago — com a data do pagamento e as interações até
// ele. Mesmo desenho do relatório de Repasses CEF (matriz com agrupadores,
// cabeçalho e total fixos, filtros por coluna e Exportar no botão direito).
// Regras de crédito em backend relatorio-desempenho-cobranca/desempenhoCobranca.service.js.
export default function DesempenhoCobrancaPage() {
  const { travada: empresaTravada, empresaIdTravada, empresaIds } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');
  const [dataInicio, setDataInicio] = useState(() => inicioDoMes(hojeIso()));
  const [dataFim, setDataFim] = useState(() => hojeIso());
  const [janela, setJanela] = useState(30);
  const [regrasAbertas, setRegrasAbertas] = useState(false);

  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const [filtroAtendente, setFiltroAtendente] = useState(null);
  const [filtroCliente, setFiltroCliente] = useState(null);
  const [filtroSituacao, setFiltroSituacao] = useState(null);
  const thAtendenteRef = useRef(null);
  const thClienteRef = useRef(null);
  const thParcelaRef = useRef(null);
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
    getDesempenhoCobranca(empresaId, { dataInicio, dataFim, janela })
      .then((r) => minha === requisicaoRef.current && setDados(r))
      .catch((err) => minha === requisicaoRef.current && setErro(err.response?.data?.message || 'Não foi possível carregar o relatório.'))
      .finally(() => minha === requisicaoRef.current && setCarregando(false));
  }, [empresaId, dataInicio, dataFim, janela]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const parcelas = useMemo(() => dados?.parcelas ?? [], [dados]);

  const opcoesAtendente = useMemo(
    () =>
      [...new Map(parcelas.map((p) => [p.usuarioId, p.atendente])).entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
        .map(([id, nome]) => ({ value: id, label: nome })),
    [parcelas]
  );
  const opcoesCliente = useMemo(
    () => [...new Set(parcelas.map((p) => p.cliente))].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((n) => ({ value: n, label: n })),
    [parcelas]
  );
  const opcoesSituacao = useMemo(() => {
    const presentes = new Set(parcelas.map((p) => p.situacao));
    return Object.entries(SITUACOES)
      .filter(([k]) => presentes.has(k))
      .map(([k, s]) => ({ value: k, label: s.label }));
  }, [parcelas]);

  const parcelasFiltradas = useMemo(
    () =>
      parcelas.filter(
        (p) =>
          passaNoFiltro(filtroAtendente, p.usuarioId) && passaNoFiltro(filtroCliente, p.cliente) && passaNoFiltro(filtroSituacao, p.situacao)
      ),
    [parcelas, filtroAtendente, filtroCliente, filtroSituacao]
  );

  const arvore = useMemo(() => construirArvore(parcelasFiltradas), [parcelasFiltradas]);
  const total = useMemo(() => resumir(parcelasFiltradas), [parcelasFiltradas]);
  const filtroAtivo = [filtroAtendente, filtroCliente, filtroSituacao].some((f) => f != null);

  function limparFiltros() {
    setFiltroAtendente(null);
    setFiltroCliente(null);
    setFiltroSituacao(null);
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

  // 1 linha por atendente × parcela, já filtrada, com tudo que a comissão
  // precisa — datas como data e valores como número, pra somar no Excel.
  async function handleExportar() {
    setMenuContexto(null);
    const XLSX = await import('xlsx');
    const data = (iso) => {
      if (!iso) return '';
      const [ano, mes, dia] = iso.split('-').map(Number);
      return new Date(ano, mes - 1, dia);
    };
    const linhas = [];
    for (const a of arvore) {
      for (const c of a.clientes) {
        for (const p of c.parcelas) {
          linhas.push({
            Atendente: a.nome,
            Cliente: p.cliente,
            'Centro de Custo': p.centroCusto || '',
            Título: Number(p.billId),
            Parcela: p.parcela,
            Vencimento: data(p.vencimento),
            'Valor da parcela': p.valorParcela ?? '',
            Interações: p.interacoes,
            WhatsApp: p.interacoesPorCanal.whatsapp,
            'E-mail': p.interacoesPorCanal.email,
            Ligação: p.interacoesPorCanal.ligacao,
            'Última interação': data(p.ultimaInteracao),
            Situação: textoSituacao(p),
            'Data do pagamento': data(p.dataPagamento),
            'Valor recebido': p.situacao === 'paga' ? p.valorRecebido : '',
            'Interações até pagar': p.interacoesAtePagar ?? '',
            'Dias até pagar': p.diasAtePagar ?? '',
            'Dias entre vencimento e pagamento': p.atrasoNoPagamento ?? '',
          });
        }
      }
    }
    const planilha = XLSX.utils.json_to_sheet(linhas, { cellDates: true, dateNF: 'dd/mm/yyyy' });
    planilha['!cols'] = [24, 36, 26, 10, 8, 12, 15, 11, 10, 8, 8, 15, 30, 16, 15, 12, 12, 16].map((wch) => ({ wch }));
    const range = XLSX.utils.decode_range(planilha['!ref']);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      for (const col of [6, 14]) {
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
    return (
      <td className={`${borda} border-l border-l-gray-100 py-1.5 pl-2 pr-1 text-xs text-gray-700 2xl:pl-4`}>
        {siengeTenant ? (
          <a
            href={`https://${siengeTenant}.sienge.com.br/sienge/CRC/editTitulo.do?entity.tituloPK.nuTitulo=${p.billId}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Abrir título no Sienge${p.centroCusto ? ` · ${p.centroCusto}` : ''}`}
            className="tabular-nums text-primary-600 hover:text-primary-700 hover:underline"
          >
            {rotulo}
          </a>
        ) : (
          <span className="tabular-nums" title={p.centroCusto || undefined}>
            {rotulo}
          </span>
        )}
      </td>
    );
  }

  const semResultadoFiltro = parcelas.length > 0 && parcelasFiltradas.length === 0;
  const temDados = !carregando && !erro && parcelas.length > 0;
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
          <div className="w-44">
            <label className="mb-1 block text-sm font-medium text-gray-700" title="Prazo máximo entre a última interação e o pagamento para ele contar para a atendente">
              Crédito em até
            </label>
            <SearchableSelect clearable={false} value={janela} onChange={(v) => setJanela(Number(v))} options={JANELAS} />
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
          <div className="flex gap-2 lg:ml-auto">
            <button
              type="button"
              onClick={() => setRegrasAbertas((v) => !v)}
              aria-expanded={regrasAbertas}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-800"
            >
              Como é calculado
              <ChevronDown size={14} className={`transition-transform ${regrasAbertas ? 'rotate-180' : ''}`} />
            </button>
            {temDados && (
              <button
                type="button"
                onClick={toggleTudo}
                disabled={arvore.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-800 disabled:opacity-50"
              >
                {tudoExpandido ? <Minus size={14} /> : <Plus size={14} />}
                {tudoExpandido ? 'Recolher' : 'Expandir'}
              </button>
            )}
          </div>
        </div>

        {regrasAbertas && (
          <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 text-xs leading-relaxed text-gray-600 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="font-semibold text-gray-800">Interação</p>
              <p className="mt-1">
                WhatsApp, e-mail ou ligação registrados pela atendente na Rotina ou no Histórico de Etapas, contados pela data do
                registro. Envio automático não conta: não tem dono.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-800">Pagamento</p>
              <p className="mt-1">
                Só o que entrou como <b className="font-medium">Recebimento</b> no Sienge, pela data do pagamento. Reparcelamento,
                distrato e substituição zeram o saldo sem entrar dinheiro e aparecem como &quot;Encerrada sem pagamento&quot;.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-800">Crédito: último toque</p>
              <p className="mt-1">
                Cada pagamento vai para quem fez a última interação na parcela antes dele, se essa interação foi até{' '}
                <b className="font-medium">{janela} dias</b> antes. Um pagamento tem um único dono, então não existe comissão em dobro.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-800">Conversão</p>
              <p className="mt-1">
                Parcelas pagas com crédito para a atendente ÷ parcelas que ela acompanhou no período (trabalhadas ou pagas). As
                parcelas pagas também mostram as interações até o pagamento e quantos dias ele levou.
              </p>
            </div>
          </div>
        )}
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
        ) : parcelas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <HandCoins size={26} className="text-gray-300" />
            <p className="text-sm text-gray-600">Nenhuma interação nem pagamento creditado no período.</p>
            <p className="max-w-sm text-xs text-gray-400">
              Entram os WhatsApps, e-mails e ligações registrados pelas atendentes na Rotina ou no Histórico de Etapas.
            </p>
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
                  {cabecalho(thClienteRef, filtroCliente, setFiltroCliente, opcoesCliente, 'cliente', 'Cliente', 'w-48 border-l border-l-primary-100 2xl:w-64')}
                  {cabecalho(thParcelaRef, null, null, null, null, 'Título / Parcela', 'w-28 border-l border-l-primary-100')}
                  {COLUNAS.map((coluna, i) => (
                    <th
                      key={coluna.chave}
                      className={`sticky -top-6 z-20 ${coluna.largura} border-b-2 border-b-primary-500 border-l border-l-primary-100 bg-primary-50 px-1 py-2.5 text-center font-medium 2xl:px-2 ${
                        i === COLUNAS.length - 1 ? 'rounded-tr-card' : ''
                      }`}
                    >
                      {coluna.chave === 'situacao' ? (
                        <span className="inline-flex items-center justify-center gap-1.5">
                          <FiltroColuna filtro={filtroSituacao} onChange={setFiltroSituacao} opcoes={opcoesSituacao} label="situação" />
                          {coluna.label}
                        </span>
                      ) : (
                        coluna.label
                      )}
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
                  if (!atendentesAbertas.has(a.id)) {
                    return (
                      <tr key={a.id}>
                        <td className={`${B_GRUPO} border-r border-r-gray-200 bg-white px-2 py-2.5 align-middle 2xl:px-4`}>
                          <RotuloAgrupador aberto={false} negrito nome={a.nome} contagem={a.clientes.length} onClick={() => alternar(setAtendentesAbertas, a.id)} />
                        </td>
                        <CelulaResumo borda={B_GRUPO}>
                          {a.clientes.length} {a.clientes.length === 1 ? 'cliente' : 'clientes'}
                        </CelulaResumo>
                        <CelulaResumo borda={B_GRUPO}>
                          {a.resumo.parcelas} {a.resumo.parcelas === 1 ? 'parcela' : 'parcelas'}
                        </CelulaResumo>
                        <CelulasResumo resumo={a.resumo} borda={B_GRUPO} />
                      </tr>
                    );
                  }

                  const blocos = a.clientes.map((c) => ({ ...c, recolhido: clientesRecolhidos.has(c.chave) }));
                  const totalLinhas = blocos.reduce((s, c) => s + (c.recolhido ? 1 : c.parcelas.length), 0);
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
                                <RotuloAgrupador aberto={false} nome={c.nome} contagem={c.parcelas.length} onClick={() => alternar(setClientesRecolhidos, c.chave)} />
                              </td>
                              <CelulaResumo borda={bordaCliente}>
                                {c.parcelas.length} {c.parcelas.length === 1 ? 'parcela' : 'parcelas'}
                              </CelulaResumo>
                              <CelulasResumo resumo={c.resumo} borda={bordaCliente} />
                            </tr>
                          );
                        }

                        return c.parcelas.map((p, iParcela) => {
                          const ultimaParcela = iParcela === c.parcelas.length - 1;
                          const borda = ultimaParcela ? bordaCliente : B_LINHA;
                          const fundo = p.situacao === 'paga' ? 'bg-emerald-50/40' : '';
                          return (
                            <tr key={`${c.chave}-${p.billId}-${p.installmentId}`}>
                              {iParcela === 0 && celulaAtendente}
                              {iParcela === 0 && (
                                <td rowSpan={c.parcelas.length} className={`${bordaCliente} border-l border-l-gray-200 bg-white px-2 py-2.5 align-top 2xl:px-4`}>
                                  <RotuloAgrupador
                                    aberto
                                    nome={c.nome}
                                    contagem={c.parcelas.length}
                                    onClick={() => alternar(setClientesRecolhidos, c.chave)}
                                    topoGrudado={topoRotuloGrudado}
                                  />
                                </td>
                              )}
                              {celulaParcela(p, borda)}
                              {COLUNAS.map((coluna) => (
                                <td key={coluna.chave} className={`${borda} border-l border-l-gray-100 py-1.5 pl-2 text-xs tabular-nums text-gray-700 2xl:pl-4 ${fundo}`}>
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
