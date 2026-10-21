import http from './http';

// Lista (só leitura) da aba Centros de Custos de Cronogramas Obras:
// { etapas: [...], atraso: { regra, meses, sistema, etapaId, cor } | null, centros: [{ sienge_id,
//   name, apelido, status, natureza, valor_geral_vendas, numero_unidades,
//   datas: { etapaId: 'AAAA-MM-DD' }, fins, data_termino, prevision_base_100 }] }
export function listCronogramaCentros(empresaId) {
  return http.get(`/cronograma-centros/${empresaId}`).then((res) => res.data);
}

// Versionamento do cronograma (backend: cronograma-centros/cronogramaVersoes.service.js). Salvar as
// datas das etapas de uma obra só deixa a alteração pendente; ela entra no cronograma quando uma nova
// versão é gravada — e aí sai o comunicado de WhatsApp com a planilha e o link do dashboard.
// { alteracoes: [{ sienge_id, nome, atualizado_por, atualizado_em, etapas: [{ etapa_id, etapa, ultima,
//   inicio_antes, inicio_depois, fim_antes, fim_depois }] }], proximaVersao,
//   comunicado: { conexao, destinatarios: [{ nome, semTelefone }], previa, nomeArquivo } }
export function listPendenciasCronograma(empresaId) {
  return http.get(`/cronograma-centros/${empresaId}/pendencias`).then((res) => res.data);
}

export function descartarPendenciaCronograma(empresaId, siengeId) {
  return http.delete(`/cronograma-centros/${empresaId}/pendencias/${siengeId}`);
}

// [{ id, numero, observacao, alteracoes, comunicado: { status, enviados, falhas }, criado_em, criado_por_nome }]
export function listVersoesCronograma(empresaId) {
  return http.get(`/cronograma-centros/${empresaId}/versoes`).then((res) => res.data);
}

// Aplica as pendências e manda o comunicado; devolve a versão com o resultado do envio.
export function gravarVersaoCronograma(empresaId, { observacao } = {}) {
  return http.post(`/cronograma-centros/${empresaId}/versoes`, { observacao: observacao || null }).then((res) => res.data);
}

export function baixarPlanilhaVersaoCronograma(empresaId, versaoId) {
  return http.get(`/cronograma-centros/${empresaId}/versoes/${versaoId}/excel`, { responseType: 'blob' }).then((res) => res.data);
}

// Uma versão com o retrato do cronograma (filtro "Mudanças da versão" do Gantt).
export function getVersaoCronograma(empresaId, versaoId) {
  return http.get(`/cronograma-centros/${empresaId}/versoes/${versaoId}`).then((res) => res.data);
}

// Botão de exportar do dashboard: a planilha do cronograma em vigor (sem `versaoId`) ou a de uma
// versão — a mesma do comunicado. Devolve { blob, nome } (nome vindo do Content-Disposition).
export function exportarCronogramaExcel(empresaId, versaoId = null) {
  const url = versaoId ? `/cronograma-centros/${empresaId}/versoes/${versaoId}/excel` : `/cronograma-centros/${empresaId}/excel`;
  return http.get(url, { responseType: 'blob' }).then((res) => {
    const cabecalho = res.headers['content-disposition'] || '';
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecalho);
    return { blob: res.data, nome: utf8 ? decodeURIComponent(utf8[1]) : 'Cronograma de Obras.xlsx' };
  });
}
