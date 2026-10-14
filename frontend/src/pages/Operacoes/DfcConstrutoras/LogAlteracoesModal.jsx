import { useEffect, useState } from 'react';
import { ArrowRight, Bot, Clock, History, ListTree, Pencil, TriangleAlert, User } from 'lucide-react';
import Modal from '../../../components/Modal';
import { getLogOrcamentoDfc } from '../../../api/dfcOrcamento.api';
import { ORIGENS_PROJECAO, rotuloMesLongo } from './orcamentoValores';

const TIPOS = {
  INCLUSAO: { rotulo: 'Inclusão', cor: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  ALTERACAO: { rotulo: 'Alteração', cor: 'bg-blue-50 text-blue-700 ring-blue-200' },
  EXCLUSAO: { rotulo: 'Exclusão', cor: 'bg-red-50 text-red-700 ring-red-200' },
};

const FONTES = {
  MANUAL: { rotulo: 'Manual', icone: Pencil },
  INTEGRACAO: { rotulo: 'Integração', icone: Bot },
  PLANO: { rotulo: 'Plano de contas', icone: ListTree },
};

function dinheiro(v) {
  return v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataHora(v) {
  return v
    ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
}

const rotuloOrigem = (o) => ORIGENS_PROJECAO.find((x) => x.value === o)?.label || o || '—';

// Quem fez a mudança na origem: a pessoa; sem pessoa, integração agendada (Monitor) ou carga direta.
function responsavel(e) {
  if (e.responsavel) return e.responsavel;
  return e.fonte === 'INTEGRACAO' ? 'Integração automática (agendada)' : 'Sem usuário identificado';
}

function Valores({ anterior, novo }) {
  const cor = (v) => (v === null || v === undefined ? 'text-gray-400' : v < 0 ? 'text-red-600' : 'text-gray-900');
  return (
    <span className="flex items-center gap-1.5 text-sm tabular-nums">
      <span className={cor(anterior)}>{dinheiro(anterior)}</span>
      <ArrowRight size={13} className="shrink-0 text-gray-300" />
      <span className={`font-semibold ${cor(novo)}`}>{dinheiro(novo)}</span>
    </span>
  );
}

function Entrada({ e, pendente = false }) {
  const tipo = TIPOS[e.tipo];
  const fonte = FONTES[e.fonte] || FONTES.PLANO;
  const IconeFonte = fonte.icone;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${pendente ? 'border-dashed border-amber-300 bg-amber-50/60' : 'border-gray-100 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${tipo.cor}`}>{tipo.rotulo}</span>
          <Valores anterior={e.valor_anterior} novo={e.valor_novo} />
        </div>
        <span className="text-[11px] text-gray-400">
          {pendente ? 'Pendente — entra no Orçamento ao Salvar Versão' : `Versão ${e.versao} · salva em ${dataHora(e.versao_em)}${e.versao_por ? ` por ${e.versao_por}` : ''}`}
        </span>
      </div>
      <div className="mt-2 grid gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-2">
        <span className="flex items-center gap-1.5">
          <User size={13} className="shrink-0 text-gray-400" />
          {responsavel(e)}
        </span>
        <span className="flex items-center gap-1.5">
          <Clock size={13} className="shrink-0 text-gray-400" />
          {dataHora(e.responsavel_em)}
        </span>
        <span className="flex items-center gap-1.5 sm:col-span-2">
          <IconeFonte size={13} className="shrink-0 text-gray-400" />
          {fonte.rotulo} · {e.fonte_descricao || rotuloOrigem(e.origem)}
        </span>
      </div>
    </div>
  );
}

// Aba Orçamentos, botão direito numa conta › "Log de alterações": o histórico daquele valor (centro
// × conta × mês), versão a versão — inclusão, alteração ou exclusão, quem fez a mudança na origem
// (digitou o valor / disparou a integração) e quando, e quem salvou a versão. Em cima, o que mudou
// nas fontes e ainda não foi salvo. `alvo`: { centroId, contaId, centroNome, contaRotulo, mes, valor }.
export default function LogAlteracoesModal({ open, onClose, empresaId, alvo }) {
  const [log, setLog] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open || !alvo) return;
    setLog(null);
    setErro('');
    getLogOrcamentoDfc(empresaId, { centroId: alvo.centroId, siengeId: alvo.contaId, mes: alvo.mes })
      .then(setLog)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar o log.'));
  }, [open, alvo, empresaId]);

  if (!alvo) return null;

  return (
    <Modal open={open} onClose={onClose} title="Log de alterações" maxWidthClass="max-w-2xl">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
          <History size={18} className="mt-0.5 shrink-0 text-primary-600" />
          <div className="min-w-0 text-xs text-gray-600">
            <p className="truncate font-medium text-gray-900" title={alvo.contaRotulo}>
              {alvo.contaRotulo}
            </p>
            <p className="truncate">
              {alvo.centroNome} · {rotuloMesLongo(alvo.mes)} · na versão atual:{' '}
              <span className={`font-semibold tabular-nums ${alvo.valor < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {dinheiro(alvo.valor)}
              </span>
            </p>
          </div>
        </div>

        {erro ? (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <TriangleAlert size={15} className="shrink-0" />
            {erro}
          </div>
        ) : !log ? (
          <p className="py-8 text-center text-sm text-gray-400">Carregando...</p>
        ) : (
          <div className="space-y-2">
            {log.pendente && <Entrada e={log.pendente} pendente />}
            {log.historico.length === 0 && !log.pendente ? (
              <p className="py-8 text-center text-sm text-gray-400">Nenhuma alteração registrada neste valor.</p>
            ) : (
              log.historico.map((e) => <Entrada key={e.id} e={e} />)
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
