const pool = require('../../../config/db');
const { z, falha, r2 } = require('../dfc/tools/comum');
const cronograma = require('../../cronograma-centros/cronogramaCentros.service');
const { segmentos, janelaAtraso } = require('../../cronograma-centros/cronogramaExcel.service');
const { curvasPorData } = require('../../dfc-avancos/dfcAvancos.service');
const avanco = require('../../dfc-avancos/avancoObras');
const { periodoDe, valorEm, somar } = require('../../dfc-avancos/periodosAvanco');

// Base do módulo OBRA 360º do conector Horizon: carrega de uma vez tudo o que o dashboard Obra 360º
// mostra (Carteira de obras e Avanço das Obras) — o cronograma (Histórico de Etapas, Regra de Atraso),
// o cadastro dos centros (VGV, unidades, cidade, pilar, responsável), as três curvas de avanço, os
// indicadores do Prevision e o contrato da Caixa (DCD) — e monta cada obra com as MESMAS contas das
// telas: segmentos/situação/atraso (frontend: Operacoes/CronogramasObras/cronogramaObras.js, aqui pelo
// cronogramaExcel.service) e os cards do avanço (dfc-avancos/avancoObras.js).

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const VISAO = z.enum(['mensal', 'semanal', 'diaria']);

const br = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : null);
const brl = (v) => (v === null || v === undefined ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const pc = (v) => (v === null || v === undefined ? null : r2(v)); // % com duas casas (51.33 = 51,33%)
// Texto em pt-BR para as frases: 51,33% / 2,15 p.p.
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => (v === null || v === undefined ? '–' : `${nf2.format(v)}%`);
const ppt = (v) => (v === null || v === undefined ? '–' : `${nf2.format(v)} p.p.`);
const quando = (v) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : null);
const isoDe = (v) => (!v ? null : typeof v === 'string' ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10));
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const mesesEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000 / (365.25 / 12));
const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

async function nomeEmpresa(empresaId) {
  const { rows } = await pool.query(`SELECT COALESCE(NULLIF(nome_fantasia, ''), razao_social) AS nome FROM empresas WHERE id = $1`, [empresaId]);
  return rows[0]?.nome || `Empresa ${empresaId}`;
}

// Situação de hoje (= situacaoHoje da tela): a etapa em curso (a mais adiantada, se uma em aberto se
// sobrepõe), "a iniciar" (antes da primeira) ou "concluída" (depois da última).
// O "mês X de Y" é o do Gantt e da tela do Avanço (avancoObras.etapaHoje).
function situacao(segs, hoje, centro, etapas) {
  if (!segs.length) return { tipo: 'sem', texto: 'Sem cronograma' };
  const seg = segs.filter((s) => s.inicio <= hoje && (!s.fim || hoje <= s.fim)).at(-1);
  if (seg) {
    const { mes } = avanco.etapaHoje(centro, etapas, hoje);
    return { tipo: 'etapa', etapa: seg.etapa.descricao, etapa_id: seg.etapa.id, segmento: seg, mes: seg.fim ? mes : `${mes} (etapa sem fim definido)` };
  }
  if (hoje < segs[0].inicio) return { tipo: 'aIniciar', texto: 'A iniciar', segmento: segs[0] };
  return { tipo: 'concluida', texto: 'Concluída' };
}

// Tudo de uma vez. `visao`: a dos cards do avanço (o previsto vai até o fim do período de hoje).
async function carregar(empresaId, { visao = 'mensal' } = {}) {
  const [retrato, curvas, extras, prevInfo, dcd, cargas, pendencias, empresa] = await Promise.all([
    cronograma.list(empresaId),
    curvasPorData(empresaId),
    pool.query(
      `SELECT c.sienge_id, c.codigo_contrato_caixa, c.codigo_prevision, c.prevision_primary_view, c.faixa, c.projeta_dfc,
              c.commercial_name, m.descricao AS pilar, u.nome AS responsavel
         FROM centros_custo_sienge c
         LEFT JOIN mascara_itens m ON m.id = c.pilar_id
         LEFT JOIN usuarios u ON u.id = c.responsavel_id
        WHERE c.empresa_id = $1 AND c.natureza = 'OBRA'`,
      [empresaId]
    ),
    pool.query(
      `SELECT sienge_id, primary_view, start_at, end_at, days_to_end, delay, idp, realized, expected, last_measurement, atualizado_em
         FROM prevision_dashboard_general_info WHERE empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT numero_contrato, nome_empreendimento, situacao_pedido, data_assinatura, data_inicio_obra, data_termino_obra_original,
              data_termino_obra_atual, prazo_obra_original, prazo_obra_atual, data_inicio_rotina_atraso_obra, percentual_minimo_obra,
              adiantamento_defasagem_obra, percentual_obra_executada, quantidade_parcelas, quantidade_unidades,
              quantidade_unidades_financiadas, quantidade_unidades_comercializadas, valor_custo_obra, orcamento_compra_venda,
              valor_financiamento_pj, saldo_devedor_pj, garantia_termino_obra, total_financiamento, importado_em
         FROM dcd_contratos WHERE empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT 'prevision' AS fonte, MAX(importado_em) AS em FROM prevision_dashboard_scurve WHERE empresa_id = $1
       UNION ALL SELECT 'dcd', MAX(importado_em) FROM dcd_contratos WHERE empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT p.sienge_id, p.datas, p.termino_alterado, p.data_termino, p.atualizado_em, u.nome AS por
         FROM cronograma_pendencias p LEFT JOIN usuarios u ON u.id = p.atualizado_por WHERE p.empresa_id = $1`,
      [empresaId]
    ),
    nomeEmpresa(empresaId),
  ]);
  const hoje = curvas.hoje;
  const { etapas, atraso } = retrato;
  const fimPeriodo = periodoDe(visao, hoje).fim;
  const extra = new Map(extras.rows.map((r) => [r.sienge_id, r]));
  const curvaDe = new Map(curvas.obras.map((o) => [o.sienge_id, o]));
  const dcdDe = new Map(dcd.rows.map((r) => [r.numero_contrato, r]));
  const pendenteDe = new Map(pendencias.rows.map((r) => [r.sienge_id, r]));
  const infoDe = new Map();
  prevInfo.rows.forEach((r) => infoDe.set(`${r.sienge_id}|${r.primary_view}`, r));

  const obras = retrato.centros
    .filter((c) => c.natureza === 'OBRA')
    .map((c) => {
      const segs = segmentos(c, etapas);
      const janela = janelaAtraso(c, segs, atraso);
      const curva = curvaDe.get(c.sienge_id) || null;
      const e = extra.get(c.sienge_id) || {};
      return {
        id: c.sienge_id,
        nome: avanco.nomeObra(c),
        centro: c,
        extra: e,
        segs,
        situacao: situacao(segs, hoje, c, etapas),
        // Janela do atraso da construção (Regra de Atraso): de `desde` até o fim da construção.
        atraso: janela,
        atrasadaHoje: Boolean(janela && janela.desde <= hoje && hoje <= janela.ate),
        curva,
        cards: curva ? avanco.cardsDaObra(curva, hoje, fimPeriodo) : null,
        prevision: { obras: infoDe.get(`${c.sienge_id}|true`) || null, pls: infoDe.get(`${c.sienge_id}|false`) || null },
        dcd: e.codigo_contrato_caixa ? dcdDe.get(e.codigo_contrato_caixa) || null : null,
        pendencia: pendenteDe.get(c.sienge_id) || null,
      };
    })
    .sort((a, b) => (a.segs[0]?.inicio || '9999').localeCompare(b.segs[0]?.inicio || '9999') || a.nome.localeCompare(b.nome, 'pt-BR'));

  return {
    empresa,
    hoje,
    visao,
    fimPeriodo,
    etapas,
    atraso,
    obras,
    atualizacoes: Object.fromEntries(cargas.rows.map((r) => [r.fonte, r.em])),
  };
}

// Obra por código (sienge_id), apelido ou parte do nome — sem acento e sem diferenciar maiúsculas.
function resolverObra(obras, termo) {
  const t = String(termo ?? '').trim();
  if (!t) throw falha('Informe a obra (código do centro de custo, apelido ou nome).');
  if (/^\d+$/.test(t)) {
    const o = obras.find((x) => x.id === Number(t));
    if (!o) throw falha(`Obra ${t} não encontrada entre os centros de custo com Tipo = Obra.`);
    return o;
  }
  const alvo = semAcento(t);
  const exatas = obras.filter((o) => [o.nome, o.centro.name, o.centro.apelido].some((n) => semAcento(n) === alvo));
  if (exatas.length === 1) return exatas[0];
  const achadas = obras.filter((o) => [o.nome, o.centro.name, o.centro.apelido].some((n) => semAcento(n).includes(alvo)));
  if (!achadas.length) throw falha(`Nenhuma obra com "${t}" no nome ou apelido. Use obras_carteira para ver a lista.`);
  if (achadas.length > 1) throw falha(`"${t}" corresponde a várias obras: ${achadas.map((o) => `${o.id} ${o.nome}`).join('; ')}. Seja mais específico ou use o código.`);
  return achadas[0];
}
const resolverObras = (obras, lista) => (lista && lista.length ? lista.map((t) => resolverObra(obras, t)) : null);

const localidade = (c) => {
  const cidade = String(c.cidade || '').trim();
  const uf = String(c.uf || '').trim().toUpperCase();
  return cidade ? (uf ? `${cidade} - ${uf}` : cidade) : 'Sem cidade';
};

// Etapa de hoje em texto curto ("Construção (mês 17 de 30)", "A iniciar", "Concluída", "Sem cronograma").
const etapaTexto = (o) => (o.situacao.tipo === 'etapa' ? `${o.situacao.etapa} (mês ${o.situacao.mes})` : o.situacao.texto);

// Uma coluna do avanço no formato das respostas (realizado, previsto, desvio em p.p., situação).
function colunaAvanco(col, { comPrevisto = true } = {}) {
  if (!col) return null;
  const desvio = comPrevisto && col.previsto !== null && col.realizado !== null ? col.realizado - col.previsto : null;
  return {
    realizado: pc(col.realizado),
    ...(comPrevisto
      ? {
          previsto: pc(col.previsto),
          desvio_pp: pc(desvio),
          situacao: desvio === null ? null : -desvio >= avanco.TOLERANCIA ? 'Abaixo do previsto' : 'Em dia',
        }
      : {}),
  };
}

// Previsto acumulado de uma curva do Prevision num dia.
const previstoEm = (curva, chave, dia) => (curva?.[chave]?.previsto ? avanco.ate100(valorEm(curva[chave].previsto, dia)) : null);
const realizadoEm = (curva, chave, dia) => {
  const s = curva ? avanco.seriesDa(curva, chave) : null;
  return s?.realizado ? avanco.ate100(valorEm(s.realizado, dia)) : null;
};

module.exports = {
  z,
  falha,
  r2,
  dataSchema,
  VISAO,
  br,
  brl,
  pc,
  pct,
  ppt,
  quando,
  isoDe,
  mesesEntre,
  diasEntre,
  somar,
  carregar,
  resolverObra,
  resolverObras,
  localidade,
  etapaTexto,
  colunaAvanco,
  previstoEm,
  realizadoEm,
  avanco,
};
