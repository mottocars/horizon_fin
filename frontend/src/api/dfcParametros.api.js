import http from './http';

// Empreendimentos (centros de custo ativos) da empresa, pro filtro "Centro de Custo" da DFC.
export function listCentrosDfc(empresaId) {
  return http.get(`/dfc-parametros/${empresaId}/centros`).then((res) => res.data);
}

export function listVersoesParametrosDfc(empresaId, siengeId) {
  return http.get(`/dfc-parametros/${empresaId}/centros/${siengeId}/versoes`).then((res) => res.data);
}

export function getVersaoParametrosDfc(empresaId, siengeId, versao) {
  return http.get(`/dfc-parametros/${empresaId}/centros/${siengeId}/versoes/${versao}`).then((res) => res.data);
}

export function salvarVersaoParametrosDfc(empresaId, siengeId, dados) {
  return http.post(`/dfc-parametros/${empresaId}/centros/${siengeId}/versoes`, dados).then((res) => res.data);
}
