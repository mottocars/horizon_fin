import http from './http';

// Cadastros › Contas Pagar / Receber. Título: { tipo 'PAGAR'|'RECEBER', tipo_documento 'FINANCEIRO'|
// 'PROJECAO_PLS_CEF', pessoa_id, documento, data_emissao, historico, valor, parcelas: [{ vencimento, valor }],
// rateios: [{ centro_id, natureza_id, valor }] }.

// { centros, naturezas, fornecedores, clientes } da empresa.
export function opcoesContasPagarReceber(empresaId) {
  return http.get(`/contas-pagar-receber/${empresaId}/opcoes`).then((res) => res.data);
}

// Parcelas com vencimento entre `inicio` e `fim` ('AAAA-MM-DD'), uma linha por parcela.
export function listarTitulos(empresaId, inicio, fim) {
  return http.get(`/contas-pagar-receber/${empresaId}/titulos`, { params: { inicio, fim } }).then((res) => res.data);
}

export function obterTitulo(empresaId, id) {
  return http.get(`/contas-pagar-receber/${empresaId}/titulos/${id}`).then((res) => res.data);
}

export function criarTitulo(empresaId, dados) {
  return http.post(`/contas-pagar-receber/${empresaId}/titulos`, dados).then((res) => res.data);
}

export function alterarTitulo(empresaId, id, dados) {
  return http.put(`/contas-pagar-receber/${empresaId}/titulos/${id}`, dados).then((res) => res.data);
}

export function excluirTitulo(empresaId, id) {
  return http.delete(`/contas-pagar-receber/${empresaId}/titulos/${id}`).then((res) => res.data);
}

// Baixa de uma parcela: { data_baixa, valor_baixa }.
export function baixarParcela(empresaId, parcelaId, dados) {
  return http.post(`/contas-pagar-receber/${empresaId}/parcelas/${parcelaId}/baixa`, dados).then((res) => res.data);
}

// Projeção PLS CEF › Avanços: curva diária do Prevision do centro de custo
// { centro_id, centro_nome, tem_prevision, pontos: [{ data 'AAAA-MM-DD', previsto % acumulado }] }.
export function avancoPrevisto(empresaId, centroId) {
  return http.get(`/contas-pagar-receber/${empresaId}/avanco-previsto/${centroId}`).then((res) => res.data);
}

// Projeção PLS CEF › Documentos: último DCD e último Geral dos Empreendimentos do contrato Caixa do centro
// { centro_id, centro_nome, contrato, dcd: {...} | null, geral: {...} | null }.
export function documentosPls(empresaId, centroId) {
  return http.get(`/contas-pagar-receber/${empresaId}/documentos-pls/${centroId}`).then((res) => res.data);
}

// tipo 'dcd' | 'geral', formato 'original' | 'excel' → { blob, nome } (nome do Content-Disposition).
export function baixarDocumentoPls(empresaId, centroId, tipo, formato) {
  return http
    .get(`/contas-pagar-receber/${empresaId}/documentos-pls/${centroId}/${tipo}/${formato}`, { responseType: 'blob' })
    .then((res) => {
      const cd = res.headers['content-disposition'] || '';
      const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(cd);
      return { blob: res.data, nome: m ? decodeURIComponent(m[1] || m[2]) : null };
    });
}

// Projeção PLS CEF › Cabeçalho: última liberação, avanço liberado, crédito PJ liberado, envios do DCD/Geral,
// Parâmetros da obra e unidades do Geral (registradas / a registrar até a data).
export function cabecalhoPls(empresaId, centroId, data) {
  return http
    .get(`/contas-pagar-receber/${empresaId}/cabecalho-pls/${centroId}`, { params: data ? { data } : {} })
    .then((res) => res.data);
}

export function estornarBaixa(empresaId, parcelaId) {
  return http.delete(`/contas-pagar-receber/${empresaId}/parcelas/${parcelaId}/baixa`).then((res) => res.data);
}
