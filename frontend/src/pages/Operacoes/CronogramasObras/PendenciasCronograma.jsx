import { useState } from 'react';
import { Clock, Send, Trash2 } from 'lucide-react';
import Button from '../../../components/Button';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { descartarPendenciaCronograma } from '../../../api/cronogramaCentros.api';
import { linhasDaObra } from './cronogramaObras';
import GravarVersaoModal from './GravarVersaoModal';
import LinhaAlteracao from './LinhaAlteracao';

const quando = (ts) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));

// Quadro das alterações pendentes da aba Centros de Custos de Cronogramas Obras (versionamento do
// cronograma — pedido do usuário): o que foi alterado nas etapas das obras e ainda não está no
// cronograma, descartar a de uma obra e o botão de gravar a nova versão (GravarVersaoModal).
// `pendencias`: listPendenciasCronograma; `onMudou()`: recarregar a lista e as pendências.
export default function PendenciasCronograma({ empresaId, pendencias, onMudou }) {
  const confirm = useConfirm();
  const [gravando, setGravando] = useState(false);
  const [descartando, setDescartando] = useState(null);
  const [erro, setErro] = useState('');
  const { alteracoes, comunicado, proximaVersao } = pendencias;
  if (!alteracoes.length) return null;

  async function descartar(obra) {
    const ok = await confirm({
      title: 'Descartar alteração',
      description: `Descartar a alteração pendente de "${obra.nome}"? As datas dela voltam a ser as do cronograma em vigor.`,
      confirmLabel: 'Descartar',
      variant: 'danger',
    });
    if (!ok) return;
    setErro('');
    setDescartando(obra.sienge_id);
    try {
      await descartarPendenciaCronograma(empresaId, obra.sienge_id);
      onMudou();
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível descartar.');
    } finally {
      setDescartando(null);
    }
  }

  const destinatarios = comunicado.destinatarios.map((d) => d.nome);
  return (
    <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60" aria-label="Alterações pendentes">
      <div className="flex flex-col gap-3 border-b border-amber-200/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <Clock size={15} className="shrink-0" />
            {alteracoes.length === 1 ? '1 obra com alteração pendente' : `${alteracoes.length} obras com alteração pendente`}
          </h3>
          <p className="mt-0.5 text-xs text-amber-800/80">
            Ainda fora do cronograma — entram quando a versão {proximaVersao} for gravada.{' '}
            {comunicado.conexao && destinatarios.length
              ? `O comunicado vai por WhatsApp para ${destinatarios.join(', ')}.`
              : 'Sem conexão de disparo ou destinatários na aba Configurações: a versão é gravada sem comunicado.'}
          </p>
        </div>
        <Button type="button" onClick={() => setGravando(true)} className="shrink-0">
          <Send size={15} />
          Gravar versão {proximaVersao}
        </Button>
      </div>
      {erro && <p className="px-4 pt-2 text-xs text-red-600">{erro}</p>}
      <ul className="divide-y divide-amber-200/60">
        {alteracoes.map((obra) => (
          <li key={obra.sienge_id} className="flex items-start justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-900">
                {obra.nome}
                <span className="ml-2 text-[11px] font-normal text-gray-500">
                  {obra.atualizado_por ? `por ${obra.atualizado_por} · ` : ''}
                  {quando(obra.atualizado_em)}
                </span>
              </p>
              <ul className="mt-1 space-y-0.5">
                {linhasDaObra(obra).map((l) => (
                  <LinhaAlteracao key={l.chave} linha={l} />
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => descartar(obra)}
              disabled={descartando === obra.sienge_id}
              title="Descartar a alteração desta obra"
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-amber-100 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 size={13} />
              Descartar
            </button>
          </li>
        ))}
      </ul>
      <GravarVersaoModal
        empresaId={empresaId}
        aberto={gravando}
        pendencias={pendencias}
        onFechar={() => setGravando(false)}
        onGravada={onMudou}
      />
    </section>
  );
}
