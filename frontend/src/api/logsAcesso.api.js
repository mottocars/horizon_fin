import http from './http';

export function registrarAcesso(tela) {
  return http.post('/logs-acesso', { tela }).then((res) => res.data);
}

export function getMetricasUso({ dataInicio, dataFim } = {}) {
  const params = dataInicio && dataFim ? { dataInicio, dataFim } : {};
  return http.get('/logs-acesso/metricas', { params }).then((res) => res.data);
}
