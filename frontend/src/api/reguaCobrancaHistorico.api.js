import http from './http';

// Histórico de 1 parcela específica (bill_id+installment_id) — nunca do
// cliente inteiro (ver historicoCliente.service.js::getHistoricoParcela).
export function getHistoricoParcelaRegua(empresaId, billId, installmentId) {
  return http
    .get(`/regua-cobranca-historico/parcelas/${billId}/${installmentId}`, { params: { empresa_id: empresaId } })
    .then((res) => res.data);
}

// Sem seleção de etapa: o backend acha sozinho, pela data, em qual etapa
// esta parcela estava (ver historicoCliente.service.js::registrarObservacao).
// `canal` é opcional — só a Rotina do dia usa isso (canal='ligacao', ver
// RegistrarLigacaoModal.jsx), o formulário do Histórico de Etapas em si
// nunca manda esse campo.
export function registrarObservacaoHistoricoRegua(empresaId, dados) {
  const formData = new FormData();
  formData.append('bill_id', dados.billId);
  formData.append('installment_id', dados.installmentId);
  formData.append('data_registro', dados.dataRegistro);
  if (dados.descricao) formData.append('descricao', dados.descricao);
  if (dados.canal) formData.append('canal', dados.canal);
  for (const arquivo of dados.arquivos || []) {
    formData.append('arquivos', arquivo);
  }
  return http
    .post('/regua-cobranca-historico/registros', formData, {
      params: { empresa_id: empresaId },
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
}

export function baixarAnexoHistoricoRegua(empresaId, anexoId) {
  return http
    .get(`/regua-cobranca-historico/anexos/${anexoId}/download`, {
      params: { empresa_id: empresaId },
      responseType: 'blob',
    })
    .then((res) => res.data);
}
