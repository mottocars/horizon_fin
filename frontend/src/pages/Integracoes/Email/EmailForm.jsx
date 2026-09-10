import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Plug, XCircle } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import {
  getEmailIntegracao,
  createEmailIntegracao,
  updateEmailIntegracao,
  testarConexaoEmail,
} from '../../../api/emailIntegracao.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';

// Único driver suportado hoje — não é exposto no formulário, só enviado
// fixo no payload (o backend ainda valida contra a lista de drivers válidos).
const DRIVER_PADRAO = 'smtp';

const ENCRIPTACOES = [
  { value: 'tls', label: 'TLS' },
  { value: 'ssl', label: 'SSL' },
  { value: 'none', label: 'Nenhuma' },
];

export default function EmailForm() {
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
  const [showPassword, setShowPassword] = useState(false);
  const [testando, setTestando] = useState(false);
  const [resultadoTeste, setResultadoTeste] = useState(null);

  const [form, setForm] = useState({
    empresa_id: '',
    nome_conexao: '',
    host: '',
    porta: '',
    encriptacao: 'tls',
    email: '',
    senha: '',
  });

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    getEmailIntegracao(id)
      .then((data) => {
        if (!active) return;
        setForm({
          empresa_id: String(data.empresa_id),
          nome_conexao: data.nome_conexao,
          host: data.host,
          porta: String(data.porta),
          encriptacao: data.encriptacao,
          email: data.email,
          senha: '',
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
    // Qualquer mudança invalida o resultado do teste anterior — evita
    // mostrar "Conexão OK" depois que o host/senha já mudou de novo.
    setResultadoTeste(null);
  }

  // Testa a conexão SMTP de verdade (sem enviar e-mail nenhum, ver
  // email.service.js::testarConexao) com os dados que estão no formulário
  // AGORA, antes de salvar — pega erro de host/porta/usuário/senha na hora,
  // em vez de só descobrir num envio real (ou pior, silenciosamente).
  async function handleTestarConexao() {
    setResultadoTeste(null);
    const errors = {};
    if (!form.host.trim()) errors.host = 'Host é obrigatório.';
    if (!form.porta.trim() || Number(form.porta) <= 0) errors.porta = 'Informe uma porta válida.';
    if (!form.email.trim()) errors.email = 'E-mail é obrigatório.';
    if (!isEdit && !form.senha.trim()) errors.senha = 'Senha é obrigatória.';
    setFieldErrors((prev) => ({ ...prev, ...errors }));
    if (Object.keys(errors).length > 0) return;

    setTestando(true);
    try {
      await testarConexaoEmail({
        id: isEdit ? Number(id) : undefined,
        host: form.host.trim(),
        porta: Number(form.porta),
        encriptacao: form.encriptacao,
        email: form.email.trim(),
        ...(form.senha.trim() ? { senha: form.senha.trim() } : {}),
      });
      setResultadoTeste({ ok: true, mensagem: 'Conexão feita e autenticada com sucesso.' });
    } catch (err) {
      setResultadoTeste({ ok: false, mensagem: err.response?.data?.message || 'Não foi possível conectar.' });
    } finally {
      setTestando(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const errors = {};
    if (!form.empresa_id) errors.empresa_id = 'Selecione uma empresa.';
    if (!form.nome_conexao.trim()) errors.nome_conexao = 'Nome da conexão é obrigatório.';
    if (!form.host.trim()) errors.host = 'Host é obrigatório.';
    if (!form.porta.trim() || Number(form.porta) <= 0) errors.porta = 'Informe uma porta válida.';
    if (!form.encriptacao) errors.encriptacao = 'Selecione uma encriptação.';
    if (!form.email.trim()) errors.email = 'E-mail é obrigatório.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Informe um e-mail válido.';
    if (!isEdit && !form.senha.trim()) errors.senha = 'Senha é obrigatória.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        empresa_id: Number(form.empresa_id),
        nome_conexao: form.nome_conexao.trim(),
        driver: DRIVER_PADRAO,
        host: form.host.trim(),
        porta: Number(form.porta),
        encriptacao: form.encriptacao,
        email: form.email.trim(),
        ...(form.senha.trim() ? { senha: form.senha.trim() } : {}),
      };

      if (isEdit) {
        await updateEmailIntegracao(id, payload);
      } else {
        await createEmailIntegracao(payload);
      }
      navigate('/integracoes/email', { replace: true });
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
        onClick={() => navigate('/integracoes/email')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Email
      </button>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">
          {isEdit ? 'Editar conexão de e-mail' : 'Nova conexão de e-mail'}
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Informe aqui os dados da caixa de e-mail usada para o envio de mensagens.
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
                {fieldErrors.nome_conexao && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.nome_conexao}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Host</label>
                <input
                  type="text"
                  value={form.host}
                  onChange={(e) => handleChange('host', e.target.value)}
                  placeholder="ex.: smtp.gmail.com"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {fieldErrors.host && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.host}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Porta</label>
                <input
                  type="number"
                  value={form.porta}
                  onChange={(e) => handleChange('porta', e.target.value)}
                  placeholder="ex.: 587"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {fieldErrors.porta && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.porta}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Encriptação</label>
                <SearchableSelect
                  value={form.encriptacao}
                  onChange={(value) => handleChange('encriptacao', value)}
                  options={ENCRIPTACOES}
                  clearable={false}
                />
                {fieldErrors.encriptacao && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.encriptacao}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="text"
                  value={form.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {fieldErrors.email && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Senha</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.senha}
                    onChange={(e) => handleChange('senha', e.target.value)}
                    placeholder={isEdit ? 'Deixe em branco para manter a senha atual' : ''}
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
                {fieldErrors.senha && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.senha}</p>
                )}
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleTestarConexao}
                disabled={testando}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60"
              >
                <Plug size={15} className={testando ? 'animate-pulse' : ''} />
                {testando ? 'Testando conexão...' : 'Testar conexão'}
              </button>
              <p className="mt-1 text-xs text-gray-400">
                Conecta e autentica de verdade no servidor, sem enviar nenhum e-mail — não garante que uma mensagem
                enviada chegue na caixa de entrada do destinatário (isso depende de filtro de spam do lado de lá).
              </p>
              {resultadoTeste && (
                <p
                  className={`mt-2 flex items-center gap-1.5 text-sm ${resultadoTeste.ok ? 'text-emerald-600' : 'text-red-600'}`}
                >
                  {resultadoTeste.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                  {resultadoTeste.mensagem}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => navigate('/integracoes/email')}>
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
