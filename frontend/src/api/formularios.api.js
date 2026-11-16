import axios from 'axios';
import http from './http';

// Cadastros › Formulários (ver backend/src/modules/formularios).

// Tudo dentro de uma empresa (rotas /formularios/:empresaId/...).
const base = (empresaId) => `/formularios/${empresaId}`;
export const listarFormularios = (empresaId, filtros = {}) => http.get(base(empresaId), { params: filtros }).then((r) => r.data);
export const obterFormulario = (empresaId, id) => http.get(`${base(empresaId)}/${id}`).then((r) => r.data);
export const criarFormulario = (empresaId, dados = {}) => http.post(base(empresaId), dados).then((r) => r.data);
export const salvarFormulario = (empresaId, id, dados) => http.put(`${base(empresaId)}/${id}`, dados).then((r) => r.data);
export const alterarStatusFormulario = (empresaId, id, status) => http.patch(`${base(empresaId)}/${id}/status`, { status }).then((r) => r.data);
export const duplicarFormulario = (empresaId, id) => http.post(`${base(empresaId)}/${id}/duplicar`).then((r) => r.data);
export const gerarNovoLinkFormulario = (empresaId, id) => http.post(`${base(empresaId)}/${id}/novo-link`).then((r) => r.data);
export const excluirFormulario = (empresaId, id) => http.delete(`${base(empresaId)}/${id}`).then((r) => r.data);
export const resultadosFormulario = (empresaId, id) => http.get(`${base(empresaId)}/${id}/respostas`).then((r) => r.data);
export const excluirRespostaFormulario = (empresaId, id, respostaId) =>
  http.delete(`${base(empresaId)}/${id}/respostas/${respostaId}`).then((r) => r.data);
export const usuariosPublicoAlvo = (empresaId) => http.get(`${base(empresaId)}/opcoes/usuarios`).then((r) => r.data);

// Usuário logado: formulários privados que ele ainda precisa responder.
export const formulariosPendentes = () => http.get('/meus-formularios/pendentes').then((r) => r.data);
export const responderFormulario = (id, respostas) => http.post(`/meus-formularios/${id}/respostas`, { respostas }).then((r) => r.data);

// Link público: sem o token do sistema (quem responde pode nem ter login).
const publico = axios.create({ baseURL: import.meta.env.VITE_API_URL });
export const obterFormularioPublico = (token) => publico.get(`/publico/formularios/${token}`).then((r) => r.data);
export const responderFormularioPublico = (token, respostas, website) =>
  publico.post(`/publico/formularios/${token}/respostas`, { respostas, website }).then((r) => r.data);

export function linkPublico(token) {
  return `${window.location.origin}/f/${token}`;
}
