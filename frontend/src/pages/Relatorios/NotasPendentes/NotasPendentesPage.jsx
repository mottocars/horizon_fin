import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileCheck2, FileDown, FileText, Loader2, Minus, Package, Plus, TriangleAlert, Wrench } from 'lucide-react';
import Card from '../../../components/Card';
import SearchableSelect from '../../../components/SearchableSelect';
import FiltroColuna, { passaNoFiltro, proximoFiltro, valoresDoFiltro } from '../../../components/FiltroColuna';
import { useAlert } from '../../../confirm/ConfirmContext';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { listEmpresas } from '../../../api/empresas.api';
import { listCertificadosEspiao, baixarNotaPdfEspiao } from '../../../api/espiao.api';
import { listNotasPendentes } from '../../../api/relatorioNotasPendentes.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';

// ─── formatação ────────────────────────────────────────────────────────────

function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// 'YYYY-MM-DD...' -> 'DD/MM/YYYY' sem passar por Date (evita recuo de fuso).
function formatarData(iso) {
  if (!iso) return '—';
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function formatarDocumento(doc) {
  const d = String(doc ?? '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc || '—';
}

// O certificado digital é cadastrado como "RAZÃO SOCIAL:CNPJ" — separa os dois
// pra mostrar o nome em destaque e o CNPJ formatado embaixo.
function separarCertificado(nome) {
  const [razao, cnpj] = String(nome || '').split(':');
  return { razao: razao?.trim() || 'Sem certificado', cnpj: cnpj?.trim() || null };
}

// 'YYYY-MM' do mês atual deslocado em `deslocamento` meses.
function mesIso(deslocamento = 0) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + deslocamento);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Dias corridos da emissão até hoje (datas "de calendário", sem hora/fuso).
function diasDesde(iso) {
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-').map(Number);
  const emissao = Date.UTC(ano, mes - 1, dia);
  const agora = new Date();
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.max(0, Math.round((hoje - emissao) / 86400000));
}

// Faixas de "Dias pendentes" — cor do selo na coluna e opções do filtro dela.
const FAIXAS_DIAS = [
  { value: 'ate15', label: 'Até 15 dias', ate: 15, cor: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  { value: '16a30', label: '16 a 30 dias', ate: 30, cor: 'bg-amber-50 text-amber-700 ring-amber-200' },
  { value: '31a60', label: '31 a 60 dias', ate: 60, cor: 'bg-orange-50 text-orange-700 ring-orange-200' },
  { value: 'mais60', label: 'Mais de 60 dias', ate: Infinity, cor: 'bg-red-50 text-red-700 ring-red-200' },
];
const faixaDe = (dias) => FAIXAS_DIAS.find((f) => dias <= f.ate);

const TIPOS = [
  { value: 'NFE', label: 'NF-e (produto)' },
  { value: 'NFSE', label: 'NFS-e (serviço)' },
];

// Resumo de uma lista de notas — rodapé (todas as visíveis) e linha de um
// certificado recolhido (só as dele).
function resumir(notas) {
  const emissores = new Set(notas.map((n) => n.documentoEmissor || n.emissor));
  const total = notas.reduce((soma, n) => soma + (n.valor || 0), 0);
  const maiorAtraso = notas.reduce((max, n) => Math.max(max, n.dias), 0);
  const mediaDias = notas.length ? Math.round(notas.reduce((s, n) => s + n.dias, 0) / notas.length) : 0;
  return { quantidade: notas.length, emissores: emissores.size, total, maiorAtraso, mediaDias };
}

const plural = (n, singular, pluralTexto) => `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : pluralTexto}`;

// Classe de cabeçalho igual à de Empreendimentos Masa (título fixo que gruda
// no topo do <main> ao rolar — offset -top-6 cancela o p-6 do <main>).
const TH = 'sticky -top-6 z-20 border-b-2 border-b-primary-500 bg-primary-50 px-2 py-2.5 text-center font-medium';
const TF = 'sticky -bottom-6 z-10 border-t-2 border-t-primary-500 bg-primary-50 py-2.5 text-xs tabular-nums';

// Relatório "NF-e / NFS-e Pendentes" — as notas recebidas que ainda não
// foram vinculadas a um título do contas a pagar no Sienge (o mesmo recorte
// da aba Recebidas do Espião NFe/NFSe), agrupadas pela empresa do
// certificado que as capturou. Mesma construção de tabela de
// Empreendimentos Masa: títulos fixos ao rolar, filtro no título da coluna,
// agrupamento com rowSpan recolhível e totalizador fixo no rodapé; botão
// direito na tabela exporta pra Excel.
export default function NotasPendentesPage() {
  const alert = useAlert();
  const { travada: empresaTravada, empresaIdTravada, empresaIds } = useEmpresaTravada();

  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');
  const [mesInicio, setMesInicio] = useState(() => mesIso(-1));
  const [mesFim, setMesFim] = useState(() => mesIso(0));
  const [certificados, setCertificados] = useState([]);

  const [notas, setNotas] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  // Filtros (null = tudo marcado — ver components/FiltroColuna.jsx). O de
  // certificado é o MESMO estado no filtro do topo e no título da coluna.
  const [filtroCertificado, setFiltroCertificado] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState(null);
  const [filtroEmissor, setFiltroEmissor] = useState(null);
  const [filtroFaixa, setFiltroFaixa] = useState(null);

  const [recolhidos, setRecolhidos] = useState(() => new Set());
  const [baixando, setBaixando] = useState(() => new Set());
  const [menuContexto, setMenuContexto] = useState(null);

  const thCertificadoRef = useRef(null);
  const thNumeroRef = useRef(null);
  const thEmissorRef = useRef(null);
  const thDiasRef = useRef(null);

  // Altura real do cabeçalho fixo (muda quando um título quebra em 2 linhas)
  // — o nome da empresa do certificado gruda logo abaixo dele ao rolar. O
  // cabeçalho gruda em -24px (-top-6, cancelando o p-6 do <main>), por isso
  // o desconto; +8px de respiro.
  const theadRef = useRef(null);
  const [alturaCabecalho, setAlturaCabecalho] = useState(48);
  useEffect(() => {
    const el = theadRef.current;
    if (!el) return;
    const medir = () => setAlturaCabecalho(el.getBoundingClientRect().height);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
    // O <thead> só existe depois que as notas chegam — mede de novo a cada carga.
  }, [notas]);
  const topoNomeCertificado = alturaCabecalho - 24 + 8;

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
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

  // Trocar de empresa = outro conjunto de certificados/notas: zera filtros.
  useEffect(() => {
    setCertificados([]);
    setFiltroCertificado(null);
    setFiltroEmissor(null);
    setRecolhidos(new Set());
    if (!empresaId) return;
    listCertificadosEspiao(empresaId).then(setCertificados).catch(() => setCertificados([]));
  }, [empresaId]);

  // Só a última busca pode preencher a tabela (troca rápida de mês/empresa).
  const buscaRef = useRef(0);
  useEffect(() => {
    if (!empresaId || !mesInicio || !mesFim) {
      setNotas(null);
      return;
    }
    if (mesInicio > mesFim) {
      setErro('O mês/ano inicial não pode ser depois do final.');
      setNotas(null);
      return;
    }
    const busca = ++buscaRef.current;
    setCarregando(true);
    setErro('');
    listNotasPendentes({ empresaId, mesInicio, mesFim })
      .then((dados) => {
        if (busca !== buscaRef.current) return;
        setNotas(dados.map((n) => ({ ...n, dias: diasDesde(n.dataEmissao) })));
      })
      .catch((err) => {
        if (busca !== buscaRef.current) return;
        setErro(err.response?.data?.message || 'Não foi possível carregar as notas pendentes.');
        setNotas(null);
      })
      .finally(() => busca === buscaRef.current && setCarregando(false));
  }, [empresaId, mesInicio, mesFim]);

  const opcoesCertificado = useMemo(
    () => certificados.map((c) => ({ value: c.id, label: separarCertificado(c.nome).razao })),
    [certificados]
  );

  const opcoesEmissor = useMemo(() => {
    const porChave = new Map();
    for (const n of notas || []) {
      const chave = n.documentoEmissor || n.emissor;
      if (!porChave.has(chave)) porChave.set(chave, n.emissor || formatarDocumento(n.documentoEmissor));
    }
    return [...porChave.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
      .map(([value, label]) => ({ value, label }));
  }, [notas]);

  const visiveis = useMemo(
    () =>
      (notas || []).filter(
        (n) =>
          passaNoFiltro(filtroCertificado, n.certificado.id) &&
          passaNoFiltro(filtroTipo, n.tipo) &&
          passaNoFiltro(filtroEmissor, n.documentoEmissor || n.emissor) &&
          passaNoFiltro(filtroFaixa, faixaDe(n.dias).value)
      ),
    [notas, filtroCertificado, filtroTipo, filtroEmissor, filtroFaixa]
  );

  // Agrupa por certificado, na ordem que o backend já mandou (nome, emissão).
  const grupos = useMemo(() => {
    const porCertificado = new Map();
    for (const n of visiveis) {
      const id = n.certificado.id ?? 'sem';
      if (!porCertificado.has(id)) porCertificado.set(id, { id, nome: n.certificado.nome, notas: [] });
      porCertificado.get(id).notas.push(n);
    }
    return [...porCertificado.values()];
  }, [visiveis]);

  const totais = useMemo(() => resumir(visiveis), [visiveis]);
  const semValor = visiveis.filter((n) => n.valor == null).length;
  const filtroAtivo = [filtroCertificado, filtroTipo, filtroEmissor, filtroFaixa].some((f) => f != null);

  function toggleGrupo(id) {
    setRecolhidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  async function baixarPdf(nota) {
    setBaixando((s) => new Set(s).add(nota.id));
    try {
      const blob = await baixarNotaPdfEspiao(nota.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${nota.chaveAcesso}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      await alert({
        title: 'Não foi possível baixar o PDF',
        description: err.response?.data?.message || 'Não foi possível baixar o PDF desta nota.',
        variant: 'warning',
      });
    } finally {
      setBaixando((s) => {
        const proximo = new Set(s);
        proximo.delete(nota.id);
        return proximo;
      });
    }
  }

  // Menu de contexto (botão direito na tabela) com "Exportar" — mesmo
  // comportamento de Empreendimentos Masa.
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

  async function exportar() {
    setMenuContexto(null);
    const XLSX = await import('xlsx');
    const linhas = visiveis.map((n) => {
      const cert = separarCertificado(n.certificado.nome);
      return {
        'Empresa do certificado': cert.razao,
        'CNPJ do certificado': cert.cnpj ? formatarDocumento(cert.cnpj) : '',
        Tipo: n.tipo === 'NFSE' ? 'NFS-e' : 'NF-e',
        Número: n.numero || '',
        Série: n.serie || '',
        Emissor: n.emissor || '',
        'CNPJ do emissor': formatarDocumento(n.documentoEmissor),
        Emissão: formatarData(n.dataEmissao),
        Valor: n.valor ?? '',
        'Dias pendentes': n.dias,
      };
    });
    linhas.push({ 'Empresa do certificado': 'Total', Número: totais.quantidade, Emissor: `${totais.emissores} emissores`, Valor: Math.round(totais.total * 100) / 100 });
    const planilha = XLSX.utils.json_to_sheet(linhas);
    const range = XLSX.utils.decode_range(planilha['!ref']);
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const celula = planilha[XLSX.utils.encode_cell({ r, c: 8 })];
      if (celula && celula.t === 'n') celula.z = '"R$" #,##0.00';
    }
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, 'Pendentes');
    XLSX.writeFile(livro, `notas-pendentes_${mesInicio}_a_${mesFim}.xlsx`);
  }

  const campoMes =
    'w-full min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100';

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1 lg:max-w-xs">
            <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
            <SearchableSelect
              value={empresaId}
              onChange={setEmpresaId}
              disabled={carregandoEmpresas || empresaTravada}
              options={opcoesEmpresa}
              placeholder={carregandoEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
              emptyMessage="Nenhuma empresa encontrada."
            />
          </div>
          <div className="flex min-w-0 gap-3 lg:w-90">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Mês/Ano inicial</label>
              <input type="month" value={mesInicio} max={mesFim} onChange={(e) => setMesInicio(e.target.value)} className={campoMes} />
            </div>
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Mês/Ano final</label>
              <input type="month" value={mesFim} min={mesInicio} onChange={(e) => setMesFim(e.target.value)} className={campoMes} />
            </div>
          </div>
          <div className="min-w-0 flex-1 lg:max-w-xs">
            <label className="mb-1 block text-sm font-medium text-gray-700">Empresa do Certificado</label>
            <SearchableSelect
              multiple
              selecionarTodos
              value={valoresDoFiltro(filtroCertificado, opcoesCertificado)}
              onChange={(sel) => setFiltroCertificado(proximoFiltro(sel, opcoesCertificado))}
              options={opcoesCertificado}
              disabled={!empresaId || opcoesCertificado.length === 0}
              placeholder={!empresaId ? 'Selecione a empresa primeiro' : 'Nenhum certificado'}
              emptyMessage="Nenhum certificado encontrado."
            />
          </div>
          {filtroAtivo && (
            <button
              type="button"
              onClick={() => {
                setFiltroCertificado(null);
                setFiltroTipo(null);
                setFiltroEmissor(null);
                setFiltroFaixa(null);
              }}
              className="self-start text-xs text-gray-400 underline decoration-dotted hover:text-gray-600 lg:mb-2.5 lg:self-end"
            >
              Mostrar tudo
            </button>
          )}
        </div>
      </Card>

      <div className="rounded-card bg-white shadow-card">
        {!empresaId ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <FileText size={26} className="text-gray-300" />
            <p className="text-sm font-medium text-gray-700">Selecione uma empresa</p>
            <p className="max-w-sm text-xs text-gray-400">
              O relatório mostra as notas recebidas que ainda não foram vinculadas a um título do contas a pagar.
            </p>
          </div>
        ) : carregando && !notas ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin" />
            Carregando notas pendentes...
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <TriangleAlert size={26} className="text-red-400" />
            <p className="text-sm text-gray-600">{erro}</p>
          </div>
        ) : notas && notas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <FileCheck2 size={28} className="text-emerald-400" />
            <p className="text-sm font-medium text-gray-700">Nenhuma nota pendente no período</p>
            <p className="max-w-sm text-xs text-gray-400">
              Todas as notas recebidas entre {mesInicio.split('-').reverse().join('/')} e {mesFim.split('-').reverse().join('/')} já
              estão vinculadas ao contas a pagar.
            </p>
          </div>
        ) : notas ? (
          // Sem overflow aqui de propósito — mesmo motivo de Empreendimentos
          // Masa: qualquer overflow num ancestral quebra o `sticky` do
          // cabeçalho/totalizador contra o <main>, que é quem rola.
          <div
            className={`rounded-card transition-opacity ${carregando ? 'opacity-60' : ''}`}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuContexto({ x: e.clientX, y: e.clientY });
            }}
          >
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <thead ref={theadRef}>
                <tr className="text-xs uppercase tracking-wide text-primary-700">
                  <th ref={thCertificadoRef} className={`${TH} w-72 rounded-tl-card`}>
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <FiltroColuna
                        filtro={filtroCertificado}
                        onChange={setFiltroCertificado}
                        opcoes={opcoesCertificado}
                        label="empresa do certificado"
                        colunaRef={thCertificadoRef}
                      />
                      Empresa do Certificado
                    </span>
                  </th>
                  <th ref={thNumeroRef} className={`${TH} w-40 border-l border-l-primary-100`}>
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <FiltroColuna filtro={filtroTipo} onChange={setFiltroTipo} opcoes={TIPOS} label="tipo de nota" colunaRef={thNumeroRef} />
                      Número / Série
                    </span>
                  </th>
                  <th ref={thEmissorRef} className={`${TH} border-l border-l-primary-100`}>
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <FiltroColuna
                        filtro={filtroEmissor}
                        onChange={setFiltroEmissor}
                        opcoes={opcoesEmissor}
                        label="emissor"
                        colunaRef={thEmissorRef}
                      />
                      Emissor
                    </span>
                  </th>
                  <th className={`${TH} w-28 border-l border-l-primary-100`}>Emissão</th>
                  <th className={`${TH} w-36 border-l border-l-primary-100`}>Valor da Nota</th>
                  <th ref={thDiasRef} className={`${TH} w-36 border-l border-l-primary-100`}>
                    <span className="inline-flex items-center justify-center gap-1.5">
                      <FiltroColuna
                        filtro={filtroFaixa}
                        onChange={setFiltroFaixa}
                        opcoes={FAIXAS_DIAS}
                        label="dias pendentes"
                        colunaRef={thDiasRef}
                      />
                      Dias Pendentes
                    </span>
                  </th>
                  <th className={`${TH} w-16 rounded-tr-card border-l border-l-primary-100`}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {grupos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm text-gray-500">
                      <p className="font-medium text-gray-700">Nenhuma nota corresponde aos filtros selecionados.</p>
                      <p className="mt-1 text-xs text-gray-400">Ajuste os filtros dos títulos ou clique em "Mostrar tudo".</p>
                    </td>
                  </tr>
                )}
                {grupos.map((grupo) => {
                  const cert = separarCertificado(grupo.nome);
                  const recolhido = recolhidos.has(grupo.id);
                  // Nome no topo da célula (align-top) e `sticky` logo abaixo do
                  // cabeçalho fixo: ao rolar, acompanha a tela até a última nota
                  // da empresa — a célula (rowSpan) é o limite do sticky, então
                  // ele para sozinho no fim do grupo.
                  const celulaCertificado = (rowSpan) => (
                    <td rowSpan={rowSpan} className="border-b-2 border-b-gray-400 border-r border-r-gray-200 bg-white px-4 py-2.5 align-top">
                      <button
                        type="button"
                        onClick={() => toggleGrupo(grupo.id)}
                        style={{ top: topoNomeCertificado }}
                        className="sticky flex w-full items-start gap-2 text-left"
                      >
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                          {recolhido ? <Plus size={10} /> : <Minus size={10} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-gray-900">{cert.razao}</span>
                          {cert.cnpj && <span className="block font-mono text-[11px] text-gray-400">{formatarDocumento(cert.cnpj)}</span>}
                        </span>
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                          {grupo.notas.length}
                        </span>
                      </button>
                    </td>
                  );

                  if (recolhido) {
                    const r = resumir(grupo.notas);
                    const celula = 'border-b-2 border-b-gray-400 border-l border-l-gray-100 px-3 py-2 text-xs tabular-nums text-gray-700';
                    return (
                      <tr key={grupo.id}>
                        {celulaCertificado(1)}
                        <td className={celula}>{plural(r.quantidade, 'nota', 'notas')}</td>
                        <td className={celula}>{plural(r.emissores, 'emissor', 'emissores')}</td>
                        <td className={`${celula} text-center text-gray-300`}>—</td>
                        <td className={`${celula} text-right font-medium`}>{formatarMoeda(r.total)}</td>
                        <td className={`${celula} text-center`}>até {plural(r.maiorAtraso, 'dia', 'dias')}</td>
                        <td className={celula} />
                      </tr>
                    );
                  }

                  return (
                    <Fragment key={grupo.id}>
                      {grupo.notas.map((nota, i) => {
                        const ultima = i === grupo.notas.length - 1;
                        const borda = ultima ? 'border-b-2 border-b-gray-400' : 'border-b border-b-gray-200';
                        const celula = `${borda} border-l border-l-gray-100 px-3 py-2 text-xs`;
                        const faixa = faixaDe(nota.dias);
                        const ehServico = nota.tipo === 'NFSE';
                        const TipoIcon = ehServico ? Wrench : Package;
                        return (
                          <tr key={nota.id} className="hover:bg-gray-50/70">
                            {i === 0 && celulaCertificado(grupo.notas.length)}
                            <td className={celula}>
                              <span className="flex items-center gap-2">
                                <span
                                  title={ehServico ? 'NFS-e (serviço)' : 'NF-e (produto)'}
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                                    ehServico ? 'bg-violet-50 text-violet-600' : 'bg-primary-50 text-primary-600'
                                  }`}
                                >
                                  <TipoIcon size={11} />
                                </span>
                                <span className="font-mono text-gray-800">
                                  {nota.numero || '—'}
                                  {nota.serie && <span className="text-gray-400"> / {nota.serie}</span>}
                                </span>
                              </span>
                            </td>
                            <td className={celula}>
                              <p className="truncate text-gray-900" title={nota.emissor || ''}>
                                {nota.emissor || '—'}
                              </p>
                              <p className="font-mono text-[11px] text-gray-400">{formatarDocumento(nota.documentoEmissor)}</p>
                            </td>
                            <td className={`${celula} text-center text-gray-600`}>{formatarData(nota.dataEmissao)}</td>
                            <td className={`${celula} text-right tabular-nums text-gray-800`}>
                              {nota.valor != null ? formatarMoeda(nota.valor) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className={`${celula} text-center`}>
                              <span
                                title={faixa.label}
                                className={`inline-flex min-w-16 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ${faixa.cor}`}
                              >
                                {plural(nota.dias, 'dia', 'dias')}
                              </span>
                            </td>
                            <td className={`${celula} text-center`}>
                              <button
                                type="button"
                                title="Baixar PDF"
                                onClick={() => baixarPdf(nota)}
                                disabled={baixando.has(nota.id)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition hover:bg-primary-50 hover:text-primary-600 disabled:opacity-60"
                              >
                                {baixando.has(nota.id) ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
              {/* Totalizador fixo no rodapé (mesmo padrão de Empreendimentos
                  Masa) — sempre sobre o que está visível com os filtros. */}
              <tfoot>
                <tr className="font-semibold text-primary-700">
                  <td className={`${TF} rounded-bl-card px-4`}>Total</td>
                  <td className={`${TF} border-l border-l-primary-100 px-3`}>{plural(totais.quantidade, 'nota', 'notas')}</td>
                  <td className={`${TF} border-l border-l-primary-100 px-3`}>{plural(totais.emissores, 'emissor', 'emissores')}</td>
                  <td className={`${TF} border-l border-l-primary-100 px-3 text-center text-primary-300`}>—</td>
                  <td className={`${TF} border-l border-l-primary-100 px-3 text-right`}>
                    {formatarMoeda(totais.total)}
                    {semValor > 0 && (
                      <span className="block text-[10px] font-normal text-primary-400" title="Notas sem valor lido do XML">
                        {plural(semValor, 'nota sem valor', 'notas sem valor')}
                      </span>
                    )}
                  </td>
                  <td className={`${TF} border-l border-l-primary-100 px-3 text-center`}>
                    {totais.quantidade > 0 ? `média ${plural(totais.mediaDias, 'dia', 'dias')}` : '—'}
                  </td>
                  <td className={`${TF} rounded-br-card border-l border-l-primary-100`} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
      </div>

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
