# Métricas, fórmulas e limites

Os limites abaixo são os mesmos do painel (as etiquetas que o usuário vê na tela). Mantenha-os para a
análise bater com o dashboard. O painel calcula tudo isso — prefira ler o valor de
`dfc_painel_fluxo_caixa` a recalcular.

## Base

**O painel é a foto de hoje.** Saldos, carteira e realizado vão até hoje (extrato e Aging do Sienge até a
última atualização). O Orçamento (última versão salva) só entra no que ainda vai acontecer: nos meses
seguintes, o orçado inteiro; no **mês atual, o que falta** = orçado do mês − realizado até hoje, por centro ×
natureza, sem inverter o sinal (saída que já passou do orçado não deixa nada a pagar; entrada acima do
previsto não deixa nada a receber).

- **Fluxo operacional:** máscara de nível 1 com "OPERACIONAL" no nome. Já inclui captação de
  financiamentos (repasses CEF) e serviço da dívida; aplicações e resgates ficam fora.
- **Caixa hoje:** saldo real de hoje nas contas com Projeta DFC (= abertura do mês atual + realizado do mês
  até hoje).
- **Colchão:** 1 mês de saídas operacionais = média mensal das saídas do Fluxo Operacional no horizonte (no
  mês atual, realizado até hoje + o que falta). É o "caixa mínimo seguro".
- **Aplicado:** saldo das contas do tipo Investimento.

## Indicadores do painel e etiquetas

| Card | Cálculo | Vermelho (crítico) | Amarelo (atenção) | Verde |
|---|---|---|---|---|
| Caixa hoje | saldo real de hoje | abaixo do colchão | — | Líquido |
| Mínimo projetado | menor saldo de fim de mês no horizonte, partindo de hoje + só o que ainda vai acontecer | < colchão | < 2 × colchão | Confortável |
| Resultado médio · próx. 6 meses | média do resultado de cada mês (mês atual = realizado até hoje + o que falta) | saldo fura o colchão em até 3 meses | média negativa | Gera caixa |
| Fluxo operacional · até hoje | soma do realizado operacional no histórico + mês atual até hoje | — | negativo (Consome caixa) | Positivo |
| Dívida PJ Caixa | saldo devedor PJ no último mês fechado, somando obras | — | fim da projeção > 1,5 × hoje (Crescente) | azul: Sob controle |
| A receber em 90 dias | parcelas a receber em aberto que vencem de hoje até hoje + 90 dias | — | — | azul (informativo) |
| Inadimplência | vencido até ontem ÷ (vencido + a vencer) a receber | > 8% | > 3% | Baixa |
| Maior concentração de caixa | caixa de hoje da SPE com maior saldo ÷ caixa total | — | > 40% | Distribuído |

## Fôlego de cada SPE

Saldo de cada empresa sozinha: caixa real de hoje das contas dela + o fluxo operacional que ainda vai
acontecer nos centros dela (no mês atual, só o que falta), mês a mês, **sem mútuos nem transferências**.
- **Zera em <mês>** (vermelho): primeiro mês com saldo negativo.
- **Cai X%** (amarelo): não zera, mas o mínimo fica abaixo da metade do caixa de hoje.
- **Cobre** (verde).
Ordem por risco: quem zera primeiro; depois a maior queda relativa.

## Orçamento erra para qual lado?

Por linha (máscara 2) operacional, nos meses FECHADOS do histórico (o mês atual fica de fora, está pela
metade): desvio = realizado ÷ projetado − 1. Entram as 8
linhas com maior diferença em R$ entre as que somam mais de R$ 20 mil. **Desfavorável:** saída maior que
a prevista ou entrada menor.

## Simulador de cenário

- **Orçamento:** sem ajustes.
- **Conservador** (padrão da tela): estrutura fixa no ritmo real + obra 10% mais cara + entradas da obra
  de maior entrada atrasadas 3 meses.
- **Estresse:** conservador com obra 25% mais cara e receita de vendas 15% menor.
- Estrutura fixa no ritmo real: quando o Orçamento projeta Pessoal/Administrativo abaixo da média
  realizada (últimos até 6 meses do histórico), usa a média.
- O que for atrasado para depois do horizonte sai da conta.

## Métricas extras de CFO (calcule com os dados das ferramentas; diga a fórmula)

- **Queima mensal (burn):** média do Resultado do mês projetado quando negativa.
- **Runway (meses de caixa):** caixa hoje ÷ |queima mensal|. Use só com queima negativa; se o mínimo
  projetado ocorrer antes, prevalece o mês do mínimo.
- **Cobertura do colchão:** mínimo projetado ÷ colchão (≥ 2 confortável; 1–2 atenção; < 1 crítico).
- **Cobertura de curto prazo:** (caixa hoje + a receber em 90 dias) ÷ pagamentos dos próximos 90 dias
  (`dfc_lancamentos` base projetado, saídas, 3 meses).
- **Liquidez imediata:** caixa em contas correntes ÷ saídas operacionais do mês atual projetadas.
- **Concentração de fornecedores:** saídas dos 5 maiores favorecidos ÷ saídas operacionais do período.
- **Concentração de recebíveis:** a receber dos 5 maiores clientes ÷ carteira a vencer ([sql.md](sql.md)).
- **Custo da dívida PJ:** juros do mês ÷ saldo devedor (deve bater com a taxa do Parâmetro da obra).
- **Aderência do Orçamento:** 1 − |realizado − projetado| ÷ |projetado| por linha e no total operacional.

## Leituras que um CFO faz

- Mínimo projetado caindo entre versões do Orçamento → piora de premissa; confira `dfc_orcamento_versoes`.
- Fluxo operacional positivo, mas caixa caindo → saídas fora do operacional (investimentos, retiradas,
  mútuos) — veja o fluxo por máscara 1.
- SPE que zera com consolidado folgado → precisa de aporte/mútuo; quantifique o valor e o mês.
- Dívida PJ crescente com obra parada → crédito liberado sem avanço físico; confira % obra na Projeção CEF.
- Muitas unidades com contrato e sem registro → repasse represado; acelerar registro libera caixa.
