import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CloudCheck,
  FileSpreadsheet,
  Flag,
  HardHat,
  History,
  Home,
  ListTree,
  Loader2,
  Percent,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import Button from '../../../../components/Button';
import {
  calcularOrcamentoDre,
  concluirOrcamentoDre,
  contasOrcamentoDre,
  criarOrcamentoDre,
  historicoOrcamentoDre,
  obterOrcamentoDre,
  atualizarOrcamentoDre,
  unidadesOrcamentoDre,
  baixarLayoutProjecoesDre,
} from '../../../../api/dreProjecoes.api';
import JanelaAssistente from './JanelaAssistente';
import EtapaCentro from './EtapaCentro';
import EtapaHistorico from './EtapaHistorico';
import EtapaVendas from './EtapaVendas';
import GradeContas from './GradeContas';
import EtapaPoc from './EtapaPoc';
import EtapaConclusao from './EtapaConclusao';
import ImportarPlanilhaModal from './ImportarPlanilhaModal';
import { baixarArquivo, mensagemDeErro, mesDeHoje, rotuloMesLongo, somarMeses, vendaDaUnidade } from './util';

const ETAPAS = [
  { id: 'centro', rotulo: 'Centro e ciclo', icone: Building2 },
  { id: 'historico', rotulo: 'Histórico', icone: History },
  { id: 'vendas', rotulo: 'Vendas', icone: Home, obra: true },
  { id: 'custos', rotulo: 'Custos da POC', icone: HardHat, obra: true },
  { id: 'poc', rotulo: 'POC', icone: Percent, obra: true },
  { id: 'demais', rotulo: 'Demais contas', icone: ListTree },
  { id: 'conclusao', rotulo: 'Conclusão', icone: Flag },
];

// Largura que cada etapa pede (a janela limita à tela): tabelas de meses crescem com o ciclo.
const larguraMeses = (n, nome = 340) => nome + 116 * n + 132 + 52;

const mensagem = (e, padrao) => e?.response?.data?.message || padrao;

// Assistente do orçamento (aba Projeções da DRE): centro e ciclo → histórico e trava → vendas → custos
// da POC → POC → demais contas → conclusão. Centro administrativo pula as etapas de POC; sem histórico
// realizado, pula o histórico (o realizado acaba no mês antes do início do ciclo). Tudo é gravado no
// rascunho a cada mudança (fechar e voltar depois continua de onde parou); concluir não salva a versão
// — isso é o "Salvar versão" da aba.
export default function AssistenteOrcamento({ empresaId, orcamentoId = null, centros, onFechar }) {
  const [orc, setOrc] = useState(null);
  const [form, setForm] = useState({ centroId: null, cicloInicio: mesDeHoje(), cicloFim: somarMeses(mesDeHoje(), 23) });
  const [etapa, setEtapa] = useState(orcamentoId ? null : 'centro');
  const [dados, setDados] = useState({});
  const [trava, setTrava] = useState(null);
  const [temHistorico, setTemHistorico] = useState(null);
  const [cache, setCache] = useState({});
  const [carregando, setCarregando] = useState(Boolean(orcamentoId));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [gravacao, setGravacao] = useState(null); // 'pendente' | 'salvando' | 'salvo' | 'erro'

  const idRef = useRef(orcamentoId);
  const pendente = useRef(null);
  const timer = useRef(null);
  const fila = useRef(Promise.resolve());

  const centro = useMemo(
    () => centros.find((c) => String(c.sienge_id) === String(orc?.centro_id ?? form.centroId)),
    [centros, orc, form.centroId]
  );
  const obra = (orc?.natureza ?? centro?.natureza) === 'OBRA';
  const etapas = ETAPAS.filter((e) => (!e.obra || obra) && !(e.id === 'historico' && temHistorico === false));
  const indice = Math.max(0, etapas.findIndex((e) => e.id === etapa));

  // ---- gravação automática do rascunho (fila: uma requisição por vez)
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    fila.current = fila.current.then(async () => {
      const patch = pendente.current;
      if (!patch || !idRef.current) return;
      pendente.current = null;
      setGravacao('salvando');
      try {
        const novo = await atualizarOrcamentoDre(empresaId, idRef.current, patch);
        setOrc((o) => ({ ...o, ...novo, dados: undefined }));
        setGravacao(pendente.current ? 'pendente' : 'salvo');
      } catch (e) {
        setGravacao('erro');
        setErro(mensagem(e, 'Não foi possível salvar o rascunho.'));
        throw e;
      }
    });
    return fila.current;
  }, [empresaId]);

  const agendar = useCallback(
    (patch, imediato = false) => {
      pendente.current = { ...(pendente.current || {}), ...patch };
      setGravacao('pendente');
      clearTimeout(timer.current);
      if (imediato) return flush();
      timer.current = setTimeout(() => flush().catch(() => {}), 700);
      return Promise.resolve();
    },
    [flush]
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  // ---- abrir um rascunho existente
  useEffect(() => {
    if (!orcamentoId) return;
    let ativo = true;
    obterOrcamentoDre(empresaId, orcamentoId)
      .then((o) => {
        if (!ativo) return;
        setOrc(o);
        setForm({ centroId: o.centro_id, cicloInicio: o.ciclo_inicio, cicloFim: o.ciclo_fim });
        setDados(o.dados || {});
        setTrava(o.trava);
        setEtapa(o.status === 'CONCLUIDO' && o.resultado ? 'conclusao' : o.etapa || 'centro');
        historicoOrcamentoDre(empresaId, o.id)
          .then((h) => ativo && (setTemHistorico(h.tem_historico), setCache((c) => ({ ...c, historico: h }))))
          .catch(() => {});
      })
      .catch((e) => ativo && setErro(mensagem(e, 'Não foi possível abrir o orçamento.')))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [empresaId, orcamentoId]);

  // ---- dados de cada etapa (com chave: refaz quando a trava ou o ciclo mudam)
  const chaveJanela = `${trava}|${form.cicloInicio}|${form.cicloFim}`;
  useEffect(() => {
    const id = idRef.current;
    if (!id || !etapa) return undefined;
    let ativo = true;
    const buscar = async () => {
      if (etapa === 'historico' && !cache.historico) {
        const h = await historicoOrcamentoDre(empresaId, id);
        if (ativo) setCache((c) => ({ ...c, historico: h }));
      } else if (etapa === 'vendas' && cache.vendas?.chave !== chaveJanela) {
        await flush();
        const u = await unidadesOrcamentoDre(empresaId, id);
        if (ativo) setCache((c) => ({ ...c, vendas: { chave: chaveJanela, ...u } }));
      } else if ((etapa === 'custos' || etapa === 'demais') && cache[etapa]?.chave !== chaveJanela) {
        await flush();
        const r = await contasOrcamentoDre(empresaId, id, etapa === 'custos' ? 'poc' : 'demais');
        if (ativo) setCache((c) => ({ ...c, [etapa]: { chave: chaveJanela, ...r } }));
      } else if (etapa === 'poc') {
        await flush();
        if (ativo) setCache((c) => ({ ...c, poc: null }));
        const r = await calcularOrcamentoDre(empresaId, id);
        if (ativo) setCache((c) => ({ ...c, poc: r }));
      }
    };
    buscar().catch((e) => ativo && setErro(mensagem(e, 'Não foi possível carregar esta etapa.')));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa, chaveJanela, empresaId]);

  // Histórico até a trava: trocou a trava na etapa, recalcula a tabela até ela (com uma pausa, pra não
  // recalcular a cada clique no seletor de mês).
  const [recalculandoHistorico, setRecalculandoHistorico] = useState(false);
  useEffect(() => {
    const h = cache.historico;
    if (etapa !== 'historico' || !h || !trava || !/^\d{4}-\d{2}$/.test(trava) || trava === h.ate) return undefined;
    if (trava < somarMeses(h.primeiro_mes, -1) || trava > h.mes_atual) return undefined;
    let ativo = true;
    const t = setTimeout(() => {
      setRecalculandoHistorico(true);
      historicoOrcamentoDre(empresaId, idRef.current, trava)
        .then((novo) => ativo && setCache((c) => ({ ...c, historico: novo })))
        .catch((e) => ativo && setErro(mensagem(e, 'Não foi possível recalcular o histórico.')))
        .finally(() => ativo && setRecalculandoHistorico(false));
    }, 500);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [etapa, trava, cache.historico, empresaId]);

  // Planilha das etapas de digitação (Custos da POC e Demais contas): baixar (preenchida com o rascunho,
  // só as naturezas HORIZON - INFORMADO da etapa) e importar de volta. A planilha é sempre por centro
  // (por orçamento) — pedido do usuário.
  const etapaPlanilha = etapa === 'custos' ? 'poc' : 'demais';
  const [importandoEtapa, setImportandoEtapa] = useState(false);
  const [baixandoEtapa, setBaixandoEtapa] = useState(false);
  async function baixarPlanilhaEtapa() {
    setErro('');
    setBaixandoEtapa(true);
    try {
      await flush();
      const { blob, nome } = await baixarLayoutProjecoesDre(empresaId, { orcamentoId: idRef.current, etapa: etapaPlanilha });
      baixarArquivo(blob, nome);
    } catch (e) {
      setErro(await mensagemDeErro(e, 'Não foi possível gerar a planilha.'));
    } finally {
      setBaixandoEtapa(false);
    }
  }
  async function abrirImportacaoEtapa() {
    try {
      await flush();
      setImportandoEtapa(true);
    } catch {
      // erro já mostrado
    }
  }

  const onDados = (novo) => {
    setDados(novo);
    agendar({ dados: novo });
  };
  const onTrava = (t) => {
    setTrava(t);
    if (t && /^\d{4}-\d{2}$/.test(t)) agendar({ trava: t });
  };

  async function irPara(nova) {
    setErro('');
    setAviso('');
    try {
      await agendar({ etapa: nova }, true);
      setEtapa(nova);
    } catch {
      // erro já mostrado
    }
  }

  // Meses projetados (do mês seguinte à trava ao fim do ciclo).
  const inicioProjecao = somarMeses(trava || somarMeses(form.cicloInicio, -1), 1);

  async function avancarDoCentro() {
    const { centroId, cicloInicio, cicloFim } = form;
    if (!centroId) return setErro('Escolha o centro de custo.');
    if (!centro?.natureza) return setErro('Defina o Tipo do centro na aba Centros Custos.');
    if (!cicloInicio || !cicloFim) return setErro('Informe o início e o fim do ciclo.');
    if (cicloFim < cicloInicio) return setErro('O fim do ciclo não pode ser antes do início.');
    let o = orc;
    if (!o) {
      o = await criarOrcamentoDre(empresaId, { centroId, cicloInicio, cicloFim });
      idRef.current = o.id;
      setOrc(o);
      setDados(o.dados || {});
      setTrava(o.trava);
      if (o.existente) {
        setForm({ centroId: o.centro_id, cicloInicio: o.ciclo_inicio, cicloFim: o.ciclo_fim });
        setAviso(`Orçamento em andamento de ${centro.apelido || centro.name} retomado.`);
      }
    } else if (cicloInicio !== o.ciclo_inicio || cicloFim !== o.ciclo_fim) {
      await agendar({ ciclo_inicio: cicloInicio, ciclo_fim: cicloFim }, true);
    }
    const h = await historicoOrcamentoDre(empresaId, o.id);
    setCache((c) => ({ ...c, historico: h }));
    setTemHistorico(h.tem_historico);
    const fim = o.existente ? o.ciclo_fim : cicloFim;
    if (!h.tem_historico) {
      const t = somarMeses(o.existente ? o.ciclo_inicio : cicloInicio, -1);
      setTrava(t);
      await agendar({ trava: t }, true);
      return irPara(obra ? 'vendas' : 'demais');
    }
    if (!o.trava) {
      const t = h.trava_sugerida < fim ? h.trava_sugerida : somarMeses(fim, -1);
      setTrava(t);
      await agendar({ trava: t }, true);
    }
    return irPara('historico');
  }

  async function avancar() {
    setErro('');
    setOcupado(true);
    try {
      if (etapa === 'centro') await avancarDoCentro();
      else if (etapa === 'historico') {
        const h = cache.historico;
        const min = somarMeses(h.primeiro_mes, -1);
        const max = h.mes_atual < form.cicloFim ? h.mes_atual : somarMeses(form.cicloFim, -1);
        if (!trava || trava < min || trava > max) setErro(`Escolha a trava entre ${rotuloMesLongo(min)} e ${rotuloMesLongo(max)}.`);
        else await irPara(etapas[indice + 1].id);
      } else if (etapa === 'vendas') {
        const fora = (cache.vendas?.unidades || []).filter((u) => {
          const { mes } = vendaDaUnidade(u, dados);
          return mes && (mes < inicioProjecao || mes > form.cicloFim);
        }).length;
        if (fora) setErro(`${fora} unidade(s) com mês de venda fora do período projetado.`);
        else await irPara(etapas[indice + 1].id);
      } else if (etapa === 'demais') {
        await flush();
        const o = await concluirOrcamentoDre(empresaId, idRef.current);
        setOrc(o);
        await irPara('conclusao');
      } else await irPara(etapas[indice + 1].id);
    } catch (e) {
      setErro(mensagem(e, 'Não foi possível avançar.'));
    } finally {
      setOcupado(false);
    }
  }

  async function fechar() {
    try {
      await flush();
    } catch {
      // mantém o que deu pra salvar
    }
    onFechar(Boolean(idRef.current));
  }

  // ---- conteúdo e tamanho da etapa
  let conteudo = null;
  let largura = 720;
  const carregandoEtapa = (texto = 'Carregando…') => (
    <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-sm text-gray-400">
      <Loader2 size={22} className="animate-spin text-primary-500" />
      {texto}
    </div>
  );
  if (carregando || !etapa) conteudo = carregandoEtapa();
  else if (etapa === 'centro') {
    largura = 560;
    conteudo = <EtapaCentro centros={centros} valor={form} onChange={setForm} centroTravado={Boolean(orc)} />;
  } else if (etapa === 'historico') {
    const h = cache.historico;
    // Tabela da aba DRE: descrição (380) + Consolidado (valor + AV %, 224) + cada ano (valor + AV %, 208).
    largura = h ? Math.max(880, 380 + 224 + 208 * h.anos.length + 60) : 880;
    conteudo = h ? (
      <EtapaHistorico
        historico={h}
        recalculando={recalculandoHistorico}
        trava={trava}
        onTrava={onTrava}
        cicloFim={form.cicloFim}
        empresaId={empresaId}
      />
    ) : (
      carregandoEtapa()
    );
  } else if (etapa === 'vendas') {
    largura = 1120;
    const v = cache.vendas;
    conteudo =
      v && v.chave === chaveJanela ? (
        <EtapaVendas unidades={v.unidades} meses={v.meses} dados={dados} onDados={onDados} />
      ) : (
        carregandoEtapa('Buscando as unidades disponíveis…')
      );
  } else if (etapa === 'custos' || etapa === 'demais') {
    const c = cache[etapa];
    const pronto = c && c.chave === chaveJanela;
    largura = pronto ? Math.max(960, larguraMeses(c.meses.length)) : 960;
    conteudo = pronto ? (
      <GradeContas key={etapa} conteudo={c} dados={dados} onDados={onDados} />
    ) : (
      carregandoEtapa(etapa === 'custos' ? 'Buscando orçamento, plano de contas e Sienge…' : 'Buscando o plano de contas…')
    );
  } else if (etapa === 'poc') {
    const r = cache.poc;
    largura = r ? Math.max(960, larguraMeses(r.meses.length, 300)) : 960;
    conteudo = r ? <EtapaPoc calculo={r} /> : carregandoEtapa('Calculando a POC…');
  } else if (etapa === 'conclusao') {
    largura = 820;
    conteudo = orc?.resultado ? <EtapaConclusao resultado={orc.resultado} centroNome={centro?.apelido || centro?.name} /> : carregandoEtapa();
  }

  const titulo = centro ? centro.apelido || centro.name : 'Novo orçamento';
  const subtitulo = orc
    ? `Ciclo ${rotuloMesLongo(form.cicloInicio)} a ${rotuloMesLongo(form.cicloFim)}${
        trava ? ` · realizado até ${rotuloMesLongo(trava)}` : ''
      }`
    : 'Centro de custo e ciclo do orçamento';
  const ultimaDigitacao = etapa === 'demais';
  // Janela estreita: o indicador de etapas mostra só o rótulo da etapa atual.
  const compacto = Math.min(largura, window.innerWidth - 96) < 1000;

  const cabecalho = (
    <div className="border-b border-gray-100 px-6 pb-4 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gray-900">{titulo}</h2>
          <p className="truncate text-xs text-gray-500">{subtitulo}</p>
        </div>
        <button type="button" onClick={fechar} className="shrink-0 text-gray-400 hover:text-gray-600" title="Fechar (o rascunho fica salvo)">
          <X size={20} />
        </button>
      </div>
      <ol className="mt-4 flex items-center">
        {etapas.map((e, i) => {
          const Icone = e.icone;
          const feita = i < indice;
          const atual = i === indice;
          const podeVoltar = feita && etapa !== 'conclusao' && !ocupado && Boolean(idRef.current);
          return (
            <li key={e.id} className={`flex items-center ${i < etapas.length - 1 ? 'flex-1' : ''}`}>
              <button
                type="button"
                disabled={!podeVoltar}
                onClick={() => irPara(e.id)}
                className={`flex shrink-0 items-center gap-2 rounded-full ${podeVoltar ? 'cursor-pointer' : 'cursor-default'}`}
                title={e.rotulo}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300 ${
                    feita
                      ? 'bg-primary-600 text-white'
                      : atual
                        ? 'scale-110 bg-white text-primary-600 ring-2 ring-primary-500'
                        : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {feita ? <Check size={14} strokeWidth={2.5} /> : <Icone size={14} />}
                </span>
                <span
                  className={`whitespace-nowrap text-xs font-medium ${compacto && !atual ? 'hidden' : ''} ${
                    atual ? 'text-gray-900' : feita ? 'text-gray-600' : 'text-gray-400'
                  }`}
                >
                  {e.rotulo}
                </span>
              </button>
              {i < etapas.length - 1 && (
                <span className="mx-2 h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <span className={`block h-full bg-primary-500 transition-[width] duration-500 ${feita ? 'w-full' : 'w-0'}`} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );

  const rodape = (
    <div className="border-t border-gray-100">
      {(erro || aviso) && (
        <div className={`flex items-center gap-2 px-6 py-2 text-xs ${erro ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-700'}`}>
          {erro ? <TriangleAlert size={14} className="shrink-0" /> : <Check size={14} className="shrink-0" />}
          {erro || aviso}
        </div>
      )}
      <div className="flex items-center gap-3 px-6 py-3.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-gray-400">
          {gravacao === 'salvando' || gravacao === 'pendente' ? (
            <>
              <Loader2 size={13} className="animate-spin" /> Salvando rascunho…
            </>
          ) : gravacao === 'erro' ? (
            <span className="text-red-500">Rascunho não salvo</span>
          ) : orc ? (
            <>
              <CloudCheck size={14} className="text-emerald-500" /> Rascunho salvo
            </>
          ) : null}
        </span>
        {/* Planilha da etapa (só as naturezas HORIZON - INFORMADO deste orçamento). */}
        {(etapa === 'custos' || etapa === 'demais') && cache[etapa]?.chave === chaveJanela && (
          <span className="ml-2 flex items-center gap-2 border-l border-gray-200 pl-4">
            <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={baixarPlanilhaEtapa} disabled={baixandoEtapa || ocupado}>
              {baixandoEtapa ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
              Baixar planilha
            </Button>
            <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={abrirImportacaoEtapa} disabled={ocupado}>
              <Upload size={14} />
              Importar planilha
            </Button>
          </span>
        )}
        <span className="ml-auto text-xs tabular-nums text-gray-400">
          Etapa {indice + 1} de {etapas.length}
        </span>
        {etapa === 'conclusao' ? (
          <>
            <Button variant="secondary" onClick={() => irPara(etapas[indice - 1].id)} disabled={ocupado}>
              <ArrowLeft size={15} /> Revisar
            </Button>
            <Button onClick={fechar}>Fechar</Button>
          </>
        ) : (
          <>
            {indice > 0 && (
              <Button variant="secondary" onClick={() => irPara(etapas[indice - 1].id)} disabled={ocupado || carregando}>
                <ArrowLeft size={15} /> Voltar
              </Button>
            )}
            <Button onClick={avancar} loading={ocupado} disabled={carregando || !etapa}>
              {ultimaDigitacao ? (
                <>
                  <Flag size={15} /> Concluir orçamento
                </>
              ) : (
                <>
                  Avançar <ArrowRight size={15} />
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <JanelaAssistente largura={largura} cabecalho={cabecalho} rodape={rodape} chave={`${etapa}-${carregando}`}>
        {conteudo}
      </JanelaAssistente>
      <ImportarPlanilhaModal
        open={importandoEtapa}
        onClose={() => setImportandoEtapa(false)}
        empresaId={empresaId}
        recorte={idRef.current ? { orcamentoId: idRef.current, etapa: etapaPlanilha } : null}
        titulo={`Importar planilha · ${etapaPlanilha === 'poc' ? 'Custos da POC' : 'Demais contas'}`}
        onImportado={(r) => {
          if (r.dados) setDados(r.dados);
          setOrc((o) => ({ ...o, status: 'EM_ANDAMENTO', resultado: null }));
        }}
      />
    </>
  );
}
