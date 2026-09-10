import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const ROTA_PRIMEIRO_ACESSO = '/primeiro-acesso';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Primeiro acesso é uma etapa obrigatória antes de qualquer outra tela do
  // sistema — ninguém navega pra fora dela (nem digitando a URL na mão)
  // enquanto não confirmar e-mail/celular, trocar a senha e enviar a foto.
  if (user?.primeiro_acesso && location.pathname !== ROTA_PRIMEIRO_ACESSO) {
    return <Navigate to={ROTA_PRIMEIRO_ACESSO} replace />;
  }
  // E o caminho inverso: quem já completou não tem motivo pra voltar lá.
  if (!user?.primeiro_acesso && location.pathname === ROTA_PRIMEIRO_ACESSO) {
    return <Navigate to="/" replace />;
  }

  return children;
}
