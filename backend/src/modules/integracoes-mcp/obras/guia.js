const pool = require('../../../config/db');
const { ferramenta } = require('../dfc/tools/comum');
const { br, quando, carregar } = require('./base');

// obras_guia — "comece por aqui" do módulo OBRA 360º: TODAS as regras do dashboard Obra 360º (Carteira
// de obras e Avanço das Obras) e do lado de operação (Operações › Cronogramas Obras), com a configuração
// e os números DESTA empresa ao vivo. As regras estão no código das telas (frontend:
// Operacoes/CronogramasObras/cronogramaObras.js, Dashboards/CronogramasObras/CurvasAvanco.jsx;
// backend: cronograma-centros/*, dfc-avancos/*) — se uma regra mudar lá, mude este texto também.

const guia = {
  name: 'obras_guia',
  description:
    'Comece por aqui. Explica TODO o dashboard Obra 360º com a configuração e os números desta empresa ao vivo: o que é uma obra no Horizon (centro de custo com Tipo = Obra; ' +
    'VGV e unidades do cadastro), o cronograma (Histórico de Etapas, etapas da empresa, como fim/duração/etapa de hoje são calculados, Regra de Atraso da Construção, versões ' +
    'e comunicado de WhatsApp), a Carteira de obras (cards, período, filtros), o Avanço das Obras (as três curvas: PLS da Caixa, Curva S PLS e Curva S de Obras; visões ' +
    'mensal/semanal/diária; desvio; finalizadas), de onde vem cada dado (Sienge, Prevision, DCD da Caixa) e quando foi atualizado, e qual ferramenta usar para cada pergunta.',
  inputSchema: {},
  handler: ferramenta(async (empresaId) => {
    const d = await carregar(empresaId);
    const { rows: ult } = await pool.query(
      `SELECT v.numero, v.criado_em, u.nome AS por, jsonb_array_length(v.alteracoes) AS obras
         FROM cronograma_versoes v LEFT JOIN usuarios u ON u.id = v.criado_por WHERE v.empresa_id = $1 ORDER BY v.numero DESC LIMIT 1`,
      [empresaId]
    );
    const tipoObra = d.obras.length;
    const comCrono = d.obras.filter((o) => o.segs.length).length;
    const comPrev = d.obras.filter((o) => o.curva).length;
    const comContrato = d.obras.filter((o) => o.extra.codigo_contrato_caixa).length;
    const comDcd = d.obras.filter((o) => o.curva?.pls).length;
    const finalizadas = d.obras.filter((o) => o.cards?.finalizada).length;
    const pendentes = d.obras.filter((o) => o.pendencia).length;
    const atrasadas = d.obras.filter((o) => o.atrasadaHoje).length;
    const a = d.atraso;
    const etapaConstrucao = a ? d.etapas.find((e) => e.id === a.etapaId)?.descricao : null;
    const regra = !a
      ? 'NÃO configurada (aba Configurações de Operações › Cronogramas Obras): nenhuma obra aparece em atraso.'
      : a.regra === 'FIXA'
        ? `FIXA — a etapa "${etapaConstrucao}" fica em atraso depois de ${a.meses} meses contados do início dela.`
        : `PLANEJAMENTO — a etapa "${etapaConstrucao}" fica em atraso a partir do mês seguinte àquele em que a curva S de BASE do Prevision chega a 100% (obra sem a curva: sem como medir).`;

    return `# Obra 360º — ${d.empresa} (hoje ${br(d.hoje)})

## 1. O que é
Dashboard **Dashboards › Obra 360º** (antigo "Cronograma de Obras"), com duas telas: **Carteira de obras** (o cronograma de todas as obras: etapas, VGV, unidades, atraso) e **Avanço das Obras** (o avanço físico de cada obra em três curvas). O cronograma é editado em **Operações › Cronogramas Obras** (abas Cronogramas, Centros de Custos, Versões e Configurações). Tudo aqui é só leitura.

## 2. As obras
- Obra = centro de custo do Sienge com **Tipo = Obra** no cadastro (Cadastros › Centros de Custos). Nome exibido = o **apelido**, quando preenchido (senão o nome do Sienge).
- **VGV** e **nº de unidades** são campos MANUAIS do cadastro do centro (não vêm do Sienge nem da Caixa). Cidade/UF vêm do CEP; pilar e responsável, do cadastro.
- Nesta empresa: **${tipoObra}** centros com Tipo = Obra; **${comCrono}** com cronograma (alguma data de etapa — só essas aparecem no dashboard); **${comPrev}** com orçamento no Prevision (aparecem no Avanço das Obras); **${comContrato}** com contrato Caixa no cadastro, das quais **${comDcd}** com o DCD importado (têm PLS da Caixa).

## 3. Cronograma (Carteira de obras)
- O cronograma de cada obra É o **Histórico de Etapas** do centro de custo. Etapas desta empresa, na ordem: ${d.etapas.map((e, i) => `${i + 1}. ${e.descricao} (duração em ${e.tipo_duracao === 'ANOS' ? 'anos' : 'meses'})`).join('; ')}.
- As etapas vão em sequência: o **fim de uma etapa é a véspera do início da seguinte**; a última vai até o **término**. Duração = do início até o início da seguinte (na última, até o término), em meses ou anos. Etapa sem data de início não existe para aquela obra.
- **Onde a obra está hoje**: a etapa em curso (se duas se sobrepõem, a mais adiantada), com o mês dela como no Gantt ("mês 17 de 30": o mês de início é o 1); antes da primeira etapa = **A iniciar**; depois da última = **Concluída**.
- **Regra de Atraso da Construção** desta empresa: ${regra} "Em atraso hoje" = a obra está na construção HOJE e hoje já passou do início do atraso (o que o cronograma só prevê atrasar mais adiante não conta). No Gantt, o atraso é pintado do início do atraso até o fim da construção. Hoje: **${atrasadas}** obra(s) em atraso.
- **Cards da Carteira**: VGV total e unidades das obras do recorte; por etapa, as obras que **estiveram nela em algum momento do período** De/Até (não só as que estão nela hoje), com VGV, unidades e a fatia da carteira; as **a iniciar** contam na etapa por onde vão começar; no card da construção, as **em atraso hoje** e o VGV delas. Clicar num card filtra o Gantt pelas obras que passaram por aquela etapa no período.
- **Período**: no Mês a mês, De/Até valem só pelo mês e ano (padrão: 3 meses antes do atual a 20 à frente); obra sem nenhuma etapa no período não aparece. Visão geral = o cronograma inteiro. Filtros: Obras, Localidade (Cidade - UF), Etapas (etapa desmarcada some de tudo).
- **Versões**: editar datas NÃO muda o cronograma na hora — fica **pendente**. Gravar uma nova versão aplica todas as pendências, numera a versão, guarda o retrato e manda o **comunicado de WhatsApp** (o que mudou + Excel + link) aos destinatários das Configurações. Última versão: ${ult[0] ? `**${ult[0].numero}**, gravada em ${quando(ult[0].criado_em)} por ${ult[0].por || '—'} (${ult[0].obras} obra(s) alterada(s))` : 'nenhuma ainda'}. Alterações pendentes agora: **${pendentes}**.

## 4. Avanço das Obras
Só obras com orçamento no Prevision. Três curvas, acumuladas (0 a 100%), lado a lado:
- **PLS (Caixa)** — o avanço **registrado pela Caixa Econômica Federal** de acordo com a **Planilha de Levantamento de Serviços (PLS)**. Fonte: o DCD do contrato (PDF importado em Integrações › Portal Construtoras). Realizado = soma do % de cada parcela do **cronograma físico-financeiro** que já foi **liberada** (a mesma parcela com status LP no cronograma de liberação; parcelas que não estão no físico-financeiro, como a "285", não contam). "Até DD/MM/AAAA" = data de liberação da última dessas parcelas. **Não tem previsto.**
- **Curva S PLS** (orçamento SECUNDÁRIO do Prevision) — a curva da PLS que a **empresa registrou no Prevision**: previsto × realizado.
- **Curva S de Obras** (orçamento PRIMÁRIO do Prevision) — a **curva real de avanço da obra**: previsto × realizado.
- Prevision: curva S diária; o realizado vale até hoje (o Prevision repete o último valor nos dias futuros). Máximo 100% (o Prevision às vezes soma 100,03% por arredondamento).
- **Visões** (filtro da tela): Mensal, Semanal (domingo a sábado) e Diária. Nos cards: **realizado acumulado até hoje × previsto acumulado no fim do período** (último dia do mês, sábado da semana, ou hoje). Nos gráficos, um ponto por período (o acumulado no último dia dele); De/Até vazio = a obra inteira; o Até nunca passa do dia em que o previsto chega a 100%.
- **Desvio** = realizado − previsto, em pontos percentuais. **Abaixo do previsto** = 0,05 p.p. ou mais abaixo (menos que isso é arredondamento do Prevision). Nos gráficos, a barra do realizado fica vermelha no período abaixo do previsto e azul no resto.
- **Finalizada** = todas as curvas que a obra tem com o realizado em 100% (vão para o fim da lista). Hoje: ${finalizadas}.
- **Como ler, do ponto de vista do dono**:
  - Curva S de Obras realizado × previsto: a obra está adiantada ou atrasada no físico em relação ao planejado.
  - **PLS Caixa − Curva S de Obras**: negativo = a obra executou mais do que a Caixa já mediu (avanço físico ainda não liberado — o dinheiro do financiamento vem nas próximas medições); positivo = a Caixa mediu à frente da obra real.
  - **PLS Caixa − Curva S PLS**: o que a Caixa de fato mediu × a curva da PLS que a empresa registrou no Prevision.
  - **IDP** do Prevision: 1 = no prazo; abaixo de 1 = atrasada (ex.: 0,90).
- O DCD também traz a visão da Caixa do contrato: prazos da obra (original e atual), **início da rotina de atraso de obra**, % mínimo de obra, unidades financiadas e comercializadas, custo da obra, financiamento PJ, saldo devedor, garantia de término.

## 5. Atualização dos dados
- Prevision (curvas): última importação em ${quando(d.atualizacoes.prevision) || '—'}.
- DCD da Caixa (PLS): última importação em ${quando(d.atualizacoes.dcd) || '—'} — só as obras com o PDF importado têm PLS.
- Cronograma, VGV e unidades: ao vivo (o que está gravado no Horizon).
- Pacotes de serviço e pavimentos do Prevision não estão importados no Horizon.

## 6. Qual ferramenta usar
- Visão da carteira (VGV, unidades, quantas obras em cada etapa, a iniciar, em atraso, lista das obras): **obras_carteira**.
- Tudo de uma obra (cronograma, atraso, as três curvas hoje/semana/mês, ritmo e estimativa de término, Prevision, contrato Caixa, alterações): **obras_obra**.
- Avanço de todas as obras como na tela (cards por visão, desvios, Caixa × obra real): **obras_avanco**.
- Série período a período (gráficos / Excel): **obras_curvas**.
- O que mudou no cronograma, quem gravou, comunicados e pendências: **obras_versoes**.
- O que precisa de atenção (prazo, avanço, Caixa, dados): **obras_alertas**.

Responda como o dono da empresa responderia ao conselho: diga a conclusão primeiro, mostre os números (VGV em R$, percentuais com duas casas, datas DD/MM/AAAA) e diga de onde vêm.`;
  }),
};

module.exports = { guia };
