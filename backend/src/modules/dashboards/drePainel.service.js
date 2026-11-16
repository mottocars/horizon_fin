const pool = require('../../config/db');
const demonstrativo = require('../dre-demonstrativo/demonstrativo.service');
const pocService = require('../dre-demonstrativo/poc.service');
const mascaras = require('../dre-mascaras/dreMascaras.service');
const { ORDEM: ORDEM_CENTROS } = require('../dre-centros/dreCentros.service');
const { hojeEmBrasilia } = require('../extrato-contas-sienge/extratoContas-api.client');

// Dashboard Econômico Financeiro › Demonstração do Resultado: tudo o que o painel do CFO usa, num pedido
// só, do MESMO motor da aba DRE do DRE Gerencial (demonstrativo.service.js / poc.service.js) — os
// números batem com ela. O realizado nunca passa de hoje; com o Fim depois de hoje, só a tabela da DRE
// (`tabela`) vai até ele, para mostrar a projeção.
//   arvore    — as máscaras (nível 1 com os filhos), na ordem da DRE;
//   atual     — a DRE do período (consolidado, por centro, mês a mês);
//   anterior  — a DRE do mesmo período do ano anterior (consolidado e mês a mês), pra comparação;
//   poc       — o rastreio da POC por obra (unidades, POC de Receita e de Despesa, cada linha com POC);
//   centros   — os centros com "Realiza DRE" (pro filtro), na ordem da aba Centros Custos.

const doisDigitos = (n) => String(n).padStart(2, '0');

// Mesma data um ano antes (29/02 vira 28/02).
function umAnoAntes(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a - 1, m, 0)).getUTCDate();
  return `${a - 1}-${doisDigitos(m)}-${doisDigitos(Math.min(d, ultimo))}`;
}

async function painel(empresaId, { de, ate, centros = [] }) {
  const hoje = hojeEmBrasilia();
  const fim = ate > hoje ? hoje : ate;
  const inicio = de > fim ? fim : de;
  const anterior = { de: umAnoAntes(inicio), ate: umAnoAntes(fim) };
  const filtro = { centros };
  // Fim depois de hoje (pedido do usuário: ver a projeção até onde ela vai): só a tabela da DRE vai até ele
  // (`tabela`, com os meses futuros vazios no realizado — o motor nunca passa de hoje — e o Projetado da
  // versão salva). O resto do painel (indicadores, comparação com o ano anterior, POC) fica no realizado até hoje.
  // A tabela respeita também o Início pedido, mesmo depois de hoje (jan–dez/2027 = só 2027, como a aba DRE do
  // DRE Gerencial): antes ele era cortado em hoje e o Projetado somava nov–dez/2026 junto.
  const ateTabela = ate > fim ? ate : fim;
  const deTabela = de <= ateTabela ? de : inicio;
  const tabelaPropria = ateTabela !== fim || deTabela !== inicio;

  const [arvore, atual, ant, rastreio, empresa, listaCentros, tabela] = await Promise.all([
    mascaras.list(empresaId),
    demonstrativo.calcular(empresaId, { de: inicio, ate: fim, ...filtro }),
    demonstrativo.calcular(empresaId, { de: anterior.de, ate: anterior.ate, ...filtro }),
    pocService.rastrear(empresaId, { de: inicio, ate: fim, ...filtro }),
    pool.query(`SELECT COALESCE(NULLIF(nome_fantasia, ''), razao_social) AS nome FROM empresas WHERE id = $1`, [empresaId]),
    pool.query(
      `SELECT sienge_id::int AS id, name AS nome, COALESCE(NULLIF(TRIM(apelido), ''), name) AS rotulo, natureza
         FROM centros_custo_sienge WHERE empresa_id = $1 AND realiza_dre ORDER BY ${ORDEM_CENTROS}`,
      [empresaId]
    ),
    tabelaPropria ? demonstrativo.calcular(empresaId, { de: deTabela, ate: ateTabela, ...filtro }) : null,
  ]);

  return {
    meta: { empresa: empresa.rows[0]?.nome || null, hoje, de: inicio, ate: fim, de_tabela: deTabela, ate_tabela: ateTabela, anterior },
    arvore,
    atual,
    // Só quando o período pedido passa de hoje (senão a tabela é a própria `atual`).
    ...(tabela ? { tabela } : {}),
    anterior: { valores: ant.valores, meses: ant.meses },
    poc: rastreio,
    centros: listaCentros.rows,
  };
}

module.exports = { painel, umAnoAntes };
