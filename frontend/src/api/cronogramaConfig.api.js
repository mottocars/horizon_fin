import http from './http';

// Aba Configurações de Cronogramas Obras: { atrasoRegra, atrasoMeses, atrasoSistema, comunicarCanal,
// conexaoId, usuarioIds, elegiveis: [{ id, nome, permissao }], opcoesConexao: { WHATSAPP, EMAIL } }.
export function getCronogramaConfig(empresaId) {
  return http.get(`/cronograma-config/${empresaId}`).then((res) => res.data);
}

export function salvarCronogramaConfig(empresaId, dados) {
  return http.put(`/cronograma-config/${empresaId}`, dados).then((res) => res.data);
}
