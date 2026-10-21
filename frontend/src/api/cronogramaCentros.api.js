import http from './http';

// Lista (só leitura) da aba Centros de Custos de Cronogramas Obras:
// { etapas: [...], atraso: { regra, meses, sistema, etapaId, cor } | null, centros: [{ sienge_id,
//   name, apelido, status, natureza, valor_geral_vendas, numero_unidades,
//   datas: { etapaId: 'AAAA-MM-DD' }, fins, data_termino, prevision_base_100 }] }
export function listCronogramaCentros(empresaId) {
  return http.get(`/cronograma-centros/${empresaId}`).then((res) => res.data);
}
