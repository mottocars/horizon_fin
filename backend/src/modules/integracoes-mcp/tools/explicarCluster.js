const { z } = require('zod');
const { getClienteDetalhe } = require('../../cobranca-clusters/cobrancaClusters.service');

module.exports = {
  name: 'explicar_cluster_cliente',
  description:
    'Explica em detalhe por que um cliente específico está classificado em determinado cluster de risco de ' +
    'cobrança (novo, bom, duvidoso ou mau): mostra o score, os indicadores que compuseram o score (com valor ' +
    'bruto, nota e peso de cada um), se alguma regra dura foi disparada (parcela vencida há muitos dias), se ' +
    'houve trava de subida de cluster, o saldo em aberto/vencido/no mês/a vencer e o histórico de ' +
    'reclassificações mês a mês. Use quando a pergunta for sobre "por que o cliente X está em tal cluster", "o ' +
    'que explica o score do cliente Y" ou "esse cliente é confiável?". Precisa do client_id — se só tiver o ' +
    'nome, use a ferramenta consultar_dados_sql para descobrir o client_id primeiro.',
  inputSchema: {
    client_id: z.coerce.number().int().positive().describe('ID do cliente (client_id) no Sienge.'),
  },
  handler(empresaId) {
    return async ({ client_id }) => {
      try {
        const detalhe = await getClienteDetalhe(empresaId, client_id);
        return { content: [{ type: 'text', text: JSON.stringify(detalhe, null, 2) }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.expose ? err.message : 'Não foi possível obter o detalhe deste cliente.' }],
        };
      }
    };
  },
};
