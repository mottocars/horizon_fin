import { CheckCircle2, MessageCircleOff, ShieldAlert, ShieldCheck } from 'lucide-react';
import Card from '../../../components/Card';

// Alertas de atividade suspeita gravados pelo backend (ver
// backend/src/modules/alertas-seguranca/) — cada linha é um episódio: o
// primeiro sinal mandou o WhatsApp; os iguais que vieram depois, dentro do
// intervalo de silêncio, só somam em "Ocorrências".

function formatarDataHora(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function quem(alerta) {
  if (alerta.usuario_nome) return alerta.usuario_nome;
  if (alerta.username) return `Login digitado: ${alerta.username}`;
  return 'Sem login';
}

export default function AlertasSegurancaTabela({ alertas }) {
  return (
    <Card>
      <div className="flex items-start gap-2">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Alertas de atividade suspeita</h2>
          <p className="text-xs text-gray-500">
            Acessos por fora do navegador, robôs, tokens forjados, senhas em massa, limite estourado, varreduras e acessos do
            exterior. O primeiro sinal de cada alerta vai por WhatsApp ao Bruno Motta; os iguais que vêm depois só somam em
            Ocorrências.
          </p>
        </div>
      </div>

      {alertas.length === 0 ? (
        <div className="mt-4 flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
          <ShieldCheck size={16} className="text-emerald-500" />
          Nenhuma atividade suspeita nesse período.
        </div>
      ) : (
        <div className="mt-4 max-h-[420px] overflow-auto rounded-lg border border-gray-100">
          <table className="w-full min-w-[960px] border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="text-left text-gray-500">
                {['Quando', 'Alerta', 'Quem', 'IP', 'Chamada', 'Ocorrências', 'WhatsApp'].map((titulo) => (
                  <th
                    key={titulo}
                    className={`sticky top-0 z-10 border-b border-gray-100 bg-white px-3 py-2 font-medium ${
                      titulo === 'Ocorrências' ? 'text-right' : ''
                    }`}
                  >
                    {titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alertas.map((a) => (
                <tr key={a.id} className="align-top">
                  <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-gray-500">
                    {formatarDataHora(a.criado_em)}
                    {a.ocorrencias > 1 && (
                      <div className="text-[11px] text-gray-400">até {formatarDataHora(a.ultimo_em)}</div>
                    )}
                  </td>
                  <td className="max-w-[300px] border-b border-gray-100 px-3 py-2" title={a.detalhe || undefined}>
                    <p className="font-medium text-red-700">{a.titulo}</p>
                    {a.detalhe && <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">{a.detalhe}</p>}
                  </td>
                  <td className="max-w-[180px] truncate border-b border-gray-100 px-3 py-2 font-medium text-gray-700" title={quem(a)}>
                    {quem(a)}
                  </td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 font-mono text-[11px] text-gray-500" title={a.user_agent || undefined}>
                    {a.ip || '—'}
                    {a.pais && (
                      <span
                        className={`ml-1.5 rounded px-1 py-px text-[10px] font-semibold ${
                          a.pais !== 'BR' && a.pais !== 'LOCAL' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {a.pais === 'LOCAL' ? 'rede interna' : a.pais}
                      </span>
                    )}
                  </td>
                  <td className="max-w-[220px] truncate border-b border-gray-100 px-3 py-2 font-mono text-[11px] text-gray-500" title={a.rota || undefined}>
                    {a.rota || '—'}
                  </td>
                  <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums text-gray-700">
                    {a.ocorrencias.toLocaleString('pt-BR')}
                  </td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2">
                    {a.whatsapp_enviado ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle2 size={13} /> Enviado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-500" title={a.whatsapp_erro || undefined}>
                        <MessageCircleOff size={13} /> Não enviado
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
