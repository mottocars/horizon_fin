import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  FileDown,
  Landmark,
  ListOrdered,
  Loader2,
  Minus,
  Plus,
  ScrollText,
  Search,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import Tabs from '../../../components/Tabs';
import FiltroColuna, { passaNoFiltro } from '../../../components/FiltroColuna';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { listEmpresas } from '../../../api/empresas.api';
import { listItauIntegracoes } from '../../../api/itau.api';
import { gerarExtratosBancarios } from '../../../api/relatorioExtratos.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import logoItau from '../../../assets/integracoes/itau.svg';

// ─── formatação ────────────────────────────────────────────────────────────

const moeda = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = (n) => (Number(n) || 0).toLocaleString('pt-BR');
const plural = (n, s, p) => `${numero(n)} ${n === 1 ? s : p}`;

function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function dataBR(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function diaSemana(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
}

function horaSP(iso) {
  return iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '';
}

function documento(doc) {
  const d = String(doc ?? '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc || '';
}

const contaTexto = (c) => `Ag. ${c.agencia} · CC ${c.conta}-${c.dac}`;
const tom = (v) => (v < 0 ? 'text-red-600' : 'text-gray-900');

// Origem do saldo de cada dia (ver backend extratos.calculo.js).
const FONTE_SALDO = {
  FECHAMENTO: { rotulo: 'Fechamento Itaú', classes: 'bg-emerald-50 text-emerald-700', dica: 'Saldo de fechamento do dia informado pelo Itaú' },
  CALCULADO: { rotulo: 'Calculado', classes: 'bg-sky-50 text-sky-700', dica: 'Dia ainda sem fechamento: último fechamento + lançamentos' },
  ESTIMADO: { rotulo: 'Posição atual', classes: 'bg-amber-50 text-amber-700', dica: 'Sem fechamento no período: calculado a partir do saldo em conta atual' },
};

const ABAS = [
  { id: 'lancamentos', label: 'Lançamentos', icon: ListOrdered, iconColorClass: 'text-primary-600' },
  { id: 'saldos', label: 'Saldos diários', icon: CalendarDays, iconColorClass: 'text-emerald-600' },
];

const TIPOS = [
  { value: 'C', label: 'Entradas' },
  { value: 'D', label: 'Saídas' },
];

const TH = 'sticky -top-6 z-20 border-b-2 border-b-blue-500 bg-blue-50 px-3 py-2.5 text-center font-medium';
const THD = `${TH} border-l border-l-blue-100`;
const TF = 'sticky -bottom-6 z-10 border-t-2 border-t-blue-500 bg-blue-50 py-2.5 text-xs tabular-nums';
const TFD = `${TF} border-l border-l-blue-100`;

function Indicador({ icone: Icone, rotulo, valor, detalhe, cor = 'text-gray-900' }) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-100 px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
        <Icone size={14} className="text-gray-400" />
        {rotulo}
      </p>
      <p className={`mt-1 truncate text-base font-semibold tabular-nums xl:text-lg ${cor}`}>{valor}</p>
      {detalhe && <p className="truncate text-[11px] text-gray-400">{detalhe}</p>}
    </div>
  );
}

// Relatório "Extratos Bancários" (por enquanto só API Itaú): escolhe empresa, conexões e
// período, clica em Gerar e o extrato é buscado NA HORA no banco — nada fica gravado. Mostra
// todas as contas empilhadas (mesma construção de tabela do Acervo NF-e / NFS-e: cabeçalho e
// totalizador fixos, conta agrupada à esquerda e recolhível, filtro no título da coluna,
// botão direito exporta pra Excel), lançamento a lançamento com saldo inicial/final de cada
// dia; a aba Saldos diários resume uma linha por conta e dia.
export default function ExtratosBancariosPage() {
  const { travada: empresaTravada, empresaIdTravada, empresaIds } = useEmpresaTravada();

  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');
  const [conexoes, setConexoes] = useState([]);
  const [carregandoConexoes, setCarregandoConexoes] = useState(false);
  const [conexaoIds, setConexaoIds] = useState([]);
  const [dataInicio, setDataInicio] = useState(hojeSP);
  const [dataFim, setDataFim] = useState(hojeSP);

  const [relatorio, setRelatorio] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');

  const [aba, setAba] = useState('lancamentos');
  const [busca, setBusca] = useState('');
  const [filtroConta, setFiltroConta] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState(null);
  const [recolhidos, setRecolhidos] = useState(() => new Set());
  const [menuContexto, setMenuContexto] = useState(null);

  const thContaRef = useRef(null);
  const thHistoricoRef = useRef(null);
  const theadRef = useRef(null);
  const [alturaCabecalho, setAlturaCabecalho] = useState(44);

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

  // Conexões Itaú da empresa que já podem consultar extrato (certificado + conta cadastrada).
  useEffect(() => {
    setConexoes([]);
    setConexaoIds([]);
    setRelatorio(null);
    if (!empresaId) return;
    setCarregandoConexoes(true);
    listItauIntegracoes({ empresaId, limit: 100, ativo: true })
      .then((r) => {
        const usaveis = r.data.filter((c) => String(c.empresa_id) === String(empresaId) && c.tem_certificado && c.identificador_conta);
        setConexoes(usaveis);
        setConexaoIds(usaveis.map((c) => String(c.id)));
      })
      .catch(() => setConexoes([]))
      .finally(() => setCarregandoConexoes(false));
  }, [empresaId]);

  const opcoesConexao = useMemo(
    () => conexoes.map((c) => ({ value: String(c.id), label: `${c.nome} · ${contaTexto(c)}` })),
    [conexoes]
  );

  async function gerar() {
    setErro('');
    if (dataInicio > dataFim) {
      setErro('A data inicial não pode ser depois da final.');
      return;
    }
    setGerando(true);
    try {
      const r = await gerarExtratosBancarios({ empresaId, conexaoIds: conexaoIds.map(Number), dataInicio, dataFim });
      setRelatorio(r);
      setFiltroConta(null);
      setFiltroTipo(null);
      setBusca('');
      setRecolhidos(new Set());
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível gerar o relatório.');
    } finally {
      setGerando(false);
    }
  }

  // ─── dados derivados ──────────────────────────────────────────────────────

  const contas = useMemo(() => relatorio?.contas || [], [relatorio]);
  const opcoesConta = useMemo(
    () => contas.map((c) => ({ value: String(c.conexaoId), label: `${c.conexao} (${contaTexto(c)})` })),
    [contas]
  );
  const termo = busca.trim().toLowerCase();

  const passaLancamento = (l) => {
    if (!passaNoFiltro(filtroTipo, l.operacao)) return false;
    if (!termo) return true;
    const alvo = `${l.historico} ${l.complemento} ${l.contraparte.nome} ${l.contraparte.documento} ${l.canal} ${moeda(Math.abs(l.valor))}`.toLowerCase();
    return alvo.includes(termo);
  };
  const filtroLancamentoAtivo = Boolean(termo) || filtroTipo != null;

  // Contas visíveis com os dias/lançamentos que passam nos filtros.
  const visiveis = useMemo(
    () =>
      contas
        .filter((c) => passaNoFiltro(filtroConta, String(c.conexaoId)))
        .map((c) => {
          const dias = (c.dias || [])
            .map((d) => ({ ...d, visiveis: d.lancamentos.filter(passaLancamento) }))
            .filter((d) => !filtroLancamentoAtivo || d.visiveis.length > 0);
          return { ...c, diasVisiveis: dias };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contas, filtroConta, filtroTipo, termo]
  );

  const totais = useMemo(() => {
    let lancamentos = 0;
    let entradas = 0;
    let saidas = 0;
    let saldoFinal = 0;
    let comSaldo = 0;
    for (const c of visiveis) {
      for (const d of c.diasVisiveis) {
        for (const l of d.visiveis) {
          lancamentos += 1;
          if (l.valor > 0) entradas += l.valor;
          else saidas += l.valor;
        }
      }
      if (c.status === 'ok' && typeof c.saldoFimPeriodo === 'number') {
        saldoFinal += c.saldoFimPeriodo;
        comSaldo += 1;
      }
    }
    const r2 = (v) => Math.round(v * 100) / 100;
    return { lancamentos, entradas: r2(entradas), saidas: r2(saidas), saldoFinal: r2(saldoFinal), comSaldo };
  }, [visiveis]);

  const falhas = contas.filter((c) => c.status === 'erro');
  const totalLancamentosBruto = contas.reduce((s, c) => s + (c.dias || []).reduce((t, d) => t + d.lancamentos.length, 0), 0);

  // Altura do cabeçalho fixo — a célula da conta gruda logo abaixo dele ao rolar.
  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const medir = () => setAlturaCabecalho(el.getBoundingClientRect().height);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [relatorio, aba]);
  const topoConta = alturaCabecalho - 24 + 8;

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

  function alternar(id) {
    const chave = `${aba}:${id}`;
    setRecolhidos((atual) => {
      const prox = new Set(atual);
      if (prox.has(chave)) prox.delete(chave);
      else prox.add(chave);
      return prox;
    });
  }

  // ─── exportação ───────────────────────────────────────────────────────────

  async function exportar() {
    setMenuContexto(null);
    const XLSX = await import('xlsx');
    const livro = XLSX.utils.book_new();
    const identificacao = (c) => ({
      Conexão: c.conexao,
      'Conta (cadastro)': c.nomeCadastro || '',
      Banco: c.banco.nome,
      Agência: c.agencia,
      Conta: `${c.conta}-${c.dac}`,
    });

    const linhasLanc = [];
    for (const c of visiveis) {
      if (c.status === 'erro') {
        linhasLanc.push({ ...identificacao(c), Histórico: `Erro: ${c.mensagem}` });
        continue;
      }
      for (const d of c.diasVisiveis) {
        linhasLanc.push({ ...identificacao(c), Data: dataBR(d.data), Histórico: 'SALDO INICIAL DO DIA', Saldo: d.saldoInicial });
        for (const l of d.visiveis) {
          linhasLanc.push({
            ...identificacao(c),
            Data: dataBR(d.data),
            Hora: horaSP(l.dataHora),
            Histórico: l.historico,
            Complemento: l.complemento,
            Contraparte: l.contraparte.nome,
            'Documento contraparte': documento(l.contraparte.documento),
            Canal: l.canal,
            Entrada: l.valor > 0 ? l.valor : '',
            Saída: l.valor < 0 ? l.valor : '',
            Saldo: l.saldoApos,
            Estorno: l.estorno ? 'Sim' : '',
          });
        }
        linhasLanc.push({ ...identificacao(c), Data: dataBR(d.data), Histórico: 'SALDO FINAL DO DIA', Entrada: d.entradas || '', Saída: d.saidas || '', Saldo: d.saldoFinal });
      }
    }
    const planilhaLanc = XLSX.utils.json_to_sheet(linhasLanc.length ? linhasLanc : [{ Histórico: 'Sem lançamentos' }]);
    XLSX.utils.book_append_sheet(livro, planilhaLanc, 'Lançamentos');

    const linhasSaldos = visiveis.flatMap((c) =>
      c.status === 'erro'
        ? [{ ...identificacao(c), Origem: `Erro: ${c.mensagem}` }]
        : (c.dias || []).map((d) => ({
            ...identificacao(c),
            Data: dataBR(d.data),
            'Saldo inicial': d.saldoInicial,
            Entradas: d.entradas,
            Saídas: d.saidas,
            'Saldo final': d.saldoFinal,
            Origem: FONTE_SALDO[d.fonte]?.rotulo || d.fonte,
          }))
    );
    const planilhaSaldos = XLSX.utils.json_to_sheet(linhasSaldos.length ? linhasSaldos : [{ Conexão: 'Sem dados' }]);
    XLSX.utils.book_append_sheet(livro, planilhaSaldos, 'Saldos diários');

    // Formato de moeda nas colunas de valor.
    for (const planilha of [planilhaLanc, planilhaSaldos]) {
      if (!planilha['!ref']) continue;
      const range = XLSX.utils.decode_range(planilha['!ref']);
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const cel = planilha[XLSX.utils.encode_cell({ r, c })];
          if (cel && cel.t === 'n') cel.z = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
        }
      }
    }
    XLSX.writeFile(livro, `extratos-bancarios_${relatorio.dataInicio}_a_${relatorio.dataFim}.xlsx`);
  }

  // ─── renderização ─────────────────────────────────────────────────────────

  const campoData =
    'w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100';
  const podeGerar = empresaId && conexaoIds.length > 0 && dataInicio && dataFim && !gerando;
  const filtroAtivo = filtroConta != null || filtroLancamentoAtivo;

  const tabs = ABAS.map((a) => ({
    ...a,
    label:
      relatorio && a.id === 'lancamentos'
        ? `${a.label} (${numero(totais.lancamentos)})`
        : relatorio && a.id === 'saldos'
          ? `${a.label} (${numero(visiveis.reduce((s, c) => s + (c.dias || []).length, 0))})`
          : a.label,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="min-w-0 flex-1 lg:max-w-64 lg:min-w-48">
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
          <div className="min-w-0 lg:w-36">
            <label className="mb-1 block text-sm font-medium text-gray-700">Banco</label>
            <div className="flex h-[38px] items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
              <img src={logoItau} alt="" className="h-5 w-5 rounded" />
              API Itaú
            </div>
          </div>
          <div className="min-w-0 flex-1 lg:min-w-64">
            <label className="mb-1 block text-sm font-medium text-gray-700">Conexões</label>
            <SearchableSelect
              multiple
              selecionarTodos
              value={conexaoIds}
              onChange={setConexaoIds}
              options={opcoesConexao}
              disabled={!empresaId || carregandoConexoes || conexoes.length === 0}
              placeholder={
                !empresaId
                  ? 'Selecione a empresa primeiro'
                  : carregandoConexoes
                    ? 'Carregando conexões...'
                    : conexoes.length === 0
                      ? 'Nenhuma conexão Itaú com conta cadastrada'
                      : 'Selecione as conexões'
              }
              emptyMessage="Nenhuma conexão encontrada."
            />
          </div>
          <div className="flex min-w-0 gap-3 lg:w-80">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Data inicial</label>
              <input type="date" value={dataInicio} max={dataFim} onChange={(e) => e.target.value && setDataInicio(e.target.value)} className={campoData} />
            </div>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Data final</label>
              <input type="date" value={dataFim} min={dataInicio} max={hojeSP()} onChange={(e) => e.target.value && setDataFim(e.target.value)} className={campoData} />
            </div>
          </div>
          <Button type="button" onClick={gerar} loading={gerando} disabled={!podeGerar} className="lg:mb-px">
            <ScrollText size={16} />
            Gerar
          </Button>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          O extrato é consultado na hora, direto no banco — nada fica armazenado no sistema. Período de até 31 dias.
        </p>
      </Card>

      {erro && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{erro}</div>}

      {gerando && !relatorio && (
        <Card>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Loader2 size={24} className="animate-spin text-primary-600" />
            <p className="text-sm font-medium text-gray-700">Consultando o extrato de {plural(conexaoIds.length, 'conta', 'contas')} no Itaú…</p>
            <p className="text-xs text-gray-400">Pode levar alguns segundos.</p>
          </div>
        </Card>
      )}

      {!relatorio && !gerando && (
        <Card>
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <ScrollText size={28} className="text-gray-300" />
            <p className="text-sm font-medium text-gray-700">Escolha a empresa, as conexões e o período e clique em Gerar</p>
            <p className="max-w-md text-xs text-gray-400">
              O relatório traz todas as contas empilhadas, lançamento a lançamento, com o saldo inicial e final de cada dia.
            </p>
          </div>
        </Card>
      )}

      {relatorio && (
        <>
          <Card className={gerando ? 'opacity-60' : ''}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-600">
                Extrato de <strong className="font-semibold text-gray-900">{dataBR(relatorio.dataInicio)}</strong>
                {relatorio.dataFim !== relatorio.dataInicio && (
                  <>
                    {' '}a <strong className="font-semibold text-gray-900">{dataBR(relatorio.dataFim)}</strong>
                  </>
                )}{' '}
                · consultado às {horaSP(relatorio.geradoEm)}
              </p>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar lançamento..."
                    className="w-56 rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                {filtroAtivo && (
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroConta(null);
                      setFiltroTipo(null);
                      setBusca('');
                    }}
                    className="text-xs text-gray-400 underline decoration-dotted hover:text-gray-600"
                  >
                    Mostrar tudo
                  </button>
                )}
                <button
                  type="button"
                  onClick={exportar}
                  title="Exportar para Excel"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  <FileDown size={14} /> Excel
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Indicador
                icone={Landmark}
                rotulo="Contas"
                valor={numero(visiveis.length)}
                detalhe={falhas.length ? `${plural(falhas.length, 'conta com falha', 'contas com falha')}` : 'todas consultadas'}
                cor={falhas.length ? 'text-amber-600' : 'text-gray-900'}
              />
              <Indicador icone={ListOrdered} rotulo="Lançamentos" valor={numero(totais.lancamentos)} detalhe={filtroLancamentoAtivo ? `de ${numero(totalLancamentosBruto)}` : null} />
              <Indicador icone={ArrowDownLeft} rotulo="Entradas" valor={moeda(totais.entradas)} cor="text-emerald-600" />
              <Indicador icone={ArrowUpRight} rotulo="Saídas" valor={moeda(totais.saidas)} cor="text-red-600" />
              <Indicador
                icone={Wallet}
                rotulo={`Saldo final em ${dataBR(relatorio.dataFim)}`}
                valor={moeda(totais.saldoFinal)}
                detalhe={`soma de ${plural(totais.comSaldo, 'conta', 'contas')}`}
                cor={tom(totais.saldoFinal)}
              />
            </div>
            {falhas.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="flex items-center gap-1.5 font-medium">
                  <AlertTriangle size={14} /> Não foi possível consultar {plural(falhas.length, 'conta', 'contas')}:
                </p>
                <ul className="mt-1 space-y-0.5 pl-5">
                  {falhas.map((f) => (
                    <li key={f.conexaoId}>
                      <span className="font-medium">{f.conexao}</span> ({contaTexto(f)}): {f.mensagem}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <div className={gerando ? 'opacity-60' : ''}>
            <Tabs tabs={tabs} activeId={aba} onChange={setAba} />
            <div
              className="rounded-card rounded-tl-none bg-white shadow-card"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuContexto({ x: e.clientX, y: e.clientY });
              }}
            >
              {aba === 'lancamentos' ? (
                <TabelaLancamentos
                  contas={visiveis}
                  totais={totais}
                  recolhidos={recolhidos}
                  alternar={alternar}
                  topoConta={topoConta}
                  theadRef={theadRef}
                  thContaRef={thContaRef}
                  thHistoricoRef={thHistoricoRef}
                  filtroConta={filtroConta}
                  setFiltroConta={setFiltroConta}
                  opcoesConta={opcoesConta}
                  filtroTipo={filtroTipo}
                  setFiltroTipo={setFiltroTipo}
                  filtroLancamentoAtivo={filtroLancamentoAtivo}
                />
              ) : (
                <TabelaSaldos
                  contas={visiveis}
                  totais={totais}
                  recolhidos={recolhidos}
                  alternar={alternar}
                  topoConta={topoConta}
                  theadRef={theadRef}
                  thContaRef={thContaRef}
                  filtroConta={filtroConta}
                  setFiltroConta={setFiltroConta}
                  opcoesConta={opcoesConta}
                  dataFim={relatorio.dataFim}
                />
              )}
            </div>
          </div>
        </>
      )}

      {menuContexto &&
        createPortal(
          <div
            style={{ position: 'fixed', top: menuContexto.y, left: menuContexto.x }}
            className="z-100 min-w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              onClick={exportar}
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

// Célula da conta (rowSpan, sticky abaixo do cabeçalho ao rolar, clique recolhe).
function CelulaConta({ conta, rowSpan, recolhido, onAlternar, topo, detalhe }) {
  return (
    <td rowSpan={rowSpan} className="border-b-2 border-b-gray-400 border-r border-r-gray-200 bg-white px-4 py-2.5 align-top">
      <button type="button" onClick={onAlternar} style={{ top: topo }} className="sticky flex w-full items-start gap-2 text-left">
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-blue-100 text-blue-600">
          {recolhido ? <Plus size={10} /> : <Minus size={10} />}
        </span>
        <img src={logoItau} alt="Itaú" className="mt-0.5 h-6 w-6 shrink-0 rounded" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-gray-900">{conta.conexao}</span>
          <span className="block text-[11px] text-gray-500">
            <span className="whitespace-nowrap">Ag. {conta.agencia}</span> ·{' '}
            <span className="whitespace-nowrap">CC {conta.conta}-{conta.dac}</span>
          </span>
          {conta.nomeCadastro && <span className="block truncate font-mono text-[10px] text-gray-400">{conta.nomeCadastro}</span>}
          {detalhe}
        </span>
      </button>
    </td>
  );
}

function TabelaLancamentos({
  contas,
  totais,
  recolhidos,
  alternar,
  topoConta,
  theadRef,
  thContaRef,
  thHistoricoRef,
  filtroConta,
  setFiltroConta,
  opcoesConta,
  filtroTipo,
  setFiltroTipo,
  filtroLancamentoAtivo,
}) {
  const celula = 'border-b border-b-gray-100 border-l border-l-gray-100 px-3 py-1.5 text-xs';
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-left text-xs">
      <thead ref={theadRef}>
        <tr className="text-xs uppercase tracking-wide text-blue-700">
          <th ref={thContaRef} className={`${TH} w-40 xl:w-52 rounded-tl-none`}>
            <span className="inline-flex items-center justify-center gap-1.5">
              <FiltroColuna filtro={filtroConta} onChange={setFiltroConta} opcoes={opcoesConta} label="conta" colunaRef={thContaRef} />
              Conta bancária
            </span>
          </th>
          <th className={`${THD} w-24 xl:w-28`}>Data / Hora</th>
          <th ref={thHistoricoRef} className={THD}>
            <span className="inline-flex items-center justify-center gap-1.5">
              <FiltroColuna filtro={filtroTipo} onChange={setFiltroTipo} opcoes={TIPOS} label="tipo de lançamento" colunaRef={thHistoricoRef} />
              Histórico
            </span>
          </th>
          <th className={`${THD} w-32 xl:w-40`}>Contraparte</th>
          <th className={`${THD} w-28 xl:w-32`}>Entrada</th>
          <th className={`${THD} w-28 xl:w-32`}>Saída</th>
          <th className={`${THD} w-32 xl:w-36 rounded-tr-card`}>Saldo</th>
        </tr>
      </thead>
      <tbody>
        {contas.length === 0 && (
          <tr>
            <td colSpan={7} className="py-12 text-center text-sm text-gray-500">
              Nenhuma conta corresponde aos filtros.
            </td>
          </tr>
        )}
        {contas.map((c) => {
          const recolhido = recolhidos.has(`lancamentos:${c.conexaoId}`);
          const alternarConta = () => alternar(c.conexaoId);

          if (c.status === 'erro') {
            return (
              <tr key={c.conexaoId}>
                <CelulaConta conta={c} rowSpan={1} recolhido={recolhido} onAlternar={alternarConta} topo={topoConta} />
                <td colSpan={6} className="border-b-2 border-b-gray-400 border-l border-l-gray-100 px-3 py-3 text-xs text-amber-700">
                  <span className="flex items-center gap-1.5">
                    <TriangleAlert size={14} /> {c.mensagem}
                  </span>
                </td>
              </tr>
            );
          }

          const dias = c.diasVisiveis;
          const entradas = dias.reduce((s, d) => s + d.visiveis.filter((l) => l.valor > 0).reduce((t, l) => t + l.valor, 0), 0);
          const saidas = dias.reduce((s, d) => s + d.visiveis.filter((l) => l.valor < 0).reduce((t, l) => t + l.valor, 0), 0);
          const qtd = dias.reduce((s, d) => s + d.visiveis.length, 0);

          if (recolhido || dias.length === 0) {
            const base = 'border-b-2 border-b-gray-400 border-l border-l-gray-100 px-3 py-2.5 text-xs tabular-nums';
            return (
              <tr key={c.conexaoId}>
                <CelulaConta conta={c} rowSpan={1} recolhido={recolhido} onAlternar={alternarConta} topo={topoConta} />
                <td className={`${base} text-gray-500`}>{dias.length ? plural(dias.length, 'dia', 'dias') : '—'}</td>
                <td className={`${base} text-gray-600`}>
                  {dias.length === 0
                    ? filtroLancamentoAtivo
                      ? 'Nenhum lançamento corresponde aos filtros.'
                      : 'Sem movimentação no período.'
                    : plural(qtd, 'lançamento', 'lançamentos')}
                </td>
                <td className={base} />
                <td className={`${base} text-right text-emerald-600`}>{entradas ? moeda(entradas) : ''}</td>
                <td className={`${base} text-right text-red-600`}>{saidas ? moeda(saidas) : ''}</td>
                <td className={`${base} text-right font-semibold ${tom(c.saldoFimPeriodo)}`}>
                  {typeof c.saldoFimPeriodo === 'number' ? moeda(c.saldoFimPeriodo) : '—'}
                </td>
              </tr>
            );
          }

          // 2 linhas por dia (saldo inicial + saldo final) + 1 por lançamento.
          const rowSpan = dias.reduce((s, d) => s + 2 + d.visiveis.length, 0);
          let primeira = true;
          return (
            <Fragment key={c.conexaoId}>
              {dias.map((d, iDia) => {
                const ultimoDia = iDia === dias.length - 1;
                const linhas = [];
                const comConta = () => {
                  if (!primeira) return null;
                  primeira = false;
                  return <CelulaConta conta={c} rowSpan={rowSpan} recolhido={false} onAlternar={alternarConta} topo={topoConta} />;
                };
                linhas.push(
                  <tr key={`${d.data}-ini`} className="bg-gray-50">
                    {comConta()}
                    <td className={`${celula} whitespace-nowrap font-semibold text-gray-800`}>
                      <span className="capitalize text-gray-400">{diaSemana(d.data)}</span> {dataBR(d.data)}
                    </td>
                    <td colSpan={4} className={`${celula} text-gray-500`}>
                      Saldo inicial do dia
                      {d.lancamentos.length === 0 && <span className="ml-2 text-gray-400">· sem lançamentos</span>}
                    </td>
                    <td className={`${celula} text-right whitespace-nowrap font-semibold tabular-nums ${tom(d.saldoInicial)}`}>{moeda(d.saldoInicial)}</td>
                  </tr>
                );
                for (const l of d.visiveis) {
                  linhas.push(
                    <tr key={l.id} className="hover:bg-gray-50/70">
                      <td className={`${celula} tabular-nums text-gray-500`}>{horaSP(l.dataHora)}</td>
                      <td className={celula}>
                        <p className="break-words text-gray-900" title={l.historico}>
                          {l.historico || '—'}
                          {l.estorno && <span className="ml-1.5 rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-700">estorno</span>}
                        </p>
                        {(l.complemento || l.canal) && (
                          <p className="break-words text-[11px] text-gray-400" title={[l.complemento, l.canal].filter(Boolean).join(' · ')}>
                            {[l.complemento, l.canal].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className={celula}>
                        <p className="break-words leading-snug text-gray-800" title={l.contraparte.nome}>
                          {l.contraparte.nome || <span className="text-gray-300">—</span>}
                        </p>
                        {l.contraparte.documento && <p className="break-all font-mono text-[11px] text-gray-400">{documento(l.contraparte.documento)}</p>}
                      </td>
                      <td className={`${celula} text-right whitespace-nowrap tabular-nums text-emerald-600`}>{l.valor > 0 ? moeda(l.valor) : ''}</td>
                      <td className={`${celula} text-right whitespace-nowrap tabular-nums text-red-600`}>{l.valor < 0 ? moeda(l.valor) : ''}</td>
                      <td className={`${celula} text-right whitespace-nowrap tabular-nums ${tom(l.saldoApos)}`}>{moeda(l.saldoApos)}</td>
                    </tr>
                  );
                }
                const fim = FONTE_SALDO[d.fonte];
                const bordaFim = ultimoDia ? 'border-b-2 border-b-gray-400' : 'border-b border-b-gray-200';
                const celFim = `${bordaFim} border-l border-l-gray-100 bg-blue-50/40 px-3 py-1.5 text-xs`;
                linhas.push(
                  <tr key={`${d.data}-fim`}>
                    <td colSpan={2} className={`${celFim} font-medium text-gray-700`}>
                      Saldo final do dia {dataBR(d.data)}
                      {fim && (
                        <span title={fim.dica} className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${fim.classes}`}>
                          {fim.rotulo}
                        </span>
                      )}
                    </td>
                    <td className={`${celFim} text-gray-500`}>{plural(d.lancamentos.length, 'lançamento', 'lançamentos')}</td>
                    <td className={`${celFim} text-right whitespace-nowrap font-medium tabular-nums text-emerald-600`}>{d.entradas ? moeda(d.entradas) : ''}</td>
                    <td className={`${celFim} text-right whitespace-nowrap font-medium tabular-nums text-red-600`}>{d.saidas ? moeda(d.saidas) : ''}</td>
                    <td className={`${celFim} text-right whitespace-nowrap font-bold tabular-nums ${tom(d.saldoFinal)}`}>{moeda(d.saldoFinal)}</td>
                  </tr>
                );
                return linhas;
              })}
            </Fragment>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="font-semibold text-blue-700">
          <td className={`${TF} rounded-bl-card px-4`}>Total · {plural(contas.length, 'conta', 'contas')}</td>
          <td className={`${TFD} px-3`} />
          <td className={`${TFD} px-3`}>{plural(totais.lancamentos, 'lançamento', 'lançamentos')}</td>
          <td className={`${TFD} px-3`} />
          <td className={`${TFD} px-3 text-right`}>{moeda(totais.entradas)}</td>
          <td className={`${TFD} px-3 text-right`}>{moeda(totais.saidas)}</td>
          <td className={`${TFD} rounded-br-card px-3 text-right`} title="Soma do saldo final de cada conta no último dia do período">
            {moeda(totais.saldoFinal)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

function TabelaSaldos({ contas, totais, recolhidos, alternar, topoConta, theadRef, thContaRef, filtroConta, setFiltroConta, opcoesConta, dataFim }) {
  const celula = 'border-b border-b-gray-100 border-l border-l-gray-100 px-3 py-2 text-xs tabular-nums';
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 text-left text-xs">
      <thead ref={theadRef}>
        <tr className="text-xs uppercase tracking-wide text-blue-700">
          <th ref={thContaRef} className={`${TH} w-40 xl:w-52`}>
            <span className="inline-flex items-center justify-center gap-1.5">
              <FiltroColuna filtro={filtroConta} onChange={setFiltroConta} opcoes={opcoesConta} label="conta" colunaRef={thContaRef} />
              Conta bancária
            </span>
          </th>
          <th className={`${THD} w-32`}>Data</th>
          <th className={THD}>Saldo inicial</th>
          <th className={THD}>Entradas</th>
          <th className={THD}>Saídas</th>
          <th className={THD}>Saldo final</th>
          <th className={`${THD} w-32 rounded-tr-card`}>Origem do saldo</th>
        </tr>
      </thead>
      <tbody>
        {contas.length === 0 && (
          <tr>
            <td colSpan={7} className="py-12 text-center text-sm text-gray-500">
              Nenhuma conta corresponde aos filtros.
            </td>
          </tr>
        )}
        {contas.map((c) => {
          const recolhido = recolhidos.has(`saldos:${c.conexaoId}`);
          const alternarConta = () => alternar(c.conexaoId);
          const dias = c.dias || [];
          if (c.status === 'erro') {
            return (
              <tr key={c.conexaoId}>
                <CelulaConta conta={c} rowSpan={1} recolhido={recolhido} onAlternar={alternarConta} topo={topoConta} />
                <td colSpan={6} className="border-b-2 border-b-gray-400 border-l border-l-gray-100 px-3 py-3 text-xs text-amber-700">
                  {c.mensagem}
                </td>
              </tr>
            );
          }
          if (recolhido || dias.length === 0) {
            const base = 'border-b-2 border-b-gray-400 border-l border-l-gray-100 px-3 py-2.5 text-xs tabular-nums';
            const primeiro = dias[0];
            const entradas = dias.reduce((s, d) => s + d.entradas, 0);
            const saidas = dias.reduce((s, d) => s + d.saidas, 0);
            return (
              <tr key={c.conexaoId}>
                <CelulaConta conta={c} rowSpan={1} recolhido={recolhido} onAlternar={alternarConta} topo={topoConta} />
                <td className={`${base} text-gray-500`}>{dias.length ? plural(dias.length, 'dia', 'dias') : `até ${dataBR(dataFim)}`}</td>
                <td className={`${base} text-right ${primeiro ? tom(primeiro.saldoInicial) : 'text-gray-300'}`}>
                  {primeiro ? moeda(primeiro.saldoInicial) : '—'}
                </td>
                <td className={`${base} text-right text-emerald-600`}>{entradas ? moeda(entradas) : ''}</td>
                <td className={`${base} text-right text-red-600`}>{saidas ? moeda(saidas) : ''}</td>
                <td className={`${base} text-right font-semibold ${tom(c.saldoFimPeriodo)}`}>
                  {typeof c.saldoFimPeriodo === 'number' ? moeda(c.saldoFimPeriodo) : '—'}
                </td>
                <td className={`${base} text-center`}>
                  {dias.length === 0 && FONTE_SALDO[c.fonteSaldoFimPeriodo] ? (
                    <span title={FONTE_SALDO[c.fonteSaldoFimPeriodo].dica} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${FONTE_SALDO[c.fonteSaldoFimPeriodo].classes}`}>
                      {FONTE_SALDO[c.fonteSaldoFimPeriodo].rotulo}
                    </span>
                  ) : dias.length === 0 ? (
                    <span className="text-gray-400">Sem movimentação</span>
                  ) : null}
                </td>
              </tr>
            );
          }
          return (
            <Fragment key={c.conexaoId}>
              {dias.map((d, i) => {
                const ultimo = i === dias.length - 1;
                const borda = ultimo ? 'border-b-2 border-b-gray-400' : '';
                const fonte = FONTE_SALDO[d.fonte];
                return (
                  <tr key={d.data} className="hover:bg-gray-50/70">
                    {i === 0 && <CelulaConta conta={c} rowSpan={dias.length} recolhido={false} onAlternar={alternarConta} topo={topoConta} />}
                    <td className={`${celula} ${borda} text-gray-700`}>
                      <span className="capitalize text-gray-400">{diaSemana(d.data)}</span> {dataBR(d.data)}
                    </td>
                    <td className={`${celula} ${borda} text-right ${tom(d.saldoInicial)}`}>{moeda(d.saldoInicial)}</td>
                    <td className={`${celula} ${borda} text-right text-emerald-600`}>{d.entradas ? moeda(d.entradas) : ''}</td>
                    <td className={`${celula} ${borda} text-right text-red-600`}>{d.saidas ? moeda(d.saidas) : ''}</td>
                    <td className={`${celula} ${borda} text-right font-semibold ${tom(d.saldoFinal)}`}>{moeda(d.saldoFinal)}</td>
                    <td className={`${celula} ${borda} text-center`}>
                      {fonte && (
                        <span title={fonte.dica} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${fonte.classes}`}>
                          {fonte.rotulo}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="font-semibold text-blue-700">
          <td className={`${TF} rounded-bl-card px-4`}>Total · {plural(contas.length, 'conta', 'contas')}</td>
          <td className={`${TFD} px-3`} />
          <td className={`${TFD} px-3`} />
          <td className={`${TFD} px-3 text-right`}>{moeda(totais.entradas)}</td>
          <td className={`${TFD} px-3 text-right`}>{moeda(totais.saidas)}</td>
          <td className={`${TFD} px-3 text-right`} title={`Soma do saldo de cada conta em ${dataBR(dataFim)}`}>
            {moeda(totais.saldoFinal)}
          </td>
          <td className={`${TFD} rounded-br-card px-3`} />
        </tr>
      </tfoot>
    </table>
  );
}
