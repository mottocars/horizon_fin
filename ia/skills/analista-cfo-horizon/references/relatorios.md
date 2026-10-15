# Modelos de resposta e relatório

Adapte o tamanho à pergunta: uma pergunta rápida pede só o essencial do modelo. Sempre em português,
valores em R$ mil/mi, meses "out/26". Toda tabela com a base (período, versão do Orçamento) logo abaixo.

## Sumário

- [Diagnóstico de caixa](#diagnóstico-de-caixa)
- [Cenários e stress test](#cenários-e-stress-test)
- [SPE em risco](#spe-em-risco)
- [Orçamento × realizado](#orçamento--realizado)
- [Relatório mensal da diretoria](#relatório-mensal-da-diretoria)
- [Memorando de ajuste do Orçamento](#memorando-de-ajuste-do-orçamento)

## Diagnóstico de caixa

```
**Em uma frase:** <o caixa está X; o ponto de atenção é Y em <mês>; recomendo Z>.

| Indicador | Valor | Situação |
|---|---|---|
| Caixa hoje | R$ … | 🟢/🟡/🔴 <etiqueta do painel> |
| Mínimo projetado | R$ … em <mês> | … |
| Colchão (1 mês de saídas) | R$ … | — |
| Resultado médio próx. 6 meses | R$ … | … |
| Cenário conservador — mínimo | R$ … em <mês> | fura o colchão em <mês> / não fura |

**O que explica:** 2–4 bullets com valores (ex.: "obra X consome R$ 1,8 mi até mar/27").
**Riscos:** o que pode piorar e o gatilho (ex.: "se o repasse da obra Y atrasar 2 meses, o caixa fura o colchão em jan/27").
**Recomendações:** ação · responsável · prazo · efeito no caixa.
_Base: <empresa>, histórico <n> m, horizonte <n> m (out/26–mar/27), Orçamento v<n> de <data>, extrato até <data>._
```

## Cenários e stress test

```
| Cenário | Mínimo | Mês do mínimo | Fura o colchão? | Saldo no fim | Δ vs. Orçamento |
|---|---|---|---|---|---|
| Orçamento | … | … | … | … | — |
| Conservador | … | … | … | … | … |
| Estresse | … | … | … | … | … |
| <personalizado: descreva> | … | … | … | … | … |

**Ponto de ruptura:** o caixa fura o colchão a partir de <fator e valor> (ex.: estouro de obra ≥ 15%).
**Fatores que mais pesam:** ranking pela sensibilidade (Δ no mínimo por ponto de variação).
**Plano de contingência:** gatilhos e ações em ordem (renegociar, postergar, antecipar recebíveis, captar).
_O simulador não altera dados no sistema._
```

Para achar o ponto de ruptura: varie um fator por vez (ex.: `estouro_obra_pct` 5, 10, 15, 20...) a partir
do preset `orcamento` e anote o primeiro valor em que `fura_o_colchao_em` deixa de ser "não fura".

## SPE em risco

```
**<SPE> zera em <mês>** (mínimo de R$ … em <mês>), partindo de R$ … hoje.
- Por quê: <centros/obras e linhas que consomem; valores por mês>.
- Quanto precisa: aporte/mútuo de R$ … até <mês> para manter o colchão da SPE (ou zero).
- De onde pode vir: <SPEs com sobra, sem comprometer o colchão delas>.
- Alternativas: <postergar pagamentos X, antecipar recebíveis Y, acelerar registro de unidades>.
```

## Orçamento × realizado

```
| Linha | Realizado | Projetado | Desvio | Leitura |
|---|---|---|---|---|
| … | R$ … | R$ … | +x,x% | premissa / timing |

**Padrões:** desvios recorrentes (mesmo sinal por vários meses) = premissa errada; alternados = timing.
**Ajustes sugeridos no Orçamento:** linha · de R$ … para R$ …/mês · a partir de <mês> · motivo.
```

## Relatório mensal da diretoria

Estrutura (documento ou apresentação; 1 página por bloco):

1. **Resumo executivo** — 3 a 5 frases: situação do caixa, maior risco, decisões pedidas.
2. **Caixa e liquidez** — tabela de indicadores do painel + trajetória (saldo fim de mês e colchão).
3. **Resultado do mês** — realizado × projetado do mês fechado (entradas, saídas, resultado) e os
   principais desvios.
4. **Fôlego por SPE** — quem zera e quando; necessidade de aporte.
5. **Obras e dívida PJ** — quem gera/consome caixa; saldo devedor × teto; repasses represados.
6. **Carteira** — a receber em 90 dias, inadimplência, maiores atrasos.
7. **Cenários** — conservador e estresse, ponto de ruptura.
8. **Decisões pedidas** — lista numerada: decisão, valor, prazo, responsável.
_Base e premissas no rodapé._

## Memorando de ajuste do Orçamento

Use antes de gravar valores (conector ALTERA ORÇAMENTO):

```
| Centro | Natureza | Meses | De | Para | Motivo |
|---|---|---|---|---|---|
| … | … | nov/26–mar/27 | R$ … | R$ … | … |

Efeito no caixa: mínimo projetado vai de R$ … para R$ … (estimativa).
Confirma que posso gravar? Depois mostro a prévia da versão antes de salvar.
```
