import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

// Resultado do comunicado de uma versão ({ status, enviados, falhas } — cronogramaVersoes.service.js).
export default function ResultadoComunicado({ comunicado, compacto = false }) {
  if (!comunicado) return <span className="text-gray-400">—</span>;
  const { status, enviados = [], falhas = [] } = comunicado;
  if (status === 'sem_conexao') return <Aviso texto="Sem conexão de disparo — ninguém recebeu" />;
  if (status === 'sem_destinatario') return <Aviso texto="Sem destinatários — ninguém recebeu" />;
  if (status === 'erro') return <Aviso texto={`O comunicado falhou: ${comunicado.motivo || 'erro desconhecido'}`} erro />;
  const total = enviados.length + falhas.length;
  return (
    <div className="space-y-1">
      <p className={`flex items-center gap-1.5 ${falhas.length ? 'text-amber-700' : 'text-emerald-700'}`}>
        {falhas.length ? <AlertTriangle size={14} className="shrink-0" /> : <CheckCircle2 size={14} className="shrink-0" />}
        WhatsApp enviado para {enviados.length} de {total}
        {!compacto && enviados.length > 0 && <span className="text-gray-500">({enviados.map((e) => e.nome).join(', ')})</span>}
      </p>
      {falhas.map((f) => (
        <p key={f.nome} className="flex items-start gap-1.5 text-xs text-red-600">
          <XCircle size={13} className="mt-0.5 shrink-0" />
          {f.nome}: {f.motivo}
        </p>
      ))}
    </div>
  );
}

function Aviso({ texto, erro = false }) {
  return (
    <p className={`flex items-center gap-1.5 ${erro ? 'text-red-600' : 'text-gray-500'}`}>
      <AlertTriangle size={14} className="shrink-0" />
      {texto}
    </p>
  );
}
