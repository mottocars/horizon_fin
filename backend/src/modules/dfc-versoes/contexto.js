const pool = require('../../config/db');
const service = require('./dfcVersoes.service');

// Em qual versão da DFC cada pedido roda (config/db.js lê o contexto e escolhe as tabelas) — o mesmo esquema das
// versões da DRE (dre-versoes/contexto.js), com cabeçalho próprio:
//   - telas de Operações (sem cabeçalho): a versão aberta (área de trabalho) ou, sem ela, a última salva;
//   - cabeçalho X-Dfc-Versao: "publicada" (dashboard Fluxo de Caixa — a última aprovada) ou o número de uma
//     versão salva (o "visualizar" da aba Versões: a DFC inteira como era naquela versão);
//   - MCP, Excel do dashboard e Impacto DFC da Reforma Tributária: comVersaoPublicada.
// Gravar só com a versão aberta (modo 'trabalho'); fora dela o pedido é recusado (409) — a regra fica aqui no
// backend, não só na tela. `livre(req)`: gravações que não são alteração da DFC (sincronizar com o Sienge,
// atualizar bases, prévias) passam sem versão aberta e rodam fora de contexto (no public).

const LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);

function pedidoDo(req) {
  const h = String(req.headers['x-dfc-versao'] || '').trim().toLowerCase();
  if (h === 'publicada') return 'publicada';
  if (/^\d+$/.test(h)) return Number(h);
  return 'atual';
}

function mensagemTravada(ctx, pedido) {
  const n = ctx.dfc.versao.numero;
  if (typeof pedido === 'number') return `Você está visualizando a versão ${n} da DFC, que é só leitura. Volte para a versão atual para alterar.`;
  return `A DFC está fechada na versão ${n}. Para alterar, gere uma nova versão ou edite a última na aba Versões.`;
}

// router.param('empresaId', contextoDfc('mascaras')) — depois do paramEmpresa.
function contextoDfc(modulo, { livre = () => false } = {}) {
  return async (req, res, next, valor) => {
    try {
      const empresaId = Number(valor);
      if (!Number.isInteger(empresaId) || empresaId <= 0) return next();
      const pedido = pedidoDo(req);
      const ctx = await service.resolver(empresaId, pedido);
      req.dfc = { ...ctx.dfc, modulo };
      const escrita = !LEITURA.has(req.method);
      if (escrita && livre(req)) return next();
      if (escrita && ctx.dfc.modo !== 'trabalho') {
        return res.status(409).json({ message: mensagemTravada(ctx, pedido), dfc_travada: true });
      }
      return pool.comContexto(ctx, () => next());
    } catch (err) {
      return next(err);
    }
  };
}

// Roda `fn` numa versão da empresa: a publicada (última aprovada) por padrão.
async function comVersao(empresaId, pedido, fn) {
  const ctx = await service.resolver(Number(empresaId), pedido);
  return pool.comContexto(ctx, fn);
}
const comVersaoPublicada = (empresaId, fn) => comVersao(empresaId, 'publicada', fn);

// A versão da DFC do pedido em andamento ({ versao, modo, corte }) ou null fora de um contexto da DFC.
const dfcAtual = () => {
  const ctx = pool.contextoAtual();
  return ctx?.sistema === 'dfc' ? ctx.dfc : null;
};

// Último mês do realizado da DFC ('AAAA-MM'): o corte da versão do pedido, nunca depois do mês anterior ao atual;
// fora de um contexto da DFC, o mês anterior ao atual.
function limiteRealizado() {
  const anterior = service.mesAnterior().slice(0, 7);
  const corte = dfcAtual()?.corte?.slice(0, 7);
  return corte && corte < anterior ? corte : anterior;
}

module.exports = { contextoDfc, comVersao, comVersaoPublicada, dfcAtual, limiteRealizado, pedidoDo };
