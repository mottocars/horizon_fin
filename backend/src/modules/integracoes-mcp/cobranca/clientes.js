const pool = require('../../../config/db');
const { ferramenta } = require('../dfc/tools/comum');
const clustersService = require('../../cobranca-clusters/cobrancaClusters.service');
const gestaoParcelas = require('../../gestao-parcelas/gestaoParcelas.service');
const distribuicao = require('../../regua-cobranca/distribuicao.service');
const { INDICADOR_NOME } = require('./configuracao');
const {
  z,
  r2,
  CLUSTER_NOME,
  CANAL_NOME,
  MOTIVO_DISTRIBUICAO,
  STATUS_PARCELA,
  quando,
  horaLocal,
  isoDe,
  resolverCliente,
  resolverCentros,
} = require('./base');

// cobranca_clusters (aba Clusters de Clientes) e cobranca_cliente (tudo sobre um cliente).

const ORDEM = ['bom', 'duvidoso', 'mau', 'novo'];
const MOTIVO_CLUSTER = {
  score: 'pelo score',
  regra_dura: 'regra dura (parcela em aberto vencida além do limite) — Mau pagador sem olhar o score',
  novo_cliente: 'poucas parcelas vencidas na janela (abaixo do mínimo) — Novo cliente, sem score',
};

const clustersTool = {
  name: 'cobranca_clusters',
  description:
    'Aba Clusters de Clientes: quantos clientes e quanto em aberto (total, vencido, no mês, a vencer) em cada cluster (Novo, Bom, Duvidoso, Mau), ' +
    'por centro de custo, quando foi o último recálculo e quando é o próximo, e o que mudou na última competência (quem subiu, desceu, entrou ' +
    'na regra dura, ficou bloqueado pela trava). Com `cluster`, lista os clientes daquele cluster com score e saldo vencido. Filtro opcional por centros.',
  inputSchema: {
    cluster: z.enum(['novo', 'bom', 'duvidoso', 'mau']).optional().describe('Lista os clientes deste cluster.'),
    centros: z.array(z.string()).optional().describe('Centros de custo (id ou parte do nome).'),
    busca: z.string().optional().describe('Parte do nome do cliente (na lista de um cluster).'),
    limite: z.coerce.number().int().min(1).max(200).default(50).describe('Máximo de clientes na lista.'),
  },
  handler: ferramenta(async (empresaId, { cluster, centros, busca, limite = 50 }) => {
    const costCenterIds = await resolverCentros(empresaId, centros);
    const [resumo, porCentro, recalculo, { rows: hist }] = await Promise.all([
      clustersService.getResumo(empresaId, { costCenterIds }),
      clustersService.getResumoPorCentroCusto(empresaId, { costCenterIds }),
      clustersService.getRecalculoInfo(empresaId),
      pool.query(
        `SELECT h.mes_referencia::text AS mes, h.cluster_anterior, h.cluster_novo, h.regra_dura_disparada, h.subiu_bloqueado_por_trava, COUNT(*)::int AS n
           FROM cobranca_clientes_clusters_historico h
          WHERE h.empresa_id = $1 AND h.mes_referencia = (SELECT MAX(mes_referencia) FROM cobranca_clientes_clusters_historico WHERE empresa_id = $1)
          GROUP BY 1, 2, 3, 4, 5`,
        [empresaId]
      ),
    ]);
    const mov = {};
    let regraDura = 0;
    let travados = 0;
    for (const r of hist) {
      if (r.cluster_anterior !== r.cluster_novo) {
        const k = `${CLUSTER_NOME[r.cluster_anterior] || 'sem cluster (1º cálculo)'} → ${CLUSTER_NOME[r.cluster_novo]}`;
        mov[k] = (mov[k] || 0) + r.n;
      }
      if (r.regra_dura_disparada) regraDura += r.n;
      if (r.subiu_bloqueado_por_trava) travados += r.n;
    }
    const resp = {
      ultimo_recalculo: recalculo.ultimoRecalculo ? recalculo.ultimoRecalculo.replace('T', ' ') : 'nunca',
      proximo_recalculo: quando(recalculo.proximoRecalculo) || 'sem agendamento',
      total_clientes: resumo.total_clientes,
      por_cluster: ORDEM.map((c) => ({
        cluster: CLUSTER_NOME[c],
        clientes: resumo.clusters[c]?.total_clientes ?? 0,
        saldo_aberto: r2(resumo.clusters[c]?.saldo_aberto ?? 0),
        saldo_vencido: r2(resumo.clusters[c]?.saldo_vencido ?? 0),
        saldo_vence_no_mes: r2(resumo.clusters[c]?.saldo_no_mes ?? 0),
        saldo_a_vencer_depois: r2(resumo.clusters[c]?.saldo_a_vencer ?? 0),
      })),
      observacao_saldos:
        'Saldos = soma do saldo corrigido de TODAS as parcelas CO em aberto do cliente (de todos os centros, sem filtro de tipo de pagamento). Por centro, o cliente entra se tem qualquer parcela no centro, e conta o saldo dele inteiro.',
      ultima_competencia: hist.length
        ? {
            mes_referencia: hist[0].mes,
            mudancas_de_cluster: Object.entries(mov).map(([de_para, clientes]) => ({ de_para, clientes })),
            clientes_na_regra_dura: regraDura,
            clientes_que_subiriam_mas_ficaram_pela_trava: travados,
          }
        : null,
      por_centro: porCentro.map((c) => ({
        centro: `${c.cost_center_id} ${c.cost_center_name}`,
        clientes: c.total_clientes,
        saldo_vencido: r2(c.saldo_vencido),
        saldo_vence_no_mes: r2(c.saldo_no_mes),
        por_cluster: Object.fromEntries(ORDEM.map((k) => [CLUSTER_NOME[k], c.clusters[k] || 0])),
      })),
    };
    if (cluster) {
      const lista = await clustersService.listClientesPorCluster(empresaId, cluster, { search: busca || '', page: 1, limit: limite, costCenterIds });
      resp.clientes_do_cluster = {
        cluster: CLUSTER_NOME[cluster],
        total: lista.pagination.total,
        mostrando: lista.data.length,
        clientes: lista.data.map((c) => ({
          client_id: c.client_id,
          nome: c.client_name,
          score: c.score == null ? null : Number(c.score),
          motivo: MOTIVO_CLUSTER[c.motivo_tipo] || c.motivo_tipo,
          saldo_vencido: r2(c.saldo_vencido),
        })),
      };
    }
    return resp;
  }),
};

// Score explicado: cada indicador com valor, nota, peso e pontos (o mesmo do "Testar com um cliente").
function explicarScore(breakdown) {
  if (!breakdown?.indicadores) return null;
  const ctx = breakdown.contexto || {};
  return {
    score: ctx.score == null ? null : r2(ctx.score),
    cluster_pelo_calculo: CLUSTER_NOME[ctx.cluster_bruto] || ctx.cluster_bruto,
    motivo_do_calculo: MOTIVO_CLUSTER[ctx.motivo_bruto] || ctx.motivo_bruto,
    indicadores: breakdown.indicadores.map((i) => ({
      indicador: INDICADOR_NOME[i.indicador] || i.indicador,
      valor: r2(i.valor_bruto),
      nota_0_em: i.nota_0,
      nota_100_em: i.nota_100,
      nota: r2(i.nota),
      peso: i.peso,
      pontos: r2(i.pontos),
    })),
    regras_usadas: {
      parcelas_vencidas_na_janela: ctx.qtd_parcelas_vencidas,
      pagas_dentro_da_tolerancia: ctx.parcelas_pagas_em_dia,
      minimo_de_parcelas: ctx.minimo_parcelas,
      corte_bom: ctx.corte_bom_pagador,
      corte_duvidoso: ctx.corte_pagador_duvidoso,
      tolerancia_dias: ctx.tolerancia_dias,
      janela_meses: ctx.janela_observacao_meses,
      gatilho_reincidencia_dias: ctx.gatilho_reincidencia_dias,
      limite_regra_dura_dias: ctx.dias_vencidos_regua_cobranca,
      parcelas_seguidas_em_dia: ctx.streak_parcelas_em_dia,
      trava_de_subida: ctx.trava_subida_parcelas,
    },
    regra_dura: breakdown.regra_dura_detalhe
      ? {
          parcelas_acima_do_limite: breakdown.regra_dura_detalhe.length,
          mais_atrasadas: breakdown.regra_dura_detalhe
            .slice(0, 10)
            .map((p) => ({ titulo: p.bill_id, parcela: p.installment_id, vencimento: isoDe(p.due_date), dias_atraso: p.dias_atraso })),
        }
      : null,
    subiu_bloqueado_pela_trava: breakdown.subiu_bloqueado_por_trava,
  };
}

const clienteTool = {
  name: 'cobranca_cliente',
  description:
    'Tudo sobre um cliente na cobrança: cluster atual e por quê (score com cada indicador — valor, nota, peso, pontos —, regra dura, trava ' +
    'de subida), histórico de cluster mês a mês, saldo (aberto, vencido, no mês, a vencer), telefone/e-mail usados no envio, flag Comunicar, ' +
    'as parcelas do universo da cobrança com status, etapa e responsável, dono na carteira (Distribuição automática), os dias em que foi ' +
    'distribuído e para quem, e os contatos registrados (WhatsApp, e-mail, ligação, observação) e envios que falharam. Aceita client_id ou parte do nome.',
  inputSchema: {
    cliente: z.string().describe('client_id do Sienge ou parte do nome.'),
    contatos: z.coerce.number().int().min(0).max(300).default(60).describe('Máximo de registros de contato (mais recentes).'),
  },
  handler: ferramenta(async (empresaId, { cliente, contatos = 60 }) => {
    const c = await resolverCliente(empresaId, cliente);
    const id = c.client_id;
    const [detalhe, linhas, donos, { rows: cad }, { rows: com }, { rows: dist }, { rows: regs }, { rows: falhas }] = await Promise.all([
      clustersService.getClienteDetalhe(empresaId, id).catch((e) => ({ erro: e.message })),
      gestaoParcelas.buscarParcelasComCluster(empresaId, { search: c.nome || '' }),
      distribuicao.mapaDonosCarteira(empresaId),
      pool.query(
        `SELECT sc.name, sc.email, (SELECT number FROM sie_customers_phones p WHERE p.customer_id = sc.id AND p.empresa_id = sc.empresa_id ORDER BY p.main DESC NULLS LAST, p.id LIMIT 1) AS telefone
           FROM sie_customers sc WHERE sc.empresa_id = $1 AND sc.id = $2`,
        [empresaId, id]
      ),
      pool.query('SELECT comunicar, atualizado_em FROM sie_customers_comunicar WHERE empresa_id = $1 AND client_id = $2', [empresaId, id]),
      pool.query(
        `SELECT d.data::text AS data, u.nome, d.motivo, d.faixa, d.valor::float, d.titulos FROM regua_cobranca_distribuicao_itens d
           JOIN usuarios u ON u.id = d.usuario_id WHERE d.empresa_id = $1 AND d.client_id = $2 ORDER BY d.data DESC LIMIT 120`,
        [empresaId, id]
      ),
      pool.query(
        `SELECT r.data_registro::text AS data, r.canal, r.tipo, r.descricao, u.nome AS quem, r.bill_id::text, r.installment_id::text
           FROM regua_cobranca_historico_registros r
           JOIN sie_income si ON si.empresa_id = r.empresa_id AND si.bill_id = r.bill_id AND si.installment_id = r.installment_id
           LEFT JOIN usuarios u ON u.id = r.usuario_id
          WHERE r.empresa_id = $1 AND si.client_id = $2 ORDER BY r.data_registro DESC, r.id DESC LIMIT $3`,
        [empresaId, id, contatos]
      ),
      pool.query(
        `SELECT f.data_registro::text AS data, f.canal, f.mensagem_erro, f.bill_id::text, f.installment_id::text
           FROM regua_cobranca_envios_falhos f
           JOIN sie_income si ON si.empresa_id = f.empresa_id AND si.bill_id = f.bill_id AND si.installment_id = f.installment_id
          WHERE f.empresa_id = $1 AND si.client_id = $2 ORDER BY f.data_registro DESC LIMIT 50`,
        [empresaId, id]
      ),
    ]);
    const minhas = linhas.filter((l) => String(l.client_id) === String(id));
    const porStatus = {};
    for (const l of minhas) {
      const s = (porStatus[STATUS_PARCELA[l.status]] ??= { parcelas: 0, saldo_aberto: 0 });
      s.parcelas++;
      s.saldo_aberto = r2(s.saldo_aberto + l.saldo_aberto);
    }
    const dono = donos?.get(String(id));
    const temCluster = !detalhe.erro;
    return {
      cliente: { client_id: id, nome: cad[0]?.name || c.nome, telefone_do_envio: cad[0]?.telefone || 'SEM telefone', email_do_envio: cad[0]?.email || 'SEM e-mail' },
      comunicar: com[0] ? (com[0].comunicar ? 'ligado' : `DESLIGADO desde ${horaLocal(com[0].atualizado_em)} — fora de toda a cobrança`) : 'ligado (padrão)',
      cluster: temCluster
        ? {
            atual: CLUSTER_NOME[detalhe.cliente.cluster],
            motivo: MOTIVO_CLUSTER[detalhe.cliente.motivo_tipo] || detalhe.cliente.motivo_tipo,
            score: detalhe.cliente.score == null ? null : Number(detalhe.cliente.score),
            competencia: isoDe(detalhe.cliente.mes_referencia),
            calculado_em: horaLocal(detalhe.cliente.calculado_em),
            parcelas_seguidas_em_dia: detalhe.cliente.parcelas_em_dia_seguidas,
            explicacao: explicarScore(detalhe.breakdown),
          }
        : `Sem cluster calculado (vale como Novo cliente): ${detalhe.erro}`,
      historico_de_cluster: temCluster
        ? detalhe.historico.map((h) => ({
            competencia: isoDe(h.mes_referencia),
            de: CLUSTER_NOME[h.cluster_anterior] || '—',
            para: CLUSTER_NOME[h.cluster_novo],
            score: h.score == null ? null : Number(h.score),
            regra_dura: h.regra_dura_disparada,
            bloqueado_pela_trava: h.subiu_bloqueado_por_trava,
            calculado_em: horaLocal(h.criado_em),
          }))
        : [],
      saldos: temCluster ? Object.fromEntries(Object.entries(detalhe.saldos).map(([k, v]) => [k, r2(v)])) : null,
      parcelas_na_cobranca: {
        observacao: 'Só as do universo da cobrança (qualquer origem, centro com Lançamento, tipo de pagamento escolhido); parcela rateada aparece 1 vez por centro.',
        resumo_por_status: porStatus,
        em_aberto: minhas
          .filter((l) => l.saldo_aberto !== 0)
          .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
          .slice(0, 80)
          .map((l) => ({
            centro: l.cost_center_name,
            titulo: l.bill_id,
            parcela: l.installment_id,
            numero: l.installment_number,
            vencimento: isoDe(l.due_date),
            tipo_pagamento: (l.payment_term_description || '').trim(),
            status: STATUS_PARCELA[l.status],
            etapa_atual: l.etapa_nome || 'antes da 1ª etapa (fora da cobrança ativa)',
            responsavel: l.etapa_responsavel_nome,
            saldo: r2(l.saldo_aberto),
          })),
      },
      carteira: donos ? (dono ? `Na carteira de ${dono.nome}` : 'Sem dono na carteira (será "novo" na próxima distribuição)') : 'Modo "Responsável por etapa" (sem carteira)',
      dias_distribuido: dist.map((d) => ({ data: d.data, atendente: d.nome, motivo: MOTIVO_DISTRIBUICAO[d.motivo] || d.motivo, faixa: d.faixa, valor_no_dia: r2(d.valor), titulos: d.titulos })),
      contatos: regs.map((r) => ({
        data: r.data,
        canal: CANAL_NOME[r.canal] || 'Observação',
        quem: r.quem || (r.tipo === 'automatico' ? 'envio automático' : '—'),
        parcela: `${r.bill_id}/${r.installment_id}`,
        texto: (r.descricao || '').slice(0, 400),
      })),
      envios_que_falharam: falhas.map((f) => ({ data: f.data, canal: CANAL_NOME[f.canal], parcela: `${f.bill_id}/${f.installment_id}`, erro: f.mensagem_erro })),
    };
  }),
};

module.exports = { clustersTool, clienteTool };
