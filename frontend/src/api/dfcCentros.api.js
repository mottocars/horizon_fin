import http from './http';

export function listCentrosCustoDfc(empresaId) {
  return http.get(`/dfc-centros/${empresaId}`).then((res) => res.data);
}

// Contratos de empreendimento do extrato (Portal das Construtoras): [{ contrato, nome }].
export function listContratosCaixaDfc(empresaId) {
  return http.get(`/dfc-centros/${empresaId}/contratos-caixa`).then((res) => res.data);
}

// Projetos do Prevision (ao vivo da API do Prevision): [{ codigo, nome }].
export function listProjetosPrevisionDfc(empresaId) {
  return http.get(`/dfc-centros/${empresaId}/projetos-prevision`).then((res) => res.data);
}

export function updateCentroCustoDfc(empresaId, siengeId, { natureza, codigo_contrato_caixa, codigo_prevision }) {
  return http
    .put(`/dfc-centros/${empresaId}/${siengeId}`, { natureza, codigo_contrato_caixa, codigo_prevision })
    .then((res) => res.data);
}
