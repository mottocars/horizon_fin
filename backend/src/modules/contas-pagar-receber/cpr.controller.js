const { z } = require('zod');
const service = require('./cpr.service');
const dcdController = require('../dcd/dcd.controller');
const extratoController = require('../extrato/extrato.controller');

// Baixar o original / exportar o Excel do DCD ou do Geral do contrato Caixa do centro: os mesmos
// controladores do Portal das Construtoras (o mesmo arquivo e o mesmo Excel), chamados daqui para valer o
// acesso desta tela. Eles só leem req.params.
const DOCUMENTOS_PLS = {
  dcd: { controller: dcdController, chave: 'numeroContrato' },
  geral: { controller: extratoController, chave: 'contratoEmpreendimento' },
};

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const idSchema = z.coerce.number().int().positive('Registro inválido.');

// 'AAAA-MM-DD' que existe no calendário (31/02 não passa).
const dataIso = (mensagem) =>
  z
    .string({ required_error: mensagem, invalid_type_error: mensagem })
    .regex(/^\d{4}-\d{2}-\d{2}$/, mensagem)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, mensagem);

const valor = (mensagem) => z.coerce.number({ invalid_type_error: mensagem }).positive(mensagem).max(1e13, 'Valor muito alto.');

const tituloSchema = z.object({
  tipo: z.enum(['PAGAR', 'RECEBER'], { errorMap: () => ({ message: 'Informe se é a pagar ou a receber.' }) }),
  tipo_documento: z.enum(['FINANCEIRO', 'PROJECAO_PLS_CEF'], { errorMap: () => ({ message: 'Informe o tipo de documento.' }) }),
  pessoa_id: z.coerce.number({ invalid_type_error: 'Escolha o fornecedor ou cliente.' }).int().positive('Escolha o fornecedor ou cliente.'),
  documento: z.string().trim().max(50, 'Documento com no máximo 50 caracteres.').optional().default(''),
  data_emissao: dataIso('Informe a data de emissão.'),
  historico: z.string().trim().max(255, 'Histórico com no máximo 255 caracteres.').optional().default(''),
  valor: valor('Informe o valor do título.'),
  parcelas: z
    .array(z.object({ vencimento: dataIso('Informe o vencimento de cada parcela.'), valor: valor('Cada parcela precisa de um valor maior que zero.') }))
    .min(1, 'Informe ao menos uma parcela.')
    .max(360, 'No máximo 360 parcelas.'),
  rateios: z
    .array(
      z.object({
        centro_id: z.coerce.number({ invalid_type_error: 'Escolha o centro de custo em cada linha do rateio.' }).int().positive('Escolha o centro de custo em cada linha do rateio.'),
        natureza_id: z.coerce.string().trim().min(1, 'Escolha o plano de contas em cada linha do rateio.').max(20),
        valor: valor('Cada linha do rateio precisa de um valor maior que zero.'),
      })
    )
    .min(1, 'Informe o rateio por centro de custo e plano de contas.')
    .max(100, 'No máximo 100 linhas de rateio.'),
});

const periodoSchema = z
  .object({ inicio: dataIso('Informe a data início.'), fim: dataIso('Informe a data fim.') })
  .refine((p) => p.inicio <= p.fim, 'A data início precisa ser antes da data fim.');

const baixaSchema = z.object({
  data_baixa: dataIso('Informe a data da baixa.'),
  valor_baixa: valor('Informe o valor baixado.'),
});

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

function tratar(err, next) {
  if (err.issues) return next(erro(400, err.issues[0].message));
  return next(err);
}

// A Projeção PLS CEF ainda não tem formulário: recusa antes de cobrar os campos do Financeiro.
function lerTitulo(body = {}) {
  if (body.tipo_documento === 'PROJECAO_PLS_CEF') throw erro(400, service.MSG_PLS_CEF);
  return tituloSchema.parse(body);
}

const rota = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    tratar(err, next);
  }
};

module.exports = {
  opcoes: rota(async (req, res) => res.json(await service.opcoes(empresaIdSchema.parse(req.params.empresaId)))),
  listar: rota(async (req, res) => {
    const { inicio, fim } = periodoSchema.parse(req.query);
    res.json(await service.listar(empresaIdSchema.parse(req.params.empresaId), inicio, fim));
  }),
  obter: rota(async (req, res) => res.json(await service.obter(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.id)))),
  criar: rota(async (req, res) =>
    res.status(201).json(await service.criar(empresaIdSchema.parse(req.params.empresaId), lerTitulo(req.body), req.user.id))
  ),
  alterar: rota(async (req, res) =>
    res.json(await service.alterar(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.id), lerTitulo(req.body), req.user.id))
  ),
  excluir: rota(async (req, res) => res.json(await service.excluir(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.id)))),
  baixar: rota(async (req, res) =>
    res.json(
      await service.baixar(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.parcelaId), baixaSchema.parse(req.body || {}), req.user.id)
    )
  ),
  cabecalhoPls: rota(async (req, res) => {
    const data = req.query.data ? dataIso('Data inválida.').parse(req.query.data) : null;
    res.json(await service.cabecalhoPls(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.centroId), data));
  }),
  documentosPls: rota(async (req, res) =>
    res.json(await service.documentosPls(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.centroId)))
  ),
  documentoPlsArquivo: async (req, res, next) => {
    try {
      const doc = DOCUMENTOS_PLS[req.params.tipo];
      const formato = req.params.formato;
      if (!doc || !['original', 'excel'].includes(formato)) throw erro(404, 'Documento não encontrado.');
      const empresaId = empresaIdSchema.parse(req.params.empresaId);
      const c = await service.centroComContrato(empresaId, idSchema.parse(req.params.centroId));
      if (!c.contrato) throw erro(404, 'Este centro de custo não tem contrato Caixa cadastrado.');
      const reqDoc = { params: { empresaId: String(empresaId), [doc.chave]: c.contrato }, user: req.user };
      return (formato === 'original' ? doc.controller.download : doc.controller.exportExcel)(reqDoc, res, next);
    } catch (err) {
      return tratar(err, next);
    }
  },
  avancoPrevisto: rota(async (req, res) =>
    res.json(await service.avancoPrevisto(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.centroId)))
  ),
  estornar: rota(async (req, res) => res.json(await service.estornar(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.parcelaId)))),
};
