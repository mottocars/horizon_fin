const dfcSaldos = require('../../../dfc-saldos/dfcSaldos.service');
const { mesesEntre, mesDeHoje } = require('../../../dfc-fluxo/fluxo.service');
const { mesSchema, falha, r2, ferramenta } = require('./comum');

module.exports = {
  name: 'dfc_saldos_bancarios',
  description:
    'Saldo de abertura (dia 1º) de cada conta bancária com Projeta DFC em cada mês pedido, pelo extrato do Sienge, e o total — ' +
    'o Saldo inicial realizado do fluxo. O saldo de cada mês é o de ABERTURA (dia 1º); o extrato vai até o dia da última atualização, então o que já entrou e saiu no mês atual está no realizado do fluxo (dfc_fluxo_caixa).',
  inputSchema: {
    inicio: mesSchema.optional().describe('Mês inicial (AAAA-MM). Sem ele: só o mês atual.'),
    fim: mesSchema.optional().describe('Mês final (AAAA-MM).'),
  },
  handler: ferramenta(async (empresaId, { inicio, fim }) => {
    const atual = mesDeHoje();
    const de = inicio || atual;
    const ate = fim || inicio || atual;
    if (ate < de) throw falha('O mês final precisa ser igual ou depois do inicial.');
    const meses = mesesEntre(de, ate > atual ? atual : ate);
    if (!meses.length) throw falha('Os saldos reais só existem até o mês atual.');
    const contas = await dfcSaldos.saldosPorConta(empresaId, meses);
    return {
      saldo_na_abertura_de: meses,
      contas: contas.map((c) => ({
        empresa: c.company_name,
        conta: c.numero_conta,
        nome: c.nome,
        banco: c.banco_nome,
        tipo: c.tipo_descricao,
        saldos: Object.fromEntries(meses.map((m) => [m, r2(c.saldos[m] ?? 0)])),
        ultimo_lancamento: c.ultimo_lancamento,
        extrato_buscado_ate: c.data_ate,
      })),
      total: Object.fromEntries(meses.map((m) => [m, r2(contas.reduce((t, c) => t + (c.saldos[m] ?? 0), 0))])),
    };
  }),
};
