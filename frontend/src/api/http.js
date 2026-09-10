import axios from 'axios';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('horizon_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function limparSessaoEIrParaLogin() {
  localStorage.removeItem('horizon_token');
  localStorage.removeItem('horizon_refresh_token');
  localStorage.removeItem('horizon_user');
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

let refreshEmAndamento = null;

function renovarToken() {
  if (!refreshEmAndamento) {
    const refreshToken = localStorage.getItem('horizon_refresh_token');
    if (!refreshToken) {
      refreshEmAndamento = Promise.reject(new Error('Sem refresh token.'));
    } else {
      refreshEmAndamento = http
        .post('/auth/refresh', { refreshToken })
        .then((res) => {
          localStorage.setItem('horizon_token', res.data.token);
          return res.data.token;
        });
    }
    refreshEmAndamento.finally(() => {
      refreshEmAndamento = null;
    });
  }
  return refreshEmAndamento;
}

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthEndpoint = config?.url?.includes('/auth/');

    if (response?.status !== 401 || !config || config._retry || isAuthEndpoint) {
      if (response?.status === 401 && isAuthEndpoint) {
        limparSessaoEIrParaLogin();
      }
      return Promise.reject(error);
    }

    config._retry = true;
    try {
      const novoToken = await renovarToken();
      config.headers.Authorization = `Bearer ${novoToken}`;
      return http(config);
    } catch {
      limparSessaoEIrParaLogin();
      return Promise.reject(error);
    }
  }
);

export default http;
