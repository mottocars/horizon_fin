const { AsyncLocalStorage } = require('async_hooks');
const pool = require('../../config/db');

// Cache em memória das leituras pesadas da DRE (a soma do Financeiro, a correção monetária e as unidades —
// segundos na GENESIS), reaproveitadas pela aba DRE, POC, dashboard, MCP e Excel enquanto nada que elas leem
// mudou. Uma entrada vale enquanto:
//   - a GERAÇÃO da empresa é a mesma — sobe a cada gravação da DRE (contexto.js: todo POST/PUT/DELETE das
//     abas, inclusive sincronizar unidades) e nas operações da aba Versões (dreVersoes.routes.js), na hora;
//   - a ASSINATURA das tabelas é a mesma — a soma dos contadores de escrita do Postgres (pg_stat_user_tables)
//     das tabelas lidas: pega sincronização do Sienge, cadastro de centros/plano e qualquer gravação de fora
//     da DRE. O Postgres publica esses contadores com até ~10 s de atraso (só afeta o que não passa pela DRE);
//   - tem menos de MAX_IDADE (rede de segurança).
// A chave leva o search_path da versão do pedido (cada versão salva lê a própria cópia), o dia e os parâmetros.
// Cada chamada recebe uma cópia (structuredClone): quem usa pode alterar à vontade.

const MAX_IDADE = 60 * 60 * 1000;
const MAX_ENTRADAS = 80;

// As tabelas que as leituras guardadas aqui consultam (sie_* = tudo o que vem do Sienge).
const TABELAS = [
  'centros_custo_sienge',
  'planos_financeiros_sienge',
  'integracoes_sienge',
  'lancamentos_ajustes',
  'lancamentos_manuais',
  'dre_mascaras',
  'dre_plano_contas',
  'dre_plano_contas_centro',
  'dre_plano_contas_versoes',
  'dre_documentos_excluidos',
  'dre_condicoes_excluidas',
];

const geracoes = new Map(); // empresa -> número
let geracaoGeral = 0;
const entradas = new Map(); // chave -> { geracao, assinatura, criado, valor (Promise), pronto }
let diaAtual = null;

const geracaoDe = (empresaId) => `${geracaoGeral}.${geracoes.get(Number(empresaId)) || 0}`;

// Gravação na DRE da empresa (ou, sem empresa, de qualquer uma): tudo o que estava guardado deixa de valer.
function invalidar(empresaId = null) {
  if (empresaId === null || empresaId === undefined || !Number.isInteger(Number(empresaId))) geracaoGeral += 1;
  else geracoes.set(Number(empresaId), (geracoes.get(Number(empresaId)) || 0) + 1);
}

async function assinatura() {
  const { rows } = await pool.base.query(
    `SELECT COALESCE(SUM(n_tup_ins + n_tup_upd + n_tup_del), 0)::text AS escritas, COUNT(*)::int AS tabelas
       FROM pg_stat_user_tables
      WHERE schemaname = 'public' AND (relname LIKE 'sie\\_%' OR relname = ANY($1::text[]))`,
    [TABELAS]
  );
  return `${rows[0].tabelas}:${rows[0].escritas}`;
}

// Renovação (aquecimento.js): dentro de comRenovacao(ms, fn), uma entrada válida com mais de `ms` de idade é
// recalculada — e a antiga continua servindo quem pedir até a nova ficar pronta. Assim o aquecimento periódico
// mantém tudo abaixo de MAX_IDADE sem ninguém esperar.
const renovacao = new AsyncLocalStorage();
const comRenovacao = (ms, fn) => (ms ? renovacao.run({ apos: ms }, fn) : fn());

function guardar(chave, entrada) {
  entradas.delete(chave);
  entradas.set(chave, entrada);
  while (entradas.size > MAX_ENTRADAS) entradas.delete(entradas.keys().next().value);
}

// Devolve `fn()` (uma Promise) guardado por empresa + nome + parâmetros na versão do pedido. Pedidos iguais ao
// mesmo tempo esperam a mesma consulta.
async function lembrar(empresaId, nome, parametros, fn) {
  const caminho = pool.contextoAtual()?.searchPath || 'public';
  // O dia (Brasília) entra na chave: correção e unidades usam a data de hoje — tudo vence à meia-noite.
  const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const chave = JSON.stringify([Number(empresaId), nome, caminho, dia, parametros]);
  if (dia !== diaAtual) {
    // Virou o dia: o que é de ontem não vale mais (a chave mudou) — libera a memória.
    diaAtual = dia;
    [...entradas.keys()].filter((k) => JSON.parse(k)[3] !== dia).forEach((k) => entradas.delete(k));
  }
  const geracao = geracaoDe(empresaId);
  const assin = await assinatura();
  const e = entradas.get(chave);
  const idade = e ? Date.now() - e.criado : 0;
  if (e && e.geracao === geracao && e.assinatura === assin && idade < MAX_IDADE) {
    const renovar = renovacao.getStore();
    if (renovar && idade > renovar.apos && e.pronto) {
      const nova = { geracao, assinatura: assin, criado: Date.now(), valor: Promise.resolve().then(fn) };
      const r = await nova.valor; // se falhar, a antiga continua valendo
      nova.pronto = true;
      if (entradas.get(chave) === e) guardar(chave, nova);
      return structuredClone(r);
    }
    guardar(chave, e); // reinsere no fim: a ordem do Map vira "usada por último"
    return structuredClone(await e.valor);
  }
  const valor = Promise.resolve().then(fn);
  const nova = { geracao, assinatura: assin, criado: Date.now(), valor, pronto: false };
  guardar(chave, nova);
  try {
    const r = await valor;
    nova.pronto = true;
    return structuredClone(r);
  } catch (err) {
    if (entradas.get(chave) === nova) entradas.delete(chave);
    throw err;
  }
}

// Pra testes e diagnóstico.
const tamanho = () => entradas.size;
function limpar() {
  entradas.clear();
}

module.exports = { lembrar, invalidar, comRenovacao, tamanho, limpar };
