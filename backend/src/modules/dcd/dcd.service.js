const fs = require('fs');
const path = require('path');
const pool = require('../../config/db');
const { parsePdf } = require('./dcd.python');

const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'dcd');

const CONTRATO_FIELDS = [
  'numero_contrato',
  'emitente',
  'nome_empreendimento',
  'origem_recurso',
  'numero_pedido',
  'codigo_pedido',
  'linha_financiamento',
  'numero_empreendimento',
  'situacao_pedido',
  'tipo_financiamento',
  'quantidade_parcelas',
  'data_termino_suspensiva',
  'regencia_critica',
  'numero_apf',
  'data_inicio_rotina_atraso_obra',
  'prazo_obra_atual',
  'codigo_seguradora_sgc',
  'apolice_seguro_sgc',
  'prazo_obra_original',
  'codigo_seguradora_sre',
  'apolice_seguro_sre',
  'percentual_minimo_obra',
  'codigo_seguradora_sgp',
  'apolice_seguro_sgp',
  'adiantamento_defasagem_obra',
  'codigo_seguradora_sgt',
  'apolice_seguro_sgt',
  'tipo_rotina',
  'quantidade_unidades',
  'quantidade_unidades_financiadas',
  'quantidade_unidades_comercializadas',
  'valor_custo_obra',
  'total_financiamento',
  'despesa_legal_terreno_financiamento',
  'orcamento_compra_venda',
  'total_fgts',
  'despesa_legal_terreno_fgts',
  'valor_compra_venda_unidade',
  'total_recurso_proprio_mutuario',
  'despesa_legal_terreno_recurso_proprio',
  'valor_compra_venda_terreno',
  'percentual_obra_executada',
  'valor_financiamento_outro_agente',
  'saldo_mutuario_pf',
  'data_assinatura',
  'valor_terreno_outro_agente',
  'saldo_aporte_construtora',
  'data_inicio_obra',
  'valor_aporte_construtora',
  'saldo_mutuario_pj',
  'data_termino_obra_original',
  'valor_financiamento_pj',
  'saldo_devedor_pj',
  'data_termino_obra_atual',
  'garantia_termino_obra',
  'subsidio_resolucao_460',
  'subsidio_convenios',
  'custo_terreno',
  'total_suplementacao_pj',
  'maximo_liberacao_geral_pj',
  'reducao_maxima_geral_pj',
  'valor_minimo_garantia_hipotecaria',
  'maximo_liberacao_etapa_pj',
  'reducao_maxima_etapa_pj',
  'recomposicao_etapa_pj',
  'amortizacao_recomposicao_etapa_pj',
  'recomposicao_sem_registro_etapa_pj',
  'percentual_antecipacao_pj',
  'valor_total_antecipacao_pj',
];

const CRONO_FF_FIELDS = [
  'parcela',
  'data_parcela',
  'percentual_etapa',
  'percentual_acumulado',
  'valor_compra_venda',
  'valor_fgts',
  'valor_rp_mutuario',
  'valor_rp_aportado',
  'valor_desconto',
  'valor_financiamento_mutuario',
  'valor_rp_construtora',
  'valor_financiamento_construtora',
];

const CRONO_LIB_FIELDS = [
  'parcela',
  'data_parcela',
  'status',
  'fgts',
  'rp_mutuario',
  'desconto',
  'financiamento_mutuario',
  'aporte_construtora_ci',
  'aporte_terreno',
  'financiamento_construtora',
  'recomposicao_pj',
  'remuneracao',
];

function sanitizeContrato(contrato) {
  return String(contrato).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function importarPdf(empresaId, tempFilePath, originalName, usuarioId) {
  const { contrato, cronograma_fisico_financeiro: cronoFF, cronograma_liberacao: cronoLib } =
    await parsePdf(tempFilePath);
  const numeroContrato = contrato.numero_contrato;

  const empresaDir = path.join(UPLOADS_DIR, String(empresaId));
  fs.mkdirSync(empresaDir, { recursive: true });
  const arquivoArmazenado = path.join(String(empresaId), `${sanitizeContrato(numeroContrato)}.pdf`);
  const destinoAbsoluto = path.join(UPLOADS_DIR, arquivoArmazenado);
  fs.copyFileSync(tempFilePath, destinoAbsoluto);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      'DELETE FROM dcd_cronograma_liberacao WHERE empresa_id = $1 AND numero_contrato = $2',
      [empresaId, numeroContrato]
    );
    await client.query(
      'DELETE FROM dcd_cronograma_fisico_financeiro WHERE empresa_id = $1 AND numero_contrato = $2',
      [empresaId, numeroContrato]
    );
    await client.query('DELETE FROM dcd_contratos WHERE empresa_id = $1 AND numero_contrato = $2', [
      empresaId,
      numeroContrato,
    ]);

    const contratoColumns = [
      'empresa_id',
      'arquivo_original',
      'arquivo_armazenado',
      'enviado_por_usuario_id',
      ...CONTRATO_FIELDS,
    ];
    const contratoValues = [
      empresaId,
      originalName,
      arquivoArmazenado,
      usuarioId || null,
      ...CONTRATO_FIELDS.map((f) => contrato[f] ?? null),
    ];
    const contratoPlaceholders = contratoColumns.map((_, i) => `$${i + 1}`).join(', ');
    await client.query(
      `INSERT INTO dcd_contratos (${contratoColumns.join(', ')}) VALUES (${contratoPlaceholders})`,
      contratoValues
    );

    for (const p of cronoFF) {
      const columns = ['empresa_id', 'numero_contrato', ...CRONO_FF_FIELDS];
      const values = [empresaId, numeroContrato, ...CRONO_FF_FIELDS.map((f) => p[f] ?? null)];
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `INSERT INTO dcd_cronograma_fisico_financeiro (${columns.join(', ')}) VALUES (${placeholders})`,
        values
      );
    }

    for (const p of cronoLib) {
      const columns = ['empresa_id', 'numero_contrato', ...CRONO_LIB_FIELDS];
      const values = [empresaId, numeroContrato, ...CRONO_LIB_FIELDS.map((f) => p[f] ?? null)];
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `INSERT INTO dcd_cronograma_liberacao (${columns.join(', ')}) VALUES (${placeholders})`,
        values
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
    numero_contrato: numeroContrato,
    nome_empreendimento: contrato.nome_empreendimento,
    quantidade_parcelas_ff: cronoFF.length,
    quantidade_parcelas_liberacao: cronoLib.length,
  };
}

async function listContratos(empresaId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.numero_contrato, c.nome_empreendimento, c.quantidade_parcelas,
            c.arquivo_original, c.importado_em, c.atualizado_em, u.nome AS enviado_por
     FROM dcd_contratos c
     LEFT JOIN usuarios u ON u.id = c.enviado_por_usuario_id
     WHERE c.empresa_id = $1
     ORDER BY c.importado_em DESC`,
    [empresaId]
  );
  return rows;
}

async function excluir(empresaId, numeroContrato) {
  const { rows } = await pool.query(
    'SELECT arquivo_armazenado FROM dcd_contratos WHERE empresa_id = $1 AND numero_contrato = $2',
    [empresaId, numeroContrato]
  );
  const registro = rows[0];
  if (!registro) return false;

  await pool.query('DELETE FROM dcd_contratos WHERE empresa_id = $1 AND numero_contrato = $2', [
    empresaId,
    numeroContrato,
  ]);

  if (registro.arquivo_armazenado) {
    const caminhoAbsoluto = path.join(UPLOADS_DIR, registro.arquivo_armazenado);
    fs.unlink(caminhoAbsoluto, () => {});
  }

  return true;
}

async function getArquivo(empresaId, numeroContrato) {
  const { rows } = await pool.query(
    `SELECT arquivo_original, arquivo_armazenado FROM dcd_contratos
     WHERE empresa_id = $1 AND numero_contrato = $2`,
    [empresaId, numeroContrato]
  );
  const registro = rows[0];
  if (!registro) return null;

  const caminhoAbsoluto = path.join(UPLOADS_DIR, registro.arquivo_armazenado);
  if (!fs.existsSync(caminhoAbsoluto)) return null;

  return { caminhoAbsoluto, nomeOriginal: registro.arquivo_original || 'dcd.pdf' };
}

async function getExportacao(empresaId, numeroContrato) {
  const { rows: contratoRows } = await pool.query(
    'SELECT * FROM dcd_contratos WHERE empresa_id = $1 AND numero_contrato = $2',
    [empresaId, numeroContrato]
  );
  const contrato = contratoRows[0];
  if (!contrato) return null;

  const { rows: cronogramaFF } = await pool.query(
    'SELECT * FROM dcd_cronograma_fisico_financeiro WHERE empresa_id = $1 AND numero_contrato = $2 ORDER BY id',
    [empresaId, numeroContrato]
  );
  const { rows: cronogramaLib } = await pool.query(
    'SELECT * FROM dcd_cronograma_liberacao WHERE empresa_id = $1 AND numero_contrato = $2 ORDER BY id',
    [empresaId, numeroContrato]
  );

  return { contrato, cronogramaFF, cronogramaLib };
}

async function getExportacaoTodos(empresaId) {
  const { rows: contratos } = await pool.query(
    'SELECT * FROM dcd_contratos WHERE empresa_id = $1 ORDER BY nome_empreendimento ASC',
    [empresaId]
  );
  const { rows: cronogramaFF } = await pool.query(
    `SELECT c.* FROM dcd_cronograma_fisico_financeiro c
     WHERE c.empresa_id = $1
     ORDER BY c.numero_contrato ASC, c.id ASC`,
    [empresaId]
  );
  const { rows: cronogramaLib } = await pool.query(
    `SELECT c.* FROM dcd_cronograma_liberacao c
     WHERE c.empresa_id = $1
     ORDER BY c.numero_contrato ASC, c.id ASC`,
    [empresaId]
  );

  return { contratos, cronogramaFF, cronogramaLib };
}

module.exports = {
  importarPdf,
  listContratos,
  getArquivo,
  getExportacao,
  getExportacaoTodos,
  excluir,
};
