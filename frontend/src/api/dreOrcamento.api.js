import http from './http';

export function listOrcamentoCentroCusto(empresaId, siengeId) {
  return http.get(`/dre-orcamento/${empresaId}/${siengeId}`).then((res) => res.data);
}

// `itens`: [{ categoria_id, valor }] — grava só as categorias informadas (não mexe nas outras
// já gravadas pra esse mesmo mês). Devolve a lista inteira já atualizada (evita um GET extra
// logo depois de salvar).
export function salvarOrcamentoCentroCusto(empresaId, siengeId, { data_inicio, itens }) {
  return http.put(`/dre-orcamento/${empresaId}/${siengeId}`, { data_inicio, itens }).then((res) => res.data);
}

export function removerOrcamentoCentroCusto(empresaId, siengeId, dataInicio) {
  return http.delete(`/dre-orcamento/${empresaId}/${siengeId}/${dataInicio}`).then((res) => res.data);
}
