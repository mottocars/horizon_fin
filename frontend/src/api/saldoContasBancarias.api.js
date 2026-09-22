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
// saldo null apaga o lançamento do dia. `hoje` é o "hoje" do NAVEGADOR (ver hojeISO() em
// constantes.js) — o servidor só usa isso quando a empresa ainda não tem período aberto salvo.
export function salvarSaldosContas(empresaId, itens, hoje) {
  return http.put(`/saldo-contas-bancarias/${empresaId}`, { itens, hoje }).then((res) => res.data);
}

// Dia liberado pra lançar saldo (o cadeado da tela). `hoje` (do navegador) é o valor que
// volta quando a empresa ainda não tem nenhum período aberto salvo.
export function getPeriodoAberto(empresaId, hoje) {
  return http.get(`/saldo-contas-bancarias/${empresaId}/periodo-aberto`, { params: { hoje } }).then((res) => res.data);
}

export function abrirPeriodoSaldos(empresaId, data) {
  return http.put(`/saldo-contas-bancarias/${empresaId}/periodo-aberto`, { data }).then((res) => res.data);
}
