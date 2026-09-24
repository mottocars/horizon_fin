const pool = require('../../config/db');
const service = require('./saldos.service');
const saldosExcelService = require('./saldosExcel.service');
const empresasService = require('../empresas/empresas.service');
const usuariosService = require('../usuarios/usuarios.service');
const zapiService = require('../integracoes-zapi/zapi.service');

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function nomeExibicaoEmpresa(empresa) {
  return empresa?.nome_fantasia?.trim() || empresa?.razao_social || '';
}

function brData(iso) {
  return iso.split('-').reverse().join('/');
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function montarMensagem({ nomeDestinatario, nomeEmpresa, dataBR, nomeResponsavel, linhas, total }) {
  return [
    '*SALDO DAS CONTAS BANCÁRIAS*',
    '',
    `Olá, ${nomeDestinatario}! Tudo bem?`,
    '',
    `Seguem os saldos bancários da empresa *${nomeEmpresa}*, referentes ao dia *${dataBR}*. O período foi encerrado por *${nomeResponsavel}*.`,
    '',
    'Os detalhes de cada conta estão no arquivo em Excel anexado. Resumo por classificação:',
    '',
    linhas,
    `*Total: R$ ${total}*`,
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
// desta função ser chamada).
async function notificarComunicarSaldos(empresaId, dataFechada, usuarioIdResponsavel) {
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

  const [{ contas }, empresa, responsavel] = await Promise.all([
    service.getSaldos(empresaId, { dataInicio: dataFechada, dataFim: dataFechada, companyIds: [], classificacoes: [], bancos: [], contas: [] }),
    empresasService.getById(empresaId),
    usuariosService.getById(usuarioIdResponsavel),
  ]);

  const grupos = saldosExcelService.agruparContas(contas);
  if (grupos.length === 0) {
    console.log(`${prefixo} sem saldo lançado nesse dia, notificação não enviada.`);
    return { status: 'sem_dados', ...nada };
  }
  const { totaisPorGrupo, totalGeral } = saldosExcelService.calcularTotais(grupos, [{ iso: dataFechada }]);

  const linhas = grupos.map((g) => `• ${g.nome}: R$ ${formatarMoeda(totaisPorGrupo[g.nome][dataFechada])}`).join('\n');
  const total = formatarMoeda(totalGeral[dataFechada]);
  const nomeEmpresa = nomeExibicaoEmpresa(empresa);
  const nomeResponsavel = responsavel?.nome || 'Usuário';
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
    nomeArquivo = `saldo-contas-bancarias_${dataInicio}_a_${dataFim}.xlsx`;
  } catch (err) {
    console.error(`${prefixo} falha ao gerar o anexo (${err.message}) — segue só com a mensagem de texto.`);
  }

  const resultados = await Promise.allSettled(
    destinatarios.map(async (dest) => {
      if (!dest.telefone_ddd || !dest.telefone_numero) {
        throw new Error(`usuário "${dest.nome}" (id ${dest.id}) sem telefone cadastrado`);
      }
      const telefone = `${dest.telefone_ddd}${dest.telefone_numero}`;
      const mensagem = montarMensagem({ nomeDestinatario: dest.nome, nomeEmpresa, dataBR, nomeResponsavel, linhas, total });
      if (anexoBase64) {
        await zapiService.enviarDocumento(zapiIntegracaoId, {
          telefone,
          documentoBase64: anexoBase64,
          legenda: mensagem,
          extensao: 'xlsx',
          mimeType: MIME_XLSX,
          nomeArquivo,
        });
      } else {
        await zapiService.enviarMensagemTexto(zapiIntegracaoId, { telefone, mensagem });
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
