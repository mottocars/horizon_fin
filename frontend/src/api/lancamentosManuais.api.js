import http from './http';

// Lançamentos financeiros criados à mão (genérico — hoje a DRE › Financeiro cria): entram como
// movimento, com o status "Criado". Campos: { tipo: 'ENTRADA' | 'SAIDA', data 'AAAA-MM-DD', documento,
// historico, centro_id, natureza_id, valor (> 0; o tipo dá o sinal) }.

// Centros de custo e naturezas (contas analíticas) da empresa: { centros, naturezas: [{ id, nome }] }.
export function opcoesLancamentoManual(empresaId) {
  return http.get(`/lancamentos-manuais/${empresaId}/opcoes`).then((res) => res.data);
}

// O lançamento + usuario (quem criou), travado, log (criou/alterou) e opcoes.
export function obterLancamentoManual(empresaId, id) {
  return http.get(`/lancamentos-manuais/${empresaId}/${id}`).then((res) => res.data);
}

export function criarLancamentoManual(empresaId, dados) {
  return http.post(`/lancamentos-manuais/${empresaId}`, dados).then((res) => res.data);
}

export function alterarLancamentoManual(empresaId, id, dados) {
  return http.put(`/lancamentos-manuais/${empresaId}/${id}`, dados).then((res) => res.data);
}

export function excluirLancamentoManual(empresaId, id) {
  return http.delete(`/lancamentos-manuais/${empresaId}/${id}`).then((res) => res.data);
}
