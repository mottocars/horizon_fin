const pool = require('../../config/db');
const { ROTINAS, ROTINA_POR_CHAVE } = require('./rotinas');
const executor = require('./executor');
const { estaNaHora, proximaExecucao } = require('./tempo');

// Visão da tela do Monitor de Integrações e agendamento das rotinas.
// Agendamento: 1 linha por empresa+rotina em monitor_integracoes_agendamentos
// (frequência diária/semanal/mensal + horário de Brasília). O agendador
// (verificarAgendamentos, a cada minuto) dispara pelo executor.

const HISTORICO_POR_ROTINA = 8;

function agendamentoParaResposta(row) {
  if (!row) return null;
  return {
    ativo: row.ativo,
    frequencia: row.frequencia,
    horario: row.horario,
    diaSemana: row.dia_semana,
    diaMes: row.dia_mes,
    proximaExecucao: proximaExecucao(row),
  };
}

async function carregarAgendamentos(empresaId) {
  const { rows } = await pool.query(
    `SELECT rotina, ativo, frequencia, to_char(horario, 'HH24:MI') AS horario, dia_semana, dia_mes, ultima_agendada_em
     FROM monitor_integracoes_agendamentos WHERE empresa_id = $1`,
    [empresaId]
  );
  return new Map(rows.map((r) => [r.rotina, r]));
}

async function carregarHistorico(empresaId) {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT e.id, e.rotina, e.origem, e.status, e.iniciado_em, e.finalizado_em, e.resumo, e.erro, u.nome AS usuario_nome,
              row_number() OVER (PARTITION BY e.rotina ORDER BY e.iniciado_em DESC) AS ordem
       FROM monitor_integracoes_execucoes e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
       WHERE e.empresa_id = $1
     ) h WHERE ordem <= $2
     ORDER BY iniciado_em DESC`,
    [empresaId, HISTORICO_POR_ROTINA]
  );
  const porRotina = new Map();
  for (const r of rows) {
    if (!porRotina.has(r.rotina)) porRotina.set(r.rotina, []);
    porRotina.get(r.rotina).push({
      id: r.id,
      origem: r.origem,
      status: r.status,
      iniciadoEm: r.iniciado_em,
      finalizadoEm: r.finalizado_em,
      resumo: r.resumo,
      erro: r.erro,
      usuarioNome: r.usuario_nome,
    });
  }
  return porRotina;
}

// Tudo que a tela precisa de uma empresa: cada rotina com disponibilidade,
// agendamento, execução em andamento (progresso ao vivo) e histórico recente.
async function getPainel(empresaId) {
  const [agendamentos, historico, disponibilidades] = await Promise.all([
    carregarAgendamentos(empresaId),
    carregarHistorico(empresaId),
    Promise.all(ROTINAS.map((r) => r.disponibilidade(empresaId).catch(() => null))),
  ]);
  const emAndamento = new Map(executor.emAndamentoDaEmpresa(empresaId).map((job) => [job.rotina, job]));

  return ROTINAS.map((rotina, i) => ({
    chave: rotina.chave,
    modulo: rotina.modulo,
    nome: rotina.nome,
    descricao: rotina.descricao,
    integracao: rotina.integracao,
    indisponivel: disponibilidades[i],
    agendamento: agendamentoParaResposta(agendamentos.get(rotina.chave)),
    execucaoAtual: emAndamento.get(rotina.chave) || null,
    historico: historico.get(rotina.chave) || [],
  }));
}

async function salvarAgendamento(empresaId, chaveRotina, dados, usuarioId) {
  if (!ROTINA_POR_CHAVE.has(chaveRotina)) {
    const err = new Error('Rotina desconhecida.');
    err.status = 404;
    err.expose = true;
    throw err;
  }
  await pool.query(
    `INSERT INTO monitor_integracoes_agendamentos
       (empresa_id, rotina, ativo, frequencia, horario, dia_semana, dia_mes, atualizado_por, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (empresa_id, rotina) DO UPDATE SET
       ativo = EXCLUDED.ativo, frequencia = EXCLUDED.frequencia, horario = EXCLUDED.horario,
       dia_semana = EXCLUDED.dia_semana, dia_mes = EXCLUDED.dia_mes,
       atualizado_por = EXCLUDED.atualizado_por, atualizado_em = EXCLUDED.atualizado_em`,
    [
      empresaId,
      chaveRotina,
      dados.ativo,
      dados.frequencia,
      dados.horario,
      dados.frequencia === 'semanal' ? dados.diaSemana : null,
      dados.frequencia === 'mensal' ? dados.diaMes : null,
      usuarioId,
      new Date().toISOString(),
    ]
  );
  return getPainel(empresaId);
}

// Agendador (a cada minuto, ver agendador.js): dispara o que está na hora.
// Marca ultima_agendada_em já na largada, pra não disparar de novo no
// próximo minuto enquanto a execução ainda roda.
async function verificarAgendamentos() {
  const { rows } = await pool.query(
    `SELECT empresa_id, rotina, frequencia, to_char(horario, 'HH24:MI') AS horario, dia_semana, dia_mes, ultima_agendada_em
     FROM monitor_integracoes_agendamentos WHERE ativo = TRUE`
  );
  for (const agendamento of rows) {
    if (!estaNaHora(agendamento)) continue;
    await pool.query(
      'UPDATE monitor_integracoes_agendamentos SET ultima_agendada_em = $3 WHERE empresa_id = $1 AND rotina = $2',
      [agendamento.empresa_id, agendamento.rotina, new Date().toISOString()]
    );
    try {
      await executor.iniciar(agendamento.empresa_id, agendamento.rotina, { origem: 'agendada' });
      console.log(
        `[monitor-integracoes] ${agendamento.rotina} (empresa ${agendamento.empresa_id}): execução agendada (${agendamento.frequencia} ${agendamento.horario}) iniciada.`
      );
    } catch (err) {
      console.error(`[monitor-integracoes] não foi possível iniciar ${agendamento.rotina} (empresa ${agendamento.empresa_id}):`, err.message);
    }
  }
}

module.exports = { getPainel, salvarAgendamento, verificarAgendamentos };
