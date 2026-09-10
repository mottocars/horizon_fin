import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Ban, CheckCircle2, Trash2 } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { getEmpresa, updateEmpresa, setEmpresaStatus, deleteEmpresa } from '../../api/empresas.api';
import { formatCnpj, formatCep } from './format';
import { useConfirm } from '../../confirm/ConfirmContext';
import { useAuth } from '../../auth/AuthContext';

export default function EmpresaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { user } = useAuth();
  const isMaster = user?.permissao === 'MASTER';

  const [empresa, setEmpresa] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getEmpresa(id)
      .then((data) => {
        if (!active) return;
        const empresaIds = (user?.empresa_ids || []).map(String);
        if (!isMaster && !empresaIds.includes(String(data.id))) {
          setNotFound(true);
          return;
        }
        setEmpresa(data);
        setForm(data);
      })
      .catch((err) => {
        if (err.response?.status === 404) setNotFound(true);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    const errors = {};
    if (!form.razao_social.trim()) errors.razao_social = 'Razão social é obrigatória.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const updated = await updateEmpresa(id, form);
      setEmpresa(updated);
      setForm(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    const novoStatus = !empresa.ativo;
    const acao = novoStatus ? 'reativar' : 'desativar';
    const confirmado = await confirm({
      title: `${novoStatus ? 'Reativar' : 'Desativar'} empresa`,
      description: `Deseja realmente ${acao} "${empresa.razao_social}"?`,
      confirmLabel: novoStatus ? 'Reativar' : 'Desativar',
      variant: novoStatus ? 'default' : 'warning',
    });
    if (!confirmado) return;

    setTogglingStatus(true);
    try {
      const updated = await setEmpresaStatus(id, novoStatus);
      setEmpresa(updated);
      setForm(updated);
    } finally {
      setTogglingStatus(false);
    }
  }

  async function handleDelete() {
    const confirmado = await confirm({
      title: 'Excluir empresa',
      description: `Excluir definitivamente "${empresa.razao_social}"?\n\nEsta ação remove o cadastro do banco de dados e não pode ser desfeita. Se quiser apenas ocultar a empresa mantendo o histórico, use "Desativar" em vez disso.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!confirmado) return;

    setDeleting(true);
    try {
      await deleteEmpresa(id);
      navigate('/cadastros/empresas', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível excluir a empresa.');
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>;
  }

  if (notFound || !form) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <Building2 size={28} className="text-gray-300" />
        <p className="text-sm text-gray-500">Empresa não encontrada.</p>
        <Button variant="secondary" onClick={() => navigate('/cadastros/empresas')}>
          Voltar para Empresas
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/cadastros/empresas')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Empresas
      </button>

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
              <Building2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{empresa.razao_social}</h2>
              <p className="text-xs text-gray-500">{formatCnpj(empresa.cnpj)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                empresa.ativo ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {empresa.ativo ? 'Ativa' : 'Inativa'}
            </span>
            <Button
              type="button"
              variant={empresa.ativo ? 'danger' : 'secondary'}
              loading={togglingStatus}
              onClick={handleToggleStatus}
            >
              {empresa.ativo ? <Ban size={16} /> : <CheckCircle2 size={16} />}
              {empresa.ativo ? 'Desativar' : 'Reativar'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              loading={deleting}
              onClick={handleDelete}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              <Trash2 size={16} />
              Excluir
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
            Alterações salvas com sucesso.
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="CNPJ">
              <input
                type="text"
                value={formatCnpj(form.cnpj)}
                disabled
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </Field>
            <Field label="Situação cadastral (Receita)">
              <input
                type="text"
                value={form.situacao_cadastral || ''}
                disabled
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
              />
            </Field>

            <Field label="Razão Social" error={fieldErrors.razao_social}>
              <input
                type="text"
                value={form.razao_social || ''}
                onChange={(e) => handleChange('razao_social', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </Field>
            <Field label="Nome Fantasia">
              <input
                type="text"
                value={form.nome_fantasia || ''}
                onChange={(e) => handleChange('nome_fantasia', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </Field>

            <Field label="CEP">
              <input
                type="text"
                value={formatCep(form.cep || '')}
                onChange={(e) => handleChange('cep', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </Field>
            <Field label="Telefone">
              <input
                type="text"
                value={form.telefone || ''}
                onChange={(e) => handleChange('telefone', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </Field>

            <Field label="Logradouro">
              <input
                type="text"
                value={form.logradouro || ''}
                onChange={(e) => handleChange('logradouro', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Número">
                <input
                  type="text"
                  value={form.numero || ''}
                  onChange={(e) => handleChange('numero', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>
              <Field label="Complemento">
                <input
                  type="text"
                  value={form.complemento || ''}
                  onChange={(e) => handleChange('complemento', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>
            </div>

            <Field label="Bairro">
              <input
                type="text"
                value={form.bairro || ''}
                onChange={(e) => handleChange('bairro', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cidade">
                <input
                  type="text"
                  value={form.cidade || ''}
                  onChange={(e) => handleChange('cidade', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>
              <Field label="Estado">
                <input
                  type="text"
                  value={form.estado || ''}
                  maxLength={2}
                  onChange={(e) => handleChange('estado', e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>
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

function Field({ label, error, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
