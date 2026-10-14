import http from './http';

// Máscara DFC e Origem da Projeção já escolhidas nas contas: [{ sienge_id, mascara_id, origem_projecao }].
export function listClassificacoesPlanoDfc(empresaId) {
  return http.get(`/dfc-plano-contas/${empresaId}`).then((res) => res.data);
}

// `transferir`: a origem CEF já está em outra conta e o usuário confirmou trazer pra esta.
// Devolve também `origem_retirada_de` (a conta de onde a origem saiu, ou null).
export function updateClassificacaoPlanoDfc(empresaId, siengeId, { mascara_id, origem_projecao }, { transferir = false } = {}) {
  return http
    .put(`/dfc-plano-contas/${empresaId}/${siengeId}`, { mascara_id, origem_projecao, transferir })
    .then((res) => res.data);
}
