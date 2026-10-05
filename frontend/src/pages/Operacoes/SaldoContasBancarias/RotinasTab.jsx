import { useState } from 'react';
import { CalendarClock, CheckCircle2, Clock, Landmark, Layers, ListChecks, Lock, LockOpen, UserRound } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import { encerrarRotina, getSaldosRotina, reabrirRotina, salvarSaldosRotina } from '../../../api/saldoContasBancarias.api';
import { useConfirm } from '../../../confirm/ConfirmContext';
import SaldosContasTab from './SaldosContasTab';
import { formatarDataBR } from './constantes';

const SEM_FILTRO_EMPRESA = [];

function horaSP(iso) {
  return iso
    ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
    : '';
}

function iniciais(nome) {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function BarraProgresso({ feito, total }) {
  const pct = total ? Math.round((feito / total) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-primary-500'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Andamento de todos os responsáveis no período aberto — mesmo painel pra quem tem rotina e
// pra quem só acompanha.
function AndamentoEquipe({ status, usuarioAtualId }) {
  if (!status.responsaveis.length) return null;
  const encerradas = status.responsaveis.filter((r) => r.encerrada).length;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Andamento das rotinas</h4>
        <span className="text-xs text-gray-400">
          {encerradas} de {status.responsaveis.length} encerrada(s)
          {status.periodo && encerradas < status.responsaveis.length && ' · o período só encerra quando todas estiverem encerradas'}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {status.responsaveis.map((r) => {
          const eu = r.usuarioId === usuarioAtualId;
          return (
            <div
              key={r.usuarioId}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                r.encerrada ? 'border-emerald-100 bg-emerald-50/50' : 'border-gray-100 bg-white'
              } ${eu ? 'ring-1 ring-primary-100' : ''}`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  r.encerrada ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {iniciais(r.nome)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-gray-800" title={r.itens.join(', ')}>
                    {r.nome}
                  </span>
                  {eu && <span className="shrink-0 text-[10px] font-medium uppercase text-primary-600">você</span>}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <BarraProgresso feito={r.preenchidas} total={r.contas} />
                  <span className="shrink-0 text-[11px] tabular-nums text-gray-500">
                    {r.preenchidas}/{r.contas}
                  </span>
                </div>
              </div>
              {r.encerrada ? (
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600" title={`Encerrada às ${horaSP(r.encerradoEm)}`}>
                  <CheckCircle2 size={14} /> {horaSP(r.encerradoEm)}
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600">
                  <Clock size={14} /> Pendente
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Aba Rotinas (parâmetro "Gerar Rotinas"): cada responsável vê só as contas das classificações
// (ou bancos) dele, lança o saldo do período aberto — sem abrir/encerrar período por aqui — e
// encerra a própria rotina quando terminar. A grade é a mesma de Saldos das Contas
// (SaldosContasTab), alimentada pelos endpoints restritos da rotina.
export default function RotinasTab({
  empresaId,
  usuarioAtualId,
  status,
  onStatus,
  recarregarStatus,
  dataInicio,
  dataFim,
  busca,
  tipoSaldo,
  infoBancos,
  refreshToken,
  onPeriodoDessincronizado,
}) {
  const confirm = useConfirm();
  const [acao, setAcao] = useState(null);
  const [erro, setErro] = useState('');

  if (!status) {
    return (
      <Card className="rounded-tl-none">
        <p className="py-8 text-center text-sm text-gray-400">Carregando rotinas...</p>
      </Card>
    );
  }

  const minha = status.minha;
  const periodo = status.periodo;
  const pendentesMinhas = minha ? minha.contas - minha.preenchidas : 0;
  const IconeDivisao = status.dividirPor === 'BANCO' ? Landmark : Layers;

  async function handleEncerrar() {
    setErro('');
    const ok = await confirm({
      title: 'Encerrar minha rotina',
      description:
        pendentesMinhas > 0
          ? `Ainda há ${pendentesMinhas} conta(s) sem saldo em ${formatarDataBR(periodo)}. Encerrar a rotina mesmo assim? Depois de encerrada, as contas ficam bloqueadas até você reabrir a rotina.`
          : `Todas as suas contas têm saldo em ${formatarDataBR(periodo)}. Depois de encerrada, as contas ficam bloqueadas até você reabrir a rotina.`,
      confirmLabel: 'Encerrar rotina',
      variant: pendentesMinhas > 0 ? 'warning' : 'default',
    });
    if (!ok) return;
    setAcao('encerrar');
    try {
      onStatus(await encerrarRotina(empresaId));
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível encerrar a rotina.');
      recarregarStatus();
    } finally {
      setAcao(null);
    }
  }

  async function handleReabrir() {
    setErro('');
    setAcao('reabrir');
    try {
      onStatus(await reabrirRotina(empresaId));
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível reabrir a rotina.');
      recarregarStatus();
    } finally {
      setAcao(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-tl-none">
        {minha ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <ListChecks size={16} className="text-primary-600" />
                  Minha rotina
                </h3>
                {periodo ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    <CalendarClock size={12} /> Período de {formatarDataBR(periodo)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                    <Lock size={12} /> Nenhum período aberto
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500">Responsável por</span>
                {minha.itens.map((item) => (
                  <span key={item} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    <IconeDivisao size={11} className="text-gray-400" />
                    {item}
                  </span>
                ))}
              </div>

              {periodo && (
                <div className="max-w-md space-y-1">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-gray-500">Contas com saldo no dia</span>
                    <span className="font-medium tabular-nums text-gray-700">
                      {minha.preenchidas} de {minha.contas}
                    </span>
                  </div>
                  <BarraProgresso feito={minha.preenchidas} total={minha.contas} />
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
              {!periodo ? (
                <p className="max-w-xs text-xs text-gray-500 lg:text-right">
                  Aguardando a abertura do período em Saldos das Contas. Até lá a grade fica só para consulta.
                </p>
              ) : minha.encerrada ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                    <CheckCircle2 size={15} /> Rotina encerrada às {horaSP(minha.encerradoEm)}
                  </span>
                  <Button type="button" variant="secondary" onClick={handleReabrir} loading={acao === 'reabrir'} disabled={Boolean(acao)}>
                    <LockOpen size={15} />
                    Reabrir rotina
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={handleEncerrar} loading={acao === 'encerrar'} disabled={Boolean(acao)}>
                  <Lock size={15} />
                  Encerrar rotina
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <UserRound size={18} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Você não tem rotina nesta empresa</h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Nenhuma {status.dividirPor === 'BANCO' ? 'banco' : 'classificação'} está sob sua responsabilidade (aba
                Configurações). Abaixo, o andamento das rotinas de quem tem.
              </p>
            </div>
          </div>
        )}

        {erro && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

        {status.responsaveis.length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <AndamentoEquipe status={status} usuarioAtualId={usuarioAtualId} />
          </div>
        )}
        {status.responsaveis.length === 0 && (
          <p className="mt-4 text-xs text-amber-700">
            Nenhum responsável definido ainda. Defina-os em Configurações → Gerar Rotinas.
          </p>
        )}
      </Card>

      {minha && (
        <SaldosContasTab
          empresaId={empresaId}
          dataInicio={dataInicio}
          dataFim={dataFim}
          companyIds={SEM_FILTRO_EMPRESA}
          busca={busca}
          tipoSaldo={tipoSaldo}
          infoBancos={infoBancos}
          refreshToken={refreshToken}
          dataAberta={periodo || ''}
          onPeriodoDessincronizado={onPeriodoDessincronizado}
          buscarSaldos={getSaldosRotina}
          gravarSaldos={salvarSaldosRotina}
          somenteLeitura={!periodo || minha.encerrada}
          expandirGrupos
          onSalvo={recarregarStatus}
          encaixadoNaAba={false}
          textoSemContas="Suas classificações/bancos ainda não têm contas ativas, classificadas e projetando saldo."
        />
      )}
    </div>
  );
}
