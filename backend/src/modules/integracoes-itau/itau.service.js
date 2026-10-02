const pool = require('../../config/db');
const { agoraSP } = require('../monitor-integracoes/tempo');
const { criptografar, descriptografar, garantirChave } = require('./itau.crypto');
const v = require('./itau.validacao');
const sts = require('./itau.sts');

// ---------------------------------------------------------------------------------------
// Conexões API Itaú (tabela conexoes_itau). O fluxo de emissão segue os passos 1 a 9 da
// especificação — ver gerarCertificado. NUNCA logar/lançar: token temporário, client_secret,
// chave privada ou corpo de resposta do Itaú (o middleware de erro faz console.error do erro).
// ---------------------------------------------------------------------------------------

const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_JANELA_RENOVACAO = 30;
const STATUS_COM_CERTIFICADO = ['CERTIFICADO_ATIVO', 'AGUARDANDO_ESCOPOS', 'ATIVA', 'ERRO_TOKEN'];

function erro(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

// Mensagem amigável de cada situação (mostrada na tela e devolvida pela API).
function mensagemStatus(status, codigo) {
  switch (status) {
    case 'GERANDO':
      return 'A geração do certificado foi iniciada e não terminou. Não use o mesmo token de novo antes de confirmar com o suporte do Itaú se o certificado foi emitido.';
    case 'CERTIFICADO_ATIVO':
      return 'Certificado gerado com sucesso. A liberação da consulta de extrato pelo Itaú pode levar até 2 dias úteis.';
    case 'AGUARDANDO_ESCOPOS':
      return 'Certificado e token OK, mas o Itaú ainda não liberou a consulta de extrato (leva até 2 dias úteis). Confira também se a conta é do mesmo CNPJ.';
    case 'ATIVA':
      return 'Conexão ativa: extrato consultado com sucesso.';
    case 'ERRO_ITAU':
      if (codigo === '401' || codigo === '403') return 'Token inválido, expirado ou já utilizado. Solicite um novo token ao Itaú.';
      if (codigo === '400') return 'O Itaú recusou o pedido. Confira a credencial.';
      if (codigo === 'TIMEOUT' || codigo === 'REDE') {
        return 'Não foi possível confirmar a resposta do Itaú. NÃO tente novamente com o mesmo token antes de verificar com o suporte.';
      }
      return `O Itaú recusou a emissão do certificado (HTTP ${codigo}). Verifique com o suporte do Itaú antes de usar outro token.`;
    case 'ERRO_PROCESSAMENTO':
      return 'O Itaú respondeu, mas não foi possível identificar o certificado e o client secret na resposta. Ela foi guardada (criptografada) para análise manual. Não gere de novo com o mesmo token.';
    case 'ERRO_TOKEN':
      if (!codigo || codigo === 'INTERNO') return 'Certificado emitido e gravado, mas o access token ainda não foi confirmado. Use "Testar token".';
      return `Certificado emitido, mas o Itaú recusou o access token (${codigo === 'TIMEOUT' || codigo === 'REDE' ? 'sem resposta' : `HTTP ${codigo}`}). Use "Testar token" de novo em alguns minutos.`;
    default:
      return '';
  }
}

const CAMPOS_PUBLICOS = `
  c.id, c.nome, c.client_id, c.cnpj, c.agencia, c.conta, c.dac, c.razao_social, c.cidade, c.uf,
  c.data_validade_certificado, c.status, c.ultimo_erro_codigo, c.ativo, c.criado_em, c.atualizado_em,
  (c.certificado_pem IS NOT NULL) AS tem_certificado,
  e.id AS empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_razao_social,
  e.cnpj AS empresa_cnpj`;

function paraResposta(row) {
  const dias = row.data_validade_certificado
    ? Math.floor((new Date(row.data_validade_certificado).getTime() - Date.now()) / DIA_MS)
    : null;
  let identificador = null;
  if (row.agencia && row.conta && row.dac) identificador = v.identificadorConta(row);
  return {
    ...row,
    dias_restantes: dias,
    certificado_vencido: row.tem_certificado && dias !== null && dias < 0,
    pode_renovar: row.tem_certificado && dias !== null && dias >= 0 && dias <= DIAS_JANELA_RENOVACAO,
    identificador_conta: identificador,
    mensagem_status: mensagemStatus(row.status, row.ultimo_erro_codigo),
  };
}

async function list({ page = 1, limit = 10, search = '', ativo, empresaIds }) {
  const offset = (page - 1) * limit;
  const conditions = ['(e.razao_social ILIKE $1 OR c.nome ILIKE $1)'];
  const params = [`%${search}%`];
  if (ativo !== undefined) {
    params.push(ativo);
    conditions.push(`c.ativo = $${params.length}`);
  }
  if (Array.isArray(empresaIds)) {
    params.push(empresaIds);
    conditions.push(`c.empresa_id = ANY($${params.length}::int[])`);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_PUBLICOS} FROM conexoes_itau c JOIN empresas e ON e.id = c.empresa_id ${where}
     ORDER BY c.criado_em DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  const { rows: total } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM conexoes_itau c JOIN empresas e ON e.id = c.empresa_id ${where}`,
    params
  );
  return {
    data: rows.map(paraResposta),
    pagination: { page, limit, total: total[0].total, totalPages: Math.max(1, Math.ceil(total[0].total / limit)) },
  };
}

async function getById(id) {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_PUBLICOS} FROM conexoes_itau c JOIN empresas e ON e.id = c.empresa_id WHERE c.id = $1`,
    [id]
  );
  return rows[0] ? paraResposta(rows[0]) : null;
}

async function carregarLinha(id) {
  const { rows } = await pool.query('SELECT * FROM conexoes_itau WHERE id = $1', [id]);
  return rows[0] || null;
}

async function setAtivo(id, ativo) {
  const { rowCount } = await pool.query('UPDATE conexoes_itau SET ativo = $1, atualizado_em = NOW() WHERE id = $2', [ativo, id]);
  return rowCount ? getById(id) : null;
}

// Nome e conta do extrato são os únicos campos editáveis depois da emissão (o resto está
// dentro do certificado).
async function atualizar(id, { nome, agencia, conta, dac }) {
  const temConta = Boolean(agencia || conta || dac);
  if (temConta) v.identificadorConta({ agencia, conta, dac }); // valida (lança se inválida)
  const { rowCount } = await pool.query(
    `UPDATE conexoes_itau SET nome = $1, agencia = $2, conta = $3, dac = $4, atualizado_em = NOW() WHERE id = $5`,
    [nome, temConta ? agencia : null, temConta ? conta : null, temConta ? dac : null, id]
  );
  return rowCount ? getById(id) : null;
}

// ─── etapa "Buscar dados" ────────────────────────────────────────────────────────────────

function validarCredencial({ nome, client_id: clientId, cnpj }) {
  const erros = [];
  if (!String(nome || '').trim()) erros.push('Informe o nome da conexão.');
  if (!v.validarUuid(clientId)) erros.push('Credencial (client_id) deve estar no formato UUID.');
  if (!v.validarCnpj(cnpj)) erros.push('CNPJ inválido (dígitos verificadores não conferem).');
  return erros;
}

// Fontes públicas de CNPJ (consultadas em paralelo, ver conferirDados). A BrasilAPI (a mesma do
// cadastro de empresas) às vezes devolve 500 pra CNPJs específicos (falha do provedor dela)
// — por isso as alternativas. Cada uma devolve { razao_social, cidade, uf } ou lança.
const TIMEOUT_CNPJ_MS = 8000;

async function buscarJson(url) {
  const resposta = await fetch(url, {
    headers: { 'User-Agent': 'HorizonFin/1.0 (+https://horizonfin.local)', Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_CNPJ_MS),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return resposta.json();
}

const FONTES_CNPJ = [
  async (cnpj) => {
    const d = await buscarJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    return { razao_social: d.razao_social, cidade: d.municipio, uf: d.uf };
  },
  async (cnpj) => {
    const d = await buscarJson(`https://publica.cnpj.ws/cnpj/${cnpj}`);
    return { razao_social: d.razao_social, cidade: d.estabelecimento?.cidade?.nome, uf: d.estabelecimento?.estado?.sigla };
  },
  async (cnpj) => {
    const d = await buscarJson(`https://receitaws.com.br/v1/cnpj/${cnpj}`);
    if (d.status === 'ERROR') throw new Error(d.message || 'erro');
    return { razao_social: d.nome, cidade: d.municipio, uf: d.uf };
  },
];

// Valida os campos e consulta o CNPJ. Se nenhuma fonte responder, devolve consulta_ok=false
// pra tela liberar o preenchimento manual.
async function conferirDados(dados) {
  const erros = validarCredencial(dados);
  if (erros.length) throw erro(erros[0]);
  const cnpj = v.somenteDigitos(dados.cnpj);
  // As fontes são consultadas ao mesmo tempo e vale a primeira resposta com razão social —
  // uma fonte lenta/fora do ar não segura a tela.
  try {
    const r = await Promise.any(
      FONTES_CNPJ.map(async (fonte) => {
        const dadosFonte = await fonte(cnpj);
        if (!dadosFonte.razao_social) throw new Error('sem razão social');
        return dadosFonte;
      })
    );
    return { consulta_ok: true, razao_social: r.razao_social, cidade: r.cidade || '', uf: (r.uf || '').toUpperCase() };
  } catch {
    // nenhuma fonte respondeu
  }
  return {
    consulta_ok: false,
    razao_social: '',
    cidade: '',
    uf: '',
    aviso: 'Não foi possível consultar o CNPJ agora (nenhuma das fontes públicas respondeu). Preencha os dados manualmente.',
  };
}

// ─── emissão do certificado (passos 1 a 9) ──────────────────────────────────────────────

// Uma emissão por credencial por vez — duplo clique não pode gastar o token duas vezes.
const emissoesEmAndamento = new Set();

async function gravarErro(id, status, codigo, extras = {}) {
  const campos = ['status = $1', 'ultimo_erro_codigo = $2', 'atualizado_em = NOW()'];
  const params = [status, codigo];
  if (extras.respostaBruta !== undefined) {
    params.push(criptografar(extras.respostaBruta));
    campos.push(`resposta_bruta_enc = $${params.length}`);
  }
  params.push(id);
  await pool.query(`UPDATE conexoes_itau SET ${campos.join(', ')} WHERE id = $${params.length}`, params);
}

// Emite o certificado. `conexaoId` = gerar de novo numa conexão existente (erro na emissão
// anterior ou certificado vencido), com um token NOVO. Devolve { conexao, sucesso, mensagem }.
async function gerarCertificado(dados, usuarioId, conexaoId = null) {
  // Passo 1 — validar tudo antes de qualquer chamada.
  const erros = validarCredencial(dados);
  if (!String(dados.token || '').trim()) erros.push('Informe o token temporário.');
  if (!conexaoId && !dados.empresa_id) erros.push('Selecione a empresa.');
  // Passo 2 — sanitizar o subject (e validar o resultado).
  const subject = v.montarSubject({ clientId: dados.client_id, razaoSocial: dados.razao_social, cidade: dados.cidade, uf: dados.uf });
  erros.push(...v.validarSubject(subject));
  if (erros.length) throw erro(erros[0]);
  garantirChave(); // sem ITAU_ENCRYPTION_KEY não dá pra guardar a chave → não chama o Itaú

  if (conexaoId) {
    const atual = await carregarLinha(conexaoId);
    if (!atual) return null;
    const vencido = atual.data_validade_certificado && new Date(atual.data_validade_certificado) < new Date();
    if (STATUS_COM_CERTIFICADO.includes(atual.status) && !vencido) {
      throw erro('Esta conexão já tem um certificado válido — use "Renovar certificado" quando faltarem 30 dias ou menos.');
    }
  }

  const trava = subject.CN.toLowerCase();
  if (emissoesEmAndamento.has(trava)) throw erro('Já existe uma geração de certificado em andamento para esta credencial.', 409);
  emissoesEmAndamento.add(trava);
  try {
    // Passo 3 — chave e CSR em memória.
    const { chavePem, csrPem } = sts.gerarChaveECsr(subject);
    const cnpj = v.somenteDigitos(dados.cnpj);

    // Passo 4 — rascunho GERANDO com a chave já criptografada, ANTES de chamar o Itaú.
    let id = conexaoId;
    if (id) {
      await pool.query(
        `UPDATE conexoes_itau SET nome = $1, client_id = $2, cnpj = $3, razao_social = $4, cidade = $5, uf = $6,
           chave_privada_enc = $7, certificado_pem = NULL, client_secret_enc = NULL, resposta_bruta_enc = NULL,
           data_validade_certificado = NULL, status = 'GERANDO', ultimo_erro_codigo = NULL, atualizado_em = NOW()
         WHERE id = $8`,
        [String(dados.nome).trim(), subject.CN, cnpj, subject.OU, subject.L, subject.ST, criptografar(chavePem), id]
      );
    } else {
      const { rows } = await pool.query(
        `INSERT INTO conexoes_itau (empresa_id, nome, client_id, cnpj, razao_social, cidade, uf, chave_privada_enc, status, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'GERANDO', $9) RETURNING id`,
        [dados.empresa_id, String(dados.nome).trim(), subject.CN, cnpj, subject.OU, subject.L, subject.ST, criptografar(chavePem), usuarioId || null]
      );
      id = rows[0].id;
    }

    // Passo 5 — UMA chamada, sem retry.
    const resposta = await sts.solicitarCertificado({ tokenTemporario: String(dados.token).trim(), csrPem });

    if (resposta.falhaRede) {
      await gravarErro(id, 'ERRO_ITAU', resposta.falhaRede);
      return resultado(id, false);
    }
    if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
      await gravarErro(id, 'ERRO_ITAU', String(resposta.statusCode));
      return resultado(id, false);
    }

    // Passo 6 — extrair certificado e secret; faltando algum (ou certificado de outra chave),
    // guarda a resposta bruta criptografada pra análise manual.
    const { certificadoPem, secret } = v.extrairRespostaCertificado(resposta.corpo);
    const leitura = certificadoPem ? sts.lerCertificado(certificadoPem, chavePem) : null;
    if (!certificadoPem || !secret || !leitura) {
      await gravarErro(id, 'ERRO_PROCESSAMENTO', String(resposta.statusCode), { respostaBruta: resposta.corpo });
      return resultado(id, false);
    }

    // Passos 6 e 7 — grava já certificado, secret e validade (o token nunca foi gravado).
    await pool.query(
      `UPDATE conexoes_itau SET certificado_pem = $1, client_secret_enc = $2, data_validade_certificado = $3,
         status = 'ERRO_TOKEN', ultimo_erro_codigo = NULL, atualizado_em = NOW()
       WHERE id = $4`,
      [certificadoPem, criptografar(secret), leitura.validade, id]
    );

    // Passo 8 — confirmar o access token (mTLS). Uma falha inesperada aqui não pode esconder
    // que o certificado JÁ foi emitido e gravado.
    try {
      await testarToken(id);
    } catch {
      await gravarErro(id, 'ERRO_TOKEN', 'INTERNO');
    }
    const conexao = await getById(id);
    return { conexao, sucesso: conexao.status === 'CERTIFICADO_ATIVO', mensagem: conexao.mensagem_status };
  } finally {
    emissoesEmAndamento.delete(trava);
  }
}

async function resultado(id, sucesso) {
  const conexao = await getById(id);
  return { conexao, sucesso, mensagem: conexao.mensagem_status };
}

// ─── access token (reutilizável) ────────────────────────────────────────────────────────

// Cache por conexão até 1 minuto antes de vencer. A chave inclui o certificado, então
// renovar/reemitir invalida sozinho.
const cacheTokens = new Map();

async function contexto(conexaoId) {
  const row = await carregarLinha(conexaoId);
  if (!row) throw erro('Conexão não encontrada.', 404);
  if (!row.certificado_pem || !row.chave_privada_enc || !row.client_secret_enc) {
    throw erro('Esta conexão ainda não tem certificado.');
  }
  return {
    row,
    agente: sts.criarAgente(descriptografar(row.chave_privada_enc), row.certificado_pem),
    clientSecret: descriptografar(row.client_secret_enc),
  };
}

// Resultado cru ({ ok, accessToken } | { ok:false, codigo }), usado pelo teste de token.
async function obterToken(conexaoId, { ignorarCache = false } = {}) {
  const ctx = await contexto(conexaoId);
  const chaveCache = `${conexaoId}:${ctx.row.certificado_pem.length}:${ctx.row.certificado_pem.slice(-80)}`;
  const emCache = cacheTokens.get(chaveCache);
  if (!ignorarCache && emCache && emCache.expiraEm > Date.now()) return { ok: true, accessToken: emCache.token, ctx };

  const r = await sts.pedirAccessToken({ agente: ctx.agente, clientId: ctx.row.client_id, clientSecret: ctx.clientSecret });
  if (!r.ok) return { ...r, ctx };
  cacheTokens.set(chaveCache, { token: r.accessToken, expiraEm: Date.now() + Math.max(0, r.expiresIn - 60) * 1000 });
  return { ok: true, accessToken: r.accessToken, ctx };
}

// Função reutilizável pras futuras consultas: devolve o access_token (string) ou lança erro
// com o código (sem corpo).
async function getAccessToken(conexaoId) {
  const r = await obterToken(conexaoId);
  if (!r.ok) throw erro(`O Itaú recusou o access token (${r.codigo}).`, 502);
  return r.accessToken;
}

// Passo 8 (repetível — não consome o token temporário).
async function testarToken(id) {
  const r = await obterToken(id, { ignorarCache: true });
  const status = r.ctx.row.status;
  if (r.ok) {
    if (status === 'ERRO_TOKEN' || status === 'GERANDO') {
      await pool.query(
        "UPDATE conexoes_itau SET status = 'CERTIFICADO_ATIVO', ultimo_erro_codigo = NULL, atualizado_em = NOW() WHERE id = $1",
        [id]
      );
    }
  } else {
    await gravarErro(id, 'ERRO_TOKEN', r.codigo);
  }
  const conexao = await getById(id);
  return { conexao, sucesso: r.ok, mensagem: r.ok ? 'Access token gerado com sucesso (mTLS).' : conexao.mensagem_status };
}

// Consulta o extrato de hoje da conta cadastrada: 2xx → ATIVA; 403 → AGUARDANDO_ESCOPOS.
async function testarExtrato(id) {
  const row = await carregarLinha(id);
  if (!row) return null;
  if (!row.agencia || !row.conta || !row.dac) throw erro('Informe e salve a agência, a conta e o DAC antes de testar o extrato.');
  const t = await obterToken(id);
  if (!t.ok) {
    await gravarErro(id, 'ERRO_TOKEN', t.codigo);
    const conexao = await getById(id);
    return { conexao, sucesso: false, mensagem: conexao.mensagem_status };
  }
  const hoje = agoraSP().data;
  const r = await sts.consultarExtrato({
    agente: t.ctx.agente,
    accessToken: t.accessToken,
    clientId: row.client_id,
    conta: row,
    dataInicio: hoje,
    dataFim: hoje,
  });

  let mensagem;
  let novoStatus = null;
  const doItau = r.mensagemErro ? ` Itaú: "${r.mensagemErro}".` : '';
  // "ClientID not enable" (HTTP 401) = credencial ainda não habilitada na API de extrato — é a
  // liberação de escopos de até 2 dias úteis, não falha do token.
  const naoHabilitado = /not enable/i.test(r.mensagemErro || '');
  if (r.falhaRede) mensagem = 'Sem resposta da API de extrato do Itaú (rede ou tempo esgotado). Tente de novo.';
  else if (r.statusCode >= 200 && r.statusCode < 300) {
    novoStatus = 'ATIVA';
    mensagem = mensagemStatus('ATIVA');
  } else if (r.statusCode === 403 || naoHabilitado) {
    novoStatus = 'AGUARDANDO_ESCOPOS';
    mensagem = `${mensagemStatus('AGUARDANDO_ESCOPOS')}${doItau}`;
  } else if (r.statusCode === 401) mensagem = `A API de extrato recusou o acesso (HTTP 401).${doItau}`;
  else if (r.statusCode === 404) mensagem = `Extrato não encontrado (HTTP 404): confira a agência, a conta e o DAC.${doItau}`;
  else mensagem = `A API de extrato respondeu HTTP ${r.statusCode}.${doItau}`;

  if (novoStatus) {
    await pool.query('UPDATE conexoes_itau SET status = $1, ultimo_erro_codigo = NULL, atualizado_em = NOW() WHERE id = $2', [novoStatus, id]);
  }
  return { conexao: await getById(id), sucesso: novoStatus === 'ATIVA', mensagem };
}

// Saldo do momento (SALDO EM CONTA) da conta cadastrada na conexão, pelo extrato de `data`
// (AAAA-MM-DD) — usado na abertura do período de Saldo Contas Bancárias. Nunca lança por
// causa do Itaú: { ok: true, valor, posicao } | { ok: false, mensagem }.
async function consultarSaldoEmConta(conexaoId, data) {
  try {
    const t = await obterToken(conexaoId);
    if (!t.ok) return { ok: false, mensagem: `Access token recusado (${t.codigo}).` };
    const r = await sts.buscarExtratoJson({
      agente: t.ctx.agente,
      accessToken: t.accessToken,
      clientId: t.ctx.row.client_id,
      conta: t.ctx.row,
      data,
    });
    if (!r.ok) {
      if (r.falhaRede) return { ok: false, mensagem: 'Sem resposta da API de extrato do Itaú.' };
      return { ok: false, mensagem: `Extrato: HTTP ${r.statusCode}${r.mensagemErro ? ` (${r.mensagemErro})` : ''}.` };
    }
    const saldo = v.extrairSaldoEmConta(r.json);
    if (!saldo) return { ok: false, mensagem: 'O extrato não trouxe o SALDO EM CONTA.' };
    return { ok: true, ...saldo };
  } catch (err) {
    return { ok: false, mensagem: err.expose ? err.message : 'Erro interno ao consultar o saldo.' };
  }
}

// ─── renovação anual ────────────────────────────────────────────────────────────────────

async function renovarCertificado(id, { apenasSeNaJanela = false } = {}) {
  const atual = await getById(id);
  if (!atual) return null;
  if (!atual.tem_certificado) throw erro('Esta conexão ainda não tem certificado.');
  if (atual.certificado_vencido) {
    throw erro('O certificado já venceu e não pode mais ser renovado. Peça um novo token ao Itaú e gere o certificado de novo.');
  }
  if (!atual.pode_renovar) {
    if (apenasSeNaJanela) return { renovado: false, conexao: atual };
    throw erro(`O Itaú só aceita renovar nos últimos ${DIAS_JANELA_RENOVACAO} dias de validade (faltam ${atual.dias_restantes}).`);
  }
  garantirChave();

  const t = await obterToken(id, { ignorarCache: true });
  if (!t.ok) throw erro(`O Itaú recusou o access token necessário para renovar (${t.codigo}).`, 502);

  const row = t.ctx.row;
  const subject = { CN: row.client_id, OU: row.razao_social, L: row.cidade, ST: row.uf, C: 'BR' };
  const { chavePem, csrPem } = sts.gerarChaveECsr(subject);
  const resposta = await sts.renovarCertificado({ agente: t.ctx.agente, accessToken: t.accessToken, csrPem });
  if (resposta.falhaRede) throw erro('Sem resposta do Itaú na renovação. O certificado atual continua valendo; tente de novo mais tarde.', 502);
  if (resposta.statusCode < 200 || resposta.statusCode >= 300) {
    throw erro(`O Itaú recusou a renovação (HTTP ${resposta.statusCode}). O certificado atual continua valendo.`, 502);
  }
  const { certificadoPem, secret } = v.extrairRespostaCertificado(resposta.corpo);
  const leitura = certificadoPem ? sts.lerCertificado(certificadoPem, chavePem) : null;
  if (!leitura) {
    await pool.query('UPDATE conexoes_itau SET resposta_bruta_enc = $1, atualizado_em = NOW() WHERE id = $2', [
      criptografar(resposta.corpo),
      id,
    ]);
    throw erro('O Itaú respondeu à renovação, mas não foi possível ler o certificado. A resposta foi guardada para análise.', 502);
  }
  // Só troca chave/certificado depois de validar o novo — o secret pode não vir (mantém o atual).
  await pool.query(
    `UPDATE conexoes_itau SET chave_privada_enc = $1, certificado_pem = $2, client_secret_enc = $3,
       data_validade_certificado = $4, atualizado_em = NOW()
     WHERE id = $5`,
    [criptografar(chavePem), certificadoPem, secret ? criptografar(secret) : row.client_secret_enc, leitura.validade, id]
  );
  await testarToken(id);
  return { renovado: true, conexao: await getById(id) };
}

// Pro Monitor de Integrações: renova (quando na janela) as conexões ativas da empresa.
async function renovarCertificadosDaEmpresa(empresaId) {
  const { rows } = await pool.query(
    `SELECT id, nome FROM conexoes_itau
     WHERE empresa_id = $1 AND ativo = TRUE AND certificado_pem IS NOT NULL ORDER BY id`,
    [empresaId]
  );
  const linhas = [];
  let falhou = false;
  for (const { id, nome } of rows) {
    try {
      const r = await renovarCertificado(id, { apenasSeNaJanela: true });
      const validade = new Date(r.conexao.data_validade_certificado).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      linhas.push(r.renovado ? `${nome}: renovado, válido até ${validade}.` : `${nome}: válido até ${validade}, sem necessidade de renovar.`);
    } catch (err) {
      falhou = true;
      linhas.push(`${nome}: falha — ${err.expose ? err.message : 'erro interno'}`);
    }
  }
  if (falhou) throw new Error(linhas.join(' '));
  return linhas.join(' ');
}

module.exports = {
  list,
  getById,
  setAtivo,
  atualizar,
  conferirDados,
  gerarCertificado,
  getAccessToken,
  testarToken,
  testarExtrato,
  consultarSaldoEmConta,
  renovarCertificado,
  renovarCertificadosDaEmpresa,
  mensagemStatus,
};
