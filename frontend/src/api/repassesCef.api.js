import http from './http';

export function listCentrosRepassesCef(empresaId) {
  return http.get(`/repasses-cef/${empresaId}/centros`).then((res) => res.data);
}

export function sincronizarReservasRepassesCef(empresaId) {
  return http.post(`/repasses-cef/${empresaId}/sincronizar-reservas`).then((res) => res.data);
}

export function listReservasRepassesCef(empresaId, centroCustoIds = []) {
  const params = {};
  if (centroCustoIds.length > 0) params.centro_custo_ids = centroCustoIds.join(',');
  return http.get(`/repasses-cef/${empresaId}/reservas`, { params }).then((res) => res.data);
}

export function listOpcoesFiltroReservaRepassesCef(empresaId) {
  return http.get(`/repasses-cef/${empresaId}/filtros-reserva/opcoes`).then((res) => res.data);
}

export function getFiltrosReservaRepassesCef(empresaId) {
  return http.get(`/repasses-cef/${empresaId}/filtros-reserva`).then((res) => res.data);
}

export function salvarFiltrosReservaRepassesCef(empresaId, filtros) {
  return http.put(`/repasses-cef/${empresaId}/filtros-reserva`, filtros).then((res) => res.data);
}

export function getCoresReservaRepassesCef(empresaId) {
  return http.get(`/repasses-cef/${empresaId}/cores-reserva`).then((res) => res.data);
}

export function salvarCoresReservaRepassesCef(empresaId, cores) {
  return http.put(`/repasses-cef/${empresaId}/cores-reserva`, cores).then((res) => res.data);
}

export function sincronizarContratosRepassesCef(empresaId) {
  return http.post(`/repasses-cef/${empresaId}/sincronizar-contratos`).then((res) => res.data);
}

export function listContratosRepassesCef(empresaId, centroCustoIds = []) {
  const params = {};
  if (centroCustoIds.length > 0) params.centro_custo_ids = centroCustoIds.join(',');
  return http.get(`/repasses-cef/${empresaId}/contratos`, { params }).then((res) => res.data);
}

export function listAssinaturasRepassesCef(empresaId, centroCustoIds = []) {
  const params = {};
  if (centroCustoIds.length > 0) params.centro_custo_ids = centroCustoIds.join(',');
  return http.get(`/repasses-cef/${empresaId}/assinaturas`, { params }).then((res) => res.data);
}

export function listRegistrosRepassesCef(empresaId, centroCustoIds = []) {
  const params = {};
  if (centroCustoIds.length > 0) params.centro_custo_ids = centroCustoIds.join(',');
  return http.get(`/repasses-cef/${empresaId}/registros`, { params }).then((res) => res.data);
}

export function getStatusSincronizacaoRepassesCef(empresaId) {
  return http.get(`/repasses-cef/${empresaId}/status-sincronizacao`).then((res) => res.data);
}

export function getUltimasAtualizacoesRepassesCef(empresaId, centroCustoIds = []) {
  const params = {};
  if (centroCustoIds.length > 0) params.centro_custo_ids = centroCustoIds.join(',');
  return http.get(`/repasses-cef/${empresaId}/ultimas-atualizacoes`, { params }).then((res) => res.data);
}

export function exportarRepassesCefExcel(empresaId, centroCustoIds = []) {
  const params = {};
  if (centroCustoIds.length > 0) params.centro_custo_ids = centroCustoIds.join(',');
  return http
    .get(`/repasses-cef/${empresaId}/exportar`, { params, responseType: 'blob' })
    .then((res) => res.data);
}

export function atualizarNumeroInstituicaoFinanceiraRepassesCef(empresaId, siengeContractId, numero) {
  return http
    .patch(`/repasses-cef/${empresaId}/contratos/${siengeContractId}/numero-instituicao-financeira`, {
      financial_institution_number: numero,
    })
    .then((res) => res.data);
}

export function getHistoricoEtapasRepassesCef(empresaId, identificador) {
  const params = {};
  if (identificador.idreserva) params.idreserva = identificador.idreserva;
  if (identificador.siengeContractId) params.sienge_contract_id = identificador.siengeContractId;
  if (identificador.extratoUnidadeId) params.extrato_unidade_id = identificador.extratoUnidadeId;
  return http.get(`/repasses-cef/${empresaId}/historico`, { params }).then((res) => res.data);
}

export function listUnidadesDisponiveisRepassesCef(empresaId, siengeContractId) {
  return http
    .get(`/repasses-cef/${empresaId}/contratos/${siengeContractId}/unidades-disponiveis`)
    .then((res) => res.data);
}

export function registrarMovimentacaoMicroEtapaRepassesCef(empresaId, dados) {
  const formData = new FormData();
  formData.append('idreserva', dados.idreserva);
  formData.append('macro_etapa', dados.macroEtapa);
  formData.append('mascara_item_id', dados.mascaraItemId);
  formData.append('data_movimentacao', dados.dataMovimentacao);
  if (dados.descricao) formData.append('descricao', dados.descricao);
  for (const arquivo of dados.arquivos || []) {
    formData.append('arquivos', arquivo);
  }
  return http
    .post(`/repasses-cef/${empresaId}/historico-microetapas`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
}

export function baixarAnexoMicroEtapaRepassesCef(empresaId, anexoId) {
  return http
    .get(`/repasses-cef/${empresaId}/historico-microetapas/anexos/${anexoId}/download`, {
      responseType: 'blob',
    })
    .then((res) => res.data);
}
