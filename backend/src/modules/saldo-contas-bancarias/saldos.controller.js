const { z } = require('zod');
const service = require('./saldos.service');
const vanpixSyncService = require('./vanpix-sync.service');
const saldosExcelService = require('./saldosExcel.service');
const usuariosService = require('../usuarios/usuarios.service');

const MAX_DIAS_PERIODO = 93;
const MAX_ITENS_POR_LOTE = 3000;
// NUMERIC(15,2): 13 dígitos inteiros.
const SALDO_MAXIMO = 9_999_999_999_999.99;

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// 'YYYY-MM-DD' que existe de verdade no calendário (rejeita 2026-02-31).
function dataValida(texto) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto || '')) return false;
  const [ano, mes, dia] = texto.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function diasEntre(inicio, fim) {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1;
}

// Filtros multi-valor chegam na query string separados por vírgula.
const csv = (val) =>
  (val ?? '')
    .toString()
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');

const itemSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  numero_conta: z.string().min(1).max(20),
  data: z.string().refine(dataValida, 'Data inválida.'),
  saldo: z
    .union([z.number(), z.string(), z.null()])
    .transform((v) => (v === null ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && Math.abs(v) <= SALDO_MAXIMO), 'Saldo inválido.')
    .transform((v) => (v === null ? null : Math.round(v * 100) / 100)),
});

const salvarSchema = z.object({
  itens: z.array(itemSchema).min(1, 'Nenhum saldo informado.').max(MAX_ITENS_POR_LOTE, 'Lote grande demais.'),
});

const abrirPeriodoSchema = z.object({
  data: z.string().refine(dataValida, 'Data inválida.'),
  // true quando a tela já perguntou "esse período já foi encerrado, quer reabrir?" e o
  // usuário confirmou — ver o código PERIODO_ENCERRADO em saldos.service.js::abrirPeriodo.
  reabrirEncerrado: z.boolean().optional().default(false),
});

async function acessoEmpresa(req) {
  const empresaId = empresaIdSchema.parse(req.params.empresaId);
  await service.assertAcessoEmpresa(req.user.id, empresaId);
  return empresaId;
}

function tratarErroDeValidacao(err, next) {
  if (err.issues) return next(badRequest(err.issues[0].message));
  return next(err);
}

async function getFiltros(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    res.json(await service.getFiltros(empresaId));
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

// Valida e normaliza os filtros de data/empresa/classificação/banco/conta da query string —
// usado tanto por getSaldos (grade) quanto por exportarExcel (mesmos filtros, mesma fonte).
function parseFiltrosSaldos(req) {
  const dataInicio = (req.query.data_inicio || '').toString();
  const dataFim = (req.query.data_fim || '').toString();
  if (!dataValida(dataInicio) || !dataValida(dataFim)) throw badRequest('Informe data início e data fim válidas.');
  if (dataFim < dataInicio) throw badRequest('A data fim não pode ser anterior à data início.');
  if (diasEntre(dataInicio, dataFim) > MAX_DIAS_PERIODO) {
    throw badRequest(`O período pode ter no máximo ${MAX_DIAS_PERIODO} dias.`);
  }
  return {
    dataInicio,
    dataFim,
    companyIds: csv(req.query.company_ids).map(Number).filter(Number.isInteger),
    // Classificação não é mais uma lista fixa (virou cadastro por empresa) — só valida
    // formato/tamanho aqui, igual aos outros filtros de texto livre (bancos, contas).
    classificacoes: csv(req.query.classificacoes).filter((c) => c.length > 0 && c.length <= 50),
    bancos: csv(req.query.bancos).filter((b) => /^\d{1,4}$/.test(b)),
    contas: csv(req.query.contas).filter((c) => /^\d+:.+$/.test(c)),
  };
}

async function getSaldos(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    const result = await service.getSaldos(empresaId, parseFiltrosSaldos(req));
    res.json(result);
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

// Mesmos dados da grade (getSaldos), mas devolvidos como um .xlsx pronto pra baixar — layout
// espelhando EXEMPLO.xlsx com a identidade visual do Horizon Finanças (pedido do usuário depois
// que o PDF gerado via html2canvas saiu ilegível; ver saldosExcel.service.js).
async function exportarExcel(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    const filtros = parseFiltrosSaldos(req);
    const usuario = await usuariosService.getById(req.user.id);
    const geradoEm = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());

    const workbook = await saldosExcelService.gerarRelatorioExcel(empresaId, filtros, {
      nomeUsuario: usuario?.nome || 'Usuário',
      geradoEm,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="saldo-contas-bancarias_${filtros.dataInicio}_a_${filtros.dataFim}.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

async function salvarSaldos(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    const { itens } = salvarSchema.parse(req.body);
    res.json(await service.salvarSaldos(empresaId, req.user.id, itens));
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

async function getPeriodoAberto(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    res.json(await service.getPeriodoAberto(empresaId));
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

async function abrirPeriodo(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    const { data, reabrirEncerrado } = abrirPeriodoSchema.parse(req.body);
    res.json(await service.abrirPeriodo(empresaId, req.user.id, data, reabrirEncerrado));
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

async function encerrarPeriodo(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    res.json(await service.encerrarPeriodo(empresaId, req.user.id));
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

const comunicarSaldosSchema = z.object({
  usuarioIds: z.array(z.coerce.number().int().positive()).max(500, 'Lista grande demais.'),
  zapiIntegracaoId: z.coerce.number().int().positive().nullable().default(null),
});

// Parâmetro "Comunicar Saldos" (aba Configurações) — usuários elegíveis (todo MASTER +
// ADMINISTRADOR/BASICO vinculado à empresa), quem já está selecionado hoje, e qual conexão
// Z-API foi escolhida pro aviso.
async function getComunicarSaldos(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    res.json(await service.listUsuariosComunicarSaldos(empresaId));
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

async function salvarComunicarSaldos(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    const { usuarioIds, zapiIntegracaoId } = comunicarSaldosSchema.parse(req.body);
    await service.salvarComunicarSaldos(empresaId, usuarioIds, zapiIntegracaoId);
    res.json({ ok: true });
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

const buscarVanpixSchema = z.object({ data: z.string().refine(dataValida, 'Data inválida.') });

// Só roda pro dia que está de fato aberto agora — evita gravar saldo "automático" num dia que
// não é mais o período corrente (ex.: usuário demorou pra confirmar e outra aba já encerrou).
async function buscarVanpix(req, res, next) {
  try {
    const empresaId = await acessoEmpresa(req);
    const { data } = buscarVanpixSchema.parse(req.body);
    const { data: dataAberta } = await service.getPeriodoAberto(empresaId);
    if (dataAberta !== data) throw badRequest('Esse dia não é o período aberto no momento.');
    res.json(await vanpixSyncService.buscarSaldosVanpix(empresaId, req.user.id, data));
  } catch (err) {
    tratarErroDeValidacao(err, next);
  }
}

module.exports = {
  getFiltros,
  getSaldos,
  exportarExcel,
  salvarSaldos,
  getPeriodoAberto,
  abrirPeriodo,
  encerrarPeriodo,
  buscarVanpix,
  getComunicarSaldos,
  salvarComunicarSaldos,
};
