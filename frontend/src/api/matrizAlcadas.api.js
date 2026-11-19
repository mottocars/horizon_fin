import http from './http';

// Cadastros › Matriz de Alçadas (backend: modules/matriz-alcadas).
// { classificacoes: [{ id, rotulo, descricao, usuarios (quem pode ser escolhido), itens: [{ id, rotulo, descricao, usuario }] }] }
export const listarMatrizAlcadas = (empresaId) => http.get(`/matriz-alcadas/${empresaId}`).then((r) => r.data);

// `usuarioId` null limpa o item.
export const salvarItemMatrizAlcadas = (empresaId, classificacao, item, usuarioId) =>
  http.put(`/matriz-alcadas/${empresaId}/${classificacao}/${item}`, { usuario_id: usuarioId }).then((r) => r.data);
