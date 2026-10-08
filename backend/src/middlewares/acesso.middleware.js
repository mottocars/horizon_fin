const pool = require('../config/db');
const { autenticar, podeAcessarEmpresa, extrairIds } = require('./auth.middleware');

// Regras de acesso aplicadas no BACKEND (o menu/tela do frontend é só
// conveniência — quem decide o que pode é aqui):
//   MASTER → todas as telas, todas as empresas;
//   BASICO → só as telas em telas_permitidas, só as empresas vinculadas.
//            Em cada tela liberada ele é Comum ou Administrador
//            (telas_administrador) — ver ehAdministradorDaTela.
// A empresa é conferida em auth.middleware.js (query/body) e nos
// router.param abaixo (URL e IDs de recursos).

// Qualquer usuário logado (ex.: Home/Plano de Voo, Meu perfil).
const QUALQUER_TELA = Symbol('qualquer-tela');

function temAlgumaTela(user, telas) {
  if (user.permissao === 'MASTER') return true;
  if (telas.includes(QUALQUER_TELA)) return true;
  return telas.some((t) => user.telas.includes(t));
}

// exigirTela(telasDaApi, telasSoLeitura): o Básico precisa ter uma das
// `telasDaApi` liberadas; as `telasSoLeitura` liberam só GET (telas que
// apenas consultam essa API — ex.: a Régua de Cobrança lista as conexões
// Z-API pra escolher uma, mas não cadastra conexão). Lista vazia = só
// Master (APIs sem tela no menu).
function exigirTela(telasDaApi, telasSoLeitura = []) {
  return async (req, res, next) => {
    try {
      if (!(await autenticar(req, res))) return;
      const leitura = req.method === 'GET' || req.method === 'HEAD';
      if (temAlgumaTela(req.user, telasDaApi) || (leitura && temAlgumaTela(req.user, telasSoLeitura))) return next();
      return res.status(403).json({ message: 'Você não tem acesso a esta tela.' });
    } catch (err) {
      next(err);
    }
  };
}

// O que o Administrador de uma tela pode a mais (em relação ao Comum) é
// decidido em cada tela, chamando isto. Master é Administrador de tudo.
function ehAdministradorDaTela(user, tela) {
  if (!user) return false;
  if (user.permissao === 'MASTER') return true;
  return (user.telasAdministrador || []).includes(tela);
}

// Pras partes de uma tela restritas ao Administrador dela (abas de
// configuração/cadastro). Usado nas rotas, depois do exigirTela do mount.
function exigirAdministradorDaTela(tela) {
  return (req, res, next) => {
    if (ehAdministradorDaTela(req.user, tela)) return next();
    return res.status(403).json({ message: 'Só o Administrador desta tela pode fazer isso.' });
  };
}

function exigirMaster(req, res, next) {
  if (req.user?.permissao === 'MASTER') return next();
  return res.status(403).json({ message: 'Apenas usuários Master podem fazer isso.' });
}

function negarEmpresa(res) {
  return res.status(403).json({ message: 'Você não tem acesso a esta empresa.' });
}

// router.param('empresaId', paramEmpresa)
function paramEmpresa(req, res, next, valor) {
  if (!podeAcessarEmpresa(req.user, valor)) return negarEmpresa(res);
  next();
}

// router.param('<id>', paramRecurso('SELECT empresa_id FROM tabela WHERE id = $1'))
// Resolve a empresa dona do recurso e confere. Recurso inexistente → 404
// (mesma resposta pra "não existe" e "é de outra empresa" não ajudaria a
// esconder, mas 404 já é o que as telas esperam). Linha com empresa_id
// NULL = recurso global (ex.: tabela compartilhada) — só Master.
function paramRecurso(sql, mensagem404 = 'Registro não encontrado.') {
  return async (req, res, next, valor) => {
    try {
      if (req.user?.empresaIds === null) return next();
      const { rows } = await pool.query(sql, [valor]);
      if (rows.length === 0) return res.status(404).json({ message: mensagem404 });
      if (!rows.every((r) => r.empresa_id != null && podeAcessarEmpresa(req.user, r.empresa_id))) return negarEmpresa(res);
      next();
    } catch (err) {
      // id com formato inválido (ex.: texto onde o banco espera inteiro):
      // deixa o controller responder com a validação dele.
      if (err.code === '22P02') return next();
      next(err);
    }
  };
}

// Middleware pra listas de IDs no corpo (ex.: { notaIds: [1,2,3] }) —
// todos precisam ser de empresas do usuário.
function exigirRecursosDoCorpo(campo, sql) {
  return async (req, res, next) => {
    try {
      if (req.user?.empresaIds === null) return next();
      const ids = extrairIds(req.body?.[campo]);
      if (ids.length === 0) return next();
      const { rows } = await pool.query(sql, [ids]);
      if (!rows.every((r) => r.empresa_id != null && podeAcessarEmpresa(req.user, r.empresa_id))) return negarEmpresa(res);
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Pra rotas cuja empresa é obrigatória (listagens que, sem empresa,
// devolveriam dados de todas): só Master pode omitir.
function exigirEmpresaInformada(...chaves) {
  const lista = chaves.length ? chaves : ['empresa_id', 'empresaId'];
  return (req, res, next) => {
    if (req.user?.empresaIds === null) return next();
    const informada = lista.some((c) => extrairIds(req.query?.[c]).length || extrairIds(req.body?.[c]).length);
    if (!informada) return res.status(400).json({ message: 'Selecione uma empresa.' });
    next();
  };
}

module.exports = {
  QUALQUER_TELA,
  exigirTela,
  exigirMaster,
  ehAdministradorDaTela,
  exigirAdministradorDaTela,
  paramEmpresa,
  paramRecurso,
  exigirRecursosDoCorpo,
  exigirEmpresaInformada,
};
