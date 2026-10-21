const pool = require('../../config/db');
const saldosService = require('../saldo-contas-bancarias/saldos.service');

// Aba Configurações de Cronogramas Obras (cronograma_config + cronograma_comunicar_usuarios — ver
// database/migrations/2026-10-21-cronograma-configuracoes.sql). Por enquanto só guarda os
// parâmetros: a regra de atraso ainda não entra em nenhum cálculo e o comunicado de alteração de
// cronograma ainda não é enviado.

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// Conexões ativas da empresa por canal — a tela escolhe a conexão sem precisar de acesso às telas de
// Integrações.
async function conexoes(empresaId, db = pool) {
  const [{ rows: zapi }, { rows: email }] = await Promise.all([
    db.query('SELECT id, nome_conexao AS nome FROM integracoes_zapi WHERE empresa_id = $1 AND ativo ORDER BY nome_conexao', [empresaId]),
    db.query('SELECT id, nome_conexao AS nome FROM integracoes_email WHERE empresa_id = $1 AND ativo ORDER BY nome_conexao', [empresaId]),
  ]);
  return { WHATSAPP: zapi, EMAIL: email };
}

async function getConfig(empresaId) {
  const [elegiveis, opcoesConexao, { rows: selecionados }, { rows: config }] = await Promise.all([
    saldosService.listUsuariosElegiveisComunicar(empresaId),
    conexoes(empresaId),
    pool.query('SELECT usuario_id FROM cronograma_comunicar_usuarios WHERE empresa_id = $1', [empresaId]),
    pool.query('SELECT * FROM cronograma_config WHERE empresa_id = $1', [empresaId]),
  ]);
  const c = config[0] || {};
  return {
    atrasoRegra: c.atraso_regra ?? null,
    atrasoMeses: c.atraso_meses ?? null,
    atrasoSistema: c.atraso_sistema ?? null,
    comunicarCanal: c.comunicar_canal ?? null,
    conexaoId: (c.comunicar_canal === 'EMAIL' ? c.email_integracao_id : c.zapi_integracao_id) ?? null,
    usuarioIds: selecionados.map((r) => r.usuario_id),
    elegiveis,
    opcoesConexao,
    atualizadoEm: c.atualizado_em ?? null,
  };
}

async function salvarConfig(empresaId, dados, usuarioId) {
  const elegiveis = await saldosService.listUsuariosElegiveisComunicar(empresaId);
  const idsElegiveis = new Set(elegiveis.map((u) => u.id));
  if (dados.usuarioIds.some((id) => !idsElegiveis.has(id))) {
    throw erro(400, 'Um ou mais usuários selecionados não têm acesso a esta empresa.');
  }
  if (dados.conexaoId !== null) {
    const opcoes = await conexoes(empresaId);
    if (!opcoes[dados.comunicarCanal].some((c) => c.id === dados.conexaoId)) {
      throw erro(400, 'Conexão inválida para esta empresa e este canal.');
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO cronograma_config
         (empresa_id, atraso_regra, atraso_meses, atraso_sistema, comunicar_canal, zapi_integracao_id, email_integracao_id, atualizado_por, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (empresa_id) DO UPDATE SET
         atraso_regra = EXCLUDED.atraso_regra,
         atraso_meses = EXCLUDED.atraso_meses,
         atraso_sistema = EXCLUDED.atraso_sistema,
         comunicar_canal = EXCLUDED.comunicar_canal,
         zapi_integracao_id = EXCLUDED.zapi_integracao_id,
         email_integracao_id = EXCLUDED.email_integracao_id,
         atualizado_por = EXCLUDED.atualizado_por,
         atualizado_em = NOW()`,
      [
        empresaId,
        dados.atrasoRegra,
        dados.atrasoMeses,
        dados.atrasoSistema,
        dados.comunicarCanal,
        dados.comunicarCanal === 'WHATSAPP' ? dados.conexaoId : null,
        dados.comunicarCanal === 'EMAIL' ? dados.conexaoId : null,
        usuarioId,
      ]
    );
    await client.query('DELETE FROM cronograma_comunicar_usuarios WHERE empresa_id = $1', [empresaId]);
    if (dados.usuarioIds.length) {
      await client.query('INSERT INTO cronograma_comunicar_usuarios (empresa_id, usuario_id) SELECT $1, unnest($2::int[])', [
        empresaId,
        dados.usuarioIds,
      ]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getConfig(empresaId);
}

module.exports = { getConfig, salvarConfig };
