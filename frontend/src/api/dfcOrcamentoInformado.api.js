import http from './http';

// Valores informados à mão no Orçamento (contas com Origem Projeção "HORIZON - INFORMADO"):
// [{ centro_id, sienge_id, mes: 'AAAA-MM', valor }].
export function listOrcamentoInformadoDfc(empresaId) {
  return http.get(`/dfc-orcamento-informado/${empresaId}`).then((res) => res.data);
}

// Grava o valor de um mês; `valor` null (ou 0) apaga.
export function salvarOrcamentoInformadoDfc(empresaId, { centroId, siengeId, mes, valor }) {
  return http
    .put(`/dfc-orcamento-informado/${empresaId}`, { centro_id: centroId, sienge_id: siengeId, mes, valor })
    .then((res) => res.data);
}

// "Replicar valor até": grava `valor` de `de` até `ate` ('AAAA-MM', inclusive). Devolve { meses }.
export function replicarOrcamentoInformadoDfc(empresaId, { centroId, siengeId, de, ate, valor }) {
  return http
    .post(`/dfc-orcamento-informado/${empresaId}/replicar`, { centro_id: centroId, sienge_id: siengeId, de, ate, valor })
    .then((res) => res.data);
}
