const pool = require('../../config/db');
const { classificador, mesesEntre } = require('../dfc-fluxo/fluxo.service');
const dfcOrcamento = require('../dfc-orcamento/dfcOrcamento.service');
const dfcSaldos = require('../dfc-saldos/dfcSaldos.service');

// Dashboard Econômico Financeiro › Gestão Matricial (pedido do usuário, 26/11/2026): o desvio da DFC
// (Realizado × Projetado) cruzado em Pilar × Pacote.
// - Mesmas regras da aba DFC (dfc-fluxo/fluxo.service.js::montar): Projetado = Orçamento da versão; Realizado =
//   extrato das contas com "Projeta DFC" achatado por rateio; só entra o que a DFC mostra (natureza com Máscara DFC
//   no plano que o centro usa — `classificar` ≠ null). Roda no contexto da versão PUBLICADA da DFC
//   (dashboards.routes.js), então o realizado vai até o fim do mês anterior ao atual (ou o corte da versão).
// - O desvio só compara meses com realizado: de `de` até min(`ate`, realizado_ate) — o resto do período não tem
//   com o que comparar (como o Desvio % da aba DFC).
// - Coluna = Pilar do CENTRO de custo (centros_custo_sienge.pilar_id); linha = Pacote da NATUREZA
//   (planos_financeiros_sienge.pacote_id). O responsável (e a foto) é o do próprio pilar / pacote, escolhido em
//   Cadastros › Máscaras (mascara_itens.responsavel_id — pedido do usuário, 26/11/2026; centro e conta não têm mais
//   responsável próprio).
// - Devolve os valores por centro × natureza (somados no período); o navegador monta a matriz, os totais e o
//   detalhamento da célula (EconomicoFinanceiro/matricial/modelo.js).

const r2 = (v) => Math.round(v * 100) / 100;

async function painel(empresaId, { de, ate, centros = [] }) {
  const filtro = centros.length ? new Set(centros.map(Number)) : null;
  const [cls, orcamento, realizado] = await Promise.all([
    classificador(empresaId),
    dfcOrcamento.orcamento(empresaId),
    dfcSaldos.realizado(empresaId, de, ate),
  ]);
  const realizadoAte = realizado.realizado_ate;
  const ateComparado = ate < realizadoAte ? ate : realizadoAte;
  const meses = de <= ateComparado ? new Set(mesesEntre(de, ateComparado)) : new Set();

  const soma = new Map(); // 'centro|natureza' -> { c, n, r, p }
  const lancar = (centroId, natureza, mes, campo, valor, tipoParcela) => {
    if (!valor || !meses.has(mes)) return;
    if (filtro && !filtro.has(Number(centroId))) return;
    if (!cls.classificar(centroId, natureza, tipoParcela || '')) return;
    const k = `${centroId}|${natureza}`;
    if (!soma.has(k)) soma.set(k, { c: Number(centroId), n: Number(natureza), r: 0, p: 0 });
    soma.get(k)[campo] += Number(valor);
  };
  orcamento.valores.forEach((v) => lancar(v.centro_id, v.sienge_id, v.mes, 'p', v.valor, v.tipo_parcela));
  realizado.valores.forEach((v) => lancar(v.centro_id, v.sienge_id, v.mes, 'r', v.valor, v.tipo_parcela));
  const valores = [...soma.values()].map((v) => [v.c, v.n, r2(v.r), r2(v.p)]).filter(([, , r, p]) => r || p);

  const idsCentros = [...new Set(valores.map((v) => v[0]))];
  const idsNaturezas = [...new Set(valores.map((v) => v[1]))];
  const [{ rows: centrosRows }, { rows: naturezasRows }, { rows: itens }] = await Promise.all([
    pool.query(
      `SELECT sienge_id AS id, name AS nome, apelido, pilar_id
         FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])`,
      [empresaId, idsCentros]
    ),
    pool.query(
      `SELECT sienge_id AS id, name AS nome, pacote_id
         FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id = ANY($2::int[])`,
      [empresaId, idsNaturezas]
    ),
    pool.query(
      `SELECT id, tipo, sequencia, descricao, responsavel_id FROM mascara_itens
        WHERE empresa_id = $1 AND tipo IN ('PILARES', 'PACOTES') ORDER BY tipo, sequencia`,
      [empresaId]
    ),
  ]);
  const idsUsuarios = [...new Set(itens.map((x) => x.responsavel_id).filter(Boolean))];
  const { rows: usuarios } = await pool.query('SELECT id, nome, avatar_url FROM usuarios WHERE id = ANY($1::int[])', [idsUsuarios]);

  const naturezas = naturezasRows.map((n) => ({ ...n, codigo: cls.conta(n.id).codigo }));
  // Natureza do realizado/orçamento que não está no cadastro (não deveria acontecer): entra sem pacote.
  idsNaturezas
    .filter((id) => !naturezas.some((n) => n.id === id))
    .forEach((id) => naturezas.push({ id, nome: cls.conta(id).name, codigo: cls.conta(id).codigo, pacote_id: null }));

  const daMascara = (tipo) =>
    itens.filter((i) => i.tipo === tipo).map(({ id, sequencia, descricao, responsavel_id }) => ({ id, sequencia, descricao, responsavel_id }));
  return {
    periodo: { de, ate, ate_comparado: meses.size ? ateComparado : null, realizado_ate: realizadoAte },
    versao: orcamento.versao ? { numero: orcamento.versao.numero } : null,
    pilares: daMascara('PILARES'),
    pacotes: daMascara('PACOTES'),
    centros: centrosRows,
    naturezas,
    usuarios,
    // [centro, natureza, realizado, projetado] no período comparado (com o sinal do caixa: saída negativa).
    valores,
  };
}

module.exports = { painel };
