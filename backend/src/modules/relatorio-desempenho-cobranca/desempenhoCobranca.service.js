const pool = require('../../config/db');
const { getDataSistema } = require('../regua-cobranca/reguaCobranca.service');

// Relatório "Desempenho da Cobrança": o quanto cada atendente interagiu e,
// principalmente, quanto do que ela trabalhou virou dinheiro — base para uma
// comissão futura. Regras (explicadas na tela, DesempenhoCobrancaPage.jsx —
// as duas precisam andar juntas):
//
//   Interação  = registro MANUAL com canal (WhatsApp, e-mail, ligação) feito
//                por um usuário na Rotina ou no Histórico de Etapas
//                (regua_cobranca_historico_registros). Envio automático não
//                tem dono e não conta.
//   Pagamento  = recebimento do Sienge do tipo "Recebimento" (sie_income_
//                recebimentos) — Reparcelamento, Distrato, Substituição etc.
//                zeram o saldo sem entrar dinheiro e NÃO contam. Data de
//                pagamento no futuro (erro de digitação no Sienge) é ignorada.
//   Crédito    = último toque: cada pagamento vai para quem fez a última
//                interação na parcela até a data dele, desde que essa
//                interação tenha sido no máximo `janela` dias antes. Um
//                pagamento só tem 1 dono — nunca comissão em dobro.
//
// Período: interações pela data do registro; pagamentos pela data do
// pagamento. Cada atendente vê as parcelas em que interagiu no período e as
// que teve pagamento creditado no período.

const ORIGIN_ID_PADRAO = 'CO';
const UM_DIA_MS = 24 * 60 * 60 * 1000;

const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / UM_DIA_MS);
const chaveParcela = (billId, installmentId) => `${billId}|${installmentId}`;

async function getDesempenho(empresaId, { dataInicio, dataFim, janela }) {
  const { data_efetiva: hoje } = await getDataSistema(empresaId);

  // Todas as interações até o fim do período — as anteriores ao início também
  // importam: são elas que dão crédito a um pagamento feito dentro do período.
  const { rows: registros } = await pool.query(
    `SELECT r.id, r.bill_id::text AS bill_id, r.installment_id::text AS installment_id, r.usuario_id, u.nome AS usuario_nome,
            r.canal, r.data_registro::text AS data
     FROM regua_cobranca_historico_registros r
     JOIN usuarios u ON u.id = r.usuario_id
     WHERE r.empresa_id = $1 AND r.tipo = 'manual' AND r.canal IS NOT NULL AND r.data_registro <= $2
     ORDER BY r.data_registro, r.id`,
    [empresaId, dataFim]
  );
  if (registros.length === 0) return { hoje, parcelas: [] };

  const interacoesPorParcela = new Map();
  for (const r of registros) {
    const k = chaveParcela(r.bill_id, r.installment_id);
    if (!interacoesPorParcela.has(k)) interacoesPorParcela.set(k, []);
    interacoesPorParcela.get(k).push(r);
  }
  const billIds = [...new Set(registros.map((r) => r.bill_id))];
  const limitePagamento = dataFim < hoje ? dataFim : hoje;

  const [{ rows: parcelasSie }, { rows: recebimentos }] = await Promise.all([
    pool.query(
      `SELECT si.bill_id::text AS bill_id, si.installment_id::text AS installment_id, si.client_id::text AS client_id,
              si.client_name, si.due_date::text AS vencimento, si.installment_number, si.original_amount::float AS valor_parcela,
              si.corrected_balance_amount::float AS saldo,
              (SELECT cat.cost_center_name FROM sie_income_categorias cat
               WHERE cat.empresa_id = si.empresa_id AND cat.bill_id = si.bill_id AND cat.installment_id = si.installment_id
               ORDER BY cat.cost_center_name LIMIT 1) AS centro_custo
       FROM sie_income si
       WHERE si.empresa_id = $1 AND si.origin_id = $2 AND si.bill_id = ANY($3::bigint[])`,
      [empresaId, ORIGIN_ID_PADRAO, billIds]
    ),
    pool.query(
      `SELECT bill_id::text AS bill_id, installment_id::text AS installment_id, operation_type_name AS operacao,
              payment_date::text AS data, COALESCE(net_amount, gross_amount, 0)::float AS valor
       FROM sie_income_recebimentos
       WHERE empresa_id = $1 AND bill_id = ANY($2::bigint[]) AND payment_date IS NOT NULL AND payment_date <= $3
       ORDER BY payment_date`,
      [empresaId, billIds, limitePagamento]
    ),
  ]);

  const sie = new Map(parcelasSie.map((p) => [chaveParcela(p.bill_id, p.installment_id), p]));
  const recebimentosPorParcela = new Map();
  for (const r of recebimentos) {
    const k = chaveParcela(r.bill_id, r.installment_id);
    if (!interacoesPorParcela.has(k)) continue;
    if (!recebimentosPorParcela.has(k)) recebimentosPorParcela.set(k, []);
    recebimentosPorParcela.get(k).push(r);
  }

  // linhas[`usuario|parcela`] — 1 por atendente × parcela.
  const linhas = new Map();
  const linha = (usuarioId, usuarioNome, k) => {
    const chave = `${usuarioId}|${k}`;
    if (!linhas.has(chave)) {
      linhas.set(chave, {
        usuarioId,
        usuarioNome,
        k,
        interacoes: { whatsapp: 0, email: 0, ligacao: 0 },
        ultimaInteracao: null,
        pagamentos: [],
        outros: [], // pagamentos no período creditados a outra atendente / sem crédito
      });
    }
    return linhas.get(chave);
  };

  // Interações no período.
  for (const [k, lista] of interacoesPorParcela) {
    for (const r of lista) {
      if (r.data < dataInicio) continue;
      const l = linha(r.usuario_id, r.usuario_nome, k);
      l.interacoes[r.canal]++;
      if (!l.ultimaInteracao || r.data > l.ultimaInteracao) l.ultimaInteracao = r.data;
    }
  }

  // Pagamentos no período: crédito pelo último toque dentro da janela.
  for (const [k, lista] of recebimentosPorParcela) {
    const interacoes = interacoesPorParcela.get(k);
    for (const pg of lista) {
      if (pg.data < dataInicio || pg.data > dataFim || pg.operacao !== 'Recebimento') continue;
      const antes = interacoes.filter((i) => i.data <= pg.data);
      const ultima = antes[antes.length - 1];
      const dono = ultima && diasEntre(ultima.data, pg.data) <= janela ? ultima : null;
      if (dono) {
        const daDona = antes.filter((i) => i.usuario_id === dono.usuario_id);
        const l = linha(dono.usuario_id, dono.usuario_nome, k);
        const ultimaDaDona = daDona[daDona.length - 1].data;
        if (!l.ultimaInteracao || ultimaDaDona > l.ultimaInteracao) l.ultimaInteracao = ultimaDaDona;
        l.pagamentos.push({
          data: pg.data,
          valor: pg.valor,
          interacoesAtePagar: daDona.length,
          diasAtePagar: diasEntre(daDona[0].data, pg.data),
        });
      }
      // Quem também trabalhou a parcela no período e não ficou com o crédito
      // enxerga o pagamento, marcado como de outra atendente (ou sem crédito).
      for (const l of linhas.values()) {
        if (l.k !== k || (dono && l.usuarioId === dono.usuario_id)) continue;
        l.outros.push({ data: pg.data, valor: pg.valor, creditoDe: dono?.usuario_nome ?? null });
      }
    }
  }

  const parcelas = [];
  for (const l of linhas.values()) {
    const p = sie.get(l.k);
    const [billId, installmentId] = l.k.split('|');
    const totalInteracoes = l.interacoes.whatsapp + l.interacoes.email + l.interacoes.ligacao;
    let situacao = 'aberta';
    let operacaoEncerramento = null;
    if (l.pagamentos.length) situacao = 'paga';
    else if (l.outros.some((o) => o.creditoDe)) situacao = 'outra';
    else if (l.outros.length) situacao = 'sem_credito';
    else if (p && Number(p.saldo) === 0) {
      // Saldo zerado sem Recebimento creditado: reparcelamento, distrato etc.
      const ultimaOperacao = (recebimentosPorParcela.get(l.k) || []).at(-1);
      situacao = 'encerrada';
      operacaoEncerramento = ultimaOperacao?.operacao || null;
    }
    const ultimoPagamento = l.pagamentos.at(-1) || l.outros.at(-1) || null;
    parcelas.push({
      usuarioId: l.usuarioId,
      atendente: l.usuarioNome,
      clientId: p?.client_id ?? null,
      cliente: p?.client_name ?? 'Parcela não encontrada no Sienge',
      centroCusto: p?.centro_custo ?? null,
      billId,
      installmentId,
      parcela: String(p?.installment_number ?? installmentId).split('/')[0],
      vencimento: p?.vencimento ?? null,
      valorParcela: p?.valor_parcela ?? null,
      interacoes: totalInteracoes,
      interacoesPorCanal: l.interacoes,
      ultimaInteracao: l.ultimaInteracao,
      situacao,
      operacaoEncerramento,
      creditoDe: situacao === 'outra' ? l.outros.at(-1).creditoDe : null,
      dataPagamento: ultimoPagamento?.data ?? null,
      valorRecebido: l.pagamentos.reduce((s, x) => s + x.valor, 0),
      interacoesAtePagar: l.pagamentos.length ? l.pagamentos.at(-1).interacoesAtePagar : null,
      diasAtePagar: l.pagamentos.length ? l.pagamentos.at(-1).diasAtePagar : null,
      atrasoNoPagamento: l.pagamentos.length && p?.vencimento ? diasEntre(p.vencimento, l.pagamentos.at(-1).data) : null,
    });
  }
  return { hoje, parcelas };
}

module.exports = { getDesempenho };
