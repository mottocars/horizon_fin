const pool = require('../../config/db');
const { nomeDe } = require('./dfcVersoes.service');

// O carimbo de cada alteração da DFC (aba Versões: Versão › Módulo › Usuário › Alteração) — o mesmo da DRE
// (dre-versoes/carimbo.js). Chamado pelos controllers das abas depois que a alteração deu certo, com o pedido
// (`req.dfc` vem de contexto.js) e a descrição em português. `chave`: edições seguidas do mesmo item pelo mesmo
// usuário viram uma linha só (a mais recente atualiza a anterior) — ex.: valores digitados mês a mês. Sem versão
// aberta não grava nada (a alteração nem chega aqui: é recusada antes).

const db = pool.base;

async function registrar(req, { descricao, detalhes = null, chave = null, modulo = null }) {
  const ctx = req.dfc;
  if (!ctx || ctx.modo !== 'trabalho' || !descricao) return;
  const versaoId = ctx.versao.id;
  const usuarioId = req.user?.id || null;
  const nome = await nomeDe(usuarioId);
  const mod = modulo || ctx.modulo;
  const agora = new Date();
  if (chave) {
    const { rows } = await db.query(
      `SELECT id, chave, modulo FROM dfc_versao_alteracoes WHERE versao_id = $1 AND usuario_id IS NOT DISTINCT FROM $2
        ORDER BY id DESC LIMIT 1`,
      [versaoId, usuarioId]
    );
    if (rows[0] && rows[0].chave === chave && rows[0].modulo === mod) {
      await db.query('UPDATE dfc_versao_alteracoes SET descricao = $2, detalhes = $3, criado_em = $4 WHERE id = $1', [
        rows[0].id,
        descricao,
        detalhes,
        agora,
      ]);
      return;
    }
  }
  await db.query(
    `INSERT INTO dfc_versao_alteracoes (versao_id, modulo, usuario_id, usuario_nome, criado_em, descricao, detalhes, chave)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [versaoId, mod, usuarioId, nome, agora, descricao, detalhes, chave]
  );
}

// Não deixa o carimbo derrubar a resposta de uma alteração que já foi feita.
async function carimbar(req, dados) {
  try {
    await registrar(req, dados);
  } catch (e) {
    console.error('[dfc-versoes] carimbo:', e.message);
  }
}

// ------------------------------------------------------------------------------------- textos

const sn = (v) => (v ? 'Sim' : 'Não');
const txt = (v) => (v === null || v === undefined || v === '' ? '(vazio)' : `"${v}"`);
const moeda = (v) =>
  v === null || v === undefined || v === '' ? '(vazio)' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const mesBR = (v) => (v ? `${String(v).slice(5, 7)}/${String(v).slice(0, 4)}` : '(vazio)');

// "Rótulo: antes → depois" de cada campo que mudou. `campos`: { campo: [rótulo, formatar?] }.
function mudancas(antes, depois, campos) {
  return Object.entries(campos)
    .filter(([c]) => depois && Object.prototype.hasOwnProperty.call(depois, c) && String(antes?.[c] ?? '') !== String(depois[c] ?? ''))
    .map(([c, [rotulo, f = txt]]) => `${rotulo}: ${f(antes?.[c])} → ${f(depois[c])}`);
}

// Rótulos lidos no public (os nomes de agora).
async function rotuloCentro(empresaId, id) {
  const { rows } = await db.query(
    "SELECT COALESCE(NULLIF(TRIM(apelido), ''), name) AS nome FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2",
    [empresaId, id]
  );
  return `${id} - ${rows[0]?.nome || 'centro de custo'}`;
}

async function rotuloConta(empresaId, siengeId) {
  const { rows } = await db.query('SELECT name FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id::text = $2::text', [
    empresaId,
    String(siengeId),
  ]);
  return `${siengeId} ${rows[0]?.name || ''}`.trim();
}

async function nomeMascara(id) {
  if (id === null || id === undefined) return '(vazio)';
  const { rows } = await db.query('SELECT descricao FROM dfc_mascaras WHERE id = $1', [id]);
  return rows[0] ? `"${rows[0].descricao}"` : `máscara ${id}`;
}

// Os mesmos nomes das telas (orcamentoValores.js, DfcCentrosTab.jsx).
const ROTULOS = {
  origemProjecao: {
    CEF_NOVO_REGISTRO: 'CEF - NOVO REGISTRO',
    CEF_MEDICAO: 'CEF - MEDIÇÃO',
    CEF_CREDITO_PJ: 'CEF - CRÉDITO PJ',
    CEF_JUROS: 'CEF - JUROS',
    CEF_AMORTIZACAO: 'CEF - AMORTIZAÇÃO',
    SIENGE_ORCAMENTO_EMPRESARIAL: 'SIENGE - EMPRESARIAL DESEMBOLSO',
    SIENGE_AGING: 'SIENGE - AGING',
    HORIZON_ORCAMENTO_INFORMADO: 'HORIZON - INFORMADO',
  },
  natureza: { OBRA: 'Obra', ADMINISTRATIVO: 'Administrativo' },
  detalhamento: { PLANO_CONTAS: 'Plano de contas', TIPO_PARCELA: 'Tipo de parcela' },
};
const rotulo = (tabela) => (v) => (v === null || v === undefined || v === '' ? '(vazio)' : ROTULOS[tabela][v] || v);

module.exports = { carimbar, registrar, mudancas, sn, txt, moeda, mesBR, rotuloCentro, rotuloConta, nomeMascara, ROTULOS, rotulo };
