import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, User as UserIcon, Camera } from 'lucide-react';
import Button from '../../components/Button';
import { fetchMe, completarPrimeiroAcesso } from '../../api/auth.api';
import { useAuth } from '../../auth/AuthContext';
import { redimensionarImagem } from '../../utils/imagemPerfil';
import { formatDdd, formatCelular } from '../Usuarios/format';

const emptyForm = {
  email: '',
  telefone_ddd: '',
  telefone_numero: '',
  senha: '',
  confirmarSenha: '',
  avatar_url: '',
};

// Mesma classe de input da tela de Login, pra manter os componentes
// idênticos entre as duas telas. Sem largura fixa aqui de propósito — o
// campo de celular usa w-16/flex-1 em vez de w-full nos dois inputs.
const inputClass =
  'rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100';

function Campo({ label, error, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function PrimeiroAcesso() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [avatarError, setAvatarError] = useState('');
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetchMe()
      .then((data) => {
        if (!active) return;
        // E-mail e celular vêm pré-preenchidos com o que o admin cadastrou —
        // o usuário só precisa conferir e corrigir se estiver errado.
        setForm((prev) => ({
          ...prev,
          email: data.email || '',
          telefone_ddd: data.telefone_ddd || '',
          telefone_numero: data.telefone_numero || '',
        }));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleFotoSelecionada(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setAvatarError('');
    if (!file.type.startsWith('image/')) {
      setAvatarError('Selecione um arquivo de imagem.');
      return;
    }

    setProcessandoFoto(true);
    try {
      const dataUrl = await redimensionarImagem(file);
      handleChange('avatar_url', dataUrl);
    } catch {
      setAvatarError('Não foi possível processar essa imagem.');
    } finally {
      setProcessandoFoto(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const errors = {};
    if (!form.avatar_url) errors.avatar_url = 'Envie uma foto de perfil.';

    if (!form.email.trim()) errors.email = 'E-mail é obrigatório.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Informe um e-mail válido.';

    if (form.telefone_ddd.length < 2) errors.telefone_ddd = 'DDD inválido.';
    if (!form.telefone_numero.trim()) errors.telefone_numero = 'Informe seu celular.';

    if (!form.senha.trim()) errors.senha = 'Informe uma nova senha.';
    else if (form.senha.trim().length < 6) errors.senha = 'A senha deve ter pelo menos 6 caracteres.';
    if (!form.confirmarSenha.trim()) errors.confirmarSenha = 'Confirme sua nova senha.';
    else if (form.senha.trim() !== form.confirmarSenha.trim()) {
      errors.confirmarSenha = 'A confirmação de senha não confere.';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        email: form.email.trim(),
        telefone_ddd: form.telefone_ddd,
        telefone_numero: form.telefone_numero,
        senha: form.senha.trim(),
        confirmarSenha: form.confirmarSenha.trim(),
        avatar_url: form.avatar_url,
      };
      const atualizado = await completarPrimeiroAcesso(payload);
      updateUser(atualizado);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível concluir seu primeiro acesso.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-100">
        <p className="text-sm text-gray-400">Carregando...</p>
      </div>
    );
  }

  const primeiroNome = (user?.nome || '').trim().split(' ')[0];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-100 px-4">
      <div className="w-full max-w-sm rounded-card bg-white p-8 shadow-card">
        <div className="mb-6 text-center">
          <img src="/logomarca.svg" alt="Horizon Fin" className="mx-auto h-10 w-auto" />
          <h1 className="mt-4 text-lg font-semibold text-gray-900">
            Bem-vindo{primeiroNome ? `, ${primeiroNome}` : ''}!
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}

          <div className="flex flex-col items-center gap-1.5">
            <div className="relative shrink-0">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-primary-600">
                {form.avatar_url ? (
                  <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserIcon size={26} />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={processandoFoto}
                title="Escolher foto"
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-primary-600 text-white shadow hover:bg-primary-700 disabled:opacity-60"
              >
                <Camera size={12} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFotoSelecionada}
                className="hidden"
              />
            </div>
            <p className="text-xs text-gray-500">
              {processandoFoto ? 'Processando imagem...' : 'Foto do perfil'}
            </p>
            {fieldErrors.avatar_url && <p className="text-xs text-red-600">{fieldErrors.avatar_url}</p>}
            {avatarError && <p className="text-xs text-red-600">{avatarError}</p>}
          </div>

          <Campo label="E-mail" error={fieldErrors.email}>
            <input
              type="email"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              autoComplete="off"
              className={`w-full ${inputClass}`}
            />
          </Campo>

          <Campo label="Celular" error={fieldErrors.telefone_ddd || fieldErrors.telefone_numero}>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.telefone_ddd}
                onChange={(e) => handleChange('telefone_ddd', formatDdd(e.target.value))}
                placeholder="DDD"
                maxLength={3}
                className={`w-16 text-center ${inputClass}`}
              />
              <input
                type="text"
                value={formatCelular(form.telefone_numero)}
                onChange={(e) => handleChange('telefone_numero', formatCelular(e.target.value))}
                placeholder="91234-5678"
                maxLength={10}
                className={`flex-1 ${inputClass}`}
              />
            </div>
          </Campo>

          <Campo label="Nova senha" error={fieldErrors.senha}>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.senha}
                onChange={(e) => handleChange('senha', e.target.value)}
                autoComplete="new-password"
                className={`w-full pr-10 ${inputClass}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Campo>

          <Campo label="Confirmar nova senha" error={fieldErrors.confirmarSenha}>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={form.confirmarSenha}
                onChange={(e) => handleChange('confirmarSenha', e.target.value)}
                autoComplete="new-password"
                className={`w-full pr-10 ${inputClass}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Campo>

          <Button type="submit" loading={saving} className="w-full">
            Concluir
          </Button>

          <button
            type="button"
            onClick={logout}
            className="block w-full text-center text-xs text-gray-500 hover:text-gray-700"
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
