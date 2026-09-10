import { createContext, useContext, useState, useCallback } from 'react';
import { login as loginApi } from '../api/auth.api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('horizon_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('horizon_token'));

  const login = useCallback(async (username, senha) => {
    const result = await loginApi(username, senha);
    localStorage.setItem('horizon_token', result.token);
    localStorage.setItem('horizon_refresh_token', result.refreshToken);
    localStorage.setItem('horizon_user', JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
    return result;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('horizon_token');
    localStorage.removeItem('horizon_refresh_token');
    localStorage.removeItem('horizon_user');
    setToken(null);
    setUser(null);
  }, []);

  // Usado após salvar "Meu perfil" — atualiza o usuário em memória e no
  // localStorage sem precisar de um novo login (nome/foto na Topbar, etc.).
  const updateUser = useCallback((dadosAtualizados) => {
    setUser((prev) => {
      const proximo = { ...prev, ...dadosAtualizados };
      localStorage.setItem('horizon_user', JSON.stringify(proximo));
      return proximo;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, login, logout, updateUser, isAuthenticated: Boolean(token) }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
