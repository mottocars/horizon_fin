const pool = require('../../config/db');
const {
  getDataSistema,
  getLimiteVigente,
  getComunicacaoAutomatica,
  CONDICAO_TIPO_PAGAMENTO,
} = require('../regua-cobranca/reguaCobranca.service');

// Relatório "Desempenho da Cobrança": por atendente, cada parcela que ela teve
// sob responsabilidade — quantas interações fez de quantas deveria ter feito
// em toda a vida da parcela, há quantos dias foi a última, e se a parcela foi
// paga (data e valor recebido) ou continua em aberto (saldo). Base pra uma
// comissão futura.
//
// Regras:
//   Tarefa       = cada vez que a parcela entra numa etapa da régua ATIVA e
//                  com a Rotina ligada (due_date + etapa.dias), 1 por canal da
//                  etapa. Na Comunicação Automática, WhatsApp e e-mail saem
//                  sozinhos — só a ligação é tarefa da atendente. Conta da 1ª
//                  etapa até hoje (ou até o fim do período, ou até o pagamento).
//   Responsável  = quem recebeu o cliente na Distribuição automática daquele
//                  dia; sem distribuição gravada no dia (modo "Responsável por
//                  etapa", ou antes da distribuição existir), o responsável da
//                  etapa.
//   Feita        = registro daquele canal, pela própria responsável, entre a
//                  data da etapa e a véspera da próxima etapa da parcela.
//   Pagamento    = só "Recebimento" do Sienge com valor líquido > 0 —
//                  Reparcelamento, Distrato etc. e o "Recebimento" de valor
//                  zero das parcelas de DESCONTO CONCEDIDO zeram o saldo sem
//                  entrar dinheiro e não contam como pago.
//   Dono         = cada parcela aparece 1 vez só, na linha de quem era o
//                  responsável na última tarefa (antes do pagamento, ou a
//                  atual) — as interações são as dela.
//
// Abas (campo `aba`):
//   pagas        = paga (Recebimento) com data de pagamento DENTRO do período;
//                  valor = soma dos Recebimentos.
//   abertas      = em aberto no fim do período, com VENCIMENTO dentro do
//                  período; valor = o que faltava pagar no fim do período.
//   distribuidas = só a Distribuição automática, pela DATA DA DISTRIBUIÇÃO:
//                  1 linha por tarefa (parcela × dia) de cliente distribuído
//                  naquele dia, dentro do período — a mesma parcela pode
//                  aparecer em mais de um dia. Atendente = quem recebeu o
//                  cliente no dia (nunca o responsável da etapa); interações
//                  = as da etapa daquele dia, feitas por ela; valor = saldo
//                  da parcela no dia da distribuição.
// Parcela encerrada sem pagamento (desconto, reparcelamento, distrato) não
// entra em pagas nem abertas (mas entra em distribuidas, se foi distribuída
// antes de encerrar).

const ORIGIN_ID_PADRAO = 'CO';
const CANAIS = ['whatsapp', 'email', 'ligacao'];
const UM_DIA_MS = 24 * 60 * 60 * 1000;

const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / UM_DIA_MS);
const somarDias = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const chaveParcela = (billId, installmentId) => `${billId}|${installmentId}`;

// Feitas: cada registro do canal, da própria responsável, dentro da janela
// da tarefa (`data` até `ate`) — 1 registro cumpre 1 tarefa só. `registros`
// já vem filtrado pela responsável.
function contarInteracoes(tarefas, registros) {
  const usados = new Set();
  let devidas = 0;
  let feitas = 0;
  const porCanal = { whatsapp: [0, 0], email: [0, 0], ligacao: [0, 0] };
  for (const t of tarefas) {
    for (const canal of t.canais) {
      devidas++;
      porCanal[canal][1]++;
      const idx = registros.findIndex((r, i) => !usados.has(i) && r.canal === canal && r.data >= t.data && r.data <= t.ate);
      if (idx >= 0) {
        usados.add(idx);
        feitas++;
        porCanal[canal][0]++;
      }
    }
  }
  return { interacoesFeitas: feitas, interacoesDevidas: devidas, interacoesPorCanal: porCanal };
}

async function getDesempenho(empresaId, { dataInicio, dataFim }) {
  const { data_efetiva: hoje } = await getDataSistema(empresaId);
  const corte = dataFim < hoje ? dataFim : hoje; // nada depois do fim do período nem de hoje
  const [limite, { tipo: tipoComunicacao }] = await Promise.all([getLimiteVigente(empresaId), getComunicacaoAutomatica(empresaId)]);
  const canaisDaAtendente = tipoComunicacao === 'automatica' ? ['ligacao'] : CANAIS;

  const { rows: etapas } = await pool.query(
    `SELECT id, cluster, nome, dias, canal_whatsapp, canal_email, canal_ligacao, responsavel_usuario_id
     FROM regua_cobranca_etapas
     WHERE empresa_id = $1 AND ativa = TRUE AND rotina_habilitada = TRUE AND dias IS NOT NULL
     ORDER BY dias`,
    [empresaId]
  );
  if (etapas.length === 0) return { hoje, parcelas: [] };
  const etapasPorCluster = {};
  for (const e of etapas) (etapasPorCluster[e.cluster] ??= []).push(e);
  const menorDia = etapas[0].dias;
  const maiorDia = etapas[etapas.length - 1].dias;

  // Parcelas candidatas: as que podem ter tarefa no período (pelo vencimento)
  // e as com Recebimento no período. Mesmo universo da Rotina: centro de
  // custo com "Lançamento" e cliente com "Comunicar" ligado.
  const { rows: parcelasSie } = await pool.query(
    `SELECT DISTINCT ON (si.bill_id, si.installment_id)
            si.bill_id::text AS bill_id, si.installment_id::text AS installment_id, si.client_id::text AS client_id,
            si.client_name, si.due_date::text AS vencimento, si.installment_number, si.payment_term_description AS condicao,
            si.corrected_balance_amount::float AS saldo, cat.cost_center_name AS centro_custo
     FROM sie_income si
     JOIN sie_income_categorias cat
       ON cat.bill_id = si.bill_id AND cat.installment_id = si.installment_id AND cat.empresa_id = si.empresa_id
     JOIN centro_custo_etapas_historico h
       ON h.sienge_id = cat.cost_center_id AND h.empresa_id = cat.empresa_id AND h.data_inicio IS NOT NULL
     JOIN mascara_itens m
       ON m.id = h.mascara_item_id AND m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.descricao = 'Lançamento'
     LEFT JOIN sie_customers_comunicar com ON com.empresa_id = si.empresa_id AND com.client_id = si.client_id
     WHERE si.empresa_id = $1 AND si.origin_id = $2 AND COALESCE(com.comunicar, TRUE) = TRUE
       AND ${CONDICAO_TIPO_PAGAMENTO}
       AND (
         si.due_date BETWEEN ($3::date - $6::int) AND ($4::date - $5::int)
         OR EXISTS (
           SELECT 1 FROM sie_income_recebimentos r
           WHERE r.empresa_id = si.empresa_id AND r.bill_id = si.bill_id AND r.installment_id = si.installment_id
             AND r.operation_type_name = 'Recebimento' AND r.payment_date BETWEEN $3 AND $4
         )
       )
     ORDER BY si.bill_id, si.installment_id, cat.cost_center_name`,
    [empresaId, ORIGIN_ID_PADRAO, dataInicio, corte, menorDia, maiorDia]
  );
  if (parcelasSie.length === 0) return { hoje, parcelas: [] };

  const billIds = [...new Set(parcelasSie.map((p) => p.bill_id))];
  const clientIds = [...new Set(parcelasSie.map((p) => p.client_id))];
  const [{ rows: recebimentos }, { rows: registros }, { rows: distribuicao }, { rows: clusters }, { rows: usuarios }] =
    await Promise.all([
      pool.query(
        `SELECT bill_id::text AS bill_id, installment_id::text AS installment_id, operation_type_name AS operacao,
                payment_date::text AS data, COALESCE(net_amount, gross_amount, 0)::float AS valor
         FROM sie_income_recebimentos
         WHERE empresa_id = $1 AND bill_id = ANY($2::bigint[]) AND payment_date IS NOT NULL AND payment_date <= $3
         ORDER BY payment_date`,
        [empresaId, billIds, hoje]
      ),
      pool.query(
        `SELECT bill_id::text AS bill_id, installment_id::text AS installment_id, usuario_id, canal, data_registro::text AS data
         FROM regua_cobranca_historico_registros
         WHERE empresa_id = $1 AND bill_id = ANY($2::bigint[]) AND tipo = 'manual' AND canal IS NOT NULL
           AND usuario_id IS NOT NULL AND data_registro <= $3
         ORDER BY data_registro, id`,
        [empresaId, billIds, corte]
      ),
      pool.query(
        `SELECT data::text AS data, client_id::text AS client_id, usuario_id FROM regua_cobranca_distribuicao_itens
         WHERE empresa_id = $1 AND client_id = ANY($2::bigint[]) AND data <= $3`,
        [empresaId, clientIds, corte]
      ),
      pool.query('SELECT client_id::text AS client_id, cluster FROM cobranca_clientes_clusters WHERE empresa_id = $1', [empresaId]),
      pool.query('SELECT id, nome FROM usuarios'),
    ]);

  const nomeUsuario = new Map(usuarios.map((u) => [u.id, u.nome]));
  const clusterCliente = new Map(clusters.map((c) => [c.client_id, c.cluster]));
  const donoNoDia = new Map(distribuicao.map((d) => [`${d.data}|${d.client_id}`, d.usuario_id]));
  const agrupar = (lista) => {
    const m = new Map();
    for (const x of lista) {
      const k = chaveParcela(x.bill_id, x.installment_id);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  };
  const recebimentosPor = agrupar(recebimentos);
  const registrosPor = agrupar(registros);

  const parcelas = [];
  for (const p of parcelasSie) {
    const k = chaveParcela(p.bill_id, p.installment_id);
    const operacoes = recebimentosPor.get(k) || [];
    const operacoesAteCorte = operacoes.filter((r) => r.data <= corte);
    // Situação no fim do período: saldo zerado só se a última operação do
    // Sienge (pagamento, desconto, reparcelamento...) já tinha acontecido.
    const ultimaOperacao = operacoes.at(-1)?.data ?? null;
    const quitada = Number(p.saldo) === 0 && ultimaOperacao != null && ultimaOperacao <= corte;
    const pagamentos = operacoesAteCorte.filter((r) => r.operacao === 'Recebimento' && r.valor > 0);
    const paga = quitada && pagamentos.length > 0;
    const dataPagamento = paga ? pagamentos.at(-1).data : null;
    // Saldo zerado tira a parcela da Rotina: não há tarefa depois disso.
    const fimTarefas = quitada ? ultimaOperacao : corte;

    // Linha do tempo de tarefas: cada etapa alcançada, na régua do cluster
    // que a parcela tinha naquele dia (passou do limite = Inadimplência).
    // `distribuida` = o cliente estava na Distribuição automática daquele
    // dia (o dono veio dela, não do responsável da etapa).
    const cluster = clusterCliente.get(p.client_id) || 'novo';
    const tarefas = [];
    for (const e of [...(etapasPorCluster[cluster] || []), ...(etapasPorCluster.inad || [])]) {
      const ehInad = e.cluster === 'inad';
      if (ehInad !== e.dias > limite) continue; // etapa de score além do limite / de inad antes dele
      if (!ehInad && e.cluster !== cluster) continue;
      const data = somarDias(p.vencimento, e.dias);
      if (data > fimTarefas) continue;
      const donoDistribuicao = donoNoDia.get(`${data}|${p.client_id}`) ?? null;
      const dono = donoDistribuicao ?? e.responsavel_usuario_id ?? null;
      const canais = canaisDaAtendente.filter((c) => e[`canal_${c}`]);
      tarefas.push({ data, dono, canais, distribuida: donoDistribuicao != null, etapa: e.nome || `D${e.dias >= 0 ? '+' : ''}${e.dias}` });
    }
    tarefas.sort((a, b) => a.data.localeCompare(b.data));
    // Janela de cada tarefa: do dia da etapa até a véspera da próxima.
    for (let i = 0; i < tarefas.length; i++) {
      tarefas[i].ate = tarefas[i + 1] ? somarDias(tarefas[i + 1].data, -1) : fimTarefas;
    }
    const registrosDaParcela = registrosPor.get(k) || [];
    const base = {
      clientId: p.client_id,
      cliente: p.client_name || `Cliente ${p.client_id}`,
      centroCusto: p.centro_custo,
      billId: p.bill_id,
      installmentId: p.installment_id,
      parcela: String(p.installment_number ?? p.installment_id).split('/')[0],
      condicao: (p.condicao || '').trim() || null,
      vencimento: p.vencimento,
    };

    // Aba "Parcelas Distribuídas": cada dia de distribuição no período.
    for (const t of tarefas) {
      if (!t.distribuida || t.data < dataInicio || t.data > corte) continue;
      const cumprimento = contarInteracoes([t], registrosDaParcela.filter((r) => r.usuario_id === t.dono));
      const ultimaInteracao = registrosDaParcela.filter((r) => r.usuario_id === t.dono).at(-1)?.data ?? null;
      parcelas.push({
        ...base,
        aba: 'distribuidas',
        usuarioId: t.dono,
        atendente: nomeUsuario.get(t.dono) || 'Usuário removido',
        dataDistribuicao: t.data,
        etapa: t.etapa,
        // Pagamento só conta se veio depois da distribuição (é o resultado dela).
        dataPagamento: dataPagamento && dataPagamento >= t.data ? dataPagamento : null,
        diasAtraso: diasEntre(p.vencimento, t.data),
        // Saldo no dia: o de hoje + tudo que o Sienge baixou depois daquele dia.
        valor: Number(p.saldo) + operacoes.filter((r) => r.data >= t.data).reduce((s2, r) => s2 + r.valor, 0),
        ...cumprimento,
        ultimaInteracao,
        diasUltimaInteracao: ultimaInteracao ? diasEntre(ultimaInteracao, hoje) : null,
      });
    }

    if (quitada && !paga) continue; // encerrada sem pagamento — fora de pagas/abertas
    const dono = [...tarefas].reverse().find((t) => t.dono)?.dono ?? null;
    if (!dono) continue;

    let aba;
    if (paga) {
      if (dataPagamento < dataInicio || dataPagamento > corte) continue;
      aba = 'pagas';
    } else {
      if (p.vencimento < dataInicio || p.vencimento > dataFim) continue;
      aba = 'abertas';
    }

    const meusRegistros = registrosDaParcela.filter((r) => r.usuario_id === dono);
    const cumprimento = contarInteracoes(
      tarefas.filter((t) => t.dono === dono),
      meusRegistros
    );
    const ultimaInteracao = meusRegistros.length ? meusRegistros.at(-1).data : null;

    // Em aberto: saldo de hoje + o que foi pago depois do fim do período.
    const valor =
      aba === 'pagas'
        ? pagamentos.reduce((s2, r) => s2 + r.valor, 0)
        : Number(p.saldo) + operacoes.filter((r) => r.data > corte).reduce((s2, r) => s2 + r.valor, 0);
    // Dias de atraso: no pagamento (pagas) ou no fim do período (em aberto).
    const diasAtraso = diasEntre(p.vencimento, aba === 'pagas' ? dataPagamento : corte);

    parcelas.push({
      ...base,
      aba,
      usuarioId: dono,
      atendente: nomeUsuario.get(dono) || 'Usuário removido',
      dataPagamento,
      diasAtraso,
      valor,
      ...cumprimento,
      ultimaInteracao,
      diasUltimaInteracao: ultimaInteracao ? diasEntre(ultimaInteracao, hoje) : null,
    });
  }
  return { hoje, parcelas };
}

module.exports = { getDesempenho };
