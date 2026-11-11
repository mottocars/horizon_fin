const pool = require('../../../config/db');
const { ferramenta } = require('../dfc/tools/comum');
const rotinas = require('../../rotinas/rotinas.service');
const historico = require('../../regua-cobranca-historico/historicoCliente.service');
const distribuicao = require('../../regua-cobranca/distribuicao.service');
const { getComunicacaoAutomatica, getLimiteVigente } = require('../../regua-cobranca/reguaCobranca.service');
const {
  z,
  falha,
  r2,
  dataSchema,
  CLUSTER_NOME,
  CANAL_NOME,
  MOTIVO_DISTRIBUICAO,
  STATUS_PARCELA,
  isoDe,
  somarDias,
  diasEntre,
  hoje,
  resolverUsuario,
  resolverCentros,
} = require('./base');

// cobranca_rotina (aba Rotinas, visão "Todos os responsáveis") e cobranca_parcela (a vida de uma parcela
// na régua: cada etapa, o dono no dia, o que foi feito e o que faltou).

const CANAIS = ['whatsapp', 'email', 'ligacao'];

function statusCanal(item, canal) {
  if (!item[`canal_${canal}`]) return null;
  const feito = canal === 'whatsapp' ? item.whatsapp_enviado : canal === 'email' ? item.email_enviado : item.ligacao_realizada;
  if (feito) return 'feito';
  if (item[`${canal}_erro`]) return 'erro';
  return 'pendente';
}

const rotinaTool = {
  name: 'cobranca_rotina',
  description:
    'A Rotina de Cobrança (aba Rotinas, visão de todos os responsáveis) de um dia ou período: as tarefas de cada atendente (parcela que entrou ' +
    'numa etapa da régua naquele dia), por canal feito / pendente / erro de envio, com totais por atendente (tarefas, clientes, valor, % feito) e, ' +
    'se pedir, a lista das tarefas. Mostra se o dono veio da distribuição gravada, da previsão pela carteira ou do responsável da etapa. ' +
    'Sem datas = hoje. Atenção: dias passados são recalculados com a base e a régua de hoje (parcela já paga some).',
  inputSchema: {
    data_inicio: dataSchema.optional().describe('AAAA-MM-DD (padrão: hoje).'),
    data_fim: dataSchema.optional().describe('AAAA-MM-DD (padrão: igual ao início).'),
    atendente: z.string().optional().describe('Só deste atendente (id ou parte do nome).'),
    centros: z.array(z.string()).optional().describe('Centros de custo (id ou parte do nome).'),
    listar: z.enum(['nada', 'pendentes', 'todas']).default('pendentes').describe('Lista de tarefas a trazer (padrão: só as com algo pendente ou com erro).'),
    limite: z.coerce.number().int().min(1).max(500).default(150).describe('Máximo de tarefas na lista.'),
  },
  handler: ferramenta(async (empresaId, { data_inicio, data_fim, atendente, centros, listar = 'pendentes', limite = 150 }) => {
    const h = await hoje(empresaId);
    const de = data_inicio || h;
    const ate = data_fim || data_inicio || h;
    if (ate < de) throw falha('A data final precisa ser igual ou depois da inicial.');
    if (diasEntre(de, ate) > 61) throw falha('Período grande demais para a Rotina: no máximo 62 dias por consulta.');
    const [usuario, costCenterIds, { tipo }] = await Promise.all([
      resolverUsuario(empresaId, atendente),
      resolverCentros(empresaId, centros),
      getComunicacaoAutomatica(empresaId),
    ]);
    const { modo, responsaveis } = await rotinas.listRotinas(empresaId, 'todos', { dataInicio: de, dataFim: ate, costCenterIds });
    const automatica = tipo === 'automatica';
    const lista = usuario ? responsaveis.filter((r) => String(r.usuario_id) === String(usuario.id)) : responsaveis;
    const tarefas = [];
    const resumo = lista.map((r) => {
      const parcelas = new Map();
      const clientes = new Set();
      const canais = Object.fromEntries(CANAIS.map((c) => [c, { devidas: 0, feitas: 0, pendentes: 0, erro: 0 }]));
      let n = 0;
      let previstas = 0;
      for (const centro of r.centros) {
        for (const it of centro.itens) {
          n++;
          if (it.distribuicao_prevista) previstas++;
          clientes.add(String(it.client_id));
          parcelas.set(`${it.bill_id}|${it.installment_id}`, Number(it.valor) || 0);
          const st = {};
          for (const c of CANAIS) {
            const s = statusCanal(it, c);
            st[c] = s;
            if (!s) continue;
            canais[c].devidas++;
            canais[c][s === 'feito' ? 'feitas' : s === 'erro' ? 'erro' : 'pendentes']++;
          }
          const temPendencia = Object.values(st).some((s) => s && s !== 'feito');
          if (listar === 'todas' || (listar === 'pendentes' && temPendencia)) {
            tarefas.push({
              data: it.data,
              atendente: r.nome || (modo === 'automatica' ? 'A distribuir' : 'Sem responsável'),
              centro: centro.cost_center_name,
              cliente: `${it.client_id} ${it.client_name}`,
              parcela: `${it.bill_id}/${it.installment_id}`,
              vencimento: isoDe(it.due_date),
              cluster: CLUSTER_NOME[it.cluster],
              etapa: it.etapa_nome,
              valor: r2(it.valor),
              whatsapp: st.whatsapp,
              email: st.email,
              ligacao: st.ligacao,
              erro_envio: it.whatsapp_erro_mensagem || it.email_erro_mensagem || null,
              dono:
                modo === 'automatica'
                  ? it.distribuicao_prevista
                    ? 'previsão pela carteira (dia ainda não distribuído)'
                    : MOTIVO_DISTRIBUICAO[it.distribuicao_motivo] || it.distribuicao_motivo
                  : 'responsável da etapa',
            });
          }
        }
      }
      const tot = Object.values(canais).reduce((a, c) => ({ devidas: a.devidas + c.devidas, feitas: a.feitas + c.feitas }), { devidas: 0, feitas: 0 });
      return {
        atendente: r.nome || (modo === 'automatica' ? 'A distribuir (sem dono)' : 'Sem responsável na etapa'),
        tarefas: n,
        clientes: clientes.size,
        parcelas: parcelas.size,
        valor: r2([...parcelas.values()].reduce((s, v) => s + v, 0)),
        canais: Object.fromEntries(Object.entries(canais).filter(([, v]) => v.devidas).map(([k, v]) => [CANAL_NOME[k], v])),
        pct_feito: tot.devidas ? r2((tot.feitas / tot.devidas) * 100) : null,
        ...(modo === 'automatica' ? { tarefas_so_com_previsao_de_dono: previstas } : {}),
      };
    });
    return {
      periodo: { de, ate },
      modo_distribuicao: modo === 'automatica' ? 'Distribuição automática' : 'Responsável por etapa',
      tipo_comunicacao: tipo,
      aviso: automatica
        ? 'Tipo de Comunicação = Automática: WhatsApp/e-mail aparecem só como status e hoje não há rotina de disparo — ficam pendentes; só a ligação depende da atendente.'
        : undefined,
      resumo_por_atendente: resumo,
      ...(listar !== 'nada' ? { tarefas: tarefas.slice(0, limite), tarefas_total: tarefas.length } : {}),
    };
  }),
};

const parcelaTool = {
  name: 'cobranca_parcela',
  description:
    'A vida de uma parcela na cobrança: situação hoje (status, dias, cluster, saldo), cliente e contato do envio, cada etapa da régua que ela ' +
    'alcançou (data, canais, janela até a próxima etapa), o dono em cada etapa (distribuição gravada do dia ou responsável da etapa), o que foi ' +
    'feito e por quem em cada canal (e o que faltou), todos os registros do histórico, envios que falharam e os recebimentos/baixas do Sienge. ' +
    'Informe o título (bill_id) e a parcela (installment_id); só o título lista as parcelas dele.',
  inputSchema: {
    titulo: z.coerce.number().int().positive().describe('bill_id (número do título no Sienge).'),
    parcela: z.coerce.number().int().positive().optional().describe('installment_id; sem ele, lista as parcelas do título.'),
  },
  handler: ferramenta(async (empresaId, { titulo, parcela }) => {
    if (!parcela) {
      const { rows } = await pool.query(
        `SELECT installment_id, installment_number, due_date::text, corrected_balance_amount::float AS saldo, client_name, TRIM(payment_term_description) AS tipo
           FROM sie_income WHERE empresa_id = $1 AND bill_id = $2 ORDER BY due_date`,
        [empresaId, titulo]
      );
      if (!rows.length) throw falha(`Título ${titulo} não encontrado no contas a receber desta empresa.`);
      return { titulo, cliente: rows[0].client_name, parcelas: rows.map((r) => ({ parcela: r.installment_id, numero: r.installment_number, vencimento: r.due_date, saldo: r2(r.saldo), tipo_pagamento: r.tipo })) };
    }
    const h = await historico.getHistoricoParcela(empresaId, titulo, parcela).catch((e) => {
      throw falha(e.message);
    });
    const due = isoDe(h.parcela.due_date);
    const clientId = String(h.cliente?.client_id ?? '');
    const [limite, { tipo }, cfgDist, { rows: etapas }, { rows: dist }, { rows: falhas }, { rows: receb }, { rows: info }, { rows: regsId }] = await Promise.all([
      getLimiteVigente(empresaId),
      getComunicacaoAutomatica(empresaId),
      distribuicao.getConfig(empresaId),
      pool.query(
        `SELECT e.id, e.cluster, e.nome, e.dias, e.canal_whatsapp, e.canal_email, e.canal_ligacao, u.nome AS responsavel, e.responsavel_usuario_id
           FROM regua_cobranca_etapas e LEFT JOIN usuarios u ON u.id = e.responsavel_usuario_id
          WHERE e.empresa_id = $1 AND e.ativa AND e.rotina_habilitada AND e.dias IS NOT NULL ORDER BY e.dias`,
        [empresaId]
      ),
      pool.query(
        `SELECT d.data::text AS data, d.usuario_id, u.nome, d.motivo FROM regua_cobranca_distribuicao_itens d JOIN usuarios u ON u.id = d.usuario_id
          WHERE d.empresa_id = $1 AND d.client_id = $2`,
        [empresaId, clientId || 0]
      ),
      pool.query(
        `SELECT data_registro::text AS data, canal, mensagem_erro FROM regua_cobranca_envios_falhos
          WHERE empresa_id = $1 AND bill_id = $2 AND installment_id = $3 ORDER BY data_registro`,
        [empresaId, titulo, parcela]
      ),
      pool.query(
        `SELECT payment_date::text AS data, operation_type_name AS operacao, COALESCE(net_amount, gross_amount, 0)::float AS valor
           FROM sie_income_recebimentos WHERE empresa_id = $1 AND bill_id = $2 AND installment_id = $3 ORDER BY payment_date`,
        [empresaId, titulo, parcela]
      ),
      pool.query(
        `SELECT TRIM(si.payment_term_description) AS tipo,
                EXISTS (SELECT 1 FROM regua_cobranca_tipos_pagamento tp WHERE tp.empresa_id = si.empresa_id AND tp.descricao = TRIM(si.payment_term_description)) AS tipo_entra,
                COALESCE((SELECT comunicar FROM sie_customers_comunicar c WHERE c.empresa_id = si.empresa_id AND c.client_id = si.client_id), TRUE) AS comunicar,
                (SELECT string_agg(cat.cost_center_id || ' ' || cat.cost_center_name || CASE WHEN EXISTS (
                    SELECT 1 FROM centro_custo_etapas_historico hh JOIN mascara_itens m ON m.id = hh.mascara_item_id AND m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.descricao = 'Lançamento'
                     WHERE hh.empresa_id = cat.empresa_id AND hh.sienge_id = cat.cost_center_id AND hh.data_inicio IS NOT NULL) THEN '' ELSE ' (SEM Lançamento — fora da cobrança)' END, '; ')
                   FROM sie_income_categorias cat WHERE cat.empresa_id = si.empresa_id AND cat.bill_id = si.bill_id AND cat.installment_id = si.installment_id) AS centros
           FROM sie_income si WHERE si.empresa_id = $1 AND si.bill_id = $2 AND si.installment_id = $3`,
        [empresaId, titulo, parcela]
      ),
      pool.query(
        `SELECT data_registro::text AS data, canal, usuario_id, tipo FROM regua_cobranca_historico_registros
          WHERE empresa_id = $1 AND bill_id = $2 AND installment_id = $3 AND canal IS NOT NULL`,
        [empresaId, titulo, parcela]
      ),
    ]);
    const donoNoDia = new Map(dist.map((d) => [d.data, d]));
    const automaticaDist = cfgDist.modo === 'automatica';
    const canaisAtendente = tipo === 'automatica' ? ['ligacao'] : CANAIS;
    const ultimaOp = receb.at(-1)?.data ?? null;
    const quitada = h.parcela.corrected_balance_amount === 0 && ultimaOp;
    const hojeIso = await hoje(empresaId);
    const fim = quitada ? ultimaOp : hojeIso;
    const cluster = h.cluster;
    const timeline = etapas
      .filter((e) => (e.cluster === 'inad' ? e.dias > limite : e.cluster === cluster && e.dias <= limite))
      .map((e) => ({ e, data: somarDias(due, e.dias) }))
      .sort((a, b) => a.data.localeCompare(b.data));
    const registros = h.registros;
    const etapasVida = timeline.map(({ e, data }, i) => {
      const ateJanela = timeline[i + 1] ? somarDias(timeline[i + 1].data, -1) : fim;
      const dd = donoNoDia.get(data);
      const dono = dd ? dd.nome : e.responsavel || null;
      const donoId = dd ? dd.usuario_id : e.responsavel_usuario_id;
      const canais = [e.canal_whatsapp && 'whatsapp', e.canal_email && 'email', e.canal_ligacao && 'ligacao'].filter(Boolean);
      const situacao = data > fim ? (quitada ? 'não alcançada (parcela já quitada)' : 'futura') : 'alcançada';
      return {
        etapa: `${CLUSTER_NOME[e.cluster]} · ${e.nome}`,
        data,
        janela_ate: ateJanela,
        situacao,
        dono: dono || 'sem dono',
        dono_veio_de: dd ? `distribuição do dia (${MOTIVO_DISTRIBUICAO[dd.motivo] || dd.motivo})` : automaticaDist ? 'sem distribuição gravada no dia → responsável da etapa' : 'responsável da etapa',
        canais: canais.map((c) => {
          const naJanela = registros.filter((r) => r.canal === c && r.data_registro >= data && r.data_registro <= ateJanela);
          const doDono = regsId.filter(
            (r) => r.canal === c && r.tipo === 'manual' && donoId != null && String(r.usuario_id) === String(donoId) && r.data >= data && r.data <= ateJanela
          );
          return {
            canal: CANAL_NOME[c],
            tarefa_da_atendente: canaisAtendente.includes(c),
            no_dia_exato_da_rotina: registros.some((r) => r.canal === c && r.data_registro === data) ? 'feito' : 'não',
            registros_na_janela: naJanela.map((r) => `${r.data_registro} por ${r.usuario_nome || '—'}`),
            conta_para_o_dono_no_relatorio: doDono.length > 0,
          };
        }),
      };
    });
    return {
      parcela: {
        titulo,
        parcela,
        numero: h.parcela.installment_number,
        documento: [h.parcela.document_identification_name, h.parcela.document_number].filter(Boolean).join(' '),
        vencimento: due,
        dias_hoje: h.parcela.dias,
        status: STATUS_PARCELA[h.parcela.status] || h.parcela.status,
        saldo_corrigido: r2(h.parcela.corrected_balance_amount),
        cluster_do_cliente: CLUSTER_NOME[cluster],
        regua_hoje: h.parcela.dias > limite && h.parcela.corrected_balance_amount !== 0 ? 'Inadimplência' : CLUSTER_NOME[cluster],
        tipo_pagamento: info[0]?.tipo,
        tipo_pagamento_entra_na_cobranca: info[0]?.tipo_entra,
        cliente_comunicar: info[0]?.comunicar,
        centros: info[0]?.centros,
      },
      cliente: h.cliente ? { client_id: h.cliente.client_id, nome: h.cliente.name, telefone: h.cliente.telefone || 'SEM telefone', email: h.cliente.email || 'SEM e-mail' } : null,
      observacao:
        'Etapas reconstruídas com o cluster e a régua de HOJE (iguais ao relatório Desempenho). "conta_para_o_dono_no_relatorio" = há registro daquele canal, feito pelo dono, dentro da janela (regra do relatório); "no_dia_exato_da_rotina" = o check da Rotina daquele dia.',
      etapas: etapasVida,
      registros: registros.map((r) => ({
        data: r.data_registro,
        canal: CANAL_NOME[r.canal] || 'Observação',
        tipo: r.tipo,
        quem: r.usuario_nome,
        situacao_na_data: r.status_na_data,
        texto: (r.descricao || '').slice(0, 600),
        anexos: r.anexos.map((a) => a.nome_original),
      })),
      envios_que_falharam: falhas.map((f) => ({ data: f.data, canal: CANAL_NOME[f.canal], erro: f.mensagem_erro })),
      recebimentos_e_baixas: receb.map((r) => ({ data: r.data, operacao: r.operacao, valor: r2(r.valor) })),
      dias_desde_vencimento: due ? diasEntre(due, hojeIso) : null,
    };
  }),
};

module.exports = { rotinaTool, parcelaTool };
