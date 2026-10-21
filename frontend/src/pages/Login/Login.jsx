import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import Button from '../../components/Button';

// À direita, em telas largas, a vitrine com os títulos do site (carregada à parte, não pesa no login).
const Vitrine = lazy(() => import('./Vitrine'));

function saudacao() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [senha, setSenha] = useState('');
  const [showSenha, setShowSenha] = useState(false);
  const [lembrarMe, setLembrarMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formErrors, setFormErrors] = useState({});

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const errors = {};
    if (!username.trim()) errors.username = 'Usuário é obrigatório.';
    if (!senha.trim()) errors.senha = 'Senha é obrigatória.';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await login(username.trim(), senha);
      navigate('/', { replace: true });
    } catch (err) {
      if (err.response) {
        setError(err.response.data?.message || 'Usuário ou senha inválidos.');
      } else {
        setError(
          'Não foi possível conectar ao servidor. Verifique se o backend está rodando e acessível.'
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-white lg:p-3">
      <main className="flex w-full flex-col px-6 py-8 sm:px-12 lg:w-[42%] lg:max-w-150 lg:shrink-0 lg:px-14 xl:px-20">
        <img src="/logomarca.svg" alt="Horizon Fin" className="h-9 w-auto self-start" />

        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-sm">
            <h1
              className="font-display text-[2rem] font-bold leading-tight tracking-tight text-gray-900"
              style={{ fontStretch: '110%' }}
            >
              {saudacao()}.
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Entre com seu usuário para acessar o Horizon Finanças.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="login-usuario" className="mb-1 block text-sm font-medium text-gray-700">
                  Usuário
                </label>
                <input
                  id="login-usuario"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full rounded-lg border border-gray-200 h-11 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  placeholder="seu.usuario"
                />
                {formErrors.username && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.username}</p>
                )}
              </div>

              <div>
                <label htmlFor="login-senha" className="mb-1 block text-sm font-medium text-gray-700">
                  Senha
                </label>
                <div className="relative">
                  <input
                    id="login-senha"
                    type={showSenha ? 'text' : 'password'}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-gray-200 h-11 px-3 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenha((prev) => !prev)}
                    aria-label={showSenha ? 'Esconder senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showSenha ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {formErrors.senha && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.senha}</p>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={lembrarMe}
                  onChange={(e) => setLembrarMe(e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-100"
                />
                Lembrar-me
              </label>

              <Button type="submit" loading={loading} className="h-11 w-full">
                Entrar
              </Button>
            </form>
          </div>
        </div>

        <p className="text-xs text-gray-400">© {new Date().getFullYear()} Horizon Finanças</p>
      </main>

      <Suspense fallback={<div className="hidden flex-1 rounded-[28px] bg-[#04203f] lg:block" />}>
        <Vitrine />
      </Suspense>
    </div>
  );
}
