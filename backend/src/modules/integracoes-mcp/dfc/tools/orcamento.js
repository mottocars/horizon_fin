const dfcOrcamento = require('../../../dfc-orcamento/dfcOrcamento.service');
const { z, mesSchema, falha, r2, ferramenta, resolverCentros, resolverNatureza } = require('./comum');

module.exports = {
  name: 'dfc_orcamento_versoes',
  description:
    'Versões salvas do Orçamento (o projetado do DFC): sem parâmetros, lista as versões (número, data, quem salvou, quantos ' +
    'valores entraram/mudaram/saíram). Com centro + natureza + mês, mostra o histórico daquele valor em cada versão (quem ' +
    'mudou na origem, quando, de quanto para quanto) e o que está pendente (mudou na fonte e ainda não foi salvo).',
  inputSchema: {
    centro: z.union([z.string(), z.number()]).optional().describe('Centro de custo (id ou nome).'),
    natureza: z.union([z.string(), z.number()]).optional().describe('Natureza (id, código ou nome).'),
    mes: mesSchema.optional().describe('Mês (AAAA-MM).'),
  },
  handler: ferramenta(async (empresaId, { centro, natureza, mes }) => {
    if (!centro && !natureza && !mes) {
      const { versoes } = await dfcOrcamento.orcamento(empresaId);
      return versoes;
    }
    if (!centro || !natureza || !mes) throw falha('Para o histórico de um valor, informe centro, natureza e mês.');
    const [centroId] = await resolverCentros(empresaId, [centro]);
    const nat = await resolverNatureza(empresaId, natureza);
    const { historico, pendente } = await dfcOrcamento.log(empresaId, centroId, nat.sienge_id, mes);
    return {
      centro: centroId,
      natureza: `${nat.sienge_id} ${nat.name}`,
      mes,
      historico: historico.map((h) => ({ ...h, valor_anterior: r2(h.valor_anterior), valor_novo: r2(h.valor_novo) })),
      pendente_de_salvar: pendente,
    };
  }),
};
