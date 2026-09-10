const { z } = require('zod');
const ExcelJS = require('exceljs');
const service = require('./repassesCef.service');

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function listCentros(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const result = await service.listCentrosComLancamento(empresaId);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function sincronizarReservas(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const result = await service.sincronizarReservas(empresaId);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

// Aceita `?centro_custo_ids=1,2,3` (string com vírgulas) ou `?centro_custo_ids=1&centro_custo_ids=2`
// (array, se o cliente mandar repetido) — normaliza pros dois formatos.
const centroCustoIdsSchema = z.preprocess((val) => {
  if (val === undefined || val === '') return [];
  const bruto = Array.isArray(val) ? val : String(val).split(',');
  return bruto.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
}, z.array(z.number().int().positive()));

async function listReservas(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const centroCustoIds = centroCustoIdsSchema.parse(req.query.centro_custo_ids);
    const result = await service.listReservas(empresaId, centroCustoIds);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listOpcoesFiltroReserva(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const result = await service.listOpcoesFiltroReserva(empresaId);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getFiltrosReserva(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const result = await service.getFiltrosReserva(empresaId);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

const filtrosReservaSchema = z.object({
  tipovenda: z.array(z.string()).default([]),
  situacao: z.array(z.string()).default([]),
});

async function salvarFiltrosReserva(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const data = filtrosReservaSchema.parse(req.body);
    const result = await service.salvarFiltrosReserva(empresaId, data);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getCoresReserva(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const result = await service.getCoresReserva(empresaId);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

const CORHEX = /^#[0-9a-fA-F]{6}$/;
const coresReservaSchema = z.object({
  tipovenda: z.record(z.string().regex(CORHEX, 'Cor inválida.')).default({}),
  situacao: z.record(z.string().regex(CORHEX, 'Cor inválida.')).default({}),
});

async function salvarCoresReserva(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const data = coresReservaSchema.parse(req.body);
    const result = await service.salvarCoresReserva(empresaId, data);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function sincronizarContratos(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const result = await service.sincronizarContratos(empresaId);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listContratos(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const centroCustoIds = centroCustoIdsSchema.parse(req.query.centro_custo_ids);
    const result = await service.listContratos(empresaId, centroCustoIds);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listAssinaturas(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const centroCustoIds = centroCustoIdsSchema.parse(req.query.centro_custo_ids);
    const result = await service.listAssinaturas(empresaId, centroCustoIds);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listRegistros(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const centroCustoIds = centroCustoIdsSchema.parse(req.query.centro_custo_ids);
    const result = await service.listRegistros(empresaId, centroCustoIds);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

function getStatusSincronizacao(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    res.json(service.getStatusSincronizacao(empresaId));
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function getUltimasAtualizacoes(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const centroCustoIds = centroCustoIdsSchema.parse(req.query.centro_custo_ids);
    const result = await service.getUltimasAtualizacoes(empresaId, centroCustoIds);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

const EXPORT_COLUMNS = [
  { header: 'Bucket', key: 'bucket', width: 12 },
  { header: 'Empreendimento', key: 'empreendimento', width: 28 },
  { header: 'Cliente', key: 'cliente', width: 32 },
  { header: 'Código da Reserva', key: 'codigo_reserva', width: 16 },
  { header: 'Número do Contrato', key: 'numero_contrato', width: 22 },
  { header: 'Tipo de Venda', key: 'tipo_venda', width: 18 },
  { header: 'Situação', key: 'situacao', width: 26 },
  { header: 'Número do Contrato da Unidade', key: 'numero_contrato_unidade', width: 24 },
  { header: 'Data de Assinatura', key: 'data_assinatura', width: 16 },
  { header: 'Data de Registro', key: 'data_registro', width: 16 },
  { header: 'Dias Parada', key: 'dias_parada', width: 12 },
];

// Dias corridos entre a data de assinatura e hoje — mesmo cálculo do
// AssinaturaCard no frontend (ver diasParada em RepassesCefPage.jsx),
// reproduzido aqui só pra preencher essa coluna no Excel.
function diasParada(data) {
  if (!data) return null;
  const iso = data instanceof Date ? data.toISOString() : String(data);
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  const dataAssinatura = Date.UTC(ano, mes - 1, dia);
  const hoje = new Date();
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((hojeUtc - dataAssinatura) / 86400000);
}

function formatarDataExcel(data) {
  if (!data) return '';
  const iso = data instanceof Date ? data.toISOString() : String(data);
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

// Exporta os 4 buckets do Kanban num único Excel empilhado (uma aba, uma
// linha por cartão de qualquer bucket, com a coluna "Bucket" identificando
// a etapa) — não uma aba por bucket. Reflete os mesmos filtros de Centro de
// Custo (e, pra Reserva/Contrato, o Tipo de Venda/Situação salvo em
// "Configurar Filtros de Visualização") já aplicados na tela; a busca livre
// por texto é só um filtro visual do frontend e não entra aqui.
async function exportarExcel(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const centroCustoIds = centroCustoIdsSchema.parse(req.query.centro_custo_ids);
    const { reservas, contratos, assinaturas, registros } = await service.listParaExportacao(
      empresaId,
      centroCustoIds
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Repasses CEF');
    sheet.columns = EXPORT_COLUMNS;
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEFB' } };

    for (const r of reservas) {
      sheet.addRow({
        bucket: 'Reserva',
        empreendimento: r.empreendimento,
        cliente: r.titular_nome,
        codigo_reserva: r.idreserva,
        tipo_venda: r.tipovenda,
        situacao: r.situacao,
      });
    }

    for (const c of contratos) {
      sheet.addRow({
        bucket: 'Contrato',
        empreendimento: c.empreendimento,
        cliente: c.titular_nome,
        codigo_reserva: c.idreserva,
        numero_contrato: c.number,
        tipo_venda: c.tipovenda,
        situacao: c.situacao,
      });
    }

    for (const a of assinaturas) {
      sheet.addRow({
        bucket: 'Assinatura',
        empreendimento: a.empreendimento,
        cliente: a.titular_nome,
        // Herdados da reserva/contrato de origem (ver listUnidadesExtrato,
        // que já resolve essa cadeia) — igual aos buckets anteriores.
        codigo_reserva: a.idreserva,
        numero_contrato: a.numero_contrato,
        tipo_venda: a.tipovenda,
        situacao: a.situacao,
        numero_contrato_unidade: a.numero_contrato_unidade,
        data_assinatura: formatarDataExcel(a.data_assinatura_contrato),
        dias_parada: diasParada(a.data_assinatura_contrato),
      });
    }

    for (const re of registros) {
      sheet.addRow({
        bucket: 'Registro',
        empreendimento: re.empreendimento,
        cliente: re.titular_nome,
        // Herdados da reserva/contrato de origem — mesma cadeia acima.
        codigo_reserva: re.idreserva,
        numero_contrato: re.numero_contrato,
        tipo_venda: re.tipovenda,
        situacao: re.situacao,
        numero_contrato_unidade: re.numero_contrato_unidade,
        data_assinatura: formatarDataExcel(re.data_assinatura_contrato),
        data_registro: formatarDataExcel(re.data_registro),
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="repasses-cef-empresa-${empresaId}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

const siengeContractIdSchema = z.coerce.number().int().positive('Contrato inválido.');
const numeroInstituicaoFinanceiraSchema = z.object({
  financial_institution_number: z.string().trim().min(1, 'Informe o número da instituição financeira.').max(100),
});

async function atualizarNumeroInstituicaoFinanceira(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeContractId = siengeContractIdSchema.parse(req.params.siengeContractId);
    const { financial_institution_number } = numeroInstituicaoFinanceiraSchema.parse(req.body);
    const result = await service.atualizarNumeroInstituicaoFinanceira(
      empresaId,
      siengeContractId,
      financial_institution_number
    );
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

// Aceita exatamente um dos 3 identificadores — quem clicou define qual vem
// preenchido (idreserva pro card de Reserva, sienge_contract_id pro de
// Contrato, extrato_unidade_id pro de Assinatura/Registro).
const historicoQuerySchema = z
  .object({
    idreserva: z.coerce.number().int().positive().optional(),
    sienge_contract_id: z.coerce.number().int().positive().optional(),
    extrato_unidade_id: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (data) => [data.idreserva, data.sienge_contract_id, data.extrato_unidade_id].filter((v) => v !== undefined).length === 1,
    { message: 'Informe exatamente um identificador (idreserva, sienge_contract_id ou extrato_unidade_id).' }
  );

async function getHistoricoEtapas(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { idreserva, sienge_contract_id, extrato_unidade_id } = historicoQuerySchema.parse(req.query);
    const result = await service.getHistoricoEtapas(empresaId, {
      idreserva,
      siengeContractId: sienge_contract_id,
      extratoUnidadeId: extrato_unidade_id,
    });
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listUnidadesDisponiveis(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const siengeContractId = siengeContractIdSchema.parse(req.params.siengeContractId);
    const result = await service.listUnidadesDisponiveisParaContrato(empresaId, siengeContractId);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

const registrarMovimentacaoSchema = z.object({
  idreserva: z.coerce.number().int().positive('Reserva inválida.'),
  macro_etapa: z.enum(['VENDA', 'CONTRATO', 'ASSINATURA', 'REGISTRO']),
  mascara_item_id: z.coerce.number().int().positive('Selecione a micro etapa.'),
  data_movimentacao: z.string().trim().min(1, 'Informe a data.'),
  descricao: z.string().trim().max(2000).optional(),
});

async function registrarMovimentacaoMicroEtapa(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const data = registrarMovimentacaoSchema.parse(req.body);
    const result = await service.registrarMovimentacaoMicroEtapa(empresaId, {
      idreserva: data.idreserva,
      macroEtapa: data.macro_etapa,
      mascaraItemId: data.mascara_item_id,
      dataMovimentacao: data.data_movimentacao,
      descricao: data.descricao,
      usuarioId: req.user?.id,
      arquivos: req.files || [],
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

const anexoIdSchema = z.coerce.number().int().positive('Anexo inválido.');

async function downloadAnexoMicroEtapa(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const anexoId = anexoIdSchema.parse(req.params.anexoId);
    const anexo = await service.getAnexoMicroEtapa(empresaId, anexoId);
    if (!anexo) return next(badRequest('Anexo não encontrado.'));
    res.download(anexo.caminhoAbsoluto, anexo.nomeOriginal);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

module.exports = {
  listCentros,
  sincronizarReservas,
  listReservas,
  listOpcoesFiltroReserva,
  getFiltrosReserva,
  salvarFiltrosReserva,
  getCoresReserva,
  salvarCoresReserva,
  sincronizarContratos,
  listContratos,
  listAssinaturas,
  listRegistros,
  getStatusSincronizacao,
  getUltimasAtualizacoes,
  exportarExcel,
  atualizarNumeroInstituicaoFinanceira,
  getHistoricoEtapas,
  listUnidadesDisponiveis,
  registrarMovimentacaoMicroEtapa,
  downloadAnexoMicroEtapa,
};
