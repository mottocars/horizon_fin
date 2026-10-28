const { z } = require('zod');
const service = require('./notas.service');
const { ErroApi } = require('./erros');

const MAX_DIAS_PERIODO = 366;
const STATUS = ['pendente', 'vinculada', 'inativada', 'cancelada'];

// Aceita "1,2,3", ?x=1&x=2 ou array — sempre devolve lista de textos sem vazios.
const lista = (valor) =>
  (Array.isArray(valor) ? valor : String(valor ?? '').split(','))
    .map((v) => String(v).trim())
    .filter(Boolean);

const dataValida = (texto) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
};

const data = (campo) =>
  z
    .string({ required_error: `Informe ${campo} (AAAA-MM-DD).` })
    .refine(dataValida, `${campo} deve ser uma data válida no formato AAAA-MM-DD.`);

const notasSchema = z
  .object({
    certificadoIds: z
      .any()
      .transform(lista)
      .refine((v) => v.length > 0, 'Informe certificadoIds (um ou mais ids, separados por vírgula).')
      .refine((v) => v.every((id) => /^\d{1,9}$/.test(id)), 'certificadoIds deve ter só números inteiros.')
      .transform((v) => [...new Set(v.map(Number))]),
    dataEmissaoInicio: data('dataEmissaoInicio'),
    dataEmissaoFim: data('dataEmissaoFim'),
    tipoDocumento: z
      .string()
      .transform((v) => v.trim().toUpperCase())
      .refine((v) => ['NFE', 'NFSE'].includes(v), 'tipoDocumento deve ser NFE ou NFSE.')
      .optional(),
    status: z
      .any()
      .transform((v) => lista(v).map((s) => s.toLowerCase()))
      .refine((v) => v.every((s) => STATUS.includes(s)), `status aceita: ${STATUS.join(', ')}.`)
      .optional(),
    atualizadoDesde: z
      .string()
      .refine(
        (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v)),
        'atualizadoDesde deve ser data e hora ISO 8601 com fuso (ex.: 2026-10-20T07:00:00-03:00).'
      )
      .optional(),
    page: z.coerce.number({ invalid_type_error: 'page deve ser um número.' }).int().min(1, 'page começa em 1.').default(1),
    pageSize: z.coerce
      .number({ invalid_type_error: 'pageSize deve ser um número.' })
      .int()
      .min(1, 'pageSize mínimo é 1.')
      .max(500, 'pageSize máximo é 500.')
      .default(100),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (!dataValida(f.dataEmissaoInicio) || !dataValida(f.dataEmissaoFim)) return;
    const dias = (Date.parse(f.dataEmissaoFim) - Date.parse(f.dataEmissaoInicio)) / 86400000;
    if (dias < 0) ctx.addIssue({ code: 'custom', message: 'dataEmissaoFim não pode ser anterior a dataEmissaoInicio.' });
    else if (dias >= MAX_DIAS_PERIODO) {
      ctx.addIssue({ code: 'custom', message: `O período de emissão pode ter no máximo ${MAX_DIAS_PERIODO} dias.` });
    }
  });

const idSchema = z.coerce.number().int().positive().max(2147483647);

const inativarSchema = z
  .object({
    motivo: z
      .string({ required_error: 'Informe o motivo da inativação.', invalid_type_error: 'motivo deve ser texto.' })
      .trim()
      .min(3, 'O motivo precisa ter pelo menos 3 caracteres.')
      .max(500, 'O motivo pode ter no máximo 500 caracteres.'),
  })
  .strict();

function parametroInvalido(err) {
  const issue = err.issues[0];
  if (issue.code === 'unrecognized_keys') {
    return new ErroApi(400, 'PARAMETRO_DESCONHECIDO', `Parâmetro não reconhecido: ${issue.keys.join(', ')}.`);
  }
  return new ErroApi(400, 'PARAMETRO_INVALIDO', issue.message);
}

function lerId(valor) {
  const r = idSchema.safeParse(valor);
  if (!r.success) throw new ErroApi(404, 'NOTA_NAO_ENCONTRADA', 'Nota não encontrada.');
  return r.data;
}

async function certificados(req, res, next) {
  try {
    res.json({ items: await service.listarCertificados(req.apiHorizon.empresaId) });
  } catch (err) {
    next(err);
  }
}

async function notas(req, res, next) {
  try {
    const r = notasSchema.safeParse(req.query);
    if (!r.success) throw parametroInvalido(r.error);
    const fora = await service.certificadosForaDaEmpresa(req.apiHorizon.empresaId, r.data.certificadoIds);
    if (fora.length) {
      throw new ErroApi(400, 'CERTIFICADO_INVALIDO', `Certificado(s) não encontrado(s) nesta empresa: ${fora.join(', ')}.`);
    }
    res.json(await service.listarNotas(req.apiHorizon.empresaId, r.data));
  } catch (err) {
    next(err);
  }
}

async function nota(req, res, next) {
  try {
    const item = await service.buscarNota(req.apiHorizon.empresaId, lerId(req.params.id));
    if (!item) throw new ErroApi(404, 'NOTA_NAO_ENCONTRADA', 'Nota não encontrada.');
    res.json(item);
  } catch (err) {
    next(err);
  }
}

async function xml(req, res, next) {
  try {
    const arquivo = await service.arquivoXml(req.apiHorizon.empresaId, lerId(req.params.id));
    if (!arquivo.existe) throw new ErroApi(404, 'NOTA_NAO_ENCONTRADA', 'Nota não encontrada.');
    if (!arquivo.caminho) throw new ErroApi(404, 'XML_INDISPONIVEL', 'O XML desta nota não está disponível.');
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${arquivo.nomeArquivo}"`);
    res.sendFile(arquivo.caminho, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
}

async function inativar(req, res, next) {
  try {
    const id = lerId(req.params.id);
    const r = inativarSchema.safeParse(req.body ?? {});
    if (!r.success) throw parametroInvalido(r.error);

    const atual = await service.buscarNota(req.apiHorizon.empresaId, id);
    if (!atual) throw new ErroApi(404, 'NOTA_NAO_ENCONTRADA', 'Nota não encontrada.');
    if (atual.statusInterno === 'inativada') {
      throw new ErroApi(409, 'NOTA_JA_INATIVADA', 'Esta nota já está inativada.');
    }
    const inativou = await service.inativar(id, r.data.motivo, req.apiHorizon.usuarioId);
    if (!inativou) throw new ErroApi(409, 'NOTA_JA_INATIVADA', 'Esta nota já está inativada.');
    res.json(await service.buscarNota(req.apiHorizon.empresaId, id));
  } catch (err) {
    next(err);
  }
}

module.exports = { certificados, notas, nota, xml, inativar };
