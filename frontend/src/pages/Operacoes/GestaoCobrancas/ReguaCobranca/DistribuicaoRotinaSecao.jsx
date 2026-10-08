import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  History,
  Pause,
  Play,
  Shuffle,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import Button from '../../../../components/Button';
import Card from '../../../../components/Card';
import Modal from '../../../../components/Modal';
import SearchableSelect from '../../../../components/SearchableSelect';
import { useAuth } from '../../../../auth/AuthContext';
import { useConfirm } from '../../../../confirm/ConfirmContext';
import {
  adicionarAtendenteDistribuicao,
  distribuirHojeReguaCobranca,
  getDistribuicaoReguaCobranca,
  pausarAtendenteDistribuicao,
  removerAtendenteDistribuicao,
  salvarConfigDistribuicaoReguaCobranca,
  substituirAtendenteDistribuicao,
} from '../../../../api/reguaCobranca.api';
import { ParametroLinha, SectionHeader } from './ParametrosLayout';

// Opções de "Distribuição da Rotina" (ver backend regua-cobranca/
// distribuicao.service.js). Mesmo visual de cartão-rádio do "Tipo de
// Comunicação" logo abaixo (ConfiguracoesGlobaisPainel.jsx).
const MODOS = [
  {
    valor: 'etapa',
    titulo: 'Responsável por etapa',
    descricao: 'Cada etapa da régua tem um responsável, que recebe na Rotina tudo o que entra naquela etapa.',
  },
  {
    valor: 'automatica',
    titulo: 'Distribuição automática',
    descricao:
      'Todo dia os clientes da Rotina são repartidos entre os atendentes escolhidos, de forma igual em quantidade, valor e tempo de atraso.',
  },
];

const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const horaBR = (ts) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
const dataHoraBR = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

function descreverAgendamento(ag) {
  if (!ag || !ag.ativo) return null;
  if (ag.frequencia === 'semanal') return `semanal às ${ag.horario}`;
  if (ag.frequencia === 'mensal') return `mensal às ${ag.horario}`;
  return `todo dia às ${ag.horario}`;
}

// Barrinha proporcional (comparar a carga de cada atendente de relance).
function Barra({ valor, maximo }) {
  const pct = maximo > 0 ? Math.max(4, Math.round((valor / maximo) * 100)) : 0;
  return (
    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <span className="block h-full rounded-full bg-primary-500" style={{ width: `${valor > 0 ? pct : 0}%` }} />
    </span>
  );
}

function ModalPausa({ atendente, dataHoje, onClose, onConfirmar }) {
  const [ate, setAte] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => {
    setAte('');
    setErro('');
  }, [atendente]);

  async function confirmar() {
    if (!ate) return setErro('Informe até quando a pessoa fica fora.');
    setSalvando(true);
    try {
      await onConfirmar(ate);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível pausar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={Boolean(atendente)} onClose={onClose} title={`Pausar ${atendente?.nome || ''}`}>
      <div className="space-y-4 text-sm text-gray-600">
        <p>
          Use para férias e afastamentos. A pessoa continua na lista e mantém a carteira. Enquanto estiver fora, os clientes dela
          que aparecerem na Rotina são atendidos pelos outros como <b className="font-medium text-gray-800">cobertura</b> e voltam
          para ela no retorno.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-700">Fora até (inclusive)</span>
          <input
            id="pausa-ate"
            type="date"
            min={dataHoje}
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </label>
        <p className="text-xs text-gray-500">
          Se a Rotina de hoje já foi distribuída, use <b className="font-medium">Redistribuir hoje</b> depois de pausar para os
          clientes de hoje irem para cobertura.
        </p>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} loading={salvando}>Pausar</Button>
        </div>
      </div>
    </Modal>
  );
}

function ModalSubstituir({ atendente, elegiveis, onClose, onConfirmar }) {
  const [para, setPara] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => {
    setPara('');
    setErro('');
  }, [atendente]);

  async function confirmar() {
    if (!para) return setErro('Escolha quem assume a vaga.');
    setSalvando(true);
    try {
      await onConfirmar(para);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível substituir.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={Boolean(atendente)} onClose={onClose} title={`Substituir ${atendente?.nome || ''}`}>
      <div className="space-y-4 text-sm text-gray-600">
        <p>
          A vaga continua, só muda a pessoa. Quem entra recebe a <b className="font-medium text-gray-800">carteira inteira</b> (
          {atendente?.carteira ?? 0} cliente(s)) e o <b className="font-medium text-gray-800">placar do mês</b> de{' '}
          {atendente?.nome}, sem redistribuir nada. O que {atendente?.nome} já trabalhou hoje continua com o nome dele(a) no
          histórico. O resto da Rotina de hoje passa para quem entra.
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-700">Quem assume</span>
          <SearchableSelect
            value={para}
            onChange={setPara}
            options={elegiveis.map((u) => ({ value: u.id, label: u.nome }))}
            placeholder="Escolha um usuário"
            emptyMessage="Nenhum usuário disponível (todos já são atendentes)."
          />
        </label>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} loading={salvando}>Substituir</Button>
        </div>
      </div>
    </Modal>
  );
}

function ModalRedistribuir({ open, painel, onClose, onConfirmar }) {
  const [equilibrar, setEquilibrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (open) {
      setEquilibrar(false);
      setErro('');
    }
  }, [open]);

  async function confirmar() {
    setSalvando(true);
    try {
      await onConfirmar(equilibrar);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível redistribuir.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Redistribuir a Rotina de hoje" maxWidthClass="max-w-lg">
      <div className="space-y-4 text-sm text-gray-600">
        <p>A Rotina de hoje é refeita com a equipe atual, pela mesma regra da distribuição diária:</p>
        <ul className="space-y-2">
          <li className="flex gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
            <span>
              <b className="font-medium text-gray-800">O que já foi trabalhado hoje não muda de dono.</b> Cliente com WhatsApp, e-mail
              ou ligação registrado hoje fica com quem registrou.
            </span>
          </li>
          <li className="flex gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
            <span>
              Cliente de quem saiu da lista é <b className="font-medium text-gray-800">liberado</b> e redistribuído. Cliente de quem
              está pausado vai para <b className="font-medium text-gray-800">cobertura</b>.
            </span>
          </li>
          <li className="flex gap-2">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-500" />
            <span>A mudança fica registrada em "Últimas mudanças".</span>
          </li>
        </ul>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
          <input
            id="redistribuir-equilibrar"
            type="checkbox"
            checked={equilibrar}
            onChange={(e) => setEquilibrar(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-100"
          />
          <span>
            <span className="block font-medium text-gray-800">Repassar parte da carteira para equilibrar</span>
            <span className="mt-0.5 block text-xs text-gray-500">
              Indicado quando alguém novo entrou. Clientes passam de quem tem a maior carteira para quem tem a menor, até a
              diferença ser de no máximo 1. Só entram clientes sem contato registrado nos últimos 7 dias, para não interromper
              uma negociação em andamento.
            </span>
          </span>
        </label>
        {painel?.hoje && (
          <p className="text-xs text-gray-500">
            Hoje: {painel.hoje.total_clientes} cliente(s) na Rotina, entre{' '}
            {painel.participantes.filter((p) => !p.pausado_ate).length} atendente(s) ativo(s).
          </p>
        )}
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} loading={salvando}>
            <Shuffle size={15} />
            Redistribuir hoje
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Campo "Liberação da carteira" com buffer local — grava no blur, igual aos
// demais campos das Configurações Globais.
function CampoLiberacao({ valor, disabled, onCommit }) {
  const [local, setLocal] = useState(String(valor));
  useEffect(() => setLocal(String(valor)), [valor]);
  return (
    <input
      id="dias-liberacao"
      type="number"
      min={1}
      max={365}
      value={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== String(valor) && local !== '') onCommit(Number(local));
        else setLocal(String(valor));
      }}
      className="w-full rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-right font-mono text-sm tabular-nums transition-colors hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:border-gray-200 disabled:bg-gray-50"
    />
  );
}

// Bloco "Distribuição da Rotina" das Configurações Globais: escolhe o modo
// e, na Distribuição automática, administra os atendentes (entrar, pausar,
// substituir, sair), mostra a situação da distribuição de hoje e o
// equilíbrio entre eles, e permite redistribuir. O horário da distribuição
// diária mora no Monitor de Integrações (rotina "Distribuição da Rotina de
// Cobrança") — aqui só mostra e leva pra lá.
export default function DistribuicaoRotinaSecao({ empresaId }) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const podeEditar = user?.permissao === 'MASTER' || user?.permissao === 'ADMINISTRADOR';

  const [painel, setPainel] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [novoAtendente, setNovoAtendente] = useState('');
  const [pausando, setPausando] = useState(null);
  const [substituindo, setSubstituindo] = useState(null);
  const [redistribuindo, setRedistribuindo] = useState(false);
  const [logAberto, setLogAberto] = useState(false);

  const carregar = useCallback(() => {
    if (!empresaId) return;
    getDistribuicaoReguaCobranca(empresaId)
      .then(setPainel)
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar a distribuição.'));
  }, [empresaId]);

  useEffect(() => {
    setPainel(null);
    setErro('');
    setAviso('');
    carregar();
  }, [carregar]);

  // Toda escrita devolve o painel inteiro — só aplica.
  // `erroNoModal`: a ação veio de um modal, que mostra o erro ele mesmo.
  async function executar(chave, fn, mensagemOk, { erroNoModal = false } = {}) {
    setOcupado(chave);
    setErro('');
    setAviso('');
    try {
      const resposta = await fn();
      setPainel(resposta);
      if (resposta.resultado) setAviso(resposta.resultado);
      else if (mensagemOk) setAviso(mensagemOk);
      return resposta;
    } catch (err) {
      if (!erroNoModal) setErro(err.response?.data?.message || 'Não foi possível concluir a ação.');
      throw err;
    } finally {
      setOcupado('');
    }
  }

  const automatica = painel?.config.modo === 'automatica';
  const maximos = useMemo(() => {
    const lista = painel?.participantes || [];
    return {
      clientes: Math.max(0, ...lista.map((p) => p.hoje.clientes)),
      valor: Math.max(0, ...lista.map((p) => p.hoje.valor)),
      carteira: Math.max(0, ...lista.map((p) => p.carteira)),
      media: Math.max(0, ...lista.map((p) => p.mes.media)),
    };
  }, [painel]);

  if (!painel) {
    return (
      <Card>
        <SectionHeader selo="Sessão 1" titulo="Rotina e atendentes" />
        <div className="py-6 text-center text-sm text-gray-400">{erro || 'Carregando...'}</div>
      </Card>
    );
  }

  async function trocarModo(modo) {
    if (modo === painel.config.modo || !podeEditar) return;
    if (modo === 'automatica') {
      const ok = await confirm({
        title: 'Ligar a distribuição automática?',
        description:
          'A coluna "Responsável" some da régua e a Rotina passa a ser repartida entre os atendentes que você escolher aqui. Os responsáveis das etapas ficam guardados caso você volte para "Responsável por etapa".',
        confirmLabel: 'Ligar',
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: 'Voltar para "Responsável por etapa"?',
        description:
          'A Rotina volta a seguir o responsável de cada etapa da régua. Atendentes, carteiras e o histórico da distribuição ficam guardados.',
        confirmLabel: 'Voltar',
        variant: 'warning',
      });
      if (!ok) return;
    }
    await executar('modo', () => salvarConfigDistribuicaoReguaCobranca(empresaId, { modo })).catch(() => {});
  }

  async function remover(p) {
    const ok = await confirm({
      title: `Tirar ${p.nome} da distribuição?`,
      description: `${p.nome} para de receber clientes. Os ${p.carteira} cliente(s) da carteira dele(a) voltam para a distribuição como "liberados" quando aparecerem na Rotina. O que já foi distribuído hoje só muda de dono com "Redistribuir hoje". Para trocar uma pessoa por outra mantendo a carteira, use "Substituir".`,
      confirmLabel: 'Tirar da distribuição',
      variant: 'warning',
    });
    if (!ok) return;
    await executar(`remover-${p.usuario_id}`, () => removerAtendenteDistribuicao(empresaId, p.usuario_id), `${p.nome} saiu da distribuição.`).catch(
      () => {}
    );
  }

  const agendamento = descreverAgendamento(painel.agendamento);
  const linkMonitor = `/integracoes/monitor?empresa_id=${empresaId}`;
  const ativos = painel.participantes.filter((p) => !p.pausado_ate).length;
  const avisos = [];
  if (automatica) {
    if (painel.participantes.length === 0) avisos.push('Adicione os atendentes que vão receber a Rotina.');
    else if (ativos === 0) avisos.push('Todos os atendentes estão pausados: a Rotina de hoje não tem para quem ir.');
    if (painel.hoje.equipe_mudou) avisos.push('A equipe mudou depois da distribuição de hoje. Use "Redistribuir hoje" para refazer o dia.');
    if (painel.hoje.distribuida && painel.hoje.sem_distribuicao > 0)
      avisos.push(
        `${painel.hoje.sem_distribuicao} cliente(s) entraram na Rotina de hoje depois da distribuição (base atualizada). Use "Distribuir agora" para entregá-los.`
      );
    if (painel.carteira_sem_atendente > 0)
      avisos.push(
        `${painel.carteira_sem_atendente} cliente(s) estão na carteira de quem saiu da distribuição. Eles voltam à distribuição quando aparecerem na Rotina.`
      );
  }

  return (
    <Card>
      <SectionHeader
        selo="Sessão 1"
        titulo="Rotina e atendentes"
        texto="Quem recebe, na aba Rotinas, os clientes que entram na régua a cada dia: o responsável de cada etapa ou uma distribuição automática entre atendentes."
        acao={
          automatica && (
            <Link
              to={`/operacoes/gestao-de-cobrancas/distribuicao-automatica?empresa_id=${empresaId}`}
              className="inline-flex items-center gap-1 rounded-full border border-primary-100 bg-primary-50 px-2.5 py-1 text-[11px] font-medium text-primary-700 hover:bg-primary-100"
              title="Como funciona a distribuição automática"
            >
              <HelpCircle size={12} />
              Como funciona a distribuição?
            </Link>
          )
        }
      />
      {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}
      {aviso && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{aviso}</p>}

      <ParametroLinha
        primeiro
        largo
        label="Distribuição da Rotina"
        desc="Define de onde vem o responsável de cada cliente da Rotina. Na distribuição automática, a régua deixa de ter responsável por etapa."
        exemplo={
          <>
            Com <b className="font-semibold">Responsável por etapa</b>: tudo que entra em D+5 vai para quem responde pelo D+5. Com{' '}
            <b className="font-semibold">Distribuição automática</b>: 40 clientes no dia entre 2 atendentes viram 20 para cada uma,
            com a mesma mistura de atraso e valores parecidos.
          </>
        }
      >
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Distribuição da Rotina">
        {MODOS.map((opcao) => {
          const selecionado = painel.config.modo === opcao.valor;
          return (
            <button
              key={opcao.valor}
              type="button"
              role="radio"
              aria-checked={selecionado}
              disabled={!podeEditar || ocupado === 'modo'}
              onClick={() => trocarModo(opcao.valor)}
              className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed ${
                selecionado ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-100' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  selecionado ? 'border-primary-600' : 'border-gray-300'
                }`}
              >
                {selecionado && <span className="h-2 w-2 rounded-full bg-primary-600" />}
              </span>
              <span>
                <span className="block text-sm font-medium text-gray-700">{opcao.titulo}</span>
                <span className="mt-0.5 block text-xs text-gray-500">{opcao.descricao}</span>
              </span>
            </button>
          );
        })}
      </div>

        {!podeEditar && <p className="text-xs text-gray-400">Só Master e Administrador podem alterar a distribuição.</p>}
      </ParametroLinha>

      {automatica && (
        <ParametroLinha
          label="Liberar o cliente da carteira com"
          desc="Dias sem aparecer na Rotina até o cliente deixar de ser da carteira do atendente. Enquanto está na carteira, o cliente sempre volta para a mesma pessoa."
          exemplo={
            <>
              Com <b className="font-semibold">{painel.config.dias_liberacao}</b> dias: o cliente pagou a parcela de setembro e só voltou
              à Rotina 25 dias depois, com a de outubro → é distribuído de novo, como cliente novo. Se tivesse voltado em 6 dias,
              continuaria com a mesma atendente.
            </>
          }
        >
          <CampoLiberacao
            valor={painel.config.dias_liberacao}
            disabled={!podeEditar}
            onCommit={(dias) =>
              executar('liberacao', () => salvarConfigDistribuicaoReguaCobranca(empresaId, { dias_liberacao: dias })).catch(() => {})
            }
          />
          <span className="w-16 shrink-0 text-xs text-gray-400">dias</span>
        </ParametroLinha>
      )}

      {automatica && (
        <ParametroLinha
          largo
          label="Atendentes"
          desc="Quem recebe os clientes da Rotina. Pause em férias (os clientes dela ficam em cobertura com os outros), substitua mantendo a carteira e o placar do mês, ou tire da distribuição."
        >
          <div className="space-y-4">
          {/* Situação de hoje + ações do dia */}
          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                {painel.hoje.distribuida ? (
                  <CheckCircle2 size={16} className="text-emerald-500" />
                ) : (
                  <CalendarClock size={16} className="text-amber-500" />
                )}
                <span className="font-medium text-gray-800">
                  {painel.hoje.distribuida
                    ? `Rotina de hoje distribuída${painel.hoje.gerado_em ? ` às ${horaBR(painel.hoje.gerado_em)}` : ''}`
                    : 'Rotina de hoje ainda não distribuída'}
                </span>
                <span className="text-gray-500">· {painel.hoje.total_clientes} cliente(s) na Rotina</span>
              </div>
              <p className="text-xs text-gray-500">
                Distribuição diária:{' '}
                {agendamento ? (
                  <b className="font-medium text-gray-700">{agendamento}</b>
                ) : (
                  <b className="font-medium text-amber-600">não agendada</b>
                )}{' '}
                no Monitor de Integrações ·{' '}
                <Link to={linkMonitor} className="font-medium text-primary-600 hover:text-primary-700 hover:underline">
                  {agendamento ? 'alterar horário' : 'agendar'}
                </Link>
                {painel.ultima_execucao?.status === 'erro' && (
                  <span className="ml-1 text-red-600">· a última execução falhou: {painel.ultima_execucao.erro}</span>
                )}
              </p>
            </div>
            {podeEditar && (
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="secondary"
                  loading={ocupado === 'distribuir'}
                  disabled={ativos === 0 || Boolean(ocupado)}
                  onClick={() => executar('distribuir', () => distribuirHojeReguaCobranca(empresaId)).catch(() => {})}
                  title="Distribui só os clientes de hoje que ainda não têm dono (o resto não muda)"
                >
                  <Play size={15} />
                  Distribuir agora
                </Button>
                <Button disabled={ativos === 0 || Boolean(ocupado)} onClick={() => setRedistribuindo(true)}>
                  <Shuffle size={15} />
                  Redistribuir hoje
                </Button>
              </div>
            )}
          </div>

          {avisos.length > 0 && (
            <div className="space-y-1 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
              {avisos.map((a) => (
                <p key={a} className="flex items-start gap-2 text-xs text-amber-700">
                  <AlertTriangle size={14} className="mt-px shrink-0" />
                  {a}
                </p>
              ))}
            </div>
          )}

          {/* Atendentes */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-3 py-2 font-medium">Atendente</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 text-right font-medium" title="Clientes fixos com este atendente (continuidade)">
                    Carteira
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Hoje · clientes</th>
                  <th className="px-3 py-2 text-right font-medium">Hoje · valor</th>
                  <th className="px-3 py-2 text-right font-medium" title="Valor recebido no mês dividido pelos dias trabalhados">
                    Média/dia no mês
                  </th>
                  {podeEditar && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {painel.participantes.length === 0 ? (
                  <tr>
                    <td colSpan={podeEditar ? 7 : 6} className="px-3 py-5 text-center text-xs text-gray-400">
                      Nenhum atendente ainda. Adicione abaixo quem vai receber a Rotina.
                    </td>
                  </tr>
                ) : (
                  painel.participantes.map((p) => (
                    <tr key={p.usuario_id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-medium text-gray-800">{p.nome}</span>
                        {p.herdado_de_nome && (
                          <span className="block text-[11px] text-gray-400">assumiu a vaga de {p.herdado_de_nome}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {p.pausado_ate ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                            <Pause size={11} />
                            Fora até {dataBR(p.pausado_ate)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Ativo
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                        {p.carteira}
                        <Barra valor={p.carteira} maximo={maximos.carteira} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                        {p.hoje.clientes}
                        <span className="text-gray-400"> · {p.hoje.titulos} tít.</span>
                        <Barra valor={p.hoje.clientes} maximo={maximos.clientes} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                        {moeda(p.hoje.valor)}
                        <Barra valor={p.hoje.valor} maximo={maximos.valor} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-gray-700">
                        {moeda(p.mes.media)}
                        <span className="text-gray-400"> · {p.mes.dias}d</span>
                        <Barra valor={p.mes.media} maximo={maximos.media} />
                      </td>
                      {podeEditar && (
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            {p.pausado_ate ? (
                              <button
                                type="button"
                                onClick={() =>
                                  executar(`pausa-${p.usuario_id}`, () => pausarAtendenteDistribuicao(empresaId, p.usuario_id, null), `${p.nome} voltou à distribuição.`).catch(
                                    () => {}
                                  )
                                }
                                disabled={Boolean(ocupado)}
                                title="Retomar agora"
                                className="rounded p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"
                              >
                                <Play size={15} />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPausando(p)}
                                disabled={Boolean(ocupado)}
                                title="Pausar (férias, afastamento)"
                                className="rounded p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                              >
                                <Pause size={15} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSubstituindo(p)}
                              disabled={Boolean(ocupado)}
                              title="Substituir por outra pessoa (mantém a carteira)"
                              className="rounded p-1.5 text-gray-400 hover:bg-primary-50 hover:text-primary-600"
                            >
                              <ArrowLeftRight size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => remover(p)}
                              disabled={Boolean(ocupado)}
                              title="Tirar da distribuição"
                              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                            >
                              <UserMinus size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            {podeEditar ? (
              <div className="flex min-w-0 flex-1 items-end gap-2 lg:max-w-md">
                <div className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-medium text-gray-700">Adicionar atendente</span>
                  <SearchableSelect
                    value={novoAtendente}
                    onChange={setNovoAtendente}
                    options={painel.elegiveis.map((u) => ({ value: u.id, label: u.nome }))}
                    placeholder="Escolha um usuário"
                    emptyMessage="Todos os usuários desta empresa já são atendentes."
                  />
                </div>
                <Button
                  variant="secondary"
                  disabled={!novoAtendente || Boolean(ocupado)}
                  loading={ocupado === 'adicionar'}
                  onClick={() =>
                    executar('adicionar', () => adicionarAtendenteDistribuicao(empresaId, novoAtendente), 'Atendente adicionado. Ele recebe clientes a partir da próxima distribuição. Para entrar já hoje, use "Redistribuir hoje".')
                      .then(() => setNovoAtendente(''))
                      .catch(() => {})
                  }
                >
                  <UserPlus size={15} />
                  Adicionar
                </Button>
              </div>
            ) : (
              <span />
            )}
          </div>
          </div>
        </ParametroLinha>
      )}

      {/* Últimas mudanças */}
      {automatica && painel.log.length > 0 && (
        <ParametroLinha largo label="Últimas mudanças" desc="Distribuições, redistribuições e mudanças na equipe, com quem fez e quando.">
            <div className="rounded-lg border border-gray-200">
              <button
                type="button"
                onClick={() => setLogAberto((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                <span className="flex items-center gap-1.5">
                  <History size={14} />
                  Últimas mudanças
                </span>
                <ChevronDown size={14} className={`transition-transform ${logAberto ? 'rotate-180' : ''}`} />
              </button>
              {logAberto && (
                <ul className="divide-y divide-gray-50 border-t border-gray-100">
                  {painel.log.map((l, i) => (
                    <li key={i} className="px-3 py-2 text-xs">
                      <span className="text-gray-400">
                        {dataHoraBR(l.criado_em)}
                        {l.usuario_nome ? ` · ${l.usuario_nome}` : ' · Monitor de Integrações'}
                      </span>
                      <p className="mt-0.5 text-gray-700">{l.descricao}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
        </ParametroLinha>
      )}

      <ModalPausa
        atendente={pausando}
        dataHoje={painel.data}
        onClose={() => setPausando(null)}
        onConfirmar={async (ate) => {
          await executar(`pausa-${pausando.usuario_id}`, () => pausarAtendenteDistribuicao(empresaId, pausando.usuario_id, ate), `${pausando.nome} pausado(a) até ${dataBR(ate)}.`, { erroNoModal: true });
          setPausando(null);
        }}
      />
      <ModalSubstituir
        atendente={substituindo}
        elegiveis={painel.elegiveis}
        onClose={() => setSubstituindo(null)}
        onConfirmar={async (para) => {
          await executar(`substituir-${substituindo.usuario_id}`, () => substituirAtendenteDistribuicao(empresaId, substituindo.usuario_id, para), 'Substituição feita.', { erroNoModal: true });
          setSubstituindo(null);
        }}
      />
      <ModalRedistribuir
        open={redistribuindo}
        painel={painel}
        onClose={() => setRedistribuindo(false)}
        onConfirmar={async (equilibrar) => {
          await executar('redistribuir', () => distribuirHojeReguaCobranca(empresaId, { redistribuir: true, equilibrar }), null, {
            erroNoModal: true,
          });
          setRedistribuindo(false);
        }}
      />
    </Card>
  );
}
