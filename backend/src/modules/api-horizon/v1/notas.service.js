const fs = require('fs');
const path = require('path');
const pool = require('../../../config/db');
const env = require('../../../config/env');
const { NOTAS_DIR, inativarNotas } = require('../../espiao-nfe-nfse/espiao.service');

// Consultas da API pública (só a empresa da chave). Mesmas regras da tela do Acervo NF-e /
// NFS-e: notas só-resumo (resNFe) ficam de fora; status interno = inativada > cancelada >
// vinculada > pendente (ver relatorio-notas-pendentes/notasPendentes.service.js).
//
// Datas e horas saem em horário de Brasília com o deslocamento explícito (-03:00). As colunas
// TIMESTAMP antigas (inativada_em) estão no fuso do servidor do banco; data_emissao guarda a
// hora local que veio no XML.

const FUSO = 'America/Sao_Paulo';
const isoLocal = (expr) =>
  `CASE WHEN ${expr} IS NULL THEN NULL ELSE to_char(${expr} AT TIME ZONE '${FUSO}', 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00' END`;
const isoServidor = (coluna) => isoLocal(`(${coluna} AT TIME ZONE current_setting('TimeZone'))`);

const STATUS_INTERNO = `CASE
  WHEN n.inativa THEN 'inativada'
  WHEN n.situacao_categoria = 'cancelada' THEN 'cancelada'
  WHEN v.nota_id IS NOT NULL THEN 'vinculada'
  ELSE 'pendente' END`;

const NOME_CERTIFICADO = (coluna) => `regexp_replace(${coluna}, ':\\d{11,14}$', '')`;

const SELECT_NOTA = `
  SELECT n.id, n.tipo, n.chave_acesso, n.numero_nota, n.serie_nota,
         to_char(n.data_emissao, 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00' AS data_emissao,
         ${isoLocal('n.atualizado_em')} AS data_atualizacao,
         COALESCE(n.cnpj_emitente,
                  CASE WHEN n.tipo = 'NFE' THEN substr(n.chave_acesso, 7, 14) ELSE substr(n.chave_acesso, 10, 14) END) AS cnpj_emitente,
         n.emissor,
         COALESCE(n.cnpj_destinatario, ce.cnpj) AS cnpj_destinatario,
         n.certificado_id, ${NOME_CERTIFICADO('c.nome')} AS certificado_nome, ce.cnpj AS certificado_cnpj,
         n.valor_total::float AS valor_total,
         CASE WHEN n.situacao_categoria = 'cancelada' THEN 'cancelada' ELSE 'autorizada' END AS situacao_fiscal,
         ${STATUS_INTERNO} AS status_interno,
         n.motivo_inativacao,
         CASE WHEN n.inativa THEN ${isoServidor('n.inativada_em')} END AS inativada_em,
         CASE WHEN n.inativa THEN ui.nome END AS inativada_por,
         v.sienge_titulo_id
  FROM espiao_notas n
  LEFT JOIN certificados_digitais c ON c.id = n.certificado_id
  LEFT JOIN espiao_certificado_estado ce ON ce.certificado_id = n.certificado_id
  LEFT JOIN espiao_notas_vinculos v ON v.nota_id = n.id
  LEFT JOIN usuarios ui ON ui.id = n.inativada_por`;

function formatarNota(r) {
  return {
    id: r.id,
    tipoDocumento: r.tipo,
    chaveAcesso: r.chave_acesso,
    numero: r.numero_nota,
    serie: r.serie_nota,
    dataEmissao: r.data_emissao,
    dataAtualizacao: r.data_atualizacao,
    cnpjEmitente: r.cnpj_emitente,
    razaoSocialEmitente: r.emissor,
    cnpjDestinatario: r.cnpj_destinatario,
    certificado: { id: r.certificado_id, nome: r.certificado_nome, cnpj: r.certificado_cnpj },
    valorTotal: r.valor_total,
    situacaoFiscal: r.situacao_fiscal,
    statusInterno: r.status_interno,
    motivoInativacao: r.status_interno === 'inativada' ? r.motivo_inativacao : null,
    inativadaEm: r.inativada_em,
    inativadaPor: r.inativada_por,
    vinculado: r.sienge_titulo_id != null,
    tituloVinculado: r.sienge_titulo_id ?? null,
    linkXml: `${env.apiHorizon.publicUrl}/v1/notas-fiscais/${r.id}/xml`,
  };
}

async function listarCertificados(empresaId) {
  const { rows } = await pool.query(
    `SELECT c.id, ${NOME_CERTIFICADO('c.nome')} AS nome,
            COALESCE(ce.cnpj, substring(c.nome FROM '(\\d{14})$')) AS cnpj,
            to_char(c.validade_ate, 'YYYY-MM-DD') AS validade_ate,
            (c.validade_ate - (NOW() AT TIME ZONE '${FUSO}')::date) AS dias,
            ${isoServidor('ce.ultima_consulta_em')} AS ultima_consulta_em,
            COUNT(n.id) FILTER (WHERE n.tipo = 'NFE')::int AS nfe,
            COUNT(n.id) FILTER (WHERE n.tipo = 'NFSE')::int AS nfse,
            COUNT(n.id) FILTER (WHERE n.tipo = 'NFE' AND n.inativa)::int AS nfe_inativas,
            COUNT(n.id) FILTER (WHERE n.tipo = 'NFSE' AND n.inativa)::int AS nfse_inativas
     FROM certificados_digitais c
     LEFT JOIN espiao_certificado_estado ce ON ce.certificado_id = c.id
     LEFT JOIN espiao_notas n ON n.certificado_id = c.id AND n.apenas_resumo = FALSE
     WHERE c.empresa_id = $1
     GROUP BY c.id, ce.cnpj, ce.ultima_consulta_em
     ORDER BY c.id`,
    [empresaId]
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    cnpj: r.cnpj,
    validadeAte: r.validade_ate,
    diasParaVencer: r.dias,
    situacao: r.dias == null ? 'sem_validade' : r.dias < 0 ? 'vencido' : r.dias <= 30 ? 'vence_em_breve' : 'valido',
    ultimaConsultaEm: r.ultima_consulta_em,
    totais: { nfe: r.nfe, nfse: r.nfse, nfeInativas: r.nfe_inativas, nfseInativas: r.nfse_inativas },
  }));
}

// Ids pedidos que não são certificados da empresa (pra responder 400 dizendo quais).
async function certificadosForaDaEmpresa(empresaId, ids) {
  const { rows } = await pool.query('SELECT id FROM certificados_digitais WHERE empresa_id = $1 AND id = ANY($2::int[])', [
    empresaId,
    ids,
  ]);
  const daEmpresa = new Set(rows.map((r) => r.id));
  return ids.filter((id) => !daEmpresa.has(id));
}

async function listarNotas(empresaId, f) {
  const params = [empresaId, f.certificadoIds, f.dataEmissaoInicio, f.dataEmissaoFim];
  const condicoes = [
    'n.empresa_id = $1',
    'n.apenas_resumo = FALSE',
    'n.certificado_id = ANY($2::int[])',
    'n.data_emissao >= $3::date',
    "n.data_emissao < $4::date + INTERVAL '1 day'",
  ];
  if (f.tipoDocumento) {
    params.push(f.tipoDocumento);
    condicoes.push(`n.tipo = $${params.length}`);
  }
  if (f.atualizadoDesde) {
    params.push(f.atualizadoDesde);
    condicoes.push(`n.atualizado_em >= $${params.length}::timestamptz`);
  }
  if (f.status?.length) {
    params.push(f.status);
    condicoes.push(`(${STATUS_INTERNO}) = ANY($${params.length}::text[])`);
  }
  const where = `WHERE ${condicoes.join(' AND ')}`;
  const joinsContagem = 'FROM espiao_notas n LEFT JOIN espiao_notas_vinculos v ON v.nota_id = n.id';

  const { rows: contagem } = await pool.query(`SELECT COUNT(*)::int AS total ${joinsContagem} ${where}`, params);
  const total = contagem[0].total;

  const offset = (f.page - 1) * f.pageSize;
  const { rows } = await pool.query(
    `${SELECT_NOTA} ${where} ORDER BY n.data_emissao, n.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, f.pageSize, offset]
  );

  return {
    items: rows.map(formatarNota),
    pagination: { page: f.page, pageSize: f.pageSize, total, totalPages: Math.ceil(total / f.pageSize) },
  };
}

async function buscarNota(empresaId, id) {
  const { rows } = await pool.query(`${SELECT_NOTA} WHERE n.id = $1 AND n.empresa_id = $2 AND n.apenas_resumo = FALSE`, [
    id,
    empresaId,
  ]);
  return rows[0] ? formatarNota(rows[0]) : null;
}

async function arquivoXml(empresaId, id) {
  const { rows } = await pool.query(
    'SELECT chave_acesso, arquivo_armazenado FROM espiao_notas WHERE id = $1 AND empresa_id = $2 AND apenas_resumo = FALSE',
    [id, empresaId]
  );
  const nota = rows[0];
  if (!nota) return { existe: false };
  if (!nota.arquivo_armazenado) return { existe: true, caminho: null };
  // O caminho vem do banco, mas confere que não sai da pasta das notas.
  const caminho = path.resolve(NOTAS_DIR, nota.arquivo_armazenado);
  if (!caminho.startsWith(path.resolve(NOTAS_DIR) + path.sep) || !fs.existsSync(caminho)) return { existe: true, caminho: null };
  return { existe: true, caminho, nomeArquivo: `${nota.chave_acesso}.xml` };
}

// Mesma ação do botão "Inativar" da tela (espiao.service.js::inativarNotas), registrada no nome
// do dono da chave. Devolve null se a nota já estava inativa.
async function inativar(id, motivo, usuarioId) {
  const ids = await inativarNotas([id], motivo, usuarioId);
  return ids.length > 0;
}

module.exports = { listarCertificados, certificadosForaDaEmpresa, listarNotas, buscarNota, arquivoXml, inativar };
