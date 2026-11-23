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

// As unidades da DRE — cada agrupador (uma obra só, com o id do centro principal) e cada centro fora de
// agrupador, só os com Realiza DRE, na ordem da aba — no mesmo formato da lista de centros (sienge_id, name,
// apelido, natureza), pros filtros de centro da DRE e da Projeção. `agrupador`: o nome do agrupador (ou null);
// `centros`: os centros dentro dele.
export function listUnidadesDre(empresaId) {
  return http.get(`/dre-centros/${empresaId}/unidades`).then((res) =>
    res.data.map((u) => ({
      sienge_id: u.id,
      name: u.nome,
      apelido: u.rotulo !== u.nome ? u.rotulo : null,
      natureza: u.natureza,
      realiza_dre: true,
      agrupador: u.agrupador,
      centros: u.centros,
    }))
  );
}

// Agrupadores (um agrupador junta centros numa obra só na DRE).
export function listAgrupadoresDre(empresaId) {
  return http.get(`/dre-centros/${empresaId}/agrupadores`).then((res) => res.data);
}

export function criarAgrupadorDre(empresaId, nome) {
  return http.post(`/dre-centros/${empresaId}/agrupadores`, { nome }).then((res) => res.data);
}

// `patch`: { nome?, realiza_dre? } — o Realiza DRE vale pra todos os centros dele.
export function atualizarAgrupadorDre(empresaId, agrupadorId, patch) {
  return http.put(`/dre-centros/${empresaId}/agrupadores/${agrupadorId}`, patch).then((res) => res.data);
}

export function excluirAgrupadorDre(empresaId, agrupadorId) {
  return http.delete(`/dre-centros/${empresaId}/agrupadores/${agrupadorId}`).then((res) => res.data);
}

// Põe o centro no agrupador (null = tira). Devolve { centros, agrupadores }. Se o centro e o agrupador têm
// projeção, a resposta é 409 com `escolher_projecao` — mandar de novo com `projecaoFica` (o centro cuja projeção fica).
export function moverCentroDre(empresaId, siengeId, agrupadorId, projecaoFica = null) {
  return http
    .put(`/dre-centros/${empresaId}/${siengeId}/agrupador`, { agrupador_id: agrupadorId, projecao_fica: projecaoFica })
    .then((res) => res.data);
}
