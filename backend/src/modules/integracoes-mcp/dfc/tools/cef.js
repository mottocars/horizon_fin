const projecaoCef = require('../../../dfc-projecao-cef/projecaoCef.service');
const { z, mesSchema, r2, ferramenta, resolverCentros } = require('./comum');

// A Projeção CEF de uma obra refeita hoje (mesmo motor), com parâmetros, avanço e unidades — a conta
// completa que leva aos valores de Novo Registro, Medição, Crédito PJ, Juros e Amortização.

const FONTE = { CAIXA: 'Caixa (DCD)', PREVISION_MES: 'Acumulado anterior + avanço do mês no Prevision', PREVISION: 'Prevision', MANUAL: 'Manual' };
const pct = (v) => (v === null || v === undefined ? null : r2(Number(v) * 100));

module.exports = {
  name: 'dfc_projecao_cef',
  description:
    'Projeção CEF de uma obra (centro de custo com contrato Caixa): parâmetros, cenário do avanço, memória de cálculo mês a mês ' +
    '(% obra, Δ obra, registros, VGF medição, Novo Registro, Medição, Crédito PJ, Juros, Amortização, saldo devedor PJ) e os ' +
    'Repasses CEF (unidades do Geral com mês do registro, demanda mínima, VGF medição, novo registro). Sem "obra": lista as obras ' +
    'com projeção. Compara o cálculo de hoje com a projeção gravada (a que o Orçamento usa).',
  inputSchema: {
    obra: z.union([z.string(), z.number()]).optional().describe('Obra: id ou nome do centro de custo. Vazio = listar obras.'),
    inicio: mesSchema.optional().describe('Primeiro mês da memória (AAAA-MM). Vazio = início do ciclo.'),
    fim: mesSchema.optional().describe('Último mês da memória (AAAA-MM). Vazio = fim do ciclo.'),
    incluir_unidades: z.boolean().default(true).describe('Incluir a lista de unidades (Repasses CEF).'),
  },
  handler: ferramenta(async (empresaId, { obra, inicio, fim, incluir_unidades: unidadesOn = true }) => {
    if (obra === undefined || obra === null || obra === '') {
      const lista = await projecaoCef.elegiveis(empresaId);
      return lista.map((o) => ({ id: o.sienge_id, obra: o.name, contrato: o.contrato, versao_parametros: o.versao_parametros, ultima_atualizacao: o.ultima_atualizacao, situacao: o.motivo || 'ok' }));
    }
    const [id] = await resolverCentros(empresaId, [obra]);
    const r = await projecaoCef.rastrear(empresaId, id);
    if (!r) return 'Esta obra não tem Projeção CEF (precisa de Código Contrato Caixa, Parâmetros e a projeção atualizada).';
    const { p, linhas, unidades, porUnidade, mapa, fontes } = r;
    const dentro = (m) => (!inicio || m >= inicio) && (!fim || m <= fim);
    let divergencias = 0;
    const memoria = linhas.filter((l) => dentro(l.mes)).map((l) => {
      const g = r.gravadas.get(l.mes);
      const campos = ['novo_registro', 'medicao', 'credito_pj', 'juros', 'amortizacao'];
      if (g && campos.some((c) => Math.abs(r2(l[c]) - Number(g[c])) >= 0.01)) divergencias += 1;
      const f = fontes.get(l.mes);
      return {
        mes: l.mes,
        pct_obra_acumulado: pct(l.pct_obra_executada),
        fonte_avanco: f ? `${FONTE[f.fonte] || f.fonte}${f.repetido ? ' (repete o anterior)' : ''}` : null,
        delta_obra_pct: pct(l.delta_pct_obra_mes),
        registros: l.qtd_registro,
        vgf_medicao_registrados: r2(l.vgf_medicao),
        novo_registro: r2(l.novo_registro),
        novo_registro_demanda_minima: r2(l.novo_registro_nao_amortizacao),
        medicao: r2(l.medicao),
        credito_pj: r2(l.credito_pj),
        juros: r2(l.juros),
        amortizacao: r2(l.amortizacao),
        saldo_devedor_pj: r2(l.saldo_devedor_pj),
      };
    });
    const resposta = {
      obra: r.obra,
      parametros: {
        versao: r.versao.versao,
        cto: p.cto,
        teto_financiamento_pj: p.tetoPj,
        pct_amortizacao_pj: pct(p.amortPj),
        taxa_juros_mes_pct: pct(p.taxaJuros),
        data_demanda_minima: String(p.dataDemandaMinima).slice(0, 10),
        ciclo: `${linhas[0]?.mes} a ${linhas[linhas.length - 1]?.mes}`,
        prazo_assinatura_registro_meses: p.prazoRegistro,
      },
      avanco: { cenario: r.cenario, mes_corte_caixa_prevision: r.mesAtual },
      projecao_atualizada_em: r.exec.atualizado_em,
      atualizada_por: r.exec.usuario,
      conferencia:
        divergencias === 0
          ? 'O cálculo de hoje bate com a projeção gravada (a usada no Orçamento).'
          : `${divergencias} mês(es) em que o cálculo de hoje difere da projeção gravada — o Geral ou os Avanços mudaram depois da última atualização da Projeção CEF.`,
      valores_em: 'R$; percentuais em %. Juros e Amortização entram negativos no fluxo.',
      memoria,
    };
    if (unidadesOn) {
      resposta.repasses_cef = unidades.map((u, i) => {
        const c = porUnidade[i];
        return {
          unidade: u.contrato_unidade,
          mutuario: u.nome_mutuario,
          assinatura: u.data_assinatura,
          registro: u.data_registro,
          mes_registro: c.regMes,
          registro_projetado: !u.data_registro,
          // REGISTRO (data do Geral) | MANUAL (mês informado à mão na aba Repasses) | PARAMETRO (assinatura + prazo)
          origem_mes_registro: c.origemReg,
          demanda_minima: c.statusDm,
          terreno: r2(u.valor_terreno),
          fgts: r2(u.valor_fgts),
          financiamento: r2(u.valor_financiamento),
          subsidio: r2(u.valor_subsidio),
          vgf_medicao: r2(c.vgfMedicao),
          pct_obra_no_registro: pct(c.regMes && mapa.has(c.regMes) ? mapa.get(c.regMes) : 0),
          novo_registro: r2(c.totalNovoRegistro),
        };
      });
    }
    return resposta;
  }),
};
