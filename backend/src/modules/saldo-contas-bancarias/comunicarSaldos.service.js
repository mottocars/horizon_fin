const pool = require('../../config/db');
const service = require('./saldos.service');
const saldosExcelService = require('./saldosExcel.service');
const zapiService = require('../integracoes-zapi/zapi.service');
const { calcularResumoSaldos } = require('./resumoSaldos.calculo');

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function brData(iso) {
  return iso.split('-').reverse().join('/');
}

// Domingo->sábado da semana que contém `iso` — mesmo critério de constantes.js::domingoDaSemana/
// semanaDe no frontend (a grade sempre trava numa semana só), portado com aritmética de Date
// local pura (sem parsing UTC, sem risco de fuso).
function semanaDe(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia);
  const domingo = new Date(data.getFullYear(), data.getMonth(), data.getDate() - data.getDay());
  const sabado = new Date(domingo.getFullYear(), domingo.getMonth(), domingo.getDate() + 6);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { dataInicio: fmt(domingo), dataFim: fmt(sabado) };
}

// Mesmo formato do comunicado de Repasses CEF (repasses-cef/comunicarRepasses.service.js).
// Corpo = os 4 totalizadores do Resumo dos saldos (resumoSaldos.calculo.js) + a mensagem que o
// administrador escreveu ao encerrar o período (EncerrarPeriodoModal.jsx), quando houver — no
// lugar do antigo resumo por classificação (pedido do usuário; o detalhe segue na planilha).
function montarMensagem({ nomeDestinatario, dataBR, resumo, mensagemAdministrador }) {
  const primeiroNome = String(nomeDestinatario || '').trim().split(/\s+/)[0];
  // Sem centavos no WhatsApp (pedido do usuário) — o valor exato está na planilha anexa.
  const valor = (v) => `R$ ${Math.round(Number(v || 0)).toLocaleString('pt-BR')}`;
  return [
    '*[ SALDO DAS CONTAS ]*',
    `_Posição de ${dataBR}_`,
    '',
    `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! Segue o resumo dos saldos das contas bancárias.`,
    '',
    '*Resumo dos saldos:*',
    `🔓 Liberado: *${valor(resumo.liberado)}*`,
    `💳 Limite cheque: ${valor(resumo.limiteCheque)}`,
    `🔒 Bloqueado: ${valor(resumo.bloqueado)}`,
    `⚠️ Saldo a cobrir: ${valor(resumo.aCobrir)}`,
    ...(mensagemAdministrador ? ['', '💬 *Mensagem do administrador:*', mensagemAdministrador] : []),
    '',
    '📎 Detalhe por conta na planilha anexa',
    '',
    '_Comunicado automático enviado pelo Horizon Finanças._',
  ].join('\n');
}

// Parâmetro "Comunicar Saldos" (aba Configurações) — dispara de verdade quando um período é
// encerrado. Devolve um resultado estruturado ({status, enviados, falhas}) pra
// saldos.controller.js::encerrarPeriodo mostrar na tela (EncerrarPeriodoModal.jsx) se o aviso
// saiu, pra quem, e o motivo de quem falhou — antes disso era só log de servidor, invisível
// pra quem estava na tela. Nunca lança: todo problema vira `status: 'erro'` ou uma falha
// pontual em `falhas`, nunca interrompe o encerramento do período (que já aconteceu antes
// desta função ser chamada). `mensagem`: texto livre do administrador (opcional).
async function notificarComunicarSaldos(empresaId, dataFechada, { mensagem = null } = {}) {
  const prefixo = `[comunicar-saldos] empresa ${empresaId}, dia ${dataFechada}:`;
  const nada = { enviados: [], falhas: [] };

  const { rows: configRows } = await pool.query(
    'SELECT zapi_integracao_id FROM saldos_comunicar_config WHERE empresa_id = $1',
    [empresaId]
  );
  const zapiIntegracaoId = configRows[0]?.zapi_integracao_id;
  if (!zapiIntegracaoId) return { status: 'sem_conexao', ...nada };

  const { rows: destinatarios } = await pool.query(
    `SELECT u.id, u.nome, u.telefone_ddd, u.telefone_numero
     FROM usuarios u
     JOIN saldos_comunicar_usuarios c ON c.usuario_id = u.id
     WHERE c.empresa_id = $1 AND u.ativo = TRUE`,
    [empresaId]
  );
  if (destinatarios.length === 0) return { status: 'sem_destinatario', ...nada };

  const { contas, periodos } = await service.getSaldos(empresaId, {
    dataInicio: dataFechada, dataFim: dataFechada, companyIds: [], classificacoes: [], bancos: [], contas: [],
  });

  const grupos = saldosExcelService.agruparContas(contas);
  if (grupos.length === 0) {
    console.log(`${prefixo} sem saldo lançado nesse dia, notificação não enviada.`);
    return { status: 'sem_dados', ...nada };
  }
  const resumoDia = calcularResumoSaldos(contas, [dataFechada], new Set(periodos));
  const resumo = Object.fromEntries(Object.entries(resumoDia).map(([chave, porDia]) => [chave, porDia[dataFechada] || 0]));
  const dataBR = brData(dataFechada);

  // Anexo: o mesmo relatório do botão "Exportar", pra semana (domingo-sábado) inteira que
  // contém o dia encerrado — sem filtro nenhum (não existe filtro de tela ativo num disparo
  // automático, então é sempre a empresa toda).
  const { dataInicio, dataFim } = semanaDe(dataFechada);
  let anexoBase64 = null;
  let nomeArquivo = null;
  try {
    const geradoEm = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());
    const buffer = await saldosExcelService.gerarRelatorioExcelBuffer(
      empresaId,
      { dataInicio, dataFim, companyIds: [], classificacoes: [], bancos: [], contas: [] },
      { nomeUsuario: 'Horizon Finanças', geradoEm }
    );
    anexoBase64 = buffer.toString('base64');
    // Sem extensão: a Z-API já acrescenta ".xlsx" (send-document/xlsx).
    nomeArquivo = `Saldo das Contas - ${dataFechada.split('-').reverse().join('-')}`;
  } catch (err) {
    console.error(`${prefixo} falha ao gerar o anexo (${err.message}) — segue só com a mensagem de texto.`);
  }

  const resultados = await Promise.allSettled(
    destinatarios.map(async (dest) => {
      if (!dest.telefone_ddd || !dest.telefone_numero) {
        throw new Error(`usuário "${dest.nome}" (id ${dest.id}) sem telefone cadastrado`);
      }
      const telefone = `${dest.telefone_ddd}${dest.telefone_numero}`;
      const texto = montarMensagem({ nomeDestinatario: dest.nome, dataBR, resumo, mensagemAdministrador: mensagem });
      if (anexoBase64) {
        await zapiService.enviarDocumento(zapiIntegracaoId, {
          telefone,
          documentoBase64: anexoBase64,
          legenda: texto,
          extensao: 'xlsx',
          mimeType: MIME_XLSX,
          nomeArquivo,
        });
      } else {
        await zapiService.enviarMensagemTexto(zapiIntegracaoId, { telefone, mensagem: texto });
      }
    })
  );

  const enviados = [];
  const falhas = [];
  resultados.forEach((resultado, i) => {
    if (resultado.status === 'rejected') {
      const motivo = resultado.reason?.message || String(resultado.reason);
      console.error(`${prefixo} destinatário "${destinatarios[i].nome}": ${motivo}`);
      falhas.push({ nome: destinatarios[i].nome, motivo });
    } else {
      enviados.push({ nome: destinatarios[i].nome });
    }
  });

  return { status: 'enviado', enviados, falhas };
}

module.exports = { notificarComunicarSaldos };
