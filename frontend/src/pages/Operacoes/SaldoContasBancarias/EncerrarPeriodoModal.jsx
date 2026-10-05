import { useEffect, useState } from 'react';
import { Lock, Loader2, CheckCircle2, AlertTriangle, HelpCircle, Users, Clock, ListChecks } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { getComunicarSaldos, encerrarPeriodoSaldos, getRotinasStatus } from '../../../api/saldoContasBancarias.api';
import { formatarDataBR } from './constantes';

// Fluxo: 'confirmar' (mostra o aviso de sempre + quem vai ser avisado por WhatsApp, se houver
// alguém configurado em Comunicar Saldos) -> 'enviando' (encerra o período de verdade e espera
// o aviso terminar — pode levar alguns segundos) -> 'resultado' (o que foi enviado, pra quem
// falhou e por quê). Antes disso o aviso era disparado sem a tela mostrar nada — pedido do
// usuário: precisa aparecer quem recebe, o carregamento, e o resultado final.
export default function EncerrarPeriodoModal({ open, onClose, empresaId, dataAberta, onEncerrado, onPeriodoDessincronizado }) {
  const [etapa, setEtapa] = useState('confirmar');
  const [carregandoDestinatarios, setCarregandoDestinatarios] = useState(true);
  const [nomesDestinatarios, setNomesDestinatarios] = useState([]);
  const [encerrando, setEncerrando] = useState(false);
  const [erro, setErro] = useState('');
  const [notificacao, setNotificacao] = useState(null);
  // Andamento das rotinas (parâmetro Gerar Rotinas): com alguma pendente, o período não encerra.
  const [rotinas, setRotinas] = useState(null);

  useEffect(() => {
    if (!open) return;
    setEtapa('confirmar');
    setErro('');
    setNotificacao(null);
    setCarregandoDestinatarios(true);
    setRotinas(null);
    getRotinasStatus(empresaId)
      .then(setRotinas)
      .catch(() => setRotinas(null));
    getComunicarSaldos(empresaId)
      .then((dados) => {
        const selecionados = new Set(dados.selecionados);
        setNomesDestinatarios(dados.elegiveis.filter((u) => selecionados.has(u.id)).map((u) => u.nome));
      })
      .catch(() => setNomesDestinatarios([]))
      .finally(() => setCarregandoDestinatarios(false));
  }, [open, empresaId]);

  async function handleEncerrar() {
    setErro('');
    setEncerrando(true);
    setEtapa('enviando');
    try {
      const resultado = await encerrarPeriodoSaldos(empresaId);
      setNotificacao(resultado.notificacao);
      setEtapa('resultado');
      onEncerrado();
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível encerrar o período.');
      setEtapa('confirmar');
      // Se algo já mudou por fora (outra aba/pessoa encerrou primeiro, etc.) o próximo
      // carregamento do período corrige a tela sozinho.
      onPeriodoDessincronizado?.();
    } finally {
      setEncerrando(false);
    }
  }

  return (
    <Modal open={open} onClose={etapa === 'enviando' ? () => {} : onClose} title="Encerrar período">
      {etapa === 'confirmar' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            O período de {formatarDataBR(dataAberta)} está aberto pra lançamento. Depois de
            encerrado, será preciso reabri-lo pra lançar nesse dia de novo.
          </p>

          {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

          <StatusRotinas rotinas={rotinas} />

          {carregandoDestinatarios ? (
            <div className="text-sm text-gray-400">Verificando quem será avisado...</div>
          ) : (
            nomesDestinatarios.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-primary-50 px-3 py-2.5 text-sm text-primary-700">
                <Users size={16} className="mt-0.5 shrink-0" />
                <span>
                  <strong className="font-medium">
                    {nomesDestinatarios.length} pessoa{nomesDestinatarios.length !== 1 ? 's' : ''}
                  </strong>{' '}
                  {nomesDestinatarios.length !== 1 ? 'receberão' : 'receberá'} um aviso por WhatsApp:{' '}
                  {nomesDestinatarios.join(', ')}.
                </span>
              </div>
            )
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleEncerrar}
              loading={encerrando}
              disabled={rotinasPendentes(rotinas).length > 0}
              title={rotinasPendentes(rotinas).length > 0 ? 'Aguardando o encerramento de todas as rotinas' : undefined}
            >
              <Lock size={15} />
              Encerrar período
            </Button>
          </div>
        </div>
      )}

      {etapa === 'enviando' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 size={28} className="animate-spin text-primary-600" />
          <p className="text-sm font-medium text-gray-700">Encerrando o período…</p>
          {nomesDestinatarios.length > 0 && (
            <p className="text-xs text-gray-400">
              Testando e enviando o aviso por WhatsApp pra quem está configurado em Comunicar Saldos.
            </p>
          )}
        </div>
      )}

      {etapa === 'resultado' && (
        <div className="space-y-4">
          <ResumoNotificacao notificacao={notificacao} />

          <div className="flex justify-end pt-2">
            <Button type="button" onClick={onClose}>
              Concluir
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function rotinasPendentes(rotinas) {
  return rotinas?.gerar ? rotinas.responsaveis.filter((r) => !r.encerrada) : [];
}

// Com "Gerar Rotinas" ligado: quem já encerrou a rotina e quem falta — o botão Encerrar
// período só libera com todas encerradas (o backend também recusa, ROTINAS_PENDENTES).
function StatusRotinas({ rotinas }) {
  if (!rotinas?.gerar || rotinas.responsaveis.length === 0) return null;
  const pendentes = rotinasPendentes(rotinas);
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${pendentes.length ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
      <p className={`flex items-center gap-2 text-sm font-medium ${pendentes.length ? 'text-amber-800' : 'text-emerald-700'}`}>
        <ListChecks size={16} className="shrink-0" />
        {pendentes.length
          ? `Aguardando ${pendentes.length} rotina(s) — o período só pode ser encerrado depois que todos encerrarem.`
          : 'Todas as rotinas foram encerradas.'}
      </p>
      <ul className="mt-2 space-y-1">
        {rotinas.responsaveis.map((r) => (
          <li key={r.usuarioId} className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-gray-700">
              <span className="font-medium">{r.nome}</span>
              <span className="text-gray-400"> · {r.preenchidas}/{r.contas} conta(s) com saldo</span>
            </span>
            {r.encerrada ? (
              <span className="flex shrink-0 items-center gap-1 font-medium text-emerald-600">
                <CheckCircle2 size={13} /> Encerrada
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1 font-medium text-amber-700">
                <Clock size={13} /> Pendente
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Deriva um resumo (visual + texto) do resultado estruturado de
// comunicarSaldos.service.js::notificarComunicarSaldos — mesmo par de cores/ícones já usado em
// LinhaIntegracao (AbrirPeriodoModal.jsx) pra manter os dois modais parecidos.
function resumirNotificacao(notificacao) {
  if (!notificacao || notificacao.status === 'sem_conexao' || notificacao.status === 'sem_destinatario') {
    return { estado: 'nada', texto: 'Nenhum destinatário configurado em Comunicar Saldos — ninguém foi avisado.' };
  }
  if (notificacao.status === 'sem_dados') {
    return { estado: 'nada', texto: 'Nenhum saldo lançado nesse dia — nenhum aviso foi enviado.' };
  }
  if (notificacao.status === 'erro') {
    return { estado: 'erro', texto: `Não foi possível enviar os avisos: ${notificacao.mensagem}` };
  }
  const { enviados, falhas } = notificacao;
  if (falhas.length === 0) {
    return { estado: 'ok', texto: `Aviso enviado por WhatsApp para ${enviados.length} destinatário${enviados.length !== 1 ? 's' : ''}.` };
  }
  if (enviados.length === 0) {
    return { estado: 'erro', texto: 'Não foi possível enviar o aviso pra nenhum destinatário.' };
  }
  return { estado: 'erro', texto: `Enviado para ${enviados.length} de ${enviados.length + falhas.length} destinatário(s).` };
}

const ESTADO_VISUAL = {
  ok: { className: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  erro: { className: 'bg-amber-100 text-amber-700', Icon: AlertTriangle },
  nada: { className: 'bg-gray-100 text-gray-600', Icon: HelpCircle },
};

function ResumoNotificacao({ notificacao }) {
  const { estado, texto } = resumirNotificacao(notificacao);
  const { className, Icon } = ESTADO_VISUAL[estado];
  const falhas = notificacao?.falhas || [];
  return (
    <div className="space-y-2">
      <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${className}`}>
        <Icon size={16} className="mt-0.5 shrink-0" />
        <span>{texto}</span>
      </div>
      {falhas.length > 0 && (
        <ul className="space-y-0.5 pl-1 text-xs text-gray-500">
          {falhas.map((f, i) => (
            <li key={i}>
              • {f.nome}: {f.motivo}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
