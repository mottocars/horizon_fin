import { useEffect, useState } from 'react';
import { Lock, Loader2, CheckCircle2, AlertTriangle, HelpCircle, Wifi } from 'lucide-react';
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
          <LinhaIntegracao
            nome="Conexão VanPix"
            status={
              erroVanpix
                ? 'erro'
                : !relatorioVanpix || relatorioVanpix.convenios.length === 0
                  ? 'sem_convenio'
                  : 'ok'
            }
            texto={
              erroVanpix
                ? 'Falha de conexão'
                : !relatorioVanpix || relatorioVanpix.convenios.length === 0
                  ? 'Nenhum convênio configurado'
                  : `Ok, ${relatorioVanpix.atualizados.length} conta(s) integrada(s)`
            }
          />

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

// Uma linha só por integração (pedido do usuário: reduzir os logs da busca automática) — hoje só
// existe VanPix, mas o componente já é genérico pra caber outras integrações no futuro sem
// crescer a lista nem precisar de rolagem. Mesmo selo "positivo" (pill esmeralda + CheckCircle2)
// já usado em CertificadosDigitaisPage.jsx pra status de conexão/validade.
const STATUS_INTEGRACAO = {
  ok: { className: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  erro: { className: 'bg-amber-100 text-amber-700', Icon: AlertTriangle },
  sem_convenio: { className: 'bg-gray-100 text-gray-600', Icon: HelpCircle },
};

function LinhaIntegracao({ nome, status, texto }) {
  const { className, Icon } = STATUS_INTEGRACAO[status];
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Wifi size={16} className="text-gray-400" />
        {nome}
      </span>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
        <Icon size={13} />
        {texto}
      </span>
    </div>
  );
}
