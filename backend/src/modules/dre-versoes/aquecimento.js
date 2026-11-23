const pool = require('../../config/db');
const env = require('../../config/env');
const cache = require('./cache');

// Aquecimento do cache da DRE (cache.js): o servidor faz sozinho a conta que a aba DRE e o dashboard vão pedir,
// em vez de esperar alguém abrir a tela. Só LÊ o banco e chama as MESMAS funções das telas (demonstrativo.calcular
// e drePainel.painel), com os mesmos períodos padrão — os números são os mesmos que a tela calcularia.
//   - depois de cada gravação na DRE (contexto.js, aba Versões): ATRASO_GRAVACAO depois da última — o Postgres
//     publica os contadores de escrita (a assinatura do cache) com até ~10 s de atraso; aquecer antes disso
//     deixaria a entrada marcada com a assinatura velha e ela seria jogada fora logo depois;
//   - depois de cada rotina do Monitor (sincronizações do Sienge): ATRASO_SINCRONIZACAO depois da última;
//   - ao ligar o servidor e a cada INTERVALO: renova o que passou de RENOVAR_APOS (nada chega a MAX_IDADE do
//     cache) e refaz o que venceu na virada do dia.
// Uma empresa por vez (`rodando`); pedido durante a rodada vira uma nova rodada no fim. Erro só vai pro log.
// Ligado por env.dreAquecimento (produção; no desenvolvimento local, DRE_AQUECIMENTO=true).

const ATRASO_GRAVACAO = 12 * 1000;
const ATRASO_SINCRONIZACAO = 15 * 1000;
const ATRASO_INICIO = 30 * 1000;
const INTERVALO = 10 * 60 * 1000;
const RENOVAR_APOS = 40 * 60 * 1000;

const timers = new Map(); // empresa -> timeout agendado
const rodando = new Map(); // empresa -> Promise da rodada
const deNovo = new Set(); // empresas que pediram outra rodada enquanto rodavam
let intervalo = null;

const hojeIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
function ultimoDiaDoMes(iso) {
  const [a, m] = iso.split('-').map(Number);
  return `${iso.slice(0, 7)}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

// As duas leituras que as telas fazem ao abrir, no período padrão delas (1º de janeiro até o fim do mês atual):
// a aba DRE do DRE Gerencial na versão atual (DreGerencialPage.jsx) e o dashboard Demonstração do Resultado na
// versão publicada (DrePainel.jsx — com a comparação com o ano anterior e a POC). `require` aqui dentro: estes
// módulos dependem de outros que carregam contexto.js, que carrega este arquivo.
async function aquecerAgora(empresaId, renovarApos) {
  const versoes = require('./dreVersoes.service');
  const demonstrativo = require('../dre-demonstrativo/demonstrativo.service');
  const drePainel = require('../dashboards/drePainel.service');
  const hoje = hojeIso();
  const periodo = { de: `${hoje.slice(0, 4)}-01-01`, ate: ultimoDiaDoMes(hoje) };
  const inicio = Date.now();
  const feitos = [];
  await cache.comRenovacao(renovarApos, async () => {
    const atual = await versoes.resolver(empresaId, 'atual');
    await pool.comContexto(atual, () => demonstrativo.calcular(empresaId, periodo));
    feitos.push(`DRE v${atual.versao.numero}`);
    let publicada = null;
    try {
      publicada = await versoes.resolver(empresaId, 'publicada');
    } catch {
      publicada = null; // sem versão aprovada: o dashboard não tem o que mostrar
    }
    if (publicada?.versao) {
      await pool.comContexto(publicada, () => drePainel.painel(empresaId, periodo));
      feitos.push(`dashboard v${publicada.versao.numero}`);
    }
  });
  return { feitos, ms: Date.now() - inicio };
}

function aquecer(empresaId, { renovarApos = null } = {}) {
  const id = Number(empresaId);
  if (rodando.has(id)) {
    deNovo.add(id);
    return rodando.get(id);
  }
  const rodada = (async () => {
    try {
      const r = await aquecerAgora(id, renovarApos);
      if (r.ms > 1500) console.log(`[dre-aquecimento] empresa ${id}: ${r.feitos.join(', ')} em ${r.ms} ms`);
    } catch (e) {
      console.error(`[dre-aquecimento] empresa ${id}:`, e.message);
    } finally {
      rodando.delete(id);
      if (deNovo.delete(id)) agendar(id);
    }
  })();
  rodando.set(id, rodada);
  return rodada;
}

// Agenda uma rodada da empresa `atraso` ms depois do último pedido (pedidos seguidos — ex.: várias contas do
// plano marcadas em sequência — viram uma rodada só).
function agendar(empresaId, atraso = ATRASO_GRAVACAO) {
  if (!env.dreAquecimento) return;
  const id = Number(empresaId);
  if (!Number.isInteger(id) || id <= 0) return;
  clearTimeout(timers.get(id));
  const t = setTimeout(() => {
    timers.delete(id);
    aquecer(id);
  }, atraso);
  t.unref();
  timers.set(id, t);
}

const depoisDaSincronizacao = (empresaId) => agendar(empresaId, ATRASO_SINCRONIZACAO);

// As empresas que já usam a DRE (têm versão) — nunca cria versão (resolver cria a inicial de quem não tem).
async function empresasComDre() {
  const { rows } = await pool.base.query(
    'SELECT DISTINCT v.empresa_id AS id FROM dre_versoes v JOIN empresas e ON e.id = v.empresa_id WHERE e.ativo ORDER BY 1'
  );
  return rows.map((r) => r.id);
}

async function rodadaGeral() {
  try {
    for (const id of await empresasComDre()) await aquecer(id, { renovarApos: RENOVAR_APOS });
  } catch (e) {
    console.error('[dre-aquecimento] rodada geral:', e.message);
  }
}

function iniciar() {
  if (!env.dreAquecimento || intervalo) return;
  console.log('[dre-aquecimento] ligado: a DRE é recalculada sozinha depois das gravações e das sincronizações.');
  setTimeout(rodadaGeral, ATRASO_INICIO).unref();
  intervalo = setInterval(rodadaGeral, INTERVALO);
  intervalo.unref();
}

module.exports = { iniciar, agendar, depoisDaSincronizacao, aquecer };
