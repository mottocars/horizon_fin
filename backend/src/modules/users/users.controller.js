const { z } = require('zod');
const pool = require('../../config/db');
const usuariosService = require('../usuarios/usuarios.service');

async function me(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.username, u.telefone_ddd, u.telefone_numero, u.avatar_url,
              u.permissao, u.telas_permitidas, u.primeiro_acesso,
              COALESCE(array_agg(ue.empresa_id) FILTER (WHERE ue.empresa_id IS NOT NULL), '{}') AS empresa_ids
       FROM usuarios u
       LEFT JOIN usuarios_empresas ue ON ue.usuario_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [req.user.id]
    );
    const usuario = rows[0];
    if (!usuario) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }
    res.json(usuario);
  } catch (err) {
    next(err);
  }
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function mensagemDeDuplicidade(err) {
  if (String(err.constraint || '').includes('username')) {
    return 'Já existe um usuário cadastrado com esse nome de usuário.';
  }
  return 'Já existe um usuário cadastrado com esse e-mail.';
}

const updateMeSchema = z
  .object({
    nome: z.string().min(1, 'Nome completo é obrigatório.'),
    email: z.string().email('Informe um e-mail válido.'),
    username: z
      .string()
      .trim()
      .min(3, 'O usuário deve ter pelo menos 3 caracteres.')
      .regex(/^[a-zA-Z0-9._-]+$/, 'Use apenas letras, números, ponto, hífen ou underline.'),
    telefone_ddd: z.string().trim().regex(/^\d{2,3}$/, 'DDD inválido.').optional().or(z.literal('')),
    telefone_numero: z.string().trim().optional().or(z.literal('')),
    senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.').optional().or(z.literal('')),
    confirmarSenha: z.string().optional().or(z.literal('')),
    // Data URI (base64) da foto, já redimensionada/comprimida no navegador.
    // '' explicitamente = removeu a foto; undefined = não mexeu nela.
    avatar_url: z
      .string()
      .max(3_000_000, 'A foto é grande demais.')
      .optional()
      .or(z.literal('')),
  })
  .refine((data) => !data.senha || data.senha === data.confirmarSenha, {
    message: 'A confirmação de senha não confere.',
    path: ['confirmarSenha'],
  });

async function updateMe(req, res, next) {
  try {
    const data = updateMeSchema.parse(req.body);
    const usuario = await usuariosService.updateSelf(req.user.id, data);
    if (!usuario) return res.status(404).json({ message: 'Usuário não encontrado.' });
    res.json(usuario);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23505') return next(badRequest(mensagemDeDuplicidade(err)));
    next(err);
  }
}

// E-mail e celular aqui são só edição livre (o usuário confere/corrige o
// que o admin cadastrou) — só a senha tem dupla digitação, igual ao resto
// do sistema.
const primeiroAcessoSchema = z
  .object({
    email: z.string().trim().email('Informe um e-mail válido.'),
    telefone_ddd: z.string().trim().regex(/^\d{2,3}$/, 'DDD inválido.'),
    telefone_numero: z.string().trim().min(8, 'Informe um número de celular válido.'),
    senha: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres.'),
    confirmarSenha: z.string().min(1, 'Confirme sua nova senha.'),
    // Data URI (base64) da foto, já redimensionada/comprimida no navegador.
    // Aqui, diferente de updateMe, é obrigatória.
    avatar_url: z.string().min(1, 'Envie uma foto de perfil.').max(3_000_000, 'A foto é grande demais.'),
  })
  .refine((data) => data.senha === data.confirmarSenha, {
    message: 'A confirmação de senha não confere.',
    path: ['confirmarSenha'],
  });

async function primeiroAcesso(req, res, next) {
  try {
    const data = primeiroAcessoSchema.parse(req.body);
    const usuario = await usuariosService.completarPrimeiroAcesso(req.user.id, {
      email: data.email,
      telefone_ddd: data.telefone_ddd,
      telefone_numero: data.telefone_numero,
      senha: data.senha,
      avatar_url: data.avatar_url,
    });
    if (!usuario) return res.status(404).json({ message: 'Usuário não encontrado.' });
    res.json(usuario);
  } catch (err) {
    if (err.issues) return next(badRequest(err.issues[0].message));
    if (err.code === '23505') return next(badRequest(mensagemDeDuplicidade(err)));
    next(err);
  }
}

module.exports = { me, updateMe, primeiroAcesso };
