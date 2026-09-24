import http from './http';

// Orçamento vigente (o de data_inicio mais recente) de cada centro de custo da empresa —
// { [sienge_id]: { data_inicio, valores: { [categoria_id]: valor } } }, só entram centros que
// já têm pelo menos 1 orçamento lançado.
export function listOrcamentosVigentes(empresaId) {
  return http.get(`/dre-orcamento/${empresaId}/vigentes`).then((res) => res.data);
}

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
