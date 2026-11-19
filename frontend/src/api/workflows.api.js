import http from './http';

// Operações › Workflows (backend: modules/workflows).
const base = (empresaId) => `/workflows/${empresaId}`;
const dados = (r) => r.data;

export const listarWorkflows = (empresaId) => http.get(base(empresaId)).then(dados);
// { gatilhos, destinatarios, modelos, conexoes, usuarios }
export const opcoesWorkflows = (empresaId) => http.get(`${base(empresaId)}/opcoes`).then(dados);
export const execucoesWorkflows = (empresaId) => http.get(`${base(empresaId)}/execucoes`).then(dados);
export const criarWorkflow = (empresaId, w) => http.post(base(empresaId), w).then(dados);
export const atualizarWorkflow = (empresaId, id, w) => http.put(`${base(empresaId)}/${id}`, w).then(dados);
export const ativarWorkflow = (empresaId, id, ativo) => http.put(`${base(empresaId)}/${id}/ativo`, { ativo }).then(dados);
export const excluirWorkflow = (empresaId, id) => http.delete(`${base(empresaId)}/${id}`).then(dados);
