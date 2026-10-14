import { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { proximoMes, rotuloMesLongo } from './orcamentoValores';

// Aba Orçamentos, botão direito numa célula "HORIZON - INFORMADO": replica o valor daquele mês
// (o primeiro) em todos os meses seguintes até o mês escolhido, por cima do que já houver.
// `alvo`: { centroNome, contaRotulo, mes: 'AAAA-MM', valor } ; `sugestaoAte`: 'AAAA-MM' inicial.
export default function ReplicarValorModal({ open, onClose, alvo, sugestaoAte, onConfirmar }) {
  const [ate, setAte] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open || !alvo) return;
    setAte(sugestaoAte && sugestaoAte > alvo.mes ? sugestaoAte : '');
    setErro('');
  }, [open, alvo, sugestaoAte]);

  if (!alvo) return null;
  const minimo = proximoMes(alvo.mes);
  const semValor = alvo.valor === null || alvo.valor === undefined;
  const ateValido = Boolean(ate) && ate >= minimo;

  async function confirmar() {
    setErro('');
    setSalvando(true);
    try {
      await onConfirmar(ate);
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível replicar o valor.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={salvando ? () => {} : onClose} title="Replicar valor até">
      <div className="space-y-4">
        <div className="space-y-1 rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
          <p className="truncate font-medium text-gray-800" title={alvo.centroNome}>
            {alvo.centroNome}
          </p>
          <p className="truncate" title={alvo.contaRotulo}>
            {alvo.contaRotulo}
          </p>
          <p>
            Valor de {rotuloMesLongo(alvo.mes)}:{' '}
            <span className={`font-semibold tabular-nums ${semValor ? 'text-gray-400' : alvo.valor < 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {semValor ? 'sem valor' : alvo.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          </p>
        </div>
        {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}
        {semValor ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Informe um valor neste mês antes de replicar.
          </p>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Replicar até</label>
            <input
              type="month"
              value={ate}
              min={minimo}
              onChange={(e) => setAte(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
            />
            <p className="mt-1.5 text-[11px] text-gray-400">
              {ateValido
                ? `O valor vai para todos os meses de ${rotuloMesLongo(minimo)} a ${rotuloMesLongo(ate)}, substituindo o que já estiver lá.`
                : `Escolha um mês a partir de ${rotuloMesLongo(minimo)}.`}
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmar} disabled={semValor || !ateValido} loading={salvando}>
            Replicar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
