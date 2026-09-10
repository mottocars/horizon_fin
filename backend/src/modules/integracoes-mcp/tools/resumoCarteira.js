const { z } = require('zod');
const { getResumo, getResumoPorCentroCusto } = require('../../cobranca-clusters/cobrancaClusters.service');

module.exports = {
  name: 'resumo_carteira_cobranca',
  description:
    'Retorna o resumo geral da carteira de cobrança da empresa: quantidade de clientes e saldo em ' +
    'aberto/vencido/no mês/a vencer, agrupado por cluster de risco (novo, bom, duvidoso, mau). Opcionalmente ' +
    'também quebra por centro de custo (empreendimento/obra). Use para perguntas gerais como "como está a ' +
    'carteira de cobrança", "quanto está vencido no total" ou "visão geral por empreendimento".',
  inputSchema: {
    agrupar_por_centro_custo: z
      .boolean()
      .default(false)
      .describe('Se true, também retorna a quebra por centro de custo (empreendimento/obra).'),
  },
  handler(empresaId) {
    return async ({ agrupar_por_centro_custo }) => {
      const resumo = await getResumo(empresaId);
      const resultado = { resumo_por_cluster: resumo };
      if (agrupar_por_centro_custo) {
        resultado.resumo_por_centro_custo = await getResumoPorCentroCusto(empresaId, {});
      }
      return { content: [{ type: 'text', text: JSON.stringify(resultado, null, 2) }] };
    };
  },
};
