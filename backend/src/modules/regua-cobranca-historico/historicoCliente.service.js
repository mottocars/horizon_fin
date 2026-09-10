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

// Busca a parcela crua + classifica seu cluster com a MESMA regra de
// gestao-parcelas.service.js::buscarLinhasClassificadas (duplicada aqui de
// propósito, mesma convenção do resto do projeto): dias vencidos além do
// limite do Motor de Risco vira Inadimplência, senão é o cluster de score
// atual do cliente (`cobranca_clientes_clusters`, fallback 'novo'). Uma
// parcela só pertence a 1 cluster/1 etapa por vez agora — não existe mais
// "acumular todas as parcelas do cliente" (era o erro da versão anterior).
async function getParcelaClassificada(empresaId, billId, installmentId) {
  const { rows } = await pool.query(
    `SELECT bill_id, installment_id, client_id, client_name, due_date, corrected_balance_amount,
            document_identification_name, document_number, installment_number
     FROM sie_income
     WHERE empresa_id = $1 AND bill_id = $2 AND installment_id = $3 AND origin_id = $4`,
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

  return { parcela, cluster, diasSigned };
}

// Monta a timeline INTEIRA da régua deste cluster pra esta parcela: cada
// etapa configurada (ordenada por `dias`), com a data em que ela foi/será
// alcançada — `due_date + etapa.dias` dias, 100% determinístico, sem
// precisar de nenhum estado persistido (diferente da versão anterior, que
// tentava "detectar" a etapa atual). Etapa com data <= hoje já foi
// alcançada (mostra a data de verdade); daí em diante é "ainda não chegou
// lá" (mostrada apagada na tela, sem data). Os registros (observações +
// mensagens automáticas) são encaixados na janela [data desta etapa, data
// da próxima etapa - 1 dia] — como agora só existe 1 etapa por vez, as
// janelas nunca se sobrepõem.
// Pra cada etapa configurada, a data em que esta parcela a alcança
// (`due_date + etapa.dias`) e o fim da janela dela (véspera da data em que
// a PRÓXIMA etapa é alcançada, ou null se for a última configurada — nesse
// caso a janela fica aberta, some só quando a parcela for quitada).
// Etapas já vêm ordenadas por `dias` ASC (ver listEtapasComComunicacao).
function calcularJanelasEtapas(etapasConfig, dueDate) {
  return etapasConfig.map((e, i) => {
    const dataAlcancada = paraIso(somarDias(dueDate, e.dias));
    const proxima = etapasConfig[i + 1];
    const dataFimJanela = proxima ? paraIso(somarDias(dueDate, proxima.dias - 1)) : null;
    return { etapa: e, dataAlcancada, dataFimJanela };
  });
}

async function montarTimelineParcela(empresaId, parcela, cluster) {
  const etapasConfig = await listEtapasComComunicacao(empresaId, cluster);
  const hoje = hojeIso();
  const comData = calcularJanelasEtapas(etapasConfig, parcela.due_date);

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

  const registrosFormatados = registros.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    canal: r.canal,
    descricao: r.descricao,
    data_registro: r.data_registro,
    usuario_nome: r.usuario_nome,
    usuario_avatar_url: r.usuario_avatar_url,
    anexos: anexosPorRegistro[r.id] || [],
  }));

  return comData.map(({ etapa, dataAlcancada, dataFimJanela }) => {
    const alcancada = dataAlcancada <= hoje;
    const fimJanela = dataFimJanela || hoje;
    return {
      etapa_id: etapa.id,
      etapa_nome: etapa.nome,
      dias: etapa.dias,
      alcancada,
      data: alcancada ? dataAlcancada : null,
      responsavel_nome: etapa.responsavel_nome,
      canal_whatsapp: etapa.canal_whatsapp,
      canal_email: etapa.canal_email,
      canal_ligacao: etapa.canal_ligacao,
      registros: alcancada
        ? registrosFormatados.filter((r) => r.data_registro >= dataAlcancada && r.data_registro <= fimJanela)
        : [],
    };
  });
}

// Histórico completo de 1 parcela específica: dados do cliente + a
// classificação atual dela (cluster/dias) + a timeline inteira da régua
// daquele cluster (ver montarTimelineParcela). Nunca agrega outras parcelas
// do mesmo cliente — cada parcela tem sua própria história.
async function getHistoricoParcela(empresaId, billId, installmentId) {
  const { parcela, cluster, diasSigned } = await getParcelaClassificada(empresaId, billId, installmentId);
  const [cliente, timeline] = await Promise.all([
    getInfoCliente(empresaId, parcela.client_id),
    montarTimelineParcela(empresaId, parcela, cluster),
  ]);

  return {
    cliente,
    cluster,
    parcela: {
      bill_id: parcela.bill_id,
      installment_id: parcela.installment_id,
      due_date: parcela.due_date,
      dias: diasSigned,
      corrected_balance_amount: Number(parcela.corrected_balance_amount),
      document_identification_name: parcela.document_identification_name,
      document_number: parcela.document_number,
      installment_number: parcela.installment_number,
    },
    timeline,
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
// informada. Sem seleção manual de etapa: a data precisa cair na janela de
// UMA etapa já alcançada por esta parcela (agora só existe 1 por vez) — o
// backend acha sozinha, mesma lógica de montarTimelineParcela. `canal` é
// opcional (NULL pra uma observação genérica) — a Rotina do dia usa isso
// pra marcar o check de "Ligação realizada" (canal='ligacao') registrando
// a observação de verdade da ligação direto aqui, na mesma tabela que o
// resto do histórico (ver rotinas.service.js — não existe mais um caminho
// à parte só pra marcar ligação sem observação).
//
// `canal='whatsapp'` é diferente dos outros: além de registrar, DISPARA a
// mensagem de verdade pela Z-API (ver zapi.service.js::enviarMensagemTexto)
// — a `descricao` que chega do formulário é ignorada de propósito, e a
// `descricao` gravada é sempre a mensagem de verdade recém-montada a
// partir do template da etapa (mesma substituição de rotinas.service.js,
// pra nunca existir divergência entre "o que a pessoa viu antes de marcar"
// e "o que realmente saiu") — isso trava no backend a regra de "sem
// possibilidade de ser alterada" pedida pro campo, não só no front. Se o
// envio falhar, nada é gravado (o check na Rotina continua vermelho).
async function registrarObservacao(empresaId, { billId, installmentId, dataRegistro, descricao, canal, usuarioId, arquivos }) {
  const { parcela, cluster } = await getParcelaClassificada(empresaId, billId, installmentId);
  const etapasConfig = await listEtapasComComunicacao(empresaId, cluster);
  const janelas = calcularJanelasEtapas(etapasConfig, parcela.due_date);
  const hoje = hojeIso();

  const janelaAlcancada = janelas.find(
    ({ dataAlcancada, dataFimJanela }) =>
      dataAlcancada <= hoje && dataRegistro >= dataAlcancada && dataRegistro <= (dataFimJanela || hoje)
  );
  if (!janelaAlcancada) {
    throw badRequest('Nesta data a parcela ainda não estava em nenhuma etapa desta régua — ajuste a data informada.');
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
