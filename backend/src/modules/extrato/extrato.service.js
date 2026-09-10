const fs = require('fs');
const path = require('path');
const pool = require('../../config/db');
const { parseXls } = require('./extrato.python');

const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'extrato');

const EMPREENDIMENTO_FIELDS = [
  'nome_empreendimento',
  'entidade_organizadora',
  'cnpj_entidade_organizadora',
  'identificacao_empreendimento',
  'apf',
  'unidade_federacao',
  'municipio',
];

const UNIDADE_FIELDS = [
  'tipo_unidade',
  'numero_contrato_unidade',
  'nome_mutuario',
  'cpf_cnpj_mutuario',
  'data_assinatura_contrato',
  'data_inclusao_dados_registro_cri',
  'valor_financiamento',
  'valor_financiamento_terreno',
  'valor_desconto_subsidio_complementar',
  'valor_fgts',
  'valor_recursos_proprios',
  'valor_compra_venda',
  'valor_avaliacao_imovel',
  'fracao_ideal',
  'data_inicio_atraso_obra',
  'unidade_desligada',
];

const EVENTO_FIELDS = ['data_evento', 'origem', 'evento', 'parcela', 'valor'];

function sanitizeContrato(contrato) {
  return String(contrato).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function agruparPorContrato(itens) {
  const mapa = new Map();
  for (const item of itens) {
    const contrato = item.contrato_empreendimento;
    if (!mapa.has(contrato)) mapa.set(contrato, []);
    mapa.get(contrato).push(item);
  }
  return mapa;
}

async function importarXls(empresaId, tempFilePath, originalName, usuarioId) {
  const { unidades, cronograma, proximos_eventos: proximosEventos } = await parseXls(tempFilePath);

  const unidadesPorContrato = agruparPorContrato(unidades);
  const cronogramaPorContrato = agruparPorContrato(cronograma);
  const proximosPorContrato = agruparPorContrato(proximosEventos);
  const contratos = [...unidadesPorContrato.keys()];

  const empresaDir = path.join(UPLOADS_DIR, String(empresaId));
  fs.mkdirSync(empresaDir, { recursive: true });
  const arquivoArmazenado = path.join(
    String(empresaId),
    `${Date.now()}_${sanitizeContrato(originalName)}`
  );
  const destinoAbsoluto = path.join(UPLOADS_DIR, arquivoArmazenado);
  fs.copyFileSync(tempFilePath, destinoAbsoluto);

  const resultado = [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const contrato of contratos) {
      const unidadesContrato = unidadesPorContrato.get(contrato) || [];
      const cronogramaContrato = cronogramaPorContrato.get(contrato) || [];
      const proximosContrato = proximosPorContrato.get(contrato) || [];
      const primeira = unidadesContrato[0];

      await client.query(
        'DELETE FROM extrato_proximos_eventos WHERE empresa_id = $1 AND contrato_empreendimento = $2',
        [empresaId, contrato]
      );
      await client.query(
        'DELETE FROM extrato_cronograma WHERE empresa_id = $1 AND contrato_empreendimento = $2',
        [empresaId, contrato]
      );
      await client.query(
        'DELETE FROM extrato_unidades WHERE empresa_id = $1 AND contrato_empreendimento = $2',
        [empresaId, contrato]
      );
      await client.query(
        'DELETE FROM extrato_empreendimentos WHERE empresa_id = $1 AND contrato_empreendimento = $2',
        [empresaId, contrato]
      );

      const empreendimentoColumns = [
        'empresa_id',
        'contrato_empreendimento',
        'arquivo_original',
        'arquivo_armazenado',
        'enviado_por_usuario_id',
        ...EMPREENDIMENTO_FIELDS,
      ];
      const empreendimentoValues = [
        empresaId,
        contrato,
        originalName,
        arquivoArmazenado,
        usuarioId || null,
        ...EMPREENDIMENTO_FIELDS.map((f) => primeira[f] ?? null),
      ];
      const empreendimentoPlaceholders = empreendimentoColumns.map((_, i) => `$${i + 1}`).join(', ');
      await client.query(
        `INSERT INTO extrato_empreendimentos (${empreendimentoColumns.join(', ')}) VALUES (${empreendimentoPlaceholders})`,
        empreendimentoValues
      );

      for (const u of unidadesContrato) {
        const columns = ['empresa_id', 'contrato_empreendimento', ...UNIDADE_FIELDS];
        const values = [empresaId, contrato, ...UNIDADE_FIELDS.map((f) => u[f] ?? null)];
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO extrato_unidades (${columns.join(', ')}) VALUES (${placeholders})`,
          values
        );
      }

      for (const ev of cronogramaContrato) {
        const columns = ['empresa_id', 'contrato_empreendimento', ...EVENTO_FIELDS];
        const values = [empresaId, contrato, ...EVENTO_FIELDS.map((f) => ev[f] ?? null)];
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO extrato_cronograma (${columns.join(', ')}) VALUES (${placeholders})`,
          values
        );
      }

      for (const ev of proximosContrato) {
        const columns = ['empresa_id', 'contrato_empreendimento', ...EVENTO_FIELDS];
        const values = [empresaId, contrato, ...EVENTO_FIELDS.map((f) => ev[f] ?? null)];
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO extrato_proximos_eventos (${columns.join(', ')}) VALUES (${placeholders})`,
          values
        );
      }

      resultado.push({
        contrato_empreendimento: contrato,
        nome_empreendimento: primeira.nome_empreendimento,
        quantidade_unidades: unidadesContrato.length,
      });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    quantidade_empreendimentos: resultado.length,
    empreendimentos: resultado,
  };
}

async function listEmpreendimentos(empresaId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.contrato_empreendimento, e.nome_empreendimento, e.entidade_organizadora,
            e.municipio, e.unidade_federacao, e.arquivo_original, e.importado_em, e.atualizado_em,
            u.nome AS enviado_por,
            (SELECT COUNT(*) FROM extrato_unidades un
              WHERE un.empresa_id = e.empresa_id AND un.contrato_empreendimento = e.contrato_empreendimento) AS quantidade_unidades
     FROM extrato_empreendimentos e
     LEFT JOIN usuarios u ON u.id = e.enviado_por_usuario_id
     WHERE e.empresa_id = $1
     ORDER BY e.importado_em DESC`,
    [empresaId]
  );
  return rows;
}

async function excluir(empresaId, contratoEmpreendimento) {
  const { rows } = await pool.query(
    'SELECT arquivo_armazenado FROM extrato_empreendimentos WHERE empresa_id = $1 AND contrato_empreendimento = $2',
    [empresaId, contratoEmpreendimento]
  );
  const registro = rows[0];
  if (!registro) return false;

  await pool.query(
    'DELETE FROM extrato_empreendimentos WHERE empresa_id = $1 AND contrato_empreendimento = $2',
    [empresaId, contratoEmpreendimento]
  );

  if (registro.arquivo_armazenado) {
    const { rows: outros } = await pool.query(
      'SELECT 1 FROM extrato_empreendimentos WHERE empresa_id = $1 AND arquivo_armazenado = $2 LIMIT 1',
      [empresaId, registro.arquivo_armazenado]
    );
    if (outros.length === 0) {
      const caminhoAbsoluto = path.join(UPLOADS_DIR, registro.arquivo_armazenado);
      fs.unlink(caminhoAbsoluto, () => {});
    }
  }

  return true;
}

async function getArquivo(empresaId, contratoEmpreendimento) {
  const { rows } = await pool.query(
    `SELECT arquivo_original, arquivo_armazenado FROM extrato_empreendimentos
     WHERE empresa_id = $1 AND contrato_empreendimento = $2`,
    [empresaId, contratoEmpreendimento]
  );
  const registro = rows[0];
  if (!registro) return null;

  const caminhoAbsoluto = path.join(UPLOADS_DIR, registro.arquivo_armazenado);
  if (!fs.existsSync(caminhoAbsoluto)) return null;

  return { caminhoAbsoluto, nomeOriginal: registro.arquivo_original || 'extrato.xls' };
}

async function getExportacao(empresaId, contratoEmpreendimento) {
  const { rows: empreendimentoRows } = await pool.query(
    'SELECT * FROM extrato_empreendimentos WHERE empresa_id = $1 AND contrato_empreendimento = $2',
    [empresaId, contratoEmpreendimento]
  );
  const empreendimento = empreendimentoRows[0];
  if (!empreendimento) return null;

  const { rows: unidades } = await pool.query(
    `SELECT u.*, e.nome_empreendimento, e.entidade_organizadora, e.cnpj_entidade_organizadora,
            e.identificacao_empreendimento, e.apf, e.unidade_federacao, e.municipio
     FROM extrato_unidades u
     JOIN extrato_empreendimentos e
       ON e.empresa_id = u.empresa_id AND e.contrato_empreendimento = u.contrato_empreendimento
     WHERE u.empresa_id = $1 AND u.contrato_empreendimento = $2
     ORDER BY u.id`,
    [empresaId, contratoEmpreendimento]
  );
  const { rows: cronograma } = await pool.query(
    'SELECT * FROM extrato_cronograma WHERE empresa_id = $1 AND contrato_empreendimento = $2 ORDER BY id',
    [empresaId, contratoEmpreendimento]
  );
  const { rows: proximosEventos } = await pool.query(
    'SELECT * FROM extrato_proximos_eventos WHERE empresa_id = $1 AND contrato_empreendimento = $2 ORDER BY id',
    [empresaId, contratoEmpreendimento]
  );

  return { empreendimentos: [empreendimento], unidades, cronograma, proximosEventos };
}

async function getExportacaoTodos(empresaId) {
  const { rows: empreendimentos } = await pool.query(
    'SELECT * FROM extrato_empreendimentos WHERE empresa_id = $1 ORDER BY nome_empreendimento ASC',
    [empresaId]
  );
  const { rows: unidades } = await pool.query(
    `SELECT u.*, e.nome_empreendimento, e.entidade_organizadora, e.cnpj_entidade_organizadora,
            e.identificacao_empreendimento, e.apf, e.unidade_federacao, e.municipio
     FROM extrato_unidades u
     JOIN extrato_empreendimentos e
       ON e.empresa_id = u.empresa_id AND e.contrato_empreendimento = u.contrato_empreendimento
     WHERE u.empresa_id = $1
     ORDER BY u.contrato_empreendimento ASC, u.id ASC`,
    [empresaId]
  );
  const { rows: cronograma } = await pool.query(
    `SELECT c.* FROM extrato_cronograma c
     WHERE c.empresa_id = $1
     ORDER BY c.contrato_empreendimento ASC, c.id ASC`,
    [empresaId]
  );
  const { rows: proximosEventos } = await pool.query(
    `SELECT p.* FROM extrato_proximos_eventos p
     WHERE p.empresa_id = $1
     ORDER BY p.contrato_empreendimento ASC, p.id ASC`,
    [empresaId]
  );

  return { empreendimentos, unidades, cronograma, proximosEventos };
}

module.exports = {
  importarXls,
  listEmpreendimentos,
  getArquivo,
  getExportacao,
  getExportacaoTodos,
  excluir,
};
