const pool = require('../../config/db');

const ORIGEM = 'HORIZON_ORCAMENTO_INFORMADO';
const MAX_MESES = 240;

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// 'AAAA-MM' de cada mês entre os dois, inclusive.
function mesesEntre(de, ate) {
  const meses = [];
  let [ano, mes] = de.split('-').map(Number);
  const [anoFim, mesFim] = ate.split('-').map(Number);
  while ((ano < anoFim || (ano === anoFim && mes <= mesFim)) && meses.length <= MAX_MESES) {
    meses.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

// Valores informados da empresa: [{ centro_id, sienge_id, mes: 'AAAA-MM', valor }]. Linha com valor
// NULL = valor limpo (fica guardada só pra o log saber quem limpou) — não entra.
async function list(empresaId) {
  const { rows } = await pool.query(
    `SELECT centro_id, sienge_id, to_char(mes, 'YYYY-MM') AS mes, valor
       FROM dfc_orcamento_informado WHERE empresa_id = $1 AND valor IS NOT NULL`,
    [empresaId]
  );
  return rows.map((r) => ({ ...r, valor: Number(r.valor) }));
}

// Só aceita valor em centro com "Projeta DFC" e em conta com Origem Projeção "HORIZON - INFORMADO"
// (e "Projeta DFC" marcado) no plano que o centro usa — o próprio, se tiver, senão o Global.
async function exigirContaInformada(empresaId, centroId, siengeId) {
  const { rows: centro } = await pool.query(
    'SELECT projeta_dfc FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, centroId]
  );
  if (!centro[0]) throw erro(404, 'Centro de custo não encontrado nesta empresa.');
  if (!centro[0].projeta_dfc) throw erro(400, 'Centro de custo sem "Projeta DFC" (aba Centros Custos).');

  const { rows: versao } = await pool.query(
    'SELECT 1 FROM dfc_plano_contas_versoes WHERE empresa_id = $1 AND centro_id = $2',
    [empresaId, centroId]
  );
  const { rows: conta } = versao[0]
    ? await pool.query(
        `SELECT origem_projecao, projeta_dfc FROM dfc_plano_contas_centro
          WHERE empresa_id = $1 AND centro_id = $2 AND sienge_id = $3`,
        [empresaId, centroId, siengeId]
      )
    : await pool.query('SELECT origem_projecao, projeta_dfc FROM dfc_plano_contas WHERE empresa_id = $1 AND sienge_id = $2', [
        empresaId,
        siengeId,
      ]);
  if (conta[0]?.origem_projecao !== ORIGEM || conta[0]?.projeta_dfc === false) {
    throw erro(400, 'Só dá pra informar valor em conta com Origem Projeção "HORIZON - INFORMADO" (aba Plano Contas).');
  }
}

// Grava (ou limpa, com valor null / 0) o valor de um mês. Limpar grava NULL com quem limpou e quando
// (pro log de alterações da versão). Data do relógio da aplicação (o do Postgres da VPS é deslocado).
// Só vale no Orçamento depois de "Salvar Versão" (dfc-orcamento).
async function salvar(empresaId, { centro_id: centroId, sienge_id: siengeId, mes, valor }, usuarioId) {
  await exigirContaInformada(empresaId, centroId, siengeId);
  const gravado = valor === 0 ? null : valor;
  await pool.query(
    `INSERT INTO dfc_orcamento_informado (empresa_id, centro_id, sienge_id, mes, valor, usuario_id, atualizado_em, via_mcp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, false)
     ON CONFLICT (empresa_id, centro_id, sienge_id, mes)
     DO UPDATE SET valor = EXCLUDED.valor, usuario_id = EXCLUDED.usuario_id, atualizado_em = EXCLUDED.atualizado_em, via_mcp = false`,
    [empresaId, centroId, siengeId, `${mes}-01`, gravado, usuarioId, new Date()]
  );
  return { centro_id: centroId, sienge_id: siengeId, mes, valor: gravado };
}

// "Replicar valor até": grava `valor` em cada mês de `de` até `ate` (inclusive), por cima do que
// houver. Devolve os meses gravados. `viaMcp`: gravado pelo Claude (conector MCP).
async function replicar(empresaId, { centro_id: centroId, sienge_id: siengeId, de, ate, valor }, usuarioId, viaMcp = false) {
  if (ate < de) throw erro(400, 'A data final precisa ser igual ou depois do mês de origem.');
  const meses = mesesEntre(de, ate);
  if (meses.length > MAX_MESES) throw erro(400, `Replique no máximo ${MAX_MESES} meses de uma vez.`);
  await exigirContaInformada(empresaId, centroId, siengeId);
  await pool.query(
    `INSERT INTO dfc_orcamento_informado (empresa_id, centro_id, sienge_id, mes, valor, usuario_id, atualizado_em, via_mcp)
     SELECT $1, $2, $3, (m || '-01')::date, $5, $6, $7, $8 FROM unnest($4::text[]) AS m
     ON CONFLICT (empresa_id, centro_id, sienge_id, mes)
     DO UPDATE SET valor = EXCLUDED.valor, usuario_id = EXCLUDED.usuario_id, atualizado_em = EXCLUDED.atualizado_em, via_mcp = EXCLUDED.via_mcp`,
    [empresaId, centroId, siengeId, meses, valor, usuarioId, new Date(), viaMcp]
  );
  return { centro_id: centroId, sienge_id: siengeId, meses, valor };
}

// Contas onde dá pra informar valor (conector MCP "DFC CONSTRUTORAS (ALTERA ORÇAMENTO)"): centros com
// "Projeta DFC" × contas com Origem Projeção "HORIZON - INFORMADO" e "Projeta DFC" no plano do centro
// (o próprio, se tiver versão, senão o Global). `centroIds` vazio = todos os centros.
async function contasInformadas(empresaId, centroIds = []) {
  const { rows } = await pool.query(
    `WITH centros AS (
       SELECT c.sienge_id, c.name,
              EXISTS (SELECT 1 FROM dfc_plano_contas_versoes v WHERE v.empresa_id = c.empresa_id AND v.centro_id = c.sienge_id) AS proprio
         FROM centros_custo_sienge c
        WHERE c.empresa_id = $1 AND c.projeta_dfc AND (cardinality($2::int[]) = 0 OR c.sienge_id = ANY($2::int[]))
     )
     SELECT c.sienge_id AS centro_id, c.name AS centro, p.sienge_id, n.name AS natureza
       FROM centros c
       JOIN LATERAL (
         SELECT pc.sienge_id FROM dfc_plano_contas_centro pc
          WHERE c.proprio AND pc.empresa_id = $1 AND pc.centro_id = c.sienge_id AND pc.origem_projecao = $3 AND pc.projeta_dfc IS NOT FALSE
         UNION ALL
         SELECT pg.sienge_id FROM dfc_plano_contas pg
          WHERE NOT c.proprio AND pg.empresa_id = $1 AND pg.origem_projecao = $3 AND pg.projeta_dfc IS NOT FALSE
       ) p ON true
       LEFT JOIN planos_financeiros_sienge n ON n.empresa_id = $1 AND n.sienge_id = p.sienge_id
      ORDER BY c.name, p.sienge_id`,
    [empresaId, centroIds, ORIGEM]
  );
  return rows;
}

// Grava vários valores de uma vez (conector MCP), tudo ou nada: confere cada centro × conta antes e
// devolve o valor anterior (digitado, ainda não salvo em versão) e o novo. Valor 0 ou null limpa.
async function gravarVarios(empresaId, itens, usuarioId) {
  const conferidos = new Set();
  for (const it of itens) {
    const k = `${it.centro_id}|${it.sienge_id}`;
    if (conferidos.has(k)) continue;
    await exigirContaInformada(empresaId, it.centro_id, it.sienge_id);
    conferidos.add(k);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: antes } = await client.query(
      `SELECT i.centro_id, i.sienge_id, to_char(i.mes, 'YYYY-MM') AS mes, i.valor
         FROM dfc_orcamento_informado i
         JOIN json_to_recordset($2::json) AS x(centro_id int, sienge_id int, mes text)
           ON i.centro_id = x.centro_id AND i.sienge_id = x.sienge_id AND i.mes = (x.mes || '-01')::date
        WHERE i.empresa_id = $1`,
      [empresaId, JSON.stringify(itens)]
    );
    const anterior = new Map(antes.map((r) => [`${r.centro_id}|${r.sienge_id}|${r.mes}`, r.valor === null ? null : Number(r.valor)]));
    const gravar = itens.map((it) => ({ ...it, valor: it.valor === 0 ? null : it.valor }));
    await client.query(
      `INSERT INTO dfc_orcamento_informado (empresa_id, centro_id, sienge_id, mes, valor, usuario_id, atualizado_em, via_mcp)
       SELECT $1, x.centro_id, x.sienge_id, (x.mes || '-01')::date, x.valor, $3, $4, true
         FROM json_to_recordset($2::json) AS x(centro_id int, sienge_id int, mes text, valor numeric)
       ON CONFLICT (empresa_id, centro_id, sienge_id, mes)
       DO UPDATE SET valor = EXCLUDED.valor, usuario_id = EXCLUDED.usuario_id, atualizado_em = EXCLUDED.atualizado_em, via_mcp = true`,
      [empresaId, JSON.stringify(gravar), usuarioId, new Date()]
    );
    await client.query('COMMIT');
    return gravar.map((it) => ({ ...it, anterior: anterior.get(`${it.centro_id}|${it.sienge_id}|${it.mes}`) ?? null }));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { ORIGEM, list, salvar, replicar, contasInformadas, gravarVarios, mesesEntre };
