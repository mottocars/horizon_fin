import http from './http';

export function getPainelMonitor(empresaId) {
  return http.get(`/monitor-integracoes/${empresaId}`).then((res) => res.data);
}

export function salvarAgendamentoMonitor(empresaId, rotina, agendamento) {
  return http.put(`/monitor-integracoes/${empresaId}/${rotina}/agendamento`, agendamento).then((res) => res.data);
}

export function executarRotinaMonitor(empresaId, rotina) {
  return http.post(`/monitor-integracoes/${empresaId}/${rotina}/executar`).then((res) => res.data);
}
