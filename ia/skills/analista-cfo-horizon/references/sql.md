# Consultas SQL prontas (`dfc_consultar_sql`)

Use quando as outras ferramentas não cobrem (carteira por faixa de atraso, devedores, calendário de
pagamentos...). Regras da ferramenta: um SELECT/WITH só, sem filtrar empresa (as views já filtram), no
máximo 500 linhas, use `date_part('x', y)` em vez de `EXTRACT(x FROM y)`. Chame `dfc_descrever_tabelas` antes
de adaptar colunas.

**Troque `DATE '2026-10-15'` pela data de hoje** (o "mês atual" vem do `dfc_guia`). Valores das views de
contas a pagar/receber são saldos em aberto (`balance_amount`), positivos.

## Sumário

- [Carteira a receber por faixa de atraso](#carteira-a-receber-por-faixa-de-atraso)
- [Maiores devedores](#maiores-devedores)
- [Calendário de recebimentos (12 meses)](#calendário-de-recebimentos-12-meses)
- [Concentração de recebíveis](#concentração-de-recebíveis)
- [Contas a pagar vencidas por credor](#contas-a-pagar-vencidas-por-credor)
- [A pagar nos próximos 90 dias por centro](#a-pagar-nos-próximos-90-dias-por-centro)
- [Projetado por origem (6 meses)](#projetado-por-origem-6-meses)
- [O que mudou nas últimas versões do Orçamento](#o-que-mudou-nas-últimas-versões-do-orçamento)

## Carteira a receber por faixa de atraso

```sql
SELECT CASE
         WHEN due_date >= DATE '2026-10-15' THEN '0 a vencer'
         WHEN DATE '2026-10-15' - due_date <= 30 THEN '1 vencido 1-30 dias'
         WHEN DATE '2026-10-15' - due_date <= 90 THEN '2 vencido 31-90 dias'
         WHEN DATE '2026-10-15' - due_date <= 180 THEN '3 vencido 91-180 dias'
         ELSE '4 vencido > 180 dias'
       END AS faixa,
       count(*) AS parcelas,
       round(sum(balance_amount), 2) AS saldo
  FROM mcp_dfc_contas_receber
 WHERE balance_amount > 0
 GROUP BY 1 ORDER BY 1
```

## Maiores devedores

```sql
SELECT client_name AS cliente,
       count(*) AS parcelas_vencidas,
       min(due_date) AS vencida_desde,
       round(sum(balance_amount), 2) AS vencido
  FROM mcp_dfc_contas_receber
 WHERE balance_amount > 0 AND due_date < DATE '2026-10-15'
 GROUP BY client_name
 ORDER BY vencido DESC
 LIMIT 15
```

## Calendário de recebimentos (12 meses)

```sql
SELECT to_char(date_trunc('month', due_date), 'YYYY-MM') AS mes,
       count(*) AS parcelas,
       round(sum(balance_amount), 2) AS a_receber
  FROM mcp_dfc_contas_receber
 WHERE balance_amount > 0 AND due_date >= DATE '2026-10-15'
   AND due_date < DATE '2026-10-15' + interval '12 months'
 GROUP BY 1 ORDER BY 1
```

## Concentração de recebíveis

```sql
WITH c AS (
  SELECT client_name, sum(balance_amount) AS saldo
    FROM mcp_dfc_contas_receber
   WHERE balance_amount > 0 AND due_date >= DATE '2026-10-15'
   GROUP BY client_name
)
SELECT client_name AS cliente, round(saldo, 2) AS a_vencer,
       round(100 * saldo / sum(saldo) OVER (), 1) AS pct_da_carteira
  FROM c ORDER BY saldo DESC LIMIT 10
```

## Contas a pagar vencidas por credor

```sql
SELECT creditor_name AS credor,
       count(*) AS parcelas,
       min(due_date) AS vencida_desde,
       round(sum(balance_amount), 2) AS vencido
  FROM mcp_dfc_contas_pagar
 WHERE balance_amount > 0 AND due_date < DATE '2026-10-15'
 GROUP BY creditor_name
 ORDER BY vencido DESC
 LIMIT 15
```

Atenção: parcela vencida no Sienge pode já ter sido paga e não baixada — confirme com o usuário antes de
tratar como dívida em atraso.

## A pagar nos próximos 90 dias por centro

Rateado pelo percentual de cada centro na parcela.

```sql
SELECT cat.cost_center_name AS centro,
       round(sum(p.balance_amount * cat.financial_category_rate / 100) FILTER (WHERE p.due_date < DATE '2026-10-15' + 30), 2) AS ate_30_dias,
       round(sum(p.balance_amount * cat.financial_category_rate / 100) FILTER (WHERE p.due_date >= DATE '2026-10-15' + 30 AND p.due_date < DATE '2026-10-15' + 60), 2) AS de_31_a_60,
       round(sum(p.balance_amount * cat.financial_category_rate / 100) FILTER (WHERE p.due_date >= DATE '2026-10-15' + 60), 2) AS de_61_a_90
  FROM mcp_dfc_contas_pagar p
  JOIN mcp_dfc_contas_pagar_categorias cat ON cat.bill_id = p.bill_id AND cat.installment_id = p.installment_id
 WHERE p.balance_amount > 0 AND p.due_date >= DATE '2026-10-15' AND p.due_date < DATE '2026-10-15' + 90
 GROUP BY cat.cost_center_name
 ORDER BY sum(p.balance_amount * cat.financial_category_rate / 100) DESC
```

## Projetado por origem (6 meses)

De onde vem o projetado (Aging, Orçamento Empresarial, Informado, componentes da Projeção CEF).

```sql
SELECT to_char(mes, 'YYYY-MM') AS mes, origem,
       round(sum(valor) FILTER (WHERE valor > 0), 2) AS entradas,
       round(sum(valor) FILTER (WHERE valor < 0), 2) AS saidas
  FROM mcp_dfc_orcamento_valores
 WHERE mes >= date_trunc('month', DATE '2026-10-15')
   AND mes < date_trunc('month', DATE '2026-10-15') + interval '6 months'
 GROUP BY 1, 2 ORDER BY 1, 2
```

## O que mudou nas últimas versões do Orçamento

```sql
SELECT v.numero, v.criado_em, l.origem, l.tipo, count(*) AS valores,
       round(sum(coalesce(l.valor_novo, 0) - coalesce(l.valor_anterior, 0)), 2) AS efeito_no_projetado
  FROM mcp_dfc_orcamento_log l
  JOIN mcp_dfc_orcamento_versoes v ON v.id = l.versao_id
 WHERE v.numero > (SELECT max(numero) - 3 FROM mcp_dfc_orcamento_versoes)
 GROUP BY v.numero, v.criado_em, l.origem, l.tipo
 ORDER BY v.numero DESC, l.origem
```
