import http from './http';

// Exportação de auditoria da DRE (backend dre-exportacao): o .xlsx com a DRE recalculada em fórmulas, a
// memória de cálculo, as POCs e as bases do que está filtrado na aba DRE — `de` / `ate` 'AAAA-MM-DD',
// `centros` ids (vazio = todos com "Realiza DRE"). `projecao`: { fonte: 'versao', versao } (número; sem
// ele, a última salva) ou { fonte: 'atual' } (rascunhos + última versão, só no Operações) — a projeção
// que entra no Excel (colunas Projetado / Desvio % e as abas da projeção). Devolve { blob, nome }.
export function exportarExcelDre(empresaId, { de, ate, centros = [], projecao = { fonte: 'versao' } }) {
  return http
    .get(`/dre-exportacao/${empresaId}/excel`, {
      params: {
        de,
        ate,
        centros: centros.join(','),
        projecao: projecao.fonte === 'atual' ? 'atual' : 'versao',
        ...(projecao.fonte !== 'atual' && projecao.versao ? { versao: projecao.versao } : {}),
      },
      responseType: 'blob',
    })
    .then((res) => {
      const cabecalho = res.headers['content-disposition'] || '';
      const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecalho);
      const simples = /filename="([^"]+)"/i.exec(cabecalho);
      const nome = utf8 ? decodeURIComponent(utf8[1]) : simples ? simples[1] : 'dre-auditoria.xlsx';
      return { blob: res.data, nome };
    });
}
