const { z } = require('zod');
const service = require('./espiao.service');
const pdfService = require('./pdf.service');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function listEmpresas(req, res, next) {
  try {
    const result = await service.listEmpresasComStatus();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function consultar(req, res, next) {
  try {
    const result = await service.consultarEmpresa(req.params.empresaId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listNotas(req, res, next) {
  try {
    const result = await service.listNotas(req.params.empresaId, {
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      chave: req.query.chave,
      numero: req.query.numero,
      emissor: req.query.emissor,
      destinatario: req.query.destinatario,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listCertificados(req, res, next) {
  try {
    const result = await service.listCertificadosComEstado(req.params.empresaId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function consultarCertificado(req, res, next) {
  try {
    const result = await service.consultarCertificadoAvulso(req.params.certificadoId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listNotasPorCertificado(req, res, next) {
  try {
    const result = await service.listNotasPorCertificado(req.params.certificadoId, {
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      chave: req.query.chave,
      numero: req.query.numero,
      emissor: req.query.emissor,
      destinatario: req.query.destinatario,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function download(req, res, next) {
  try {
    const arquivo = await service.getArquivoNota(req.params.notaId);
    if (!arquivo) return res.status(404).json({ message: 'Nota não encontrada.' });
    res.download(arquivo.caminhoAbsoluto, arquivo.nomeArquivo);
  } catch (err) {
    next(err);
  }
}

async function downloadPdf(req, res, next) {
  try {
    const resultado = await pdfService.gerarPdfNota(req.params.notaId);
    if (!resultado) return res.status(404).json({ message: 'Nota não encontrada.' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${resultado.nomeArquivo}"`);
    res.end(Buffer.from(resultado.bytes));
  } catch (err) {
    next(err);
  }
}

async function getAgendamento(req, res, next) {
  try {
    const result = await service.getAgendamento(req.params.empresaId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

const agendamentoSchema = z.object({
  intervaloHoras: z.coerce.number().int().min(1, 'O intervalo mínimo é de 1 hora.'),
});

async function salvarAgendamento(req, res, next) {
  try {
    const data = agendamentoSchema.parse(req.body);
    const result = await service.salvarAgendamento(req.params.empresaId, data.intervaloHoras);
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

const inativarSchema = z.object({
  notaIds: z.array(z.coerce.number().int().positive()).min(1, 'Selecione ao menos uma nota.'),
  motivo: z.string().trim().min(3, 'Explique o motivo da inativação.'),
});

async function inativar(req, res, next) {
  try {
    const data = inativarSchema.parse(req.body);
    const ids = await service.inativarNotas(data.notaIds, data.motivo, req.user.id);
    res.json({ inativadas: ids });
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

const reativarSchema = z.object({
  notaIds: z.array(z.coerce.number().int().positive()).min(1, 'Selecione ao menos uma nota.'),
});

async function reativar(req, res, next) {
  try {
    const data = reativarSchema.parse(req.body);
    const ids = await service.reativarNotas(data.notaIds);
    res.json({ reativadas: ids });
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  }
}

async function listNotasInativadas(req, res, next) {
  try {
    const result = await service.listNotasInativadas(req.params.empresaId, {
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      chave: req.query.chave,
      numero: req.query.numero,
      emissor: req.query.emissor,
      destinatario: req.query.destinatario,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listNotasInativadasPorCertificado(req, res, next) {
  try {
    const result = await service.listNotasInativadasPorCertificado(req.params.certificadoId, {
      dataInicio: req.query.dataInicio,
      dataFim: req.query.dataFim,
      chave: req.query.chave,
      numero: req.query.numero,
      emissor: req.query.emissor,
      destinatario: req.query.destinatario,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listEmpresas,
  consultar,
  listNotas,
  listCertificados,
  consultarCertificado,
  listNotasPorCertificado,
  download,
  downloadPdf,
  getAgendamento,
  salvarAgendamento,
  inativar,
  reativar,
  listNotasInativadas,
  listNotasInativadasPorCertificado,
};
