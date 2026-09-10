import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, User as UserIcon, Camera, Trash2, CheckCircle2 } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { fetchMe, updateMe } from '../../api/auth.api';
import { useAuth } from '../../auth/AuthContext';
import { redimensionarImagem } from '../../utils/imagemPerfil';
import { formatDdd, formatCelular } from '../Usuarios/format';

const emptyForm = {
  nome: '',
  email: '',
  username: '',
  telefone_ddd: '',
  telefone_numero: '',
  senha: '',
  confirmarSenha: '',
  avatar_url: null,
};

export default function MeuPerfil() {
  const { user, updateUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [form, setForm] = useState(emptyForm);
  const [avatarTouched, setAvatarTouched] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    fetchMe()
      .then((data) => {
        if (!active) return;
        setForm({
          nome: data.nome,
          email: data.email,
          username: data.username || '',
          telefone_ddd: data.telefone_ddd || '',
          telefone_numero: data.telefone_numero || '',
          senha: '',
          confirmarSenha: '',
          avatar_url: data.avatar_url || null,
        });
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
    e.target.value = ''; // permite escolher o mesmo arquivo de novo se quiser
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
      setAvatarTouched(true);
    } catch {
      setAvatarError('Não foi possível processar essa imagem.');
    } finally {
      setProcessandoFoto(false);
    }
  }

  function handleRemoverFoto() {
    handleChange('avatar_url', null);
    setAvatarTouched(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSucesso(false);

    const errors = {};
    if (!form.nome.trim()) errors.nome = 'Nome completo é obrigatório.';
    if (!form.email.trim()) errors.email = 'E-mail é obrigatório.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Informe um e-mail válido.';
    if (!form.username.trim()) errors.username = 'Usuário é obrigatório.';
    else if (!/^[a-zA-Z0-9._-]{3,}$/.test(form.username.trim())) {
      errors.username = 'Use apenas letras, números, ponto, hífen ou underline (mín. 3 caracteres).';
    }
    if (form.telefone_ddd && form.telefone_ddd.length < 2) errors.telefone_ddd = 'DDD inválido.';
    if (form.senha.trim() && form.senha.trim().length < 6) {
      errors.senha = 'A senha deve ter pelo menos 6 caracteres.';
    }
    if (form.senha.trim() && form.senha.trim() !== form.confirmarSenha.trim()) {
      errors.confirmarSenha = 'A confirmação de senha não confere.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim(),
        username: form.username.trim(),
        telefone_ddd: form.telefone_ddd || '',
        telefone_numero: form.telefone_numero || '',
        ...(form.senha.trim()
          ? { senha: form.senha.trim(), confirmarSenha: form.confirmarSenha.trim() }
          : {}),
        // Só manda a foto se de fato mexeu nela — senão o backend mantém a atual.
        ...(avatarTouched ? { avatar_url: form.avatar_url || '' } : {}),
      };

      const atualizado = await updateMe(payload);
      updateUser(atualizado);
      setForm((prev) => ({ ...prev, senha: '', confirmarSenha: '' }));
      setAvatarTouched(false);
      setSucesso(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar suas alterações.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex items-start gap-3">
          <div className="relative shrink-0">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-primary-600">
              {form.avatar_url ? (
                <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <UserIcon size={22} />
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={processandoFoto}
              title="Alterar foto"
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
          <div>
            <h2 className="text-base font-semibold text-gray-900">{user?.nome}</h2>
            <p className="text-xs text-gray-500">Altere seus dados de acesso</p>
            {form.avatar_url && (
              <button
                type="button"
                onClick={handleRemoverFoto}
                className="mt-1 flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
              >
                <Trash2 size={11} />
                Remover foto
              </button>
            )}
            {processandoFoto && <p className="mt-1 text-xs text-gray-400">Processando imagem...</p>}
            {avatarError && <p className="mt-1 text-xs text-red-600">{avatarError}</p>}
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        {sucesso && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
            <CheckCircle2 size={15} />
            Dados atualizados com sucesso.
          </div>
        )}

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Nome completo</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => handleChange('nome', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
              {fieldErrors.nome && <p className="mt-1 text-xs text-red-600">{fieldErrors.nome}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                autoComplete="off"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
              {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Usuário (login)</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => handleChange('username', e.target.value.trim())}
                autoComplete="off"
                placeholder="seu.usuario"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
              {fieldErrors.username && <p className="mt-1 text-xs text-red-600">{fieldErrors.username}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nova senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.senha}
                  onChange={(e) => handleChange('senha', e.target.value)}
                  placeholder="Deixe em branco para manter a senha atual"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.senha && <p className="mt-1 text-xs text-red-600">{fieldErrors.senha}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Confirmar nova senha</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={form.confirmarSenha}
                  onChange={(e) => handleChange('confirmarSenha', e.target.value)}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.confirmarSenha && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.confirmarSenha}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Celular</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.telefone_ddd}
                  onChange={(e) => handleChange('telefone_ddd', formatDdd(e.target.value))}
                  placeholder="DDD"
                  maxLength={3}
                  className="w-16 rounded-lg border border-gray-200 px-3 py-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <input
                  type="text"
                  value={formatCelular(form.telefone_numero)}
                  onChange={(e) => handleChange('telefone_numero', formatCelular(e.target.value))}
                  placeholder="91234-5678"
                  maxLength={10}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
              {fieldErrors.telefone_ddd && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.telefone_ddd}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" loading={saving}>
              Salvar alterações
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
