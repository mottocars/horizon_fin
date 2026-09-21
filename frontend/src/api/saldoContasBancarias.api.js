import http from './http';

// Opções dos filtros de Empresas (do Sienge) e Banco — sempre a lista completa da empresa.
export function getFiltrosSaldos(empresaId) {
  return http.get(`/saldo-contas-bancarias/${empresaId}/filtros`).then((res) => res.data);
}

const csv = (lista) => (lista && lista.length ? lista.join(',') : undefined);

export function getSaldosContas(empresaId, { dataInicio, dataFim, companyIds, classificacoes, bancos } = {}) {
  return http
    .get(`/saldo-contas-bancarias/${empresaId}`, {
      params: {
        data_inicio: dataInicio,
        data_fim: dataFim,
        company_ids: csv(companyIds),
        classificacoes: csv(classificacoes),
        bancos: csv(bancos),
      },
    })
    .then((res) => res.data);
}

// itens: [{ company_id, numero_conta, data: 'YYYY-MM-DD', saldo: number | null }]
// saldo null apaga o lançamento do dia.
export function salvarSaldosContas(empresaId, itens) {
  return http.put(`/saldo-contas-bancarias/${empresaId}`, { itens }).then((res) => res.data);
}
