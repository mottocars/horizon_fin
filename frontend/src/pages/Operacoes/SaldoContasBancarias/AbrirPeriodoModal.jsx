import { useEffect, useState } from 'react';
import { Lock, Loader2, CheckCircle2, AlertTriangle, History, Wifi } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { abrirPeriodoSaldos, buscarSaldosVanpix } from '../../../api/saldoContasBancarias.api';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { formatarDataBR, hojeISO } from './constantes';

// Fluxo: 'form' (escolher a data) -> 'vanpix' (período já aberto, buscando saldo automático
// na VanPix) -> 'resultado' (resumo do que foi encontrado, antes de fechar). Encerrar o
// período aberto é uma simples confirmação (useConfirm), disparada direto pela página — não
// precisa de modal próprio.
export default function AbrirPeriodoModal({ open, onClose, empresaId, onAberto }) {
  const confirm = useConfirm();
  const [data, setData] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [etapa, setEtapa] = useState('form');
  const [relatorioVanpix, setRelatorioVanpix] = useState(null);
  const [erroVanpix, setErroVanpix] = useState('');

  useEffect(() => {
    if (open) {
      setData(hojeISO());
      setErro('');
      setEtapa('form');
      setRelatorioVanpix(null);
      setErroVanpix('');
    }
  }, [open]);

  async function tentarAbrir(alvo, reabrirEncerrado) {
    await abrirPeriodoSaldos(empresaId, alvo, reabrirEncerrado);
    onAberto(alvo);
    setEtapa('vanpix');
    try {
      setRelatorioVanpix(await buscarSaldosVanpix(empresaId, alvo));
    } catch (err) {
      setErroVanpix(err.response?.data?.message || 'Não foi possível buscar os saldos automaticamente na VanPix.');
    } finally {
      setEtapa('resultado');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await tentarAbrir(data, false);
    } catch (err) {
      if (err.response?.data?.code === 'PERIODO_ENCERRADO') {
        // Pergunta fora do modal de data (useConfirm por cima dele) — reaproveita o mesmo
        // padrão usado em qualquer outra confirmação do sistema (ex.: remover logomarca).
        const reabrir = await confirm({
          title: 'Período já encerrado',
          description: `O período de ${formatarDataBR(data)} já foi encerrado. Deseja reabri-lo?`,
          confirmLabel: 'Reabrir período',
          variant: 'warning',
        });
        if (reabrir) {
          try {
            await tentarAbrir(data, true);
          } catch (err2) {
            setErro(err2.response?.data?.message || 'Não foi possível reabrir o período.');
          }
        }
      } else {
        setErro(err.response?.data?.message || 'Não foi possível abrir o período.');
      }
    } finally {
      setSalvando(false);
    }
  }

  const ROTULO_STATUS = {
    ok_com_retorno: 'retorno encontrado',
    ok_sem_retorno: 'sem retorno pra esse dia',
    apelido_invalido: 'convênio não reconhecido',
    credencial_invalida: 'credencial inválida',
    erro_rede: 'falha de conexão',
    desconhecido: 'resposta inesperada',
  };

  return (
    <Modal open={open} onClose={etapa === 'vanpix' ? () => {} : onClose} title="Abrir período">
      {etapa === 'form' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-500">
            Só o dia informado abaixo aceita lançamento de saldo — os demais ficam bloqueados até
            este período ser encerrado.
          </p>

          {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Data liberada para lançamento</label>
            <input
              type="date"
              value={data}
              onChange={(e) => e.target.value && setData(e.target.value)}
              autoFocus
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={salvando}>
              <Lock size={15} />
              Abrir período
            </Button>
          </div>
        </form>
      )}

      {etapa === 'vanpix' && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 size={28} className="animate-spin text-primary-600" />
          <p className="text-sm font-medium text-gray-700">Buscando saldos automaticamente na VanPix…</p>
          <p className="text-xs text-gray-400">
            Período de {formatarDataBR(data)} já está aberto. Confira aqui as contas que já têm a
            integração VanPix cadastrada.
          </p>
        </div>
      )}

      {etapa === 'resultado' && (
        <div className="space-y-4">
          {erroVanpix && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                O período foi aberto normalmente, mas a busca automática na VanPix falhou: {erroVanpix} Lance os
                saldos manualmente.
              </span>
            </div>
          )}

          {!erroVanpix && relatorioVanpix && relatorioVanpix.convenios.length === 0 && (
            <p className="text-sm text-gray-500">
              Nenhuma conexão VanPix ativa cadastrada para esta empresa — lance os saldos manualmente.
            </p>
          )}

          {!erroVanpix && relatorioVanpix && relatorioVanpix.convenios.length > 0 && (
            <>
              <div className="space-y-1.5">
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
                  <Wifi size={13} /> Convênios verificados
                </p>
                {relatorioVanpix.convenios.map((c, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-sm">
                    <span className="font-medium text-gray-700">{c.apelido}</span>
                    <span className="text-gray-500">{ROTULO_STATUS[c.status] || c.status}</span>
                  </div>
                ))}
              </div>

              {relatorioVanpix.atualizados.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {relatorioVanpix.atualizados.length} conta(s) preenchida(s) automaticamente com o saldo da VanPix
                    em {formatarDataBR(data)}.
                  </span>
                </div>
              )}

              {relatorioVanpix.herdados?.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-purple-50 px-3 py-2 text-sm text-purple-700">
                  <History size={16} className="mt-0.5 shrink-0" />
                  <span>
                    {relatorioVanpix.herdados.length} conta(s) sem retorno da VanPix hoje — repetiram o saldo do dia
                    anterior (prioridade da classificação).
                  </span>
                </div>
              )}

              {relatorioVanpix.semCorrespondencia.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p>
                      {relatorioVanpix.semCorrespondencia.length} conta(s) vieram da VanPix mas não têm banco, conta
                      e dígito correspondentes no cadastro:
                    </p>
                    <ul className="mt-1 list-inside list-disc">
                      {relatorioVanpix.semCorrespondencia.map((s, i) => (
                        <li key={i}>
                          banco {s.banco}, conta {s.conta}-{s.digito} ({s.apelido})
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </>
          )}

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
