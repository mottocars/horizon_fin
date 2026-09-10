import http from './http';

export function login(username, senha) {
  return http.post('/auth/login', { username, senha }).then((res) => res.data);
}

export function refresh(refreshToken) {
  return http.post('/auth/refresh', { refreshToken }).then((res) => res.data);
}

export function fetchMe() {
  return http.get('/me').then((res) => res.data);
}

export function updateMe(data) {
  return http.put('/me', data).then((res) => res.data);
}

export function completarPrimeiroAcesso(data) {
  return http.put('/me/primeiro-acesso', data).then((res) => res.data);
}
