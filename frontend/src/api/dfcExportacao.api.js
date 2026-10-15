import http from './http';

// Exportação Excel da aba DFC (backend dfc-exportacao): o .xlsx do que está filtrado — `inicio` /
// `fim` 'AAAA-MM', `centros` ids (vazio = todos). Devolve { blob, nome } (nome do arquivo vindo do
// Content-Disposition).
export function exportarExcelDfc(empresaId, { inicio, fim, centros = [] }) {
  return http
    .get(`/dfc-exportacao/${empresaId}/excel`, {
      params: { inicio, fim, centros: centros.join(',') },
      responseType: 'blob',
    })
    .then((res) => {
      const cabecalho = res.headers['content-disposition'] || '';
      const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecalho);
      const simples = /filename="([^"]+)"/i.exec(cabecalho);
      const nome = utf8 ? decodeURIComponent(utf8[1]) : simples ? simples[1] : 'fluxo-de-caixa.xlsx';
      return { blob: res.data, nome };
    });
}
