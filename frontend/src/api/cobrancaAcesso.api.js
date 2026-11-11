import http from './http';

// "Usuário Administrador" da Gestão de Cobranças (aba Configurações) — ver
// backend/src/modules/cobranca-acesso.
export function getMeuAcessoCobranca(empresaId) {
  return http.get('/cobranca-acesso/meu-acesso', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function getAdministradoresCobranca(empresaId) {
  return http.get('/cobranca-acesso/administradores', { params: { empresa_id: empresaId } }).then((res) => res.data);
}

export function salvarAdministradoresCobranca(empresaId, usuarioIds) {
  return http
    .put('/cobranca-acesso/administradores', { empresa_id: empresaId, usuario_ids: usuarioIds })
    .then((res) => res.data);
}
