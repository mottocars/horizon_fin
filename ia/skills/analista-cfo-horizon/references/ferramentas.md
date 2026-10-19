# Ferramentas do conector DFC Construtoras

Todas trabalham só na empresa do conector (você nunca escolhe a empresa). Meses no formato `AAAA-MM`.
Centros e naturezas aceitam id ou parte do nome (natureza também aceita o código com pontos).

## Sumário

- [Orientação e painel](#orientação-e-painel)
- [Fluxo e origem dos valores](#fluxo-e-origem-dos-valores)
- [Saldos, CEF, versões e cadastros](#saldos-cef-versões-e-cadastros)
- [SQL](#sql)
- [Escrita (só conector ALTERA ORÇAMENTO)](#escrita-só-conector-altera-orçamento)
- [Qual ferramenta para qual pergunta](#qual-ferramenta-para-qual-pergunta)

## Orientação e painel

**`dfc_guia`** — sem parâmetros. Como o DFC é montado (realizado, projetado, origens, regras da Projeção
CEF) e a situação atual: empresa, mês atual, versão do Orçamento, extrato buscado até, centros com Projeta
DFC. Chame uma vez por conversa, antes de analisar.

**`dfc_painel_fluxo_caixa`** — o dashboard Econômico Financeiro › Fluxo de Caixa como a tela mostra.
- `historico` (1–36, padrão 1): meses de realizado antes do mês atual.
- `horizonte` (1–36, padrão 5): meses de projeção **contando o mês atual**.
- `centros` (lista) **ou** `spe` (nome/company_id de uma empresa — como clicar nela no Fôlego).
- `secoes`: `indicadores`, `detalhamento`, `trajetoria`, `simulador`, `entradas_saidas`, `folego_spe`,
  `quem_gera`, `carteira`, `orcamento_erra`, `maiores_saidas`, `divida_pj` (padrão: todas).
- `cenario`: `{ preset: orcamento|conservador|estresse (padrão conservador), estrutura_fixa_ritmo_real,
  estouro_obra_pct, queda_vendas_pct, atrasar_obra, atrasar_meses }`.
- `explicar: true`: inclui o Sumário da tela (o que cada análise mostra e como é calculada).

Devolve: `cabecalho`, `colchao`, `indicadores` (card, valor, detalhe, etiqueta com a cor), `detalhamento`
(tabela fechada por coluna), `trajetoria` (saldo fim de mês, orçamento × cenário, meses abaixo do colchão),
`simulador` (mínimo, quando fura o colchão, diferença no fim), `entradas_saidas`, `folego_spe` (resumo e
empresas por risco, com situação e saldo por mês), `quem_gera`, `carteira`, `orcamento_erra`,
`maiores_saidas`, `divida_pj`.

## Fluxo e origem dos valores

**`dfc_fluxo_caixa`** — a tabela do DFC: Saldo inicial › Máscara 1 › Entradas/Saídas › Máscara 2 ›
natureza › Resultado › Saldo final. Colunas `AAAA-MM R` (realizado, só até o mês atual) e `AAAA-MM P`
(projetado). Parâmetros: `inicio`, `fim`, `centros`, `nivel` (`mascara_1` | `mascara_2` padrão | `natureza`).

**`dfc_detalhar_valor`** — de onde vem o valor de UMA natureza em UM mês. `mes`, `tipo`
(`realizado`|`projetado`), `natureza`, `centros`, `lado` (`entradas`|`saidas`|`ambos`). Realizado: os
lançamentos do extrato (título, documento, favorecido, rateio). Projetado: valor informado e histórico,
parcelas do Aging, Orçamento Empresarial com prazo médio, ou o rastreio completo da Projeção CEF. Avisa
quando a fonte mudou depois da versão salva.

**`dfc_lancamentos`** — base empilhada (uma linha por lançamento/item). `base` (`realizado`|`projetado`),
`inicio`, `fim`, `centros`, `natureza`, `texto` (favorecido, documento, título...), `entrada_saida`,
`agrupar_por` (`mes`|`centro`|`mascara_1`|`mascara_2`|`natureza`|`favorecido`|`fonte`|`origem`|
`entrada_saida`), `limite` (padrão 100, máx. 500). Ideal para rankings e totais.

## Saldos, CEF, versões e cadastros

**`dfc_saldos_bancarios`** — saldo de abertura (dia 1º) de cada conta com Projeta DFC por mês e o total.
`inicio`, `fim` (sem eles: só o mês atual).

**`dfc_projecao_cef`** — Projeção CEF de uma obra: parâmetros, cenário do avanço, memória mês a mês
(% obra, Δ obra, registros, VGF medição, Novo Registro, Medição, Crédito PJ, Juros, Amortização, saldo
devedor) e Repasses CEF (unidades). `obra` (vazio = lista as obras), `inicio`, `fim`,
`incluir_unidades` (padrão true). Compara o cálculo de hoje com a projeção gravada.

**`dfc_orcamento_versoes`** — sem parâmetros: versões salvas (número, data, quem salvou, mudanças). Com
`centro` + `natureza` + `mes`: histórico daquele valor em cada versão e o que está pendente.

**`dfc_cadastros`** — `tipo`: `centros_custo` | `naturezas` | `mascaras` | `contas_bancarias`; `busca`
(parte do nome). Use para achar ids, origem de projeção de uma natureza, contas e tipos.

## SQL

**`dfc_descrever_tabelas`** — lista as views `mcp_dfc_*` e colunas. Chame antes de escrever SQL.

**`dfc_consultar_sql`** — `sql`: um SELECT/WITH sobre as views (sem filtrar empresa; máx. 500 linhas).
Use para o que as outras não cobrem (carteira por faixa de atraso, maiores devedores, calendário de
pagamentos...). Consultas prontas: [sql.md](sql.md).

## Escrita (só conector ALTERA ORÇAMENTO)

Aparecem só no conector "DFC CONSTRUTORAS (ALTERA ORÇAMENTO)". Só alteram contas de origem
HORIZON - INFORMADO e gravam em nome de quem fez login. Fluxo obrigatório:
[alterar-orcamento.md](alterar-orcamento.md).

- **`dfc_informado_contas`** — onde dá para alterar (centro × natureza INFORMADO); com `inicio`/`fim`
  traz os valores digitados.
- **`dfc_informado_gravar`** — `lancamentos: [{ centro, natureza, mes, valor }]` (até 500; saída
  negativa; 0 ou null limpa). Tudo ou nada. Fica PENDENTE até salvar a versão.
- **`dfc_informado_replicar`** — mesmo `valor` de `de` até `ate` para um centro × natureza.
- **`dfc_informado_salvar_versao`** — sem `confirmar`: prévia; com `confirmar: true`: cria a versão só
  com as mudanças do Informado.

## Qual ferramenta para qual pergunta

| Pergunta | Ferramenta |
|---|---|
| Como está o caixa? Indicadores, etiquetas | `dfc_painel_fluxo_caixa` (indicadores, trajetoria) |
| Quando o caixa de cada SPE zera? | `dfc_painel_fluxo_caixa` (folego_spe) |
| E se a obra estourar / vendas caírem? | `dfc_painel_fluxo_caixa` (simulador + cenario) |
| Totais por mês, linha do fluxo, R × P | `dfc_fluxo_caixa` |
| De onde veio este valor? | `dfc_detalhar_valor` |
| Maiores fornecedores, saídas por centro | `dfc_lancamentos` (agrupar_por) |
| Saldo por conta bancária | `dfc_saldos_bancarios` |
| Dívida PJ, repasses, unidades | `dfc_projecao_cef` / painel (divida_pj) |
| Por que o projetado mudou? | `dfc_orcamento_versoes` |
| Carteira por atraso, devedores | `dfc_consultar_sql` ([sql.md](sql.md)) |
