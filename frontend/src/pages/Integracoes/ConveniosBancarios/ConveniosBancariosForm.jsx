import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Plus, X } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { getVanpixIntegracao, createVanpixIntegracao, updateVanpixIntegracao } from '../../../api/vanpix.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';

// Só existe 1 tipo de conexão hoje (VanPix) — o combobox já fica pronto pra ganhar outros no
// futuro, cada um com seus próprios campos (mesma ideia de trocar Sienge/Z-API/Conta Azul,
// só que reunidos numa única tela "Nova Conexão", pedido do usuário).
const TIPOS_CONEXAO = [{ value: 'VANPIX', label: 'VanPix' }];

export default function ConveniosBancariosForm() {
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
  const [showServiceKey, setShowServiceKey] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [novoApelido, setNovoApelido] = useState('');

  const [form, setForm] = useState({
    empresa_id: '',
    tipo: 'VANPIX',
    nome_conexao: '',
    service_key: '',
    client_secret: '',
    apelidos: [],
  });

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    getVanpixIntegracao(id)
      .then((data) => {
        if (!active) return;
        setForm({
          empresa_id: String(data.empresa_id),
          tipo: 'VANPIX',
          nome_conexao: data.nome_conexao,
          service_key: '',
          client_secret: '',
          apelidos: data.apelidos,
        });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  // Administrador é restrito à própria empresa — o campo já vem preenchido com ela e travado.
  // Depende de `loading` pra reaplicar depois que os dados de edição carregarem.
  useEffect(() => {
    if (empresaTravada && empresaIdTravada) {
      setForm((prev) => ({ ...prev, empresa_id: empresaIdTravada }));
    }
  }, [empresaTravada, empresaIdTravada, loading]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function adicionarApelido() {
    const valor = novoApelido.trim().toUpperCase();
    if (!valor) return;
    if (form.apelidos.includes(valor)) {
      setNovoApelido('');
      return;
    }
    setForm((prev) => ({ ...prev, apelidos: [...prev.apelidos, valor] }));
    setNovoApelido('');
  }

  function removerApelido(valor) {
    setForm((prev) => ({ ...prev, apelidos: prev.apelidos.filter((a) => a !== valor) }));
  }

  function handleApelidoKeyDown(e) {
    // Enter adiciona sem submeter o form inteiro (o campo fica dentro do <form>).
    if (e.key === 'Enter') {
      e.preventDefault();
      adicionarApelido();
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const errors = {};
    if (!form.empresa_id) errors.empresa_id = 'Selecione uma empresa.';
    if (!form.nome_conexao.trim()) errors.nome_conexao = 'Nome da conexão é obrigatório.';
    if (!isEdit && !form.service_key.trim()) errors.service_key = 'Service Key é obrigatória.';
    if (!isEdit && !form.client_secret.trim()) errors.client_secret = 'Client Secret é obrigatório.';
    if (form.apelidos.length === 0) errors.apelidos = 'Informe ao menos 1 convênio (apelido).';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        empresa_id: Number(form.empresa_id),
        nome_conexao: form.nome_conexao.trim(),
        apelidos: form.apelidos,
        ...(form.service_key.trim() ? { service_key: form.service_key.trim() } : {}),
        ...(form.client_secret.trim() ? { client_secret: form.client_secret.trim() } : {}),
      };

      if (isEdit) {
        await updateVanpixIntegracao(id, payload);
      } else {
        await createVanpixIntegracao(payload);
      }
      navigate('/integracoes/contas-bancarias', { replace: true });
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
        onClick={() => navigate('/integracoes/contas-bancarias')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Convênios Bancários
      </button>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">
          {isEdit ? 'Editar conexão' : 'Nova conexão'}
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Informe aqui os dados de autenticação usados para buscar os retornos bancários (extratos) junto ao provedor.
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
                <label className="mb-1 block text-sm font-medium text-gray-700">Conexão</label>
                <SearchableSelect
                  value={form.tipo}
                  onChange={(value) => handleChange('tipo', value)}
                  options={TIPOS_CONEXAO}
                  clearable={false}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Nome da conexão</label>
                <input
                  type="text"
                  value={form.nome_conexao}
                  onChange={(e) => handleChange('nome_conexao', e.target.value)}
                  placeholder="ex.: VanPix Caixa"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Identifica esta conexão quando a empresa tiver mais de uma.
                </p>
                {fieldErrors.nome_conexao && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.nome_conexao}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Service Key</label>
                <div className="relative">
                  <input
                    type={showServiceKey ? 'text' : 'password'}
                    value={form.service_key}
                    onChange={(e) => handleChange('service_key', e.target.value)}
                    placeholder={isEdit ? 'Deixe em branco para manter a chave atual' : ''}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowServiceKey((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showServiceKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.service_key && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.service_key}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Client Secret</label>
                <div className="relative">
                  <input
                    type={showClientSecret ? 'text' : 'password'}
                    value={form.client_secret}
                    onChange={(e) => handleChange('client_secret', e.target.value)}
                    placeholder={isEdit ? 'Deixe em branco para manter o segredo atual' : ''}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClientSecret((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showClientSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.client_secret && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.client_secret}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Convênios (apelidos)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={novoApelido}
                    onChange={(e) => setNovoApelido(e.target.value)}
                    onKeyDown={handleApelidoKeyDown}
                    placeholder="ex.: ABPFJR"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                  <Button type="button" variant="secondary" onClick={adicionarApelido} className="shrink-0">
                    <Plus size={16} />
                    Adicionar
                  </Button>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  O identificador de cada convênio/cedente cadastrado no provedor — uma conexão pode ter vários.
                </p>
                {fieldErrors.apelidos && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.apelidos}</p>
                )}

                {form.apelidos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {form.apelidos.map((apelido) => (
                      <span
                        key={apelido}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-3 pr-1.5 text-xs font-medium text-gray-700"
                      >
                        {apelido}
                        <button
                          type="button"
                          onClick={() => removerApelido(apelido)}
                          title="Remover"
                          className="flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => navigate('/integracoes/contas-bancarias')}>
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
