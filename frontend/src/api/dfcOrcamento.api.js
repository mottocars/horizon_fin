import http from './http';

// Uma versão salva (`numero`; sem ele, a última): { versoes: [{ numero, criado_em, usuario, valores,
// inclusoes, alteracoes, exclusoes }], versao: {...} | null, valores: [{ centro_id, sienge_id, mes, valor }] }.
export function getOrcamentoDfc(empresaId, numero = null) {
  return http.get(`/dfc-orcamento/${empresaId}`, { params: numero ? { versao: numero } : {} }).then((res) => res.data);
}

// "Nova versão": valores de hoje das bases (o que "Salvar Versão" vai gravar) — { gerado_em,
// versao_base, periodos, a_partir_de, valores, valores_versao (os da última versão), pendencias, avisos }.
// `periodos`: 'todos' | 'atual_em_diante' (meses antes de `a_partir_de` ficam com a última versão).
export function getRascunhoOrcamentoDfc(empresaId, { periodos = 'todos' } = {}) {
  return http.get(`/dfc-orcamento/${empresaId}/rascunho`, { params: { periodos } }).then((res) => res.data);
}

// "Salvar Versão": consolida as fontes de hoje. Devolve { numero, criado_em, valores, inclusoes,
// alteracoes, exclusoes, ... }; 409 quando nada mudou.
export function salvarVersaoOrcamentoDfc(empresaId, { periodos = 'todos' } = {}) {
  return http.post(`/dfc-orcamento/${empresaId}/versoes`, { periodos }).then((res) => res.data);
}

// Log de alterações de um valor: { historico: [...], pendente: {...} | null }.
export function getLogOrcamentoDfc(empresaId, { centroId, siengeId, mes }) {
  return http
    .get(`/dfc-orcamento/${empresaId}/log`, { params: { centro: centroId, conta: siengeId, mes } })
    .then((res) => res.data);
}
