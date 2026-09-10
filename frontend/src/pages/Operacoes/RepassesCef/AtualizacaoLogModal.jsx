import { CheckCircle2, Loader2, Unplug, XCircle } from 'lucide-react';
import Modal from '../../../components/Modal';

// Ícone + cor do status de cada linha de integração — spinner girando
// enquanto sincroniza, check verde ao terminar, X vermelho em erro real, e
// um ícone de "desconectado" (cinza, discreto) pra quando a empresa
// simplesmente não tem essa integração configurada — não é uma falha, só
// uma informação.
function StatusIcone({ status }) {
  if (status === 'carregando') return <Loader2 size={18} className="shrink-0 animate-spin text-primary-500" />;
  if (status === 'sucesso') return <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />;
  if (status === 'erro') return <XCircle size={18} className="shrink-0 text-red-500" />;
  return <Unplug size={18} className="shrink-0 text-gray-300" />;
}

function LinhaLog({ logo, integracaoNome, status, mensagem, total, paginaAtual, totalPaginas }) {
  // Só desenha a barra quando já sabemos o total de páginas (a 1ª página
  // ainda não voltou) — antes disso mostra só "Sincronizando..." mesmo.
  const temProgresso = status === 'carregando' && paginaAtual && totalPaginas;
  const percentual = temProgresso ? Math.min(100, Math.round((paginaAtual / totalPaginas) * 100)) : 0;

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-start gap-3">
        <img src={logo} alt={integracaoNome} className="h-8 w-8 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{integracaoNome}</p>
          {status === 'carregando' && (
            <p className="mt-0.5 text-xs text-gray-500">
              {temProgresso ? `Página ${paginaAtual} de ${totalPaginas}` : 'Sincronizando...'}
            </p>
          )}
          {status === 'sucesso' && (
            <p className="mt-0.5 text-xs text-emerald-600">
              {total} {total === 1 ? 'registro importado' : 'registros importados'} com sucesso.
            </p>
          )}
          {status === 'erro' && <p className="mt-0.5 text-xs text-red-600">{mensagem}</p>}
          {status === 'nao_integrado' && (
            <p className="mt-0.5 text-xs text-gray-400">Esta empresa ainda não possui essa integração configurada.</p>
          )}
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

export default function AtualizacaoLogModal({ open, onClose, logs }) {
  const todosTerminaram = logs.every((l) => l.status !== 'carregando');

  return (
    <Modal open={open} onClose={onClose} title="Log de Atualização" maxWidthClass="max-w-md">
      <div className="space-y-2">
        {logs.map((log) => (
          <LinhaLog key={log.chave} {...log} />
        ))}
      </div>
      {todosTerminaram && (
        <p className="mt-3 text-center text-xs text-gray-400">Atualização concluída.</p>
      )}
    </Modal>
  );
}
