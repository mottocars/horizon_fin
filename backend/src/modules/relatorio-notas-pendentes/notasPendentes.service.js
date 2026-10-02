const pool = require('../../config/db');
const { documentoEmissorDaChave } = require('../espiao-nfe-nfse/vinculo.service');

// Relatório "Acervo NF-e / NFS-e": todas as notas recebidas pela empresa no
// período (menos as só-resumo), cada uma marcada com a aba em que aparece —
// mesmas regras das abas do Espião NFe/NFSe (ver
// espiao.service.js::contarNotasPorAba): inativada vai pra "inativadas"
// (cancelada ou não); entre as ativas, cancelada vai pra "canceladas"
// (vinculada ou não); o resto é "vinculadas" se tem linha em
// espiao_notas_vinculos, senão "pendentes". Período por mês (sempre do dia 1
// do mês inicial ao último dia do mês final).
async function listAcervoNotas(empresaId, { mesInicio, mesFim, certificadoIds }) {
  const params = [empresaId, `${mesInicio}-01`, `${mesFim}-01`];
  let filtroCertificado = '';
  if (certificadoIds?.length) {
    params.push(certificadoIds);
    filtroCertificado = `AND n.certificado_id = ANY($${params.length}::int[])`;
  }

  const { rows } = await pool.query(
    `SELECT n.id, n.tipo, n.chave_acesso, n.numero_nota, n.serie_nota, n.emissor,
            to_char(n.data_emissao, 'YYYY-MM-DD"T"HH24:MI:SS') AS data_emissao,
            n.valor_total::float AS valor,
            CASE
              WHEN n.inativa THEN 'inativadas'
              WHEN n.situacao_categoria = 'cancelada' THEN 'canceladas'
              WHEN EXISTS (SELECT 1 FROM espiao_notas_vinculos v WHERE v.nota_id = n.id) THEN 'vinculadas'
              ELSE 'pendentes'
            END AS aba,
            n.motivo_inativacao,
            n.inativada_em,
            u.nome AS inativada_por_nome,
            c.id AS certificado_id, c.nome AS certificado_nome
     FROM espiao_notas n
     LEFT JOIN certificados_digitais c ON c.id = n.certificado_id
     LEFT JOIN usuarios u ON u.id = n.inativada_por
     WHERE n.empresa_id = $1
       AND n.apenas_resumo = FALSE
       AND n.data_emissao >= $2::date
       AND n.data_emissao < ($3::date + INTERVAL '1 month')
       ${filtroCertificado}
     ORDER BY c.nome NULLS LAST, n.data_emissao ASC, n.id ASC`,
    params
  );

  return rows.map((row) => ({
    id: row.id,
    tipo: row.tipo,
    chaveAcesso: row.chave_acesso,
    numero: row.numero_nota,
    serie: row.serie_nota,
    emissor: row.emissor,
    documentoEmissor: documentoEmissorDaChave(row.tipo, row.chave_acesso),
    dataEmissao: row.data_emissao,
    valor: row.valor,
    aba: row.aba,
    motivoInativacao: row.motivo_inativacao,
    inativadaEm: row.inativada_em,
    inativadaPor: row.inativada_por_nome,
    certificado: { id: row.certificado_id, nome: row.certificado_nome || 'Sem certificado' },
  }));
}

module.exports = { listAcervoNotas };
