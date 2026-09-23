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

// Dia liberado pra lançar saldo (o cadeado da tela) — { data: 'YYYY-MM-DD' } ou
// { data: null } se nenhum período estiver aberto (cadeado trancado).
export function getPeriodoAberto(empresaId) {
  return http.get(`/saldo-contas-bancarias/${empresaId}/periodo-aberto`).then((res) => res.data);
}

// Abre (ou reabre, com `reabrirEncerrado: true`) um período. Se o dia já tiver sido
// encerrado antes e `reabrirEncerrado` não vier true, o servidor recusa com
// `err.response.data.code === 'PERIODO_ENCERRADO'` — é o sinal pra tela perguntar antes.
export function abrirPeriodoSaldos(empresaId, data, reabrirEncerrado = false) {
  return http.put(`/saldo-contas-bancarias/${empresaId}/periodo-aberto`, { data, reabrirEncerrado }).then((res) => res.data);
}

// Encerra o período aberto desta empresa (se houver) — o cadeado volta a ficar trancado.
export function encerrarPeriodoSaldos(empresaId) {
  return http.delete(`/saldo-contas-bancarias/${empresaId}/periodo-aberto`).then((res) => res.data);
}

// Roda todos os convênios VanPix ativos da empresa pra `data`, casa com as contas já
// cadastradas (banco+conta+dígito) e grava o saldo automaticamente. Devolve um relatório:
// { convenios: [{apelido, status, mensagem}], atualizados: [{...,saldo}], semCorrespondencia: [...] }.
export function buscarSaldosVanpix(empresaId, data) {
  return http.post(`/saldo-contas-bancarias/${empresaId}/buscar-vanpix`, { data }).then((res) => res.data);
}
