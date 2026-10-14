const pool = require('../../config/db');
const executor = require('../monitor-integracoes/executor');

// Orçamento Empresarial do Sienge no Orçamento do DFC (pedido do usuário), a partir da base
// sincronizada pela rotina "Base do orçamento empresarial (Sienge)" (sie_business_budget*):
// - só a ÚLTIMA versão (maior versionNumber) de cada orçamento;
// - cada natureza orçada (paymentCategories.id) cai no seu centro de custo (costCenterId), só nas
//   contas com Origem Projeção "SIENGE - EMPRESARIAL DESEMBOLSO" e "Projeta DFC" marcado no plano que
//   o centro usa (o próprio, se tiver, senão o Global), e só em centros com "Projeta DFC";
// - o valor orçado num mês NÃO sai inteiro nesse mês: é espalhado pelo cronograma de desembolso da
//   natureza — a curva da ficha de desembolso (dfc_desembolso_fichas: % do valor que sai em M0, M+1,
//   ... M+6 ou mais, a partir dos títulos do contas a pagar). Natureza sem ficha ou sem histórico:
//   sai inteiro no próprio mês (e avisa);
// - saída de caixa: valor negativo.

const ROTINA = 'dfc_orcamento_empresarial_base';
const ORIGEM = 'SIENGE_ORCAMENTO_EMPRESARIAL';
const MESES_CURVA = ['M0', 'M+1', 'M+2', 'M+3', 'M+4', 'M+5', 'M+6 ou mais'];

// 'AAAA-MM' + k meses.
function somarMeses(anoMes, k) {
  const [a, m] = anoMes.split('-').map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

// Cronograma da natureza: [[deslocamento em meses, fração]], somando 1. A partir da curva da ficha
// (percentuais com 1 casa, então normaliza). Sem curva: tudo no próprio mês.
function cronogramaDe(ficha) {
  const curva = ficha?.curva;
  if (!curva || ficha.sem_historico) return null;
  const pares = MESES_CURVA.map((mes, k) => [k, Number(curva.find((c) => c.mes === mes)?.pct_valor || 0)]).filter(
    ([, p]) => p > 0
  );
  const total = pares.reduce((t, [, p]) => t + p, 0);
  return total > 0 ? pares.map(([k, p]) => [k, p / total]) : null;
}

// Espalha `valor` (em centavos, pra o total bater exato) pelo cronograma: o arredondamento fica na
// maior parcela.
function espalhar(centavos, cronograma) {
  const partes = cronograma.map(([k, f]) => [k, Math.round(centavos * f)]);
  const diferenca = centavos - partes.reduce((t, [, c]) => t + c, 0);
  if (diferenca) {
    const maior = partes.reduce((a, b, i, arr) => (Math.abs(b[1]) > Math.abs(arr[a][1]) ? i : a), 0);
    partes[maior][1] += diferenca;
  }
  return partes;
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
    'SELECT sienge_id, ficha FROM dfc_desembolso_fichas WHERE empresa_id = $1',
    [empresaId]
  );
  const cronogramas = new Map(fichas.map((f) => [f.sienge_id, cronogramaDe(f.ficha)]));

  const saida = new Map(); // 'centro|conta|mes' -> centavos
  const semCronograma = new Set();
  rows.forEach((r) => {
    const cronograma = cronogramas.get(r.conta);
    if (!cronograma) semCronograma.add(r.conta);
    const centavos = -Math.round(Number(r.valor) * 100); // saída de caixa
    espalhar(centavos, cronograma || [[0, 1]]).forEach(([k, c]) => {
      if (!c) return;
      const chave = `${r.centro_id}|${r.conta}|${somarMeses(r.mes, k)}`;
      saida.set(chave, (saida.get(chave) || 0) + c);
    });
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

module.exports = { ROTINA, ORIGEM, valores, base, atualizarBase, execucao, espalhar, cronogramaDe, somarMeses };
