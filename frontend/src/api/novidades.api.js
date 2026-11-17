import http from './http';

// Cadastros › Novidades (tela) e /minhas-novidades (todo usuário logado: janela
// ao entrar e botão "Novidades" do topo). Ver backend/src/modules/novidades.

// ─── para quem vê ──
export function minhasNovidades() {
  return http.get('/minhas-novidades').then((res) => res.data);
}

export function marcarNovidadeVista(id) {
  return http.post(`/minhas-novidades/${id}/vista`).then((res) => res.data);
}

// O GIF vem do banco por uma rota autenticada: baixa como blob (a <img> não
// manda o token sozinha). `cadastro` usa a rota da tela de cadastro.
export function baixarMidiaNovidade(id, { cadastro = false } = {}) {
  return http
    .get(cadastro ? `/novidades/${id}/midia` : `/minhas-novidades/${id}/midia`, { responseType: 'blob' })
    .then((res) => res.data);
}

// ─── cadastro ──
export function listarNovidades() {
  return http.get('/novidades').then((res) => res.data);
}

export function obterNovidade(id) {
  return http.get(`/novidades/${id}`).then((res) => res.data);
}

// dados = { nome, descricao, publico: 'TODOS'|'EMPRESAS', empresas: [{ empresa_id, todos_usuarios, usuario_ids }] }
// arquivo = File | null (null mantém o GIF atual na edição)
export function salvarNovidade(id, dados, arquivo) {
  const formData = new FormData();
  formData.append('dados', JSON.stringify(dados));
  if (arquivo) formData.append('arquivo', arquivo);
  const config = { headers: { 'Content-Type': 'multipart/form-data' } };
  return (id ? http.put(`/novidades/${id}`, formData, config) : http.post('/novidades', formData, config)).then((res) => res.data);
}

export function excluirNovidade(id) {
  return http.delete(`/novidades/${id}`).then((res) => res.data);
}

export function opcoesEmpresasNovidade() {
  return http.get('/novidades/opcoes/empresas').then((res) => res.data);
}

export function opcoesUsuariosNovidade(empresaId) {
  return http.get(`/novidades/opcoes/empresas/${empresaId}/usuarios`).then((res) => res.data);
}

// Quem já viu a novidade e o percentual sobre o público (editor do cadastro).
export function vistasNovidade(id) {
  return http.get(`/novidades/${id}/vistas`).then((res) => res.data);
}
