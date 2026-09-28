import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Plug, XCircle } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import {
  getBancoDadosIntegracao,
  createBancoDadosIntegracao,
  updateBancoDadosIntegracao,
  testarConexaoBancoDados,
} from '../../../api/bancoDados.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';

// Só PostgreSQL por enquanto (pedido do usuário) — mais SGBDs entram aqui
// quando o backend souber testar a conexão daquele SGBD (ver
// bancoDados.controller.js::SGBDS_VALIDOS).
const SGBDS = [{ value: 'postgres', label: 'PostgreSQL' }];

// Porta padrão de cada SGBD, pra já vir preenchida ao escolher — hoje só
// Postgres, mas a estrutura já fica pronta pra mais SGBDs.
const PORTA_PADRAO = { postgres: '5432' };

export default function BancoDadosForm() {
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
    sgbd: 'postgres',
    host: '',
    porta: PORTA_PADRAO.postgres,
    banco: '',
    usuario: '',
    senha: '',
    ssl: false,
  });

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    getBancoDadosIntegracao(id)
      .then((data) => {
        if (!active) return;
        setForm({
          empresa_id: String(data.empresa_id),
          nome_conexao: data.nome_conexao,
          sgbd: data.sgbd,
          host: data.host,
          porta: String(data.porta),
          banco: data.banco,
          usuario: data.usuario,
          senha: '',
          ssl: Boolean(data.ssl),
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

  function validarCampos() {
    const errors = {};
    if (!form.empresa_id) errors.empresa_id = 'Selecione uma empresa.';
    if (!form.nome_conexao.trim()) errors.nome_conexao = 'Nome da conexão é obrigatório.';
    if (!form.host.trim()) errors.host = 'Host é obrigatório.';
    if (!form.porta.trim() || Number(form.porta) <= 0) errors.porta = 'Informe uma porta válida.';
    if (!form.banco.trim()) errors.banco = 'Nome do banco de dados é obrigatório.';
    if (!form.usuario.trim()) errors.usuario = 'Usuário é obrigatório.';
    if (!isEdit && !form.senha.trim()) errors.senha = 'Senha é obrigatória.';
    return errors;
  }

  // Testa a conexão de verdade com o SGBD escolhido (sem gravar nada, ver
  // bancoDados.service.js::testarConexao) com os dados que estão no
  // formulário AGORA, antes de salvar.
  async function handleTestarConexao() {
    setResultadoTeste(null);
    const errors = validarCampos();
    setFieldErrors((prev) => ({ ...prev, ...errors }));
    if (Object.keys(errors).length > 0) return;

    setTestando(true);
    try {
      await testarConexaoBancoDados({
        id: isEdit ? Number(id) : undefined,
        sgbd: form.sgbd,
        host: form.host.trim(),
        porta: Number(form.porta),
        banco: form.banco.trim(),
        usuario: form.usuario.trim(),
        ssl: form.ssl,
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

    const errors = validarCampos();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        empresa_id: Number(form.empresa_id),
        nome_conexao: form.nome_conexao.trim(),
        sgbd: form.sgbd,
        host: form.host.trim(),
        porta: Number(form.porta),
        banco: form.banco.trim(),
        usuario: form.usuario.trim(),
        ssl: form.ssl,
        ...(form.senha.trim() ? { senha: form.senha.trim() } : {}),
      };

      if (isEdit) {
        await updateBancoDadosIntegracao(id, payload);
      } else {
        await createBancoDadosIntegracao(payload);
      }
      navigate('/integracoes/banco-dados', { replace: true });
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
        onClick={() => navigate('/integracoes/banco-dados')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Banco de Dados
      </button>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">
          {isEdit ? 'Editar conexão de banco de dados' : 'Nova conexão de banco de dados'}
        </h2>
        <p className="mb-4 text-sm text-gray-500">Informe aqui os dados de acesso ao banco de dados.</p>

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
                  placeholder="ex.: Banco de Produção"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {fieldErrors.nome_conexao && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.nome_conexao}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">SGBD</label>
                <SearchableSelect
                  value={form.sgbd}
                  onChange={(value) => handleChange('sgbd', value)}
                  options={SGBDS}
                  clearable={false}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Banco de Dados</label>
                <input
                  type="text"
                  value={form.banco}
                  onChange={(e) => handleChange('banco', e.target.value)}
                  placeholder="ex.: horizon_fin"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {fieldErrors.banco && <p className="mt-1 text-xs text-red-600">{fieldErrors.banco}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Host</label>
                <input
                  type="text"
                  value={form.host}
                  onChange={(e) => handleChange('host', e.target.value)}
                  placeholder="ex.: 10.0.0.5 ou meuservidor.com.br"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {fieldErrors.host && <p className="mt-1 text-xs text-red-600">{fieldErrors.host}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Porta</label>
                <input
                  type="number"
                  value={form.porta}
                  onChange={(e) => handleChange('porta', e.target.value)}
                  placeholder="ex.: 5432"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {fieldErrors.porta && <p className="mt-1 text-xs text-red-600">{fieldErrors.porta}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Usuário</label>
                <input
                  type="text"
                  value={form.usuario}
                  onChange={(e) => handleChange('usuario', e.target.value)}
                  autoComplete="off"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                {fieldErrors.usuario && <p className="mt-1 text-xs text-red-600">{fieldErrors.usuario}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Senha</label>
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

              <div className="flex items-end">
                <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.ssl}
                    onChange={(e) => handleChange('ssl', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-100"
                  />
                  Usar SSL
                </label>
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
              <Button type="button" variant="secondary" onClick={() => navigate('/integracoes/banco-dados')}>
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
