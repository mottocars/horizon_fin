import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  History,
  Loader2,
  PauseCircle,
  RefreshCw,
  Save,
  User,
  XCircle,
} from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import { getPainelMonitor, salvarAgendamentoMonitor, executarRotinaMonitor } from '../../../api/monitorIntegracoes.api';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import logoSienge from '../../../assets/integracoes/sienge.svg';
import logoConstrutorVendas from '../../../assets/integracoes/construtor-vendas.svg';
import logoItau from '../../../assets/integracoes/itau.svg';

const LOGOS = { sienge: logoSienge, 'construtor-vendas': logoConstrutorVendas, horizon: '/logomarca.svg', itau: logoItau };
const NOME_INTEGRACAO = { sienge: 'Sienge', 'construtor-vendas': 'Construtor de Vendas', horizon: 'Horizon (cálculo interno)', itau: 'API Itaú' };

const FREQUENCIAS = [
  { id: 'diaria', rotulo: 'Diária' },
  { id: 'semanal', rotulo: 'Semanal' },
  { id: 'mensal', rotulo: 'Mensal' },
];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_SEMANA_EXTENSO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const INTERVALO_POLLING_MS = 2000;

// ─── formatação ────────────────────────────────────────────────────────────

function formatarDataHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatarDuracao(inicio, fim) {
  if (!inicio || !fim) return null;
  const segundos = Math.max(0, Math.round((new Date(fim) - new Date(inicio)) / 1000));
  if (segundos < 60) return `${segundos}s`;
  const minutos = Math.floor(segundos / 60);
  return `${minutos}min ${String(segundos % 60).padStart(2, '0')}s`;
}

// 'YYYY-MM-DD HH:MM' (Brasília, vindo do backend) -> "hoje às 07:00" /
// "amanhã às 07:00" / "seg, 05/10 às 07:00".
function formatarProxima(texto) {
  if (!texto) return null;
  const [data, hora] = texto.split(' ');
  const [ano, mes, dia] = data.split('-').map(Number);
  const alvo = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diff = Math.round((alvo - hoje) / 86400000);
  if (diff <= 0) return `hoje às ${hora}`;
  if (diff === 1) return `amanhã às ${hora}`;
  return `${DIAS_SEMANA[alvo.getDay()].toLowerCase()}, ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')} às ${hora}`;
}

function descreverRegra(ag) {
  if (ag.frequencia === 'semanal') return `toda ${DIAS_SEMANA_EXTENSO[ag.diaSemana]} às ${ag.horario}`;
  if (ag.frequencia === 'mensal') return `todo dia ${ag.diaMes} às ${ag.horario}`;
  return `todo dia às ${ag.horario}`;
}

const AGENDAMENTO_PADRAO = { ativo: true, frequencia: 'diaria', horario: '06:00', diaSemana: 1, diaMes: 1 };

function paraEdicao(ag) {
  if (!ag) return { ...AGENDAMENTO_PADRAO, ativo: false, novo: true };
  return {
    ativo: ag.ativo,
    frequencia: ag.frequencia,
    horario: ag.horario,
    diaSemana: ag.diaSemana ?? 1,
    diaMes: ag.diaMes ?? 1,
  };
}

const mesmaEdicao = (a, b) =>
  a.ativo === b.ativo &&
  a.frequencia === b.frequencia &&
  a.horario === b.horario &&
  (a.frequencia !== 'semanal' || a.diaSemana === b.diaSemana) &&
  (a.frequencia !== 'mensal' || Number(a.diaMes) === Number(b.diaMes));

// ─── status de execução ────────────────────────────────────────────────────

const STATUS = {
  executando: { rotulo: 'Executando', Icon: Loader2, classe: 'bg-primary-50 text-primary-700 ring-primary-100', girar: true },
  sucesso: { rotulo: 'Concluída', Icon: CheckCircle2, classe: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  erro: { rotulo: 'Falhou', Icon: XCircle, classe: 'bg-red-50 text-red-700 ring-red-200' },
  interrompida: { rotulo: 'Interrompida', Icon: PauseCircle, classe: 'bg-amber-50 text-amber-700 ring-amber-200' },
};

function SeloStatus({ status }) {
  const s = STATUS[status] || STATUS.sucesso;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${s.classe}`}>
      <s.Icon size={11} className={s.girar ? 'animate-spin' : ''} />
      {s.rotulo}
    </span>
  );
}

function Interruptor({ ligado, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={disabled}
      onClick={() => onChange(!ligado)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
        ligado ? 'bg-primary-600' : 'bg-gray-300'
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${ligado ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  );
}

// ─── blocos do cartão ──────────────────────────────────────────────────────

function BlocoAgendamento({ rotina, edicao, onEditar, onSalvar, salvando, erro }) {
  const salvo = paraEdicao(rotina.agendamento);
  const alterado = !mesmaEdicao(edicao, salvo) || (salvo.novo && edicao.ativo);
  const desabilitado = !edicao.ativo;

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          <CalendarClock size={12} /> Agendamento
        </p>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          {edicao.ativo ? 'Ativo' : 'Desligado'}
          <Interruptor ligado={edicao.ativo} onChange={(v) => onEditar({ ativo: v })} disabled={salvando} />
        </label>
      </div>

      <div className={`mt-2 space-y-2 transition ${desabilitado ? 'opacity-50' : ''}`}>
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
          {FREQUENCIAS.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={desabilitado || salvando}
              onClick={() => onEditar({ frequencia: f.id })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                edicao.frequencia === f.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {edicao.frequencia === 'semanal' && (
            <div className="flex gap-0.5">
              {DIAS_SEMANA.map((dia, i) => (
                <button
                  key={dia}
                  type="button"
                  disabled={desabilitado || salvando}
                  onClick={() => onEditar({ diaSemana: i })}
                  className={`h-7 w-8 rounded-md text-[11px] font-medium transition ${
                    edicao.diaSemana === i ? 'bg-primary-600 text-white' : 'bg-white text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {dia}
                </button>
              ))}
            </div>
          )}
          {edicao.frequencia === 'mensal' && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              Dia
              <input
                type="number"
                min={1}
                max={31}
                value={edicao.diaMes}
                disabled={desabilitado || salvando}
                onChange={(e) => onEditar({ diaMes: e.target.value === '' ? '' : Math.min(31, Math.max(1, Number(e.target.value))) })}
                className="w-14 rounded-lg border border-gray-200 px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            às
            <input
              type="time"
              value={edicao.horario}
              disabled={desabilitado || salvando}
              onChange={(e) => onEditar({ horario: e.target.value })}
              className="rounded-lg border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </label>
        </div>
      </div>

      <div className="mt-2 flex min-h-7 items-center gap-2">
        {alterado ? (
          <>
            <Button onClick={onSalvar} loading={salvando} className="!px-3 !py-1 text-xs" disabled={!edicao.horario}>
              <Save size={13} />
              Salvar
            </Button>
            <button type="button" onClick={() => onEditar(salvo, true)} className="text-xs text-gray-400 hover:text-gray-600">
              Descartar
            </button>
          </>
        ) : rotina.agendamento?.ativo ? (
          <p className="text-xs text-gray-500">
            Roda {descreverRegra(rotina.agendamento)} · próxima{' '}
            <span className="font-medium text-gray-700">{formatarProxima(rotina.agendamento.proximaExecucao)}</span>
          </p>
        ) : (
          <p className="text-xs text-gray-400">Sem rotina agendada.</p>
        )}
      </div>
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </div>
  );
}

function BlocoExecucao({ rotina }) {
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const atual = rotina.execucaoAtual;
  const ultima = rotina.historico[0];
  const exibida = atual || ultima;
  const progresso = atual?.progresso;
  const temBarra = progresso?.paginaAtual && progresso?.totalPaginas;
  const percentual = temBarra ? Math.min(100, Math.round((progresso.paginaAtual / progresso.totalPaginas) * 100)) : 0;

  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        <Clock size={12} /> {atual ? 'Em execução' : 'Última execução'}
      </p>
      {!exibida ? (
        <p className="mt-2 text-xs text-gray-400">Nunca executada.</p>
      ) : (
        <div className="mt-2 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <SeloStatus status={exibida.status} />
            <span>{formatarDataHora(exibida.iniciadoEm)}</span>
            {!atual && formatarDuracao(exibida.iniciadoEm, exibida.finalizadoEm) && (
              <span className="text-gray-400">· {formatarDuracao(exibida.iniciadoEm, exibida.finalizadoEm)}</span>
            )}
            <span className="text-gray-400">· {exibida.origem === 'agendada' ? 'agendada' : 'manual'}</span>
          </div>
          {atual ? (
            <>
              <p className="truncate text-xs text-gray-600">
                {progresso?.texto || 'Iniciando...'}
                {temBarra ? ` — ${progresso.paginaAtual} de ${progresso.totalPaginas}` : ''}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full bg-primary-500 transition-all duration-300 ${temBarra ? '' : 'w-1/3 animate-pulse'}`}
                  style={temBarra ? { width: `${percentual}%` } : undefined}
                />
              </div>
            </>
          ) : exibida.status === 'sucesso' ? (
            <p className="text-xs text-emerald-700">{exibida.resumo}</p>
          ) : (
            <p className="text-xs text-red-600">{exibida.erro}</p>
          )}
        </div>
      )}

      {rotina.historico.length > 0 && (
        <button
          type="button"
          onClick={() => setHistoricoAberto((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
        >
          <History size={12} />
          Histórico
          <ChevronDown size={12} className={`transition ${historicoAberto ? 'rotate-180' : ''}`} />
        </button>
      )}
      {historicoAberto && (
        <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100 text-xs">
          {rotina.historico.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5">
              <SeloStatus status={h.status} />
              <span className="text-gray-600">{formatarDataHora(h.iniciadoEm)}</span>
              {formatarDuracao(h.iniciadoEm, h.finalizadoEm) && (
                <span className="text-gray-400">{formatarDuracao(h.iniciadoEm, h.finalizadoEm)}</span>
              )}
              <span className="inline-flex items-center gap-0.5 text-gray-400">
                {h.origem === 'agendada' ? <CalendarClock size={11} /> : <User size={11} />}
                {h.origem === 'agendada' ? 'agendada' : h.usuarioNome || 'manual'}
              </span>
              <span className={`basis-full truncate ${h.status === 'sucesso' ? 'text-gray-500' : 'text-red-600'}`} title={h.resumo || h.erro || ''}>
                {h.resumo || h.erro}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CartaoRotina({ rotina, edicao, onEditar, onSalvar, salvando, erroSalvar, onExecutar, disparando }) {
  const executando = Boolean(rotina.execucaoAtual);
  return (
    <div
      className={`grid grid-cols-1 gap-5 border-t border-gray-100 px-5 py-4 first:border-t-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.05fr)_minmax(0,1fr)_auto] lg:items-start ${
        executando ? 'bg-primary-50/30' : ''
      }`}
    >
      <div className="flex min-w-0 gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-gray-200">
          <img src={LOGOS[rotina.integracao]} alt={NOME_INTEGRACAO[rotina.integracao]} className="h-6 w-6 object-contain" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{rotina.nome}</p>
          <p className="text-[11px] text-gray-400">{NOME_INTEGRACAO[rotina.integracao]}</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">{rotina.descricao}</p>
          {rotina.indisponivel && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              {rotina.indisponivel}
            </p>
          )}
        </div>
      </div>

      <BlocoAgendamento
        rotina={rotina}
        edicao={edicao}
        onEditar={onEditar}
        onSalvar={onSalvar}
        salvando={salvando}
        erro={erroSalvar}
      />

      <BlocoExecucao rotina={rotina} />

      <div className="flex lg:justify-end">
        <Button
          variant="secondary"
          onClick={onExecutar}
          disabled={executando || disparando || Boolean(rotina.indisponivel)}
          title={rotina.indisponivel || 'Executar esta atualização agora'}
          className="whitespace-nowrap"
        >
          <RefreshCw size={15} className={executando || disparando ? 'animate-spin' : ''} />
          {executando ? 'Executando' : 'Atualizar agora'}
        </Button>
      </div>
    </div>
  );
}

// ─── página ────────────────────────────────────────────────────────────────

// Monitor de Integrações (1ª opção do menu Integrações): uma tela pra agendar
// e acompanhar TODAS as atualizações automáticas do sistema, por empresa —
// vinculação do Espião, contratos/reservas de Repasses CEF, base/clientes/
// clusters da Gestão de Cobranças (catálogo em backend
// monitor-integracoes/rotinas.js). Cada rotina: agendamento diário/semanal/
// mensal (horário de Brasília), execução manual ("Atualizar agora"), status
// ao vivo e histórico. As execuções rodam em segundo plano no servidor; a
// tela acompanha por polling enquanto alguma estiver em andamento.
export default function MonitorIntegracoesPage() {
  const { travada: empresaTravada, empresaIdTravada, empresaIds } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  // `?empresa_id=` abre já na empresa — usado pelo link "alterar horário" da
  // Distribuição da Rotina (Régua de Cobrança > Configurações Globais).
  const [searchParams] = useSearchParams();
  const [empresaId, setEmpresaId] = useState(() => searchParams.get('empresa_id') || '');

  const [rotinas, setRotinas] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const [edicoes, setEdicoes] = useState({}); // chave -> agendamento em edição
  const [salvando, setSalvando] = useState({});
  const [errosSalvar, setErrosSalvar] = useState({});
  const [disparando, setDisparando] = useState({});

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((r) => setEmpresas(r.data))
      .finally(() => setCarregandoEmpresas(false));
  }, []);

  useEffect(() => {
    if (empresaTravada && empresaIdTravada) setEmpresaId(empresaIdTravada);
  }, [empresaTravada, empresaIdTravada]);

  const opcoesEmpresa = useMemo(
    () =>
      empresas
        .filter((e) => !empresaIds || empresaIds.includes(String(e.id)))
        .map((e) => ({ value: e.id, label: nomeExibicaoEmpresa(e) })),
    [empresas, empresaIds]
  );

  // Atualiza o painel sem perder o que o usuário está editando: agendamento
  // em edição só é reposto a partir do servidor quando não há alteração
  // pendente naquela rotina.
  const aplicarPainel = useCallback((dados) => {
    setRotinas(dados);
    setEdicoes((atual) => {
      const proximo = { ...atual };
      for (const r of dados) {
        const salvo = paraEdicao(r.agendamento);
        if (!proximo[r.chave] || mesmaEdicao(proximo[r.chave], salvo)) proximo[r.chave] = salvo;
      }
      return proximo;
    });
  }, []);

  const buscaRef = useRef(0);
  const carregar = useCallback(
    (silencioso = false) => {
      if (!empresaId) return Promise.resolve();
      const busca = ++buscaRef.current;
      if (!silencioso) setCarregando(true);
      return getPainelMonitor(empresaId)
        .then((dados) => busca === buscaRef.current && aplicarPainel(dados))
        .catch((err) => !silencioso && setErro(err.response?.data?.message || 'Não foi possível carregar o monitor.'))
        .finally(() => !silencioso && setCarregando(false));
    },
    [empresaId, aplicarPainel]
  );

  useEffect(() => {
    setRotinas(null);
    setEdicoes({});
    setErro('');
    carregar();
  }, [carregar]);

  // Polling enquanto alguma rotina estiver executando.
  const algumaExecutando = rotinas?.some((r) => r.execucaoAtual);
  useEffect(() => {
    if (!algumaExecutando) return undefined;
    const timer = setInterval(() => carregar(true), INTERVALO_POLLING_MS);
    return () => clearInterval(timer);
  }, [algumaExecutando, carregar]);

  function editar(chave, patch, substituir = false) {
    setEdicoes((atual) => ({ ...atual, [chave]: substituir ? { ...patch } : { ...atual[chave], ...patch } }));
    setErrosSalvar((atual) => ({ ...atual, [chave]: '' }));
  }

  async function salvar(chave) {
    const e = edicoes[chave];
    setSalvando((s) => ({ ...s, [chave]: true }));
    try {
      const dados = await salvarAgendamentoMonitor(empresaId, chave, {
        ativo: e.ativo,
        frequencia: e.frequencia,
        horario: e.horario,
        diaSemana: e.frequencia === 'semanal' ? e.diaSemana : null,
        diaMes: e.frequencia === 'mensal' ? Number(e.diaMes) : null,
      });
      setEdicoes((atual) => ({ ...atual, [chave]: paraEdicao(dados.find((r) => r.chave === chave)?.agendamento) }));
      aplicarPainel(dados);
    } catch (err) {
      setErrosSalvar((atual) => ({ ...atual, [chave]: err.response?.data?.message || 'Não foi possível salvar.' }));
    } finally {
      setSalvando((s) => ({ ...s, [chave]: false }));
    }
  }

  async function executar(chave) {
    setDisparando((d) => ({ ...d, [chave]: true }));
    try {
      aplicarPainel(await executarRotinaMonitor(empresaId, chave));
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível iniciar a atualização.');
    } finally {
      setDisparando((d) => ({ ...d, [chave]: false }));
    }
  }

  const grupos = useMemo(() => {
    const porModulo = new Map();
    for (const r of rotinas || []) {
      if (!porModulo.has(r.modulo)) porModulo.set(r.modulo, []);
      porModulo.get(r.modulo).push(r);
    }
    return [...porModulo.entries()];
  }, [rotinas]);

  const resumo = useMemo(() => {
    const lista = rotinas || [];
    return {
      total: lista.length,
      agendadas: lista.filter((r) => r.agendamento?.ativo).length,
      executando: lista.filter((r) => r.execucaoAtual).length,
      falhas: lista.filter((r) => !r.execucaoAtual && ['erro', 'interrompida'].includes(r.historico[0]?.status)).length,
    };
  }, [rotinas]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1 lg:max-w-xs">
            <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
            <SearchableSelect
              value={empresaId}
              onChange={setEmpresaId}
              disabled={carregandoEmpresas || empresaTravada}
              options={opcoesEmpresa}
              placeholder={carregandoEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
              emptyMessage="Nenhuma empresa encontrada."
            />
          </div>
          {rotinas && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600">{resumo.total} atualizações</span>
              <span className="rounded-full bg-primary-50 px-2.5 py-1 font-medium text-primary-700">{resumo.agendadas} agendada(s)</span>
              {resumo.executando > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-600 px-2.5 py-1 font-medium text-white">
                  <Loader2 size={11} className="animate-spin" /> {resumo.executando} executando
                </span>
              )}
              {resumo.falhas > 0 && (
                <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700">{resumo.falhas} com falha na última execução</span>
              )}
              <button
                type="button"
                onClick={() => carregar()}
                title="Recarregar"
                className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
              >
                <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
              </button>
            </div>
          )}
        </div>
      </Card>

      {!empresaId ? (
        <Card className="flex min-h-60 flex-col items-center justify-center text-center">
          <CalendarClock size={28} className="mb-3 text-gray-300" />
          <p className="text-sm font-semibold text-gray-900">Selecione uma empresa</p>
          <p className="mt-1 max-w-md text-xs text-gray-500">
            Escolha a empresa para ver, agendar e executar as atualizações automáticas do sistema — vinculação do Espião,
            dados do Repasses CEF e da Gestão de Cobranças.
          </p>
        </Card>
      ) : erro && !rotinas ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <AlertTriangle size={24} className="text-red-400" />
          <p className="text-sm text-gray-600">{erro}</p>
        </Card>
      ) : !rotinas ? (
        <Card className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Carregando...
        </Card>
      ) : (
        <>
          {erro && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertTriangle size={15} /> {erro}
            </div>
          )}
          <p className="px-1 text-xs text-gray-400">
            Horários sempre de Brasília. As atualizações rodam no servidor — dá pra fechar esta tela enquanto executam.
          </p>
          {grupos.map(([modulo, lista]) => (
            <Fragment key={modulo}>
              <div className="overflow-hidden rounded-card bg-white shadow-card">
                <div className="border-b border-gray-100 bg-gray-50/70 px-5 py-2.5">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{modulo}</h2>
                </div>
                {lista.map((rotina) => (
                  <CartaoRotina
                    key={rotina.chave}
                    rotina={rotina}
                    edicao={edicoes[rotina.chave] || paraEdicao(rotina.agendamento)}
                    onEditar={(patch, substituir) => editar(rotina.chave, patch, substituir)}
                    onSalvar={() => salvar(rotina.chave)}
                    salvando={Boolean(salvando[rotina.chave])}
                    erroSalvar={errosSalvar[rotina.chave]}
                    onExecutar={() => executar(rotina.chave)}
                    disparando={Boolean(disparando[rotina.chave])}
                  />
                ))}
              </div>
            </Fragment>
          ))}
        </>
      )}
    </div>
  );
}
