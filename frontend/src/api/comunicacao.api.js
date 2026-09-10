import http from './http';

export function listTemplatesComunicacao(empresaId) {
  return http.get('/comunicacao/templates', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function criarTemplateComunicacao(empresaId, dados = {}) {
  return http.post('/comunicacao/templates', { empresa_id: empresaId, ...dados }).then((res) => res.data);
}

export function atualizarTemplateComunicacao(id, dados) {
  return http.put(`/comunicacao/templates/${id}`, dados).then((res) => res.data);
}

export function removerTemplateComunicacao(id) {
  return http.delete(`/comunicacao/templates/${id}`).then((res) => res.data);
}
