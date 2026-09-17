import http from './http';

// Mesmo formato de `filtros` de cobrancaClusters.api.js, mais `search`
// (nome do cliente), `statusParcela` (filtro "Tipo de Parcela" — em_dia/
// atraso/inadimplente/a_vencer) e `responsavelIds` (filtro "Responsável",
// pelo responsável da etapa atual de cada parcela) do topo da tela — os 3
// níveis do drilldown aceitam esses filtros, então um refaz a matriz
// inteira dinamicamente (mesmo espírito do filtro de cliente da aba
// Clientes).
function paramsFiltros({ costCenterIds, search, statusParcela, responsavelIds } = {}) {
  const params = {};
  if (costCenterIds?.length > 0) params.cost_center_ids = costCenterIds.join(',');
  if (search) params.search = search;
  if (statusParcela?.length > 0) params.status_parcela = statusParcela.join(',');
  if (responsavelIds?.length > 0) params.responsavel_ids = responsavelIds.join(',');
  return params;
}

// Nível 0+1 (Centro de Custo + Cluster, numa chamada só — ver
// GestaoParcelas/GestaoParcelasTab.jsx): cada item já vem com a contagem de
// parcelas dos 5 clusters (incluindo Inadimplência), sem precisar de uma 2ª
// chamada ao expandir.
export function getResumoPorCentroCustoParcelas(empresaId, filtros) {
  return http
    .get('/gestao-parcelas/resumo-centros-custo', { params: { empresa_id: empresaId, ...paramsFiltros(filtros) } })
    .then((res) => res.data);
}

// Nível 2 (versão nova, por Centro de Custo): 1 linha por combinação
// cliente+título (bill_id) daquele centro, já com os valores pago/vencido/a
// vencer e a parcela atual (installment_number, formato "3/12" do próprio
// Sienge) — ver GestaoParcelas/GestaoParcelasTab.jsx.
export function listClientesPorCentroCusto(empresaId, costCenterId, filtros) {
  return http
    .get(`/gestao-parcelas/centros-custo/${costCenterId}/clientes`, {
      params: { empresa_id: empresaId, ...paramsFiltros(filtros) },
    })
    .then((res) => res.data);
}

// Nível 3 (Parcela, folha de verdade — versão nova): as parcelas
// individuais de 1 título (bill_id) dentro do centro de custo aberto, com
// status (em_dia/atraso/inadimplente/null) já calculado — ver
// GestaoParcelas/GestaoParcelasTab.jsx.
export function listParcelasPorTitulo(empresaId, costCenterId, billId, filtros) {
  return http
    .get(`/gestao-parcelas/centros-custo/${costCenterId}/titulos/${billId}/parcelas`, {
      params: { empresa_id: empresaId, ...paramsFiltros(filtros) },
    })
    .then((res) => res.data);
}

// Espelho empilhado do relatório inteiro (1 linha por parcela, com Centro
// de Custo/Cliente/Título/Etapa/Responsável) — mesmos filtros do topo,
// baixado como .xlsx (ver GestaoCobrancasPage.jsx::handleExportarParcelas).
export function exportarGestaoParcelas(empresaId, filtros) {
  return http
    .get('/gestao-parcelas/exportar', {
      params: { empresa_id: empresaId, ...paramsFiltros(filtros) },
      responseType: 'blob',
    })
    .then((res) => res.data);
}

// Nível 2 (antigo, por etapa da régua): quantas parcelas de 1 cluster caem
// em cada etapa da régua de cobrança.
export function getEtapasPorCluster(empresaId, cluster, filtros) {
  return http
    .get(`/gestao-parcelas/${cluster}/etapas`, { params: { empresa_id: empresaId, ...paramsFiltros(filtros) } })
    .then((res) => res.data);
}

// Nível 3: 1 linha por cliente com a quantidade de parcelas dele nesta
// etapa, paginado.
export function listParcelasPorEtapa(empresaId, cluster, etapaId, { page, limit, ...filtros } = {}) {
  return http
    .get(`/gestao-parcelas/${cluster}/etapas/${etapaId}/parcelas`, {
      params: { empresa_id: empresaId, page, limit, ...paramsFiltros(filtros) },
    })
    .then((res) => res.data);
}

// Nível 4 (folha de verdade): as parcelas individuais de 1 cliente nesta
// etapa — cada item é 1 parcela de verdade (bill_id+installment_id), com
// número do documento e vencimento. Usado só quando o cliente tem mais de 1
// parcela ali (ver GestaoParcelasTab.jsx) — com 1 só, pula direto pro
// histórico dela.
export function listParcelasCliente(empresaId, cluster, etapaId, clientId, filtros = {}) {
  return http
    .get(`/gestao-parcelas/${cluster}/etapas/${etapaId}/clientes/${clientId}/parcelas`, {
      params: { empresa_id: empresaId, ...paramsFiltros(filtros) },
    })
    .then((res) => res.data);
}
