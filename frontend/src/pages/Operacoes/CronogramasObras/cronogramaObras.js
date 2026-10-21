import { corPadrao } from '../../../utils/coresPadrao';
import { duracaoEtapa, fimEtapa } from '../../CentrosCusto/cronogramaDatas';

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

// Segmentos da obra: um por etapa com data de início. Fim = véspera do início da seguinte (ou o
// fim gravado); na última, o término — as mesmas regras do Histórico de Etapas (cronogramaDatas).
// Sem fim conhecido, a etapa fica "em aberto".
export function montarSegmentos(centro, etapas) {
  return etapas
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
      return {
        etapa,
        cor: etapa.cor || corPadrao(i),
        inicio,
        fim: fimEtapa(datas),
        duracao: duracaoEtapa(datas),
        unidade: ultima ? 'ano' : 'mês',
      };
    })
    .filter(Boolean);
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

// As obras (centros com Tipo = Obra), cada uma com os segmentos e a situação de hoje: com
// cronograma primeiro, pela data de início da primeira etapa; sem cronograma no fim.
export function montarObras(centros, etapas, hoje) {
  return centros
    .filter((c) => c.natureza === 'OBRA')
    .map((centro) => {
      const segmentos = montarSegmentos(centro, etapas);
      return { centro, segmentos, situacao: situacaoHoje(segmentos, hoje) };
    })
    .sort((a, b) => {
      const ia = a.segmentos[0]?.inicio || '9999';
      const ib = b.segmentos[0]?.inicio || '9999';
      return ia.localeCompare(ib) || a.centro.name.localeCompare(b.centro.name, 'pt-BR');
    });
}

// VGV e unidades dos dois primeiros cards: das obras do recorte (a carteira, as da etapa destacada
// ou a obra selecionada). `recorte`: o complemento do rótulo ("em Construção", "da obra"; null = total).
export function numerosTopo(obras, recorte = null) {
  const soma = (campo) => obras.reduce((s, o) => s + (Number(o.centro[campo]) || 0), 0);
  return { vgv: soma('valor_geral_vendas'), unidades: soma('numero_unidades'), recorte };
}

// Números da carteira: VGV, unidades e, por etapa, as obras que estão nela hoje.
export function resumoCarteira(obras, etapas) {
  const soma = (centros, campo) => centros.reduce((s, c) => s + (Number(c[campo]) || 0), 0);
  const centros = obras.map((o) => o.centro);
  return {
    totalObras: obras.length,
    vgv: soma(centros, 'valor_geral_vendas'),
    comVgv: centros.filter((c) => Number(c.valor_geral_vendas) > 0).length,
    unidades: soma(centros, 'numero_unidades'),
    comUnidades: centros.filter((c) => Number(c.numero_unidades) > 0).length,
    porEtapa: etapas.map((etapa, i) => {
      const lista = obras.filter((o) => naEtapa(o, etapa.id)).map((o) => o.centro);
      return { etapa, cor: etapa.cor || corPadrao(i), obras: lista, vgv: soma(lista, 'valor_geral_vendas'), unidades: soma(lista, 'numero_unidades') };
    }),
    comCronograma: obras.filter((o) => o.segmentos.length).length,
    semCronograma: obras.filter((o) => !o.segmentos.length).length,
    aIniciar: obras.filter((o) => o.situacao.tipo === 'aIniciar').length,
    concluidas: obras.filter((o) => o.situacao.tipo === 'concluida').length,
  };
}
