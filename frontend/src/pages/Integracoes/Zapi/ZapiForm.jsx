import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import {
  getZapiIntegracao,
  createZapiIntegracao,
  updateZapiIntegracao,
} from '../../../api/zapi.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';

export default function ZapiForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();

  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showInstanceToken, setShowInstanceToken] = useState(false);
  const [showClientToken, setShowClientToken] = useState(false);

  const [form, setForm] = useState({
    empresa_id: '',
    nome_conexao: '',
    instance_id: '',
    instance_token: '',
    client_token: '',
  });

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    getZapiIntegracao(id)
      .then((data) => {
        if (!active) return;
        setForm({
          empresa_id: String(data.empresa_id),
          nome_conexao: data.nome_conexao,
          instance_id: data.instance_id,
          instance_token: '',
          client_token: '',
        });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  // Administrador é restrito à própria empresa — o campo já vem preenchido
  // com ela e travado. Depende de `loading` pra reaplicar depois que os
  // dados de edição carregarem (senão o valor carregado sobrescreveria).
  useEffect(() => {
    if (empresaTravada && empresaIdTravada) {
      setForm((prev) => ({ ...prev, empresa_id: empresaIdTravada }));
    }
  }, [empresaTravada, empresaIdTravada, loading]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const errors = {};
    if (!form.empresa_id) errors.empresa_id = 'Selecione uma empresa.';
    if (!form.nome_conexao.trim()) errors.nome_conexao = 'Nome da conexão é obrigatório.';
    if (!form.instance_id.trim()) errors.instance_id = 'ID da instância é obrigatório.';
    if (!isEdit && !form.instance_token.trim()) errors.instance_token = 'Token da instância é obrigatório.';
    if (!isEdit && !form.client_token.trim()) errors.client_token = 'Client token é obrigatório.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        empresa_id: Number(form.empresa_id),
        nome_conexao: form.nome_conexao.trim(),
        instance_id: form.instance_id.trim(),
        ...(form.instance_token.trim() ? { instance_token: form.instance_token.trim() } : {}),
        ...(form.client_token.trim() ? { client_token: form.client_token.trim() } : {}),
      };

      if (isEdit) {
        await updateZapiIntegracao(id, payload);
      } else {
        await createZapiIntegracao(payload);
      }
      navigate('/integracoes/z-api', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar a conexão.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/integracoes/z-api')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Whatsapp Z-API
      </button>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">
          {isEdit ? 'Editar conexão Z-API' : 'Nova conexão Z-API'}
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Informe aqui os dados de autenticação da instância Z-API usada para o envio de mensagens via WhatsApp.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
                <SearchableSelect
                  value={form.empresa_id}
                  onChange={(value) => handleChange('empresa_id', value)}
                  disabled={loadingEmpresas || empresaTravada}
                  options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
                  placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
                  emptyMessage="Nenhuma empresa encontrada."
                />
                {fieldErrors.empresa_id && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.empresa_id}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nome da conexão</label>
                <input
                  type="text"
                  value={form.nome_conexao}
                  onChange={(e) => handleChange('nome_conexao', e.target.value)}
                  placeholder="ex.: Financeiro, Cobrança"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Identifica esta conexão quando a empresa tiver mais de um número de WhatsApp.
                </p>
                {fieldErrors.nome_conexao && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.nome_conexao}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">ID da instância</label>
                <input
                  type="text"
                  value={form.instance_id}
                  onChange={(e) => handleChange('instance_id', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {fieldErrors.instance_id && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.instance_id}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Token da instância</label>
                <div className="relative">
                  <input
                    type={showInstanceToken ? 'text' : 'password'}
                    value={form.instance_token}
                    onChange={(e) => handleChange('instance_token', e.target.value)}
                    placeholder={isEdit ? 'Deixe em branco para manter o token atual' : ''}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowInstanceToken((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showInstanceToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.instance_token && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.instance_token}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Client token</label>
                <div className="relative">
                  <input
                    type={showClientToken ? 'text' : 'password'}
                    value={form.client_token}
                    onChange={(e) => handleChange('client_token', e.target.value)}
                    placeholder={isEdit ? 'Deixe em branco para manter o token atual' : ''}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientToken((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showClientToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.client_token && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.client_token}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => navigate('/integracoes/z-api')}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Salvar
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
