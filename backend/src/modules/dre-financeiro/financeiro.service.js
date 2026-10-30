const pool = require('../../config/db');

// Operações > DRE Gerencial > Financeiro: os exercícios (anos) da empresa, do ano do primeiro
// lançamento financeiro até o ano atual. Primeiro lançamento = o menor vencimento do contas a
// receber (sie_income) e do contas a pagar (sie_outcome) — pelo vencimento, a mesma regra da aba
// Correções: a emissão tem datas digitadas erradas no Sienge (títulos da TOSTE E DINIZ emitidos em
// "2002" que vencem em 2026). Cada exercício traz quantas parcelas vencem nele, a receber e a pagar.
async function exercicios(empresaId) {
  const { rows } = await pool.query(
    `SELECT EXTRACT(YEAR FROM due_date)::int AS ano,
            COUNT(*) FILTER (WHERE tipo = 'R')::int AS receber,
            COUNT(*) FILTER (WHERE tipo = 'P')::int AS pagar,
            MIN(due_date) AS primeiro
       FROM (SELECT 'R' AS tipo, due_date FROM sie_income WHERE empresa_id = $1 AND due_date IS NOT NULL
             UNION ALL
             SELECT 'P', due_date FROM sie_outcome WHERE empresa_id = $1 AND due_date IS NOT NULL) t
      GROUP BY 1`,
    [empresaId]
  );
  // Ano atual pelo relógio da aplicação (o do Postgres da VPS é deslocado).
  const anoAtual = new Date().getFullYear();
  if (!rows.length) return { primeiro_vencimento: null, ano_atual: anoAtual, exercicios: [] };

  const porAno = new Map(rows.map((r) => [r.ano, r]));
  const primeiro = rows.reduce((a, r) => (r.primeiro < a.primeiro ? r : a));
  const lista = [];
  for (let ano = anoAtual; ano >= Math.min(primeiro.ano, anoAtual); ano -= 1) {
    const r = porAno.get(ano);
    lista.push({ ano, receber: r?.receber || 0, pagar: r?.pagar || 0 });
  }
  return { primeiro_vencimento: primeiro.primeiro, ano_atual: anoAtual, exercicios: lista };
}

module.exports = { exercicios };
