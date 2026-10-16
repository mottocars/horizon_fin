import http from './http';

// Planilha Orçamentária do DFC Construtoras (aba Orçamentos): layout para baixar e importação na
// Nova versão (backend dfc-planilha-orcamentaria).

// Layout (.xlsx travado) -> { blob, nome }.
export function baixarLayoutOrcamento(empresaId) {
  return http.get(`/dfc-planilha-orcamentaria/${empresaId}/layout`, { responseType: 'blob' }).then((res) => {
    const cab = res.headers['content-disposition'] || '';
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cab);
    return { blob: res.data, nome: utf8 ? decodeURIComponent(utf8[1]) : 'Planilha Orçamentária.xlsx' };
  });
}

// Importa o arquivo: sem `aplicar`, só a prévia ({ resumo, erros, mudancas }); com `aplicar`, grava.
export function importarPlanilhaOrcamentaria(empresaId, arquivo, aplicar = false) {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  return http
    .post(`/dfc-planilha-orcamentaria/${empresaId}/importar`, formData, {
      params: aplicar ? { aplicar: 1 } : undefined,
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((res) => res.data);
}

// Última importação (situação da base na janela Nova versão).
export function getSituacaoPlanilhaOrcamentaria(empresaId) {
  return http.get(`/dfc-planilha-orcamentaria/${empresaId}/situacao`).then((res) => res.data);
}
