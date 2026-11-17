const pool = require('../../config/db');
const {
  getZapiIntegracaoDoCluster,
  getEmailIntegracaoDoCluster,
  getComunicacaoAutomatica,
  formatarDataBR,
  formatarMoedaBR,
} = require('../regua-cobranca/reguaCobranca.service');
const { getTemplateEmMassa } = require('../comunicacao/comunicacao.service');
const historico = require('./historicoCliente.service');
const zapiService = require('../integracoes-zapi/zapi.service');
const emailService = require('../integracoes-email/email.service');

// Cobrança em massa (pedido do usuário, 17/11): na Rotina do dia, arrastar na
// coluna de um canal (WhatsApp, E-mail ou Ligação) seleciona vários títulos
// do MESMO cliente; ao soltar, sai UMA comunicação só (o template fixo de
// "Comunicação em massa", ver comunicacao.service.js — sem boleto) e cada
// linha selecionada ganha o seu próprio registro no Histórico de Etapas, como
// se tivesse sido um envio normal daquele canal (o check da Rotina acende em
// todas). Ligação não tem mensagem: é 1 observação aplicada a todos.

const CLUSTERS_ORDEM = ['novo', 'bom', 'duvidoso', 'mau', 'inad'];
const NOME_CANAL = { whatsapp: 'WhatsApp', email: 'e-mail', ligacao: 'ligação' };
const MAXIMO_ITENS = 100;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// "12/23" → "12" — mesma convenção da coluna Título da Rotina.
function numeroParcela(installmentNumber) {
  return String(installmentNumber ?? '').split('/')[0];
}

function rotuloTitulo(parcela) {
  return `${parcela.bill_id}/${numeroParcela(parcela.installment_number)}`;
}

// Mesma linha repetida (mesma parcela + mesma data) conta 1 vez só.
function normalizarItens(itens) {
  const unicos = new Map();
  for (const item of itens || []) unicos.set(`${item.billId}|${item.installmentId}|${item.dataRegistro}`, item);
  return [...unicos.values()];
}

// Tudo que a prévia e o envio precisam: as parcelas (validadas — mesmo
// cliente, nenhuma paga), o cliente, o pior cluster (decide qual conexão
// Z-API/e-mail usar, igual ao envio normal) e a mensagem já com as variáveis
// trocadas pelos dados reais.
async function montarCobranca(empresaId, canal, itensBrutos) {
  const itens = normalizarItens(itensBrutos);
  if (itens.length < 2) throw badRequest('Selecione pelo menos 2 títulos para uma cobrança em massa.');
  if (itens.length > MAXIMO_ITENS) throw badRequest(`Selecione no máximo ${MAXIMO_ITENS} títulos por vez.`);

  const classificadas = await Promise.all(
    itens.map((item) => historico.getParcelaClassificada(empresaId, item.billId, item.installmentId))
  );

  const clientes = new Set(classificadas.map((c) => String(c.parcela.client_id)));
  if (clientes.size > 1) throw badRequest('A cobrança em massa precisa ser de títulos do mesmo cliente.');

  const pagas = classificadas.filter((c) => c.status === 'em_dia' || c.status === 'atraso');
  if (pagas.length > 0) {
    throw badRequest(`Já pago(s): ${[...new Set(pagas.map((c) => rotuloTitulo(c.parcela)))].join(', ')} — tire da seleção.`);
  }

  // A mesma parcela pode estar em 2 linhas (2 etapas no período): na
  // mensagem ela aparece 1 vez; no histórico, cada linha ganha o seu registro.
  const unicas = new Map();
  for (const c of classificadas) unicas.set(`${c.parcela.bill_id}|${c.parcela.installment_id}`, c.parcela);
  const parcelas = [...unicas.values()].sort(
    (a, b) =>
      new Date(a.due_date) - new Date(b.due_date) ||
      Number(a.bill_id) - Number(b.bill_id) ||
      Number(a.installment_id) - Number(b.installment_id)
  );

  const cluster = classificadas
    .map((c) => c.cluster)
    .reduce((pior, atual) => (CLUSTERS_ORDEM.indexOf(atual) > CLUSTERS_ORDEM.indexOf(pior) ? atual : pior));
  const total = parcelas.reduce((soma, p) => soma + (Number(p.corrected_balance_amount) || 0), 0);
  const primeira = classificadas[0].parcela;
  const [cliente, centroCusto] = await Promise.all([
    historico.getInfoCliente(empresaId, primeira.client_id),
    historico.getCentroCustoDaParcela(empresaId, primeira.bill_id, primeira.installment_id),
  ]);
  const nomeCliente = primeira.client_name || cliente?.name || '';

  let mensagem = null;
  let assunto = null;
  if (canal !== 'ligacao') {
    const template = await getTemplateEmMassa(empresaId);
    const valores = {
      nome_cliente: nomeCliente,
      centro_custo: centroCusto,
      lista_titulos: parcelas
        .map(
          (p) =>
            `• Título ${p.bill_id} – parcela ${numeroParcela(p.installment_number)} – venc. ${formatarDataBR(p.due_date)} – ${formatarMoedaBR(p.corrected_balance_amount)}`
        )
        .join('\n'),
      quantidade_titulos: String(parcelas.length),
      valor_total: formatarMoedaBR(total),
    };
    const substituir = (texto) =>
      String(texto || '').replace(/@([a-z_]+)/g, (trecho, chave) => (chave in valores ? valores[chave] : trecho));
    mensagem = substituir(template.corpo);
    assunto = substituir(template.assunto) || 'Aviso de cobrança';
  }

  const copiar = canal !== 'ligacao' && (await getComunicacaoAutomatica(empresaId)).tipo === 'copiar';

  return { itens, parcelas, cluster, total, cliente, nomeCliente, centroCusto, mensagem, assunto, copiar };
}

// O que impede o envio de verdade (sem telefone/e-mail, sem conexão) — na
// prévia vira aviso no modal (botão desabilitado); no envio, erro.
async function impedimentosEnvio(empresaId, canal, montagem) {
  if (canal === 'ligacao' || montagem.copiar) return { avisos: [], integracaoId: null };
  const avisos = [];
  let integracaoId = null;
  if (!montagem.mensagem?.trim()) avisos.push('O template de Comunicação em massa está sem texto (aba Comunicação).');
  if (canal === 'whatsapp') {
    if (!montagem.cliente?.telefone) avisos.push('O cliente não tem telefone cadastrado para receber o WhatsApp.');
    integracaoId = await getZapiIntegracaoDoCluster(empresaId, montagem.cluster);
    if (!integracaoId) avisos.push('Nenhuma conexão Z-API configurada para este cluster nas Configurações Globais da Régua de Cobrança.');
  } else {
    if (!montagem.cliente?.email) avisos.push('O cliente não tem e-mail cadastrado para receber a mensagem.');
    integracaoId = await getEmailIntegracaoDoCluster(empresaId, montagem.cluster);
    if (!integracaoId) avisos.push('Nenhuma conexão de e-mail configurada para este cluster nas Configurações Globais da Régua de Cobrança.');
  }
  return { avisos, integracaoId };
}

async function previaCobrancaEmMassa(empresaId, { canal, itens }) {
  const montagem = await montarCobranca(empresaId, canal, itens);
  const { avisos } = await impedimentosEnvio(empresaId, canal, montagem);
  return {
    canal,
    copiar: montagem.copiar,
    cliente: {
      nome: montagem.nomeCliente,
      telefone: montagem.cliente?.telefone || null,
      email: montagem.cliente?.email || null,
    },
    centro_custo: montagem.centroCusto,
    titulos: montagem.parcelas.map((p) => ({
      bill_id: p.bill_id,
      installment_id: p.installment_id,
      titulo: rotuloTitulo(p),
      vencimento: p.due_date,
      valor: Number(p.corrected_balance_amount) || 0,
    })),
    quantidade_titulos: montagem.parcelas.length,
    valor_total: montagem.total,
    mensagem: montagem.mensagem,
    assunto: canal === 'email' ? montagem.assunto : null,
    avisos,
  };
}

async function registrarCobrancaEmMassa(empresaId, { canal, itens, observacao, usuarioId }) {
  const montagem = await montarCobranca(empresaId, canal, itens);
  const { avisos, integracaoId } = await impedimentosEnvio(empresaId, canal, montagem);
  if (avisos.length > 0) throw badRequest(avisos[0]);

  // 1 envio só, sem boleto.
  if (canal !== 'ligacao' && !montagem.copiar) {
    try {
      if (canal === 'whatsapp') {
        await zapiService.enviarMensagemTexto(integracaoId, { telefone: montagem.cliente.telefone, mensagem: montagem.mensagem });
      } else {
        await emailService.enviarEmail(integracaoId, {
          destinatario: montagem.cliente.email,
          assunto: montagem.assunto,
          corpo: montagem.mensagem,
        });
      }
    } catch (err) {
      for (const item of montagem.itens) {
        await historico.registrarFalhaEnvio(empresaId, item.billId, item.installmentId, canal, item.dataRegistro, err.message);
      }
      throw err;
    }
  }

  const titulos = montagem.parcelas.map(rotuloTitulo);
  const cabecalho =
    canal === 'ligacao'
      ? `Ligação em massa — ${titulos.length} títulos tratados na mesma ligação: ${titulos.join(', ')}.`
      : `Cobrança em massa por ${NOME_CANAL[canal]}${montagem.copiar ? ' (mensagem copiada e enviada pelo responsável)' : ''} — ${titulos.length} títulos na mesma mensagem: ${titulos.join(', ')}.`;
  const corpo = canal === 'ligacao' ? (observacao || '').trim() : montagem.mensagem;
  const descricao = corpo ? `${cabecalho}\n\n${corpo}` : cabecalho;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of montagem.itens) {
      await client.query(
        `DELETE FROM regua_cobranca_envios_falhos
         WHERE empresa_id = $1 AND bill_id = $2 AND installment_id = $3 AND canal = $4 AND data_registro = $5`,
        [empresaId, item.billId, item.installmentId, canal, item.dataRegistro]
      );
      await client.query(
        `INSERT INTO regua_cobranca_historico_registros (empresa_id, bill_id, installment_id, tipo, usuario_id, canal, descricao, data_registro)
         VALUES ($1, $2, $3, 'manual', $4, $5, $6, $7)`,
        [empresaId, item.billId, item.installmentId, usuarioId || null, canal, descricao, item.dataRegistro]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { registrados: montagem.itens.length, titulos, mensagem: montagem.mensagem, copiar: montagem.copiar };
}

module.exports = { previaCobrancaEmMassa, registrarCobrancaEmMassa };
