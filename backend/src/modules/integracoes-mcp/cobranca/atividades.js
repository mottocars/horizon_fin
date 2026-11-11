const pool = require('../../../config/db');
const { ferramenta } = require('../dfc/tools/comum');
const { z, dataSchema, CLUSTER_NOME, CANAL_NOME, quando, horaLocal, periodo, resolverUsuario } = require('./base');

// cobranca_o_que_aconteceu — tudo o que ficou registrado na cobrança num período: contatos (por pessoa,
// canal e dia, e os últimos com o texto), envios que falharam, distribuições e mudanças da distribuição,
// recálculos de cluster (movimentos), versões do Motor de Risco, alterações de etapas, templates, tipo de
// comunicação, horários, tipos de pagamento e flag Comunicar, e as execuções das rotinas do Monitor.
// TIMESTAMP sem fuso = hora do relógio do banco (Brasília) — comparado direto com as datas; TIMESTAMPTZ
// é convertido para America/Sao_Paulo.

const ROTINAS = ['cobranca_clientes', 'cobranca_base', 'cobranca_clusters', 'cobranca_distribuicao'];

const atividadesTool = {
  name: 'cobranca_o_que_aconteceu',
  description:
    '"O que aconteceu na cobrança?" num período: contatos registrados (WhatsApp, e-mail, ligação, observação) por pessoa, canal e dia, e ' +
    'os mais recentes com cliente, parcela e texto; envios de WhatsApp/e-mail que falharam e por quê; distribuições do dia e mudanças da ' +
    'distribuição (atendente entrou, saiu, pausou, foi substituído, redistribuição); recálculos de cluster (quantos clientes, quem mudou de ' +
    'cluster); versões novas do Motor de Risco; etapas da régua, templates, tipo de comunicação, horários e tipos de pagamento alterados; ' +
    'clientes com Comunicar desligado/religado; e cada execução das rotinas da cobrança no Monitor (sucesso, erro, resumo). ' +
    'Sem datas = do dia 1º do mês até hoje. `atendente` filtra os contatos.',
  inputSchema: {
    data_inicio: dataSchema.optional(),
    data_fim: dataSchema.optional(),
    atendente: z.string().optional().describe('Só os contatos deste usuário (id ou parte do nome).'),
    ultimos_contatos: z.coerce.number().int().min(0).max(300).default(40).describe('Quantos contatos listar com o texto (mais recentes).'),
  },
  handler: ferramenta(async (empresaId, { data_inicio, data_fim, atendente, ultimos_contatos = 40 }) => {
    const p = await periodo(empresaId, { data_inicio, data_fim });
    const usuario = await resolverUsuario(empresaId, atendente);
    const pr = [empresaId, p.de, p.ate];
    const filtroU = usuario ? ` AND r.usuario_id = ${Number(usuario.id)}` : '';
    const q = (sql, params = pr) => pool.query(sql, params).then((r) => r.rows);
    const [porPessoa, porDia, ultimos, falhas, logDist, distDia, recalc, movs, versoes, etapas, templates, comunicacao, horarios, tipos, comunicar, execucoes] =
      await Promise.all([
        q(
          `SELECT COALESCE(u.nome, CASE WHEN r.tipo = 'automatico' THEN 'envio automático' ELSE '(sem usuário)' END) AS quem, COALESCE(r.canal, 'observacao') AS canal,
                  COUNT(*)::int AS n, COUNT(DISTINCT r.bill_id || '/' || r.installment_id)::int AS parcelas
             FROM regua_cobranca_historico_registros r LEFT JOIN usuarios u ON u.id = r.usuario_id
            WHERE r.empresa_id = $1 AND r.data_registro BETWEEN $2 AND $3${filtroU} GROUP BY 1, 2 ORDER BY 1, 2`
        ),
        q(
          `SELECT r.data_registro::text AS data, COUNT(*)::int AS n FROM regua_cobranca_historico_registros r
            WHERE r.empresa_id = $1 AND r.data_registro BETWEEN $2 AND $3${filtroU} GROUP BY 1 ORDER BY 1`
        ),
        q(
          `SELECT r.data_registro::text AS data, r.criado_em, COALESCE(r.canal, 'observacao') AS canal, r.tipo, u.nome AS quem, r.descricao,
                  r.bill_id::text AS titulo, r.installment_id::text AS parcela,
                  (SELECT si.client_id || ' ' || si.client_name FROM sie_income si WHERE si.empresa_id = r.empresa_id AND si.bill_id = r.bill_id AND si.installment_id = r.installment_id LIMIT 1) AS cliente
             FROM regua_cobranca_historico_registros r LEFT JOIN usuarios u ON u.id = r.usuario_id
            WHERE r.empresa_id = $1 AND r.data_registro BETWEEN $2 AND $3${filtroU}
            ORDER BY r.data_registro DESC, r.id DESC LIMIT ${Number(ultimos_contatos)}`
        ),
        q(
          `SELECT f.data_registro::text AS data, f.canal, f.mensagem_erro, f.criado_em, f.bill_id::text AS titulo, f.installment_id::text AS parcela,
                  (SELECT si.client_id || ' ' || si.client_name FROM sie_income si WHERE si.empresa_id = f.empresa_id AND si.bill_id = f.bill_id AND si.installment_id = f.installment_id LIMIT 1) AS cliente
             FROM regua_cobranca_envios_falhos f WHERE f.empresa_id = $1 AND f.data_registro BETWEEN $2 AND $3 ORDER BY f.data_registro DESC LIMIT 100`
        ),
        q(
          `SELECT l.acao, l.descricao, l.criado_em, u.nome FROM regua_cobranca_distribuicao_log l LEFT JOIN usuarios u ON u.id = l.usuario_id
            WHERE l.empresa_id = $1 AND (l.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3 ORDER BY l.criado_em`
        ),
        q(
          `SELECT d.data::text AS data, u.nome, COUNT(*)::int AS clientes, SUM(d.valor)::float AS valor FROM regua_cobranca_distribuicao_itens d
             JOIN usuarios u ON u.id = d.usuario_id WHERE d.empresa_id = $1 AND d.data BETWEEN $2 AND $3 GROUP BY 1, 2 ORDER BY 1, 2`
        ),
        q(
          `SELECT h.criado_em::date::text AS dia, h.mes_referencia::text AS competencia, u.nome, COUNT(*)::int AS clientes, MAX(h.criado_em) AS em
             FROM cobranca_clientes_clusters_historico h LEFT JOIN usuarios u ON u.id = h.criado_por_usuario_id
            WHERE h.empresa_id = $1 AND h.criado_em::date BETWEEN $2 AND $3 GROUP BY 1, 2, 3 ORDER BY 1`
        ),
        q(
          `SELECT h.cluster_anterior, h.cluster_novo, COUNT(*)::int AS n, SUM(CASE WHEN h.subiu_bloqueado_por_trava THEN 1 ELSE 0 END)::int AS travados
             FROM cobranca_clientes_clusters_historico h
            WHERE h.empresa_id = $1 AND h.criado_em::date BETWEEN $2 AND $3 AND h.cluster_anterior IS DISTINCT FROM h.cluster_novo
            GROUP BY 1, 2 ORDER BY 3 DESC`
        ),
        q(
          `SELECT v.versao, v.criado_em, u.nome FROM motor_risco_versoes v LEFT JOIN usuarios u ON u.id = v.criado_por_usuario_id
            WHERE v.empresa_id = $1 AND v.criado_em::date BETWEEN $2 AND $3 ORDER BY v.versao`
        ),
        q(
          `SELECT e.cluster, e.nome, e.dias, e.ativa, e.rotina_habilitada, e.criado_em, e.atualizado_em FROM regua_cobranca_etapas e
            WHERE e.empresa_id = $1 AND (e.atualizado_em::date BETWEEN $2 AND $3 OR e.criado_em::date BETWEEN $2 AND $3) ORDER BY e.atualizado_em`
        ),
        q(
          `SELECT t.nome, t.criado_em, t.atualizado_em FROM comunicacao_templates t
            WHERE t.empresa_id = $1 AND (t.atualizado_em::date BETWEEN $2 AND $3 OR t.criado_em::date BETWEEN $2 AND $3) ORDER BY t.atualizado_em`
        ),
        q(`SELECT tipo, atualizado_em FROM regua_cobranca_comunicacao_automatica WHERE empresa_id = $1 AND atualizado_em::date BETWEEN $2 AND $3`),
        q(`SELECT cluster, to_char(horario, 'HH24:MI') AS horario, atualizado_em FROM regua_cobranca_horario_disparo WHERE empresa_id = $1 AND atualizado_em::date BETWEEN $2 AND $3`),
        q(
          `SELECT tp.descricao, tp.criado_em, u.nome FROM regua_cobranca_tipos_pagamento tp LEFT JOIN usuarios u ON u.id = tp.criado_por
            WHERE tp.empresa_id = $1 AND (tp.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3`
        ),
        q(
          `SELECT c.client_id::text, c.comunicar, c.atualizado_em, (SELECT MAX(client_name) FROM sie_income si WHERE si.empresa_id = c.empresa_id AND si.client_id = c.client_id) AS nome
             FROM sie_customers_comunicar c WHERE c.empresa_id = $1 AND c.atualizado_em::date BETWEEN $2 AND $3 ORDER BY c.atualizado_em`
        ),
        q(
          `SELECT e.rotina, e.origem, e.status, e.iniciado_em, e.finalizado_em, e.resumo, e.erro, u.nome
             FROM monitor_integracoes_execucoes e LEFT JOIN usuarios u ON u.id = e.usuario_id
            WHERE e.empresa_id = $1 AND e.rotina = ANY($4) AND (e.iniciado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3
            ORDER BY e.iniciado_em`,
          [...pr, ROTINAS]
        ),
      ]);
    const contatos = {};
    for (const r of porPessoa) {
      const c = (contatos[r.quem] ??= { total: 0, parcelas_tocadas: 0 });
      c[CANAL_NOME[r.canal] || 'Observação'] = r.n;
      c.total += r.n;
      c.parcelas_tocadas += r.parcelas;
    }
    return {
      periodo: { de: p.de, ate: p.ate },
      observacao:
        'Contatos = registros gravados no histórico das parcelas (inclusive os envios pelo botão). Registro desmarcado na Rotina é apagado e não aparece aqui. "parcelas_tocadas" soma por canal (a mesma parcela pode contar em mais de um).',
      contatos_por_pessoa: contatos,
      contatos_por_dia: porDia,
      ultimos_contatos: ultimos.map((r) => ({
        data: r.data,
        registrado_em: horaLocal(r.criado_em),
        canal: CANAL_NOME[r.canal] || 'Observação',
        quem: r.quem || (r.tipo === 'automatico' ? 'envio automático' : '—'),
        cliente: r.cliente,
        parcela: `${r.titulo}/${r.parcela}`,
        texto: (r.descricao || '').slice(0, 300),
      })),
      envios_que_falharam: falhas.map((f) => ({ data: f.data, tentativa_em: horaLocal(f.criado_em), canal: CANAL_NOME[f.canal], cliente: f.cliente, parcela: `${f.titulo}/${f.parcela}`, erro: f.mensagem_erro })),
      distribuicao: {
        dias: distDia.map((d) => ({ data: d.data, atendente: d.nome, clientes: d.clientes, valor: Math.round(d.valor * 100) / 100 })),
        mudancas: logDist.map((l) => ({ quando: quando(l.criado_em), acao: l.acao, por: l.nome || 'Monitor (agendado)', descricao: l.descricao })),
      },
      clusters: {
        recalculos: recalc.map((r) => ({ dia: r.dia, competencia: r.competencia, clientes: r.clientes, por: r.nome || 'Monitor (agendado)', ultimo_em: horaLocal(r.em) })),
        mudancas_de_cluster: movs.map((m) => ({
          de: CLUSTER_NOME[m.cluster_anterior] || 'sem cluster (1º cálculo)',
          para: CLUSTER_NOME[m.cluster_novo],
          clientes: m.n,
        })),
        observacao: 'Recalcular de novo na mesma competência sobrescreve a linha do mês: o movimento é sempre em relação ao cluster que vigorava antes do 1º recálculo daquela competência.',
      },
      motor_risco_versoes_novas: versoes.map((v) => ({ versao: v.versao, em: horaLocal(v.criado_em), por: v.nome })),
      configuracao_alterada: {
        etapas: etapas.map((e) => ({
          etapa: `${CLUSTER_NOME[e.cluster]} · ${e.nome || '(sem nome)'} ${e.dias == null ? '' : `D${e.dias >= 0 ? '+' : ''}${e.dias}`}`.trim(),
          criada_em: horaLocal(e.criado_em),
          alterada_em: horaLocal(e.atualizado_em),
          hoje: `${e.ativa ? 'ativa' : 'inativa'}${e.rotina_habilitada ? ', na Rotina' : ''}`,
        })),
        templates: templates.map((t) => ({ template: t.nome, criado_em: horaLocal(t.criado_em), alterado_em: horaLocal(t.atualizado_em) })),
        tipo_comunicacao: comunicacao.map((c) => ({ agora: c.tipo, alterado_em: horaLocal(c.atualizado_em) })),
        horarios_e_conexoes: horarios.map((h) => ({ cluster: CLUSTER_NOME[h.cluster], horario: h.horario, alterado_em: horaLocal(h.atualizado_em) })),
        tipos_de_pagamento_incluidos: tipos.map((t) => ({ tipo: t.descricao, em: quando(t.criado_em), por: t.nome })),
        clientes_comunicar_alterado: comunicar.map((c) => ({ cliente: `${c.client_id} ${c.nome || ''}`.trim(), agora: c.comunicar ? 'Comunicar ligado' : 'Comunicar DESLIGADO', em: horaLocal(c.atualizado_em) })),
        observacao:
          'Só a data da última alteração fica gravada (etapas, templates, horários): o sistema não guarda o valor anterior nem quem alterou, exceto nas versões do Motor de Risco e no log da distribuição. Tipos de pagamento: a tela regrava a lista inteira a cada movimento, então "incluído em" é a última gravação.',
      },
      monitor: execucoes.map((e) => ({
        rotina: e.rotina,
        iniciou: quando(e.iniciado_em),
        terminou: quando(e.finalizado_em),
        origem: e.origem,
        por: e.nome,
        status: e.status,
        resumo: e.resumo,
        erro: e.erro,
      })),
    };
  }),
};

module.exports = { atividadesTool };
