import http from './http';

export function listVersoesMotorRisco(empresaId) {
  return http.get('/motor-risco/versoes', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function getVersaoMotorRisco(empresaId, versao) {
  return http.get(`/motor-risco/versoes/${versao}`, { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function salvarVersaoMotorRisco(dados) {
  return http.post('/motor-risco/versoes', dados).then((res) => res.data);
}
