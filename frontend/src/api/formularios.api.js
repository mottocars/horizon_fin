import axios from 'axios';
import http from './http';

// Cadastros › Formulários (ver backend/src/modules/formularios).

export const listarFormularios = (filtros = {}) => http.get('/formularios', { params: filtros }).then((r) => r.data);
export const obterFormulario = (id) => http.get(`/formularios/${id}`).then((r) => r.data);
export const criarFormulario = (dados = {}) => http.post('/formularios', dados).then((r) => r.data);
export const salvarFormulario = (id, dados) => http.put(`/formularios/${id}`, dados).then((r) => r.data);
export const alterarStatusFormulario = (id, status) => http.patch(`/formularios/${id}/status`, { status }).then((r) => r.data);
export const duplicarFormulario = (id) => http.post(`/formularios/${id}/duplicar`).then((r) => r.data);
export const gerarNovoLinkFormulario = (id) => http.post(`/formularios/${id}/novo-link`).then((r) => r.data);
export const excluirFormulario = (id) => http.delete(`/formularios/${id}`).then((r) => r.data);
export const resultadosFormulario = (id) => http.get(`/formularios/${id}/respostas`).then((r) => r.data);
export const excluirRespostaFormulario = (id, respostaId) => http.delete(`/formularios/${id}/respostas/${respostaId}`).then((r) => r.data);
export const usuariosPublicoAlvo = () => http.get('/formularios/opcoes/usuarios').then((r) => r.data);

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
