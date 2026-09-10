import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowLeft } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { consultarCnpj, createEmpresa } from '../../api/empresas.api';
import { formatCnpj, formatCep } from './format';

const emptyForm = {
  cnpj: '',
  razao_social: '',
  nome_fantasia: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  telefone: '',
  situacao_cadastral: '',
  data_inicio_atividade: '',
};

export default function EmpresaNova() {
  const navigate = useNavigate();
  const [cnpjInput, setCnpjInput] = useState('');
  const [consulting, setConsulting] = useState(false);
  const [consultError, setConsultError] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  async function handleConsultar(e) {
    e.preventDefault();
    setConsultError('');
    const digits = cnpjInput.replace(/\D/g, '');
    if (digits.length !== 14) {
      setConsultError('Informe um CNPJ com 14 dígitos.');
      return;
    }

    setConsulting(true);
    try {
      const data = await consultarCnpj(digits);
      setForm({ ...emptyForm, ...data });
    } catch (err) {
      setConsultError(
        err.response?.data?.message || 'Não foi possível consultar o CNPJ.'
      );
    } finally {
      setConsulting(false);
    }
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaveError('');

    const errors = {};
    if (!form.razao_social.trim()) errors.razao_social = 'Razão social é obrigatória.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const empresa = await createEmpresa(form);
      navigate(`/cadastros/empresas/${empresa.id}`, { replace: true });
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Não foi possível salvar a empresa.');
    } finally {
      setSaving(false);
    }
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
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Buscar empresa por CNPJ</h2>
        <form onSubmit={handleConsultar} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <input
              type="text"
              value={formatCnpj(cnpjInput)}
              onChange={(e) => setCnpjInput(e.target.value)}
              placeholder="00.000.000/0000-00"
              maxLength={18}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            {consultError && <p className="mt-1 text-xs text-red-600">{consultError}</p>}
          </div>
          <Button type="submit" loading={consulting}>
            <Search size={16} />
            Buscar
          </Button>
        </form>
      </Card>

      {form && (
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Dados da empresa</h2>
          {saveError && (
            <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {saveError}
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
                  value={form.situacao_cadastral}
                  disabled
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
                />
              </Field>

              <Field label="Razão Social" error={fieldErrors.razao_social}>
                <input
                  type="text"
                  value={form.razao_social}
                  onChange={(e) => handleChange('razao_social', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>
              <Field label="Nome Fantasia">
                <input
                  type="text"
                  value={form.nome_fantasia}
                  onChange={(e) => handleChange('nome_fantasia', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>

              <Field label="CEP">
                <input
                  type="text"
                  value={formatCep(form.cep)}
                  onChange={(e) => handleChange('cep', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>
              <Field label="Telefone">
                <input
                  type="text"
                  value={form.telefone}
                  onChange={(e) => handleChange('telefone', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>

              <Field label="Logradouro">
                <input
                  type="text"
                  value={form.logradouro}
                  onChange={(e) => handleChange('logradouro', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Número">
                  <input
                    type="text"
                    value={form.numero}
                    onChange={(e) => handleChange('numero', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </Field>
                <Field label="Complemento">
                  <input
                    type="text"
                    value={form.complemento}
                    onChange={(e) => handleChange('complemento', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </Field>
              </div>

              <Field label="Bairro">
                <input
                  type="text"
                  value={form.bairro}
                  onChange={(e) => handleChange('bairro', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Cidade">
                  <input
                    type="text"
                    value={form.cidade}
                    onChange={(e) => handleChange('cidade', e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </Field>
                <Field label="Estado">
                  <input
                    type="text"
                    value={form.estado}
                    maxLength={2}
                    onChange={(e) => handleChange('estado', e.target.value.toUpperCase())}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </Field>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => navigate('/cadastros/empresas')}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Salvar empresa
              </Button>
            </div>
          </form>
        </Card>
      )}
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
