const pool = require('../../config/db');
const desembolso = require('../dfc-desembolso/desembolso.service');

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Onde fica a classificação: plano Global (centroId null — dfc_plano_contas, vale pra todos os
// centros) ou a versão própria de um centro de custo (dfc_plano_contas_centro). Os dois têm os
// mesmos campos; a versão do centro tem prioridade no Orçamento e na Projeção CEF.
// `filtro(apelido)`: o WHERE da versão, com o apelido da tabela quando a consulta tem JOIN.
function alvo(centroId) {
  return centroId
    ? {
        tabela: 'dfc_plano_contas_centro',
        filtro: (t = '') => `${t}empresa_id = $1 AND ${t}centro_id = $2`,
        chave: (empresaId) => [empresaId, centroId],
      }
    : { tabela: 'dfc_plano_contas', filtro: (t = '') => `${t}empresa_id = $1`, chave: (empresaId) => [empresaId] };
}

async function exigirVersao(db, empresaId, centroId) {
  if (!centroId) return;
  const { rows } = await db.query('SELECT 1 FROM dfc_plano_contas_versoes WHERE empresa_id = $1 AND centro_id = $2', [
    empresaId,
    centroId,
  ]);
  if (!rows[0]) throw erro(404, 'Este centro de custo não tem versão própria do plano de contas.');
}

// Máscara DFC, Origem da Projeção e "Projeta DFC" das contas (só as que têm algo fora do padrão),
// no Global ou na versão do centro. Conta sem linha = sem máscara, sem origem e Projeta DFC marcado.
async function list(empresaId, centroId = null) {
  await exigirVersao(pool, empresaId, centroId);
  const a = alvo(centroId);
  const { rows } = await pool.query(
    `SELECT sienge_id, mascara_id, origem_projecao, projeta_dfc FROM ${a.tabela} WHERE ${a.filtro()}`,
    a.chave(empresaId)
  );
  return rows;
}

// Grava (ou limpa) os campos de uma conta, no Global ou na versão do centro. Só conta analítica (o
// último nível — tp_conta diferente de 'T') e só máscara de nível 2 da mesma empresa. Tudo no padrão
// (sem máscara, sem origem e Projeta DFC marcado) = apaga a linha. Projeta DFC desmarcado = a conta
// não aparece no Orçamento dos centros que usam este plano. Origem "CEF - ..." só pode estar em UMA conta de cada versão (a
// Projeção CEF lança nela): se já estiver em outra, recusa com 409 (`codigo: 'ORIGEM_CEF_EM_USO'` e
// a conta atual) — a tela avisa e, confirmando, manda `transferir: true`, que tira a origem da
// outra conta na mesma transação.
async function update(
  empresaId,
  siengeId,
  { mascara_id: mascaraId, origem_projecao: origem, projeta_dfc: projeta = true },
  { transferir = false, centroId = null, usuarioId = null } = {}
) {
  const { rows: conta } = await pool.query(
    'SELECT tp_conta FROM planos_financeiros_sienge WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, siengeId]
  );
  if (!conta[0]) throw erro(404, 'Conta não encontrada no plano de contas desta empresa.');
  if (conta[0].tp_conta === 'T') throw erro(400, 'Conta totalizadora não recebe Máscara DFC nem Origem da Projeção.');

  if (mascaraId !== null) {
    const { rows: mascara } = await pool.query('SELECT parent_id FROM dfc_mascaras WHERE id = $1 AND empresa_id = $2', [
      mascaraId,
      empresaId,
    ]);
    if (!mascara[0]) throw erro(400, 'Máscara DFC não encontrada nesta empresa.');
    if (mascara[0].parent_id === null) throw erro(400, 'Escolha uma máscara DFC de nível 2.');
  }

  const a = alvo(centroId);
  const base = a.chave(empresaId); // [$1] ou [$1, $2]
  const pConta = `$${base.length + 1}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await exigirVersao(client, empresaId, centroId);
    let liberada = null; // conta de onde a origem CEF saiu (transferência)

    if (origem && origem.startsWith('CEF_')) {
      const { rows: outra } = await client.query(
        `SELECT d.sienge_id, p.name FROM ${a.tabela} d
           JOIN planos_financeiros_sienge p ON p.empresa_id = d.empresa_id AND p.sienge_id = d.sienge_id
          WHERE ${a.filtro('d.')}
            AND d.origem_projecao = ${pConta} AND d.sienge_id <> $${base.length + 2}
          FOR UPDATE OF d`,
        [...base, origem, siengeId]
      );
      if (outra[0] && !transferir) {
        const e = erro(409, `Essa origem já está na conta ${outra[0].sienge_id} - ${outra[0].name}.`);
        e.codigo = 'ORIGEM_CEF_EM_USO';
        e.conta = { sienge_id: outra[0].sienge_id, name: outra[0].name };
        throw e;
      }
      if (outra[0]) {
        await client.query(`UPDATE ${a.tabela} SET origem_projecao = NULL WHERE ${a.filtro()} AND sienge_id = ${pConta}`, [
          ...base,
          outra[0].sienge_id,
        ]);
        // Sem máscara e com Projeta DFC marcado, a linha volta ao padrão — apaga.
        await client.query(
          `DELETE FROM ${a.tabela} WHERE ${a.filtro()} AND sienge_id = ${pConta}
              AND mascara_id IS NULL AND origem_projecao IS NULL AND projeta_dfc`,
          [...base, outra[0].sienge_id]
        );
        liberada = outra[0].sienge_id;
      }
    }

    let salvo;
    if (mascaraId === null && origem === null && projeta) {
      await client.query(`DELETE FROM ${a.tabela} WHERE ${a.filtro()} AND sienge_id = ${pConta}`, [...base, siengeId]);
      salvo = { sienge_id: siengeId, mascara_id: null, origem_projecao: null, projeta_dfc: true };
    } else {
      const colunas = centroId ? 'empresa_id, centro_id, sienge_id' : 'empresa_id, sienge_id';
      const conflito = centroId ? '(empresa_id, centro_id, sienge_id)' : '(empresa_id, sienge_id)';
      const n = base.length;
      const { rows } = await client.query(
        `INSERT INTO ${a.tabela} (${colunas}, mascara_id, origem_projecao, projeta_dfc)
         VALUES (${[...base.map((_, i) => `$${i + 1}`), `$${n + 1}`, `$${n + 2}`, `$${n + 3}`, `$${n + 4}`].join(', ')})
         ON CONFLICT ${conflito}
         DO UPDATE SET mascara_id = EXCLUDED.mascara_id, origem_projecao = EXCLUDED.origem_projecao,
                       projeta_dfc = EXCLUDED.projeta_dfc
         RETURNING sienge_id, mascara_id, origem_projecao, projeta_dfc`,
        [...base, siengeId, mascaraId, origem, projeta]
      );
      salvo = rows[0];
    }
    await client.query('COMMIT');
    // Conta virou "SIENGE - EMPRESARIAL DESEMBOLSO": já calcula e guarda a ficha de desembolso dela
    // (aba Plano Contas, coluna da calculadora). Falha aqui não desfaz a classificação.
    let prazoDesembolso;
    if (origem === desembolso.ORIGEM) {
      prazoDesembolso = await desembolso
        .gravar(empresaId, siengeId, usuarioId)
        .then((f) => ({ prazo_medio: f.prazo_medio, prazo_mediano: f.prazo_mediano, sem_historico: Boolean(f.sem_historico) }))
        .catch((e) => {
          console.error('[dfc-desembolso] ficha não calculada:', e.message);
          return null;
        });
    }
    return { ...salvo, origem_retirada_de: liberada, ...(prazoDesembolso !== undefined ? { desembolso: prazoDesembolso } : {}) };
  } catch (e) {
    await client.query('ROLLBACK');
    // Corrida entre duas gravações: o índice único segura e vira a mesma resposta de "em uso".
    if (e.code === '23505') throw erro(409, 'Essa origem CEF já está em outra conta. Recarregue a tela.');
    throw e;
  } finally {
    client.release();
  }
}

// Centros que têm versão própria do plano.
async function listVersoes(empresaId) {
  const { rows } = await pool.query(
    `SELECT v.centro_id, c.name, v.criado_em, u.nome AS criado_por
       FROM dfc_plano_contas_versoes v
       JOIN centros_custo_sienge c ON c.empresa_id = v.empresa_id AND c.sienge_id = v.centro_id
       LEFT JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.empresa_id = $1
      ORDER BY c.name ASC`,
    [empresaId]
  );
  return rows;
}

// Cria a versão (plano próprio) do centro. `copiarDe` (escolhido pelo usuário na criação):
// 'global' = cópia do plano Global de agora; um id de centro = cópia do plano próprio daquele
// centro; 'branco' = sem nenhuma conta classificada.
async function criarVersao(empresaId, centroId, usuarioId, copiarDe = 'global') {
  const { rows: centro } = await pool.query(
    'SELECT name FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, centroId]
  );
  if (!centro[0]) throw erro(404, 'Centro de custo não encontrado nesta empresa.');
  if (copiarDe !== 'global' && copiarDe !== 'branco') {
    const { rows: origem } = await pool.query(
      'SELECT 1 FROM dfc_plano_contas_versoes WHERE empresa_id = $1 AND centro_id = $2',
      [empresaId, copiarDe]
    );
    if (!origem[0]) throw erro(400, 'O plano escolhido pra copiar não existe mais.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query('INSERT INTO dfc_plano_contas_versoes (empresa_id, centro_id, usuario_id) VALUES ($1, $2, $3)', [
        empresaId,
        centroId,
        usuarioId,
      ]);
    } catch (e) {
      if (e.code === '23505') throw erro(409, `${centro[0].name} já tem versão própria do plano de contas.`);
      throw e;
    }
    let rowCount = 0;
    if (copiarDe === 'global') {
      ({ rowCount } = await client.query(
        `INSERT INTO dfc_plano_contas_centro (empresa_id, centro_id, sienge_id, mascara_id, origem_projecao, projeta_dfc)
         SELECT empresa_id, $2, sienge_id, mascara_id, origem_projecao, projeta_dfc FROM dfc_plano_contas WHERE empresa_id = $1`,
        [empresaId, centroId]
      ));
    } else if (copiarDe !== 'branco') {
      ({ rowCount } = await client.query(
        `INSERT INTO dfc_plano_contas_centro (empresa_id, centro_id, sienge_id, mascara_id, origem_projecao, projeta_dfc)
         SELECT empresa_id, $2, sienge_id, mascara_id, origem_projecao, projeta_dfc FROM dfc_plano_contas_centro
          WHERE empresa_id = $1 AND centro_id = $3`,
        [empresaId, centroId, copiarDe]
      ));
    }
    await client.query('COMMIT');
    return { centro_id: centroId, name: centro[0].name, contas_copiadas: rowCount };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Exclui a versão do centro (as classificações dela vão junto, em cascata) — ele volta pro Global.
async function excluirVersao(empresaId, centroId) {
  const { rowCount } = await pool.query('DELETE FROM dfc_plano_contas_versoes WHERE empresa_id = $1 AND centro_id = $2', [
    empresaId,
    centroId,
  ]);
  if (!rowCount) throw erro(404, 'Este centro de custo não tem versão própria do plano de contas.');
  return { ok: true };
}

// Tudo de uma vez, pro Orçamento: o Global e a versão de cada centro que tem uma.
async function listTodas(empresaId) {
  const { rows: global } = await pool.query(
    'SELECT sienge_id, mascara_id, origem_projecao, projeta_dfc FROM dfc_plano_contas WHERE empresa_id = $1',
    [empresaId]
  );
  const { rows: porCentro } = await pool.query(
    'SELECT centro_id, sienge_id, mascara_id, origem_projecao, projeta_dfc FROM dfc_plano_contas_centro WHERE empresa_id = $1',
    [empresaId]
  );
  const versoes = await listVersoes(empresaId);
  const centros = Object.fromEntries(versoes.map((v) => [v.centro_id, []]));
  porCentro.forEach((r) => {
    centros[r.centro_id]?.push({
      sienge_id: r.sienge_id,
      mascara_id: r.mascara_id,
      origem_projecao: r.origem_projecao,
      projeta_dfc: r.projeta_dfc,
    });
  });
  return { global, centros };
}

// Resumo pros cards da aba Plano Contas: o Global e cada versão de centro, com quantas contas
// analíticas têm Máscara DFC / Origem Projeção. O Global diz também quantos centros com "Projeta
// DFC" seguem ele (os que não têm versão própria).
async function resumo(empresaId) {
  const { rows: tot } = await pool.query(
    "SELECT count(*)::int AS analiticas FROM planos_financeiros_sienge WHERE empresa_id = $1 AND tp_conta <> 'T'",
    [empresaId]
  );
  const { rows: g } = await pool.query(
    `SELECT count(mascara_id)::int AS com_mascara, count(origem_projecao)::int AS com_origem, MAX(atualizado_em) AS atualizado_em
       FROM dfc_plano_contas WHERE empresa_id = $1`,
    [empresaId]
  );
  const { rows: seguem } = await pool.query(
    `SELECT count(*)::int AS n FROM centros_custo_sienge c
      WHERE c.empresa_id = $1 AND c.projeta_dfc
        AND NOT EXISTS (SELECT 1 FROM dfc_plano_contas_versoes v WHERE v.empresa_id = c.empresa_id AND v.centro_id = c.sienge_id)`,
    [empresaId]
  );
  const { rows: versoes } = await pool.query(
    `SELECT v.centro_id, c.name, c.natureza, v.criado_em, u.nome AS criado_por,
            count(d.mascara_id)::int AS com_mascara, count(d.origem_projecao)::int AS com_origem,
            MAX(d.atualizado_em) AS atualizado_em
       FROM dfc_plano_contas_versoes v
       JOIN centros_custo_sienge c ON c.empresa_id = v.empresa_id AND c.sienge_id = v.centro_id
       LEFT JOIN usuarios u ON u.id = v.usuario_id
       LEFT JOIN dfc_plano_contas_centro d ON d.empresa_id = v.empresa_id AND d.centro_id = v.centro_id
      WHERE v.empresa_id = $1
      GROUP BY v.centro_id, c.name, c.natureza, v.criado_em, u.nome
      ORDER BY c.name ASC`,
    [empresaId]
  );
  return {
    analiticas: tot[0].analiticas,
    global: { ...g[0], centros_seguindo: seguem[0].n },
    versoes,
  };
}

module.exports = { list, update, listVersoes, criarVersao, excluirVersao, listTodas, resumo };
