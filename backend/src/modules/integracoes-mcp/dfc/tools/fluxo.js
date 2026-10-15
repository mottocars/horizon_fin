const fluxoService = require('../../../dfc-fluxo/fluxo.service');
const { z, mesSchema, falha, r2, ferramenta, resolverCentros } = require('./comum');

// O fluxo de caixa da aba DFC (mesmas regras da tela), no nível pedido.

module.exports = {
  name: 'dfc_fluxo_caixa',
  description:
    'Fluxo de caixa do DFC Construtoras no período: Saldo inicial, Máscara 1 › Entradas/Saídas › Máscara 2 › natureza, Resultado ' +
    'e Saldo final, com colunas "AAAA-MM R" (realizado, só até o mês atual) e "AAAA-MM P" (projetado). Filtro opcional de ' +
    'centros de custo (ids ou nomes). Use para totais, saldos, resultado, comparação realizado × projetado e evolução mensal.',
  inputSchema: {
    inicio: mesSchema.describe('Mês inicial (AAAA-MM).'),
    fim: mesSchema.describe('Mês final (AAAA-MM).'),
    centros: z.array(z.union([z.string(), z.number()])).optional().describe('Centros de custo (ids ou nomes). Vazio = todos.'),
    nivel: z
      .enum(['mascara_1', 'mascara_2', 'natureza'])
      .default('mascara_2')
      .describe('Até que nível detalhar: mascara_1 (só totais de nível 1 e entradas/saídas), mascara_2 ou natureza.'),
  },
  handler: ferramenta(async (empresaId, { inicio, fim, centros, nivel = 'mascara_2' }) => {
    if (fim < inicio) throw falha('O mês final precisa ser igual ou depois do inicial.');
    const ids = await resolverCentros(empresaId, centros);
    const f = await fluxoService.montar(empresaId, { inicio, fim, centros: ids });
    const chaves = f.colunas.map((c) => `${c.mes}|${c.tipo}`);
    const rotuloCol = (k) => k.replace('|', ' ');
    const valores = (pc) =>
      Object.fromEntries(chaves.filter((k) => pc[k] !== undefined && pc[k] !== 0).map((k) => [rotuloCol(k), r2(pc[k])]));
    const linhas = [{ nivel: 'saldo', rotulo: 'Saldo inicial', valores: valores(f.porColuna.saldoInicial) }];
    f.estrutura.forEach((n1) => {
      linhas.push({ nivel: 'mascara_1', rotulo: n1.descricao, valores: valores(n1.porColuna) });
      n1.lados.forEach((l) => {
        linhas.push({ nivel: 'entradas_saidas', rotulo: `${n1.descricao} › ${l.descricao}`, valores: valores(l.porColuna) });
        if (nivel === 'mascara_1') return;
        l.filhos.forEach((n2) => {
          linhas.push({ nivel: 'mascara_2', rotulo: `${l.descricao} › ${n2.descricao}`, valores: valores(n2.porColuna) });
          if (nivel !== 'natureza') return;
          n2.contas.forEach((c) =>
            linhas.push({ nivel: 'natureza', natureza_id: c.conta.sienge_id, rotulo: `${c.conta.codigo} ${c.conta.name}`, valores: valores(c.porColuna) })
          );
        });
      });
    });
    linhas.push({ nivel: 'resultado', rotulo: 'Resultado do mês', valores: valores(f.porColuna.resultado) });
    linhas.push({ nivel: 'saldo', rotulo: 'Saldo final', valores: valores(f.porColuna.saldoFinal) });
    return {
      periodo: { inicio, fim },
      mes_atual: f.mesAtual,
      colunas: chaves.map(rotuloCol),
      legenda: 'R = realizado (extrato bancário), P = projetado (versão salva do Orçamento). Valores em R$; células vazias = 0.',
      versao_orcamento: f.versao ? { numero: f.versao.numero, salva_em: f.versao.criado_em, por: f.versao.usuario } : null,
      extrato_buscado_ate: f.extratoAte,
      centros_filtrados: ids.length ? ids : 'todos',
      linhas,
    };
  }),
};
