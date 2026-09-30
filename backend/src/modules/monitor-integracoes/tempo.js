// Datas/horas do Monitor de Integrações sempre no horário de Brasília, a
// partir do relógio do servidor da aplicação — nunca do NOW() do banco (o
// relógio do Postgres da VPS está deslocado; ver comentário em
// monitor-integracoes/executor.js).
const FUSO = 'America/Sao_Paulo';

const partesSP = (data) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: FUSO,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false,
    })
      .formatToParts(data)
      .map((p) => [p.type, p.value])
  );

const DIAS_SEMANA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// { data: 'YYYY-MM-DD', hora: 'HH:MM', diaSemana: 0-6, dia, mes, ano }
function agoraSP(data = new Date()) {
  const p = partesSP(data);
  const hora = p.hour === '24' ? '00' : p.hour;
  return {
    data: `${p.year}-${p.month}-${p.day}`,
    hora: `${hora}:${p.minute}`,
    diaSemana: DIAS_SEMANA[p.weekday],
    dia: Number(p.day),
    mes: Number(p.month),
    ano: Number(p.year),
  };
}

const ultimoDiaDoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

// O dia (de calendário) cai na regra da frequência? Mensal com dia 31 num
// mês de 30 dias roda no último dia do mês.
function diaAtende(agendamento, { diaSemana, dia, mes, ano }) {
  if (agendamento.frequencia === 'semanal') return diaSemana === agendamento.dia_semana;
  if (agendamento.frequencia === 'mensal') return dia === Math.min(agendamento.dia_mes, ultimoDiaDoMes(ano, mes));
  return true; // diária
}

// Deve disparar agora? Já passou do horário hoje, hoje é um dia da regra e
// ainda não disparou hoje pelo agendamento.
function estaNaHora(agendamento, agora = new Date()) {
  const sp = agoraSP(agora);
  if (sp.hora < agendamento.horario) return false;
  if (!diaAtende(agendamento, sp)) return false;
  if (agendamento.ultima_agendada_em && agoraSP(new Date(agendamento.ultima_agendada_em)).data === sp.data) return false;
  return true;
}

// Próxima execução prevista ('YYYY-MM-DD HH:MM', Brasília) — só pra mostrar.
function proximaExecucao(agendamento, agora = new Date()) {
  if (!agendamento?.ativo) return null;
  const hoje = agoraSP(agora);
  for (let i = 0; i <= 62; i++) {
    const dia = agoraSP(new Date(agora.getTime() + i * 86400000));
    if (!diaAtende(agendamento, dia)) continue;
    if (i === 0) {
      const jaRodouHoje =
        agendamento.ultima_agendada_em && agoraSP(new Date(agendamento.ultima_agendada_em)).data === hoje.data;
      if (jaRodouHoje || hoje.hora >= agendamento.horario) {
        // ainda não rodou hoje mas o horário já passou: o próximo tick dispara
        if (!jaRodouHoje) return `${dia.data} ${agendamento.horario}`;
        continue;
      }
    }
    return `${dia.data} ${agendamento.horario}`;
  }
  return null;
}

module.exports = { agoraSP, estaNaHora, proximaExecucao };
