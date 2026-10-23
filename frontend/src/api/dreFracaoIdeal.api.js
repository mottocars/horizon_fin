import http from './http';

// Aba Fração Ideal da DRE: unidades dos empreendimentos (/units do Sienge).

// { unidades: [...], ultima_atualizacao } — só dos centros com "Realiza DRE".
export function listarFracaoIdeal(empresaId) {
  return http.get(`/dre-fracao-ideal/${empresaId}`).then((res) => res.data);
}

// Busca tudo no Sienge (paginado) e substitui o que estava salvo: { total_importado }.
export function sincronizarFracaoIdeal(empresaId) {
  return http.post(`/dre-fracao-ideal/${empresaId}/sincronizar`).then((res) => res.data);
}

// Andamento da sincronização em curso: { sienge: { paginaAtual, totalPaginas } | null }.
export function statusSincronizacaoFracaoIdeal(empresaId) {
  return http.get(`/dre-fracao-ideal/${empresaId}/status-sincronizacao`).then((res) => res.data);
}
