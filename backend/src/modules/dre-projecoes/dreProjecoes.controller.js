const { z } = require('zod');
const service = require('./dreProjecoes.service');
const planilha = require('./planilha');
const c = require('../dre-versoes/carimbo');

// Carimbo (aba Versões) dos orçamentos da Projeção. O assistente grava a cada mudança: as edições seguidas
// do mesmo orçamento pelo mesmo usuário viram uma linha só (chave).
const ETAPA = { centro: 'centro e ciclo', historico: 'histórico', vendas: 'vendas', custos: 'custos da POC', poc: 'POC', demais: 'demais contas', conclusao: 'conclusão' };
const nomeOrc = (o) => `${o.centro_id} - ${o.centro_apelido || o.centro_nome}`;
const ciclo = (o) => `${c.mesBR(o.ciclo_inicio)} a ${c.mesBR(o.ciclo_fim)}`;

const empresaIdSchema = z.coerce.number().int().positive('Empresa inválida.');
const idSchema = z.coerce.number().int().positive('Orçamento inválido.');
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido.');

const criarSchema = z.object({
  centro_id: z.coerce.number({ invalid_type_error: 'Escolha o centro de custo.' }).int().positive('Escolha o centro de custo.'),
  ciclo_inicio: mes,
  ciclo_fim: mes,
});

// Valores digitados: { mes: número } — vazio some.
const meses = z.record(z.string(), z.number().finite().nullable());
const dadosSchema = z
  .object({
    unidades: z
      .record(z.string(), z.object({ mes: mes.nullable().optional(), valor: z.number().finite().nullable().optional() }))
      .optional(),
    valores: z.record(z.string(), meses).optional(),
    correcao: meses.optional(),
  })
  .passthrough();

const atualizarSchema = z.object({
  etapa: z.enum(service.ETAPAS).optional(),
  ciclo_inicio: mes.optional(),
  ciclo_fim: mes.optional(),
  trava: mes.nullable().optional(),
  dados: dadosSchema.optional(),
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

const rota = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req, empresaIdSchema.parse(req.params.empresaId)));
  } catch (err) {
    tratar(err, next);
  }
};

// Recorte da planilha (assistente): ?orcamento=<id>&etapa=poc|demais. Sem eles, a planilha da empresa.
function recorte(req) {
  if (!req.query.orcamento) return {};
  return { orcamentoId: idSchema.parse(req.query.orcamento), etapa: z.enum(['poc', 'demais']).parse(req.query.etapa) };
}

// GET /:empresaId/layout — o Excel da Projeção (travado, preenchido com os rascunhos / última versão).
async function layout(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    const { buffer, nome } = await planilha.layout(empresaId, req.user.id, recorte(req));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="projecao-dre.xlsx"; filename*=UTF-8''${encodeURIComponent(nome)}`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(Buffer.from(buffer));
  } catch (err) {
    tratar(err, next);
  }
}

// POST /:empresaId/importar[?aplicar=1&concluir=1] — arquivo no campo "arquivo". Sem aplicar: prévia.
async function importar(req, res, next) {
  try {
    const empresaId = empresaIdSchema.parse(req.params.empresaId);
    if (!req.file) throw erro(400, 'Envie o arquivo .xlsx da Projeção da DRE.');
    const sim = (v) => v === '1' || v === 'true';
    res.json(
      await (async () => {
        const r = await planilha.importar(empresaId, { buffer: req.file.buffer, arquivo: req.file.originalname }, req.user.id, {
          aplicar: sim(req.query.aplicar),
          concluir: sim(req.query.concluir),
          ...recorte(req),
        });
        if (sim(req.query.aplicar)) {
          await c.carimbar(req, {
            descricao: `Importou a planilha da Projeção "${req.file.originalname}": ${r.resumo?.centros ?? 0} orçamento(s) gravado(s)${
              r.concluidos ? `, ${r.concluidos} concluído(s)` : ''
            }.`,
            detalhes: { arquivo: req.file.originalname, resumo: r.resumo || null },
          });
        }
        return r;
      })()
    );
  } catch (err) {
    tratar(err, next);
  }
}

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.');
const projetadoSchema = z.object({
  fonte: z.enum(['atual', 'versao']).default('atual'),
  versao: z.coerce.number().int().positive().optional(),
  de: dataSchema,
  ate: dataSchema,
  centros: z.string().optional(),
});

module.exports = {
  layout,
  importar,
  // GET /:empresaId/projetado?fonte=atual|versao&versao=N&de&ate&centros=1,2 — o projetado da aba DRE.
  projetado: rota((req, empresaId) => {
    const q = projetadoSchema.parse(req.query);
    const centros = (q.centros || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
    return service.projetado(empresaId, { de: q.de, ate: q.ate, centros });
  }),
  listar: rota((req, empresaId) => service.listar(empresaId)),
  criar: rota(async (req, empresaId) => {
    const b = criarSchema.parse(req.body || {});
    const o = await service.criar(empresaId, { centroId: b.centro_id, cicloInicio: b.ciclo_inicio, cicloFim: b.ciclo_fim }, req.user.id);
    if (!o.existente) await c.carimbar(req, { descricao: `Novo orçamento de ${nomeOrc(o)}, ciclo ${ciclo(o)}.`, detalhes: { id: o.id } });
    return o;
  }),
  obter: rota((req, empresaId) => service.obter(empresaId, idSchema.parse(req.params.id))),
  atualizar: rota(async (req, empresaId) => {
    const b = atualizarSchema.parse(req.body || {});
    const id = idSchema.parse(req.params.id);
    const antes = await service.obter(empresaId, id);
    const o = await service.atualizar(empresaId, id, { etapa: b.etapa, cicloInicio: b.ciclo_inicio, cicloFim: b.ciclo_fim, trava: b.trava, dados: b.dados }, req.user.id);
    const mudou = b.dados !== undefined || antes.ciclo_inicio !== o.ciclo_inicio || antes.ciclo_fim !== o.ciclo_fim;
    if (mudou) {
      await c.carimbar(req, {
        descricao: `Editou o orçamento de ${nomeOrc(o)} (ciclo ${ciclo(o)}; última etapa: ${ETAPA[o.etapa] || o.etapa}).`,
        detalhes: { id },
        chave: `projecao:${id}`,
      });
    }
    return o;
  }),
  descartar: rota(async (req, empresaId) => {
    const id = idSchema.parse(req.params.id);
    const antes = await service.obter(empresaId, id);
    const r = await service.descartar(empresaId, id);
    await c.carimbar(req, { descricao: `Descartou o orçamento de ${nomeOrc(antes)} (ciclo ${ciclo(antes)}).`, detalhes: { id } });
    return r;
  }),
  // `ate` (AAAA-MM): até quando mostrar o realizado (a trava escolhida na tela).
  historico: rota((req, empresaId) =>
    service.historico(empresaId, idSchema.parse(req.params.id), req.query.ate ? mes.parse(req.query.ate) : null)
  ),
  unidades: rota((req, empresaId) => service.unidades(empresaId, idSchema.parse(req.params.id))),
  contas: rota((req, empresaId) =>
    service.contas(empresaId, idSchema.parse(req.params.id), z.enum(['poc', 'demais']).parse(req.query.etapa))
  ),
  calcular: rota((req, empresaId) => service.calcular(empresaId, idSchema.parse(req.params.id))),
  concluir: rota(async (req, empresaId) => {
    const o = await service.concluir(empresaId, idSchema.parse(req.params.id), req.user.id);
    await c.carimbar(req, {
      descricao: `Concluiu o orçamento de ${nomeOrc(o)} (ciclo ${ciclo(o)}${o.trava ? `, realizado até ${c.mesBR(o.trava)}` : ''}).`,
      detalhes: { id: o.id },
    });
    return o;
  }),
};
