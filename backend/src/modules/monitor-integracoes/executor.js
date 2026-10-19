const pool = require('../../config/db');
const { ROTINA_POR_CHAVE } = require('./rotinas');
const { rodarCancelavel, erroCancelada } = require('../../utils/execucaoCancelavel');

// Executor do Monitor de Integrações: roda uma rotina (ver rotinas.js) em
// segundo plano — as sincronizações levam de segundos a vários minutos, tempo
// demais pra uma requisição HTTP presa esperando — e registra cada execução
// em monitor_integracoes_execucoes (histórico da tela). O andamento ao vivo
// (progresso/etapas) fica só em memória e é lido por polling.
//
// Uma execução por empresa+rotina de cada vez: disparar de novo enquanto roda
// devolve a mesma. Datas gravadas a partir do relógio da aplicação (new Date()),
// nunca com NOW(): o relógio do Postgres da VPS está deslocado em relação à
// hora real, o que bagunçaria "quando rodou" e "já rodou hoje?".
//
// Cancelar ("Parar" na tela): avisa a rotina (as chamadas ao Sienge e as esperas param na hora, e o
// próximo progresso() lança) e espera ela terminar. Se não parar em ESPERA_CANCELAMENTO_MS, a
// execução é encerrada como cancelada mesmo assim e a vaga é liberada; o que ela ainda fizer em
// segundo plano só vai para o log.

const emAndamento = new Map(); // `${empresaId}:${rotina}` -> job
const chaveJob = (empresaId, rotina) => `${empresaId}:${rotina}`;
const ESPERA_CANCELAMENTO_MS = 10_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function paraResposta(job) {
  return {
    id: job.id,
    rotina: job.rotina,
    origem: job.origem,
    status: job.status,
    iniciadoEm: job.iniciadoEm,
    finalizadoEm: job.finalizadoEm,
    progresso: job.progresso,
    cancelando: Boolean(job.cancelamento),
    etapas: job.etapas,
    resumo: job.resumo,
    erro: job.erro,
  };
}

async function finalizar(job, status, { resumo = null, erro = null } = {}) {
  if (job.finalizadoEm) return false; // já encerrada (cancelamento que não esperou a rotina)
  job.status = status;
  job.resumo = resumo;
  job.erro = erro;
  job.progresso = null;
  job.finalizadoEm = new Date().toISOString();
  await pool.query(
    'UPDATE monitor_integracoes_execucoes SET status = $2, finalizado_em = $3, resumo = $4, erro = $5 WHERE id = $1',
    [job.id, status, job.finalizadoEm, resumo, erro]
  );
  return true;
}

const textoCancelada = (job) => `Cancelada por ${job.cancelamento?.usuarioNome || 'um usuário'}.`;

function liberar(job) {
  const chave = chaveJob(job.empresaId, job.rotina);
  if (emAndamento.get(chave) === job) emAndamento.delete(chave);
}

// Parâmetros salvos no Monitor para a empresa e a rotina ({} = os padrões).
async function parametrosDe(empresaId, chaveRotina) {
  const { rows } = await pool.query('SELECT parametros FROM monitor_integracoes_parametros WHERE empresa_id = $1 AND rotina = $2', [
    empresaId,
    chaveRotina,
  ]);
  return rows[0]?.parametros || {};
}

async function rodar(job, rotina) {
  const rotulo = `${job.rotina} (empresa ${job.empresaId}, ${job.origem})`;
  try {
    const parametros = rotina.parametros ? await parametrosDe(job.empresaId, job.rotina) : {};
    const resumo = await rodarCancelavel(job.controle.signal, () =>
      rotina.executar({
        empresaId: job.empresaId,
        usuarioId: job.usuarioId,
        parametros,
        progresso: (p) => {
          if (job.cancelamento) throw erroCancelada();
          job.progresso = p || null;
        },
        etapas: (lista) => {
          job.etapas = lista;
        },
      })
    );
    // Terminou antes de o cancelamento fazer efeito: registra o que de fato aconteceu.
    if (await finalizar(job, 'sucesso', { resumo })) console.log(`[monitor-integracoes] ${rotulo}: ${resumo}`);
    else console.warn(`[monitor-integracoes] ${rotulo}: terminou depois de cancelada — ${resumo}`);
  } catch (err) {
    if (job.cancelamento) {
      await finalizar(job, 'cancelada', { erro: textoCancelada(job) }).catch(() => {});
      console.log(`[monitor-integracoes] ${rotulo}: ${textoCancelada(job)}`);
    } else {
      await finalizar(job, 'erro', { erro: err.message || 'Falha na atualização.' }).catch(() => {});
      console.error(`[monitor-integracoes] ${rotulo} falhou:`, err.message);
    }
  } finally {
    liberar(job);
  }
}

// Dispara a rotina (ou devolve a execução que já está rodando).
async function iniciar(empresaId, chaveRotina, { origem = 'manual', usuarioId = null } = {}) {
  const rotina = ROTINA_POR_CHAVE.get(chaveRotina);
  if (!rotina) {
    const err = new Error('Rotina desconhecida.');
    err.status = 404;
    err.expose = true;
    throw err;
  }
  const id = Number(empresaId);
  const atual = emAndamento.get(chaveJob(id, chaveRotina));
  if (atual) return paraResposta(atual);

  const iniciadoEm = new Date().toISOString();
  const { rows } = await pool.query(
    `INSERT INTO monitor_integracoes_execucoes (empresa_id, rotina, origem, status, iniciado_em, usuario_id)
     VALUES ($1, $2, $3, 'executando', $4, $5) RETURNING id`,
    [id, chaveRotina, origem, iniciadoEm, usuarioId]
  );
  const job = {
    id: rows[0].id,
    empresaId: id,
    rotina: chaveRotina,
    origem,
    usuarioId,
    status: 'executando',
    iniciadoEm,
    finalizadoEm: null,
    progresso: null,
    etapas: null,
    resumo: null,
    erro: null,
    controle: new AbortController(),
    cancelamento: null,
  };
  emAndamento.set(chaveJob(id, chaveRotina), job);
  job.promessa = rodar(job, rotina); // segundo plano
  return paraResposta(job);
}

// Para a execução em andamento (null se não houver nenhuma).
async function cancelar(empresaId, chaveRotina, { usuarioId = null } = {}) {
  const job = emAndamento.get(chaveJob(Number(empresaId), chaveRotina));
  if (!job) return null;
  if (!job.cancelamento) {
    const { rows } = await pool.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]);
    job.cancelamento = { usuarioId, usuarioNome: rows[0]?.nome || null };
    job.progresso = { texto: 'Cancelando...' };
    job.controle.abort();
    console.log(`[monitor-integracoes] ${job.rotina} (empresa ${job.empresaId}): cancelamento pedido por ${job.cancelamento.usuarioNome || usuarioId}.`);
  }
  await Promise.race([job.promessa, sleep(ESPERA_CANCELAMENTO_MS)]);
  if (await finalizar(job, 'cancelada', { erro: textoCancelada(job) })) {
    console.warn(`[monitor-integracoes] ${job.rotina} (empresa ${job.empresaId}): não parou em ${ESPERA_CANCELAMENTO_MS / 1000} s — encerrada como cancelada.`);
  }
  liberar(job);
  return paraResposta(job);
}

// Execução em andamento (com progresso ao vivo) ou, se não houver, a última
// registrada no histórico.
async function getExecucaoAtualOuUltima(empresaId, chaveRotina) {
  const atual = emAndamento.get(chaveJob(Number(empresaId), chaveRotina));
  if (atual) return paraResposta(atual);
  const { rows } = await pool.query(
    `SELECT id, rotina, origem, status, iniciado_em, finalizado_em, resumo, erro
     FROM monitor_integracoes_execucoes WHERE empresa_id = $1 AND rotina = $2
     ORDER BY iniciado_em DESC LIMIT 1`,
    [empresaId, chaveRotina]
  );
  const r = rows[0];
  return r
    ? {
        id: r.id,
        rotina: r.rotina,
        origem: r.origem,
        status: r.status,
        iniciadoEm: r.iniciado_em,
        finalizadoEm: r.finalizado_em,
        progresso: null,
        etapas: null,
        resumo: r.resumo,
        erro: r.erro,
      }
    : null;
}

function emAndamentoDaEmpresa(empresaId) {
  const id = Number(empresaId);
  return [...emAndamento.values()].filter((job) => job.empresaId === id).map(paraResposta);
}

// Na subida do servidor: execução que ficou "executando" no banco morreu junto
// com o processo anterior (deploy, queda) — marca como interrompida.
async function marcarInterrompidas() {
  await pool.query(
    `UPDATE monitor_integracoes_execucoes
     SET status = 'interrompida', finalizado_em = $1, erro = 'O servidor foi reiniciado durante a execução.'
     WHERE status = 'executando'`,
    [new Date().toISOString()]
  );
}

module.exports = { iniciar, cancelar, getExecucaoAtualOuUltima, emAndamentoDaEmpresa, marcarInterrompidas };
