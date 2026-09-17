const fs = require('fs');
const path = require('path');
const pool = require('../../config/db');
const {
  getLimiteVigente,
  listEtapasComComunicacao,
  getZapiIntegracaoDoCluster,
  getEmailIntegracaoDoCluster,
  substituirVariaveisTemplate,
} = require('../regua-cobranca/reguaCobranca.service');
const zapiService = require('../integracoes-zapi/zapi.service');
const emailService = require('../integracoes-email/email.service');
const { buscarBoletoParaEnvio } = require('./boletoSienge');

const CLUSTERS_VALIDOS = ['novo', 'bom', 'duvidoso', 'mau', 'inad'];
const ORIGIN_ID_PADRAO = 'CO';
const UM_DIA_MS = 24 * 60 * 60 * 1000;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// Mesmo padrão de repassesCef.service.js::MICROETAPAS_UPLOADS_DIR — arquivo
// em disco, só o metadado no banco.
const ANEXOS_UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'regua-cobranca-historico');

function sanitizeNomeArquivo(nome) {
  return String(nome).replace(/[^a-zA-Z0-9_.-]/g, '_');
}

// Mesmos helpers de data UTC-safe de gestao-parcelas.service.js, duplicados
// aqui de propósito (mesma convenção de não compartilhar entre módulos).
function inicioDoDiaUTC(data) {
  const d = new Date(data);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function hojeComoDataUTC() {
  const agora = new Date();
  return new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()));
}

function diasEntre(dataMenor, dataMaior) {
  return Math.round((inicioDoDiaUTC(dataMaior).getTime() - inicioDoDiaUTC(dataMenor).getTime()) / UM_DIA_MS);
}

function somarDias(data, dias) {
  const d = inicioDoDiaUTC(data);
  return new Date(d.getTime() + dias * UM_DIA_MS);
}

function paraIso(data) {
  return data.toISOString().slice(0, 10);
}

function hojeIso() {
  return paraIso(hojeComoDataUTC());
}

// Nome/telefone principal/e-mail do cliente — mesmo LATERAL JOIN de
// customers.service.js::listClientesPorCentroCusto (telefone marcado
// `main = true`; sem nenhum marcado, pega o primeiro cadastrado).
async function getInfoCliente(empresaId, clientId) {
  const { rows } = await pool.query(
    `SELECT sc.id AS client_id, sc.name, sc.email, tel.number AS telefone
     FROM sie_customers sc
     LEFT JOIN LATERAL (
       SELECT number FROM sie_customers_phones p
       WHERE p.customer_id = sc.id AND p.empresa_id = sc.empresa_id
       ORDER BY p.main DESC NULLS LAST, p.id ASC
       LIMIT 1
     ) tel ON TRUE
     WHERE sc.empresa_id = $1 AND sc.id = $2`,
    [empresaId, clientId]
  );
  return rows[0] || null;
}

// Nome do centro de custo pra variável @centro_custo do template — uma
// parcela rateada em mais de 1 centro pega só o primeiro (raro, e a
// mensagem não muda por causa disso, é só um texto informativo).
async function getCentroCustoDaParcela(empresaId, billId, installmentId) {
  const { rows } = await pool.query(
    `SELECT cost_center_name FROM sie_income_categorias
     WHERE empresa_id = $1 AND bill_id = $2 AND installment_id = $3
     ORDER BY cost_center_id ASC LIMIT 1`,
    [empresaId, billId, installmentId]
  );
  return rows[0]?.cost_center_name || '';
}

// Busca a parcela crua + classifica ela com a MESMA regra de
// gestao-parcelas.service.js: `cluster` (pra rotear qual régua/template usar
// no envio de WhatsApp/e-mail — duplicada aqui de propósito, mesma convenção
// do resto do projeto) segue reclassificando pra 'inad' quando os dias
// vencidos passam do limite do Motor de Risco; `clusterCliente` é o cluster
// de score cru do cliente (`cobranca_clientes_clusters`, fallback 'novo'),
// sem essa reclassificação — é o que aparece no cabeçalho do modal, igual
// já vinha marcado na tela anterior (Gestão das Parcelas). `status` é o
// mesmo 4 estados de gestaoParcelas.service.js::listParcelasPorTitulo (em
// paga em_dia/atraso, inadimplente ou a_vencer), com os mesmos 3 valores
// pago/vencido/a vencer — usado tanto pro badge do cabeçalho quanto pra
// decidir se ainda dá pra registrar observação (ver registrarObservacao).
async function getParcelaClassificada(empresaId, billId, installmentId) {
  const { rows } = await pool.query(
    `SELECT si.bill_id, si.installment_id, si.client_id, si.client_name, si.due_date,
            si.corrected_balance_amount, si.original_amount,
            si.document_identification_name, si.document_number, si.installment_number,
            pg.ultimo_pagamento
     FROM sie_income si
     LEFT JOIN (
       SELECT bill_id, installment_id, MAX(payment_date) AS ultimo_pagamento
       FROM sie_income_recebimentos
       WHERE empresa_id = $1
       GROUP BY bill_id, installment_id
     ) pg ON pg.bill_id = si.bill_id AND pg.installment_id = si.installment_id
     WHERE si.empresa_id = $1 AND si.bill_id = $2 AND si.installment_id = $3 AND si.origin_id = $4`,
    [empresaId, billId, installmentId, ORIGIN_ID_PADRAO]
  );
  const parcela = rows[0];
  if (!parcela) throw badRequest('Parcela não encontrada.');

  const limite = await getLimiteVigente(empresaId);
  const { rows: clusterRows } = await pool.query(
    'SELECT cluster FROM cobranca_clientes_clusters WHERE empresa_id = $1 AND client_id = $2',
    [empresaId, parcela.client_id]
  );
  const clusterCliente = clusterRows[0]?.cluster || 'novo';

  const diasSigned = diasEntre(parcela.due_date, hojeComoDataUTC());
  const cluster = diasSigned > limite ? 'inad' : clusterCliente;

  const paga = Number(parcela.corrected_balance_amount) === 0;
  let status;
  if (paga) {
    status = parcela.ultimo_pagamento && new Date(parcela.ultimo_pagamento) > new Date(parcela.due_date) ? 'atraso' : 'em_dia';
  } else if (diasSigned > limite) {
    status = 'inadimplente';
  } else {
    status = 'a_vencer';
  }
  const saldoAberto = Number(parcela.corrected_balance_amount) || 0;

  return {
    parcela,
    cluster,
    clusterCliente,
    diasSigned,
    limite,
    status,
    valorPago: paga ? Number(parcela.original_amount) || 0 : 0,
    valorVencido: status === 'inadimplente' ? saldoAberto : 0,
    valorAVencer: status === 'a_vencer' ? saldoAberto : 0,
  };
}

// Pra cada etapa configurada, a data em que esta parcela a alcança
// (`due_date + etapa.dias`) e o fim da janela dela (véspera da data em que
// a PRÓXIMA etapa é alcançada, ou null se for a última configurada — nesse
// caso a janela fica aberta, some só quando a parcela for quitada). Usada
// hoje só pra achar o TEMPLATE certo de WhatsApp/e-mail no envio (ver
// registrarObservacao) — a tela não mostra mais essas janelas (saiu o funil
// de etapas, ver montarRegistrosParcela). Etapas já vêm ordenadas por `dias`
// ASC (ver listEtapasComComunicacao).
function calcularJanelasEtapas(etapasConfig, dueDate) {
  return etapasConfig.map((e, i) => {
    const dataAlcancada = paraIso(somarDias(dueDate, e.dias));
    const proxima = etapasConfig[i + 1];
    const dataFimJanela = proxima ? paraIso(somarDias(dueDate, proxima.dias - 1)) : null;
    return { etapa: e, dataAlcancada, dataFimJanela };
  });
}

// Lista plana (mais antigo → mais recente) de TODOS os registros desta
// parcela — observação manual, WhatsApp, e-mail ou ligação — sem mais
// agrupar por etapa da régua (o funil de etapas saiu da tela, mesma linha
// de "Etapa da régua/responsável/canais saíram da tela" já aplicada em
// Gestão das Parcelas). Cada registro carrega o retrato de como a parcela
// estava NAQUELE momento — futura (ainda não vencida), em atraso (vencida,
// mas ainda dentro do limite de dias do Motor de Risco) ou inadimplente (já
// passou do limite) — usando o `limite` de HOJE (não existe um limite
// histórico versionado no sistema) aplicado à data do próprio registro, não
// a hoje.
async function montarRegistrosParcela(empresaId, parcela, limite) {
  const { rows: registros } = await pool.query(
    `SELECT r.id, r.tipo, r.canal, r.descricao, r.data_registro::text AS data_registro,
            r.usuario_id, u.nome AS usuario_nome, u.avatar_url AS usuario_avatar_url
     FROM regua_cobranca_historico_registros r
     LEFT JOIN usuarios u ON u.id = r.usuario_id
     WHERE r.empresa_id = $1 AND r.bill_id = $2 AND r.installment_id = $3
     ORDER BY r.data_registro ASC, r.id ASC`,
    [empresaId, parcela.bill_id, parcela.installment_id]
  );

  const anexosPorRegistro = {};
  if (registros.length > 0) {
    const { rows: anexos } = await pool.query(
      `SELECT id, registro_id, nome_original
       FROM regua_cobranca_historico_anexos
       WHERE registro_id = ANY($1::int[])
       ORDER BY id ASC`,
      [registros.map((r) => r.id)]
    );
    for (const a of anexos) {
      (anexosPorRegistro[a.registro_id] ??= []).push({ id: a.id, nome_original: a.nome_original });
    }
  }

  return registros.map((r) => {
    const diasNaData = diasEntre(parcela.due_date, r.data_registro);
    let statusNaData;
    if (diasNaData <= 0) statusNaData = 'futura';
    else if (diasNaData > limite) statusNaData = 'inadimplente';
    else statusNaData = 'em_atraso';
    return {
      id: r.id,
      tipo: r.tipo,
      canal: r.canal,
      descricao: r.descricao,
      data_registro: r.data_registro,
      usuario_nome: r.usuario_nome,
      usuario_avatar_url: r.usuario_avatar_url,
      anexos: anexosPorRegistro[r.id] || [],
      status_na_data: statusNaData,
      dias_na_data: diasNaData > 0 ? diasNaData : 0,
    };
  });
}

// Histórico completo de 1 parcela específica: dados do cliente + a
// classificação atual dela (cluster do cliente, status, valor) + a lista
// plana de registros (ver montarRegistrosParcela). Nunca agrega outras
// parcelas do mesmo cliente — cada parcela tem sua própria história.
async function getHistoricoParcela(empresaId, billId, installmentId) {
  const { parcela, clusterCliente, diasSigned, limite, status, valorPago, valorVencido, valorAVencer } =
    await getParcelaClassificada(empresaId, billId, installmentId);
  const [cliente, registros] = await Promise.all([
    getInfoCliente(empresaId, parcela.client_id),
    montarRegistrosParcela(empresaId, parcela, limite),
  ]);

  return {
    cliente,
    cluster: clusterCliente,
    parcela: {
      bill_id: parcela.bill_id,
      installment_id: parcela.installment_id,
      due_date: parcela.due_date,
      dias: diasSigned,
      corrected_balance_amount: Number(parcela.corrected_balance_amount),
      document_identification_name: parcela.document_identification_name,
      document_number: parcela.document_number,
      installment_number: parcela.installment_number,
      status,
      valor_pago: valorPago,
      valor_vencido: valorVencido,
      valor_a_vencer: valorAVencer,
    },
    registros,
  };
}

// Registra que uma tentativa de envio (WhatsApp ou e-mail) FALHOU —
// telefone/e-mail errado, conexão fora do ar etc. — é o que faz a Rotina
// mostrar "erro" em vez de "pendente" pra esta linha (ver
// rotinas.service.js). Nunca deixa essa gravação mascarar o erro de
// verdade que já vai voltar pro modal (chamado sempre seguido de `throw`).
async function registrarFalhaEnvio(empresaId, billId, installmentId, canal, dataRegistro, mensagemErro) {
  await pool
    .query(
      `INSERT INTO regua_cobranca_envios_falhos (empresa_id, bill_id, installment_id, canal, data_registro, mensagem_erro)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (empresa_id, bill_id, installment_id, canal, data_registro)
       DO UPDATE SET mensagem_erro = EXCLUDED.mensagem_erro, criado_em = NOW()`,
      [empresaId, billId, installmentId, canal, dataRegistro, mensagemErro]
    )
    .catch(() => {});
}

// Registra uma observação (manual, sempre — o automático só existirá
// quando houver um job de disparo de verdade) pra esta parcela, na data
// informada. Parcela paga (em_dia ou atraso) nem chega a tentar — pedido do
// usuário: sem observação nova pra parcela já quitada, só inadimplência e
// parcela futura/em aberto continuam recebendo registro novo (o histórico
// já registrado antes continua visível pra sempre, ver getHistoricoParcela).
// `canal` é opcional (NULL vira "Observação Manual" na tela) — a Rotina do
// dia usa isso pra marcar o check de "Ligação realizada" (canal='ligacao')
// registrando a observação de verdade da ligação direto aqui, na mesma
// tabela que o resto do histórico (ver rotinas.service.js).
//
// `canal='whatsapp'`/`'email'` são diferentes dos outros: além de
// registrar, DISPARAM a mensagem de verdade (Z-API/e-mail — ver blocos
// abaixo), e o TEMPLATE de cada um vem da etapa da régua que a parcela
// alcançou na data informada — por isso, só pra esses 2 canais, a data
// ainda precisa cair na janela de uma etapa já alcançada (mesma régua do
// `cluster` reclassificado, ver getParcelaClassificada). Observação manual
// e ligação não dependem de nenhum template, então não precisam de etapa
// nenhuma — podem ser registradas em qualquer data, inclusive antes do
// vencimento (parcela futura).
async function registrarObservacao(empresaId, { billId, installmentId, dataRegistro, descricao, canal, usuarioId, arquivos }) {
  const { parcela, cluster, status } = await getParcelaClassificada(empresaId, billId, installmentId);

  if (status === 'em_dia' || status === 'atraso') {
    throw badRequest('Esta parcela já está paga — não é possível registrar novas observações.');
  }

  let janelaAlcancada = null;
  if (canal === 'whatsapp' || canal === 'email') {
    const etapasConfig = await listEtapasComComunicacao(empresaId, cluster);
    const janelas = calcularJanelasEtapas(etapasConfig, parcela.due_date);
    const hoje = hojeIso();

    janelaAlcancada = janelas.find(
      ({ dataAlcancada, dataFimJanela }) =>
        dataAlcancada <= hoje && dataRegistro >= dataAlcancada && dataRegistro <= (dataFimJanela || hoje)
    );
    if (!janelaAlcancada) {
      throw badRequest('Nesta data a parcela ainda não estava em nenhuma etapa desta régua — ajuste a data informada.');
    }
  }

  let descricaoFinal = descricao || '';
  if (canal === 'whatsapp') {
    const { etapa } = janelaAlcancada;
    if (!etapa.template_corpo) {
      throw badRequest('Esta etapa não tem um template de WhatsApp configurado na Régua de Cobrança.');
    }

    const [cliente, centroCusto, zapiIntegracaoId] = await Promise.all([
      getInfoCliente(empresaId, parcela.client_id),
      getCentroCustoDaParcela(empresaId, billId, installmentId),
      getZapiIntegracaoDoCluster(empresaId, cluster),
    ]);
    if (!cliente?.telefone) {
      throw badRequest('O cliente não tem telefone cadastrado para receber o WhatsApp.');
    }
    if (!zapiIntegracaoId) {
      throw badRequest('Nenhuma conexão Z-API configurada para este cluster nas Configurações Globais da Régua de Cobrança.');
    }

    descricaoFinal = substituirVariaveisTemplate(etapa.template_corpo, {
      nomeCliente: parcela.client_name,
      centroCusto,
      vencimento: parcela.due_date,
      valor: parcela.corrected_balance_amount,
    });

    try {
      if (etapa.template_enviar_boleto) {
        // Busca e baixa o boleto de verdade no Sienge (ver boletoSienge.js —
        // tudo em memória, nada grava em disco) e manda como documento, com
        // a mensagem do template virando a legenda — 1 mensagem só, igual a
        // como a pessoa mandaria manualmente pelo celular.
        const { base64 } = await buscarBoletoParaEnvio(empresaId, { billId, installmentId });
        await zapiService.enviarDocumento(zapiIntegracaoId, {
          telefone: cliente.telefone,
          documentoBase64: base64,
          legenda: descricaoFinal,
        });
      } else {
        await zapiService.enviarMensagemTexto(zapiIntegracaoId, { telefone: cliente.telefone, mensagem: descricaoFinal });
      }
    } catch (err) {
      await registrarFalhaEnvio(empresaId, billId, installmentId, canal, dataRegistro, err.message);
      throw err;
    }
  } else if (canal === 'email') {
    const { etapa } = janelaAlcancada;
    if (!etapa.template_corpo) {
      throw badRequest('Esta etapa não tem um template de e-mail configurado na Régua de Cobrança.');
    }

    const [cliente, centroCusto, emailIntegracaoId] = await Promise.all([
      getInfoCliente(empresaId, parcela.client_id),
      getCentroCustoDaParcela(empresaId, billId, installmentId),
      getEmailIntegracaoDoCluster(empresaId, cluster),
    ]);
    if (!cliente?.email) {
      throw badRequest('O cliente não tem e-mail cadastrado para receber a mensagem.');
    }
    if (!emailIntegracaoId) {
      throw badRequest('Nenhuma conexão de e-mail configurada para este cluster nas Configurações Globais da Régua de Cobrança.');
    }

    const variaveis = {
      nomeCliente: parcela.client_name,
      centroCusto,
      vencimento: parcela.due_date,
      valor: parcela.corrected_balance_amount,
    };
    // O assunto só existe pra este canal (o WhatsApp não tem "assunto",
    // por isso a régua o ignora ali) — vira o header de verdade do e-mail,
    // nunca é gravado à parte (ver rotinas.service.js::assunto_email pra
    // como a Rotina pré-visualiza o mesmo texto antes de enviar).
    const assuntoFinal = substituirVariaveisTemplate(etapa.template_assunto, variaveis) || 'Aviso de cobrança';
    descricaoFinal = substituirVariaveisTemplate(etapa.template_corpo, variaveis);

    try {
      if (etapa.template_enviar_boleto) {
        // Mesmo boleto de verdade do WhatsApp (ver bloco acima) — buscado
        // em memória e anexado ao e-mail, sem tocar em disco.
        const { base64 } = await buscarBoletoParaEnvio(empresaId, { billId, installmentId });
        await emailService.enviarEmail(emailIntegracaoId, {
          destinatario: cliente.email,
          assunto: assuntoFinal,
          corpo: descricaoFinal,
          anexoBase64: base64,
          anexoNomeArquivo: 'boleto.pdf',
        });
      } else {
        await emailService.enviarEmail(emailIntegracaoId, {
          destinatario: cliente.email,
          assunto: assuntoFinal,
          corpo: descricaoFinal,
        });
      }
    } catch (err) {
      await registrarFalhaEnvio(empresaId, billId, installmentId, canal, dataRegistro, err.message);
      throw err;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Chegou até aqui = o envio (quando é o caso, ver bloco de WhatsApp
    // acima) deu certo — qualquer falha anterior registrada pra esta mesma
    // parcela+canal+data "para de existir" (a linha de erro nunca convive
    // com um sucesso na mesma data).
    if (canal) {
      await client.query(
        `DELETE FROM regua_cobranca_envios_falhos
         WHERE empresa_id = $1 AND bill_id = $2 AND installment_id = $3 AND canal = $4 AND data_registro = $5`,
        [empresaId, billId, installmentId, canal, dataRegistro]
      );
    }

    const { rows: inseridas } = await client.query(
      `INSERT INTO regua_cobranca_historico_registros (empresa_id, bill_id, installment_id, tipo, usuario_id, canal, descricao, data_registro)
       VALUES ($1, $2, $3, 'manual', $4, $5, $6, $7)
       RETURNING id`,
      [empresaId, billId, installmentId, usuarioId || null, canal || null, descricaoFinal, dataRegistro]
    );
    const registroId = inseridas[0].id;

    // Mesma lógica do texto da mensagem (ver descricaoFinal acima): o
    // frontend já não mostra o botão de anexar pra WhatsApp/e-mail (o único
    // anexo que sai nesses canais é o boleto, decidido pelo template e
    // buscado de verdade no Sienge, ver blocos acima), mas a garantia de
    // verdade fica aqui — mesmo que algo chegasse em `arquivos`, é ignorado
    // pra estes 2 canais.
    if (canal !== 'whatsapp' && canal !== 'email' && arquivos && arquivos.length > 0) {
      const empresaDir = path.join(ANEXOS_UPLOADS_DIR, String(empresaId));
      fs.mkdirSync(empresaDir, { recursive: true });

      for (const arquivo of arquivos) {
        const nomeArmazenado = `${Date.now()}_${sanitizeNomeArquivo(arquivo.originalname)}`;
        fs.copyFileSync(arquivo.path, path.join(empresaDir, nomeArmazenado));
        fs.unlink(arquivo.path, () => {});

        await client.query(
          `INSERT INTO regua_cobranca_historico_anexos (registro_id, nome_original, arquivo_armazenado, tamanho_bytes)
           VALUES ($1, $2, $3, $4)`,
          [registroId, arquivo.originalname, path.join(String(empresaId), nomeArmazenado), arquivo.size]
        );
      }
    }

    await client.query('COMMIT');
    return { id: registroId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getAnexo(empresaId, anexoId) {
  const { rows } = await pool.query(
    `SELECT a.nome_original, a.arquivo_armazenado
     FROM regua_cobranca_historico_anexos a
     JOIN regua_cobranca_historico_registros r ON r.id = a.registro_id
     WHERE a.id = $1 AND r.empresa_id = $2`,
    [anexoId, empresaId]
  );
  const anexo = rows[0];
  if (!anexo) return null;

  const caminhoAbsoluto = path.join(ANEXOS_UPLOADS_DIR, anexo.arquivo_armazenado);
  if (!fs.existsSync(caminhoAbsoluto)) return null;

  return { caminhoAbsoluto, nomeOriginal: anexo.nome_original || 'anexo' };
}

module.exports = {
  CLUSTERS_VALIDOS,
  getHistoricoParcela,
  registrarObservacao,
  getAnexo,
};
