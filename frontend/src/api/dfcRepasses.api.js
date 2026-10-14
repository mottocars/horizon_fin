import http from './http';

// Unidades do Geral dos Empreendimentos por empreendimento (centro com Contrato Caixa), sem o
// contrato da construtora, com as colunas calculadas — ver backend dfc-repasses.
export function listRepassesDfc(empresaId) {
  return http.get(`/dfc-repasses/${empresaId}`).then((res) => res.data);
}
