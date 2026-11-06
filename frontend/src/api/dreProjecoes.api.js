import http from './http';

// Aba Projeções da DRE Construtoras (backend: modules/dre-projecoes). Orçamento por centro de custo:
// rascunho do assistente (gravado a cada mudança) → concluído → "Salvar versão".

const base = (empresaId) => `/dre-projecoes/${empresaId}`;
const dados = (res) => res.data;

// { versao, colunas (nível 1 da máscara), orcamentos (da última versão), rascunhos }.
export const listarProjecoesDre = (empresaId) => http.get(base(empresaId)).then(dados);

export const salvarVersaoProjecoesDre = (empresaId) => http.post(`${base(empresaId)}/versoes`).then(dados);

// Novo orçamento (ou o rascunho que já existe do centro, com `existente: true`).
export const criarOrcamentoDre = (empresaId, { centroId, cicloInicio, cicloFim }) =>
  http
    .post(`${base(empresaId)}/orcamentos`, { centro_id: centroId, ciclo_inicio: cicloInicio, ciclo_fim: cicloFim })
    .then(dados);

export const obterOrcamentoDre = (empresaId, id) => http.get(`${base(empresaId)}/orcamentos/${id}`).then(dados);

// `patch`: { etapa, ciclo_inicio, ciclo_fim, trava, dados } — só o que vier.
export const atualizarOrcamentoDre = (empresaId, id, patch) => http.put(`${base(empresaId)}/orcamentos/${id}`, patch).then(dados);

export const descartarOrcamentoDre = (empresaId, id) => http.delete(`${base(empresaId)}/orcamentos/${id}`).then(dados);

// A DRE realizada do centro até o fim do mês `ate` (AAAA-MM; sem ele, a trava gravada ou o mês anterior).
export const historicoOrcamentoDre = (empresaId, id, ate = null) =>
  http.get(`${base(empresaId)}/orcamentos/${id}/historico`, { params: ate ? { ate } : {} }).then(dados);

export const unidadesOrcamentoDre = (empresaId, id) => http.get(`${base(empresaId)}/orcamentos/${id}/unidades`).then(dados);

// `etapa`: 'poc' (custos e demais linhas com POC) ou 'demais'.
export const contasOrcamentoDre = (empresaId, id, etapa) =>
  http.get(`${base(empresaId)}/orcamentos/${id}/contas`, { params: { etapa } }).then(dados);

export const calcularOrcamentoDre = (empresaId, id) => http.get(`${base(empresaId)}/orcamentos/${id}/calculo`).then(dados);

export const concluirOrcamentoDre = (empresaId, id) => http.post(`${base(empresaId)}/orcamentos/${id}/concluir`).then(dados);

// Projetado da aba DRE: por centro, a DRE do orçamento mês a mês (realizado até o corte + projetado) de
// `de` a `ate`. `fonte`: 'atual' (rascunhos + última versão) ou 'versao' (`versao` = número; sem ele, a
// última). -> { fonte, versao, versoes, centros: { id: { origem, status, trava, meses, valores } }, avisos }.
// Só versão salva (dashboards) vai pela rota do demonstrativo, liberada pra quem lê o dashboard.
export const projetadoDre = (empresaId, { fonte = 'atual', versao = null, de, ate, centros = [] }) =>
  fonte === 'versao'
    ? (() => {
        const params = new URLSearchParams({ de, ate });
        if (versao) params.append('versao', versao);
        centros.forEach((c) => params.append('centro', c));
        return http.get(`/dre-demonstrativo/${empresaId}/projetado?${params}`).then(dados);
      })()
    : http
        .get(`${base(empresaId)}/projetado`, {
          params: { fonte, de, ate, ...(centros.length ? { centros: centros.join(',') } : {}) },
        })
        .then(dados);

// Planilha da Projeção: `recorte` = { orcamentoId, etapa } (a etapa do assistente — ex.: Custos da POC);
// sem ele, a planilha da empresa (Ciclos, Vendas e Valores). Layout -> { blob, nome }.
const paramsRecorte = (recorte) => (recorte ? { orcamento: recorte.orcamentoId, etapa: recorte.etapa } : {});

export function baixarLayoutProjecoesDre(empresaId, recorte = null) {
  return http.get(`${base(empresaId)}/layout`, { params: paramsRecorte(recorte), responseType: 'blob' }).then((res) => {
    const cab = res.headers['content-disposition'] || '';
    const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cab);
    return { blob: res.data, nome: utf8 ? decodeURIComponent(utf8[1]) : 'Projeção DRE.xlsx' };
  });
}

// Importa: sem `aplicar`, só a prévia ({ resumo, erros, avisos, centros }); com `aplicar`, grava (e
// `concluir` conclui os orçamentos importados).
export function importarPlanilhaProjecoesDre(empresaId, arquivo, { aplicar = false, concluir = false, recorte = null } = {}) {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  return http
    .post(`${base(empresaId)}/importar`, formData, {
      params: { ...paramsRecorte(recorte), ...(aplicar ? { aplicar: 1 } : {}), ...(concluir ? { concluir: 1 } : {}) },
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then(dados);
}
