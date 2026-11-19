const pool = require('../../config/db');
const service = require('./dreVersoes.service');

// Em qual versão da DRE cada pedido roda (config/db.js lê o contexto e escolhe as tabelas):
//   - telas de Operações (sem cabeçalho): a versão aberta (área de trabalho) ou, sem ela, a última salva (aprovada ou aguardando aprovação);
//   - cabeçalho X-Dre-Versao: "publicada" (dashboards — a última aprovada) ou o número de uma versão salva
//     (o "visualizar" da aba Versões: a DRE inteira como era naquela versão);
//   - dashboard, MCP, Excel do dashboard e Reforma Tributária: comVersaoPublicada.
// Gravar só com a versão aberta (modo 'trabalho'); fora dela o pedido é recusado (409) — a regra fica
// aqui no backend, não só na tela.

const LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);

function pedidoDo(req) {
  const h = String(req.headers['x-dre-versao'] || '').trim().toLowerCase();
  if (h === 'publicada') return 'publicada';
  if (/^\d+$/.test(h)) return Number(h);
  return 'atual';
}

function mensagemTravada(ctx, pedido) {
  if (typeof pedido === 'number') return `Você está visualizando a versão ${ctx.versao.numero}, que é só leitura. Volte para a versão atual para alterar.`;
  return `A DRE está fechada na versão ${ctx.versao.numero}. Para alterar, gere uma nova versão ou edite a última na aba Versões.`;
}

// router.param('empresaId', contextoDre('mascaras')) — depois do paramEmpresa. `livre(req)`: gravações que
// não são alteração da DRE (ex.: sincronizar unidades com o Sienge, prévia de importação): passam sem
// versão aberta e rodam fora de contexto (gravam no public).
function contextoDre(modulo, { livre = () => false } = {}) {
  return async (req, res, next, valor) => {
    try {
      const empresaId = Number(valor);
      if (!Number.isInteger(empresaId) || empresaId <= 0) return next();
      const pedido = pedidoDo(req);
      const ctx = await service.resolver(empresaId, pedido);
      req.dre = { ...ctx, modulo };
      const escrita = !LEITURA.has(req.method);
      if (escrita && livre(req)) return next();
      if (escrita && ctx.modo !== 'trabalho') {
        return res.status(409).json({ message: mensagemTravada(ctx, pedido), dre_travada: true });
      }
      return pool.comContexto(ctx, () => next());
    } catch (err) {
      return next(err);
    }
  };
}

// Roda `fn` na versão publicada da empresa: a última aprovada (Matriz de Alçadas › DRE › Aprovador).
async function comVersaoPublicada(empresaId, fn) {
  const ctx = await service.resolver(Number(empresaId), 'publicada');
  return pool.comContexto(ctx, fn);
}

// O contexto do pedido em andamento (ou null fora de um).
const contextoAtual = () => pool.contextoAtual();
const emLeitura = () => pool.contextoAtual()?.modo === 'leitura';

module.exports = { contextoDre, comVersaoPublicada, contextoAtual, emLeitura, pedidoDo };
