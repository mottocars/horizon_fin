const pool = require('../../config/db');
const bancosApi = require('../contas-bancarias-sienge/bancos-api.client');

// Só dígitos do banco_numero que o Sienge devolve ("104", "001", "341"...).
const DIGITOS_BANCO_SQL = `REGEXP_REPLACE(c.banco_numero, '[^0-9]', '', 'g')`;

// Banco "de verdade" da conta: o que o usuário escolheu na edição da conta
// (banco_enriquecido) ou, na falta dele, o código que o Sienge traz. É o mesmo
// critério que a tela de edição usa pra pré-preencher o banco.
const BANCO_EFETIVO_SQL = `COALESCE(
  NULLIF(c.banco_enriquecido, ''),
  CASE WHEN c.banco_numero ~ '[0-9]' THEN
    CASE WHEN LENGTH(${DIGITOS_BANCO_SQL}) <= 3 THEN LPAD(${DIGITOS_BANCO_SQL}, 3, '0') ELSE ${DIGITOS_BANCO_SQL} END
  END
)`;

const SEM_CLASSIFICACAO = 'SEM_CLASSIFICACAO';

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Master enxerga todas as empresas; os demais só as vinculadas ao próprio cadastro
// (mesma regra que o frontend usa em useEmpresaTravada).
async function assertAcessoEmpresa(usuarioId, empresaId) {
  const { rows } = await pool.query(
    `SELECT u.permissao,
            EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = $2) AS vinculado
     FROM usuarios u
     WHERE u.id = $1 AND u.ativo = TRUE`,
    [usuarioId, empresaId]
  );
  const usuario = rows[0];
  if (!usuario || (usuario.permissao !== 'MASTER' && !usuario.vinculado)) {
    throw erro(403, 'Você não tem acesso a esta empresa.');
  }
}

// Opções dos filtros de Empresas e Banco — sempre a lista completa da empresa, não a
// já filtrada (senão as opções encolheriam conforme o usuário filtra).
async function getFiltros(empresaId) {
  const { rows: empresas } = await pool.query(
    `SELECT company_id, MAX(company_name) AS company_name
     FROM contas_bancarias_sienge
     WHERE empresa_id = $1
     GROUP BY company_id
     ORDER BY MAX(company_name) ASC NULLS LAST, company_id ASC`,
    [empresaId]
  );

  const { rows: usados } = await pool.query(
    `SELECT codigo, MAX(banco_nome) AS banco_nome
     FROM (SELECT ${BANCO_EFETIVO_SQL} AS codigo, c.banco_nome
           FROM contas_bancarias_sienge c
           WHERE c.empresa_id = $1) t
     WHERE codigo IS NOT NULL
     GROUP BY codigo
     ORDER BY codigo`,
    [empresaId]
  );

  // Nome do banco: o da lista oficial (BrasilAPI + internos); se ela estiver fora do ar
  // ou não conhecer o código (ex.: 901 "Escritório 01" do Sienge), cai no nome que o
  // Sienge mandou, e por último no próprio código. A logomarca só existe pros bancos da
  // lista oficial que têm uma (a tela mostra o código do banco no lugar quando não tem).
  let oficiais = new Map();
  try {
    oficiais = new Map((await bancosApi.getBancos()).map((b) => [b.codigo, b]));
  } catch {
    // segue só com os nomes vindos do Sienge
  }
  const bancos = usados.map((b) => ({
    codigo: b.codigo,
    nome: oficiais.get(b.codigo)?.nome || b.banco_nome || b.codigo,
    logo: oficiais.get(b.codigo)?.logo || null,
  }));

  return { empresas, bancos };
}

// Contas + o saldo informado de cada dia do período. Contas inativas (DISABLED) só
// aparecem se tiverem algum saldo lançado no período — senão são 130 linhas de ruído —,
// assim nenhum lançamento antigo some da tela.
async function getSaldos(empresaId, { dataInicio, dataFim, companyIds = [], classificacoes = [], bancos = [] }) {
  const params = [empresaId, dataInicio, dataFim];
  let filtros = '';
  if (companyIds.length) {
    params.push(companyIds);
    filtros += ` AND c.company_id = ANY($${params.length}::int[])`;
  }
  if (classificacoes.length) {
    params.push(classificacoes);
    filtros += ` AND COALESCE(c.classificacao, '${SEM_CLASSIFICACAO}') = ANY($${params.length}::text[])`;
  }
  if (bancos.length) {
    params.push(bancos);
    filtros += ` AND ${BANCO_EFETIVO_SQL} = ANY($${params.length}::text[])`;
  }

  const { rows: contas } = await pool.query(
    `SELECT c.numero_conta, c.company_id, c.company_name, c.nome, c.classificacao, c.status,
            ${BANCO_EFETIVO_SQL} AS banco_codigo
     FROM contas_bancarias_sienge c
     WHERE c.empresa_id = $1
       AND (c.status = 'ENABLED' OR EXISTS (
             SELECT 1 FROM saldos_contas_bancarias s
             WHERE s.empresa_id = c.empresa_id AND s.company_id = c.company_id
               AND s.numero_conta = c.numero_conta AND s.data BETWEEN $2 AND $3))
       ${filtros}
     ORDER BY c.nome ASC NULLS LAST, c.numero_conta ASC, c.company_id ASC`,
    params
  );

  const { rows: saldos } = await pool.query(
    `SELECT s.company_id, s.numero_conta, TO_CHAR(s.data, 'YYYY-MM-DD') AS data, s.saldo
     FROM saldos_contas_bancarias s
     WHERE s.empresa_id = $1 AND s.data BETWEEN $2 AND $3`,
    [empresaId, dataInicio, dataFim]
  );

  const porConta = new Map();
  for (const s of saldos) {
    const chave = `${s.company_id}|${s.numero_conta}`;
    if (!porConta.has(chave)) porConta.set(chave, {});
    porConta.get(chave)[s.data] = Number(s.saldo);
  }

  return {
    contas: contas.map((c) => ({
      ...c,
      saldos: porConta.get(`${c.company_id}|${c.numero_conta}`) || {},
    })),
  };
}

// Grava um lote de saldos numa transação só: saldo = null apaga o lançamento do dia
// ("não informado"), qualquer número (inclusive 0 e negativo — cheque especial) grava.
async function salvarSaldos(empresaId, usuarioId, itens) {
  // Mesmo (conta, dia) duas vezes no lote faria o ON CONFLICT tentar mexer na mesma
  // linha 2x e o Postgres recusa — vale o último.
  const porChave = new Map();
  for (const item of itens) porChave.set(`${item.company_id}|${item.numero_conta}|${item.data}`, item);
  const unicos = [...porChave.values()];

  const gravar = unicos.filter((i) => i.saldo !== null);
  const apagar = unicos.filter((i) => i.saldo === null);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (gravar.length) {
      await client.query(
        `INSERT INTO saldos_contas_bancarias (empresa_id, company_id, numero_conta, data, saldo, atualizado_por)
         SELECT $1, t.company_id, t.numero_conta, t.data, t.saldo, $2
         FROM unnest($3::int[], $4::text[], $5::date[], $6::numeric[]) AS t(company_id, numero_conta, data, saldo)
         ON CONFLICT (empresa_id, company_id, numero_conta, data)
         DO UPDATE SET saldo = EXCLUDED.saldo, atualizado_por = EXCLUDED.atualizado_por`,
        [
          empresaId,
          usuarioId,
          gravar.map((i) => i.company_id),
          gravar.map((i) => i.numero_conta),
          gravar.map((i) => i.data),
          gravar.map((i) => i.saldo.toFixed(2)),
        ]
      );
    }

    if (apagar.length) {
      await client.query(
        `DELETE FROM saldos_contas_bancarias s
         USING unnest($2::int[], $3::text[], $4::date[]) AS t(company_id, numero_conta, data)
         WHERE s.empresa_id = $1 AND s.company_id = t.company_id
           AND s.numero_conta = t.numero_conta AND s.data = t.data`,
        [empresaId, apagar.map((i) => i.company_id), apagar.map((i) => i.numero_conta), apagar.map((i) => i.data)]
      );
    }

    await client.query('COMMIT');
    return { gravados: gravar.length, apagados: apagar.length };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // 23503 = violação de FK: a conta informada não existe nesta empresa.
    if (err.code === '23503') throw erro(400, 'Conta bancária não encontrada nesta empresa.');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { assertAcessoEmpresa, getFiltros, getSaldos, salvarSaldos, SEM_CLASSIFICACAO };
