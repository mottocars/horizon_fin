import http from './http';

// Aba Unidades da DRE: unidades dos empreendimentos (/units do Sienge) cruzadas com os contratos
// de venda (/sales-contracts).

// { centros: [{ id, nome, total_unidades, fracao_ideal, clusters: { vendidas, distratadas,
// permuta, disponiveis } }], ultima_atualizacao: { unidades, contratos } } — só os centros com
// "Realiza DRE".
export function listarUnidadesDre(empresaId) {
  return http.get(`/dre-unidades/${empresaId}`).then((res) => res.data);
}

// Busca as unidades no Sienge (paginado) e substitui o que estava salvo: { total_importado }.
export function sincronizarUnidadesDre(empresaId) {
  return http.post(`/dre-unidades/${empresaId}/sincronizar`).then((res) => res.data);
}

// Mesma sincronização de contratos do Repasses CEF (com as unidades de cada contrato).
export function sincronizarContratosUnidadesDre(empresaId) {
  return http.post(`/dre-unidades/${empresaId}/sincronizar-contratos`).then((res) => res.data);
}

// Andamento: { unidades: { paginaAtual, totalPaginas } | null, contratos: … | null }.
export function statusSincronizacaoUnidadesDre(empresaId) {
  return http.get(`/dre-unidades/${empresaId}/status-sincronizacao`).then((res) => res.data);
}
