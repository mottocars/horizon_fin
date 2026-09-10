const fs = require('fs');
const { z } = require('zod');
const service = require('./certificados.service');

const uploadSchema = z.object({
  senha: z.string().min(1, 'Informe a senha do certificado.'),
});

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

async function listPorEmpresa(req, res, next) {
  try {
    const result = await service.listPorEmpresa(req.params.empresaId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function criar(req, res, next) {
  try {
    if (!req.file) throw badRequest('Nenhum arquivo enviado.');
    const data = uploadSchema.parse(req.body);

    const result = await service.criar(req.params.empresaId, {
      senha: data.senha,
      tempFilePath: req.file.path,
      originalName: req.file.originalname,
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
}

async function substituir(req, res, next) {
  try {
    if (!req.file) throw badRequest('Nenhum arquivo enviado.');
    const data = uploadSchema.parse(req.body);

    const result = await service.substituir(req.params.id, {
      senha: data.senha,
      tempFilePath: req.file.path,
      originalName: req.file.originalname,
    });
    if (!result) return res.status(404).json({ message: 'Certificado não encontrado.' });
    res.json(result);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    next(err);
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
}

module.exports = { listPorEmpresa, criar, substituir };
