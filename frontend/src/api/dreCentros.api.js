import http from './http';

// Aba Centros Custos da DRE: os centros de custo da empresa com a flag "Realiza DRE".

export function listCentrosCustoDre(empresaId) {
  return http.get(`/dre-centros/${empresaId}`).then((res) => res.data);
}

// `ordem`: os sienge_id na nova ordem (a lista inteira). Devolve a lista reordenada.
export function reordenarCentrosCustoDre(empresaId, ordem) {
  return http.put(`/dre-centros/${empresaId}/ordem`, { ordem }).then((res) => res.data);
}

// `patch`: { realiza_dre?, natureza? } — só o que vier muda. `natureza` (Tipo: 'OBRA' / 'ADMINISTRATIVO'
// / null) é o mesmo campo da aba Centros Custos da DFC.
export function updateCentroCustoDre(empresaId, siengeId, patch) {
  return http.put(`/dre-centros/${empresaId}/${siengeId}`, patch).then((res) => res.data);
}
