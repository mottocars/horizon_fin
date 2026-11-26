import http from './http';

export function listMascaras(tipo, empresaId, grupo = '') {
  return http.get('/mascaras', { params: { tipo, empresa_id: empresaId, grupo } }).then((res) => res.data);
}

export function createMascaraItem(tipo, empresaId, grupo = '') {
  return http.post('/mascaras', { tipo, empresa_id: empresaId, grupo }).then((res) => res.data);
}

// `responsavel_id` só em Pacotes e Pilares — sem ele (undefined) o backend não mexe no responsável.
export function updateMascaraItem(id, { descricao, sla_dias, responsavel_id }) {
  return http.put(`/mascaras/${id}`, { descricao, sla_dias, responsavel_id }).then((res) => res.data);
}

// Pacotes e Pilares (PacotesPilaresEditor.jsx): cria várias de uma vez, no fim da lista (colar várias linhas).
export function createMascaraItens(tipo, empresaId, descricoes) {
  return http.post('/mascaras/lote', { tipo, empresa_id: empresaId, descricoes }).then((res) => res.data);
}

// Pacotes e Pilares: `ids` = todos os itens já na ordem final (arrastar e soltar). Devolve a lista regravada.
export function reordenarMascara(tipo, empresaId, ids) {
  return http.put('/mascaras/ordem', { tipo, empresa_id: empresaId, ids }).then((res) => res.data);
}

// Quem pode ser Responsável de um Pacote/Pilar: usuários ativos com acesso à empresa ([{ id, nome }]).
export function listResponsaveisMascara(empresaId) {
  return http.get('/mascaras/responsaveis', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function deleteMascaraItem(id) {
  return http.delete(`/mascaras/${id}`).then((res) => res.data);
}
