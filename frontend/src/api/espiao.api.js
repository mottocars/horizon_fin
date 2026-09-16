import http from './http';

export function listEmpresasEspiao() {
  return http.get('/espiao/empresas').then((res) => res.data);
}

export function consultarEmpresaEspiao(empresaId) {
  return http.post(`/espiao/${empresaId}/consultar`).then((res) => res.data);
}

export function listNotasEspiao(empresaId, { dataInicio, dataFim } = {}) {
  return http
    .get(`/espiao/${empresaId}/notas`, { params: { dataInicio, dataFim } })
    .then((res) => res.data);
}

export function listCertificadosEspiao(empresaId) {
  return http.get(`/espiao/${empresaId}/certificados`).then((res) => res.data);
}

export function consultarCertificadoEspiao(certificadoId) {
  return http.post(`/espiao/certificados/${certificadoId}/consultar`).then((res) => res.data);
}

export function listNotasPorCertificadoEspiao(
  certificadoId,
  { dataInicio, dataFim, chave, numero, emissor, destinatario } = {}
) {
  return http
    .get(`/espiao/certificados/${certificadoId}/notas`, {
      params: { dataInicio, dataFim, chave, numero, emissor, destinatario },
    })
    .then((res) => res.data);
}

export function getAgendamentoEspiao(empresaId) {
  return http.get(`/espiao/${empresaId}/agendamento`).then((res) => res.data);
}

export function salvarAgendamentoEspiao(empresaId, intervaloHoras) {
  return http.put(`/espiao/${empresaId}/agendamento`, { intervaloHoras }).then((res) => res.data);
}

export function baixarNotaEspiao(notaId) {
  return http.get(`/espiao/notas/${notaId}/download`, { responseType: 'blob' }).then((res) => res.data);
}

export function baixarNotaPdfEspiao(notaId) {
  return http.get(`/espiao/notas/${notaId}/download-pdf`, { responseType: 'blob' }).then((res) => res.data);
}

export function inativarNotasEspiao(notaIds, motivo) {
  return http.post('/espiao/notas/inativar', { notaIds, motivo }).then((res) => res.data);
}

export function reativarNotasEspiao(notaIds) {
  return http.post('/espiao/notas/reativar', { notaIds }).then((res) => res.data);
}

export function declararCienciaEspiao(notaIds) {
  // O backend devolve { notas: [...] } (ver espiao.controller.js::declararCiencia)
  // — desembrulha aqui pra já voltar a lista, que é o que handleDeclararCiencia
  // espera pra montar o Map de id -> ciente_em.
  return http.post('/espiao/notas/declarar-ciencia', { notaIds }).then((res) => res.data.notas);
}

export function listNotasInativadasEspiao(
  empresaId,
  { dataInicio, dataFim, chave, numero, emissor, destinatario } = {}
) {
  return http
    .get(`/espiao/${empresaId}/notas-inativadas`, {
      params: { dataInicio, dataFim, chave, numero, emissor, destinatario },
    })
    .then((res) => res.data);
}

export function listNotasInativadasPorCertificadoEspiao(
  certificadoId,
  { dataInicio, dataFim, chave, numero, emissor, destinatario } = {}
) {
  return http
    .get(`/espiao/certificados/${certificadoId}/notas-inativadas`, {
      params: { dataInicio, dataFim, chave, numero, emissor, destinatario },
    })
    .then((res) => res.data);
}
