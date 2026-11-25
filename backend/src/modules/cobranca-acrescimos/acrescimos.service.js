const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const { siengeFetch } = require('../../utils/siengeFetch');
const { sinalDeCancelamento, erroCancelada } = require('../../utils/execucaoCancelavel');
const { bloquearSeEmpresaModelo } = require('../../utils/empresaModelo');

// Acréscimos (multa + juros por atraso) das parcelas vencidas em aberto, calculados pelo próprio Sienge
// (pedido de 25/11/2026: "ao clicar no valor, mostrar Original, Corrigido, + Acréscimos, ..., = Total").
//
// A base do contas a receber (bulk-data income) só tem o saldo corrigido. O acréscimo do dia sai do
// relatório "Saldo Devedor Presente" (GET public/api/v1/current-debit-balance), que só aceita UM CPF/CNPJ
// por chamada — a versão em massa (bulk-data customer-debt-balance) devolve "Permission denied" para o
// usuário de API. Por isso a rotina do Monitor consulta cliente a cliente (só quem tem parcela vencida) e
// grava em cobranca_parcelas_acrescimos. Conferido com o título 15925 da GENESIS: adjustedValue 2.700,46 =
// nosso saldo corrigido; additionalValue 322,08 = o acréscimo da tela do Sienge (cresce todo dia).
//
// O Sienge não separa multa e juros na parcela em aberto — vem só o total (o usuário pediu só o acréscimo).

const SIMULTANEAS = 3; // chamadas ao mesmo tempo (o siengeFetch espera sozinho se o Sienge devolver 429)

function erro(message) {
  const e = new Error(message);
  e.status = 400;
  e.expose = true;
  return e;
}

const num = (v) => Math.round((Number(v) || 0) * 100) / 100;

async function credenciais(empresaId) {
  await bloquearSeEmpresaModelo(empresaId); // empresa modelo: integração simulada, nunca chama o Sienge
  const { rows } = await pool.query(
    'SELECT tenant, username, password_enc FROM integracoes_sienge WHERE empresa_id = $1 AND ativo = TRUE LIMIT 1',
    [empresaId]
  );
  if (!rows[0]) throw erro('Esta empresa não tem uma integração Sienge ativa.');
  const { tenant, username, password_enc: senha } = rows[0];
  return { tenant, auth: `Basic ${Buffer.from(`${username}:${decrypt(senha)}`).toString('base64')}` };
}

async function consultar({ tenant, auth }, { tipo, documento }) {
  const url = `https://api.sienge.com.br/${tenant}/public/api/v1/current-debit-balance?${tipo}=${documento}`;
  const r = await siengeFetch(url, {
    headers: { Authorization: auth, Accept: 'application/json', 'User-Agent': 'HorizonFin/1.0 (+https://horizonfin.local)' },
  });
  if (!r.ok) {
    let detalhe = '';
    try {
      const b = await r.json();
      detalhe = b?.developerMessage || b?.clientMessage || b?.message || '';
    } catch {
      // sem corpo legível
    }
    throw new Error(`Sienge respondeu ${r.status}${detalhe ? `: ${detalhe}` : ''}`);
  }
  const j = await r.json();
  return Array.isArray(j?.results) ? j.results : [];
}

// Consulta o Sienge para cada cliente com parcela vencida em aberto e regrava os acréscimos da empresa.
// Cliente cuja consulta falhou mantém o valor da última vez (não zera). Devolve o resumo da execução.
async function sincronizar(empresaId, progresso = () => {}) {
  const acesso = await credenciais(empresaId);

  const { rows: parcelas } = await pool.query(
    `SELECT si.bill_id::text AS bill_id, si.installment_id::text AS installment_id, si.client_id,
            NULLIF(regexp_replace(COALESCE(c.cpf, ''), '[^0-9]', '', 'g'), '') AS cpf,
            NULLIF(regexp_replace(COALESCE(c.cnpj, ''), '[^0-9]', '', 'g'), '') AS cnpj
       FROM sie_income si
       LEFT JOIN sie_customers c ON c.empresa_id = si.empresa_id AND c.id = si.client_id
      WHERE si.empresa_id = $1 AND si.corrected_balance_amount > 0 AND si.due_date < CURRENT_DATE`,
    [empresaId]
  );

  // Um CPF/CNPJ por consulta (o mesmo documento pode ter mais de um client_id no Sienge).
  const porDocumento = new Map();
  const semDocumento = new Set();
  for (const p of parcelas) {
    const doc = p.cpf ? { tipo: 'cpf', documento: p.cpf } : p.cnpj ? { tipo: 'cnpj', documento: p.cnpj } : null;
    if (!doc) {
      semDocumento.add(String(p.client_id));
      continue;
    }
    const chave = `${doc.tipo}:${doc.documento}`;
    if (!porDocumento.has(chave)) porDocumento.set(chave, { ...doc, parcelas: new Set() });
    porDocumento.get(chave).parcelas.add(`${p.bill_id}|${p.installment_id}`);
  }

  const documentos = [...porDocumento.values()];
  const encontrados = new Map(); // `${bill}|${inst}` → linha
  const falhas = [];
  const calculadoEm = new Date();
  let feitos = 0;
  const sinal = sinalDeCancelamento();

  const fila = [...documentos];
  async function trabalhador() {
    while (fila.length) {
      if (sinal?.aborted) throw erroCancelada();
      const doc = fila.shift();
      try {
        const titulos = await consultar(acesso, doc);
        for (const t of titulos) {
          for (const p of t.dueInstallments || []) {
            const chave = `${t.billReceivableId}|${p.installmentId}`;
            if (!doc.parcelas.has(chave)) continue; // outro título/empresa do mesmo documento
            encontrados.set(chave, {
              bill_id: t.billReceivableId,
              installment_id: p.installmentId,
              valor_original: num(p.originalValue),
              valor_corrigido: num(p.adjustedValue),
              acrescimo: num(p.additionalValue),
              total: num(p.currentBalance),
              vencimento: p.dueDate || null,
            });
          }
        }
      } catch (e) {
        if (e?.cancelada || sinal?.aborted) throw e;
        falhas.push({ doc, mensagem: e.message });
      }
      feitos++;
      progresso({ texto: 'Consultando o saldo devedor dos clientes no Sienge', paginaAtual: feitos, totalPaginas: documentos.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(SIMULTANEAS, documentos.length) }, trabalhador));

  if (documentos.length > 0 && falhas.length === documentos.length) {
    throw new Error(`Nenhuma consulta ao Sienge deu certo (${falhas[0].mensagem}).`);
  }

  // Regrava: apaga o que não vale mais (parcela paga, ou que deixou de estar vencida) e o que foi
  // consultado agora; mantém só as parcelas dos clientes cuja consulta falhou.
  const manter = falhas.flatMap((f) => [...f.doc.parcelas]);
  const linhas = [...encontrados.values()];
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query(
      `DELETE FROM cobranca_parcelas_acrescimos
        WHERE empresa_id = $1 AND NOT ((bill_id::text || '|' || installment_id::text) = ANY($2::text[]))`,
      [empresaId, manter]
    );
    if (linhas.length) {
      await cliente.query(
        `INSERT INTO cobranca_parcelas_acrescimos
           (empresa_id, bill_id, installment_id, valor_original, valor_corrigido, acrescimo, total, vencimento, calculado_em)
         SELECT $1, x.bill_id, x.installment_id, x.valor_original, x.valor_corrigido, x.acrescimo, x.total, x.vencimento, $3
           FROM json_to_recordset($2::json) AS x(bill_id BIGINT, installment_id BIGINT, valor_original NUMERIC,
                valor_corrigido NUMERIC, acrescimo NUMERIC, total NUMERIC, vencimento DATE)
         ON CONFLICT (empresa_id, bill_id, installment_id) DO UPDATE SET
           valor_original = EXCLUDED.valor_original, valor_corrigido = EXCLUDED.valor_corrigido,
           acrescimo = EXCLUDED.acrescimo, total = EXCLUDED.total, vencimento = EXCLUDED.vencimento,
           calculado_em = EXCLUDED.calculado_em`,
        [empresaId, JSON.stringify(linhas), calculadoEm]
      );
    }
    await cliente.query('COMMIT');
  } catch (e) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }

  return {
    clientes: documentos.length,
    parcelas: linhas.length,
    com_acrescimo: linhas.filter((l) => l.acrescimo > 0).length,
    total_acrescimo: num(linhas.reduce((s, l) => s + l.acrescimo, 0)),
    sem_documento: semDocumento.size,
    falhas: falhas.length,
    primeira_falha: falhas[0]?.mensagem || null,
  };
}

// Os acréscimos gravados da empresa: Map `${bill_id}|${installment_id}` → { acrescimo, calculado_em }.
async function mapa(empresaId) {
  const { rows } = await pool.query(
    `SELECT bill_id::text AS bill_id, installment_id::text AS installment_id, acrescimo, calculado_em
       FROM cobranca_parcelas_acrescimos WHERE empresa_id = $1`,
    [empresaId]
  );
  return new Map(rows.map((r) => [`${r.bill_id}|${r.installment_id}`, { acrescimo: Number(r.acrescimo) || 0, calculado_em: r.calculado_em }]));
}

module.exports = { sincronizar, mapa };
