import http from './http';

// `centroId` (opcional) em todas: a versão própria do plano daquele centro de custo; sem ele, o
// plano Global (vale pra todos os centros que não têm versão própria).

// Máscara DFC, Origem da Projeção e "Projeta DFC" das contas que têm algo fora do padrão:
// [{ sienge_id, mascara_id, origem_projecao, projeta_dfc }]. Conta ausente = Projeta DFC marcado.
export function listClassificacoesPlanoDfc(empresaId, centroId = null) {
  return http
    .get(`/dfc-plano-contas/${empresaId}`, { params: centroId ? { centro: centroId } : {} })
    .then((res) => res.data);
}

// `transferir`: a origem CEF já está em outra conta e o usuário confirmou trazer pra esta.
// Devolve também `origem_retirada_de` (a conta de onde a origem saiu, ou null).
export function updateClassificacaoPlanoDfc(
  empresaId,
  siengeId,
  { mascara_id, origem_projecao, projeta_dfc = true },
  { transferir = false, centroId = null } = {}
) {
  return http
    .put(`/dfc-plano-contas/${empresaId}/${siengeId}`, {
      mascara_id,
      origem_projecao,
      projeta_dfc,
      transferir,
      centro: centroId,
    })
    .then((res) => res.data);
}

// Centros com versão própria do plano: [{ centro_id, name, criado_em, criado_por }].
export function listVersoesPlanoDfc(empresaId) {
  return http.get(`/dfc-plano-contas/${empresaId}/versoes`).then((res) => res.data);
}

// Cria o plano próprio do centro. `copiarDe`: 'global' (cópia do Global), 'branco' (sem nada) ou o
// id do centro cujo plano próprio copiar.
export function criarVersaoPlanoDfc(empresaId, centroId, copiarDe) {
  return http
    .post(`/dfc-plano-contas/${empresaId}/versoes`, { centro_id: centroId, copiar_de: copiarDe })
    .then((res) => res.data);
}

// Exclui a versão do centro — ele volta a seguir o Global.
export function excluirVersaoPlanoDfc(empresaId, centroId) {
  return http.delete(`/dfc-plano-contas/${empresaId}/versoes/${centroId}`).then((res) => res.data);
}

// Exportar Excel: o .xlsx espelho da tabela do plano aberto (sem `centroId` = Global). Devolve
// { blob, nome } (nome do arquivo vindo do Content-Disposition).
export function exportarPlanoDfcExcel(empresaId, centroId = null) {
  return http
    .get(`/dfc-plano-contas/${empresaId}/excel`, { params: centroId ? { centro: centroId } : {}, responseType: 'blob' })
    .then((res) => {
      const cabecalho = res.headers['content-disposition'] || '';
      const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(cabecalho);
      return { blob: res.data, nome: utf8 ? decodeURIComponent(utf8[1]) : 'Plano de Contas DFC.xlsx' };
    });
}

// Global + versão de cada centro, pro Orçamento: { global: [...], centros: { [centroId]: [...] } }.
export function listTodasClassificacoesPlanoDfc(empresaId) {
  return http.get(`/dfc-plano-contas/${empresaId}/todas`).then((res) => res.data);
}

// Resumo pros cards da aba Plano Contas: { analiticas, global: { com_mascara, com_origem,
// centros_seguindo, atualizado_em }, versoes: [{ centro_id, name, natureza, criado_em, criado_por,
// com_mascara, com_origem, atualizado_em }] }.
export function resumoPlanosDfc(empresaId) {
  return http.get(`/dfc-plano-contas/${empresaId}/resumo`).then((res) => res.data);
}
