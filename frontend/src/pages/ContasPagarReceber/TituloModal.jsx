import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Download,
  FileText,
  FolderOpen,
  Lock,
  PieChart,
  Plus,
  Sheet,
  Trash2,
  TrendingUp,
  Users,
  TriangleAlert,
  X,
} from 'lucide-react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import Tabs from '../../components/Tabs';
import SearchableSelect from '../../components/SearchableSelect';
import CampoData from '../../components/CampoData';
import { useConfirm } from '../../confirm/ConfirmContext';
import { hojeISO } from '../../utils/datas';
import {
  alterarTitulo,
  avancoPrevisto,
  baixarDocumentoPls,
  cabecalhoPls,
  criarTitulo,
  documentosPls,
  excluirTitulo,
  obterTitulo,
  opcoesContasPagarReceber,
  repassesPf,
} from '../../api/contasPagarReceber.api';
import GraficoAvanco, { indiceNaData } from './GraficoAvanco';
import { TIPOS_DOCUMENTO, centavos, data, dataHora, lerValor, mensagemErro, moeda, numeroBr, somarMeses } from './util';

const INPUT_SEM_COR =
  'w-full rounded-lg border px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-500';
const INPUT = `${INPUT_SEM_COR} border-gray-200`;
// Campos abertos para ajuste: azul quando preenchidos, âmbar quando pendentes (mesmo par das Configurações
// das telas de Operações).
const inputCor = (preenchido) => `${INPUT_SEM_COR} ${preenchido ? 'border-primary-100 bg-primary-50' : 'border-amber-300 bg-amber-50'}`;
const corSelect = (preenchido) =>
  preenchido ? 'border-primary-100 bg-primary-50 hover:border-primary-500' : 'border-amber-300 bg-amber-50 hover:border-amber-400';
const CABECALHO = 'border-b-2 border-blue-500 bg-blue-50 text-xs uppercase tracking-wide text-blue-700';

// Abas da janela, conforme o tipo de documento. Na Projeção PLS CEF, Avanços e Documentos ainda estão
// vazias (o conteúdo vem depois) e o Cabeçalho só tem o tipo de documento.
const ABAS_POR_TIPO = {
  FINANCEIRO: [
    { id: 'cabecalho', label: 'Cabeçalho', icon: FileText },
    { id: 'rateios', label: 'Rateios', icon: PieChart },
    { id: 'parcelas', label: 'Parcelas', icon: CalendarDays },
  ],
  PROJECAO_PLS_CEF: [
    { id: 'cabecalho', label: 'Cabeçalho', icon: FileText },
    { id: 'rateios-pls', label: 'Rateios', icon: PieChart },
    { id: 'avancos', label: 'Avanços', icon: TrendingUp },
    { id: 'documentos', label: 'Documentos', icon: FolderOpen },
    { id: 'repasses-pf', label: 'Repasses PF', icon: Users },
  ],
};

function Campo({ rotulo, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="mb-1 text-[11px] text-gray-400">{rotulo}</p>
      {children}
    </div>
  );
}

const fmtPct = (p) => (Number.isFinite(p) ? p.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '');
const valido = (v) => Number.isFinite(v) && v > 0;

// Divide o total em `qtd` parcelas mensais a partir do 1º vencimento (a sobra dos centavos vai na última).
function gerarParcelas(total, qtd, primeiro) {
  const n = Math.min(360, Math.max(1, parseInt(qtd, 10) || 1));
  const totalC = valido(total) ? centavos(total) : 0;
  const base = Math.floor(totalC / n);
  return Array.from({ length: n }, (_, i) => ({
    vencimento: somarMeses(primeiro, i),
    valor: totalC ? numeroBr((base + (i === n - 1 ? totalC - base * n : 0)) / 100) : '',
  }));
}

// Recalcula o valor de cada linha do rateio pelo percentual dela (com 100% somado, a sobra dos centavos
// vai na última linha).
function ratear(linhas, total) {
  if (!valido(total)) return linhas.map((l) => ({ ...l, valor: '' }));
  const totalC = centavos(total);
  const pcts = linhas.map((l) => lerValor(l.pct));
  const somaPct = pcts.reduce((s, p) => s + (valido(p) ? p : 0), 0);
  const ultima = pcts.reduce((u, p, i) => (valido(p) ? i : u), -1);
  let usados = 0;
  return linhas.map((l, i) => {
    if (!valido(pcts[i])) return { ...l, valor: '' };
    let c = Math.round((totalC * pcts[i]) / 100);
    if (i === ultima && Math.abs(somaPct - 100) < 1e-6) c = totalC - usados;
    usados += c;
    return { ...l, valor: numeroBr(c / 100) };
  });
}

const somaC = (lista) => lista.reduce((s, x) => s + (valido(lerValor(x.valor)) ? centavos(lerValor(x.valor)) : 0), 0);
const LINHA_RATEIO = { centro_id: '', natureza_id: '', pct: '100', valor: '' };

// Janela do "+" (novo título) e do título clicado na listagem (alterar / excluir), em três abas:
// Cabeçalho, Rateios (centro de custo × plano de contas) e Parcelas (mensais, editáveis). Os botões ficam
// fora das abas; erro de preenchimento leva para a aba do campo. "Projeção PLS CEF": abas Cabeçalho (só o
// tipo de documento), Avanços e Documentos — ainda sem conteúdo nem gravação.
export default function TituloModal({ empresaId, id = null, onClose, onSalvo }) {
  const confirm = useConfirm();
  const hoje = hojeISO();
  const [opcoes, setOpcoes] = useState(null);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState({ tipo_documento: 'FINANCEIRO', tipo: 'PAGAR', pessoa_id: '', documento: '', data_emissao: hoje, historico: '', valor: '' });
  const [qtd, setQtd] = useState('1');
  const [primeiroVenc, setPrimeiroVenc] = useState(hoje);
  const [parcelas, setParcelas] = useState([{ vencimento: hoje, valor: '' }]);
  const [rateios, setRateios] = useState([LINHA_RATEIO]);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');
  const [aba, setAba] = useState('cabecalho');
  // Projeção PLS CEF: centro de custo (obra), data prevista do recebimento e a curva do Prevision dele.
  // `avanco`: o % acumulado na data digitado à mão (texto); null = o do Prevision. Volta para null ao
  // trocar o centro ou a data.
  // Datas: medição (busca o % no Prevision), recebimento PF e recebimento PJ.
  const [pls, setPls] = useState({ centro_id: '', data_medicao: '', data_pf: '', data_pj: '', avanco: null });
  const [avanco, setAvanco] = useState({ carregando: false, dados: null, erro: '' });
  const [documentos, setDocumentos] = useState({ carregando: false, dados: null, erro: '' });
  const [cabPls, setCabPls] = useState({ carregando: false, dados: null, erro: '' });
  const [repasses, setRepasses] = useState({ carregando: false, dados: null, erro: '' });

  useEffect(() => {
    setErro('');
    Promise.all([opcoesContasPagarReceber(empresaId), id ? obterTitulo(empresaId, id) : null])
      .then(([op, t]) => {
        setOpcoes(op);
        if (!t) return;
        setDados(t);
        setForm({
          tipo_documento: t.tipo_documento,
          tipo: t.tipo,
          pessoa_id: t.pessoa_id ?? '',
          documento: t.documento,
          data_emissao: t.data_emissao || '',
          historico: t.historico,
          valor: numeroBr(t.valor),
        });
        setQtd(String(t.parcelas.length));
        setPrimeiroVenc(t.parcelas[0]?.vencimento || '');
        setParcelas(t.parcelas.map((p) => ({ vencimento: p.vencimento, valor: numeroBr(p.valor), data_baixa: p.data_baixa, valor_baixa: p.valor_baixa })));
        setRateios(t.rateios.map((r) => ({ centro_id: r.centro_id, natureza_id: r.natureza_id, pct: fmtPct(r.percentual), valor: numeroBr(r.valor) })));
      })
      .catch((e) => setErro(mensagemErro(e, 'Não foi possível carregar o título.')));
  }, [empresaId, id]);

  const travado = Boolean(dados?.baixado);
  const financeiro = form.tipo_documento === 'FINANCEIRO';
  const total = lerValor(form.valor);
  const totalC = valido(total) ? centavos(total) : 0;
  const somaParcelasC = somaC(parcelas);
  const somaRateioC = somaC(rateios);
  const somaPct = rateios.reduce((s, r) => s + (valido(lerValor(r.pct)) ? lerValor(r.pct) : 0), 0);

  const opCentros = useMemo(() => (opcoes?.centros || []).map((c) => ({ value: c.id, label: `${c.id} - ${c.nome}` })), [opcoes]);
  // PLS CEF é de obra: só os centros com Tipo = Obra (todos, se a empresa não tiver nenhum marcado).
  const opCentrosObra = useMemo(() => {
    const obras = (opcoes?.centros || []).filter((c) => c.natureza === 'OBRA');
    return (obras.length ? obras : opcoes?.centros || []).map((c) => ({ value: c.id, label: `${c.id} - ${c.nome}` }));
  }, [opcoes]);

  useEffect(() => {
    if (form.tipo_documento !== 'PROJECAO_PLS_CEF' || !pls.centro_id) {
      setAvanco({ carregando: false, dados: null, erro: '' });
      return undefined;
    }
    let vivo = true;
    setAvanco({ carregando: true, dados: null, erro: '' });
    avancoPrevisto(empresaId, pls.centro_id)
      .then((d) => vivo && setAvanco({ carregando: false, dados: d, erro: '' }))
      .catch((e) => vivo && setAvanco({ carregando: false, dados: null, erro: mensagemErro(e, 'Não foi possível carregar o avanço do Prevision.') }));
    return () => {
      vivo = false;
    };
  }, [empresaId, form.tipo_documento, pls.centro_id]);

  useEffect(() => {
    if (form.tipo_documento !== 'PROJECAO_PLS_CEF' || !pls.centro_id) {
      setDocumentos({ carregando: false, dados: null, erro: '' });
      return undefined;
    }
    let vivo = true;
    setDocumentos({ carregando: true, dados: null, erro: '' });
    documentosPls(empresaId, pls.centro_id)
      .then((d) => vivo && setDocumentos({ carregando: false, dados: d, erro: '' }))
      .catch((e) => vivo && setDocumentos({ carregando: false, dados: null, erro: mensagemErro(e, 'Não foi possível carregar os documentos.') }));
    return () => {
      vivo = false;
    };
  }, [empresaId, form.tipo_documento, pls.centro_id]);

  // Cabeçalho da PLS CEF: última liberação, envios do DCD/Geral, Parâmetros da obra e unidades do Geral.
  useEffect(() => {
    if (form.tipo_documento !== 'PROJECAO_PLS_CEF' || !pls.centro_id) {
      setCabPls({ carregando: false, dados: null, erro: '' });
      return undefined;
    }
    let vivo = true;
    setCabPls((c) => ({ ...c, carregando: true, erro: '' }));
    cabecalhoPls(empresaId, pls.centro_id, pls.data_medicao)
      .then((d) => vivo && setCabPls({ carregando: false, dados: d, erro: '' }))
      .catch((e) => vivo && setCabPls({ carregando: false, dados: null, erro: mensagemErro(e, 'Não foi possível carregar os dados do centro de custo.') }));
    return () => {
      vivo = false;
    };
  }, [empresaId, form.tipo_documento, pls.centro_id, pls.data_medicao]);

  // Repasses PF (rastreio por cliente registrado), com as liberações anteriores à Data Previsão Medição.
  useEffect(() => {
    if (form.tipo_documento !== 'PROJECAO_PLS_CEF' || !pls.centro_id) {
      setRepasses({ carregando: false, dados: null, erro: '' });
      return undefined;
    }
    let vivo = true;
    setRepasses((r) => ({ ...r, carregando: true, erro: '' }));
    repassesPf(empresaId, pls.centro_id, pls.data_medicao)
      .then((d) => vivo && setRepasses({ carregando: false, dados: d, erro: '' }))
      .catch((e) => vivo && setRepasses({ carregando: false, dados: null, erro: mensagemErro(e, 'Não foi possível carregar os repasses PF.') }));
    return () => {
      vivo = false;
    };
  }, [empresaId, form.tipo_documento, pls.centro_id, pls.data_medicao]);

  const cab = cabPls.dados;
  // Avanço previsto na data: o do Prevision (curva diária) ou o digitado (`pls.avanco`, texto; null = Prevision).
  const pontosPrev = avanco.dados?.tem_prevision ? avanco.dados.pontos : [];
  const kPrev = indiceNaData(pontosPrev, pls.data_medicao);
  const avancoPrevision = !pls.data_medicao || pontosPrev.length < 2 ? null : kPrev < 0 ? 0 : pontosPrev[kPrev].previsto;
  const avancoTexto = pls.avanco ?? (avancoPrevision === null ? '' : pct2(avancoPrevision));
  const avancoInformado = lerValor(avancoTexto);
  const avancoValido = Number.isFinite(avancoInformado) && avancoInformado >= 0 && avancoInformado <= 100;
  const avancoAlterado = pls.avanco !== null && avancoValido && avancoPrevision !== null && Math.abs(avancoInformado - avancoPrevision) > 0.0001;

  // Aba Rateios da PLS CEF: as três classificações calculadas (projetarPls) com o plano de contas de cada uma
  // (null = a conta sugerida pelo plano da DFC) e, no Crédito PJ, o % de redução e o valor projetado
  // (`pj_valor` null = calculado × (1 − redução)).
  const [rateioPls, setRateioPls] = useState({ contas: { novo_registro: null, medicao: null, credito_pj: null }, pj_reducao: '0', pj_valor: null });
  useEffect(() => setRateioPls((r) => ({ ...r, contas: { novo_registro: null, medicao: null, credito_pj: null } })), [pls.centro_id]);
  const projPls = useMemo(
    () => projetarPls(cab, avancoValido ? avancoInformado : null, pls.data_medicao),
    [cab, avancoValido, avancoInformado, pls.data_medicao]
  );
  const opNaturezas = useMemo(
    () => (opcoes?.naturezas || []).map((n) => ({ value: n.id, label: `${n.id} ${n.nome}${n.inativa ? ' (inativa)' : ''}` })),
    [opcoes]
  );
  const opPessoas = useMemo(() => {
    const lista = ((form.tipo === 'PAGAR' ? opcoes?.fornecedores : opcoes?.clientes) || []).map((p) => ({ value: p.id, label: p.nome }));
    // O nome gravado no título, se a pessoa não estiver mais na lista.
    if (dados?.pessoa_id && dados.tipo === form.tipo && !lista.some((p) => String(p.value) === String(dados.pessoa_id))) {
      lista.unshift({ value: dados.pessoa_id, label: dados.pessoa_nome });
    }
    return lista;
  }, [opcoes, form.tipo, dados]);

  const mudar = (campo) => (v) => setForm((f) => ({ ...f, [campo]: v }));

  function mudarValor(texto) {
    const t = lerValor(texto);
    setForm((f) => ({ ...f, valor: texto }));
    setParcelas(gerarParcelas(t, qtd, primeiroVenc));
    setRateios((r) => ratear(r, t));
  }

  function mudarQtd(v) {
    setQtd(v);
    setParcelas(gerarParcelas(total, v, primeiroVenc));
  }

  function mudarPrimeiroVenc(v) {
    setPrimeiroVenc(v);
    setParcelas(gerarParcelas(total, qtd, v));
  }

  const mudarParcela = (i, campo, v) => setParcelas((l) => l.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));

  function mudarRateio(i, campo, v) {
    setRateios((l) =>
      l.map((r, j) => {
        if (j !== i) return r;
        if (campo === 'pct') {
          const p = lerValor(v);
          return { ...r, pct: v, valor: valido(total) && valido(p) ? numeroBr(Math.round((totalC * p) / 100) / 100) : '' };
        }
        if (campo === 'valor') {
          const x = lerValor(v);
          return { ...r, valor: v, pct: valido(total) && valido(x) ? fmtPct((x / total) * 100) : '' };
        }
        return { ...r, [campo]: v };
      })
    );
  }

  function adicionarRateio() {
    const restoPct = Math.max(0, Math.round((100 - somaPct) * 1e4) / 1e4);
    const restoC = Math.max(0, totalC - somaRateioC);
    setRateios((l) => [...l, { centro_id: '', natureza_id: '', pct: restoPct ? fmtPct(restoPct) : '', valor: restoC ? numeroBr(restoC / 100) : '' }]);
  }

  function trocarTipo(tipo) {
    if (tipo !== form.tipo) setForm((f) => ({ ...f, tipo, pessoa_id: '' }));
  }

  async function salvar() {
    setErroSalvar('');
    // Erro de preenchimento: mostra a mensagem e leva para a aba do campo.
    const falha = (mensagem, abaDoCampo) => {
      setErroSalvar(mensagem);
      setAba(abaDoCampo);
    };
    if (!form.pessoa_id) return falha(form.tipo === 'PAGAR' ? 'Escolha o fornecedor.' : 'Escolha o cliente.', 'cabecalho');
    if (!form.data_emissao) return falha('Informe a data de emissão.', 'cabecalho');
    if (!totalC) return falha('Informe o valor do título.', 'cabecalho');
    if (rateios.some((r) => !r.centro_id || !r.natureza_id || !valido(lerValor(r.valor)))) {
      return falha('Preencha centro de custo, plano de contas e valor em cada linha do rateio.', 'rateios');
    }
    if (somaRateioC !== totalC) return falha('A soma do rateio precisa fechar com o valor do título.', 'rateios');
    if (parcelas.some((p) => !p.vencimento || !valido(lerValor(p.valor)))) return falha('Informe o vencimento e o valor de cada parcela.', 'parcelas');
    if (somaParcelasC !== totalC) return falha('A soma das parcelas precisa fechar com o valor do título.', 'parcelas');
    const payload = {
      tipo: form.tipo,
      tipo_documento: form.tipo_documento,
      pessoa_id: Number(form.pessoa_id),
      documento: form.documento.trim(),
      data_emissao: form.data_emissao,
      historico: form.historico.trim(),
      valor: totalC / 100,
      parcelas: parcelas.map((p) => ({ vencimento: p.vencimento, valor: centavos(lerValor(p.valor)) / 100 })),
      rateios: rateios.map((r) => ({ centro_id: Number(r.centro_id), natureza_id: String(r.natureza_id), valor: centavos(lerValor(r.valor)) / 100 })),
    };
    setSalvando(true);
    try {
      if (id) await alterarTitulo(empresaId, id, payload);
      else await criarTitulo(empresaId, payload);
      onSalvo?.();
      onClose();
    } catch (e) {
      setErroSalvar(mensagemErro(e, 'Não foi possível salvar o título.'));
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    const ok = await confirm({
      title: 'Excluir título',
      description: `Excluir o título de ${dados?.pessoa_nome || 'este fornecedor/cliente'} (${moeda(dados?.valor)}) com todas as parcelas?`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    setSalvando(true);
    try {
      await excluirTitulo(empresaId, id);
      onSalvo?.();
      onClose();
    } catch (e) {
      setErroSalvar(mensagemErro(e, 'Não foi possível excluir o título.'));
      setSalvando(false);
    }
  }

  const diferenca = (soma) =>
    soma === totalC ? null : <span className="ml-2 font-normal text-red-600">{soma > totalC ? 'passa' : 'falta'} {moeda(Math.abs(totalC - soma) / 100)}</span>;
  const temBaixa = parcelas.some((p) => p.data_baixa);
  const abas = ABAS_POR_TIPO[form.tipo_documento] || ABAS_POR_TIPO.FINANCEIRO;
  const abaVisivel = abas.some((a) => a.id === aba) ? aba : 'cabecalho';

  return (
    <Modal open onClose={onClose} title={id ? `Título ${String(id).padStart(5, '0')}` : 'Novo título'} maxWidthClass={financeiro ? "max-w-5xl" : "max-w-6xl"}>
      {erro ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          <TriangleAlert size={15} className="shrink-0" />
          {erro}
        </div>
      ) : !opcoes ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : (
        <div className="space-y-3">
          {travado && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <Lock size={14} className="shrink-0" />
              Título com parcela baixada: para alterar ou excluir, estorne a baixa na listagem.
            </div>
          )}

          <div>
            <Tabs
              tabs={abas}
              activeId={abaVisivel}
              onChange={(a) => {
                setAba(a);
                setErroSalvar('');
              }}
            />
            {/* Painel encaixado na aba ativa (a borda de cima é a da barra de abas). Altura mínima fixa: a
                janela não muda de tamanho ao trocar de aba. */}
            <div className={`rounded-b-xl border border-t-0 border-gray-200 p-4 min-h-[360px]`}>
              {abaVisivel === 'cabecalho' && (
                <div className={`grid grid-cols-1 gap-x-4 gap-y-3 ${financeiro ? "md:grid-cols-3" : "sm:grid-cols-2 md:grid-cols-4"}`}>
                  <Campo rotulo="Tipo de documento">
                    <SearchableSelect
                      value={form.tipo_documento}
                      onChange={(v) => v && mudar('tipo_documento')(v)}
                      options={TIPOS_DOCUMENTO}
                      clearable={false}
                      disabled={travado || Boolean(id)}
                      corClasses={financeiro ? undefined : corSelect(true)}
                    />
                  </Campo>
                  {!financeiro && (
                    <>
                      <Campo rotulo="Centro de custo" className="sm:col-span-2 md:col-span-3">
                        <SearchableSelect
                          value={pls.centro_id}
                          onChange={(v) => setPls((p) => ({ ...p, centro_id: v || '', avanco: null }))}
                          options={opCentrosObra}
                          placeholder="Escolha o centro de custo"
                          emptyMessage="Nenhum centro de custo cadastrado."
                          larguraPainel={360}
                          corClasses={corSelect(Boolean(pls.centro_id))}
                        />
                      </Campo>
                      {/* Medição → recebimento PF → recebimento PJ. O % do Prevision é o da Data Previsão Medição. */}
                      <Campo rotulo="Data Previsão Medição">
                        <CampoData
                          value={pls.data_medicao}
                          onChange={(v) => setPls((p) => ({ ...p, data_medicao: v, avanco: null }))}
                          className={inputCor(Boolean(pls.data_medicao))}
                        />
                      </Campo>
                      <Campo rotulo="Data Previsão Recebimento PF">
                        <CampoData
                          value={pls.data_pf}
                          min={pls.data_medicao || undefined}
                          onChange={(v) => setPls((p) => ({ ...p, data_pf: v }))}
                          className={inputCor(Boolean(pls.data_pf))}
                        />
                      </Campo>
                      <Campo rotulo="Data Previsão Recebimento PJ">
                        <CampoData
                          value={pls.data_pj}
                          min={pls.data_pf || pls.data_medicao || undefined}
                          onChange={(v) => setPls((p) => ({ ...p, data_pj: v }))}
                          className={inputCor(Boolean(pls.data_pj))}
                        />
                      </Campo>
                      <Campo rotulo="Avanço previsto na medição (Prevision)">
                        <div className="relative">
                          <input
                            value={avancoTexto}
                            onChange={(e) => setPls((p) => ({ ...p, avanco: e.target.value }))}
                            onBlur={() => avancoValido && pls.avanco !== null && setPls((p) => ({ ...p, avanco: pct2(avancoInformado) }))}
                            disabled={!pls.centro_id || !pls.data_medicao}
                            inputMode="decimal"
                            placeholder={!pls.centro_id || !pls.data_medicao ? 'Escolha o centro e a data da medição' : '0,00'}
                            aria-label="Avanço previsto na medição"
                            className={`${avancoTexto && !avancoValido ? `${INPUT_SEM_COR} border-red-300 bg-red-50` : inputCor(Boolean(avancoTexto))} !pr-7 text-right tabular-nums`}
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                        </div>
                        {avancoTexto && !avancoValido ? (
                          <p className="mt-1 text-[11px] text-red-600">Informe um percentual entre 0 e 100.</p>
                        ) : avancoAlterado ? (
                          <p className="mt-1 text-[11px] text-gray-500">
                            Prevision: {pct2(avancoPrevision)}% ·{' '}
                            <button type="button" onClick={() => setPls((p) => ({ ...p, avanco: null }))} className="font-medium text-primary-600 hover:underline">
                              usar o do Prevision
                            </button>
                          </p>
                        ) : (
                          pls.centro_id && pls.data_medicao && avanco.dados && !avanco.dados.tem_prevision && (
                            <p className="mt-1 text-[11px] text-amber-600">Centro sem Código Prevision: informe o avanço.</p>
                          )
                        )}
                      </Campo>
                      <CampoLeitura
                        rotulo="Última Liberação (DCD)"
                        valor={cab?.ultima_liberacao ? `${data(cab.ultima_liberacao.data)} · parcela ${cab.ultima_liberacao.parcela}` : null}
                        carregando={cabPls.carregando}
                      />
                      <CampoLeitura
                        rotulo="Avanço liberado na última liberação"
                        valor={cab?.avanco_liberado === null || cab?.avanco_liberado === undefined ? null : `${pct2(cab.avanco_liberado)}%`}
                        carregando={cabPls.carregando}
                      />
                      <CampoLeitura rotulo="Último envio do DCD" valor={cab?.envio_dcd ? dataHora(cab.envio_dcd).replace(', ', ' às ') : null} alerta={cab?.envio_dcd && !ehHoje(cab.envio_dcd)} carregando={cabPls.carregando} />
                      <CampoLeitura rotulo="Último envio do Geral" valor={cab?.envio_geral ? dataHora(cab.envio_geral).replace(', ', ' às ') : null} alerta={cab?.envio_geral && !ehHoje(cab.envio_geral)} carregando={cabPls.carregando} />
                    </>
                  )}
                  {financeiro && (
                    <>
                      <Campo rotulo="Tipo">
                        <div className="grid grid-cols-2 rounded-lg border border-gray-200 p-0.5">
                          {[
                            ['PAGAR', 'A pagar', ArrowUpRight, 'bg-red-50 text-red-600'],
                            ['RECEBER', 'A receber', ArrowDownLeft, 'bg-emerald-50 text-emerald-700'],
                          ].map(([valor, rotulo, Icone, ativo]) => (
                            <button
                              key={valor}
                              type="button"
                              onClick={() => trocarTipo(valor)}
                              disabled={travado}
                              aria-pressed={form.tipo === valor}
                              className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-sm font-medium transition ${
                                form.tipo === valor ? ativo : 'text-gray-500 hover:bg-gray-50'
                              }`}
                            >
                              <Icone size={14} /> {rotulo}
                            </button>
                          ))}
                        </div>
                      </Campo>
                      <Campo rotulo="Emissão">
                        <CampoData value={form.data_emissao} onChange={mudar('data_emissao')} disabled={travado} className={INPUT} />
                      </Campo>
                      <Campo rotulo={form.tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente'} className="md:col-span-2">
                        <SearchableSelect
                          value={form.pessoa_id}
                          onChange={mudar('pessoa_id')}
                          options={opPessoas}
                          placeholder={form.tipo === 'PAGAR' ? 'Escolha o fornecedor' : 'Escolha o cliente'}
                          emptyMessage={form.tipo === 'PAGAR' ? 'Nenhum fornecedor encontrado.' : 'Nenhum cliente encontrado.'}
                          disabled={travado}
                          larguraPainel={420}
                        />
                      </Campo>
                      <Campo rotulo="Valor do título">
                        <input
                          value={form.valor}
                          onChange={(e) => mudarValor(e.target.value)}
                          onBlur={() => valido(total) && setForm((f) => ({ ...f, valor: numeroBr(total) }))}
                          disabled={travado}
                          inputMode="decimal"
                          placeholder="0,00"
                          className={`${INPUT} text-right tabular-nums`}
                        />
                      </Campo>
                      <Campo rotulo="Documento (opcional)">
                        <input value={form.documento} onChange={(e) => mudar('documento')(e.target.value)} disabled={travado} maxLength={50} className={INPUT} />
                      </Campo>
                      <Campo rotulo="Histórico (opcional)" className="md:col-span-2">
                        <input value={form.historico} onChange={(e) => mudar('historico')(e.target.value)} disabled={travado} maxLength={255} className={INPUT} />
                      </Campo>
                    </>
                  )}
                </div>
              )}

              {abaVisivel === 'cabecalho' && !financeiro && pls.centro_id && (
                <BasesProjecaoPls
                  cab={cab}
                  carregando={cabPls.carregando}
                  erro={cabPls.erro}
                  avancoInformado={avancoValido ? avancoInformado : null}
                />
              )}

              {abaVisivel === 'rateios-pls' && (
                <AbaRateiosPls
                  centroEscolhido={Boolean(pls.centro_id)}
                  projecao={projPls}
                  carregando={cabPls.carregando || avanco.carregando}
                  contasSugeridas={cab?.contas_sugeridas}
                  opNaturezas={opNaturezas}
                  rateio={rateioPls}
                  setRateio={setRateioPls}
                />
              )}

              {abaVisivel === 'repasses-pf' && (
                <AbaRepassesPf
                  centroEscolhido={Boolean(pls.centro_id)}
                  repasses={repasses}
                  avancoMedicao={avancoValido ? avancoInformado : null}
                  dataMedicao={pls.data_medicao}
                />
              )}

              {abaVisivel === 'documentos' && (
                <AbaDocumentos empresaId={empresaId} centroId={pls.centro_id} documentos={documentos} />
              )}

              {abaVisivel === 'avancos' && (
                <AbaAvancos
                  centroEscolhido={Boolean(pls.centro_id)}
                  avanco={avanco}
                  dataMedicao={pls.data_medicao}
                  avancoInformado={avancoAlterado ? avancoInformado : null}
                />
              )}

              {abaVisivel === 'rateios' && (
                <div className="space-y-2">
                  {!travado && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={adicionarRateio}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
                      >
                        <Plus size={14} /> Adicionar linha
                      </button>
                    </div>
                  )}
                  <div className="rounded-lg ring-1 ring-gray-200">
                    <table className="w-full text-sm">
                      <thead className={CABECALHO}>
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Centro de custo</th>
                          <th className="px-3 py-2 text-left font-medium">Plano de contas</th>
                          <th className="w-28 px-3 py-2 text-right font-medium">%</th>
                          <th className="w-40 px-3 py-2 text-right font-medium">Valor</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {rateios.map((r, i) => (
                          <tr key={i} className="border-b border-gray-100 align-middle">
                            <td className="px-3 py-1.5">
                              <SearchableSelect
                                value={r.centro_id}
                                onChange={(v) => mudarRateio(i, 'centro_id', v)}
                                options={opCentros}
                                placeholder="Centro de custo"
                                emptyMessage="Nenhum centro de custo cadastrado."
                                disabled={travado}
                                larguraPainel={360}
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <SearchableSelect
                                value={r.natureza_id}
                                onChange={(v) => mudarRateio(i, 'natureza_id', v)}
                                options={opNaturezas}
                                placeholder="Plano de contas"
                                emptyMessage="Nenhuma conta cadastrada."
                                disabled={travado}
                                larguraPainel={460}
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                value={r.pct}
                                onChange={(e) => mudarRateio(i, 'pct', e.target.value)}
                                disabled={travado}
                                inputMode="decimal"
                                placeholder="0"
                                aria-label={`Percentual da linha ${i + 1} do rateio`}
                                className={`${INPUT} text-right tabular-nums`}
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                value={r.valor}
                                onChange={(e) => mudarRateio(i, 'valor', e.target.value)}
                                onBlur={() => valido(lerValor(r.valor)) && setRateios((l) => l.map((x, j) => (j === i ? { ...x, valor: numeroBr(lerValor(r.valor)) } : x)))}
                                disabled={travado}
                                inputMode="decimal"
                                placeholder="0,00"
                                aria-label={`Valor da linha ${i + 1} do rateio`}
                                className={`${INPUT} text-right tabular-nums`}
                              />
                            </td>
                            <td className="pr-2 text-center">
                              {!travado && rateios.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setRateios((l) => l.filter((_, j) => j !== i))}
                                  title="Remover linha"
                                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <X size={15} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-gray-600">
                            Total rateado
                            {totalC > 0 && diferenca(somaRateioC)}
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{fmtPct(Math.round(somaPct * 1e4) / 1e4)}%</td>
                          <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{moeda(somaRateioC / 100)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {abaVisivel === 'parcelas' && (
                <div>
                  <div className="mb-3 grid grid-cols-2 gap-x-4 sm:grid-cols-[150px_170px]">
                    <Campo rotulo="Quantidade (mensais)">
                      <input
                        type="number"
                        min={1}
                        max={360}
                        value={qtd}
                        onChange={(e) => mudarQtd(e.target.value)}
                        disabled={travado}
                        className={`${INPUT} tabular-nums`}
                      />
                    </Campo>
                    <Campo rotulo="1º vencimento">
                      <CampoData value={primeiroVenc} onChange={mudarPrimeiroVenc} disabled={travado} className={INPUT} />
                    </Campo>
                  </div>
                  <div className="max-h-64 overflow-y-auto rounded-lg ring-1 ring-gray-200">
                    <table className="w-full text-sm">
                      <thead className={`sticky top-0 z-10 ${CABECALHO}`}>
                        <tr>
                          <th className="w-16 px-3 py-2 text-left font-medium">Nº</th>
                          <th className="px-3 py-2 text-left font-medium">Vencimento</th>
                          <th className="px-3 py-2 text-right font-medium">Valor</th>
                          {temBaixa && <th className="px-3 py-2 text-left font-medium">Baixa</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {parcelas.map((p, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            <td className="px-3 py-1.5 tabular-nums text-gray-500">
                              {i + 1}/{parcelas.length}
                            </td>
                            <td className="px-3 py-1.5">
                              <CampoData
                                value={p.vencimento}
                                onChange={(v) => mudarParcela(i, 'vencimento', v)}
                                disabled={travado}
                                aria-label={`Vencimento da parcela ${i + 1}`}
                                className={`${INPUT} max-w-44 !py-1.5`}
                              />
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <input
                                value={p.valor}
                                onChange={(e) => mudarParcela(i, 'valor', e.target.value)}
                                onBlur={() => valido(lerValor(p.valor)) && mudarParcela(i, 'valor', numeroBr(lerValor(p.valor)))}
                                disabled={travado}
                                inputMode="decimal"
                                placeholder="0,00"
                                aria-label={`Valor da parcela ${i + 1}`}
                                className={`${INPUT} ml-auto max-w-40 !py-1.5 text-right tabular-nums`}
                              />
                            </td>
                            {temBaixa && (
                              <td className="px-3 py-1.5 text-xs text-emerald-700">
                                {p.data_baixa ? `${data(p.data_baixa)} · ${moeda(p.valor_baixa)}` : <span className="text-gray-400">Em aberto</span>}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="sticky bottom-0 bg-gray-50">
                        <tr>
                          <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-gray-600">
                            Total das parcelas
                            {totalC > 0 && diferenca(somaParcelasC)}
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{moeda(somaParcelasC / 100)}</td>
                          {temBaixa && <td />}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          {erroSalvar && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erroSalvar}</p>}

          {financeiro && (
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-gray-400">
                {dados &&
                  `Criado por ${dados.criado_por || 'usuário'} em ${dataHora(dados.criado_em)}${
                    dados.atualizado_em && dados.atualizado_em !== dados.criado_em ? ` · alterado por ${dados.alterado_por || 'usuário'} em ${dataHora(dados.atualizado_em)}` : ''
                  }`}
              </p>
              <div className="flex justify-end gap-2">
                {id && !travado && (
                  <Button type="button" variant="secondary" onClick={excluir} disabled={salvando}>
                    <Trash2 size={15} />
                    Excluir
                  </Button>
                )}
                <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>
                  {travado ? 'Fechar' : 'Cancelar'}
                </Button>
                {!travado && (
                  <Button type="button" onClick={salvar} disabled={salvando}>
                    {salvando ? 'Salvando...' : id ? 'Salvar alterações' : 'Criar título'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// Projeção PLS CEF › Documentos: o último DCD e o último Geral dos Empreendimentos importados no Portal das
// Construtoras para o contrato Caixa do centro, com quando/quem importou, o original e o Excel (os mesmos do
// Portal; nomes dos arquivos também).
const DOCS_PLS = [
  { tipo: 'dcd', rotulo: 'DCD', descricao: 'Demonstrativo de Cronograma de Desembolso', prefixo: 'DCD', prefixoExcel: 'DCD' },
  { tipo: 'geral', rotulo: 'Geral dos Empreendimentos', descricao: 'Geral completo do empreendimento', prefixo: 'GERAL', prefixoExcel: 'Geral' },
];

function AbaDocumentos({ empresaId, centroId, documentos }) {
  const [baixando, setBaixando] = useState('');
  const [erro, setErro] = useState('');
  if (!centroId) return <AvisoAba>Escolha o centro de custo no Cabeçalho para ver os documentos.</AvisoAba>;
  if (documentos.carregando) return <AvisoAba>Carregando os documentos...</AvisoAba>;
  if (documentos.erro) return <AvisoAba>{documentos.erro}</AvisoAba>;
  const d = documentos.dados;
  if (!d) return null;
  if (!d.contrato) return <AvisoAba>Este centro de custo não tem Contrato Caixa cadastrado (DFC Construtoras › Centros Custos).</AvisoAba>;

  async function baixar(doc, formato) {
    const info = d[doc.tipo];
    const chave = `${doc.tipo}-${formato}`;
    setErro('');
    setBaixando(chave);
    try {
      const { blob } = await baixarDocumentoPls(empresaId, centroId, doc.tipo, formato);
      const nome =
        formato === 'excel' ? `${doc.prefixoExcel}-${d.contrato}.xlsx` : info.arquivo_original || `${doc.prefixo}-${d.contrato}.${doc.tipo === 'dcd' ? 'pdf' : 'xls'}`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setErro(formato === 'excel' ? 'Não foi possível exportar o Excel.' : 'Não foi possível baixar o arquivo original (ele pode não estar neste servidor).');
    } finally {
      setBaixando('');
    }
  }

  const botao = 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors disabled:opacity-40';

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Documentos do Portal das Construtoras</h3>
        <p className="text-xs text-gray-500">
          {d.centro_nome} · contrato Caixa {d.contrato} · última importação de cada documento
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg ring-1 ring-gray-200">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className={CABECALHO}>
            <tr>
              <th className="px-3 py-2 font-medium">Documento</th>
              <th className="px-3 py-2 font-medium">Arquivo</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">Importado em</th>
              <th className="whitespace-nowrap px-3 py-2 font-medium">Importado por</th>
              <th className="px-3 py-2 text-center font-medium">Original</th>
              <th className="px-3 py-2 text-center font-medium">Excel</th>
            </tr>
          </thead>
          <tbody>
            {DOCS_PLS.map((doc) => {
              const info = d[doc.tipo];
              return (
                <tr key={doc.tipo} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2.5">
                    <span className="block font-semibold text-gray-900">{doc.rotulo}</span>
                    <span className="block text-xs text-gray-500">{doc.descricao}</span>
                  </td>
                  {info ? (
                    <>
                      <td className="max-w-[260px] truncate px-3 py-2.5 text-xs text-gray-700" title={info.arquivo_original || ''}>
                        {info.arquivo_original || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-gray-700">{dataHora(info.importado_em).replace(', ', ' às ')}</td>
                      <td className="px-3 py-2.5 text-gray-700">{info.enviado_por || '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => baixar(doc, 'original')}
                          disabled={!info.tem_arquivo || baixando === `${doc.tipo}-original`}
                          title={info.tem_arquivo ? 'Baixar o arquivo original' : 'Arquivo original não guardado'}
                          className={`${botao} hover:bg-primary-50 hover:text-primary-600`}
                        >
                          <Download size={16} className={baixando === `${doc.tipo}-original` ? 'animate-bounce' : ''} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => baixar(doc, 'excel')}
                          disabled={baixando === `${doc.tipo}-excel`}
                          title="Exportar para Excel"
                          className={`${botao} hover:bg-emerald-50 hover:text-emerald-600`}
                        >
                          <Sheet size={16} />
                        </button>
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-3 py-2.5 text-xs text-amber-600">
                      Nenhum {doc.rotulo} importado para este contrato no Portal das Construtoras.
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}
    </div>
  );
}

function AvisoAba({ children }) {
  return <div className="flex h-full min-h-[320px] items-center justify-center px-6 text-center text-sm text-gray-500">{children}</div>;
}

const pct2 = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Data/hora (timestamp) é de hoje, no fuso do navegador.
function ehHoje(v) {
  const d = new Date(v);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` === hojeISO();
}

// Campo só de leitura (vem do sistema). `alerta`: em vermelho (ex.: envio que não é de hoje).
function CampoLeitura({ rotulo, valor, alerta = false, carregando = false, dica, className = '' }) {
  return (
    <Campo rotulo={rotulo} className={className}>
      <div
        className={`flex min-h-[38px] items-center truncate rounded-lg border px-2.5 py-2 text-sm tabular-nums ${
          alerta ? 'border-red-200 bg-red-50 font-semibold text-red-600' : 'border-gray-200 bg-gray-50 text-gray-700'
        }`}
        title={typeof valor === 'string' ? valor : undefined}
      >
        {carregando ? <span className="text-gray-400">...</span> : valor ?? <span className="text-gray-400">—</span>}
      </div>
      {dica && <p className="mt-1 text-[11px] text-gray-400">{dica}</p>}
    </Campo>
  );
}

// Projeção PLS CEF › Cabeçalho: as bases que a Projeção CEF da DFC usa para Crédito PJ, Novo Registro e
// Medição (motor em dfc-projecao-cef), já trazidas para o recebimento na data. Só leitura.
//   Medição       = VGF de medição das unidades registradas × avanço a medir
//   Novo Registro = unidades que registram até a data: (terreno + FGTS) + VGF de medição × % de obra
//   Crédito PJ    = CTO × avanço a medir − Medição, depois da Demanda Mínima, até o saldo do teto PJ
function BasesProjecaoPls({ cab, carregando, erro, avancoInformado }) {
  if (erro) return <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>;
  if (cab && !cab.contrato) {
    return (
      <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Este centro de custo não tem Contrato Caixa cadastrado (DFC Construtoras › Centros Custos): sem DCD nem Geral para projetar.
      </p>
    );
  }
  const p = cab?.parametros;
  const u = cab?.unidades;
  const aMedir = avancoInformado !== null && cab?.avanco_liberado !== null && cab?.avanco_liberado !== undefined ? avancoInformado - cab.avanco_liberado : null;
  const saldoTeto = p?.valor_financiamento_pj !== null && p?.valor_financiamento_pj !== undefined && cab ? p.valor_financiamento_pj - cab.credito_pj_liberado : null;
  // CTO, teto PJ e Demanda Mínima vêm do DCD, como na tela de Parâmetros da DFC.
  const doDcd = (v, fmt) => (!cab ? null : v === null || v === undefined ? 'Sem valor no DCD' : fmt(v));
  const L = (props) => <CampoLeitura carregando={carregando} {...props} />;
  // Unidades registradas antes/depois da última liberação: sem liberação no DCD não há corte.
  const doLib = (grupo, fmt) => (!u ? null : grupo ? fmt(grupo) : 'Sem liberação no DCD');

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Bases da projeção · Crédito PJ, Novo Registro e Medição</h3>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-4">
        <L
          rotulo="Avanço a medir"
          valor={aMedir === null ? null : `${pct2(aMedir)}%`}
          alerta={aMedir !== null && aMedir < 0}
        />
        <L rotulo="CTO" valor={doDcd(p?.cto, moeda)} />
        <L rotulo="Valor do Financiamento PJ (teto)" valor={doDcd(p?.valor_financiamento_pj, moeda)} />
        <L rotulo="Crédito PJ já liberado" valor={cab ? moeda(cab.credito_pj_liberado) : null} />
        <L rotulo="Saldo do teto PJ" valor={saldoTeto === null ? null : moeda(saldoTeto)} alerta={saldoTeto !== null && saldoTeto <= 0} />
        <L
          rotulo="Data da Demanda Mínima"
          valor={doDcd(p?.data_demanda_minima, data)}
        />
        <L
          rotulo="Unidades no Geral"
          valor={u ? String(u.total) : null}
        />
        <L rotulo="Registradas até a última liberação" valor={doLib(u?.registradas, (x) => `${x.qtd} unidade(s)`)} />
        <L rotulo="VGF de medição registrado" valor={doLib(u?.registradas, (x) => moeda(x.vgf_medicao))} />
        <L rotulo="Registradas após a última liberação" valor={doLib(u?.apos_liberacao, (x) => `${x.qtd} unidade(s)`)} />
        <L rotulo="Novo Registro · VGF de medição" valor={doLib(u?.apos_liberacao, (x) => moeda(x.vgf_medicao))} />
        <L rotulo="Novo Registro · terreno + FGTS" valor={doLib(u?.apos_liberacao, (x) => moeda(x.terreno_fgts))} />
      </div>
    </div>
  );
}

// Projeção PLS CEF › Avanços: a curva diária do Prevision do centro escolhido no Cabeçalho, com a bandeira
// na Data Previsão Medição (o avanço da medição se altera no Cabeçalho).
function AbaAvancos({ centroEscolhido, avanco, dataMedicao, avancoInformado }) {
  if (!centroEscolhido) return <AvisoAba>Escolha o centro de custo no Cabeçalho para ver o avanço previsto.</AvisoAba>;
  if (avanco.carregando) return <AvisoAba>Carregando o avanço do Prevision...</AvisoAba>;
  if (avanco.erro) return <AvisoAba>{avanco.erro}</AvisoAba>;
  const d = avanco.dados;
  if (!d) return null;
  if (!d.tem_prevision) return <AvisoAba>Este centro de custo não tem Código Prevision (DFC Construtoras › Centros Custos).</AvisoAba>;
  if (d.pontos.length < 2) return <AvisoAba>Ainda não há curva do Prevision importada para este centro de custo.</AvisoAba>;

  const inicio = d.pontos[0].data;
  const fim = d.pontos[d.pontos.length - 1].data;
  const k = indiceNaData(d.pontos, dataMedicao);
  const naData = !dataMedicao ? null : k < 0 ? 0 : d.pontos[k].previsto;
  const fora = dataMedicao && (dataMedicao < inicio || dataMedicao > fim);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Avanço previsto · Prevision</h3>
          <p className="text-xs text-gray-500">
            {d.centro_nome} · curva diária de {data(inicio)} a {data(fim)}
          </p>
        </div>
        {dataMedicao ? (
          <p className="text-sm text-gray-600 sm:text-right">
            Previsto acumulado em {data(dataMedicao)}: <span className="font-semibold tabular-nums text-gray-900">{pct2(naData)}%</span>
            {fora && <span className="ml-1 text-xs text-amber-600">(fora da curva)</span>}
            {avancoInformado !== null && <span className="block text-xs text-gray-500">No Cabeçalho foi informado {pct2(avancoInformado)}%.</span>}
          </p>
        ) : (
          <p className="text-xs text-amber-600">Informe a Data Previsão Medição no Cabeçalho para marcar no gráfico.</p>
        )}
      </div>
      <GraficoAvanco pontos={d.pontos} dataPrevisao={dataMedicao} altura={300} />
    </div>
  );
}


const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

// Projeção curta da PLS CEF (da última liberação até a Data Previsão Medição), com as regras do motor da
// Projeção CEF da DFC (dfc-projecao-cef/projecaoCef.motor.js) aplicadas a uma medição só:
//   avanço a medir (F) = avanço previsto na medição − avanço liberado (nunca negativo); D = % de obra na medição
//   Medição       = VGF de medição das registradas até a última liberação × F            (motor: Q = cumO × F)
//   Novo Registro = registradas após a última liberação: terreno + FGTS + VGF de medição × D
//   Crédito PJ    = até o mês da Demanda Mínima: 0; no mês seguinte a ela: teto × F; depois: CTO × F − Medição;
//                   nunca negativo e limitado ao saldo do teto (teto − crédito PJ já liberado)
// Devolve null enquanto faltar o necessário (com o motivo).
function projetarPls(cab, avanco, dataMedicao) {
  if (!cab) return null;
  if (!cab.contrato) return { motivo: 'Este centro de custo não tem Contrato Caixa cadastrado (DFC Construtoras › Centros Custos).' };
  if (!cab.ultima_liberacao || cab.avanco_liberado === null || cab.avanco_liberado === undefined) {
    return { motivo: 'Sem liberação no DCD deste contrato: não há de onde medir.' };
  }
  if (!dataMedicao) return { motivo: 'Informe a Data Previsão Medição no Cabeçalho.' };
  if (avanco === null) return { motivo: 'Informe o avanço previsto na medição no Cabeçalho.' };

  const D = avanco / 100;
  const F = Math.max(avanco - cab.avanco_liberado, 0) / 100;
  const reg = cab.unidades?.registradas || { vgf_medicao: 0 };
  const apos = cab.unidades?.apos_liberacao || { vgf_medicao: 0, terreno_fgts: 0 };
  const medicao = r2(reg.vgf_medicao * F);
  const novoRegistro = r2(apos.terreno_fgts + apos.vgf_medicao * D);

  const p = cab.parametros || {};
  let creditoPj = null;
  let motivoPj = null;
  if (p.cto === null || p.cto === undefined || p.valor_financiamento_pj === null || p.valor_financiamento_pj === undefined || !p.data_demanda_minima) {
    motivoPj = 'Sem CTO, teto PJ ou Demanda Mínima no DCD.';
  } else {
    const mMed = dataMedicao.slice(0, 7);
    const dm = String(p.data_demanda_minima).slice(0, 7);
    const dmMais1 = somarMeses(`${dm}-01`, 1).slice(0, 7);
    let v = mMed <= dm ? 0 : mMed === dmMais1 ? p.valor_financiamento_pj * F : p.cto * F - medicao;
    v = Math.max(v, 0);
    const saldo = Math.max(p.valor_financiamento_pj - (cab.credito_pj_liberado || 0), 0);
    creditoPj = r2(Math.min(v, saldo));
    if (mMed <= dm) motivoPj = 'Demanda Mínima não atingida na medição.';
  }
  return { novo_registro: novoRegistro, medicao, credito_pj: creditoPj, motivo_pj: motivoPj };
}

const CLASSIFICACOES_PLS = [
  { chave: 'novo_registro', rotulo: 'Novo Registro' },
  { chave: 'medicao', rotulo: 'Medição' },
  { chave: 'credito_pj', rotulo: 'Crédito PJ' },
];

// Projeção PLS CEF › Rateios: sempre as três classificações (Novo Registro, Medição e Crédito PJ), cada uma com
// o plano de contas (sugerido pelo plano da DFC) e o valor projetado. No Crédito PJ dá para reduzir um % do
// valor calculado e alterar o valor projetado.
function AbaRateiosPls({ centroEscolhido, projecao, carregando, contasSugeridas, opNaturezas, rateio, setRateio }) {
  if (!centroEscolhido) return <AvisoAba>Escolha o centro de custo no Cabeçalho para ver os rateios.</AvisoAba>;
  if (carregando && !projecao) return <AvisoAba>Carregando...</AvisoAba>;
  if (!projecao) return null;
  if (projecao.motivo) return <AvisoAba>{projecao.motivo}</AvisoAba>;

  const conta = (k) => rateio.contas[k] ?? contasSugeridas?.[k] ?? '';
  const calcPj = projecao.credito_pj;
  const reducao = lerValor(rateio.pj_reducao);
  const reducaoValida = rateio.pj_reducao === '' || (Number.isFinite(reducao) && reducao >= 0 && reducao <= 100);
  const pjProjetado =
    calcPj === null ? null : rateio.pj_valor !== null ? lerValor(rateio.pj_valor) : r2(calcPj * (1 - (reducaoValida && Number.isFinite(reducao) ? reducao : 0) / 100));
  const pjTexto = rateio.pj_valor ?? (pjProjetado === null ? '' : numeroBr(pjProjetado));
  const pjValido = pjProjetado === null || (Number.isFinite(pjProjetado) && pjProjetado >= 0);
  const projetado = { novo_registro: projecao.novo_registro, medicao: projecao.medicao, credito_pj: pjValido ? pjProjetado : null };
  const total = CLASSIFICACOES_PLS.reduce((s, c) => s + (projetado[c.chave] || 0), 0);

  function mudarReducao(t) {
    setRateio((r) => ({ ...r, pj_reducao: t, pj_valor: null }));
  }
  function mudarValorPj(t) {
    const v = lerValor(t);
    setRateio((r) => ({
      ...r,
      pj_valor: t,
      pj_reducao: calcPj > 0 && Number.isFinite(v) ? pct2(Math.max(0, (1 - v / calcPj) * 100)) : r.pj_reducao,
    }));
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">Rateio da projeção</h3>
      <div className="overflow-x-auto rounded-lg ring-1 ring-gray-200">
        <table className="w-full min-w-[820px] table-fixed text-sm">
          <colgroup>
            <col className="w-36" />
            <col />
            <col className="w-40" />
            <col className="w-32" />
            <col className="w-44" />
          </colgroup>
          <thead className={CABECALHO}>
            <tr>
              <th className="px-3 py-2 text-left font-medium">Classificação</th>
              <th className="px-3 py-2 text-left font-medium">Plano de contas</th>
              <th className="px-3 py-2 text-right font-medium">Calculado</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">% redução</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Valor projetado</th>
            </tr>
          </thead>
          <tbody>
            {CLASSIFICACOES_PLS.map((c) => {
              const ehPj = c.chave === 'credito_pj';
              const calc = projecao[c.chave];
              return (
                <tr key={c.chave} className="border-b border-gray-100 align-middle">
                  <td className="px-3 py-2 font-semibold text-gray-900">{c.rotulo}</td>
                  <td className="px-3 py-2">
                    <SearchableSelect
                      value={conta(c.chave)}
                      onChange={(v) => setRateio((r) => ({ ...r, contas: { ...r.contas, [c.chave]: v || '' } }))}
                      options={opNaturezas}
                      placeholder="Plano de contas"
                      emptyMessage="Nenhuma conta cadastrada."
                      larguraPainel={460}
                      corClasses={corSelect(Boolean(conta(c.chave)))}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700" title={ehPj && projecao.motivo_pj ? projecao.motivo_pj : undefined}>
                    {calc === null ? '—' : moeda(calc)}
                  </td>
                  <td className="px-3 py-2">
                    {ehPj ? (
                      <div className="relative">
                        <input
                          value={rateio.pj_reducao}
                          onChange={(e) => mudarReducao(e.target.value)}
                          disabled={calcPj === null}
                          inputMode="decimal"
                          placeholder="0"
                          aria-label="Percentual de redução do Crédito PJ"
                          className={`${reducaoValida ? inputCor(rateio.pj_reducao !== '') : `${INPUT_SEM_COR} border-red-300 bg-red-50`} !pr-7 text-right tabular-nums`}
                        />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                      </div>
                    ) : (
                      <span className="block text-center text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {ehPj ? (
                      <input
                        value={pjTexto}
                        onChange={(e) => mudarValorPj(e.target.value)}
                        onBlur={() => rateio.pj_valor !== null && pjValido && setRateio((r) => ({ ...r, pj_valor: numeroBr(pjProjetado) }))}
                        disabled={calcPj === null}
                        inputMode="decimal"
                        placeholder="0,00"
                        aria-label="Valor projetado do Crédito PJ"
                        className={`${pjValido ? inputCor(pjTexto !== '') : `${INPUT_SEM_COR} border-red-300 bg-red-50`} text-right tabular-nums`}
                      />
                    ) : (
                      <div className="whitespace-nowrap rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-right tabular-nums text-gray-700">
                        {calc === null ? '—' : moeda(calc)}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-gray-600">
                Total projetado
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold tabular-nums text-gray-500">
                {moeda(CLASSIFICACOES_PLS.reduce((s, c) => s + (projecao[c.chave] || 0), 0))}
              </td>
              <td />
              <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{moeda(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {projecao.motivo_pj && <p className="text-xs text-amber-600">Crédito PJ: {projecao.motivo_pj}</p>}
      {rateio.pj_valor !== null && calcPj !== null && (
        <p className="text-xs text-gray-500">
          Valor do Crédito PJ alterado à mão ·{' '}
          <button type="button" onClick={() => setRateio((r) => ({ ...r, pj_valor: null, pj_reducao: '0' }))} className="font-medium text-primary-600 hover:underline">
            usar o calculado
          </button>
        </p>
      )}
    </div>
  );
}

// Projeção PLS CEF › Repasses PF: rastreio do repasse no Novo Registro, por cliente registrado — a liberação
// da Caixa (data, parcela e % de obra), o VGF de medição, a parte à vista (terreno + FGTS), a parte financiada
// (VGF × % da Caixa) e o total repassado. Cliente registrado depois da última liberação entra no Novo Registro
// desta PLS, com o avanço previsto na medição.
function AbaRepassesPf({ centroEscolhido, repasses, avancoMedicao, dataMedicao }) {
  if (!centroEscolhido) return <AvisoAba>Escolha o centro de custo no Cabeçalho para ver os repasses PF.</AvisoAba>;
  if (repasses.carregando && !repasses.dados) return <AvisoAba>Carregando os repasses PF...</AvisoAba>;
  if (repasses.erro) return <AvisoAba>{repasses.erro}</AvisoAba>;
  const d = repasses.dados;
  if (!d) return null;
  if (!d.contrato) return <AvisoAba>Este centro de custo não tem Contrato Caixa cadastrado (DFC Construtoras › Centros Custos).</AvisoAba>;
  if (!d.clientes.length) return <AvisoAba>Nenhum cliente registrado no Geral deste contrato.</AvisoAba>;

  const D = avancoMedicao;
  const linhas = d.clientes.map((c) => {
    if (c.novo_registro) return { ...c, nesta: false, pct: c.novo_registro.pct, financiado: c.novo_registro.financiado, total: c.novo_registro.valor };
    // Ainda sem Novo Registro: vai nesta PLS, com o avanço previsto na medição.
    const financiado = D === null ? null : r2((c.vgf_medicao * D) / 100);
    return { ...c, nesta: true, pct: D, financiado, total: financiado === null ? null : r2(c.terreno_fgts + financiado) };
  });
  const soma = (k) => linhas.reduce((s, l) => s + (l[k] || 0), 0);
  const val = (v) => (v === null || v === undefined ? '—' : moeda(v));

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Repasses PF · Novo Registro</h3>
        <p className="text-xs text-gray-500">
          {linhas.length} cliente(s) registrado(s){d.sem_registro ? ` · ${d.sem_registro} sem registro` : ''}
        </p>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-lg ring-1 ring-gray-200">
        <table className="w-full min-w-[860px] table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-24" />
            <col className="w-32" />
            <col className="w-20" />
            <col className="w-32" />
            <col className="w-28" />
            <col className="w-32" />
            <col className="w-32" />
          </colgroup>
          <thead className={`sticky top-0 z-10 ${CABECALHO}`}>
            <tr>
              <th className="px-2 py-2 text-left font-medium">Cliente</th>
              <th className="whitespace-nowrap px-2 py-2 text-left font-medium">Registro</th>
              <th className="whitespace-nowrap px-2 py-2 text-left font-medium">Liberação</th>
              <th className="whitespace-nowrap px-2 py-2 text-right font-medium">% Caixa</th>
              <th className="whitespace-nowrap px-2 py-2 text-right font-medium">VGF medição</th>
              <th className="whitespace-nowrap px-2 py-2 text-right font-medium">À vista</th>
              <th className="whitespace-nowrap px-2 py-2 text-right font-medium">VGF × %</th>
              <th className="whitespace-nowrap px-2 py-2 text-right font-medium">Repassado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.contrato_unidade || `${l.cliente}-${l.data_registro}`} className={`border-b border-gray-100 ${l.nesta ? 'bg-amber-50/50' : ''}`}>
                <td className="px-2 py-1.5">
                  <span className="block truncate font-medium text-gray-900" title={l.cliente}>
                    {l.cliente || '—'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-gray-700">{data(l.data_registro)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">
                  {l.nesta ? (
                    <span className="font-medium text-amber-700">{dataMedicao ? `${data(dataMedicao)} · PLS` : 'Nesta PLS'}</span>
                  ) : (
                    <span className="text-gray-700">
                      {data(l.novo_registro.data)} <span className="text-gray-400">· {l.novo_registro.parcela}</span>
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-gray-700">{l.pct === null ? '—' : `${pct2(l.pct)}%`}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-gray-700">{val(l.vgf_medicao)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-gray-700">{val(l.terreno_fgts)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-gray-700">{val(l.financiado)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-right font-semibold tabular-nums text-gray-900">{val(l.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-gray-50">
            <tr>
              <td colSpan={4} className="px-2 py-2 text-xs font-semibold text-gray-600">
                Total
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{moeda(soma('vgf_medicao'))}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{moeda(soma('terreno_fgts'))}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{moeda(soma('financiado'))}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right text-sm font-semibold tabular-nums text-gray-900">{moeda(soma('total'))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
