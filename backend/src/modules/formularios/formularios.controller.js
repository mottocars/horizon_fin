const { z } = require('zod');
const service = require('./formularios.service');

const idSchema = z.coerce.number().int().positive('Formulário inválido.');
const dataSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
  .nullable()
  .optional()
  .or(z.literal(''));
const idsSchema = z.array(z.coerce.number().int().positive()).max(5000);

const salvarSchema = z.object({
  titulo: z.string().max(200).optional(),
  descricao: z.string().max(5000).optional(),
  modalidade: z.enum(['PUBLICO', 'PRIVADO', 'PRIVADO_OBRIGATORIO']).optional(),
  cor_tema: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida.')
    .optional(),
  mensagem_final: z.string().max(2000).optional(),
  publico_alvo: z.enum(['TODOS', 'EMPRESAS', 'USUARIOS']).optional(),
  empresa_ids: idsSchema.optional(),
  usuario_ids: idsSchema.optional(),
  anonimo: z.boolean().optional(),
  uma_resposta_por_pessoa: z.boolean().optional(),
  inicio_em: dataSchema,
  fim_em: dataSchema,
  perguntas: z.array(z.any()).max(200).optional(),
});

const statusSchema = z.object({ status: z.enum(['RASCUNHO', 'PUBLICADO', 'ENCERRADO']) });
const listarSchema = z.object({
  busca: z.string().max(200).optional(),
  status: z.enum(['RASCUNHO', 'PUBLICADO', 'ENCERRADO']).optional().or(z.literal('')),
  modalidade: z.enum(['PUBLICO', 'PRIVADO', 'PRIVADO_OBRIGATORIO']).optional().or(z.literal('')),
});

function tratar(err, res, next) {
  if (err.issues) return res.status(400).json({ message: err.issues[0].message });
  // Erros com detalhe para a tela destacar (respostas por pergunta / pendências para publicar).
  if (err.expose && (err.campos || err.problemas)) {
    return res.status(err.status || 400).json({ message: err.message, campos: err.campos, problemas: err.problemas });
  }
  return next(err);
}

function metaRequisicao(req) {
  return { ip: String(req.ip || '').slice(0, 64), userAgent: String(req.headers['user-agent'] || '').slice(0, 500) };
}

// --- Cadastro (Cadastros › Formulários) ---

async function listar(req, res, next) {
  try {
    const filtros = listarSchema.parse(req.query);
    res.json(await service.listar(filtros));
  } catch (err) {
    tratar(err, res, next);
  }
}

async function obter(req, res, next) {
  try {
    res.json(await service.obter(idSchema.parse(req.params.id)));
  } catch (err) {
    tratar(err, res, next);
  }
}

async function criar(req, res, next) {
  try {
    const dados = salvarSchema.parse(req.body || {});
    res.status(201).json(await service.criar(req.user.id, dados));
  } catch (err) {
    tratar(err, res, next);
  }
}

async function salvar(req, res, next) {
  try {
    const id = idSchema.parse(req.params.id);
    const dados = salvarSchema.parse(req.body || {});
    res.json(await service.salvar(id, req.user.id, dados));
  } catch (err) {
    tratar(err, res, next);
  }
}

async function alterarStatus(req, res, next) {
  try {
    const id = idSchema.parse(req.params.id);
    const { status } = statusSchema.parse(req.body || {});
    res.json(await service.alterarStatus(id, req.user.id, status));
  } catch (err) {
    tratar(err, res, next);
  }
}

async function duplicar(req, res, next) {
  try {
    res.status(201).json(await service.duplicar(idSchema.parse(req.params.id), req.user.id));
  } catch (err) {
    tratar(err, res, next);
  }
}

async function excluir(req, res, next) {
  try {
    await service.excluir(idSchema.parse(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    tratar(err, res, next);
  }
}

async function novoLink(req, res, next) {
  try {
    res.json(await service.novoLink(idSchema.parse(req.params.id), req.user.id));
  } catch (err) {
    tratar(err, res, next);
  }
}

async function resultados(req, res, next) {
  try {
    res.json(await service.resultados(idSchema.parse(req.params.id)));
  } catch (err) {
    tratar(err, res, next);
  }
}

async function excluirResposta(req, res, next) {
  try {
    const id = idSchema.parse(req.params.id);
    const respostaId = z.coerce.number().int().positive('Resposta inválida.').parse(req.params.respostaId);
    await service.excluirResposta(id, respostaId);
    res.json({ ok: true });
  } catch (err) {
    tratar(err, res, next);
  }
}

async function usuarios(req, res, next) {
  try {
    res.json(await service.usuariosParaPublicoAlvo(req.user));
  } catch (err) {
    tratar(err, res, next);
  }
}

// --- Usuário logado (janela ao entrar no sistema) ---

async function pendentes(req, res, next) {
  try {
    res.json(await service.pendentesDoUsuario(req.user.id));
  } catch (err) {
    tratar(err, res, next);
  }
}

async function responder(req, res, next) {
  try {
    const id = idSchema.parse(req.params.id);
    await service.responderComoUsuario(id, req.user.id, req.body?.respostas, metaRequisicao(req));
    res.status(201).json({ ok: true });
  } catch (err) {
    tratar(err, res, next);
  }
}

// --- Link público (sem login) ---

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{10,40}$/, 'Formulário não encontrado.');

async function obterPublico(req, res, next) {
  try {
    const token = tokenSchema.parse(req.params.token);
    res.json(await service.obterPublico(token));
  } catch (err) {
    if (err.issues) return res.status(404).json({ message: 'Formulário não encontrado.' });
    tratar(err, res, next);
  }
}

async function responderPublico(req, res, next) {
  try {
    const token = tokenSchema.parse(req.params.token);
    // Campo-isca: invisível para pessoas; robô que preenche tudo recebe "ok" e nada é gravado.
    if (req.body?.website) return res.status(201).json({ ok: true });
    const r = await service.responderPublico(token, req.body?.respostas, metaRequisicao(req));
    res.status(201).json({ ok: true, ...r });
  } catch (err) {
    if (err.issues) return res.status(404).json({ message: 'Formulário não encontrado.' });
    tratar(err, res, next);
  }
}

module.exports = {
  listar,
  obter,
  criar,
  salvar,
  alterarStatus,
  duplicar,
  excluir,
  novoLink,
  resultados,
  excluirResposta,
  usuarios,
  pendentes,
  responder,
  obterPublico,
  responderPublico,
};
