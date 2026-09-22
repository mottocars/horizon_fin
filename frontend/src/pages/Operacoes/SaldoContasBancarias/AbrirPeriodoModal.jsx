import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { abrirPeriodoSaldos } from '../../../api/saldoContasBancarias.api';
import { hojeISO } from './constantes';

// O campo de data sempre nasce em "hoje" (pedido do usuário) — não no dia atualmente
// liberado — pra abrir a janela e só confirmar já ser o jeito rápido de voltar o
// lançamento pro dia de hoje depois de ter corrigido algum dia passado.
export default function AbrirPeriodoModal({ open, onClose, empresaId, onAberto }) {
  const [data, setData] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (open) {
      setData(hojeISO());
      setErro('');
    }
  }, [open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      await abrirPeriodoSaldos(empresaId, data);
      onAberto(data);
      onClose();
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível abrir o período.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Abrir período">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">
          Só o dia informado abaixo aceita lançamento de saldo — os demais ficam bloqueados até
          você abrir outro período.
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
    </Modal>
  );
}
