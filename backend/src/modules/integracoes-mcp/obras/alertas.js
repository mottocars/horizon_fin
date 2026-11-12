const { ferramenta } = require('../dfc/tools/comum');
const { z, br, pct, ppt, brl, isoDe, diasEntre, mesesEntre, somar, carregar, etapaTexto, previstoEm, realizadoEm } = require('./base');

// Diferença entre duas datas em texto: em meses, ou em dias quando é menos de um mês.
const distancia = (de, ate) => {
  const dias = diasEntre(de, ate);
  const meses = mesesEntre(de, ate);
  return dias < 30 ? `${dias} ${dias === 1 ? 'dia' : 'dias'}` : `${meses} ${meses === 1 ? 'mês' : 'meses'}`;
};

// obras_alertas — "o que precisa da minha atenção" na carteira de obras, do ponto de vista do dono:
// prazo (atraso da construção pela regra da empresa, rotina de atraso de obra da Caixa, prazo
// prorrogado na Caixa, cronograma além do término da Caixa, IDP baixo), avanço (obra real abaixo do
// previsto, Caixa medindo atrás ou à frente da obra, curva da PLS registrada diferente da medição da
// Caixa) e dados (Prevision sem medição recente, DCD não importado ou antigo, obra em construção sem
// Prevision, sem cronograma, sem VGV/unidades, etapa sem fim, alteração de cronograma pendente).

const PESO = { alta: 0, media: 1, informativa: 2 };

const alertasTool = {
  name: 'obras_alertas',
  description:
    'O que precisa de atenção na carteira de obras, em ordem de gravidade (alta, média, informativa), cada alerta com a obra, o número e o porquê. PRAZO: construção em atraso ' +
    'hoje pela Regra de Atraso da empresa (e as que entram em atraso nos próximos 6 meses), rotina de atraso de obra da Caixa já iniciada ou a menos de 180 dias, prazo da obra ' +
    'prorrogado na Caixa, fim da Construção no cronograma depois do término da obra na Caixa, IDP do Prevision abaixo de 0,9. AVANÇO: Curva S de Obras (avanço real) abaixo do ' +
    'previsto hoje além do limite; PLS da Caixa atrás da obra real (avanço executado e ainda não medido/liberado pela Caixa) ou à frente dela; Curva S PLS registrada no Prevision ' +
    'diferente do que a Caixa mediu. DADOS: Prevision sem medição há mais de 30 dias, DCD da Caixa não importado ou com mais de 35 dias, obra em construção sem Prevision, obra ' +
    'sem cronograma, sem VGV ou unidades, etapa sem fim definido, alteração de cronograma pendente (não gravada).',
  inputSchema: {
    limite_pp: z.number().positive().optional().describe('Diferença mínima, em pontos percentuais, para alertar desvio de avanço (padrão 2).'),
  },
  handler: ferramenta(async (empresaId, args) => {
    const lim = args.limite_pp ?? 2;
    const d = await carregar(empresaId);
    const { hoje } = d;
    const em6m = somar(hoje, 183);
    const alertas = [];
    const add = (gravidade, tema, o, detalhe) => alertas.push({ gravidade, tema, obra: o ? o.nome : null, detalhe });
    const naCarteira = d.obras.filter((o) => o.segs.length);
    const construcaoId = d.atraso?.etapaId;
    const emConstrucao = (o) => o.situacao.tipo === 'etapa' && (construcaoId ? o.situacao.etapa_id === construcaoId : /constru/i.test(o.situacao.etapa));
    const ativa = (o) => o.cards && !o.cards.finalizada;

    for (const o of d.obras) {
      // ----- Prazo
      if (o.atrasadaHoje)
        add('alta', 'Prazo', o, `Construção em atraso pela regra da empresa desde ${br(o.atraso.desde)}: ${o.atraso.meses} ${o.atraso.meses === 1 ? 'mês' : 'meses'} além do limite, até ${br(o.atraso.ate)}. VGV ${brl(o.centro.valor_geral_vendas)}.`);
      else if (o.atraso && o.atraso.desde > hoje && o.atraso.desde <= em6m)
        add('media', 'Prazo', o, `Entra em atraso pela regra em ${br(o.atraso.desde)} (a construção vai até ${br(o.atraso.ate)}: ${o.atraso.meses} meses além do limite).`);
      if (o.dcd) {
        // Obra já finalizada no Prevision: o que a Caixa ainda mostra vira lembrete de conferir o encerramento.
        const fin = o.cards?.finalizada;
        const obsFin = fin ? ' A obra já está finalizada no Prevision — confira se o término foi registrado na Caixa.' : '';
        const rotina = isoDe(o.dcd.data_inicio_rotina_atraso_obra);
        if (rotina && rotina <= hoje) add(fin ? 'informativa' : 'alta', 'Caixa', o, `A rotina de atraso de obra da Caixa começou em ${br(rotina)}.${obsFin}`);
        else if (rotina && diasEntre(hoje, rotina) <= 180) add(fin ? 'informativa' : 'media', 'Caixa', o, `A rotina de atraso de obra da Caixa começa em ${br(rotina)} (em ${diasEntre(hoje, rotina)} dias).${obsFin}`);
        if (o.dcd.prazo_obra_atual && o.dcd.prazo_obra_original && o.dcd.prazo_obra_atual > o.dcd.prazo_obra_original)
          add(fin ? 'informativa' : 'media', 'Caixa', o, `Prazo da obra prorrogado na Caixa: de ${o.dcd.prazo_obra_original} para ${o.dcd.prazo_obra_atual} meses (término atual ${br(isoDe(o.dcd.data_termino_obra_atual))}).${obsFin}`);
        const construcao = o.segs.find((s) => s.etapa.id === construcaoId);
        const terminoCaixa = isoDe(o.dcd.data_termino_obra_atual);
        if (!fin && construcao?.fim && terminoCaixa && construcao.fim > terminoCaixa)
          add('media', 'Caixa', o, `O cronograma termina a Construção em ${br(construcao.fim)}, depois do término da obra na Caixa (${br(terminoCaixa)}): ${distancia(terminoCaixa, construcao.fim)} além.`);
      }
      const idp = o.prevision.obras?.idp != null ? Number(o.prevision.obras.idp) : null;
      if (ativa(o) && idp !== null && idp < 0.9) add(idp < 0.8 ? 'alta' : 'media', 'Prazo', o, `IDP do Prevision (Curva S de Obras) em ${String(idp).replace('.', ',')} — abaixo de 0,9 (1 = no prazo).`);

      // ----- Avanço (hoje)
      if (ativa(o)) {
        const real = realizadoEm(o.curva, 'primaria', hoje);
        const prev = previstoEm(o.curva, 'primaria', hoje);
        if (real !== null && prev !== null && prev - real >= lim)
          add(prev - real >= 2 * lim ? 'alta' : 'media', 'Avanço', o, `Curva S de Obras (avanço real) ${pct(real)} × previsto ${pct(prev)} hoje: ${ppt(prev - real)} abaixo.`);
        const pls = realizadoEm(o.curva, 'pls', hoje);
        if (pls !== null && real !== null && real - pls >= lim)
          add('media', 'Caixa × obra', o, `A obra real está em ${pct(real)} e a Caixa mediu ${pct(pls)} (até ${br(o.curva.pls.ultima_liberacao)}): ${ppt(real - pls)} executados e ainda não medidos/liberados pela Caixa.`);
        if (pls !== null && real !== null && pls - real >= lim)
          add('media', 'Caixa × obra', o, `A Caixa mediu ${pct(pls)}, à frente da obra real (${pct(real)}): ${ppt(pls - real)}`);
        const curvaPls = realizadoEm(o.curva, 'secundaria', hoje);
        if (pls !== null && curvaPls !== null && Math.abs(curvaPls - pls) >= lim)
          add('informativa', 'Caixa × Curva S PLS', o, `Curva S PLS registrada no Prevision em ${pct(curvaPls)} × PLS medida pela Caixa ${pct(pls)}: ${ppt(Math.abs(curvaPls - pls))} ${curvaPls > pls ? 'acima' : 'abaixo'} do que a Caixa mediu.`);
      }

      // ----- Dados
      const ultMed = isoDe(o.prevision.obras?.last_measurement || o.prevision.pls?.last_measurement);
      const obraEm100 = o.curva ? (realizadoEm(o.curva, 'primaria', hoje) ?? 0) >= 99.95 : false;
      if (ativa(o) && !obraEm100 && ultMed && diasEntre(ultMed, hoje) > 30)
        add('media', 'Dados', o, `O Prevision não tem medição há ${diasEntre(ultMed, hoje)} dias (última em ${br(ultMed)}).`);
      if (emConstrucao(o) && !o.curva) add('media', 'Dados', o, `Em ${etapaTexto(o)} sem orçamento no Prevision — sem curva de avanço.`);
      if (o.extra.codigo_contrato_caixa && !o.dcd && (o.curva || emConstrucao(o)))
        add('media', 'Dados', o, `Contrato Caixa ${o.extra.codigo_contrato_caixa} no cadastro, mas o DCD não foi importado — sem PLS da Caixa.`);
      if (o.dcd && diasEntre(isoDe(o.dcd.importado_em), hoje) > 35 && ativa(o))
        add('informativa', 'Dados', o, `DCD da Caixa importado há ${diasEntre(isoDe(o.dcd.importado_em), hoje)} dias (${br(isoDe(o.dcd.importado_em))}) — a PLS pode estar desatualizada.`);
      const aberta = o.segs.find((s) => !s.fim);
      if (aberta) add('informativa', 'Dados', o, `Etapa ${aberta.etapa.descricao} sem fim definido no cronograma.`);
      if (o.pendencia) add('informativa', 'Cronograma', o, `Alteração de cronograma pendente desde ${br(isoDe(o.pendencia.atualizado_em))} (${o.pendencia.por || '—'}): só vale quando uma nova versão for gravada.`);
    }
    const semVgv = naCarteira.filter((o) => !(Number(o.centro.valor_geral_vendas) > 0));
    if (semVgv.length) add('informativa', 'Dados', null, `${semVgv.length} obra(s) da carteira sem VGV no cadastro do centro de custo (ficam fora do VGV total): ${semVgv.map((o) => o.nome).join(', ')}.`);
    const semUn = naCarteira.filter((o) => !(Number(o.centro.numero_unidades) > 0));
    if (semUn.length) add('informativa', 'Dados', null, `${semUn.length} obra(s) da carteira sem número de unidades no cadastro do centro de custo: ${semUn.map((o) => o.nome).join(', ')}.`);
    const semCronograma = d.obras.filter((o) => !o.segs.length);
    if (semCronograma.length)
      add('informativa', 'Dados', null, `${semCronograma.length} centro(s) com Tipo = Obra sem nenhuma data de etapa (fora do dashboard): ${semCronograma.map((o) => o.nome).join(', ')}.`);

    alertas.sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade] || (a.obra || '').localeCompare(b.obra || '', 'pt-BR'));
    const conta = (g) => alertas.filter((a) => a.gravidade === g).length;
    return {
      empresa: d.empresa,
      hoje: br(hoje),
      limite_de_desvio_pp: lim,
      resumo: { alta: conta('alta'), media: conta('media'), informativa: conta('informativa'), obras_na_carteira: naCarteira.length },
      alertas,
    };
  }),
};

module.exports = { alertasTool };
