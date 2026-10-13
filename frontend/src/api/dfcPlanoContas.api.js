import http from './http';

// Máscara DFC e Origem da Projeção já escolhidas nas contas: [{ sienge_id, mascara_id, origem_projecao }].
export function listClassificacoesPlanoDfc(empresaId) {
  return http.get(`/dfc-plano-contas/${empresaId}`).then((res) => res.data);
}

export function updateClassificacaoPlanoDfc(empresaId, siengeId, { mascara_id, origem_projecao }) {
  return http
    .put(`/dfc-plano-contas/${empresaId}/${siengeId}`, { mascara_id, origem_projecao })
    .then((res) => res.data);
}
