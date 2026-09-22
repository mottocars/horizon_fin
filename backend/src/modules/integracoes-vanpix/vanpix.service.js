const pool = require('../../config/db');
const { encrypt, decrypt } = require('../../utils/crypto');

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;
  const conditions = ['(e.razao_social ILIKE $1 OR v.nome_conexao ILIKE $1)'];
  const params = [searchTerm];

  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`v.ativo = $${params.length}`);
  }
  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`v.empresa_id = ANY($${params.length}::int[])`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // apelidos via subconsulta correlacionada (array_agg) — evita duplicar 1 linha por
  // convênio na listagem (que teria N linhas repetidas pra uma conexão com N apelidos).
  const { rows } = await pool.query(
    `SELECT v.id, v.nome_conexao, v.ativo, v.criado_em, v.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social,
            e.cnpj AS empresa_cnpj,
            COALESCE(
              (SELECT array_agg(c.apelido ORDER BY c.apelido) FROM integracoes_vanpix_convenios c WHERE c.integracao_id = v.id),
              '{}'
            ) AS apelidos
     FROM integracoes_vanpix v
     JOIN empresas e ON e.id = v.empresa_id
     ${whereClause}
     ORDER BY v.criado_em DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM integracoes_vanpix v JOIN empresas e ON e.id = v.empresa_id ${whereClause}`,
    params
  );

  return {
    data: rows,
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
    `SELECT v.id, v.nome_conexao, v.ativo, v.criado_em, v.atualizado_em,
            e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social,
            e.cnpj AS empresa_cnpj
     FROM integracoes_vanpix v
     JOIN empresas e ON e.id = v.empresa_id
     WHERE v.id = $1`,
    [id]
  );
  const item = rows[0];
  if (!item) return null;
  const { rows: convenios } = await pool.query(
    'SELECT apelido FROM integracoes_vanpix_convenios WHERE integracao_id = $1 ORDER BY apelido',
    [id]
  );
  return { ...item, apelidos: convenios.map((c) => c.apelido) };
}

// Substitui a lista inteira de convênios de uma conexão (apaga tudo e insere de novo) — mais
// simples que tentar "diferenciar" quais apelidos entraram/saíram, e o volume por conexão é
// pequeno (dezenas, não milhares) — sem custo real em trocar tudo a cada salvamento.
async function substituirConvenios(client, integracaoId, apelidos) {
  await client.query('DELETE FROM integracoes_vanpix_convenios WHERE integracao_id = $1', [integracaoId]);
  if (apelidos.length === 0) return;
  const values = apelidos.map((_, i) => `($1, $${i + 2})`).join(', ');
  await client.query(
    `INSERT INTO integracoes_vanpix_convenios (integracao_id, apelido) VALUES ${values}`,
    [integracaoId, ...apelidos]
  );
}

async function create({ empresa_id, nome_conexao, service_key, client_secret, apelidos }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO integracoes_vanpix (empresa_id, nome_conexao, service_key_enc, client_secret_enc)
       VALUES ($1, $2, $3, $4)
       RETURNING id, empresa_id, nome_conexao, ativo, criado_em, atualizado_em`,
      [empresa_id, nome_conexao, encrypt(service_key), encrypt(client_secret)]
    );
    const item = rows[0];
    await substituirConvenios(client, item.id, apelidos);
    await client.query('COMMIT');
    return { ...item, apelidos };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// `service_key`/`client_secret` só entram no UPDATE quando informados de novo — mesmo
// espírito de sienge.service.js::update com `password` (editar sem preencher de novo mantém
// o segredo já salvo).
async function update(id, { empresa_id, nome_conexao, service_key, client_secret, apelidos }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const campos = ['empresa_id = $1', 'nome_conexao = $2', 'atualizado_em = NOW()'];
    const params = [empresa_id, nome_conexao];

    if (service_key) {
      params.push(encrypt(service_key));
      campos.push(`service_key_enc = $${params.length}`);
    }
    if (client_secret) {
      params.push(encrypt(client_secret));
      campos.push(`client_secret_enc = $${params.length}`);
    }

    params.push(id);
    const { rows } = await client.query(
      `UPDATE integracoes_vanpix SET ${campos.join(', ')} WHERE id = $${params.length}
       RETURNING id, empresa_id, nome_conexao, ativo, criado_em, atualizado_em`,
      params
    );
    const item = rows[0];
    if (!item) {
      await client.query('ROLLBACK');
      return null;
    }
    await substituirConvenios(client, id, apelidos);
    await client.query('COMMIT');
    return { ...item, apelidos };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function setAtivo(id, ativo) {
  const { rows } = await pool.query(
    `UPDATE integracoes_vanpix SET ativo = $1 WHERE id = $2
     RETURNING id, empresa_id, nome_conexao, ativo, criado_em, atualizado_em`,
    [ativo, id]
  );
  return rows[0] || null;
}

// Só pra uso interno de uma futura busca de retornos — nunca exposto pela API pro frontend
// (que só vê os campos de listagem/edição via getById, sem os segredos). Descriptografa na
// hora, não guarda em memória além do escopo desta chamada. Ainda sem nenhum consumidor
// nesta rodada (só o cadastro foi implementado) — deixado pronto pra quando a busca de
// verdade na API da VanPix for construída.
async function getCredenciais(id) {
  const { rows } = await pool.query(
    'SELECT service_key_enc, client_secret_enc, ativo FROM integracoes_vanpix WHERE id = $1',
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  const { rows: convenios } = await pool.query(
    'SELECT apelido FROM integracoes_vanpix_convenios WHERE integracao_id = $1 ORDER BY apelido',
    [id]
  );
  return {
    serviceKey: decrypt(row.service_key_enc),
    clientSecret: decrypt(row.client_secret_enc),
    ativo: row.ativo,
    apelidos: convenios.map((c) => c.apelido),
  };
}

// ---------------------------------------------------------------------------------------
// Teste de conexão — chama a API de verdade da VanPix com as credenciais informadas, pra
// confirmar que estão certas antes de contar com elas numa busca de verdade (que ainda não
// existe nesta tela). Confirmado nos testes manuais com credenciais reais (a mesma URL do
// script de referência):
//   - error_code 2001 (HTTP 200) = "Não encontramos nenhum retorno" — credencial e apelido
//     OK, só não tem retorno pra data pesquisada — não é falha.
//   - controle:true (HTTP 200) = retorno de verdade encontrado — o sinal mais forte de sucesso.
//   - HTTP 401 + error_code 4016 = esse apelido específico não existe/não é acessível por essa
//     credencial — falha só DESSE apelido, os outros continuam sendo testados.
//   - HTTP 401 + qualquer OUTRO error_code = falha de credencial (Service Key OU Client
//     Secret errados). Vimos pelo menos 2 códigos diferentes pra isso na prática — 4011
//     (Client Secret errado) e 4018 (Service Key errada) — por isso o critério aqui é "401 e
//     não é 4016", não uma lista fechada de códigos: mais robusto a outros que a VanPix use e
//     a gente ainda não tenha visto. É a mesma credencial pra qualquer apelido, não adianta
//     insistir nos outros quando cai aqui.
// `ignorar_download: 1` (mesmo parâmetro do script de referência) garante que testar não
// marca nada como baixado do lado da VanPix.
// ---------------------------------------------------------------------------------------
const VANPIX_API_URL = 'https://qwapim.pix.com.br/APIArquivos/retornos/caixa/';

function dataVanpixHoje() {
  const hoje = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hoje.getDate())}-${pad(hoje.getMonth() + 1)}-${hoje.getFullYear()}`;
}

async function testarApelido(serviceKey, clientSecret, apelido) {
  const params = new URLSearchParams({
    'service-key': serviceKey,
    action: 'BAIXAR',
    apelido,
    data_pesquisa: dataVanpixHoje(),
    ignorar_download: '1',
  });

  let resposta;
  try {
    resposta = await fetch(`${VANPIX_API_URL}?${params.toString()}`, {
      headers: { 'client-secret': clientSecret },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { apelido, status: 'erro_rede', mensagem: 'Não foi possível conectar à VanPix (rede ou tempo esgotado).' };
  }

  const corpo = await resposta.json().catch(() => null);
  if (!corpo) return { apelido, status: 'erro_rede', mensagem: 'A VanPix respondeu algo que não é um JSON válido.' };

  const codigoErro = corpo?.error?.error_code;
  if (resposta.status === 401) {
    if (codigoErro === 4016) return { apelido, status: 'apelido_invalido', mensagem: corpo.error.error_description };
    return {
      apelido,
      status: 'credencial_invalida',
      mensagem: corpo?.error?.error_description || `Não autorizado (HTTP 401, código ${codigoErro ?? 'desconhecido'}).`,
    };
  }
  if (codigoErro === 2001) return { apelido, status: 'ok_sem_retorno', mensagem: 'Credenciais aceitas — sem retorno para hoje.' };
  if (corpo.controle === true) {
    const qtd = corpo?.resposta?.quantidade ?? (corpo?.resposta?.retornos || []).length;
    return { apelido, status: 'ok_com_retorno', mensagem: `${qtd} retorno(s) encontrado(s) para hoje.` };
  }
  return {
    apelido,
    status: 'desconhecido',
    mensagem: corpo?.error?.error_description || `Resposta em formato inesperado (HTTP ${resposta.status}).`,
  };
}

// Testa cada apelido em sequência; para assim que encontra uma credencial inválida (é a
// mesma Service Key/Client Secret pra todos os apelidos — não adianta repetir o mesmo erro).
async function testarConexao({ serviceKey, clientSecret, apelidos }) {
  const detalhes = [];
  for (const apelido of apelidos) {
    const resultado = await testarApelido(serviceKey, clientSecret, apelido);
    detalhes.push(resultado);
    if (resultado.status === 'credencial_invalida') break;
  }
  const credencialFalhou = detalhes.some((d) => d.status === 'credencial_invalida');
  const algumConfirmado = detalhes.some((d) => d.status === 'ok_com_retorno' || d.status === 'ok_sem_retorno');
  return { sucesso: algumConfirmado && !credencialFalhou, detalhes };
}

module.exports = { list, getById, create, update, setAtivo, getCredenciais, testarConexao };
