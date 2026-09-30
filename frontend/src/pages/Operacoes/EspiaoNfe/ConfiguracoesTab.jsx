import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, Package, Settings, Wrench } from 'lucide-react';
import Card from '../../../components/Card';
import { getConfiguracoesEspiao, salvarConfiguracoesEspiao } from '../../../api/espiao.api';

// Destaque de código/valor dentro dos textos de exemplo — mesmo papel do
// Num.jsx do Motor de Risco, só que em fonte mono (aqui o destaque é um
// código de documento, não um número).
function Cod({ children }) {
  return <strong className="font-mono font-semibold text-gray-800">{children}</strong>;
}

// Parâmetros da Sessão 1 — um por tipo de nota. `chave` é o campo da API
// (ver espiao.service.js::getConfiguracoes); ícone/cor iguais aos do
// cabeçalho da tabela de notas (Produto azul, Serviço violeta), pra ligar de
// relance o parâmetro ao tipo de nota da outra aba.
const CODIGOS_DOCUMENTO = [
  {
    chave: 'codigoDocumentoNfe',
    tipo: 'NF-e',
    nome: 'Notas de produto',
    Icon: Package,
    cor: 'bg-primary-50 text-primary-600',
    label: 'Código do documento — notas de produto (NF-e)',
    desc: 'Tipo de documento do título no contas a pagar quando a nota recebida for de produto (compra de material, mercadoria, equipamento).',
    exemplo: (
      <>
        Com <Cod>NFE</Cod>: a NF-e de uma compra de cimento recebida pela empresa vira, no contas a pagar, um título com
        documento <Cod>NFE</Cod>.
      </>
    ),
    placeholder: 'Ex.: NFE',
  },
  {
    chave: 'codigoDocumentoNfse',
    tipo: 'NFS-e',
    nome: 'Notas de serviço',
    Icon: Wrench,
    cor: 'bg-violet-50 text-violet-600',
    label: 'Código do documento — notas de serviço (NFS-e)',
    desc: 'Tipo de documento do título no contas a pagar quando a nota recebida for de serviço (mão de obra, consultoria, locação com serviço).',
    exemplo: (
      <>
        Com <Cod>NFS</Cod>: a NFS-e de um serviço de terraplanagem recebida pela empresa vira, no contas a pagar, um
        título com documento <Cod>NFS</Cod>.
      </>
    ),
    placeholder: 'Ex.: NFS',
  },
];

const CODIGOS_VAZIOS = Object.fromEntries(CODIGOS_DOCUMENTO.map((c) => [c.chave, '']));

// Mesmo par âmbar (vazio)/azul (preenchido) de MotorRisco/estadoCampo.js —
// sinaliza de relance o que ainda falta configurar.
function estadoCampo(valor, disabled) {
  if (disabled) return 'border-gray-200 bg-gray-50 text-gray-400';
  return valor
    ? 'border-primary-100 bg-primary-50 text-gray-900 hover:border-primary-500'
    : 'border-amber-300 bg-amber-50 text-gray-900 hover:border-amber-400';
}

function formatarDataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Mesmo cabeçalho de seção de MotorRiscoTab.jsx (selo + título + texto).
function SectionHeader({ selo, titulo, texto }) {
  return (
    <div className="border-b border-gray-100 pb-3">
      {selo && <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-gray-400">{selo}</p>}
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      {texto && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-gray-500">{texto}</p>}
    </div>
  );
}

// Uma linha de parâmetro: explicação e exemplo à esquerda, campo à direita —
// mesmo layout de MotorRisco/CampoNumerico.jsx, só que pra texto (código
// curto, sem espaços, sempre em maiúsculas).
function CampoCodigo({ campo, value, onChange, disabled, primeiro }) {
  const { Icon } = campo;
  return (
    <div
      className={`grid grid-cols-1 gap-3 py-4 sm:grid-cols-[1fr_150px] sm:items-start sm:gap-4 ${
        primeiro ? '' : 'border-t border-gray-100'
      }`}
    >
      <div className="flex gap-3">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${campo.cor}`}>
          <Icon size={15} />
        </span>
        <div>
          <p className="text-sm font-medium text-gray-800">{campo.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{campo.desc}</p>
          <p className="mt-2 border-l-2 border-primary-100 pl-2.5 text-xs leading-relaxed text-primary-700">
            {campo.exemplo}
          </p>
        </div>
      </div>
      <input
        type="text"
        value={value}
        maxLength={20}
        disabled={disabled}
        placeholder={campo.placeholder}
        spellCheck={false}
        autoComplete="off"
        aria-label={campo.label}
        onChange={(e) => onChange(campo.chave, e.target.value.replace(/\s/g, '').toUpperCase())}
        className={`w-full rounded-lg border px-3 py-2 text-center font-mono text-sm uppercase tracking-wide transition-colors placeholder:normal-case placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-100 ${estadoCampo(
          value,
          disabled
        )}`}
      />
    </div>
  );
}

// Painel lateral fixo (mesma posição do Simulador do Motor de Risco): mostra,
// em tempo real, com que documento cada tipo de nota vai pro contas a pagar
// e quanto da configuração já está completa — antes mesmo de salvar.
function ResumoConfiguracao({ codigos }) {
  const configurados = CODIGOS_DOCUMENTO.filter((c) => codigos[c.chave]).length;
  const total = CODIGOS_DOCUMENTO.length;
  const completo = configurados === total;

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
        <FileText size={16} className="text-primary-600" />
        <h3 className="text-sm font-semibold text-gray-900">Resumo</h3>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-gray-500">
        Com que documento cada nota recebida por esta empresa vai para o contas a pagar.
      </p>

      <div className="mt-4 space-y-2">
        {CODIGOS_DOCUMENTO.map((campo) => {
          const { Icon } = campo;
          const codigo = codigos[campo.chave];
          return (
            <div key={campo.chave} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2.5">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${campo.cor}`}>
                <Icon size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-800">{campo.nome}</p>
                <p className="text-[11px] text-gray-400">{campo.tipo}</p>
              </div>
              <ArrowRight size={14} className="shrink-0 text-gray-300" />
              {codigo ? (
                <span className="max-w-[96px] truncate rounded-md bg-primary-50 px-2 py-1 font-mono text-xs font-semibold text-primary-700">
                  {codigo}
                </span>
              ) : (
                <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-600">A definir</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Configuração</span>
          <span className={`font-medium tabular-nums ${completo ? 'text-emerald-600' : 'text-amber-600'}`}>
            {configurados} de {total}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ${completo ? 'bg-emerald-500' : 'bg-amber-400'}`}
            style={{ width: `${(configurados / total) * 100}%` }}
          />
        </div>
      </div>
    </Card>
  );
}

// Aba "Configurações" do Espião NFe/NFSe — separada das abas de notas por um
// divisor (ver EspiaoNfeNfsePage.jsx), no mesmo espírito do Motor de Risco
// em Gestão de Cobranças. Parâmetros por empresa; por enquanto só a Sessão 1
// (códigos de documento do contas a pagar). Assim como lá, o botão de salvar
// mora na barra de filtros da página: este componente expõe `salvar()` via
// ref e avisa o pai do estado (`podeSalvar`/`salvando`) via `onStatusChange`.
const ConfiguracoesTab = forwardRef(function ConfiguracoesTab({ empresaId, onStatusChange }, ref) {
  const [codigos, setCodigos] = useState(CODIGOS_VAZIOS);
  const [salvos, setSalvos] = useState(CODIGOS_VAZIOS);
  const [ultimaAlteracao, setUltimaAlteracao] = useState(null); // { em, por } | null
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  function aplicarDoServidor(config) {
    const valores = Object.fromEntries(CODIGOS_DOCUMENTO.map((c) => [c.chave, config[c.chave] ?? '']));
    setCodigos(valores);
    setSalvos(valores);
    setUltimaAlteracao(config.atualizadoEm ? { em: config.atualizadoEm, por: config.atualizadoPorNome } : null);
  }

  // Troca de empresa = contexto novo: descarta avisos e recarrega tudo.
  useEffect(() => {
    setErro('');
    setSucesso('');
    if (!empresaId) {
      setCodigos(CODIGOS_VAZIOS);
      setSalvos(CODIGOS_VAZIOS);
      setUltimaAlteracao(null);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    getConfiguracoesEspiao(empresaId)
      .then((config) => !cancelado && aplicarDoServidor(config))
      .catch(() => !cancelado && setErro('Não foi possível carregar as configurações desta empresa.'))
      .finally(() => !cancelado && setCarregando(false));
    return () => {
      cancelado = true;
    };
  }, [empresaId]);

  function alterarCodigo(chave, valor) {
    setCodigos((prev) => ({ ...prev, [chave]: valor }));
    setSucesso('');
  }

  const alterado = CODIGOS_DOCUMENTO.some((c) => codigos[c.chave] !== salvos[c.chave]);
  const faltando = CODIGOS_DOCUMENTO.filter((c) => !codigos[c.chave]).map((c) => c.nome.toLowerCase());
  const podeSalvar = Boolean(empresaId) && !carregando && !salvando && alterado;

  async function handleSalvar() {
    if (!podeSalvar) return;
    setErro('');
    setSucesso('');
    setSalvando(true);
    try {
      const config = await salvarConfiguracoesEspiao(empresaId, {
        codigoDocumentoNfe: codigos.codigoDocumentoNfe || null,
        codigoDocumentoNfse: codigos.codigoDocumentoNfse || null,
      });
      aplicarDoServidor(config);
      setSucesso('Configurações salvas com sucesso.');
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível salvar as configurações.');
    } finally {
      setSalvando(false);
    }
  }

  // Hooks antes do "sem empresa" abaixo — o pai não pode perder salvar()/o
  // status quando a empresa é desmarcada.
  useImperativeHandle(ref, () => ({ salvar: handleSalvar }));
  useEffect(() => {
    onStatusChange?.({ podeSalvar, salvando });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeSalvar, salvando]);

  if (!empresaId) {
    return (
      <Card className="flex min-h-70 flex-col items-center justify-center rounded-tl-none text-center">
        <Settings size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver e ajustar as configurações do Espião NFe / NFSe dela.
        </p>
      </Card>
    );
  }

  // Um aviso por vez, em ordem de prioridade: erro > sucesso > alterações
  // pendentes > configuração incompleta.
  let aviso = null;
  if (erro) aviso = { tom: 'bg-red-50 text-red-600', Icon: AlertTriangle, texto: erro };
  else if (sucesso) aviso = { tom: 'bg-emerald-50 text-emerald-600', Icon: CheckCircle2, texto: sucesso };
  else if (alterado)
    aviso = { tom: 'bg-primary-50 text-primary-700', Icon: AlertTriangle, texto: 'Há alterações não salvas — clique em "Salvar" no topo da tela.' };
  else if (!carregando && faltando.length > 0)
    aviso = {
      tom: 'bg-amber-50 text-amber-600',
      Icon: AlertTriangle,
      texto: `Falta informar o código do documento de ${faltando.join(' e de ')}.`,
    };

  return (
    <div className="space-y-4">
      {/* Status — fica "colado" na aba ativa (ver Tabs.jsx). */}
      <Card className="rounded-tl-none">
        <p className="text-sm font-medium text-gray-800">
          {carregando
            ? 'Carregando configurações...'
            : ultimaAlteracao
              ? `Última alteração em ${formatarDataHora(ultimaAlteracao.em)}${
                  ultimaAlteracao.por ? ` por ${ultimaAlteracao.por}` : ''
                }`
              : 'Nenhuma configuração salva ainda'}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          Estes parâmetros valem só para a empresa selecionada. Ajuste abaixo e salve quando terminar.
        </p>
        {aviso && (
          <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${aviso.tom}`}>
            <aviso.Icon size={15} className="shrink-0" />
            {aviso.texto}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <Card>
          <SectionHeader
            selo="Sessão 1"
            titulo="Contas a pagar"
            texto={
              <>
                Toda nota recebida aqui é, no fim, uma conta a pagar. Para o título entrar certo no financeiro, ele precisa
                do <strong className="font-medium text-gray-700">código do tipo de documento</strong> — use exatamente o
                código cadastrado no ERP, um para notas de produto e outro para notas de serviço.
              </>
            }
          />
          <div>
            {CODIGOS_DOCUMENTO.map((campo, i) => (
              <CampoCodigo
                key={campo.chave}
                campo={campo}
                value={codigos[campo.chave]}
                onChange={alterarCodigo}
                disabled={carregando || salvando}
                primeiro={i === 0}
              />
            ))}
          </div>
        </Card>

        <div className="lg:sticky lg:top-4">
          <ResumoConfiguracao codigos={codigos} />
        </div>
      </div>
    </div>
  );
});

export default ConfiguracoesTab;
