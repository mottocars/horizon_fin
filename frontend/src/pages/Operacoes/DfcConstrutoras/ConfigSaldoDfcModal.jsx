import { useEffect, useState } from 'react';
import { CreditCard, Loader2, Lock, LockOpen, TriangleAlert } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { getConfigSaldoDfc, salvarConfigSaldoDfc } from '../../../api/dfcContas.api';
import { useLeituraDfc } from './leituraDfc';

// DFC Construtoras › Contas › engrenagem (pedido do usuário, 26/11/2026): de onde vem o Saldo Inicial da aba DFC.
// - Sistema ERP: como sempre — o saldo real das contas com Projeta DFC pelo extrato do Sienge, mês a mês;
// - Saldo das Contas Horizon: o totalizador da tela Saldo Contas Bancárias (último dia com saldo lançado até hoje),
//   só no mês atual, somando as partes marcadas aqui. Mesmo visual do rodapé de lá (ícones e cores das linhas).
// Backend: dfc-contas (config-saldo) e dfc-saldos::saldoHorizon.

const TIPOS = [
  { value: 'ERP', label: 'Sistema ERP' },
  { value: 'HORIZON', label: 'Saldo das Contas Horizon' },
];

const PARTES = [
  { campo: 'soma_liberado', valor: 'liberado', rotulo: 'Liberado', Icone: LockOpen, cor: 'text-emerald-700' },
  { campo: 'soma_cheque', valor: 'limite_cheque', rotulo: 'Cheque especial', Icone: CreditCard, cor: 'text-purple-700' },
  { campo: 'soma_bloqueado', valor: 'bloqueado', rotulo: 'Bloqueado', Icone: Lock, cor: 'text-amber-700' },
];

const dinheiro = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export default function ConfigSaldoDfcModal({ empresaId, onClose }) {
  const { somenteLeitura, motivo } = useLeituraDfc();
  const [form, setForm] = useState(null);
  const [totalizador, setTotalizador] = useState(null);
  const [erroCarga, setErroCarga] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    getConfigSaldoDfc(empresaId)
      .then((c) => {
        setForm({ tipo_saldo: c.tipo_saldo, soma_liberado: c.soma_liberado, soma_cheque: c.soma_cheque, soma_bloqueado: c.soma_bloqueado });
        setTotalizador(c.totalizador);
      })
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar a configuração.'));
  }, [empresaId]);

  const horizon = form?.tipo_saldo === 'HORIZON';
  const soma = form && totalizador ? PARTES.reduce((t, p) => t + (form[p.campo] ? Number(totalizador[p.valor] || 0) : 0), 0) : 0;

  async function salvar() {
    setErro('');
    if (horizon && !PARTES.some((p) => form[p.campo])) {
      setErro('Marque ao menos uma parte do saldo.');
      return;
    }
    setSalvando(true);
    try {
      await salvarConfigSaldoDfc(empresaId, form);
      onClose(true);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open onClose={() => onClose(false)} title="Configurações" maxWidthClass="max-w-lg">
      {erroCarga ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <TriangleAlert size={24} className="text-red-400" />
          <p className="text-sm text-gray-600">{erroCarga}</p>
        </div>
      ) : !form ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 size={16} className="animate-spin" /> Carregando...
        </div>
      ) : (
        <>
        <fieldset disabled={somenteLeitura || salvando} className="min-w-0" title={somenteLeitura ? motivo || 'Só leitura' : undefined}>
          <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de Saldo das Contas</label>
          <SearchableSelect
            value={form.tipo_saldo}
            onChange={(v) => v && setForm((f) => ({ ...f, tipo_saldo: v }))}
            options={TIPOS}
            clearable={false}
            disabled={somenteLeitura || salvando}
          />
          <p className="mt-1.5 text-xs text-gray-500">
            {horizon
              ? 'O Saldo Inicial da aba DFC aparece só no mês atual: a soma das partes marcadas abaixo, do totalizador da tela Saldo Contas Bancárias. Os meses seguintes partem do saldo final projetado.'
              : 'O Saldo Inicial da aba DFC vem do extrato do Sienge das contas com Projeta DFC, mês a mês.'}
          </p>

          {horizon && (
            <div className="mt-4">
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">Totalizador do Saldo Contas Bancárias</span>
                <span className="text-xs text-gray-500">{totalizador?.data ? `em ${dataBR(totalizador.data)}` : 'nenhum saldo lançado até hoje'}</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-blue-100">
                <div className="flex items-center justify-between border-b-2 border-blue-500 bg-blue-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                  <span>Saldo inicial da DFC</span>
                  <span className={`font-bold tabular-nums ${soma < 0 ? 'text-red-600' : ''}`}>{dinheiro(soma)}</span>
                </div>
                {PARTES.map(({ campo, valor, rotulo, Icone, cor }) => (
                  <label
                    key={campo}
                    className="flex cursor-pointer items-center justify-between gap-3 border-t border-blue-100 px-4 py-2 first-of-type:border-t-0 hover:bg-gray-50"
                  >
                    <span className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${cor}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(form[campo])}
                        onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.checked }))}
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-100"
                      />
                      <Icone size={13} className="shrink-0" />
                      {rotulo}
                    </span>
                    <span className={`text-xs font-semibold tabular-nums ${form[campo] ? 'text-gray-800' : 'text-gray-400'}`}>
                      {dinheiro(totalizador?.[valor])}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </fieldset>

          {erro && (
            <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="status">
              {erro}
            </div>
          )}
          {somenteLeitura && <p className="mt-3 text-xs text-amber-700">{motivo || 'A DFC está só leitura.'}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onClose(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={salvar} loading={salvando} disabled={somenteLeitura}>
              Salvar
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
