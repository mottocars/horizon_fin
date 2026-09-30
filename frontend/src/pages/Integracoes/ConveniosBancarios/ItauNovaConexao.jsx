import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Search, ShieldAlert } from 'lucide-react';
import Button from '../../../components/Button';
import { conferirDadosItau, gerarCertificadoItau } from '../../../api/itau.api';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { classesCor, corCampo } from './camposConexao';
import { mascararCnpj, previaSubject, somenteDigitos, subjectValido, validarCnpj, validarUuid } from './itauValidacao';

function Etapa({ numero, titulo, descricao, ativa = true, children }) {
  return (
    <section className={`border-t border-gray-100 pt-5 ${ativa ? '' : 'opacity-60'}`}>
      <div className="mb-4 flex items-start gap-3">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            ativa ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'
          }`}
        >
          {numero}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
          {descricao && <p className="text-xs text-gray-500">{descricao}</p>}
        </div>
      </div>
      <div className="sm:pl-9">{children}</div>
    </section>
  );
}

function Campo({ label, dica, erro, ok, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {erro ? (
        <p className="mt-1 text-xs text-red-600">{erro}</p>
      ) : ok ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 size={12} /> {ok}
        </p>
      ) : (
        dica && <p className="mt-1 text-xs text-gray-400">{dica}</p>
      )}
    </div>
  );
}

const INPUT = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2';

// Nova conexão API Itaú, em duas etapas (dentro do card de ConveniosBancariosForm, abaixo de
// Empresa/Conexão): 1) credencial + CNPJ + token → "Buscar dados" consulta o CNPJ; 2) confere
// razão social/cidade/UF (editáveis) e a prévia do certificado → "Gerar certificado". O token
// é de uso único: só vai ao backend no clique final, e o backend não tenta de novo.
export default function ItauNovaConexao({ empresa }) {
  const navigate = useNavigate();
  const confirm = useConfirm();

  const [dados, setDados] = useState({ nome: '', client_id: '', cnpj: '', token: '' });
  const [mostrarToken, setMostrarToken] = useState(false);
  const [tentouBuscar, setTentouBuscar] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState('');
  // Resultado da conferência: { razao_social, cidade, uf, consulta_ok, aviso, chave }
  const [conferencia, setConferencia] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [erroGeracao, setErroGeracao] = useState('');
  const cnpjDaEmpresa = useRef('');

  // CNPJ sugerido = o da empresa escolhida (a credencial do Itaú é por CNPJ). Só substitui se
  // o campo estiver vazio ou ainda com o CNPJ sugerido antes.
  useEffect(() => {
    const novo = empresa?.cnpj ? mascararCnpj(empresa.cnpj) : '';
    setDados((prev) => (prev.cnpj === '' || prev.cnpj === cnpjDaEmpresa.current ? { ...prev, cnpj: novo } : prev));
    cnpjDaEmpresa.current = novo;
  }, [empresa?.cnpj]);

  const chaveAtual = `${dados.client_id.trim().toLowerCase()}|${somenteDigitos(dados.cnpj)}`;
  const conferenciaVale = conferencia && conferencia.chave === chaveAtual;

  const erros = {
    nome: !dados.nome.trim() ? 'Informe o nome da conexão.' : '',
    client_id: !dados.client_id.trim()
      ? 'Informe a credencial.'
      : !validarUuid(dados.client_id)
        ? 'Formato esperado: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.'
        : '',
    cnpj: !validarCnpj(dados.cnpj) ? 'CNPJ inválido.' : '',
    token: !dados.token.trim() ? 'Informe o token temporário.' : '',
  };
  const mostrarErro = (campo) => (tentouBuscar || dados[campo] ? erros[campo] : '');

  const subject = previaSubject({
    clientId: dados.client_id,
    razaoSocial: conferencia?.razao_social,
    cidade: conferencia?.cidade,
    uf: conferencia?.uf,
  });
  const podeGerar = Boolean(empresa) && conferenciaVale && subjectValido(subject) && !erros.token && !erros.nome && !gerando;

  function alterar(campo, valor) {
    setDados((prev) => ({ ...prev, [campo]: valor }));
  }

  function alterarConferencia(campo, valor) {
    setConferencia((prev) => ({ ...prev, [campo]: valor }));
  }

  async function buscarDados() {
    setTentouBuscar(true);
    setErroBusca('');
    if (!empresa) {
      setErroBusca('Selecione a empresa antes de continuar.');
      return;
    }
    if (Object.values(erros).some(Boolean)) return;
    setBuscando(true);
    try {
      const r = await conferirDadosItau({ nome: dados.nome.trim(), client_id: dados.client_id.trim(), cnpj: dados.cnpj });
      setConferencia({ ...r, uf: (r.uf || '').toUpperCase(), chave: chaveAtual });
    } catch (err) {
      setErroBusca(err.response?.data?.message || 'Não foi possível validar os dados.');
    } finally {
      setBuscando(false);
    }
  }

  async function gerarCertificado() {
    setErroGeracao('');
    const ok = await confirm({
      title: 'Gerar certificado no Itaú',
      description:
        'O token temporário será usado agora e não poderá ser usado de novo. Se o Itaú recusar, será preciso pedir um novo token. Os dados do certificado estão corretos?',
      confirmLabel: 'Gerar certificado',
    });
    if (!ok) return;
    setGerando(true);
    try {
      const r = await gerarCertificadoItau({
        empresa_id: Number(empresa.id),
        nome: dados.nome.trim(),
        client_id: dados.client_id.trim(),
        cnpj: somenteDigitos(dados.cnpj),
        token: dados.token.trim(),
        razao_social: conferencia.razao_social,
        cidade: conferencia.cidade,
        uf: conferencia.uf,
      });
      navigate(`/integracoes/contas-bancarias/itau/${r.conexao.id}`, {
        replace: true,
        state: { resultado: { sucesso: r.sucesso, mensagem: r.mensagem } },
      });
    } catch (err) {
      // Erro antes de chamar o Itaú (validação/configuração) — o token não foi usado.
      setErroGeracao(err.response?.data?.message || 'Não foi possível gerar o certificado.');
      setGerando(false);
    }
  }

  return (
    <div className="space-y-5">
      <Etapa
        numero={1}
        titulo="Credencial do Itaú"
        descricao="Dados da planilha enviada pelo Itaú para este CNPJ."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo label="Nome da conexão" erro={mostrarErro('nome')} dica="Identifica esta conexão na lista.">
              <input
                type="text"
                value={dados.nome}
                onChange={(e) => alterar('nome', e.target.value)}
                placeholder="ex.: Itaú Extrato"
                className={`${INPUT} ${corCampo(dados.nome)}`}
              />
            </Campo>
          </div>

          <Campo
            label="Credencial (client_id)"
            erro={mostrarErro('client_id')}
            ok={!erros.client_id ? 'Formato válido' : ''}
            dica="Coluna CREDENCIAL da planilha."
          >
            <input
              type="text"
              value={dados.client_id}
              onChange={(e) => alterar('client_id', e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              spellCheck={false}
              autoComplete="off"
              className={`${INPUT} font-mono ${corCampo(dados.client_id)}`}
            />
          </Campo>

          <Campo label="CNPJ" erro={mostrarErro('cnpj')} ok={!erros.cnpj ? 'CNPJ válido' : ''} dica="Coluna CNPJ da planilha.">
            <input
              type="text"
              inputMode="numeric"
              value={dados.cnpj}
              onChange={(e) => alterar('cnpj', mascararCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
              className={`${INPUT} ${corCampo(dados.cnpj)}`}
            />
          </Campo>

          <div className="sm:col-span-2">
            <Campo
              label="Token temporário"
              erro={mostrarErro('token')}
              dica="Coluna TOKEN da planilha. Uso único: só é enviado ao Itaú ao gerar o certificado e não fica gravado."
            >
              <div className="relative">
                <input
                  type={mostrarToken ? 'text' : 'password'}
                  value={dados.token}
                  onChange={(e) => alterar('token', e.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  className={`${INPUT} pr-10 font-mono ${corCampo(dados.token)}`}
                />
                <button
                  type="button"
                  onClick={() => setMostrarToken((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title={mostrarToken ? 'Ocultar' : 'Mostrar'}
                >
                  {mostrarToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Campo>
          </div>
        </div>

        {erroBusca && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erroBusca}</div>}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant={conferenciaVale ? 'secondary' : 'primary'} onClick={buscarDados} loading={buscando}>
            <Search size={16} />
            {conferenciaVale ? 'Buscar dados de novo' : 'Buscar dados'}
          </Button>
          {conferencia && !conferenciaVale && (
            <span className="flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle size={12} /> A credencial ou o CNPJ mudou — busque os dados de novo.
            </span>
          )}
        </div>
      </Etapa>

      <Etapa
        numero={2}
        titulo="Conferência e geração do certificado"
        descricao={conferenciaVale ? 'Confira os dados que vão dentro do certificado.' : 'Disponível depois de "Buscar dados".'}
        ativa={Boolean(conferenciaVale)}
      >
        {conferenciaVale && (
          <div className="space-y-4">
            {conferencia.consulta_ok ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                Dados encontrados na Receita Federal. Ajuste se precisar.
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                {conferencia.aviso}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="sm:col-span-4">
                <Campo label="Razão social">
                  <input
                    type="text"
                    value={conferencia.razao_social}
                    onChange={(e) => alterarConferencia('razao_social', e.target.value)}
                    className={`${INPUT} ${corCampo(conferencia.razao_social)}`}
                  />
                </Campo>
              </div>
              <div className="sm:col-span-3">
                <Campo label="Cidade">
                  <input
                    type="text"
                    value={conferencia.cidade}
                    onChange={(e) => alterarConferencia('cidade', e.target.value)}
                    className={`${INPUT} ${corCampo(conferencia.cidade)}`}
                  />
                </Campo>
              </div>
              <Campo label="UF">
                <input
                  type="text"
                  maxLength={2}
                  value={conferencia.uf}
                  onChange={(e) => alterarConferencia('uf', e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())}
                  className={`${INPUT} uppercase ${classesCor(/^[A-Z]{2}$/.test(conferencia.uf))}`}
                />
              </Campo>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Como vai no certificado</p>
              <dl className="grid grid-cols-[3rem_1fr] gap-x-2 gap-y-1 font-mono text-xs text-gray-800">
                {Object.entries(subject).map(([campo, valor]) => (
                  <div key={campo} className="contents">
                    <dt className="text-gray-400">{campo}</dt>
                    <dd className="break-all">{valor || <span className="text-red-500">(vazio)</span>}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-xs text-gray-400">
                Sem acentos e símbolos (/ \ = + , ; &quot; &lt; &gt; #), cidade em maiúsculas, até 64 caracteres por campo.
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              O token temporário é de uso único. Ao gerar, ele é enviado ao Itaú uma única vez — sem nova tentativa automática.
            </div>

            {erroGeracao && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erroGeracao}</div>}

            {gerando && (
              <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
                <Loader2 size={16} className="animate-spin" />
                Gerando a chave e solicitando o certificado ao Itaú. Não feche esta página.
              </div>
            )}
          </div>
        )}
      </Etapa>

      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <Button type="button" variant="secondary" onClick={() => navigate('/integracoes/contas-bancarias')} disabled={gerando}>
          Cancelar
        </Button>
        <Button type="button" onClick={gerarCertificado} disabled={!podeGerar} loading={gerando}>
          <KeyRound size={16} />
          Gerar certificado
        </Button>
      </div>
    </div>
  );
}
