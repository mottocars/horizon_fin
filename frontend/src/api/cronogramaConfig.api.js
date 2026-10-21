import http from './http';

// Aba Configurações de Cronogramas Obras: { atrasoRegra, atrasoMeses, atrasoSistema, atrasoCor, zapiIntegracaoId,
// selecionados: [usuarioId], elegiveis: [{ id, nome, permissao }], opcoesZapi: [{ id, nome }] }.
// Salvar manda { atrasoRegra, atrasoMeses, atrasoSistema, atrasoCor, zapiIntegracaoId, usuarioIds }.
export function getCronogramaConfig(empresaId) {
  return http.get(`/cronograma-config/${empresaId}`).then((res) => res.data);
}

export function salvarCronogramaConfig(empresaId, dados) {
  return http.put(`/cronograma-config/${empresaId}`, dados).then((res) => res.data);
}
