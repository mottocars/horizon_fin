import { corPadrao } from '../../../utils/coresPadrao';
import { duracaoEtapa, fimEtapa, mesesEntre, somarDias, somarMeses } from '../../CentrosCusto/cronogramaDatas';

// Contas da carteira de obras — usadas na aba Cronogramas de Operações > Cronogramas Obras e no
// dashboard Cronogramas de Obras (as duas telas mostram os mesmos números e o mesmo Gantt). O
// cronograma de cada obra é o Histórico de Etapas do centro de custo (lista de /cronograma-centros).

export function isoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function plural(n, um, varios) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

// Nome da obra nas telas do cronograma: o apelido do cadastro, quando preenchido (pedido do usuário).
export const nomeObra = (centro) => String(centro.apelido || '').trim() || centro.name;

// Cor dos meses em atraso quando ninguém escolheu outra na aba Configurações (atraso_cor NULL).
export const COR_ATRASO_PADRAO = '#dc2626';

// Regra de Atraso da Construção (aba Configurações; `atraso` da lista de /cronograma-centros): o
// dia em que o atraso começa (`desde`) — regra fixa: passados os meses da regra desde o início da
// etapa da construção; planejamento: o mês seguinte àquele em que a curva S de base do Prevision
// chega a 100% (`centro.prevision_base_100`) — e quantos meses vão dali até o fim da construção
// (`meses`; 0 = no prazo). `desde` null: sem como medir (obra sem a curva do Prevision).
function prazoConstrucao(centro, construcao, inicioObra, atraso) {
  const base = { regra: atraso.regra, limite: atraso.meses, base100: centro.prevision_base_100, cor: atraso.cor || COR_ATRASO_PADRAO };
  let desde = null;
  if (atraso.regra === 'FIXA') desde = somarMeses(construcao.inicio, atraso.meses);
  else if (centro.prevision_base_100) desde = somarMeses(`${centro.prevision_base_100.slice(0, 8)}01`, 1);
  if (!desde) return { ...base, desde: null, meses: 0 };
  if (desde < inicioObra) desde = inicioObra;
  const { fim } = construcao;
  const meses = fim && desde <= fim ? Math.max(1, mesesEntre(desde, somarDias(fim, 1))) : 0;
  return { ...base, desde, meses };
}

// Pinta a janela do atraso — de `desde` até o fim da etapa da construção — em toda etapa que cair
// nela, não só na construção: no planejamento o atraso pode começar antes de a construção começar
// no Histórico de Etapas (pedido do usuário: a base do ESTAÇÃO NOGUEIRA I chega a 100% em mar/2025
// e a Construção dele no histórico é só ago–set/2026 — o atraso vale desde abr/2025). A etapa da
// construção leva o `prazo`; cada etapa na janela, o `atraso` (o pedaço dela que fica pintado).
function aplicarAtraso(segmentos, centro, atraso) {
  const construcao = segmentos.find((s) => s.etapa.id === atraso.etapaId);
  if (!construcao) return;
  const prazo = prazoConstrucao(centro, construcao, segmentos[0].inicio, atraso);
  construcao.prazo = prazo;
  if (!prazo.meses) return;
  segmentos.forEach((s) => {
    if (!s.fim || s.fim < prazo.desde || s.inicio > construcao.fim) return;
    s.atraso = {
      desde: s.inicio > prazo.desde ? s.inicio : prazo.desde,
      ate: s.fim < construcao.fim ? s.fim : construcao.fim,
      cor: prazo.cor,
      prazo,
      construcao: s === construcao ? null : construcao.etapa.descricao,
    };
  });
}

// Segmentos da obra: um por etapa com data de início. Fim = véspera do início da seguinte (ou o
// fim gravado); na última, o término — as mesmas regras do Histórico de Etapas (cronogramaDatas).
// Sem fim conhecido, a etapa fica "em aberto". Com a Regra de Atraso da Construção, os meses em
// atraso (aplicarAtraso).
export function montarSegmentos(centro, etapas, atraso = null) {
  const segmentos = etapas
    .map((etapa, i) => {
      const inicio = centro.datas[etapa.id];
      if (!inicio) return null;
      const ultima = i === etapas.length - 1;
      const datas = {
        ultima,
        inicio,
        inicioSeguinte: ultima ? null : centro.datas[etapas[i + 1].id],
        fim: ultima ? centro.data_termino : centro.fins?.[etapa.id],
      };
      const fim = fimEtapa(datas);
      return {
        etapa,
        cor: etapa.cor || corPadrao(i),
        inicio,
        fim,
        duracao: duracaoEtapa(datas),
        unidade: ultima ? 'ano' : 'mês',
        prazo: null,
        atraso: null,
      };
    })
    .filter(Boolean);
  if (atraso && segmentos.length) aplicarAtraso(segmentos, centro, atraso);
  return segmentos;
}

// Onde a obra está hoje: a etapa em curso (a mais adiantada, se uma em aberto se sobrepõe), ou
// antes de começar / depois de terminar.
export function situacaoHoje(segmentos, hoje) {
  if (!segmentos.length) return { tipo: 'sem' };
  const emCurso = segmentos.filter((s) => s.inicio <= hoje && (!s.fim || hoje <= s.fim)).at(-1);
  if (emCurso) return { tipo: 'etapa', segmento: emCurso };
  if (hoje < segmentos[0].inicio) return { tipo: 'aIniciar', segmento: segmentos[0] };
  return { tipo: 'concluida' };
}

export const naEtapa = (obra, etapaId) => obra.situacao.tipo === 'etapa' && obra.situacao.segmento.etapa.id === etapaId;

// Segmento dentro do período 'AAAA-MM' (do dia 1 do mês De ao último dia do mês Até). Etapa sem
// fim conhecido conta só o mês de início, como no Gantt.
function noPeriodo(segmento, periodo) {
  const de = `${periodo.ini}-01`;
  const ate = somarDias(somarMeses(`${periodo.fim}-01`, 1), -1);
  return segmento.inicio <= ate && (segmento.fim || segmento.inicio) >= de;
}

// Recorte dos cards (clicar num card de etapa filtra o Gantt — pedido do usuário): as obras que
// estiveram na etapa em algum momento do período, não só as que estão nela hoje — ex.: duas obras
// lançando este mês e uma no mês que vem, o card do Lançamento mostra as três. Os números do card
// contam as mesmas (resumoCarteira). Sem período (Visão geral), o cronograma inteiro.
export const naRecorte = (obra, recorte, periodo = null) =>
  obra.segmentos.some((s) => s.etapa.id === recorte && (!periodo || noPeriodo(s, periodo)));

// Textos do recorte: o aviso do Gantt ("Em Construção no período") e o complemento dos números do
// primeiro card ("VGV em Construção"). null sem recorte (ou etapa que não existe mais).
export function rotuloRecorte(recorte, etapas, periodo = null) {
  const etapa = etapas.find((e) => e.id === recorte);
  if (!etapa) return null;
  return { aviso: periodo ? `Em ${etapa.descricao} no período` : `Passam por ${etapa.descricao}`, topo: `em ${etapa.descricao}` };
}

// Período do Mês a mês (filtro De/Até no topo — pedido do usuário): digitado com dia, mês e ano
// ('AAAA-MM-DD', como o input date), mas só o mês e o ano valem (mesesDoPeriodo). Por padrão, do dia 1
// de 3 meses antes do atual ao último dia de 20 meses à frente. Quem chama guarda no estado da tela:
// mudou, só volta ao padrão ao recarregar a página.
function diaDeHoje(meses, dia) {
  const h = new Date();
  const d = new Date(h.getFullYear(), h.getMonth() + meses, dia);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function periodoPadrao() {
  return { ini: diaDeHoje(-3, 1), fim: diaDeHoje(21, 0) };
}

// As datas digitadas no De/Até → o período em meses ('AAAA-MM') que os filtros e o Gantt usam.
export function mesesDoPeriodo(datas) {
  return { ini: datas.ini.slice(0, 7), fim: datas.fim.slice(0, 7) };
}

// Data completa e com ano de verdade — enquanto o ano é digitado, o input date passa por 0002, 0020...
export const dataPeriodoValida = (valor) => /^(19|2[01])\d{2}-\d{2}-\d{2}$/.test(valor || '');

// Troca de uma data do De/Até (as duas telas usam): ignora data incompleta e, se De passar de Até,
// inverte.
export function trocarDataPeriodo(datas, campo, valor) {
  if (!dataPeriodoValida(valor)) return datas;
  const novo = { ...datas, [campo]: valor };
  return novo.ini <= novo.fim ? novo : { ini: novo.fim, fim: novo.ini };
}

// Só as obras com alguma etapa dentro do período (as de fora não aparecem — nem no Gantt, nem nos
// cards). `periodo` null = todas.
export function filtrarPeriodo(obras, periodo) {
  if (!periodo) return obras;
  return obras.filter((o) => [...o.segmentos, ...(o.antes || [])].some((s) => noPeriodo(s, periodo)));
}

// As obras (centros com Tipo = Obra), cada uma com os segmentos e a situação de hoje: com
// cronograma primeiro, pela data de início da primeira etapa; sem cronograma no fim. `atraso`: a
// Regra de Atraso da Construção da empresa (null = sem regra). `atrasadaHoje`: a construção já passou
// do prazo hoje (o atraso já começou — não conta o que o cronograma só prevê atrasar mais adiante).
export function montarObras(centros, etapas, hoje, atraso = null) {
  return centros
    .filter((c) => c.natureza === 'OBRA')
    .map((centro) => {
      const segmentos = montarSegmentos(centro, etapas, atraso);
      const prazo = segmentos.find((s) => s.prazo)?.prazo;
      return { centro, segmentos, situacao: situacaoHoje(segmentos, hoje), atrasadaHoje: Boolean(prazo?.meses && prazo.desde <= hoje) };
    })
    .sort((a, b) => {
      const ia = a.segmentos[0]?.inicio || '9999';
      const ib = b.segmentos[0]?.inicio || '9999';
      return ia.localeCompare(ib) || nomeObra(a.centro).localeCompare(nomeObra(b.centro), 'pt-BR');
    });
}

// VGV e unidades do primeiro card: das obras do recorte (a carteira, as da etapa do filtro
// ou a obra selecionada). `recorte`: o complemento do rótulo ("em Construção", "da obra"; null = total).
export function numerosTopo(obras, recorte = null) {
  const soma = (campo) => obras.reduce((s, o) => s + (Number(o.centro[campo]) || 0), 0);
  return { vgv: soma('valor_geral_vendas'), unidades: soma('numero_unidades'), recorte };
}

// Números da carteira: VGV, unidades e, por etapa, as obras que estiveram nela em algum momento do
// `periodo` (De/Até; null = o cronograma inteiro) — o mesmo recorte do clique no card (naRecorte),
// pedido do usuário: antes eram só as que estão nela hoje. `quando`: o complemento do número no card.
// Na etapa da construção (a que leva o `prazo` da Regra de Atraso), também `atraso`: as obras que
// estão na construção hoje e já atrasadas hoje (pedido do usuário: as que o cronograma só prevê
// atrasar mais adiante não contam) e o VGV delas; null nas outras etapas.
// Em cada etapa também `aIniciar`: as obras que ainda não começaram e vão começar por ela (a primeira
// etapa com data no cronograma delas), com o VGV e as unidades — null quando nenhuma. Antes ia sempre
// no primeiro card, e uma etapa nova sem datas na frente do Lançamento (Landbank, GENESIS) ficava
// com as obras a iniciar dele (pedido do usuário).
export function resumoCarteira(obras, etapas, periodo = null) {
  const soma = (centros, campo) => centros.reduce((s, c) => s + (Number(c[campo]) || 0), 0);
  const centros = obras.map((o) => o.centro);
  const aIniciar = obras.filter((o) => o.situacao.tipo === 'aIniciar').map((o) => o.centro);
  return {
    totalObras: obras.length,
    quando: periodo ? 'no período' : 'no cronograma',
    vgv: soma(centros, 'valor_geral_vendas'),
    comVgv: centros.filter((c) => Number(c.valor_geral_vendas) > 0).length,
    unidades: soma(centros, 'numero_unidades'),
    comUnidades: centros.filter((c) => Number(c.numero_unidades) > 0).length,
    porEtapa: etapas.map((etapa, i) => {
      const lista = obras.filter((o) => naRecorte(o, etapa.id, periodo)).map((o) => o.centro);
      const prazoDe = (o) => o.segmentos.find((s) => s.etapa.id === etapa.id)?.prazo;
      const construcao = obras.find(prazoDe);
      const atrasadas = obras.filter((o) => naEtapa(o, etapa.id) && o.atrasadaHoje && prazoDe(o)).map((o) => o.centro);
      const iniciam = obras
        .filter((o) => o.situacao.tipo === 'aIniciar' && o.situacao.segmento.etapa.id === etapa.id)
        .map((o) => o.centro);
      return {
        etapa,
        cor: etapa.cor || corPadrao(i),
        obras: lista,
        vgv: soma(lista, 'valor_geral_vendas'),
        unidades: soma(lista, 'numero_unidades'),
        atraso: construcao ? { obras: atrasadas, vgv: soma(atrasadas, 'valor_geral_vendas'), cor: prazoDe(construcao).cor } : null,
        aIniciar: iniciam.length ? { obras: iniciam, vgv: soma(iniciam, 'valor_geral_vendas'), unidades: soma(iniciam, 'numero_unidades') } : null,
      };
    }),
    comCronograma: obras.filter((o) => o.segmentos.length).length,
    semCronograma: obras.filter((o) => !o.segmentos.length).length,
    aIniciar: aIniciar.length,
    concluidas: obras.filter((o) => o.situacao.tipo === 'concluida').length,
  };
}

// Alterações de uma obra numa versão do cronograma (pendências e versões gravadas), em linhas: o
// início de cada etapa que mudou (e o término da última) — o fim das outras sai do início da
// seguinte, então já está na linha dela.
export function linhasDaObra(obra) {
  return obra.etapas.flatMap((m) => {
    const linhas = [];
    if (m.inicio_antes !== m.inicio_depois) linhas.push({ chave: `${m.etapa_id}i`, etapa: m.etapa, rotulo: 'início', antes: m.inicio_antes, depois: m.inicio_depois });
    if (m.ultima && m.fim_antes !== m.fim_depois) linhas.push({ chave: `${m.etapa_id}f`, etapa: m.etapa, rotulo: 'término', antes: m.fim_antes, depois: m.fim_depois });
    return linhas;
  });
}

// Filtros "Obras" e "Localidade" com marcação múltipla (pedidos do usuário): "Obras" marca centros
// de custo (sienge_id); "Localidade", as "Cidade - UF". Dentro de um filtro as marcações somam (uma OU
// outra); entre os dois elas se cruzam. Nada marcado = todas.

// Localidade da obra: "Cidade - UF" do cadastro do centro (a mesma chave que agrupa o Gantt por cidade).
export const SEM_CIDADE = 'Sem cidade';
export function localidadeObra(centro) {
  const cidade = (centro.cidade || '').trim();
  const uf = (centro.uf || '').trim().toUpperCase();
  return cidade ? (uf ? `${cidade} - ${uf}` : cidade) : SEM_CIDADE;
}

// Opções do filtro "Obras": os centros (das localidades marcadas, se houver), em ordem de nome.
export function opcoesFiltroObras(centros, localidades = []) {
  return centros
    .filter((c) => !localidades.length || localidades.includes(localidadeObra(c)))
    .map((c) => ({ value: String(c.sienge_id), label: `${nomeObra(c)} (${c.sienge_id})` }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

// Opções do filtro "Localidade": as "Cidade - UF" das obras, em ordem alfabética, "Sem cidade" por último.
export function opcoesLocalidade(centros) {
  const locais = [...new Set(centros.map(localidadeObra))].sort(
    (a, b) => (a === SEM_CIDADE) - (b === SEM_CIDADE) || a.localeCompare(b, 'pt-BR')
  );
  return locais.map((l) => ({ value: l, label: l === SEM_CIDADE ? l : l.toUpperCase() }));
}

// Os filtros "Obras" (centros marcados) e "Localidade" juntos.
export function filtrarObras(obras, centros = [], localidades = []) {
  return obras.filter(
    (o) =>
      (!centros.length || centros.includes(String(o.centro.sienge_id))) &&
      (!localidades.length || localidades.includes(localidadeObra(o.centro)))
  );
}

// Trocou as localidades: os centros marcados no filtro "Obras" que não são delas saem.
export function obrasNasLocalidades(marcadas, localidades, centros) {
  if (!localidades.length) return marcadas;
  const local = new Map(centros.map((c) => [String(c.sienge_id), localidadeObra(c)]));
  return marcadas.filter((v) => localidades.includes(local.get(v)));
}

// Filtro "Mudanças da versão" do Gantt (pedido do usuário): as obras alteradas numa versão, montadas
// do retrato guardado nela (como ficaram), cada uma com `antes` — os segmentos de como eram antes da
// versão, o Gantt desenha numa faixa fina em cima da barra — e `mudancas` (etapaId -> a alteração da
// etapa, pra dica). `versao`: detalhe de /cronograma-centros/:empresa/versoes/:id.
export function obrasDaVersao(versao, hoje) {
  const { etapas, atraso, centros } = versao.cronograma;
  const porObra = new Map(versao.alteracoes.map((a) => [a.sienge_id, a]));
  return montarObras(
    centros.filter((c) => porObra.has(c.sienge_id)),
    etapas,
    hoje,
    atraso
  ).map((o) => {
    const alteracao = porObra.get(o.centro.sienge_id);
    const antes = { ...o.centro, datas: { ...o.centro.datas }, fins: { ...o.centro.fins } };
    alteracao.etapas.forEach((m) => {
      if (m.inicio_antes) antes.datas[m.etapa_id] = m.inicio_antes;
      else delete antes.datas[m.etapa_id];
      antes.fins[m.etapa_id] = m.fim_antes;
      if (m.ultima) antes.data_termino = m.fim_antes;
    });
    return {
      ...o,
      antes: montarSegmentos(antes, etapas),
      mudancas: Object.fromEntries(alteracao.etapas.map((m) => [m.etapa_id, m])),
    };
  });
}
