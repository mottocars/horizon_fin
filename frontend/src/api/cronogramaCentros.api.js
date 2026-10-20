import http from './http';

// { etapas: [...], centros: [{ sienge_id, name, apelido, status, natureza, datas: { etapaId: 'AAAA-MM-DD' }, data_termino }] }
export function listCronogramaCentros(empresaId) {
  return http.get(`/cronograma-centros/${empresaId}`).then((res) => res.data);
}

// Tipo do centro (OBRA | ADMINISTRATIVO | null) — mesma coluna da DFC e do cadastro.
export function updateNaturezaCronogramaCentro(empresaId, siengeId, natureza) {
  return http.put(`/cronograma-centros/${empresaId}/${siengeId}/natureza`, { natureza }).then((res) => res.data);
}

// datas: [{ etapa_id, data | null }] só das que mudaram; dataTermino: undefined = não mexe.
// Devolve { sienge_id, datas, data_termino } como ficou.
export function updateDatasCronogramaCentro(empresaId, siengeId, { datas = [], dataTermino } = {}) {
  return http
    .put(`/cronograma-centros/${empresaId}/${siengeId}/datas`, { datas, data_termino: dataTermino })
    .then((res) => res.data);
}
