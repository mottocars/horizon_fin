// Busca o boleto de 1 parcela específica no Sienge (endpoint
// /payment-slip-notification) e baixa o PDF de verdade — usado só pelo
// envio de WhatsApp com boleto anexado (ver historicoCliente.service.js::
// registrarObservacao, quando o template da etapa tem `enviar_boleto`
// ligado). Mesmo padrão de autenticação (Basic Auth com tenant/username/
// password da integração ativa da empresa) e mesmo helper de rede
// (siengeFetch, com retry/timeout) que os outros clientes Sienge do
// projeto (ver customers-sienge/customers-api.client.js) — duplicado aqui
// de propósito, mesma convenção de não compartilhar entre módulos.
//
// Nada disso toca o disco: baixa os bytes pra memória, converte pra
// base64 (formato que a Z-API aceita direto no campo `document`, ver
// zapi.service.js::enviarDocumento) e descarta — a resposta HTTP inteira
// sai de escopo assim que a função termina, o coletor de lixo do Node
// cuida do resto. Sem arquivo temporário, não tem o que "ocupar espaço"
// nem o que precisar apagar depois.
const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const { siengeFetch } = require('../../utils/siengeFetch');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function getIntegracaoAtiva(empresaId) {
  const { rows } = await pool.query(
    'SELECT tenant, username, password_enc FROM integracoes_sienge WHERE empresa_id = $1 AND ativo = TRUE LIMIT 1',
    [empresaId]
  );
  return rows[0] || null;
}

// GET .../public/api/v1/payment-slip-notification?billReceivableId=X&installmentId=Y
// Devolve { urlReport, digitableNumber } do 1º resultado — 1 parcela só tem
// 1 boleto de cada vez, não existe "escolher qual".
async function buscarUrlBoleto({ tenant, username, password, billId, installmentId }) {
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const url = `https://api.sienge.com.br/${tenant}/public/api/v1/payment-slip-notification?billReceivableId=${billId}&installmentId=${installmentId}`;

  const response = await siengeFetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'User-Agent': 'HorizonFin/1.0 (+https://horizonfin.local)',
    },
  });

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.message || body?.error || '';
    } catch {
      // resposta sem corpo JSON legível — segue sem detalhe
    }
    throw badRequest(`A API do Sienge retornou erro ao buscar o boleto (status ${response.status})${detail ? `: ${detail}` : ''}.`);
  }

  const page = await response.json();
  const resultado = page?.results?.[0];
  if (!resultado?.urlReport) {
    throw badRequest('O Sienge não retornou um boleto para esta parcela.');
  }
  return resultado;
}

// Baixa o PDF de verdade do link retornado pelo Sienge — é um link de
// relatório já pronto pra download (não precisa de Basic Auth de novo; o
// próprio Sienge embute a autorização no link).
async function baixarArquivo(url) {
  const response = await siengeFetch(url, { headers: { 'User-Agent': 'HorizonFin/1.0 (+https://horizonfin.local)' } });
  if (!response.ok) {
    throw badRequest(`Não foi possível baixar o boleto do Sienge (status ${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Fluxo completo: acha a integração da empresa, busca o link do boleto
// desta parcela, baixa e devolve já em base64 — pronto pro campo
// `document` do envio de WhatsApp (ver zapi.service.js::enviarDocumento).
async function buscarBoletoParaEnvio(empresaId, { billId, installmentId }) {
  const integracao = await getIntegracaoAtiva(empresaId);
  if (!integracao) {
    throw badRequest('Esta empresa não possui uma integração com o Sienge ativa configurada.');
  }
  const password = decrypt(integracao.password_enc);

  const { urlReport, digitableNumber } = await buscarUrlBoleto({
    tenant: integracao.tenant,
    username: integracao.username,
    password,
    billId,
    installmentId,
  });

  const buffer = await baixarArquivo(urlReport);
  return { base64: buffer.toString('base64'), digitableNumber };
}

module.exports = { buscarBoletoParaEnvio };
