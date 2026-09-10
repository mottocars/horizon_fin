import http from './http';

// Lista pessoal do usuário logado: só etapas atribuídas a ele, liberadas
// pra rotina, cuja parcela entrou nelas dentro do intervalo pedido (ver
// rotinas.service.js::listRotinas).
export function listRotinas(empresaId, { dataInicio, dataFim, costCenterIds, usuarioId } = {}) {
  const params = { empresa_id: empresaId, data_inicio: dataInicio, data_fim: dataFim };
  if (costCenterIds?.length > 0) params.cost_center_ids = costCenterIds.join(',');
  if (usuarioId) params.usuario_id = usuarioId;
  return http.get('/rotinas', { params }).then((res) => res.data);
}

// Só desmarca — marcar abre o modal de observação e vai direto pro
// Histórico de Etapas (ver RegistrarComunicacaoModal.jsx e
// reguaCobrancaHistorico.api.js::registrarObservacaoHistoricoRegua).
// Remove QUALQUER registro deste canal (ligação, ou whatsapp/e-mail quando
// a Comunicação Automática está desligada) desta parcela nesta data
// exata, mesmo que tenha sido criado por aquele formulário.
export function desmarcarCanalRotina(empresaId, { billId, installmentId, data, canal }) {
  return http
    .delete('/rotinas/canal', {
      params: { empresa_id: empresaId, bill_id: billId, installment_id: installmentId, data, canal },
    })
    .then((res) => res.data);
}
