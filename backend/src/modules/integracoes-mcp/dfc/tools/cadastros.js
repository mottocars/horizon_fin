const pool = require('../../../../config/db');
const dfcMascaras = require('../../../dfc-mascaras/dfcMascaras.service');
const { classificador } = require('../../../dfc-fluxo/fluxo.service');
const { z, r2, ferramenta } = require('./comum');

// Cadastros do DFC pra o Claude achar ids e nomes: centros de custo, naturezas (com máscara, origem
// da projeção e prazo médio de desembolso), máscaras e contas bancárias.

module.exports = {
  name: 'dfc_cadastros',
  description:
    'Lista cadastros do DFC: centros_custo (id, nome, tipo, Projeta DFC, contrato Caixa), naturezas (código, nome, máscara DFC ' +
    'nível 1/2 do plano Global, origem da projeção, Projeta DFC, prazo médio de desembolso), mascaras (árvore nível 1 › 2) e ' +
    'contas_bancarias (empresa, conta, banco, tipo, Projeta DFC). Filtro "busca" por parte do nome.',
  inputSchema: {
    tipo: z.enum(['centros_custo', 'naturezas', 'mascaras', 'contas_bancarias']),
    busca: z.string().optional().describe('Parte do nome (opcional).'),
  },
  handler: ferramenta(async (empresaId, { tipo, busca }) => {
    const filtro = `%${busca || ''}%`;
    if (tipo === 'centros_custo') {
      const { rows } = await pool.query(
        `SELECT sienge_id AS id, name AS nome, natureza AS tipo, projeta_dfc, codigo_contrato_caixa AS contrato_caixa
           FROM centros_custo_sienge WHERE empresa_id = $1 AND name ILIKE $2 ORDER BY projeta_dfc DESC, name`,
        [empresaId, filtro]
      );
      return rows;
    }
    if (tipo === 'mascaras') {
      const arvore = await dfcMascaras.list(empresaId);
      return arvore.map((g) => ({ id: g.id, mascara_1: g.descricao, mascaras_2: g.filhos.map((f) => ({ id: f.id, mascara_2: f.descricao })) }));
    }
    if (tipo === 'contas_bancarias') {
      const { rows } = await pool.query(
        `SELECT company_name AS empresa, numero_conta AS conta, nome, banco_nome AS banco, tipo_descricao AS tipo, projeta_dfc
           FROM contas_bancarias_sienge WHERE empresa_id = $1 AND (nome ILIKE $2 OR numero_conta ILIKE $2 OR company_name ILIKE $2)
          ORDER BY projeta_dfc DESC, company_name, numero_conta`,
        [empresaId, filtro]
      );
      return rows;
    }
    const [cls, { rows }] = await Promise.all([
      classificador(empresaId),
      pool.query(
        `SELECT f.sienge_id, f.name, g.mascara_id, g.origem_projecao, COALESCE(g.projeta_dfc, TRUE) AS projeta_dfc, d.prazo_medio
           FROM planos_financeiros_sienge f
           LEFT JOIN dfc_plano_contas g ON g.empresa_id = f.empresa_id AND g.sienge_id = f.sienge_id
           LEFT JOIN dfc_desembolso_fichas d ON d.empresa_id = f.empresa_id AND d.sienge_id = f.sienge_id
          WHERE f.empresa_id = $1 AND COALESCE(f.tp_conta, '') <> 'T' AND f.name ILIKE $2
          ORDER BY f.sienge_id LIMIT 400`,
        [empresaId, filtro]
      ),
    ]);
    const pai = {};
    cls.mascaras.forEach((g) => g.filhos.forEach((f) => (pai[f.id] = g.id)));
    return rows.map((r) => ({
      id: r.sienge_id,
      codigo: cls.conta(r.sienge_id).codigo,
      nome: r.name,
      mascara_1: r.mascara_id ? cls.nomeMascara[pai[r.mascara_id]] || null : null,
      mascara_2: r.mascara_id ? cls.nomeMascara[r.mascara_id] || null : 'sem Máscara DFC (fica fora do fluxo)',
      origem_projecao: r.origem_projecao,
      projeta_dfc: r.projeta_dfc,
      prazo_medio_desembolso_dias: r.prazo_medio === null ? null : r2(r.prazo_medio),
    }));
  }),
};
