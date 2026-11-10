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
// Projeção PLS CEF: a receber da Caixa. Uma parcela por recebimento (PF na Data Previsão Recebimento PF —
// Novo Registro + Medição — e PJ na Data Previsão Recebimento PJ — Crédito PJ; parcela zerada não vai), o rateio
// por classificação no centro da obra e, em `dados`, o retrato da projeção para reabrir o título.
const plsSchema = z.object({
  tipo_documento: z.literal('PROJECAO_PLS_CEF'),
  centro_id: z.coerce.number({ invalid_type_error: 'Escolha o centro de custo.' }).int().positive('Escolha o centro de custo.'),
  data_medicao: dataIso('Informe a Data Previsão Medição.'),
  historico: z.string().trim().max(255).optional().default(''),
  valor: valor('O valor projetado precisa ser maior que zero.'),
  parcelas: z
    .array(z.object({ vencimento: dataIso('Informe as datas de recebimento PF e PJ.'), valor: valor('Cada parcela precisa de um valor maior que zero.') }))
    .min(1, 'Nenhum valor a receber.')
    .max(2),
  rateios: z
    .array(
      z.object({
        natureza_id: z.coerce.string().trim().min(1, 'Defina o plano de contas na aba Configurações.').max(20),
        valor: valor('Cada linha do rateio precisa de um valor maior que zero.'),
      })
    )
    .min(1, 'Nenhum valor no rateio.')
    .max(3),
  dados: z.record(z.any()).optional().default({}),
});

function lerTitulo(body = {}) {
  if (body.tipo_documento === 'PROJECAO_PLS_CEF') {
    const p = plsSchema.parse(body);
    return {
      tipo: 'RECEBER',
      tipo_documento: p.tipo_documento,
      pessoa_id: null,
      documento: '',
      data_emissao: p.data_medicao,
      historico: p.historico,
      valor: p.valor,
      parcelas: p.parcelas,
      rateios: p.rateios.map((r) => ({ centro_id: p.centro_id, natureza_id: r.natureza_id, valor: r.valor })),
      dados: p.dados,
    };
  }
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
  obterConfiguracoes: rota(async (req, res) => res.json(await service.obterConfiguracoes(empresaIdSchema.parse(req.params.empresaId)))),
  salvarConfiguracoes: rota(async (req, res) => {
    // Vazio/null = sem conta (z.coerce.string transformaria null em "null").
    const conta = z.preprocess(
      (v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim()),
      z.string().max(20).nullable()
    );
    const pct = z.preprocess(
      (v) => (v === null || v === undefined || String(v).trim() === '' ? null : Number(v)),
      z.number({ invalid_type_error: '% Amortização PJ inválido.' }).min(0, 'O % Amortização PJ vai de 0 a 100.').max(100, 'O % Amortização PJ vai de 0 a 100.').nullable()
    );
    const { contas, pct_amortizacao_pj: pctAmortizacao } = z
      .object({ contas: z.object({ novo_registro: conta, medicao: conta, credito_pj: conta }), pct_amortizacao_pj: pct.optional().default(null) })
      .parse(req.body || {});
    res.json(await service.salvarConfiguracoes(empresaIdSchema.parse(req.params.empresaId), contas, req.user.id, pctAmortizacao ?? null));
  }),
  cabecalhoPls: rota(async (req, res) => {
    const dataMedicao = req.query.data_medicao ? dataIso('Data Previsão Medição inválida.').parse(req.query.data_medicao) : null;
    res.json(await service.cabecalhoPls(empresaIdSchema.parse(req.params.empresaId), idSchema.parse(req.params.centroId), dataMedicao));
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
