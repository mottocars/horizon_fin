import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  MinusCircle,
  Package,
  Wrench,
  XCircle,
} from 'lucide-react';
import Modal from '../../../components/Modal';
import { getVinculacaoAutomaticaEspiao, iniciarVinculacaoAutomaticaEspiao } from '../../../api/espiao.api';
import logoSienge from '../../../assets/integracoes/sienge.svg';

const INTERVALO_POLLING_MS = 1000;

// Ícone de cada etapa do log (mesma ideia do logo por integração em
// RepassesCef/AtualizacaoLogModal.jsx).
function IconeEtapa({ chave }) {
  if (chave === 'vinculacao') return <img src={logoSienge} alt="" className="h-8 w-8 shrink-0 object-contain" />;
  const { Icon, cor } =
    chave === 'NFE'
      ? { Icon: Package, cor: 'bg-primary-50 text-primary-600' }
      : chave === 'NFSE'
        ? { Icon: Wrench, cor: 'bg-violet-50 text-violet-600' }
        : { Icon: Inbox, cor: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cor}`}>
      <Icon size={16} />
    </span>
  );
}

function StatusIcone({ status }) {
  if (status === 'carregando') return <Loader2 size={18} className="shrink-0 animate-spin text-primary-500" />;
  if (status === 'sucesso') return <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />;
  if (status === 'erro') return <XCircle size={18} className="shrink-0 text-red-500" />;
  if (status === 'sem_configuracao') return <AlertTriangle size={18} className="shrink-0 text-amber-500" />;
  if (status === 'ignorado') return <MinusCircle size={18} className="shrink-0 text-gray-300" />;
  return <Clock size={18} className="shrink-0 text-gray-300" />;
}

function LinhaEtapa({ chave, titulo, status, detalhe, etapa, paginaAtual, totalPaginas }) {
  const temProgresso = status === 'carregando' && paginaAtual && totalPaginas;
  const percentual = temProgresso ? Math.min(100, Math.round((paginaAtual / totalPaginas) * 100)) : 0;
  const corDetalhe =
    status === 'erro'
      ? 'text-red-600'
      : status === 'sucesso'
        ? 'text-emerald-600'
        : status === 'sem_configuracao'
          ? 'text-amber-600'
          : 'text-gray-500';

  let textoAndamento = null;
  if (status === 'carregando') {
    if (temProgresso) {
      textoAndamento =
        etapa === 'Fornecedores'
          ? `${etapa} — ${paginaAtual} de ${totalPaginas} buscados no Sienge`
          : `${etapa} — página ${paginaAtual} de ${totalPaginas}`;
    } else {
      textoAndamento = etapa ? `${etapa}...` : chave === 'vinculacao' ? 'Conferindo CNPJ, data e nº e vinculando...' : 'Processando...';
    }
  }

  return (
    <div className={`rounded-lg border p-3 ${status === 'aguardando' ? 'border-gray-100 opacity-60' : 'border-gray-100'}`}>
      <div className="flex items-start gap-3">
        <IconeEtapa chave={chave} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{titulo}</p>
          {textoAndamento && <p className="mt-0.5 text-xs text-gray-500">{textoAndamento}</p>}
          {status === 'aguardando' && <p className="mt-0.5 text-xs text-gray-400">Aguardando...</p>}
          {status !== 'carregando' && detalhe && <p className={`mt-0.5 text-xs ${corDetalhe}`}>{detalhe}</p>}
        </div>
        <StatusIcone status={status} />
      </div>
      {temProgresso && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-primary-500 transition-all duration-300 ease-out"
            style={{ width: `${percentual}%` }}
          />
        </div>
      )}
    </div>
  );
}

function formatarDataHora(iso) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Janela do botão "Vincular agora" (ao lado de Agendar consulta): dispara a
// varredura de vínculo automático da empresa — SEMPRE desde a primeira nota
// ainda sem vínculo até hoje, sem olhar a Data início/fim da tela — e mostra
// o log dela ao vivo (polling em GET /vinculacao-automatica, já que a
// varredura roda em segundo plano no servidor). Fechar a janela não para a
// varredura; abrir de novo retoma o log da que estiver rodando.
export default function VinculacaoAutomaticaModal({ open, empresaId, nomeEmpresa, onClose, onConcluido }) {
  const [job, setJob] = useState(null);
  const [erro, setErro] = useState('');
  const avisouConclusao = useRef(null);

  useEffect(() => {
    if (!open || !empresaId) return undefined;
    let ativo = true;
    let timer = null;
    setErro('');
    setJob(null);

    const acompanhar = (dados) => {
      if (!ativo) return;
      setJob(dados.job);
      if (dados.job?.status === 'executando') {
        timer = setTimeout(
          () => getVinculacaoAutomaticaEspiao(empresaId).then(acompanhar).catch(() => (timer = setTimeout(() => acompanhar(dados), 2000))),
          INTERVALO_POLLING_MS
        );
      } else if (dados.job && avisouConclusao.current !== dados.job.id) {
        avisouConclusao.current = dados.job.id;
        onConcluido?.(dados.job);
      }
    };

    iniciarVinculacaoAutomaticaEspiao(empresaId)
      .then(acompanhar)
      .catch((err) => ativo && setErro(err.response?.data?.message || 'Não foi possível iniciar a vinculação.'));

    return () => {
      ativo = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, empresaId]);

  const executando = job?.status === 'executando';

  return (
    <Modal open={open} onClose={onClose} title="Log de Vinculação" maxWidthClass="max-w-lg">
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-gray-500">
          {nomeEmpresa && <span className="font-medium text-gray-700">{nomeEmpresa} · </span>}
          Varredura no contas a pagar do Sienge desde a primeira nota ainda sem vínculo até hoje (não usa a Data
          início/fim da tela). Só vincula quando CNPJ, data e nº conferem num único título.
        </p>

        {erro && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            <XCircle size={15} className="shrink-0" />
            {erro}
          </div>
        )}

        {!job && !erro && (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
            <Loader2 size={15} className="animate-spin" />
            Iniciando...
          </p>
        )}

        {job && (
          <>
            {job.origem === 'agendada' && (
              <p className="rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-700">
                Esta é a varredura do agendamento diário, iniciada às{' '}
                {new Date(job.iniciadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
              </p>
            )}
            <div className="space-y-2">
              {job.etapas.map((etapa) => (
                <LinhaEtapa key={etapa.chave} {...etapa} />
              ))}
            </div>

            {!executando && (
              <p className="border-t border-gray-100 pt-3 text-center text-xs text-gray-400">
                {job.status === 'erro' ? 'A varredura parou com erro.' : 'Vinculação concluída'}
                {job.finalizadoEm && ` · ${formatarDataHora(job.finalizadoEm)}`}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
