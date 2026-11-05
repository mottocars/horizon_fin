const pool = require('../../config/db');
const { ehEmpresaModelo } = require('../../utils/empresaModelo');

// ---------------------------------------------------------------------------------------
// Simulação das integrações da empresa modelo: o que a tela recebe quando um botão de
// sincronizar/testar/enviar é usado na HZN CONSTRUTORA. Nada sai para fora do sistema — os
// dados da empresa modelo são remontados pelo scripts/empresa-modelo/montar.js.
// ---------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resumo plausível de cada rotina do Monitor, contado nos dados da própria empresa modelo.
const CONTAGENS = {
  sienge_centros_custo: ['SELECT COUNT(*)::int n FROM centros_custo_sienge WHERE empresa_id = $1', (n) => `${n} centros de custo sincronizados com o Sienge.`],
  sienge_plano_contas: ['SELECT COUNT(*)::int n FROM planos_financeiros_sienge WHERE empresa_id = $1', (n) => `${n} contas do plano financeiro sincronizadas.`],
  cobranca_clientes: ['SELECT COUNT(*)::int n FROM sie_customers WHERE empresa_id = $1', (n) => `${n} clientes atualizados.`],
  cobranca_base: ['SELECT COUNT(*)::int n FROM sie_income WHERE empresa_id = $1', (n) => `${n} parcelas do contas a receber atualizadas.`],
  dfc_contas_pagar_base: ['SELECT COUNT(*)::int n FROM sie_outcome WHERE empresa_id = $1', (n) => `${n} parcelas do contas a pagar atualizadas.`],
  dfc_saldos_contas: ['SELECT COUNT(*)::int n FROM sie_extrato_contas WHERE empresa_id = $1', (n) => `${n} lançamentos do extrato das contas atualizados.`],
  repasses_contratos: ['SELECT COUNT(*)::int n FROM sie_sales_contracts WHERE empresa_id = $1', (n) => `${n} contratos de venda sincronizados.`],
  repasses_reservas: ['SELECT COUNT(*)::int n FROM construtor_vendas_reservas WHERE empresa_id = $1', (n) => `${n} reservas do Construtor de Vendas sincronizadas.`],
  dfc_orcamento_empresarial_base: ['SELECT COUNT(*)::int n FROM sie_business_budget WHERE empresa_id = $1', (n) => `${n} orçamentos empresariais atualizados.`],
  prevision_dashboards: ['SELECT COUNT(DISTINCT sienge_id)::int n FROM prevision_dashboard_general_info WHERE empresa_id = $1', (n) => `${n} obras com curva S e avanço físico atualizados.`],
  espiao_vinculacao: ["SELECT COUNT(*)::int n FROM espiao_notas WHERE empresa_id = $1 AND NOT inativa AND id NOT IN (SELECT nota_id FROM espiao_notas_vinculos)", (n) => `0 nota(s) vinculada(s) de ${n} sem vínculo`],
  itau_certificado: ['SELECT COUNT(*)::int n FROM conexoes_itau WHERE empresa_id = $1 AND ativo', (n) => `${n} conexões API Itaú com certificado válido, sem necessidade de renovar.`],
};

async function resumoRotina(empresaId, rotina) {
  const def = CONTAGENS[rotina];
  if (!def) return 'Execução simulada (empresa modelo).';
  const { rows } = await pool.query(def[0], [empresaId]);
  return def[1](rows[0]?.n ?? 0);
}

// Rotina do Monitor na empresa modelo: as que chamam sistemas externos são simuladas (com
// progresso e um tempinho de execução); as internas (clusters, distribuição) rodam de verdade.
async function executarRotinaSimulada(rotina, { empresaId, progresso, etapas }) {
  const passos = ['Conectando à integração', 'Lendo os dados', 'Gravando no Horizon'];
  etapas?.(passos.map((p) => ({ nome: p, status: 'pendente' })));
  for (let i = 0; i < passos.length; i += 1) {
    progresso?.({ texto: `${passos[i]}…`, atual: i + 1, total: passos.length });
    etapas?.(passos.map((p, j) => ({ nome: p, status: j < i ? 'concluida' : j === i ? 'executando' : 'pendente' })));
    await sleep(700 + Math.round(Math.random() * 600));
  }
  etapas?.(passos.map((p) => ({ nome: p, status: 'concluida' })));
  return resumoRotina(empresaId, rotina);
}

// Rotinas que não chamam nada externo e podem rodar normalmente na empresa modelo.
const ROTINAS_INTERNAS = new Set(['cobranca_clusters', 'cobranca_distribuicao']);

async function deveSimularRotina(empresaId, rotina) {
  if (ROTINAS_INTERNAS.has(rotina)) return false;
  return ehEmpresaModelo(empresaId);
}

// Envio de WhatsApp/e-mail de uma conexão da empresa modelo: ninguém recebe nada.
async function integracaoDaEmpresaModelo(tabela, id) {
  if (!id) return false;
  const { rows } = await pool.query(`SELECT empresa_id FROM ${tabela} WHERE id = $1`, [id]);
  return rows[0] ? ehEmpresaModelo(rows[0].empresa_id) : false;
}
function envioSimulado(canal) {
  const id = `SIMULADO-${Date.now().toString(36).toUpperCase()}`;
  return canal === 'email'
    ? { messageId: id, accepted: ['simulado'], rejected: [], response: '250 Simulado (empresa modelo)', simulado: true }
    : { zaapId: id, messageId: id, id, simulado: true };
}

module.exports = { executarRotinaSimulada, deveSimularRotina, integracaoDaEmpresaModelo, envioSimulado, resumoRotina };
