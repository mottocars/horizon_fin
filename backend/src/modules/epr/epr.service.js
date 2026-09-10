const fs = require('fs');
const path = require('path');
const pool = require('../../config/db');
const { parsePdf } = require('./epr.python');

const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'epr');

function sanitizeContrato(contrato) {
  return String(contrato).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function importarPdf(empresaId, tempFilePath, originalName, usuarioId) {
  const { empreendimento, mutuarios } = await parsePdf(tempFilePath);
  const contrato = empreendimento.contrato_mestre_obra;

  const empresaDir = path.join(UPLOADS_DIR, String(empresaId));
  fs.mkdirSync(empresaDir, { recursive: true });
  const arquivoArmazenado = path.join(String(empresaId), `${sanitizeContrato(contrato)}.pdf`);
  const destinoAbsoluto = path.join(UPLOADS_DIR, arquivoArmazenado);
  fs.copyFileSync(tempFilePath, destinoAbsoluto);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      'DELETE FROM epr_mutuarios WHERE empresa_id = $1 AND contrato_mestre_obra = $2',
      [empresaId, contrato]
    );
    await client.query(
      'DELETE FROM epr_empreendimentos WHERE empresa_id = $1 AND contrato_mestre_obra = $2',
      [empresaId, contrato]
    );

    await client.query(
      `INSERT INTO epr_empreendimentos
         (empresa_id, contrato_mestre_obra, arquivo_original, arquivo_armazenado,
          nome_empreendimento, uno, unidade_financeira, data_inicio_obra, data_fim_obra,
          data_emissao_extrato, seguro_sgc_numero, seguro_sgc_vigencia, seguro_sre_numero,
          seguro_sre_vigencia, seguro_sgp_numero, seguro_sgp_vigencia, seguro_sgt_numero,
          seguro_sgt_vigencia, quantidade_mutuarios, enviado_por_usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        empresaId,
        contrato,
        originalName,
        arquivoArmazenado,
        empreendimento.nome_empreendimento || null,
        empreendimento.uno || null,
        empreendimento.unidade_financeira || null,
        empreendimento.data_inicio_obra || null,
        empreendimento.data_fim_obra || null,
        empreendimento.data_emissao_extrato || null,
        empreendimento.seguro_sgc_numero || null,
        empreendimento.seguro_sgc_vigencia || null,
        empreendimento.seguro_sre_numero || null,
        empreendimento.seguro_sre_vigencia || null,
        empreendimento.seguro_sgp_numero || null,
        empreendimento.seguro_sgp_vigencia || null,
        empreendimento.seguro_sgt_numero || null,
        empreendimento.seguro_sgt_vigencia || null,
        empreendimento.quantidade_mutuarios || 0,
        usuarioId || null,
      ]
    );

    for (const m of mutuarios) {
      await client.query(
        `INSERT INTO epr_mutuarios
           (empresa_id, contrato_mestre_obra, contrato_mutuario, nome_mutuario, uno, orr,
            to_codigo, cod, data_assinatura, tipo_unidade, garantia_automatica,
            data_inclusao_contrato, data_inclusao_registro, valor_retido, valor_amortizado,
            amortizado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          empresaId,
          contrato,
          m.contrato_mutuario,
          m.nome_mutuario || null,
          m.uno || null,
          m.orr || null,
          m.to_codigo || null,
          m.cod || null,
          m.data_assinatura || null,
          m.tipo_unidade || null,
          m.garantia_automatica || null,
          m.data_inclusao_contrato || null,
          m.data_inclusao_registro || null,
          m.valor_retido ?? 0,
          m.valor_amortizado ?? 0,
          m.amortizado ?? false,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    contrato_mestre_obra: contrato,
    nome_empreendimento: empreendimento.nome_empreendimento,
    quantidade_mutuarios: mutuarios.length,
  };
}

async function listEmpreendimentos(empresaId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.contrato_mestre_obra, e.nome_empreendimento, e.quantidade_mutuarios,
            e.arquivo_original, e.importado_em, e.atualizado_em, u.nome AS enviado_por
     FROM epr_empreendimentos e
     LEFT JOIN usuarios u ON u.id = e.enviado_por_usuario_id
     WHERE e.empresa_id = $1
     ORDER BY e.importado_em DESC`,
    [empresaId]
  );
  return rows;
}

async function excluir(empresaId, contratoMestreObra) {
  const { rows } = await pool.query(
    'SELECT arquivo_armazenado FROM epr_empreendimentos WHERE empresa_id = $1 AND contrato_mestre_obra = $2',
    [empresaId, contratoMestreObra]
  );
  const registro = rows[0];
  if (!registro) return false;

  await pool.query('DELETE FROM epr_empreendimentos WHERE empresa_id = $1 AND contrato_mestre_obra = $2', [
    empresaId,
    contratoMestreObra,
  ]);

  if (registro.arquivo_armazenado) {
    const caminhoAbsoluto = path.join(UPLOADS_DIR, registro.arquivo_armazenado);
    fs.unlink(caminhoAbsoluto, () => {});
  }

  return true;
}

async function getArquivo(empresaId, contratoMestreObra) {
  const { rows } = await pool.query(
    `SELECT arquivo_original, arquivo_armazenado FROM epr_empreendimentos
     WHERE empresa_id = $1 AND contrato_mestre_obra = $2`,
    [empresaId, contratoMestreObra]
  );
  const registro = rows[0];
  if (!registro) return null;

  const caminhoAbsoluto = path.join(UPLOADS_DIR, registro.arquivo_armazenado);
  if (!fs.existsSync(caminhoAbsoluto)) return null;

  return { caminhoAbsoluto, nomeOriginal: registro.arquivo_original || 'epr.pdf' };
}

async function getExportacao(empresaId, contratoMestreObra) {
  const { rows: empRows } = await pool.query(
    `SELECT * FROM epr_empreendimentos WHERE empresa_id = $1 AND contrato_mestre_obra = $2`,
    [empresaId, contratoMestreObra]
  );
  const empreendimento = empRows[0];
  if (!empreendimento) return null;

  const { rows: mutuarios } = await pool.query(
    `SELECT m.*, e.nome_empreendimento, e.arquivo_original
     FROM epr_mutuarios m
     JOIN epr_empreendimentos e
       ON e.empresa_id = m.empresa_id AND e.contrato_mestre_obra = m.contrato_mestre_obra
     WHERE m.empresa_id = $1 AND m.contrato_mestre_obra = $2
     ORDER BY m.id`,
    [empresaId, contratoMestreObra]
  );

  return { empreendimento, mutuarios };
}

async function getExportacaoTodos(empresaId) {
  const { rows: empreendimentos } = await pool.query(
    `SELECT * FROM epr_empreendimentos WHERE empresa_id = $1 ORDER BY nome_empreendimento ASC`,
    [empresaId]
  );

  const { rows: mutuarios } = await pool.query(
    `SELECT m.*, e.nome_empreendimento, e.arquivo_original
     FROM epr_mutuarios m
     JOIN epr_empreendimentos e
       ON e.empresa_id = m.empresa_id AND e.contrato_mestre_obra = m.contrato_mestre_obra
     WHERE m.empresa_id = $1
     ORDER BY m.contrato_mestre_obra ASC, m.id ASC`,
    [empresaId]
  );

  return { empreendimentos, mutuarios };
}

module.exports = {
  importarPdf,
  listEmpreendimentos,
  getArquivo,
  getExportacao,
  getExportacaoTodos,
  excluir,
};
