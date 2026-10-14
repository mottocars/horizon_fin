import http from './http';

// Orçamento consolidado (última versão salva): { versao: { numero, criado_em, usuario, ... } | null,
// valores: [{ centro_id, sienge_id, mes, valor }], pendencias: { total, inclusoes, alteracoes,
// exclusoes, manuais, integracao, plano }, avisos: [texto] }.
export function getOrcamentoDfc(empresaId) {
  return http.get(`/dfc-orcamento/${empresaId}`).then((res) => res.data);
}

// "Salvar Versão": consolida as fontes de hoje. Devolve { numero, criado_em, valores, inclusoes,
// alteracoes, exclusoes, ... }; 409 quando nada mudou.
export function salvarVersaoOrcamentoDfc(empresaId) {
  return http.post(`/dfc-orcamento/${empresaId}/versoes`).then((res) => res.data);
}

// Log de alterações de um valor: { historico: [...], pendente: {...} | null }.
export function getLogOrcamentoDfc(empresaId, { centroId, siengeId, mes }) {
  return http
    .get(`/dfc-orcamento/${empresaId}/log`, { params: { centro: centroId, conta: siengeId, mes } })
    .then((res) => res.data);
}
