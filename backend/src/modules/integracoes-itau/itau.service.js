const pool = require('../../config/db');
const { encrypt, decrypt } = require('../../utils/crypto');
const { agoraSP } = require('../monitor-integracoes/tempo');
const sts = require('./itau.sts');

// Colunas que podem ir pro frontend — NUNCA os *_enc (chave privada, secret, token).
const CAMPOS_PUBLICOS = `
  i.id, i.nome_conexao, i.client_id, i.ativo, i.criado_em, i.atualizado_em,
  to_char(i.token_temporario_validade, 'YYYY-MM-DD') AS token_temporario_validade, i.cert_ou, i.cert_cidade, i.cert_uf,
  i.certificado_validade, i.certificado_emitido_em, i.ultimo_erro,
  (i.token_temporario_enc IS NOT NULL) AS tem_token,
  (i.certificado_pem IS NOT NULL) AS tem_certificado,
  e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social,
  e.cnpj AS empresa_cnpj`;

const DIA_MS = 24 * 60 * 60 * 1000;

// Situação do certificado pra tela — calculada a partir da validade gravada (relógio da
// aplicação, não do banco; ver monitor-integracoes/tempo.js).
function statusCertificado(row) {
  if (!row.tem_certificado) {
    return { status: row.ultimo_erro ? 'ERRO' : 'SEM_CERTIFICADO', dias_restantes: null };
  }
  const dias = Math.floor((new Date(row.certificado_validade).getTime() - Date.now()) / DIA_MS);
  if (dias < 0) return { status: 'VENCIDO', dias_restantes: dias };
  if (dias <= sts.DIAS_JANELA_RENOVACAO) return { status: 'RENOVAVEL', dias_restantes: dias };
  return { status: 'ATIVO', dias_restantes: dias };
}

function paraResposta(row, contas) {
  const { status, dias_restantes } = statusCertificado(row);
  return { ...row, contas, certificado_status: status, certificado_dias_restantes: dias_restantes };
}

async function carregarContas(ids) {
  if (ids.length === 0) return new Map();
  const { rows } = await pool.query(
    `SELECT integracao_id, agencia, conta, dac FROM integracoes_itau_contas
     WHERE integracao_id = ANY($1::int[]) ORDER BY agencia, conta, dac`,
    [ids]
  );
  const mapa = new Map(ids.map((id) => [id, []]));
  for (const r of rows) mapa.get(r.integracao_id).push({ agencia: r.agencia, conta: r.conta, dac: r.dac });
  return mapa;
}

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const conditions = ['(e.razao_social ILIKE $1 OR i.nome_conexao ILIKE $1)'];
  const params = [`%${search}%`];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`i.ativo = $${params.length}`);
  }
  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`i.empresa_id = ANY($${params.length}::int[])`);
  }
  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT ${CAMPOS_PUBLICOS}
     FROM integracoes_itau i
     JOIN empresas e ON e.id = i.empresa_id
     ${whereClause}
     ORDER BY i.criado_em DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM integracoes_itau i JOIN empresas e ON e.id = i.empresa_id ${whereClause}`,
    params
  );

  const contas = await carregarContas(rows.map((r) => r.id));
  return {
    data: rows.map((r) => paraResposta(r, contas.get(r.id))),
    pagination: {
      page,
      limit,
      total: countRows[0].total,
      totalPages: Math.max(1, Math.ceil(countRows[0].total / limit)),
    },
  };
}

async function getById(id) {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_PUBLICOS}
     FROM integracoes_itau i
     JOIN empresas e ON e.id = i.empresa_id
     WHERE i.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const contas = await carregarContas([rows[0].id]);
  return paraResposta(rows[0], contas.get(rows[0].id));
}

// Mesmo esquema de vanpix.service.js::substituirConvenios — troca a lista inteira.
async function substituirContas(client, integracaoId, contas) {
  await client.query('DELETE FROM integracoes_itau_contas WHERE integracao_id = $1', [integracaoId]);
  if (contas.length === 0) return;
  const values = contas.map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`).join(', ');
  await client.query(
    `INSERT INTO integracoes_itau_contas (integracao_id, agencia, conta, dac) VALUES ${values}`,
    [integracaoId, ...contas.flatMap((c) => [c.agencia, c.conta, c.dac])]
  );
}

async function emTransacao(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function create(dados) {
  const id = await emTransacao(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO integracoes_itau
         (empresa_id, nome_conexao, client_id, token_temporario_enc, token_temporario_validade, cert_ou, cert_cidade, cert_uf)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        dados.empresa_id,
        dados.nome_conexao,
        dados.client_id,
        dados.token_temporario ? encrypt(dados.token_temporario) : null,
        dados.token_temporario_validade || null,
        dados.cert_ou,
        dados.cert_cidade,
        dados.cert_uf,
      ]
    );
    await substituirContas(client, rows[0].id, dados.contas);
    return rows[0].id;
  });
  return getById(id);
}

// token_temporario só entra no UPDATE quando informado de novo (em branco = manter o salvo),
// mesmo espírito do client_secret em vanpix.service.js::update.
async function update(id, dados) {
  const atualizado = await emTransacao(async (client) => {
    const campos = [
      'empresa_id = $1',
      'nome_conexao = $2',
      'client_id = $3',
      'token_temporario_validade = $4',
      'cert_ou = $5',
      'cert_cidade = $6',
      'cert_uf = $7',
      'atualizado_em = NOW()',
    ];
    const params = [
      dados.empresa_id,
      dados.nome_conexao,
      dados.client_id,
      dados.token_temporario_validade || null,
      dados.cert_ou,
      dados.cert_cidade,
      dados.cert_uf,
    ];
    if (dados.token_temporario) {
      params.push(encrypt(dados.token_temporario));
      campos.push(`token_temporario_enc = $${params.length}`);
    }
    params.push(id);
    const { rowCount } = await client.query(
      `UPDATE integracoes_itau SET ${campos.join(', ')} WHERE id = $${params.length}`,
      params
    );
    if (rowCount === 0) return false;
    await substituirContas(client, id, dados.contas);
    return true;
  });
  return atualizado ? getById(id) : null;
}

async function setAtivo(id, ativo) {
  const { rowCount } = await pool.query('UPDATE integracoes_itau SET ativo = $1 WHERE id = $2', [ativo, id]);
  return rowCount ? getById(id) : null;
}

async function carregarLinhaCompleta(id) {
  const { rows } = await pool.query('SELECT * FROM integracoes_itau WHERE id = $1', [id]);
  return rows[0] || null;
}

async function gravarErro(id, mensagem) {
  await pool.query('UPDATE integracoes_itau SET ultimo_erro = $1, atualizado_em = NOW() WHERE id = $2', [mensagem, id]);
}

function erroNegocio(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

// Uma emissão/renovação por conexão por vez — um duplo clique não pode mandar o token de uso
// único duas vezes pro Itaú.
const emAndamento = new Set();

async function comTrava(id, fn) {
  const chave = String(id);
  if (emAndamento.has(chave)) throw erroNegocio('Já existe uma geração/renovação de certificado em andamento para esta conexão.', 409);
  emAndamento.add(chave);
  try {
    return await fn();
  } finally {
    emAndamento.delete(chave);
  }
}

function contextoCertificado(row) {
  if (!row.certificado_pem || !row.chave_certificado_enc || !row.client_secret_enc) return null;
  const chavePem = decrypt(row.chave_certificado_enc);
  return {
    integracaoId: row.id,
    clientId: row.client_id,
    clientSecret: decrypt(row.client_secret_enc),
    certificadoPem: row.certificado_pem,
    agente: sts.criarAgente(chavePem, row.certificado_pem),
  };
}

async function tentarAccessToken(row) {
  try {
    const ctx = contextoCertificado(row);
    await sts.obterAccessToken(ctx);
    return { token_ok: true, token_erro: null };
  } catch (err) {
    return { token_ok: false, token_erro: err.message };
  }
}

// Grava a chave/CSR pendentes ANTES de chamar o Itaú — se o processo cair no meio, a chave
// que casa com o certificado emitido não se perde. Reaproveita o par pendente quando o
// subject não mudou e ele ainda não virou certificado (nova tentativa após erro de rede).
async function prepararChaveECsr(row, { forcarNova = false } = {}) {
  const subject = { clientId: row.client_id, ou: row.cert_ou, cidade: row.cert_cidade, uf: row.cert_uf };
  const pendenteJaUsada =
    row.chave_privada_enc && row.chave_certificado_enc && decrypt(row.chave_privada_enc) === decrypt(row.chave_certificado_enc);
  if (!forcarNova && row.chave_privada_enc && row.csr_pem && !pendenteJaUsada && sts.csrConfere(row.csr_pem, subject)) {
    return { chavePem: decrypt(row.chave_privada_enc), csrPem: row.csr_pem };
  }
  const { chavePem, csrPem } = sts.gerarChaveECsr(subject);
  await pool.query(
    'UPDATE integracoes_itau SET chave_privada_enc = $1, csr_pem = $2, atualizado_em = NOW() WHERE id = $3',
    [encrypt(chavePem), csrPem, row.id]
  );
  return { chavePem, csrPem };
}

// Resposta 2xx do Itaú (emissão ou renovação) → valida e grava o certificado novo.
// A resposta crua é gravada primeiro, antes de qualquer validação que possa falhar.
async function processarRespostaCertificado(row, { corpo, chavePem, secretAtual }) {
  await pool.query('UPDATE integracoes_itau SET resposta_emissao_enc = $1 WHERE id = $2', [encrypt(corpo), row.id]);

  const { secret, certificadoPem } = sts.parseRespostaEmissao(corpo);
  const clientSecret = secret || secretAtual;
  if (!certificadoPem || !clientSecret) {
    throw erroNegocio(
      'O Itaú respondeu, mas não foi possível identificar o certificado e o client secret na resposta. A resposta foi guardada — não gere de novo antes de verificar.',
      502
    );
  }
  const { validade, emitidoEm } = sts.validarCertificado(certificadoPem, chavePem);

  await pool.query(
    `UPDATE integracoes_itau
     SET certificado_pem = $1, chave_certificado_enc = $2, client_secret_enc = $3,
         certificado_validade = $4, certificado_emitido_em = $5,
         token_temporario_enc = NULL, ultimo_erro = NULL, atualizado_em = NOW()
     WHERE id = $6`,
    [certificadoPem, encrypt(chavePem), encrypt(clientSecret), validade, emitidoEm, row.id]
  );
  sts.limparCacheToken(row.id);
}

async function gerarCertificado(id) {
  return comTrava(id, async () => {
    const row = await carregarLinhaCompleta(id);
    if (!row) return null;
    if (!row.token_temporario_enc) {
      throw erroNegocio('Informe o token temporário enviado pelo Itaú (coluna TOKEN da planilha) e salve antes de gerar o certificado.');
    }

    const { chavePem, csrPem } = await prepararChaveECsr(row);
    let resposta;
    try {
      resposta = await sts.solicitarCertificado({ tokenTemporario: decrypt(row.token_temporario_enc), csrPem });
    } catch (err) {
      await gravarErro(id, err.message);
      throw erroNegocio(err.message, 502);
    }

    if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
      const mensagem = `O Itaú recusou a emissão do certificado (${sts.mensagemErroItau(resposta.statusCode, resposta.corpo)}).`;
      await gravarErro(id, mensagem);
      throw erroNegocio(mensagem, 502);
    }

    try {
      await processarRespostaCertificado(row, { corpo: resposta.corpo, chavePem, secretAtual: null });
    } catch (err) {
      await gravarErro(id, err.message);
      throw err.expose ? err : erroNegocio(err.message, 502);
    }

    const atualizado = await carregarLinhaCompleta(id);
    const token = await tentarAccessToken(atualizado);
    return { conexao: await getById(id), ...token };
  });
}

// Renova com o certificado atual (mTLS + access_token) — só dentro dos últimos 30 dias.
async function renovarCertificado(id, { apenasSeNaJanela = false } = {}) {
  return comTrava(id, async () => {
    const row = await carregarLinhaCompleta(id);
    if (!row) return null;
    if (!row.certificado_pem) throw erroNegocio('Esta conexão ainda não tem certificado — use "Gerar certificado".');

    const dias = Math.floor((new Date(row.certificado_validade).getTime() - Date.now()) / DIA_MS);
    if (dias < 0) {
      throw erroNegocio(
        'O certificado já venceu — a renovação não é mais possível. Peça um novo token temporário ao Itaú, informe-o na conexão e use "Gerar certificado".'
      );
    }
    if (dias > sts.DIAS_JANELA_RENOVACAO) {
      if (apenasSeNaJanela) return { renovado: false, dias_restantes: dias, validade: row.certificado_validade };
      throw erroNegocio(`O Itaú só aceita renovar nos últimos ${sts.DIAS_JANELA_RENOVACAO} dias de validade (faltam ${dias} dias).`);
    }

    const ctx = contextoCertificado(row);
    let accessToken;
    try {
      accessToken = await sts.obterAccessToken(ctx);
    } catch (err) {
      await gravarErro(id, err.message);
      throw erroNegocio(err.message, 502);
    }

    const { chavePem, csrPem } = await prepararChaveECsr(row);
    let resposta;
    try {
      resposta = await sts.renovarCertificadoItau({ agente: ctx.agente, accessToken, csrPem });
    } catch (err) {
      await gravarErro(id, err.message);
      throw erroNegocio(err.message, 502);
    }
    if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
      const mensagem = `O Itaú recusou a renovação do certificado (${sts.mensagemErroItau(resposta.statusCode, resposta.corpo)}).`;
      await gravarErro(id, mensagem);
      throw erroNegocio(mensagem, 502);
    }

    try {
      await processarRespostaCertificado(row, { corpo: resposta.corpo, chavePem, secretAtual: ctx.clientSecret });
    } catch (err) {
      await gravarErro(id, err.message);
      throw err.expose ? err : erroNegocio(err.message, 502);
    }

    const atualizado = await carregarLinhaCompleta(id);
    return { renovado: true, validade: atualizado.certificado_validade, ...(await tentarAccessToken(atualizado)) };
  });
}

// Classificação da consulta de extrato de uma conta no teste. 403 é o esperado enquanto o
// Itaú não libera os escopos (até 2 dias úteis depois das credenciais) — aviso, não falha.
function classificarExtrato(resultado) {
  if (resultado.erroRede) return { status: 'erro', mensagem: `Falha de rede: ${resultado.erroRede}` };
  const { statusCode, corpo } = resultado;
  if (statusCode >= 200 && statusCode < 300) return { status: 'ok', mensagem: `Extrato consultado (HTTP ${statusCode}).` };
  const detalhe = sts.mensagemErroItau(statusCode, corpo);
  if (statusCode === 403) {
    return {
      status: 'aviso',
      mensagem: `Acesso negado (${detalhe}). Os escopos são liberados pelo Itaú em até 2 dias úteis após o envio das credenciais; confira também se a conta é do mesmo CNPJ.`,
    };
  }
  if (statusCode === 401) return { status: 'erro', mensagem: `Token/certificado recusado na API de Extrato (${detalhe}).` };
  if (statusCode === 404) return { status: 'erro', mensagem: `Não encontrado (${detalhe}) — confira a conta ou o endereço da API (ITAU_EXTRATO_URL).` };
  return { status: 'erro', mensagem: detalhe };
}

async function testarConexao(id) {
  const row = await carregarLinhaCompleta(id);
  if (!row) return null;
  const detalhes = [];

  const ctx = contextoCertificado(row);
  if (!ctx) {
    detalhes.push({ chave: 'certificado', titulo: 'Certificado', status: 'erro', mensagem: 'Certificado ainda não gerado.' });
    return { sucesso: false, detalhes };
  }
  const { status: stCert, dias_restantes: dias } = statusCertificado({ ...row, tem_certificado: true });
  if (stCert === 'VENCIDO') {
    detalhes.push({ chave: 'certificado', titulo: 'Certificado', status: 'erro', mensagem: 'Certificado vencido.' });
    return { sucesso: false, detalhes };
  }
  detalhes.push({
    chave: 'certificado',
    titulo: 'Certificado',
    status: stCert === 'RENOVAVEL' ? 'aviso' : 'ok',
    mensagem: `Válido por mais ${dias} dia(s).`,
  });

  let accessToken;
  try {
    accessToken = await sts.obterAccessToken(ctx);
    detalhes.push({ chave: 'token', titulo: 'Access token (STS)', status: 'ok', mensagem: 'Token gerado com o certificado e o client secret.' });
  } catch (err) {
    detalhes.push({ chave: 'token', titulo: 'Access token (STS)', status: 'erro', mensagem: err.message });
    return { sucesso: false, detalhes };
  }

  const { rows: contas } = await pool.query(
    'SELECT agencia, conta, dac FROM integracoes_itau_contas WHERE integracao_id = $1 ORDER BY agencia, conta, dac',
    [id]
  );
  const hoje = agoraSP().data;
  for (const conta of contas) {
    const resultado = await sts.consultarExtrato({
      agente: ctx.agente,
      accessToken,
      clientId: ctx.clientId,
      conta,
      dataInicio: hoje,
      dataFim: hoje,
    });
    detalhes.push({
      chave: `conta-${sts.statementId(conta)}`,
      titulo: `Extrato ${conta.agencia} / ${conta.conta}-${conta.dac}`,
      ...classificarExtrato(resultado),
    });
  }

  const falhou = detalhes.some((d) => d.status === 'erro');
  return { sucesso: !falhou, detalhes };
}

// Pro Monitor de Integrações: renova (quando na janela) as conexões ativas com certificado.
async function renovarCertificadosDaEmpresa(empresaId) {
  const { rows } = await pool.query(
    `SELECT id, nome_conexao FROM integracoes_itau
     WHERE empresa_id = $1 AND ativo = TRUE AND certificado_pem IS NOT NULL ORDER BY id`,
    [empresaId]
  );
  const linhas = [];
  for (const { id, nome_conexao: nome } of rows) {
    try {
      const r = await renovarCertificado(id, { apenasSeNaJanela: true });
      const validade = new Date(r.validade).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      linhas.push(r.renovado ? `${nome}: renovado, válido até ${validade}.` : `${nome}: válido até ${validade}, sem necessidade de renovar.`);
    } catch (err) {
      linhas.push(`${nome}: falha — ${err.message}`);
    }
  }
  const falhas = linhas.filter((l) => l.includes(': falha — '));
  if (falhas.length) {
    const err = new Error(linhas.join(' '));
    throw err;
  }
  return linhas.join(' ');
}

module.exports = {
  list,
  getById,
  create,
  update,
  setAtivo,
  gerarCertificado,
  renovarCertificado,
  testarConexao,
  renovarCertificadosDaEmpresa,
};
