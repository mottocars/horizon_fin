const pool = require('../../config/db');
const executor = require('../monitor-integracoes/executor');

// Orçamento Empresarial do Sienge no Orçamento do DFC (pedido do usuário), a partir da base
// sincronizada pela rotina "Base do orçamento empresarial (Sienge)" (sie_business_budget*):
// - só a ÚLTIMA versão (maior versionNumber) de cada orçamento;
// - cada natureza orçada (paymentCategories.id) cai no seu centro de custo (costCenterId), só nas
//   contas com Origem Projeção "SIENGE - EMPRESARIAL DESEMBOLSO" e "Projeta DFC" marcado no plano que
//   o centro usa (o próprio, se tiver, senão o Global), e só em centros com "Projeta DFC";
// - o valor orçado num mês sai INTEIRO depois do prazo médio de desembolso da natureza ("Prazo
//   Desemb." da ficha — dfc_desembolso_fichas.prazo_medio, dias da emissão ao vencimento dos títulos
//   do contas a pagar), em meses: arredondamento de prazo ÷ 30 (contando do meio do mês orçado — 36
//   dias = mês seguinte). Pedido do usuário: só a média, sem espalhar pela curva. Natureza sem ficha,
//   sem histórico ou sem prazo médio: sai no próprio mês (e avisa);
// - saída de caixa: valor negativo.

const ROTINA = 'dfc_orcamento_empresarial_base';
const ORIGEM = 'SIENGE_ORCAMENTO_EMPRESARIAL';

// 'AAAA-MM' + k meses.
function somarMeses(anoMes, k) {
  const [a, m] = anoMes.split('-').map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

// Meses entre o mês orçado e o da saída de caixa, pelo prazo médio da ficha. Sem prazo: null.
function deslocamentoDe(ficha) {
  if (!ficha || ficha.prazo_medio === null || ficha.prazo_medio === undefined || ficha.ficha?.sem_historico) return null;
  return Math.max(0, Math.round(Number(ficha.prazo_medio) / 30));
}

// Orçamentos da última versão: cada orçamento (`id`, um por centro de custo) pode vir em várias
// versões — fica a de maior versionNumber.
const SQL_ULTIMA_VERSAO = `
  SELECT DISTINCT ON (b.id) b.registro_id, b.id, b.version_number, b.description, b.cost_center_id
    FROM sie_business_budget b
   WHERE b.empresa_id = $1
   ORDER BY b.id, b.version_number DESC NULLS LAST, b.registro_id DESC`;

async function base(empresaId) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS registros, count(DISTINCT id)::int AS orcamentos, MAX(atualizado_em) AS atualizado_em
       FROM sie_business_budget WHERE empresa_id = $1`,
    [empresaId]
  );
  return { ...rows[0], parcelas: rows[0].registros };
}

// Valores pro Orçamento: [{ centro_id, conta, mes, valor }] (já espalhados e negativos), as versões
// usadas e as naturezas sem cronograma.
async function valores(empresaId) {
  const { rows } = await pool.query(
    `WITH ultima AS (${SQL_ULTIMA_VERSAO}),
     centros AS (
       SELECT c.sienge_id AS centro_id,
              EXISTS (SELECT 1 FROM dfc_plano_contas_versoes v
                       WHERE v.empresa_id = c.empresa_id AND v.centro_id = c.sienge_id) AS proprio
         FROM centros_custo_sienge c
        WHERE c.empresa_id = $1 AND c.projeta_dfc
     ),
     contas AS (
       SELECT ce.centro_id, g.sienge_id
         FROM centros ce JOIN dfc_plano_contas g ON g.empresa_id = $1
        WHERE NOT ce.proprio AND g.origem_projecao = '${ORIGEM}' AND g.projeta_dfc
       UNION ALL
       SELECT ce.centro_id, p.sienge_id
         FROM centros ce JOIN dfc_plano_contas_centro p ON p.empresa_id = $1 AND p.centro_id = ce.centro_id
        WHERE ce.proprio AND p.origem_projecao = '${ORIGEM}' AND p.projeta_dfc
     )
     SELECT ct.centro_id, ct.sienge_id AS conta, to_char(v.mes, 'YYYY-MM') AS mes, SUM(v.total_price) AS valor,
            array_agg(DISTINCT u.id) AS orcamentos, MAX(u.version_number) AS versao
       FROM ultima u
       JOIN sie_business_budget_categorias c ON c.registro_id = u.registro_id
       JOIN sie_business_budget_valores v ON v.categoria_id = c.categoria_id
       JOIN contas ct ON ct.centro_id = u.cost_center_id AND ct.sienge_id::text = c.id
      -- type 'T' = linha totalizadora do orçamento (soma das de baixo) — só as analíticas entram.
      WHERE v.mes IS NOT NULL AND COALESCE(v.total_price, 0) <> 0 AND COALESCE(c.type, '') <> 'T'
      GROUP BY 1, 2, 3`,
    [empresaId]
  );
  const { rows: fichas } = await pool.query(
    'SELECT sienge_id, prazo_medio, ficha FROM dfc_desembolso_fichas WHERE empresa_id = $1',
    [empresaId]
  );
  const deslocamentos = new Map(fichas.map((f) => [f.sienge_id, deslocamentoDe(f)]));

  const saida = new Map(); // 'centro|conta|mes' -> centavos
  const semCronograma = new Set();
  rows.forEach((r) => {
    const k = deslocamentos.get(r.conta);
    if (k === null || k === undefined) semCronograma.add(r.conta);
    const centavos = -Math.round(Number(r.valor) * 100); // saída de caixa
    if (!centavos) return;
    const chave = `${r.centro_id}|${r.conta}|${somarMeses(r.mes, k ?? 0)}`;
    saida.set(chave, (saida.get(chave) || 0) + centavos);
  });

  const { rows: versoes } = await pool.query(
    `SELECT u.id, u.version_number, u.description, u.cost_center_id FROM (${SQL_ULTIMA_VERSAO}) u ORDER BY u.cost_center_id, u.id`,
    [empresaId]
  );
  return {
    valores: [...saida.entries()]
      .filter(([, c]) => c !== 0)
      .map(([chave, c]) => {
        const [centro, conta, mes] = chave.split('|');
        return { centro_id: Number(centro), conta: Number(conta), mes, valor: c / 100 };
      }),
    versoes,
    sem_cronograma: [...semCronograma],
    base: await base(empresaId),
  };
}

// Botão "Atualizar" da janela Nova versão: dispara a rotina do Monitor de Integrações.
async function atualizarBase(empresaId, usuarioId) {
  return executor.iniciar(empresaId, ROTINA, { origem: 'manual', usuarioId });
}

async function execucao(empresaId) {
  return executor.getExecucaoAtualOuUltima(empresaId, ROTINA);
}

module.exports = { ROTINA, ORIGEM, SQL_ULTIMA_VERSAO, valores, base, atualizarBase, execucao, deslocamentoDe, somarMeses };
