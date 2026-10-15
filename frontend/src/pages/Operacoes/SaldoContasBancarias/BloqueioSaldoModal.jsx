import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { registrarBloqueioSaldo } from '../../../api/saldoContasBancarias.api';
import { formatarDataBR, formatarSaldo, interpretarSaldo, somarSaldos } from './constantes';

// Botão direito na célula de saldo > Registrar bloqueio. `alvo`: { companyId, numeroConta, rotulo,
// data, saldo, bloqueio } (bloqueio = valor já registrado nesse dia, ou undefined). O disponível
// é o saldo do dia menos o bloqueado — a prévia aqui é a mesma conta que a grade faz.
export default function BloqueioSaldoModal({ alvo, empresaId, onClose, onSalvo, onPeriodoDessincronizado }) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!alvo) return;
    setTexto(alvo.bloqueio ? formatarSaldo(alvo.bloqueio) : '');
    setErro('');
  }, [alvo]);

  if (!alvo) return null;

  const valor = interpretarSaldo(texto);
  const valido = valor !== null && !Number.isNaN(valor) && valor > 0;
  const temSaldo = alvo.saldo !== undefined && alvo.saldo !== null;

  async function gravar(novoValor) {
    setErro('');
    setSalvando(true);
    try {
      await registrarBloqueioSaldo(empresaId, {
        companyId: alvo.companyId,
        numeroConta: alvo.numeroConta,
        data: alvo.data,
        valor: novoValor,
      });
      onSalvo(alvo, novoValor);
      onClose();
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível registrar o bloqueio.');
      if (err.response?.status === 409) onPeriodoDessincronizado?.();
    } finally {
      setSalvando(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!valido) {
      setErro('Informe um valor bloqueado maior que zero, ex.: 10.000,00.');
      return;
    }
    gravar(valor);
  }

  return (
    <Modal open onClose={salvando ? () => {} : onClose} title={alvo.bloqueio ? 'Alterar bloqueio' : 'Registrar bloqueio'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
          <p className="font-medium text-gray-800">{alvo.rotulo}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {formatarDataBR(alvo.data)} · Saldo do dia:{' '}
            {temSaldo ? (
              <span className={`tabular-nums ${alvo.saldo < 0 ? 'text-red-600' : 'text-gray-700'}`}>{formatarSaldo(alvo.saldo)}</span>
            ) : (
              'não informado'
            )}
          </p>
        </div>

        {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Valor bloqueado</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={texto}
              onChange={(e) => {
                if (/^[\d.,\sR$]*$/i.test(e.target.value)) setTexto(e.target.value);
              }}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="0,00"
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-right text-sm tabular-nums focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
          </div>
          {valido && temSaldo && (
            <p className="mt-1.5 text-xs text-gray-500">
              Saldo disponível:{' '}
              <span className={`font-medium tabular-nums ${somarSaldos([alvo.saldo, -valor]) < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                {formatarSaldo(somarSaldos([alvo.saldo, -valor]))}
              </span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          {alvo.bloqueio ? (
            <button
              type="button"
              onClick={() => gravar(null)}
              disabled={salvando}
              className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              Remover bloqueio
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" loading={salvando}>
              <Lock size={15} />
              Salvar
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
