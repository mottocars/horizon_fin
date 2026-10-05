import http from './http';

// Home > Plano de Voo (Kanban de atividades).

// visao: 'minhas' (sou o responsável) | 'equipe' (criei pra outras pessoas).
// { hoje, cards: [...], usuarios: { [id]: { id, nome, avatar_url } } }
export function listarCards({ visao, empresaId } = {}) {
  return http.get('/projetos/cards', { params: { visao, empresa_id: empresaId || undefined } }).then((r) => r.data);
}

export function listarResponsaveis(empresaId) {
  return http.get('/projetos/responsaveis', { params: { empresa_id: empresaId } }).then((r) => r.data);
}

// { card, comentarios, anexos, historico, usuarios, permissoes }
export function obterCard(id) {
  return http.get(`/projetos/cards/${id}`).then((r) => r.data);
}

export function criarCard(dados) {
  return http.post('/projetos/cards', dados).then((r) => r.data);
}

export function atualizarCard(id, dados) {
  return http.put(`/projetos/cards/${id}`, dados).then((r) => r.data);
}

export function excluirCard(id) {
  return http.delete(`/projetos/cards/${id}`);
}

export function moverCard(id, status) {
  return http.patch(`/projetos/cards/${id}/status`, { status }).then((r) => r.data);
}

export function comentarCard(id, texto) {
  return http.post(`/projetos/cards/${id}/comentarios`, { texto }).then((r) => r.data);
}

export function excluirComentario(id, comentarioId) {
  return http.delete(`/projetos/cards/${id}/comentarios/${comentarioId}`).then((r) => r.data);
}

export function anexarArquivos(id, arquivos) {
  const fd = new FormData();
  for (const a of arquivos) fd.append('arquivos', a);
  return http.post(`/projetos/cards/${id}/anexos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
}

export function baixarAnexo(id, anexoId) {
  return http.get(`/projetos/cards/${id}/anexos/${anexoId}`, { responseType: 'blob' }).then((r) => r.data);
}

export function excluirAnexo(id, anexoId) {
  return http.delete(`/projetos/cards/${id}/anexos/${anexoId}`).then((r) => r.data);
}

// Só o criador, e só a partir de Concluído.
export function finalizarCard(id) {
  return http.post(`/projetos/cards/${id}/finalizar`).then((r) => r.data);
}

export function devolverCard(id) {
  return http.post(`/projetos/cards/${id}/devolver`).then((r) => r.data);
}

// ─── Planos de voo (aba "Plano de voo", Gantt) ───
// { hoje, planos: [{ ..., total, porBucket, progresso, inicio, fim, macros }], usuarios }
export function listarPlanos(empresaId) {
  return http.get('/projetos/planos', { params: { empresa_id: empresaId || undefined } }).then((r) => r.data);
}

// Para o formulário do card: [{ id, nome, macros: [{ id, nome }] }]
export function opcoesPlanos(empresaId) {
  return http.get('/projetos/planos/opcoes', { params: { empresa_id: empresaId } }).then((r) => r.data);
}

// { hoje, plano, macros, cards, usuarios, permissoes }
export function obterPlano(id) {
  return http.get(`/projetos/planos/${id}`).then((r) => r.data);
}

export function criarPlano(dados) {
  return http.post('/projetos/planos', dados).then((r) => r.data);
}

export function atualizarPlano(id, dados) {
  return http.put(`/projetos/planos/${id}`, dados).then((r) => r.data);
}

export function excluirPlano(id) {
  return http.delete(`/projetos/planos/${id}`);
}

export function criarMacro(id, nome) {
  return http.post(`/projetos/planos/${id}/macros`, { nome }).then((r) => r.data);
}

export function renomearMacro(id, macroId, nome) {
  return http.put(`/projetos/planos/${id}/macros/${macroId}`, { nome }).then((r) => r.data);
}

export function excluirMacro(id, macroId) {
  return http.delete(`/projetos/planos/${id}/macros/${macroId}`).then((r) => r.data);
}

export function ordenarMacros(id, ids) {
  return http.put(`/projetos/planos/${id}/macros/ordem`, { ids }).then((r) => r.data);
}
