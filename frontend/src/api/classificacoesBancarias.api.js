import http from './http';

export function listClassificacoes(empresaId) {
  return http.get(`/classificacoes-bancarias/${empresaId}`).then((res) => res.data);
}

export function createClassificacao(empresaId, { nome, prioridade_sem_saldo }) {
  return http.post(`/classificacoes-bancarias/${empresaId}`, { nome, prioridade_sem_saldo }).then((res) => res.data);
}

export function updateClassificacao(empresaId, id, { nome, prioridade_sem_saldo }) {
  return http.put(`/classificacoes-bancarias/${empresaId}/${id}`, { nome, prioridade_sem_saldo }).then((res) => res.data);
}

export function removeClassificacao(empresaId, id) {
  return http.delete(`/classificacoes-bancarias/${empresaId}/${id}`).then((res) => res.data);
}
