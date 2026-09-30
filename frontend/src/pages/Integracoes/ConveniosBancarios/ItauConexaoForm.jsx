import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import {
  getItauIntegracao,
  createItauIntegracao,
  updateItauIntegracao,
  gerarCertificadoItau,
  renovarCertificadoItau,
  testarItauConexao,
} from '../../../api/itau.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { TIPOS_CONEXAO, PLACEHOLDER_SEGREDO, estaPreenchido, classesCor, corCampo, corSelect } from './camposConexao';

// Situação do certificado devolvida pelo backend (itau.service.js::statusCertificado).
const STATUS_CERTIFICADO = {
  SEM_CERTIFICADO: { rotulo: 'Certificado não gerado', classes: 'bg-gray-100 text-gray-600' },
  ATIVO: { rotulo: 'Certificado ativo', classes: 'bg-emerald-50 text-emerald-700' },
  RENOVAVEL: { rotulo: 'Renovação disponível', classes: 'bg-amber-50 text-amber-700' },
  VENCIDO: { rotulo: 'Certificado vencido', classes: 'bg-red-50 text-red-700' },
  ERRO: { rotulo: 'Falha na geração', classes: 'bg-red-50 text-red-700' },
};

const ICONE_TESTE = {
  ok: { Icone: CheckCircle2, cor: 'text-emerald-600' },
  aviso: { Icone: AlertTriangle, cor: 'text-amber-600' },
  erro: { Icone: XCircle, cor: 'text-red-600' },
};

const CONTA_VAZIA = { agencia: '', conta: '', dac: '' };
const OU_PADRAO = 'Horizon Fin';

function soDigitos(valor, max) {
  return String(valor || '').replace(/\D/g, '').slice(0, max);
}

function formatarData(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatarDataSimples(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const [a, m, d] = yyyyMmDd.split('-');
  return `${d}/${m}/${a}`;
}

function hojeISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

const statementId = (c) => `${c.agencia}00${c.conta}${c.dac}`;

// Formulário da conexão "API Itaú" (Extrato Conta Corrente). O Itaú manda por CNPJ uma
// planilha com CREDENCIAL (client_id), VALIDADE e TOKEN (temporário, 7 dias, uso único): com
// eles o sistema gera a chave + CSR, emite o certificado dinâmico no Itaú e passa a tirar o
// access_token sozinho. Na criação é renderizado dentro de ConveniosBancariosForm (combobox
// Conexão = API Itaú); na edição tem rota própria /integracoes/contas-bancarias/itau/:id.
export default function ItauConexaoForm({ onTrocarTipo, empresaIdInicial = '', nomeInicial = '' }) {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();

  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [showToken, setShowToken] = useState(false);
  const [novaConta, setNovaConta] = useState(CONTA_VAZIA);
  const [erroConta, setErroConta] = useState('');
  const [conexao, setConexao] = useState(null);
  const [acao, setAcao] = useState(null); // 'gerar' | 'renovar' | 'testar'
  const [aviso, setAviso] = useState(location.state?.aviso || null); // { tipo: 'ok'|'erro', texto }
  const [resultadoTeste, setResultadoTeste] = useState(null);

  const [form, setForm] = useState({
    empresa_id: empresaIdInicial,
    nome_conexao: nomeInicial,
    client_id: '',
    token_temporario: '',
    token_temporario_validade: '',
    cert_ou: OU_PADRAO,
    cert_cidade: '',
    cert_uf: '',
    contas: [],
  });

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  function aplicarConexao(data) {
    setConexao(data);
    setForm({
      empresa_id: String(data.empresa_id),
      nome_conexao: data.nome_conexao,
      client_id: data.client_id,
      token_temporario: '',
      token_temporario_validade: data.token_temporario_validade || '',
      cert_ou: data.cert_ou,
      cert_cidade: data.cert_cidade,
      cert_uf: data.cert_uf,
      contas: data.contas,
    });
  }

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    getItauIntegracao(id)
      .then((data) => active && aplicarConexao(data))
      .catch(() => active && setError('Não foi possível carregar a conexão.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  useEffect(() => {
    if (empresaTravada && empresaIdTravada) {
      setForm((prev) => ({ ...prev, empresa_id: empresaIdTravada }));
    }
  }, [empresaTravada, empresaIdTravada, loading]);

  // Cidade/UF do subject do certificado vêm do cadastro da empresa quando ainda estão vazias
  // (só sugestão — dá pra editar).
  useEffect(() => {
    const empresa = empresas.find((e) => String(e.id) === String(form.empresa_id));
    if (!empresa) return;
    setForm((prev) => ({
      ...prev,
      cert_cidade: prev.cert_cidade || empresa.cidade || '',
      cert_uf: prev.cert_uf || empresa.estado || '',
    }));
  }, [form.empresa_id, empresas]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function adicionarConta() {
    const conta = {
      agencia: soDigitos(novaConta.agencia, 4),
      conta: soDigitos(novaConta.conta, 5),
      dac: soDigitos(novaConta.dac, 1),
    };
    if (conta.agencia.length !== 4 || conta.conta.length !== 5 || conta.dac.length !== 1) {
      setErroConta('Informe agência (4 dígitos), conta (5 dígitos) e DAC (1 dígito).');
      return;
    }
    setErroConta('');
    if (!form.contas.some((c) => statementId(c) === statementId(conta))) {
      setForm((prev) => ({ ...prev, contas: [...prev.contas, conta] }));
    }
    setNovaConta(CONTA_VAZIA);
  }

  function removerConta(alvo) {
    setForm((prev) => ({ ...prev, contas: prev.contas.filter((c) => statementId(c) !== statementId(alvo)) }));
  }

  function handleContaKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      adicionarConta();
    }
  }

  function validar({ exigirToken }) {
    const errors = {};
    if (!form.empresa_id) errors.empresa_id = 'Selecione uma empresa.';
    if (!form.nome_conexao.trim()) errors.nome_conexao = 'Nome da conexão é obrigatório.';
    if (!form.client_id.trim()) errors.client_id = 'Client ID (CREDENCIAL da planilha) é obrigatório.';
    if (exigirToken && !form.token_temporario.trim()) errors.token_temporario = 'Token temporário (TOKEN da planilha) é obrigatório.';
    if (!form.cert_ou.trim()) errors.cert_ou = 'Informe o nome da aplicação.';
    if (!form.cert_cidade.trim()) errors.cert_cidade = 'Informe a cidade.';
    if (!/^[A-Za-z]{2}$/.test(form.cert_uf.trim())) errors.cert_uf = 'UF com 2 letras.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function montarPayload() {
    return {
      empresa_id: Number(form.empresa_id),
      nome_conexao: form.nome_conexao.trim(),
      client_id: form.client_id.trim(),
      token_temporario_validade: form.token_temporario_validade || null,
      cert_ou: form.cert_ou.trim(),
      cert_cidade: form.cert_cidade.trim(),
      cert_uf: form.cert_uf.trim().toUpperCase(),
      contas: form.contas,
      ...(form.token_temporario.trim() ? { token_temporario: form.token_temporario.trim() } : {}),
    };
  }

  async function confirmarUsoDoToken() {
    return confirm({
      title: 'Gerar certificado no Itaú',
      description:
        'O sistema vai gerar a chave privada e enviar o pedido de certificado ao Itaú usando o token temporário. Esse token é de uso único: depois de usado, uma nova emissão só com outro token enviado pelo Itaú. Continuar?',
      confirmLabel: 'Gerar certificado',
    });
  }

  function mensagemEmissao(resultado) {
    const validade = formatarData(resultado.conexao?.certificado_validade);
    if (resultado.token_ok) {
      return { tipo: 'ok', texto: `Certificado gerado (válido até ${validade}) e access token obtido com sucesso.` };
    }
    return {
      tipo: 'aviso',
      texto: `Certificado gerado (válido até ${validade}), mas o access token ainda não foi obtido: ${resultado.token_erro}`,
    };
  }

  // Salvar simples (criação ou edição) — não chama o Itaú.
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!validar({ exigirToken: !isEdit })) return;
    setSaving(true);
    try {
      if (isEdit) {
        aplicarConexao(await updateItauIntegracao(id, montarPayload()));
        setAviso({ tipo: 'ok', texto: 'Conexão salva.' });
      } else {
        await createItauIntegracao(montarPayload());
        navigate('/integracoes/contas-bancarias', { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar a conexão.');
    } finally {
      setSaving(false);
    }
  }

  // Criação: salva e já emite o certificado. Se a emissão falhar a conexão fica salva — a
  // tela de edição abre com o erro, pra trocar o token/dados e tentar de novo.
  async function handleSalvarEGerar() {
    setError('');
    if (!validar({ exigirToken: true })) return;
    if (!(await confirmarUsoDoToken())) return;
    setSaving(true);
    let criada;
    try {
      criada = await createItauIntegracao(montarPayload());
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar a conexão.');
      setSaving(false);
      return;
    }
    let novoAviso;
    try {
      novoAviso = mensagemEmissao(await gerarCertificadoItau(criada.id));
    } catch (err) {
      novoAviso = {
        tipo: 'erro',
        texto: `Conexão salva, mas o certificado não foi gerado: ${err.response?.data?.message || 'falha ao falar com o Itaú.'}`,
      };
    }
    setSaving(false);
    navigate(`/integracoes/contas-bancarias/itau/${criada.id}`, { replace: true, state: { aviso: novoAviso } });
  }

  // Edição: salva o que estiver na tela (ex.: token novo) e emite.
  async function handleGerarCertificado() {
    setAviso(null);
    setResultadoTeste(null);
    setError('');
    if (!validar({ exigirToken: !conexao?.tem_token })) return;
    if (!(await confirmarUsoDoToken())) return;
    setAcao('gerar');
    try {
      await updateItauIntegracao(id, montarPayload());
      const resultado = await gerarCertificadoItau(id);
      aplicarConexao(resultado.conexao);
      setAviso(mensagemEmissao(resultado));
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.response?.data?.message || 'Não foi possível gerar o certificado.' });
      getItauIntegracao(id).then(aplicarConexao).catch(() => {});
    } finally {
      setAcao(null);
    }
  }

  async function handleRenovar() {
    setAviso(null);
    setResultadoTeste(null);
    const ok = await confirm({
      title: 'Renovar certificado',
      description: 'Gera uma nova chave e pede ao Itaú um novo certificado (válido por mais 1 ano). Continuar?',
      confirmLabel: 'Renovar',
    });
    if (!ok) return;
    setAcao('renovar');
    try {
      const resultado = await renovarCertificadoItau(id);
      aplicarConexao(resultado.conexao);
      setAviso({ tipo: 'ok', texto: `Certificado renovado — válido até ${formatarData(resultado.validade)}.` });
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.response?.data?.message || 'Não foi possível renovar o certificado.' });
      getItauIntegracao(id).then(aplicarConexao).catch(() => {});
    } finally {
      setAcao(null);
    }
  }

  async function handleTestar() {
    setAviso(null);
    setResultadoTeste(null);
    setAcao('testar');
    try {
      setResultadoTeste(await testarItauConexao(id));
    } catch (err) {
      setAviso({ tipo: 'erro', texto: err.response?.data?.message || 'Não foi possível testar a conexão.' });
    } finally {
      setAcao(null);
    }
  }

  const tokenVencido = form.token_temporario_validade && form.token_temporario_validade < hojeISO();
  // Com certificado já emitido o token não faz mais falta (só se o Itaú mandar outro) — não
  // pinta de âmbar como se estivesse pendente.
  const corToken = classesCor(
    estaPreenchido(form.token_temporario) || (isEdit && (conexao?.tem_token || conexao?.certificado_status === 'ATIVO' || conexao?.certificado_status === 'RENOVAVEL'))
  );
  const statusCert = STATUS_CERTIFICADO[conexao?.certificado_status] || STATUS_CERTIFICADO.SEM_CERTIFICADO;
  const ocupado = saving || Boolean(acao);

  const classesAviso = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    aviso: 'border-amber-200 bg-amber-50 text-amber-700',
    erro: 'border-red-200 bg-red-50 text-red-700',
  };

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
        <h2 className="mb-1 text-sm font-semibold text-gray-900">{isEdit ? 'Editar conexão' : 'Nova conexão'}</h2>
        <p className="mb-4 text-sm text-gray-500">
          API de Extrato Conta Corrente do Itaú. Use os dados da planilha enviada pelo Itaú para este CNPJ — o sistema gera o
          certificado e renova os tokens de acesso automaticamente.
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
                  disabled={loadingEmpresas || empresaTravada}
                  options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
                  placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
                  emptyMessage="Nenhuma empresa encontrada."
                  corClasses={corSelect(form.empresa_id)}
                />
                <p className="mt-1 text-xs text-gray-400">Tem que ser o mesmo CNPJ da linha da planilha.</p>
                {fieldErrors.empresa_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.empresa_id}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Conexão</label>
                <SearchableSelect
                  value="ITAU"
                  onChange={(value) => value && value !== 'ITAU' && onTrocarTipo?.(value)}
                  options={TIPOS_CONEXAO}
                  clearable={false}
                  disabled={isEdit}
                  corClasses={corSelect('ITAU')}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Nome da conexão</label>
                <input
                  type="text"
                  value={form.nome_conexao}
                  onChange={(e) => handleChange('nome_conexao', e.target.value)}
                  placeholder="ex.: Itaú Extrato"
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${corCampo(form.nome_conexao)}`}
                />
                {fieldErrors.nome_conexao && <p className="mt-1 text-xs text-red-600">{fieldErrors.nome_conexao}</p>}
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Client ID</label>
                <input
                  type="text"
                  value={form.client_id}
                  onChange={(e) => handleChange('client_id', e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 ${corCampo(form.client_id)}`}
                />
                <p className="mt-1 text-xs text-gray-400">Coluna CREDENCIAL da planilha. Vira o CN do certificado.</p>
                {fieldErrors.client_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.client_id}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Token temporário</label>
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'}
                    value={form.token_temporario}
                    onChange={(e) => handleChange('token_temporario', e.target.value)}
                    placeholder={isEdit && conexao?.tem_token ? PLACEHOLDER_SEGREDO : ''}
                    className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 ${corToken}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Coluna TOKEN da planilha — usado uma única vez, para gerar o certificado.
                  {isEdit && conexao?.tem_token && ' Deixe em branco para manter o token salvo.'}
                  {isEdit && !conexao?.tem_token && conexao?.tem_certificado && ' Já foi usado; só informe um novo se o Itaú enviar outro.'}
                </p>
                {fieldErrors.token_temporario && <p className="mt-1 text-xs text-red-600">{fieldErrors.token_temporario}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Validade do token</label>
                <input
                  type="date"
                  value={form.token_temporario_validade}
                  onChange={(e) => handleChange('token_temporario_validade', e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${corCampo(form.token_temporario_validade)}`}
                />
                <p className="mt-1 text-xs text-gray-400">Coluna VALIDADE da planilha (o token vale 7 dias).</p>
                {tokenVencido && (conexao?.tem_token || form.token_temporario) && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle size={12} /> Token vencido — o Itaú deve recusar. Peça um novo token ao Itaú.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-100 p-4">
              <h3 className="text-sm font-medium text-gray-800">Dados do certificado</h3>
              <p className="mb-3 text-xs text-gray-400">
                Vão no pedido de certificado (CSR) enviado ao Itaú, junto com o Client ID. País: BR.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Nome da aplicação</label>
                  <input
                    type="text"
                    value={form.cert_ou}
                    onChange={(e) => handleChange('cert_ou', e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${corCampo(form.cert_ou)}`}
                  />
                  {fieldErrors.cert_ou && <p className="mt-1 text-xs text-red-600">{fieldErrors.cert_ou}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Cidade</label>
                  <input
                    type="text"
                    value={form.cert_cidade}
                    onChange={(e) => handleChange('cert_cidade', e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${corCampo(form.cert_cidade)}`}
                  />
                  {fieldErrors.cert_cidade && <p className="mt-1 text-xs text-red-600">{fieldErrors.cert_cidade}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">UF</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={form.cert_uf}
                    onChange={(e) => handleChange('cert_uf', e.target.value.toUpperCase())}
                    className={`w-full rounded-lg border px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 ${corCampo(form.cert_uf)}`}
                  />
                  {fieldErrors.cert_uf && <p className="mt-1 text-xs text-red-600">{fieldErrors.cert_uf}</p>}
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Contas Itaú</label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={novaConta.agencia}
                  onChange={(e) => setNovaConta((p) => ({ ...p, agencia: soDigitos(e.target.value, 4) }))}
                  onKeyDown={handleContaKeyDown}
                  placeholder="Agência"
                  className={`w-24 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${classesCor(form.contas.length > 0)}`}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={novaConta.conta}
                  onChange={(e) => setNovaConta((p) => ({ ...p, conta: soDigitos(e.target.value, 5) }))}
                  onKeyDown={handleContaKeyDown}
                  placeholder="Conta"
                  className={`w-28 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${classesCor(form.contas.length > 0)}`}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  value={novaConta.dac}
                  onChange={(e) => setNovaConta((p) => ({ ...p, dac: soDigitos(e.target.value, 1) }))}
                  onKeyDown={handleContaKeyDown}
                  placeholder="DAC"
                  className={`w-16 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${classesCor(form.contas.length > 0)}`}
                />
                <Button type="button" variant="secondary" onClick={adicionarConta} className="shrink-0">
                  <Plus size={16} />
                  Adicionar
                </Button>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                Agência (4 dígitos), conta (5 dígitos) e DAC (dígito da conta). A conta precisa ser do mesmo CNPJ da credencial.
                Usadas no teste de conexão.
              </p>
              {erroConta && <p className="mt-1 text-xs text-red-600">{erroConta}</p>}
              {form.contas.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {form.contas.map((c) => (
                    <span
                      key={statementId(c)}
                      title={`Identificador na API: ${statementId(c)}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-3 pr-1.5 text-xs font-medium text-gray-700"
                    >
                      Ag. {c.agencia} · CC {c.conta}-{c.dac}
                      <button
                        type="button"
                        onClick={() => removerConta(c)}
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

            {isEdit && conexao && (
              <div className="rounded-lg border border-gray-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                    <ShieldCheck size={16} className="text-gray-400" />
                    Certificado
                  </h3>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusCert.classes}`}>
                    {statusCert.rotulo}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  {conexao.tem_certificado ? (
                    <>
                      <div className="flex gap-2">
                        <dt className="text-gray-500">Emitido em:</dt>
                        <dd className="text-gray-800">{formatarData(conexao.certificado_emitido_em)}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-gray-500">Válido até:</dt>
                        <dd className="text-gray-800">
                          {formatarData(conexao.certificado_validade)}
                          {conexao.certificado_dias_restantes >= 0 && ` (${conexao.certificado_dias_restantes} dias)`}
                        </dd>
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-500 sm:col-span-2">
                      {conexao.tem_token
                        ? `Pronto para gerar com o token salvo${
                            conexao.token_temporario_validade ? ` (válido até ${formatarDataSimples(conexao.token_temporario_validade)})` : ''
                          }.`
                        : 'Informe o token temporário para gerar o certificado.'}
                    </div>
                  )}
                </dl>
                {conexao.certificado_status === 'RENOVAVEL' && (
                  <p className="mt-2 text-xs text-amber-600">
                    Faltam {conexao.certificado_dias_restantes} dias — o Monitor de Integrações renova sozinho se a rotina estiver
                    agendada, ou renove agora.
                  </p>
                )}
                {conexao.certificado_status === 'VENCIDO' && (
                  <p className="mt-2 text-xs text-red-600">
                    Vencido: peça ao Itaú um novo token temporário, informe acima e gere o certificado de novo.
                  </p>
                )}
                {conexao.ultimo_erro && (
                  <p className="mt-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-700">Último erro: {conexao.ultimo_erro}</p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {(!conexao.tem_certificado || conexao.tem_token || form.token_temporario.trim() || conexao.certificado_status === 'VENCIDO') && (
                    <Button
                      type="button"
                      onClick={handleGerarCertificado}
                      loading={acao === 'gerar'}
                      disabled={ocupado || (!conexao.tem_token && !form.token_temporario.trim())}
                    >
                      <KeyRound size={16} />
                      {conexao.tem_certificado ? 'Gerar novo certificado' : 'Gerar certificado'}
                    </Button>
                  )}
                  {conexao.tem_certificado && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleRenovar}
                      loading={acao === 'renovar'}
                      disabled={ocupado || conexao.certificado_status !== 'RENOVAVEL'}
                      title={
                        conexao.certificado_status === 'RENOVAVEL'
                          ? ''
                          : 'O Itaú só aceita renovar nos últimos 30 dias de validade.'
                      }
                    >
                      <RefreshCw size={16} />
                      Renovar certificado
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleTestar}
                    loading={acao === 'testar'}
                    disabled={ocupado || !conexao.tem_certificado}
                  >
                    <Zap size={16} />
                    Testar conexão
                  </Button>
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  O teste gera um access token com o certificado e consulta o extrato de hoje de cada conta cadastrada (use
                  Salvar antes, se mudou as contas).
                </p>

                {resultadoTeste && (
                  <div
                    className={`mt-3 rounded-lg border p-3 ${
                      resultadoTeste.sucesso ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <p className={`text-sm font-medium ${resultadoTeste.sucesso ? 'text-emerald-700' : 'text-red-700'}`}>
                      {resultadoTeste.sucesso ? 'Conexão funcionando' : 'A conexão não foi confirmada'}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {resultadoTeste.detalhes.map((d) => {
                        const { Icone, cor } = ICONE_TESTE[d.status] || ICONE_TESTE.erro;
                        return (
                          <li key={d.chave} className="flex items-start gap-2 text-xs text-gray-700">
                            <Icone size={14} className={`mt-0.5 shrink-0 ${cor}`} />
                            <span className="break-all">
                              <span className="font-medium">{d.titulo}</span>: {d.mensagem}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {aviso && (
              <div className={`rounded-lg border px-3 py-2 text-sm ${classesAviso[aviso.tipo] || classesAviso.erro}`}>
                {aviso.texto}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => navigate('/integracoes/contas-bancarias')}>
                {isEdit ? 'Voltar' : 'Cancelar'}
              </Button>
              {isEdit ? (
                <Button type="submit" loading={saving} disabled={ocupado}>
                  Salvar
                </Button>
              ) : (
                <>
                  <Button type="submit" variant="secondary" loading={saving} disabled={ocupado}>
                    Só salvar
                  </Button>
                  <Button type="button" onClick={handleSalvarEGerar} loading={saving} disabled={ocupado}>
                    <KeyRound size={16} />
                    Salvar e gerar certificado
                  </Button>
                </>
              )}
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
