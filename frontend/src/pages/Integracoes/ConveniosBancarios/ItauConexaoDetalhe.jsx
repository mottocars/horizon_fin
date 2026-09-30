import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, RefreshCw, Save, ShieldCheck, XCircle, Zap } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import {
  getItauConexao,
  atualizarItauConexao,
  gerarNovamenteItau,
  testarTokenItau,
  testarExtratoItau,
  renovarCertificadoItau,
} from '../../../api/itau.api';
import { formatCnpj } from '../../Empresas/format';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { STATUS_ITAU, classesCor, corCampo } from './camposConexao';
import { somenteDigitos } from './itauValidacao';

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2';

// Situações em que a conexão precisa de um token NOVO pra (re)emitir o certificado.
const PRECISA_NOVO_TOKEN = ['GERANDO', 'ERRO_ITAU', 'ERRO_PROCESSAMENTO'];

function formatarData(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
}

function Aviso({ tipo, children }) {
  const estilos = {
    ok: { classes: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icone: CheckCircle2 },
    aviso: { classes: 'border-amber-200 bg-amber-50 text-amber-800', Icone: AlertTriangle },
    erro: { classes: 'border-red-200 bg-red-50 text-red-700', Icone: XCircle },
  };
  const { classes, Icone } = estilos[tipo] || estilos.erro;
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${classes}`}>
      <Icone size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function tipoDoStatus(status) {
  if (status === 'CERTIFICADO_ATIVO' || status === 'ATIVA') return 'ok';
  if (status === 'AGUARDANDO_ESCOPOS' || status === 'GERANDO') return 'aviso';
  return 'erro';
}

function Linha({ rotulo, children, mono = false }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
      <dt className="w-32 shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400 sm:pt-0.5">{rotulo}</dt>
      <dd className={`break-all text-sm text-gray-800 ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

// Tela de uma conexão API Itaú já criada (/integracoes/contas-bancarias/itau/:id).
export default function ItauConexaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();

  const [conexao, setConexao] = useState(null);
  const [erroCarga, setErroCarga] = useState('');
  // Resultado da última ação: { sucesso, mensagem } — começa com o da geração (vindo da tela anterior).
  const [resultado, setResultado] = useState(location.state?.resultado || null);
  const [acao, setAcao] = useState(null);
  const [form, setForm] = useState({ nome: '', agencia: '', conta: '', dac: '' });
  const [erroForm, setErroForm] = useState('');
  const [novoToken, setNovoToken] = useState('');
  const [mostrarToken, setMostrarToken] = useState(false);

  function aplicar(c) {
    setConexao(c);
    setForm({ nome: c.nome, agencia: c.agencia || '', conta: c.conta || '', dac: c.dac || '' });
  }

  useEffect(() => {
    getItauConexao(id)
      .then(aplicar)
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar a conexão.'));
  }, [id]);

  async function executar(nome, fn) {
    setAcao(nome);
    setResultado(null);
    try {
      const r = await fn();
      if (r.conexao) aplicar(r.conexao);
      setResultado({ sucesso: r.sucesso, mensagem: r.mensagem });
    } catch (err) {
      setResultado({ sucesso: false, mensagem: err.response?.data?.message || 'Não foi possível concluir a ação.' });
      getItauConexao(id).then(aplicar).catch(() => {});
    } finally {
      setAcao(null);
    }
  }

  async function salvar() {
    setErroForm('');
    const temConta = form.agencia || form.conta || form.dac;
    if (!form.nome.trim()) return setErroForm('Informe o nome da conexão.');
    if (temConta && !(form.agencia.length === 4 && form.conta.length === 5 && form.dac.length === 1)) {
      return setErroForm('Conta: agência com 4 dígitos, conta com 5 e DAC com 1 (ou deixe os três em branco).');
    }
    setAcao('salvar');
    try {
      aplicar(await atualizarItauConexao(id, { ...form, nome: form.nome.trim() }));
      setResultado({ sucesso: true, mensagem: 'Dados salvos.' });
    } catch (err) {
      setErroForm(err.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setAcao(null);
    }
  }

  async function gerarNovamente() {
    const ok = await confirm({
      title: 'Gerar certificado com novo token',
      description:
        'Uma nova chave será gerada e o novo token temporário será enviado ao Itaú uma única vez. Use somente um token novo, enviado pelo Itaú. Continuar?',
      confirmLabel: 'Gerar certificado',
    });
    if (!ok) return;
    await executar('gerar', () => gerarNovamenteItau(id, { token: novoToken.trim() }));
    setNovoToken('');
  }

  async function renovar() {
    const ok = await confirm({
      title: 'Renovar certificado',
      description: 'Gera uma nova chave e pede ao Itaú um certificado novo, válido por mais 1 ano. O atual continua valendo até dar certo.',
      confirmLabel: 'Renovar',
    });
    if (ok) executar('renovar', () => renovarCertificadoItau(id));
  }

  if (erroCarga) {
    return <Card><p className="text-sm text-red-600">{erroCarga}</p></Card>;
  }
  if (!conexao) {
    return <Card><p className="py-8 text-center text-sm text-gray-400">Carregando...</p></Card>;
  }

  const status = STATUS_ITAU[conexao.status] || STATUS_ITAU.GERANDO;
  const precisaNovoToken = PRECISA_NOVO_TOKEN.includes(conexao.status) || conexao.certificado_vencido;
  const contaSalva = Boolean(conexao.identificador_conta);
  const ocupado = Boolean(acao);
  const identificadorPrevia =
    form.agencia.length === 4 && form.conta.length === 5 && form.dac.length === 1 ? `${form.agencia}00${form.conta}${form.dac}` : null;

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-orange-600">API Itaú</p>
            <h2 className="text-lg font-semibold text-gray-900">{conexao.nome}</h2>
            <p className="text-sm text-gray-500">
              {conexao.empresa_razao_social} · {formatCnpj(conexao.empresa_cnpj)}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${status.classes}`}>{status.rotulo}</span>
            {!conexao.ativo && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">Inativa</span>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {resultado && <Aviso tipo={resultado.sucesso ? 'ok' : 'erro'}>{resultado.mensagem}</Aviso>}
          {(!resultado || resultado.mensagem !== conexao.mensagem_status) && conexao.mensagem_status && (
            <Aviso tipo={tipoDoStatus(conexao.status)}>{conexao.mensagem_status}</Aviso>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <ShieldCheck size={16} className="text-gray-400" />
            Certificado
          </h3>
          <dl className="divide-y divide-gray-50">
            <Linha rotulo="Credencial" mono>{conexao.client_id}</Linha>
            <Linha rotulo="CNPJ">{formatCnpj(conexao.cnpj)}</Linha>
            <Linha rotulo="Razão social">{conexao.razao_social}</Linha>
            <Linha rotulo="Cidade / UF">
              {conexao.cidade} / {conexao.uf}
            </Linha>
            <Linha rotulo="Validade">
              {conexao.tem_certificado ? (
                <>
                  {formatarData(conexao.data_validade_certificado)}{' '}
                  <span className={conexao.certificado_vencido ? 'text-red-600' : conexao.pode_renovar ? 'text-amber-600' : 'text-gray-400'}>
                    {conexao.certificado_vencido ? '(vencido)' : `(${conexao.dias_restantes} dias)`}
                  </span>
                </>
              ) : (
                <span className="text-gray-400">Sem certificado</span>
              )}
            </Linha>
          </dl>

          {conexao.tem_certificado && !conexao.certificado_vencido && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => executar('token', () => testarTokenItau(id))} loading={acao === 'token'} disabled={ocupado}>
                <Zap size={16} />
                Testar token
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={renovar}
                loading={acao === 'renovar'}
                disabled={ocupado || !conexao.pode_renovar}
                title={conexao.pode_renovar ? '' : 'O Itaú só aceita renovar nos últimos 30 dias de validade.'}
              >
                <RefreshCw size={16} />
                Renovar certificado
              </Button>
            </div>
          )}
          {conexao.tem_certificado && !conexao.certificado_vencido && !conexao.pode_renovar && (
            <p className="mt-1.5 text-xs text-gray-400">
              A renovação fica disponível nos últimos 30 dias (automática pelo Monitor de Integrações, se agendada).
            </p>
          )}

          {precisaNovoToken && (
            <div className="mt-4 rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-800">Gerar com um novo token</p>
              <p className="mb-3 text-xs text-gray-500">
                Só use um token NOVO enviado pelo Itaú — o anterior já foi consumido ou recusado.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <input
                    type={mostrarToken ? 'text' : 'password'}
                    value={novoToken}
                    onChange={(e) => setNovoToken(e.target.value)}
                    placeholder="Token temporário"
                    autoComplete="new-password"
                    spellCheck={false}
                    className={`${INPUT} pr-10 font-mono ${corCampo(novoToken)}`}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarToken((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {mostrarToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <Button type="button" onClick={gerarNovamente} loading={acao === 'gerar'} disabled={ocupado || !novoToken.trim()}>
                  <KeyRound size={16} />
                  Gerar certificado
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Conexão e conta do extrato</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nome da conexão</label>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                className={`${INPUT} ${corCampo(form.nome)}`}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Conta Itaú</label>
              <div className="flex flex-wrap gap-2">
                {[
                  ['agencia', 'Agência', 4, 'w-24'],
                  ['conta', 'Conta', 5, 'w-28'],
                  ['dac', 'DAC', 1, 'w-16'],
                ].map(([campo, rotulo, tamanho, largura]) => (
                  <input
                    key={campo}
                    type="text"
                    inputMode="numeric"
                    placeholder={rotulo}
                    value={form[campo]}
                    onChange={(e) => setForm((p) => ({ ...p, [campo]: somenteDigitos(e.target.value).slice(0, tamanho) }))}
                    className={`${largura} rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${classesCor(form[campo].length === tamanho)}`}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {identificadorPrevia ? (
                  <>
                    Identificador na API: <span className="font-mono text-gray-600">{identificadorPrevia}</span>
                  </>
                ) : (
                  'Agência (4 dígitos), conta (5) e DAC (1). A conta precisa ser do mesmo CNPJ da credencial.'
                )}
              </p>
            </div>
            {erroForm && <p className="text-xs text-red-600">{erroForm}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={salvar} loading={acao === 'salvar'} disabled={ocupado}>
                <Save size={16} />
                Salvar
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => executar('extrato', () => testarExtratoItau(id))}
                loading={acao === 'extrato'}
                disabled={ocupado || !contaSalva || !conexao.tem_certificado || conexao.certificado_vencido}
                title={contaSalva ? '' : 'Salve a conta antes de testar.'}
              >
                <Zap size={16} />
                Testar extrato
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              O teste consulta o extrato de hoje. Até o Itaú liberar a consulta (até 2 dias úteis), o resultado esperado é
              &quot;aguardando liberação&quot;.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
