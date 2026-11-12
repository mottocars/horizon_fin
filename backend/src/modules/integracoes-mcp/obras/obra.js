const pool = require('../../../config/db');
const { ferramenta } = require('../dfc/tools/comum');
const { z, br, brl, pc, quando, isoDe, diasEntre, carregar, resolverObra, localidade, etapaTexto, colunaAvanco, previstoEm, realizadoEm, avanco } = require('./base');
const { periodosEntre, periodoDe } = require('../../dfc-avancos/periodosAvanco');

// obras_obra — tudo de uma obra, como o dono da empresa quer saber: cadastro (VGV, unidades, cidade,
// pilar, responsável), o cronograma inteiro e onde ela está hoje, o atraso da construção pela regra da
// empresa, as três curvas de avanço (hoje, no fim do mês e no fim da semana), o ritmo dos últimos meses
// com uma estimativa simples de término, os indicadores do Prevision, o contrato da Caixa (DCD) e as
// alterações de cronograma (versões gravadas e pendência).

const n = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Ritmo da curva (realizado por mês) nos últimos 3 meses fechados e a estimativa de quando chega a 100%
// se mantiver esse ritmo — conta simples, só para orientar (não é o planejamento da obra).
function ritmo(curva, chave, hoje) {
  const s = avanco.seriesDa(curva, chave);
  if (!s?.realizado) return null;
  const [a, m] = hoje.split('-').map(Number);
  const ini = new Date(Date.UTC(a, m - 4, 1)).toISOString().slice(0, 10);
  const fimMesPassado = new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10);
  const meses = periodosEntre('mensal', ini, fimMesPassado);
  const linhas = avanco.linhasDaCurva(curva, chave, meses, { visao: 'mensal', hoje }) || [];
  const valores = linhas.map((l) => l.realizadoNoPeriodo).filter((v) => v !== null);
  if (!valores.length) return null;
  const media = valores.reduce((x, y) => x + y, 0) / valores.length;
  const atual = realizadoEm(curva, chave, hoje) ?? 0;
  let estimativa = null;
  if (atual >= 99.95) estimativa = 'já em 100%';
  else if (media > 0.05) {
    const faltam = (100 - atual) / media;
    const alvo = new Date(Date.UTC(a, m - 1 + Math.ceil(faltam), 1)).toISOString().slice(0, 7);
    estimativa = `${String(pc(faltam)).replace('.', ',')} meses — por volta de ${alvo.slice(5, 7)}/${alvo.slice(0, 4)}`;
  } else estimativa = 'sem avanço nos últimos 3 meses: não dá para estimar';
  return {
    realizado_por_mes: Object.fromEntries(linhas.map((l) => [l.periodo, pc(l.realizadoNoPeriodo)])),
    media_mensal_ultimos_3_meses: pc(media),
    previsto_por_mes_mesmos_meses: s.previsto ? Object.fromEntries(linhas.map((l) => [l.periodo, pc(l.previstoNoPeriodo)])) : undefined,
    no_ritmo_atual_chega_a_100_em: estimativa,
  };
}

function previsionInfo(r) {
  if (!r) return null;
  return {
    idp: n(r.idp),
    atraso_dias_informado_pelo_prevision: n(r.delay),
    realizado_na_ultima_medicao_pct: r.realized != null ? pc(Number(r.realized) * 100) : null,
    previsto_na_ultima_medicao_pct: r.expected != null ? pc(Number(r.expected) * 100) : null,
    ultima_medicao: br(r.last_measurement),
    inicio: br(isoDe(r.start_at)),
    termino_previsto: br(isoDe(r.end_at)),
    dias_para_o_termino: r.days_to_end,
    atualizado_em: quando(r.atualizado_em),
  };
}

function dcdInfo(r, hoje) {
  if (!r) return null;
  const rotinaAtraso = isoDe(r.data_inicio_rotina_atraso_obra);
  return {
    contrato: r.numero_contrato,
    empreendimento_na_caixa: r.nome_empreendimento,
    situacao_do_pedido: r.situacao_pedido,
    assinatura: br(isoDe(r.data_assinatura)),
    inicio_da_obra: br(isoDe(r.data_inicio_obra)),
    termino_da_obra_original: br(isoDe(r.data_termino_obra_original)),
    termino_da_obra_atual: br(isoDe(r.data_termino_obra_atual)),
    prazo_da_obra_meses: { original: r.prazo_obra_original, atual: r.prazo_obra_atual },
    inicio_da_rotina_de_atraso_de_obra: br(rotinaAtraso),
    dias_ate_a_rotina_de_atraso: rotinaAtraso ? diasEntre(hoje, rotinaAtraso) : null,
    percentual_minimo_de_obra: n(r.percentual_minimo_obra),
    adiantamento_defasagem_obra: r.adiantamento_defasagem_obra,
    obra_executada_no_dcd_pct: n(r.percentual_obra_executada),
    parcelas_do_cronograma: r.quantidade_parcelas,
    unidades: { total: r.quantidade_unidades, financiadas: r.quantidade_unidades_financiadas, comercializadas: r.quantidade_unidades_comercializadas },
    custo_da_obra: brl(r.valor_custo_obra),
    orcamento_compra_e_venda: brl(r.orcamento_compra_venda),
    financiamento_pj: brl(r.valor_financiamento_pj),
    saldo_devedor_pj: brl(r.saldo_devedor_pj),
    garantia_de_termino_de_obra: brl(r.garantia_termino_obra),
    dcd_importado_em: quando(r.importado_em),
  };
}

const obraTool = {
  name: 'obras_obra',
  description:
    'Tudo sobre UMA obra (por código do centro de custo, apelido ou nome), como o dono da empresa quer saber: cadastro (nome no Sienge, apelido, cidade, pilar, responsável, ' +
    'faixa, VGV, unidades); o cronograma inteiro (cada etapa com início, fim e duração) e onde ela está hoje ("Construção, mês 17 de 30"); o atraso da construção pela Regra ' +
    'de Atraso da empresa; as três curvas de avanço — PLS (Caixa), Curva S de Obras (avanço real) e Curva S PLS (curva da PLS registrada no Prevision) — hoje, no fim do mês e ' +
    'no fim da semana, com os desvios e as diferenças entre elas; o ritmo dos últimos 3 meses e quando chega a 100% nesse ritmo; IDP, atraso em dias e última medição do ' +
    'Prevision; o contrato da Caixa (DCD: prazos original e atual, início da rotina de atraso de obra, unidades financiadas, custo, financiamento, saldo devedor); e as ' +
    'alterações do cronograma (últimas versões gravadas e alteração pendente).',
  inputSchema: { obra: z.string().describe('Código do centro de custo, apelido ou nome.') },
  handler: ferramenta(async (empresaId, args) => {
    const d = await carregar(empresaId, { visao: 'mensal' });
    const o = resolverObra(d.obras, args.obra);
    const { hoje } = d;
    const c = o.centro;
    const fimSemana = periodoDe('semanal', hoje).fim;

    const curvas = o.curva
      ? Object.fromEntries(
          [
            ['curva_s_de_obras', 'primaria'],
            ['curva_s_pls', 'secundaria'],
          ].map(([nome, chave]) => {
            if (!o.curva[chave]) return [nome, 'sem orçamento no Prevision'];
            const real = realizadoEm(o.curva, chave, hoje);
            const col = (prev) => colunaAvanco({ realizado: real, previsto: prev });
            return [
              nome,
              {
                realizado_hoje: pc(real),
                previsto_hoje: col(previstoEm(o.curva, chave, hoje)),
                previsto_fim_da_semana: col(previstoEm(o.curva, chave, fimSemana)),
                previsto_fim_do_mes: col(previstoEm(o.curva, chave, d.fimPeriodo)),
                ritmo: ritmo(o.curva, chave, hoje),
              },
            ];
          })
        )
      : null;
    const pls = o.curva?.pls ? { realizado: pc(realizadoEm(o.curva, 'pls', hoje)), medido_ate: br(o.curva.pls.ultima_liberacao), ritmo: ritmo(o.curva, 'pls', hoje) } : null;
    const real = (k) => (o.curva ? realizadoEm(o.curva, k, hoje) : null);
    const dif = (a, b) => (a !== null && b !== null ? pc(a - b) : null);

    // Alterações do cronograma desta obra nas versões gravadas (as 5 últimas).
    const { rows: versoes } = await pool.query(
      `SELECT v.numero, v.criado_em, v.observacao, u.nome AS por, alt
         FROM cronograma_versoes v
         LEFT JOIN usuarios u ON u.id = v.criado_por
         CROSS JOIN LATERAL jsonb_array_elements(v.alteracoes) alt
        WHERE v.empresa_id = $1 AND (alt->>'sienge_id')::int = $2
        ORDER BY v.numero DESC LIMIT 5`,
      [empresaId, o.id]
    );
    const etapaNome = new Map(d.etapas.map((e) => [String(e.id), e.descricao]));

    return {
      empresa: d.empresa,
      hoje: br(hoje),
      obra: {
        id: o.id,
        nome: o.nome,
        nome_no_sienge: c.name,
        status: c.status,
        localidade: localidade(c),
        pilar: o.extra.pilar || null,
        responsavel: o.extra.responsavel || null,
        faixa: o.extra.faixa || null,
        vgv: brl(c.valor_geral_vendas),
        unidades: c.numero_unidades ?? null,
        projeta_dfc: o.extra.projeta_dfc ?? null,
        codigo_prevision: o.extra.codigo_prevision || null,
        contrato_caixa: o.extra.codigo_contrato_caixa || null,
      },
      cronograma: {
        hoje: etapaTexto(o),
        etapas: o.segs.map((s) => ({
          etapa: s.etapa.descricao,
          inicio: br(s.inicio),
          fim: br(s.fim) || 'sem fim definido',
          duracao: s.duracao === null ? null : `${String(s.duracao).replace('.', ',')} ${s.etapa.tipo_duracao === 'ANOS' || (s.ultima && !s.etapa.tipo_duracao) ? 'anos' : 'meses'}`,
          quando: s.fim && s.fim < hoje ? 'concluída' : s.inicio > hoje ? 'futura' : 'em curso',
        })),
        etapas_sem_data: d.etapas.filter((e) => !o.segs.some((s) => s.etapa.id === e.id)).map((e) => e.descricao),
      },
      atraso_da_construcao: !d.atraso
        ? 'A empresa não tem Regra de Atraso da Construção configurada.'
        : o.atraso
          ? {
              regra: d.atraso.regra === 'FIXA' ? `fixa: ${d.atraso.meses} meses de construção` : 'planejamento: mês seguinte ao da curva S de base do Prevision em 100%',
              atraso_desde: br(o.atraso.desde),
              ate: br(o.atraso.ate),
              meses_em_atraso: o.atraso.meses,
              em_atraso_hoje: o.atrasadaHoje,
            }
          : 'Sem atraso pela regra (ou sem como medir: sem etapa de construção com fim, ou sem a curva de base do Prevision na regra de planejamento).',
      avanco: o.curva
        ? {
            pls_caixa: pls || 'sem PLS da Caixa (sem contrato Caixa no cadastro ou DCD não importado)',
            ...curvas,
            comparacoes_hoje_pp: {
              pls_caixa_menos_curva_s_de_obras: dif(real('pls'), real('primaria')),
              pls_caixa_menos_curva_s_pls: dif(real('pls'), real('secundaria')),
              curva_s_de_obras_menos_curva_s_pls: dif(real('primaria'), real('secundaria')),
            },
            finalizada: o.cards?.finalizada || false,
          }
        : 'Sem orçamento no Prevision: a obra não aparece no Avanço das Obras.',
      prevision: o.curva ? { curva_s_de_obras: previsionInfo(o.prevision.obras), curva_s_pls: previsionInfo(o.prevision.pls) } : null,
      caixa_dcd: o.dcd ? dcdInfo(o.dcd, hoje) : o.extra.codigo_contrato_caixa ? `Contrato ${o.extra.codigo_contrato_caixa} no cadastro, mas o DCD dele não foi importado.` : 'Sem contrato Caixa no cadastro.',
      alteracao_pendente: o.pendencia
        ? {
            por: o.pendencia.por,
            em: quando(o.pendencia.atualizado_em),
            novos_inicios: Object.fromEntries(Object.entries(o.pendencia.datas || {}).map(([k, v]) => [etapaNome.get(k) || k, v ? br(v) : 'apagar a etapa'])),
            novo_termino: o.pendencia.termino_alterado ? br(isoDe(o.pendencia.data_termino)) : undefined,
            observacao: 'Só entra no cronograma quando uma nova versão for gravada (Operações › Cronogramas Obras).',
          }
        : null,
      ultimas_versoes_com_esta_obra: versoes.map((v) => ({
        versao: v.numero,
        gravada_em: quando(v.criado_em),
        por: v.por,
        observacao: v.observacao,
        mudancas: (v.alt.etapas || [])
          .flatMap((m) => {
            const out = [];
            if (m.inicio_antes !== m.inicio_depois) out.push(`${m.etapa}: início ${br(m.inicio_antes) || '—'} → ${br(m.inicio_depois) || '—'}`);
            if (m.ultima && m.fim_antes !== m.fim_depois) out.push(`${m.etapa}: término ${br(m.fim_antes) || '—'} → ${br(m.fim_depois) || '—'}`);
            return out;
          }),
      })),
      leitura:
        'PLS (Caixa) = avanço medido pela Caixa na Planilha de Levantamento de Serviços (só parcelas liberadas). Curva S de Obras = avanço real da obra (Prevision). ' +
        'Curva S PLS = curva da PLS registrada pela empresa no Prevision. PLS Caixa − Curva S de Obras negativo: a obra está à frente do que a Caixa mediu.',
      fim_da_semana: br(fimSemana),
      fim_do_mes: br(d.fimPeriodo),
    };
  }),
};

module.exports = { obraTool };
