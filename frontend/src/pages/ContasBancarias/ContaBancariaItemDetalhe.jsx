import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Landmark } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import SearchableSelect from '../../components/SearchableSelect';
import { getItem, updateEnriquecimento } from '../../api/contasBancariasSienge.api';

function parseBRNumber(value) {
  if (!value) return '';
  const cleaned = value.trim();
  if (cleaned.includes(',')) {
    return cleaned.replace(/\./g, '').replace(',', '.');
  }
  return cleaned;
}

function formatBRNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isNaN(num)) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const emptyForm = {
  banco_enriquecido: '',
  agencia_enriquecida: '',
  conta_enriquecida: '',
  digito: '',
  projeta_saldo: '',
  saldo_inicial: '',
  data_saldo_inicial: '',
};

export default function ContaBancariaItemDetalhe() {
  const { empresaId, companyId, numeroConta } = useParams();
  const navigate = useNavigate();

  const [item, setItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const loadItem = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getItem(empresaId, companyId, numeroConta);
      setItem(data);
      setForm({
        banco_enriquecido: data.banco_enriquecido || '',
        agencia_enriquecida: data.agencia_enriquecida || '',
        conta_enriquecida: data.conta_enriquecida || '',
        digito: data.digito || '',
        projeta_saldo:
          data.projeta_saldo === true ? 'true' : data.projeta_saldo === false ? 'false' : '',
        saldo_inicial: formatBRNumber(data.saldo_inicial),
        data_saldo_inicial: data.data_saldo_inicial ? data.data_saldo_inicial.slice(0, 10) : '',
      });
    } finally {
      setLoading(false);
    }
  }, [empresaId, companyId, numeroConta]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);
    try {
      const updated = await updateEnriquecimento(empresaId, companyId, numeroConta, {
        ...form,
        projeta_saldo: form.projeta_saldo === '' ? '' : form.projeta_saldo === 'true',
        saldo_inicial: parseBRNumber(form.saldo_inicial),
      });
      setItem(updated);
      setForm((prev) => ({ ...prev, saldo_inicial: formatBRNumber(updated.saldo_inicial) }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>;
  }

  if (!item) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <Landmark size={28} className="text-gray-300" />
        <p className="text-sm text-gray-500">Conta bancária não encontrada.</p>
        <Button variant="secondary" onClick={() => navigate(`/cadastros/contas-bancarias/${empresaId}`)}>
          Voltar
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(`/cadastros/contas-bancarias/${empresaId}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Contas Bancárias
      </button>

      <Card>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <Landmark size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{item.nome}</h2>
            <p className="text-xs text-gray-500">Conta {item.numero_conta}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
              Alterações salvas com sucesso.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Banco">
              <input
                type="text"
                value={form.banco_enriquecido}
                onChange={(e) => handleChange('banco_enriquecido', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </Field>

            <Field label="Agência">
              <input
                type="text"
                value={form.agencia_enriquecida}
                onChange={(e) => handleChange('agencia_enriquecida', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </Field>

            <div className="flex gap-3">
              <Field label="Conta" className="flex-1">
                <input
                  type="text"
                  value={form.conta_enriquecida}
                  onChange={(e) => handleChange('conta_enriquecida', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>

              <Field label="Dígito" className="w-16 shrink-0">
                <input
                  type="text"
                  maxLength={1}
                  value={form.digito}
                  onChange={(e) => handleChange('digito', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>
            </div>

            <Field label="Projeta Saldo">
              <SearchableSelect
                value={form.projeta_saldo}
                onChange={(value) => handleChange('projeta_saldo', value)}
                options={[
                  { value: 'true', label: 'Sim' },
                  { value: 'false', label: 'Não' },
                ]}
              />
            </Field>

            <Field label="R$ Saldo Inicial">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  R$
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.saldo_inicial}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (/^-?[0-9.,]*$/.test(raw)) handleChange('saldo_inicial', raw);
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </Field>

            <Field label="Data Saldo Inicial">
              <input
                type="date"
                value={form.data_saldo_inicial}
                onChange={(e) => handleChange('data_saldo_inicial', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </Field>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={saving}>
              Salvar alterações
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
