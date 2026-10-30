import http from './http';

// Aba Configurações da DRE (por empresa).

// { poc_receita_mascara_id, atualizado_em, atualizado_por, mascaras: [{ id, descricao, totalizadora,
// filhos: [{ id, descricao, realiza_poc, tipo_poc }] }], documentos: [{ documento, nome, lancamentos,
// origens ('P' a pagar, 'R' a receber, 'E' extrato) }], excluidos: ['PCT', …] }.
export function obterConfiguracoesDre(empresaId) {
  return http.get(`/dre-configuracoes/${empresaId}`).then((res) => res.data);
}

// Prévia por obra, até hoje: { ate, mascara: null | { id, descricao }, obras: [{ centro_id, nome,
// orcamento, orcamento_desde, custo_acumulado, custo_desde, poc_receita, poc_despesa, unidades,
// fracao_vendida, fracao_permuta }] } (POCs de 0 a 1).
export function previaPocDre(empresaId) {
  return http.get(`/dre-configuracoes/${empresaId}/previa-poc`).then((res) => res.data);
}

// Máscara DRE Nível 2 da POC de Receita (obrigatória).
export function salvarPocReceitaDre(empresaId, mascaraId) {
  return http.put(`/dre-configuracoes/${empresaId}/poc-receita`, { mascara_id: mascaraId }).then((res) => res.data);
}

// Lista completa dos tipos de documento fora da DRE (a caixa da direita).
export function salvarDocumentosExcluidosDre(empresaId, excluidos) {
  return http.put(`/dre-configuracoes/${empresaId}/documentos`, { excluidos }).then((res) => res.data);
}
