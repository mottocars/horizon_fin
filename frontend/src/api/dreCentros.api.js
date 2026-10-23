import http from './http';

// Mesmo esquema de dfcCentros.api.js, com realiza_dre no lugar de projeta_dfc.

export function listCentrosCustoDre(empresaId) {
  return http.get(`/dre-centros/${empresaId}`).then((res) => res.data);
}

// Contratos de empreendimento do extrato (Portal das Construtoras): [{ contrato, nome }].
export function listContratosCaixaDre(empresaId) {
  return http.get(`/dre-centros/${empresaId}/contratos-caixa`).then((res) => res.data);
}

// Projetos do Prevision (ao vivo da API do Prevision): [{ codigo, nome }].
export function listProjetosPrevisionDre(empresaId) {
  return http.get(`/dre-centros/${empresaId}/projetos-prevision`).then((res) => res.data);
}

export function updateCentroCustoDre(empresaId, siengeId, { natureza, realiza_dre, codigo_contrato_caixa, codigo_prevision }) {
  return http
    .put(`/dre-centros/${empresaId}/${siengeId}`, { natureza, realiza_dre, codigo_contrato_caixa, codigo_prevision })
    .then((res) => res.data);
}
