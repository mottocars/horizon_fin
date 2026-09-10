import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Check, RefreshCw } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import IconButton from '../../../components/IconButton';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { getMcpConector, createMcpConector, updateMcpConector, regenerarMcpToken } from '../../../api/mcp.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { useConfirm } from '../../../confirm/ConfirmContext';

// O token é sempre gerado pelo backend (nunca digitado aqui, diferente da
// Z-API) — este formulário só coleta Empresa + Nome do conector. Depois de
// salvo, mostra a URL de conexão pronta pra colar no "Add custom connector"
// do Claude — nunca o token separado da URL (ver plano).
export default function McpForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();

  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [copiado, setCopiado] = useState(false);

  const [form, setForm] = useState({ empresa_id: '', nome_conector: '' });
  const [url, setUrl] = useState('');

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    getMcpConector(id)
      .then((data) => {
        if (!active) return;
        setForm({ empresa_id: String(data.empresa_id), nome_conector: data.nome_conector });
        setUrl(data.url);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  // Administrador é restrito à própria empresa — o campo já vem preenchido
  // com ela e travado (mesmo padrão de ZapiForm.jsx).
  useEffect(() => {
    if (empresaTravada && empresaIdTravada) {
      setForm((prev) => ({ ...prev, empresa_id: empresaIdTravada }));
    }
  }, [empresaTravada, empresaIdTravada, loading]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCopiarUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError('Não foi possível copiar a URL — copie manualmente pelo campo acima.');
    }
  }

  async function handleRegenerarToken() {
    const confirmado = await confirm({
      title: 'Regenerar token',
      description:
        'A URL atual deste conector para de funcionar imediatamente. Você vai precisar atualizar o custom connector no Claude com a nova URL. Deseja continuar?',
      confirmLabel: 'Regenerar',
      variant: 'warning',
    });
    if (!confirmado) return;

    setRegenerando(true);
    try {
      const data = await regenerarMcpToken(id);
      setUrl(data.url);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível regenerar o token.');
    } finally {
      setRegenerando(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const errors = {};
    if (!form.empresa_id) errors.empresa_id = 'Selecione uma empresa.';
    if (!form.nome_conector.trim()) errors.nome_conector = 'Nome do conector é obrigatório.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (isEdit) {
        await updateMcpConector(id, { nome_conector: form.nome_conector.trim() });
        navigate('/integracoes/mcp', { replace: true });
      } else {
        const criado = await createMcpConector({
          empresa_id: Number(form.empresa_id),
          nome_conector: form.nome_conector.trim(),
        });
        // Diferente do padrão de ZapiForm (volta pra lista): aqui navega pra
        // edição do item recém-criado, pra já mostrar a URL de conexão —
        // é a única forma de exibi-la logo depois de criar.
        navigate(`/integracoes/mcp/${criado.id}`, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar o conector.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/integracoes/mcp')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para MCP
      </button>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">
          {isEdit ? 'Editar conector MCP' : 'Novo conector MCP'}
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Um conector MCP dá ao Claude acesso de leitura aos dados de cobrança e contas a receber desta empresa,
          através de uma URL que você cola em "Add custom connector".
        </p>

        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

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
                  disabled={loadingEmpresas || empresaTravada || isEdit}
                  options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
                  placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
                  emptyMessage="Nenhuma empresa encontrada."
                />
                {fieldErrors.empresa_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.empresa_id}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nome do conector</label>
                <input
                  type="text"
                  value={form.nome_conector}
                  onChange={(e) => handleChange('nome_conector', e.target.value)}
                  placeholder="ex.: Diretoria, Financeiro"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <p className="mt-1 text-xs text-gray-400">Identifica este conector quando a empresa tiver mais de um.</p>
                {fieldErrors.nome_conector && <p className="mt-1 text-xs text-red-600">{fieldErrors.nome_conector}</p>}
              </div>
            </div>

            {isEdit && url && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">URL de conexão</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={url}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700 focus:outline-none"
                  />
                  <IconButton title="Copiar URL" onClick={handleCopiarUrl}>
                    {copiado ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  </IconButton>
                  <IconButton title="Regenerar token" onClick={handleRegenerarToken} disabled={regenerando}>
                    <RefreshCw size={16} className={regenerando ? 'animate-spin' : ''} />
                  </IconButton>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Cole esta URL completa em "Add custom connector" no Claude. Quem tiver esta URL consegue ler os
                  dados de cobrança desta empresa — trate-a como uma senha. Regenerar o token invalida esta URL
                  imediatamente.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => navigate('/integracoes/mcp')}>
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
