import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Crown,
  ShieldCheck,
  User as UserIcon,
  Ban,
  CheckCircle2,
  CheckSquare,
  Square,
  LayoutGrid,
  Camera,
  Trash2,
  ChevronRight,
  ChevronsRight,
  ChevronLeft,
  ChevronsLeft,
  Building2,
  Search,
} from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { listEmpresas } from '../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../utils/empresa';
import { getUsuario, createUsuario, updateUsuario, setUsuarioStatus } from '../../api/usuarios.api';
import { useConfirm } from '../../confirm/ConfirmContext';
import { TELAS_SISTEMA } from '../../config/telasSistema';
import { formatDdd, formatCelular } from './format';
import { redimensionarImagem } from '../../utils/imagemPerfil';
import { useAuth } from '../../auth/AuthContext';

const emptyForm = {
  nome: '',
  email: '',
  username: '',
  telefone_ddd: '',
  telefone_numero: '',
  senha: '',
  empresa_ids: [],
  permissao: 'BASICO',
  telas_permitidas: [],
  avatar_url: null,
};

const PERMISSOES = [
  {
    value: 'MASTER',
    label: 'Master',
    Icon: Crown,
    descricao: 'Acesso total a todas as telas, sem nenhuma restrição — nem mesmo de empresa.',
    corAtivo: 'border-purple-500 bg-purple-50 text-purple-700',
    corIcone: 'bg-purple-100 text-purple-600',
  },
  {
    value: 'ADMINISTRADOR',
    label: 'Administrador',
    Icon: ShieldCheck,
    descricao: 'Acesso a todas as telas, porém restrito apenas às empresas selecionadas.',
    corAtivo: 'border-blue-500 bg-blue-50 text-blue-700',
    corIcone: 'bg-blue-100 text-blue-600',
  },
  {
    value: 'BASICO',
    label: 'Básico',
    Icon: UserIcon,
    descricao: 'Acesso só às telas marcadas abaixo, dentro das empresas selecionadas.',
    corAtivo: 'border-gray-500 bg-gray-100 text-gray-700',
    corIcone: 'bg-gray-200 text-gray-600',
  },
];

export default function UsuarioForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user: usuarioLogado } = useAuth();

  // Só Master pode criar/deixar outro usuário como Master — Administrador e
  // Básico nem veem essa opção no seletor de permissão.
  const permissoesDisponiveis =
    usuarioLogado?.permissao === 'MASTER' ? PERMISSOES : PERMISSOES.filter((p) => p.value !== 'MASTER');

  // Nesta tela em especial, a trava de empresa vale pra qualquer criador que
  // não seja Master (Administrador OU Básico) — ninguém abaixo de Master
  // pode cadastrar usuário em empresa que não seja uma das suas próprias. O
  // backend já devolve só as empresas do criador em /empresas (quando ele
  // não é Master), então a lista de opções abaixo já vem restrita sozinha.
  // Só quando o criador tem EXATAMENTE uma empresa é que trava o checkbox
  // (pré-marcado, sem poder desmarcar) — com mais de uma, ele escolhe entre
  // as suas.
  const empresaIdsDoCriador = (usuarioLogado?.empresa_ids || []).map(String);
  const empresaTravada = usuarioLogado?.permissao !== 'MASTER' && empresaIdsDoCriador.length === 1;

  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [usuario, setUsuario] = useState(null);
  const [form, setForm] = useState(emptyForm);
  // Destaque (azul) de quem está marcado pra transferir entre as duas
  // caixas de empresas — não é o vínculo em si, só a seleção temporária
  // antes de apertar a seta.
  const [destaqueDisponiveis, setDestaqueDisponiveis] = useState([]);
  const [destaqueSelecionadas, setDestaqueSelecionadas] = useState([]);
  const [avatarTouched, setAvatarTouched] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  useEffect(() => {
    if (!isEdit) {
      // /novo reaproveita o mesmo componente da tela de edição (mesma rota
      // pai) — sem isso, dados de um usuário editado antes ficavam presos
      // no formulário ao clicar em "Novo Usuário" na sequência.
      setUsuario(null);
      setForm(emptyForm);
      setDestaqueDisponiveis([]);
      setDestaqueSelecionadas([]);
      setAvatarTouched(false);
      setFieldErrors({});
      setError('');
      setNotFound(false);
      return;
    }
    let active = true;
    setLoading(true);
    getUsuario(id)
      .then((data) => {
        if (!active) return;
        setUsuario(data);
        setForm({
          nome: data.nome,
          email: data.email,
          username: data.username || '',
          telefone_ddd: data.telefone_ddd || '',
          telefone_numero: data.telefone_numero || '',
          senha: '',
          empresa_ids: (data.empresa_ids || []).map(String),
          permissao: data.permissao,
          telas_permitidas: data.telas_permitidas || [],
          avatar_url: data.avatar_url || null,
        });
        setDestaqueDisponiveis([]);
        setDestaqueSelecionadas([]);
      })
      .catch((err) => {
        if (err.response?.status === 404) setNotFound(true);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  // Quando o criador só tem uma empresa, o campo já vem preenchido com ela e
  // travado. Declarado DEPOIS do efeito acima de propósito: precisa rodar
  // por último pra não ter seu valor sobrescrito nem pelo reset do /novo
  // nem pelos dados carregados na edição.
  useEffect(() => {
    if (empresaTravada) {
      setForm((prev) => ({ ...prev, empresa_ids: empresaIdsDoCriador }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaTravada, usuario]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  // Transferência de empresas entre as duas caixas (disponíveis ↔
  // selecionadas), no estilo "dual list": clica pra destacar (azul), depois
  // usa as setas pra mover — ou usa as setas duplas pra mover tudo de uma vez.
  function toggleDestaque(setDestaque, id) {
    const idStr = String(id);
    setDestaque((prev) => (prev.includes(idStr) ? prev.filter((e) => e !== idStr) : [...prev, idStr]));
  }

  function moverParaSelecionadas(ids) {
    if (ids.length === 0) return;
    setForm((prev) => ({
      ...prev,
      empresa_ids: [...prev.empresa_ids, ...ids.filter((id) => !prev.empresa_ids.includes(id))],
    }));
    setDestaqueDisponiveis([]);
  }

  function moverParaDisponiveis(ids) {
    if (ids.length === 0) return;
    setForm((prev) => ({
      ...prev,
      empresa_ids: prev.empresa_ids.filter((id) => !ids.includes(id)),
    }));
    setDestaqueSelecionadas([]);
  }

  function toggleTela(codigo) {
    setForm((prev) => {
      const has = prev.telas_permitidas.includes(codigo);
      return {
        ...prev,
        telas_permitidas: has
          ? prev.telas_permitidas.filter((c) => c !== codigo)
          : [...prev.telas_permitidas, codigo],
      };
    });
  }

  function toggleGrupo(telasDoGrupo, marcarTodas) {
    setForm((prev) => {
      const codigosGrupo = telasDoGrupo.map((t) => t.codigo);
      const semGrupo = prev.telas_permitidas.filter((c) => !codigosGrupo.includes(c));
      return {
        ...prev,
        telas_permitidas: marcarTodas ? [...semGrupo, ...codigosGrupo] : semGrupo,
      };
    });
  }

  const totalTelasMarcadas = form.telas_permitidas.length;

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

    const errors = {};
    if (!form.nome.trim()) errors.nome = 'Nome completo é obrigatório.';
    if (!form.email.trim()) errors.email = 'E-mail é obrigatório.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Informe um e-mail válido.';
    if (!form.username.trim()) errors.username = 'Usuário é obrigatório.';
    else if (!/^[a-zA-Z0-9._-]{3,}$/.test(form.username.trim())) {
      errors.username = 'Use apenas letras, números, ponto, hífen ou underline (mín. 3 caracteres).';
    }
    if (form.telefone_ddd && form.telefone_ddd.length < 2) errors.telefone_ddd = 'DDD inválido.';
    if (!isEdit && !form.senha.trim()) errors.senha = 'Senha de acesso é obrigatória.';
    if (form.senha.trim() && form.senha.trim().length < 6) errors.senha = 'A senha deve ter pelo menos 6 caracteres.';
    if (form.permissao !== 'MASTER' && form.empresa_ids.length === 0) {
      errors.empresa_ids = 'Selecione ao menos uma empresa.';
    }
    if (form.permissao === 'BASICO' && form.telas_permitidas.length === 0) {
      errors.telas_permitidas = 'Selecione ao menos uma tela para o usuário Básico.';
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
        empresa_ids: form.permissao === 'MASTER' ? [] : form.empresa_ids.map(Number),
        permissao: form.permissao,
        telas_permitidas: form.permissao === 'BASICO' ? form.telas_permitidas : [],
        ...(form.senha.trim() ? { senha: form.senha.trim() } : {}),
        // Em edição, só manda a foto se o usuário de fato mexeu nela — senão
        // o backend mantém a atual. Em criação, sempre manda (mesmo vazia).
        ...(!isEdit || avatarTouched ? { avatar_url: form.avatar_url || '' } : {}),
      };

      if (isEdit) {
        await updateUsuario(id, payload);
      } else {
        await createUsuario(payload);
      }
      navigate('/cadastros/usuarios', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar o usuário.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    const novoStatus = !usuario.ativo;
    const acao = novoStatus ? 'reativar' : 'desativar';
    const confirmado = await confirm({
      title: `${novoStatus ? 'Reativar' : 'Desativar'} usuário`,
      description: `Deseja realmente ${acao} o acesso de "${usuario.nome}"?`,
      confirmLabel: novoStatus ? 'Reativar' : 'Desativar',
      variant: novoStatus ? 'default' : 'warning',
    });
    if (!confirmado) return;

    setTogglingStatus(true);
    try {
      const updated = await setUsuarioStatus(id, novoStatus);
      setUsuario(updated);
    } finally {
      setTogglingStatus(false);
    }
  }

  const empresasSelecionadas = useMemo(
    () => empresas.filter((e) => form.empresa_ids.includes(String(e.id))),
    [empresas, form.empresa_ids]
  );
  const empresasDisponiveis = useMemo(
    () => empresas.filter((e) => !form.empresa_ids.includes(String(e.id))),
    [empresas, form.empresa_ids]
  );
  const nomesEmpresasSelecionadas = useMemo(
    () => empresasSelecionadas.map((e) => nomeExibicaoEmpresa(e)),
    [empresasSelecionadas]
  );

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>;
  }

  if (notFound) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <UserIcon size={28} className="text-gray-300" />
        <p className="text-sm text-gray-500">Usuário não encontrado.</p>
        <Button variant="secondary" onClick={() => navigate('/cadastros/usuarios')}>
          Voltar para Usuários
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/cadastros/usuarios')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Usuários
      </button>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
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
              <h2 className="text-base font-semibold text-gray-900">
                {isEdit ? usuario?.nome : 'Novo Usuário'}
              </h2>
              <p className="text-xs text-gray-500">
                {isEdit ? 'Editar cadastro de usuário' : 'Cadastrar um novo usuário do sistema'}
              </p>
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

          {isEdit && usuario && (
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                  usuario.ativo ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {usuario.ativo ? 'Ativo' : 'Inativo'}
              </span>
              <Button
                type="button"
                variant={usuario.ativo ? 'danger' : 'secondary'}
                loading={togglingStatus}
                onClick={handleToggleStatus}
              >
                {usuario.ativo ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                {usuario.ativo ? 'Desativar' : 'Reativar'}
              </Button>
            </div>
          )}
        </div>

        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-6">
          {/* Dados básicos */}
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

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Senha de acesso</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.senha}
                  onChange={(e) => handleChange('senha', e.target.value)}
                  placeholder={isEdit ? 'Deixe em branco para manter a senha atual' : ''}
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

          </div>

          {/* Empresas — não aparece pra Master, que tem acesso total sem
              vínculo de empresa nenhum. Duas caixas: clica pra destacar
              (fica azul) e usa as setas pra transferir — ou as setas duplas
              pra mover tudo de uma vez. */}
          {form.permissao !== 'MASTER' && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Empresa{form.empresa_ids.length !== 1 ? 's' : ''}
              </label>
              {loadingEmpresas ? (
                <p className="text-sm text-gray-400">Carregando empresas...</p>
              ) : (
                <div className="flex items-stretch gap-2">
                  <CaixaDeEmpresas
                    titulo="Disponíveis"
                    empresas={empresasDisponiveis}
                    destacadas={destaqueDisponiveis}
                    onToggleDestaque={(id) => toggleDestaque(setDestaqueDisponiveis, id)}
                    disabled={empresaTravada}
                    vazioTexto="Nenhuma empresa disponível."
                  />

                  <div className="flex flex-col justify-center gap-1.5">
                    <button
                      type="button"
                      title="Mover selecionadas para a direita"
                      disabled={empresaTravada || destaqueDisponiveis.length === 0}
                      onClick={() => moverParaSelecionadas(destaqueDisponiveis)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight size={14} />
                    </button>
                    <button
                      type="button"
                      title="Mover todas para a direita"
                      disabled={empresaTravada || empresasDisponiveis.length === 0}
                      onClick={() => moverParaSelecionadas(empresasDisponiveis.map((e) => String(e.id)))}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronsRight size={14} />
                    </button>
                    <button
                      type="button"
                      title="Mover selecionadas para a esquerda"
                      disabled={empresaTravada || destaqueSelecionadas.length === 0}
                      onClick={() => moverParaDisponiveis(destaqueSelecionadas)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      title="Mover todas para a esquerda"
                      disabled={empresaTravada || empresasSelecionadas.length === 0}
                      onClick={() => moverParaDisponiveis(empresasSelecionadas.map((e) => String(e.id)))}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronsLeft size={14} />
                    </button>
                  </div>

                  <CaixaDeEmpresas
                    titulo="Selecionadas"
                    empresas={empresasSelecionadas}
                    destacadas={destaqueSelecionadas}
                    onToggleDestaque={(id) => toggleDestaque(setDestaqueSelecionadas, id)}
                    disabled={empresaTravada}
                    vazioTexto="Nenhuma empresa selecionada."
                  />
                </div>
              )}
              {fieldErrors.empresa_ids && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.empresa_ids}</p>
              )}
            </div>
          )}

          {/* Permissão do usuário */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Permissão do usuário</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {permissoesDisponiveis.map((permissao) => {
                const { Icon } = permissao;
                const ativo = form.permissao === permissao.value;
                return (
                  <button
                    key={permissao.value}
                    type="button"
                    onClick={() => handleChange('permissao', permissao.value)}
                    className={`flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-colors ${
                      ativo ? permissao.corAtivo : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        ativo ? permissao.corIcone : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <Icon size={18} />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${ativo ? '' : 'text-gray-900'}`}>
                        {permissao.label}
                      </p>
                      <p className={`mt-0.5 text-xs ${ativo ? 'opacity-80' : 'text-gray-500'}`}>
                        {permissao.descricao}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Telas que possui acesso */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Telas que possui acesso</label>

            {form.permissao === 'MASTER' && (
              <div className="flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-700">
                <Crown size={18} className="shrink-0" />
                Master tem acesso a todas as telas do sistema, sem nenhuma restrição — nem mesmo de
                empresa.
              </div>
            )}

            {form.permissao === 'ADMINISTRADOR' && (
              <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                <ShieldCheck size={18} className="shrink-0" />
                Administrador tem acesso a todas as telas do sistema, restrito às empresas selecionadas
                acima{nomesEmpresasSelecionadas.length ? ` (${nomesEmpresasSelecionadas.join(', ')})` : ''}.
              </div>
            )}

            {form.permissao === 'BASICO' && (
              <div className="rounded-xl border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                    <LayoutGrid size={13} />
                    {totalTelasMarcadas} tela{totalTelasMarcadas !== 1 ? 's' : ''} selecionada
                    {totalTelasMarcadas !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="space-y-4 p-4">
                  {TELAS_SISTEMA.map((grupo) => {
                    const codigosGrupo = grupo.telas.map((t) => t.codigo);
                    const todasMarcadas = codigosGrupo.every((c) => form.telas_permitidas.includes(c));
                    return (
                      <div key={grupo.grupo}>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            {grupo.grupo}
                          </p>
                          <button
                            type="button"
                            onClick={() => toggleGrupo(grupo.telas, !todasMarcadas)}
                            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
                          >
                            {todasMarcadas ? <CheckSquare size={13} /> : <Square size={13} />}
                            {todasMarcadas ? 'Limpar' : 'Marcar todas'}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {grupo.telas.map((tela) => (
                            <label
                              key={tela.codigo}
                              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <input
                                type="checkbox"
                                checked={form.telas_permitidas.includes(tela.codigo)}
                                onChange={() => toggleTela(tela.codigo)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-100"
                              />
                              {tela.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {fieldErrors.telas_permitidas && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.telas_permitidas}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/cadastros/usuarios')}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              {isEdit ? 'Salvar alterações' : 'Cadastrar usuário'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function CaixaDeEmpresas({ titulo, empresas, destacadas, onToggleDestaque, disabled, vazioTexto }) {
  const [busca, setBusca] = useState('');

  const empresasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return empresas;
    return empresas.filter((empresa) => nomeExibicaoEmpresa(empresa).toLowerCase().includes(termo));
  }, [empresas, busca]);

  return (
    <div className="flex-1 rounded-xl border border-gray-200">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-gray-500">
          <Building2 size={13} />
          {titulo} ({empresas.length})
        </span>
        <div className="relative w-48">
          <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            disabled={disabled || empresas.length === 0}
            placeholder="Pesquisar"
            className="w-full rounded-md border border-gray-200 bg-white py-1 pl-6 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50"
          />
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-1.5">
        {empresas.length === 0 ? (
          <p className="px-2 py-2 text-sm text-gray-400">{vazioTexto}</p>
        ) : empresasFiltradas.length === 0 ? (
          <p className="px-2 py-2 text-sm text-gray-400">Nenhuma empresa encontrada.</p>
        ) : (
          empresasFiltradas.map((empresa) => {
            const destacada = destacadas.includes(String(empresa.id));
            return (
              <button
                key={empresa.id}
                type="button"
                disabled={disabled}
                onClick={() => onToggleDestaque(empresa.id)}
                className={`block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                  destacada ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {nomeExibicaoEmpresa(empresa)}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
