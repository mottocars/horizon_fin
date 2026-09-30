const pool = require('../../config/db');
const { vincularAutomaticamente } = require('./vinculo.service');

// Varredura de vínculo automático nota ↔ título do contas a pagar (Sienge),
// por empresa. Sempre olha desde a PRIMEIRA nota ainda sem vínculo até hoje
// (não usa o período da tela) e vincula o que casar 3/3 de forma inequívoca
// (ver vinculo.service.js::vincularAutomaticamente).
//
// Roda em segundo plano (a varredura completa de uma empresa grande passa de
// 1 min — tempo demais pra uma requisição HTTP presa esperando): quem dispara
// recebe o "job" na hora e acompanha o andamento consultando getStatus, que
// devolve o log por etapa (mesma ideia do log de atualização de Repasses
// CEF). Dois gatilhos, o mesmo job: o botão da tela (manual) e o horário
// diário configurado em "Agendar consulta" (agendador.js). Um job por
// empresa de cada vez — disparar de novo enquanto roda só devolve o mesmo.

const MANTER_JOB_FINALIZADO_MS = 30 * 60 * 1000;
const FUSO = 'America/Sao_Paulo';

const jobs = new Map(); // empresaId -> job

function hojeSaoPaulo(data = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(data); // YYYY-MM-DD
}

function horaSaoPaulo(data = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(data);
}

function formatarDataBr(iso) {
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

const ETAPAS_INICIAIS = () => [
  { chave: 'notas', titulo: 'Notas sem vínculo', status: 'carregando' },
  { chave: 'NFE', titulo: 'Notas de produto (NF-e)', status: 'aguardando' },
  { chave: 'NFSE', titulo: 'Notas de serviço (NFS-e)', status: 'aguardando' },
  { chave: 'vinculacao', titulo: 'Conferência e vínculo', status: 'aguardando' },
];

function atualizarEtapa(job, chave, dados) {
  job.etapas = job.etapas.map((etapa) => (etapa.chave === chave ? { ...etapa, ...dados } : etapa));
}

// Resumo que fica gravado (e aparece na janela de agendamento) — sem a lista
// inteira de vínculos, que só vive no job em memória.
function resumoDoResultado(resultado) {
  return {
    notasAnalisadas: resultado.notasAnalisadas,
    vinculados: resultado.vinculos.length,
    ambiguos: resultado.ambiguos.length,
    desde: resultado.desde,
  };
}

async function registrarExecucao(empresaId, origem, resumo) {
  await pool.query(
    `INSERT INTO espiao_vinculacao_automatica (empresa_id, ultima_execucao_em, ultima_execucao_origem, ultimo_resultado${
      origem === 'agendada' ? ', ultima_agendada_em' : ''
    })
     VALUES ($1, $2, $3, $4${origem === 'agendada' ? ', $2' : ''})
     ON CONFLICT (empresa_id) DO UPDATE SET
       ultima_execucao_em = EXCLUDED.ultima_execucao_em,
       ultima_execucao_origem = EXCLUDED.ultima_execucao_origem,
       ultimo_resultado = EXCLUDED.ultimo_resultado${
         origem === 'agendada' ? ', ultima_agendada_em = EXCLUDED.ultima_agendada_em' : ''
       }`,
    [empresaId, new Date(), origem, JSON.stringify(resumo)]
  );
}

async function executar(job) {
  const { empresaId } = job;
  try {
    const { rows } = await pool.query(
      `SELECT min(data_emissao)::date::text AS desde, count(*)::int AS total
       FROM espiao_notas n
       WHERE empresa_id = $1 AND inativa = FALSE AND apenas_resumo = FALSE
         AND situacao_categoria IS DISTINCT FROM 'cancelada'
         AND NOT EXISTS (SELECT 1 FROM espiao_notas_vinculos v WHERE v.nota_id = n.id)`,
      [empresaId]
    );
    const { desde, total } = rows[0];
    const ate = hojeSaoPaulo();

    if (!total) {
      atualizarEtapa(job, 'notas', { status: 'sucesso', detalhe: 'Todas as notas já estão vinculadas.' });
      atualizarEtapa(job, 'NFE', { status: 'ignorado', detalhe: 'Nada a vincular.' });
      atualizarEtapa(job, 'NFSE', { status: 'ignorado', detalhe: 'Nada a vincular.' });
      atualizarEtapa(job, 'vinculacao', { status: 'sucesso', detalhe: 'Nenhum vínculo novo.' });
      job.resultado = { notasAnalisadas: 0, vinculos: [], ambiguos: [], desde: null };
    } else {
      atualizarEtapa(job, 'notas', {
        status: 'sucesso',
        detalhe: `${total} nota(s) sem vínculo, desde ${formatarDataBr(desde)} até hoje.`,
      });

      const concluidos = new Set();
      const resultado = await vincularAutomaticamente(empresaId, {
        dataInicio: desde,
        dataFim: ate,
        usuarioId: job.usuarioId,
        simular: false,
        aoProgredir: (tipo, dados) => {
          const detalhe =
            dados.status === 'ignorado'
              ? 'Nenhuma nota sem vínculo deste tipo.'
              : dados.status === 'sem_configuracao'
                ? `${dados.notas} nota(s) sem vínculo, mas falta configurar o código do documento (aba Configurações).`
                : dados.status === 'sucesso'
                  ? `${dados.titulos} título(s) no Sienge conferidos.`
                  : undefined;
          atualizarEtapa(job, tipo, { ...dados, ...(detalhe ? { detalhe } : {}) });
          if (dados.status !== 'carregando') concluidos.add(tipo);
          if (concluidos.size === 2) atualizarEtapa(job, 'vinculacao', { status: 'carregando' });
        },
      });

      const vinculados = resultado.vinculos.length;
      atualizarEtapa(job, 'vinculacao', {
        status: 'sucesso',
        detalhe:
          `${vinculados} nota(s) vinculada(s) automaticamente` +
          (resultado.ambiguos.length ? ` · ${resultado.ambiguos.length} caso(s) ambíguo(s) ficaram para conferência manual.` : '.'),
      });
      job.resultado = { ...resultado, desde };
    }

    job.status = 'concluido';
    await registrarExecucao(empresaId, job.origem, resumoDoResultado(job.resultado));
    console.log(
      `[vinculacao-automatica] empresa ${empresaId} (${job.origem}): ${job.resultado.vinculos.length} vínculo(s) criado(s).`
    );
  } catch (err) {
    job.status = 'erro';
    job.erro = err.message || 'Falha na varredura.';
    const emAndamento = job.etapas.find((e) => e.status === 'carregando');
    if (emAndamento) atualizarEtapa(job, emAndamento.chave, { status: 'erro', detalhe: job.erro });
    console.error(`[vinculacao-automatica] empresa ${empresaId} (${job.origem}) falhou:`, job.erro);
  } finally {
    job.finalizadoEm = new Date().toISOString();
    setTimeout(() => {
      if (jobs.get(empresaId) === job) jobs.delete(empresaId);
    }, MANTER_JOB_FINALIZADO_MS).unref?.();
  }
}

// Dispara a varredura da empresa (ou devolve a que já está rodando).
function iniciar(empresaId, { origem = 'manual', usuarioId = null } = {}) {
  const id = Number(empresaId);
  const atual = jobs.get(id);
  if (atual && atual.status === 'executando') return atual;

  const job = {
    id: `${id}-${Date.now()}`,
    empresaId: id,
    origem,
    usuarioId,
    status: 'executando',
    iniciadoEm: new Date().toISOString(),
    finalizadoEm: null,
    etapas: ETAPAS_INICIAIS(),
    resultado: null,
    erro: null,
  };
  jobs.set(id, job);
  executar(job); // segundo plano — o andamento sai em getStatus
  return job;
}

// O que a tela precisa: o job atual/último (log) + a configuração do horário
// e o resumo da última execução gravada.
async function getStatus(empresaId) {
  const id = Number(empresaId);
  const { rows } = await pool.query(
    `SELECT to_char(horario, 'HH24:MI') AS horario, ultima_execucao_em, ultima_execucao_origem, ultimo_resultado
     FROM espiao_vinculacao_automatica WHERE empresa_id = $1`,
    [id]
  );
  const config = rows[0];
  const job = jobs.get(id) || null;
  return {
    agendamento: {
      horario: config?.horario || null,
      ultimaExecucaoEm: config?.ultima_execucao_em || null,
      ultimaExecucaoOrigem: config?.ultima_execucao_origem || null,
      ultimoResultado: config?.ultimo_resultado || null,
    },
    job: job && {
      id: job.id,
      origem: job.origem,
      status: job.status,
      iniciadoEm: job.iniciadoEm,
      finalizadoEm: job.finalizadoEm,
      etapas: job.etapas,
      erro: job.erro,
      resultado: job.resultado && resumoDoResultado(job.resultado),
    },
  };
}

async function salvarHorario(empresaId, horario) {
  await pool.query(
    `INSERT INTO espiao_vinculacao_automatica (empresa_id, horario) VALUES ($1, $2)
     ON CONFLICT (empresa_id) DO UPDATE SET horario = EXCLUDED.horario`,
    [empresaId, horario]
  );
}

// Chamado pelo agendador a cada minuto: dispara a varredura das empresas cujo
// horário (de Brasília) já chegou hoje e que ainda não rodaram hoje pelo
// agendamento. Rodar na mão antes do horário não pula a execução agendada.
async function verificarAgendamentos() {
  const { rows } = await pool.query(
    `SELECT empresa_id, to_char(horario, 'HH24:MI') AS horario, ultima_agendada_em
     FROM espiao_vinculacao_automatica WHERE horario IS NOT NULL`
  );
  const hoje = hojeSaoPaulo();
  const agora = horaSaoPaulo();
  for (const row of rows) {
    const jaRodouHoje = row.ultima_agendada_em && hojeSaoPaulo(new Date(row.ultima_agendada_em)) === hoje;
    if (agora >= row.horario && !jaRodouHoje) {
      const job = iniciar(row.empresa_id, { origem: 'agendada' });
      // Marca já na largada, pra não disparar de novo no próximo minuto
      // enquanto esta ainda roda.
      await pool.query('UPDATE espiao_vinculacao_automatica SET ultima_agendada_em = $2 WHERE empresa_id = $1', [
        row.empresa_id,
        new Date(),
      ]);
      console.log(`[vinculacao-automatica] empresa ${row.empresa_id}: varredura agendada (${row.horario}) iniciada — job ${job.id}.`);
    }
  }
}

module.exports = { iniciar, getStatus, salvarHorario, verificarAgendamentos, hojeSaoPaulo, horaSaoPaulo };
