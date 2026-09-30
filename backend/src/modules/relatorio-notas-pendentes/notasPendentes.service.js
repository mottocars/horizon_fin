const pool = require('../../config/db');
const { documentoEmissorDaChave } = require('../espiao-nfe-nfse/vinculo.service');

// Relatório "NF-e / NFS-e Pendentes": as notas recebidas pela empresa que
// ainda não foram vinculadas a um título do contas a pagar no Sienge — é
// exatamente o que aparece na aba Recebidas do Espião NFe/NFSe (ativa, não
// cancelada, não só-resumo, sem linha em espiao_notas_vinculos). Período por
// mês (sempre do dia 1 do mês inicial ao último dia do mês final).
async function listNotasPendentes(empresaId, { mesInicio, mesFim, certificadoIds }) {
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
            c.id AS certificado_id, c.nome AS certificado_nome
     FROM espiao_notas n
     LEFT JOIN certificados_digitais c ON c.id = n.certificado_id
     WHERE n.empresa_id = $1
       AND n.inativa = FALSE
       AND n.apenas_resumo = FALSE
       AND n.situacao_categoria IS DISTINCT FROM 'cancelada'
       AND NOT EXISTS (SELECT 1 FROM espiao_notas_vinculos v WHERE v.nota_id = n.id)
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
    certificado: { id: row.certificado_id, nome: row.certificado_nome || 'Sem certificado' },
  }));
}

module.exports = { listNotasPendentes };
