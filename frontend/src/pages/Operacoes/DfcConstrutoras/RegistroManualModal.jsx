import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { salvarRegistroManualRepassesDfc } from '../../../api/dfcRepasses.api';
import { formatarDataISO } from '../../../utils/datas';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const rotuloMesLongo = (m) => (m ? `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}` : '—');
// Mês atual em Brasília ('AAAA-MM') — o backend usa o mesmo limite.
const mesAtual = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
const dataHora = (v) =>
  v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

// Aba Repasses: mês em que um cliente ainda sem registro no Geral é projetado (pedido do usuário). Sem
// alteração, vale assinatura + "Tempo Entre Assinatura e Registro" (Parâmetros da obra); o mês informado
// aqui substitui o do parâmetro na Projeção CEF e nenhuma importação do Geral o desfaz. "Voltar ao
// parâmetro" apaga o mês manual. `onSalvo(resposta)`: { projecao, aviso } do backend.
export default function RegistroManualModal({ alvo, empresaId, onClose, onSalvo }) {
  const [mes, setMes] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const minimo = mesAtual();

  useEffect(() => {
    if (!alvo) return;
    const { unidade } = alvo;
    // Sugestão: o mês que vale hoje, se não tiver passado; senão o mês atual.
    setMes(unidade.registro_mes && unidade.registro_mes >= minimo ? unidade.registro_mes : minimo);
    setErro('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo]);

  if (!alvo) return null;
  const { unidade: u, empreendimento: e } = alvo;
  const manual = u.registro_manual;
  const prazo = e.prazo_registro_meses;
  const valido = /^\d{4}-\d{2}$/.test(mes) && mes >= minimo;

  async function gravar(novo) {
    setSalvando(true);
    setErro('');
    try {
      const r = await salvarRegistroManualRepassesDfc(empresaId, { contrato: e.contrato, contratoUnidade: String(u.contrato_mutuario), mes: novo });
      onSalvo(r, novo);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível salvar o mês.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open onClose={salvando ? () => {} : onClose} title="Mês do registro projetado">
      <div className="space-y-4">
        <div className="space-y-1 rounded-lg bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
          <p className="truncate text-sm font-semibold text-gray-900" title={u.mutuario}>
            {u.mutuario || '—'}
          </p>
          <p>
            Contrato {u.contrato_mutuario} · {e.name}
          </p>
          <p>Assinatura em {formatarDataISO(u.data_assinatura)} · ainda sem registro no Geral</p>
          <p>
            Pelo parâmetro:{' '}
            {u.registro_parametro_mes ? (
              <span className="font-medium text-gray-800">
                {rotuloMesLongo(u.registro_parametro_mes)} (assinatura + {prazo} {prazo === 1 ? 'mês' : 'meses'})
              </span>
            ) : (
              <span className="text-gray-400">sem "Tempo Entre Assinatura e Registro" nos Parâmetros da obra</span>
            )}
          </p>
          {manual && (
            <p className="text-amber-700">
              Hoje: {rotuloMesLongo(manual.mes)}, informado à mão{manual.usuario ? ` por ${manual.usuario}` : ''}
              {manual.atualizado_em ? ` em ${dataHora(manual.atualizado_em)}` : ''}.
            </p>
          )}
        </div>

        {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Projetar o registro em</label>
          <input
            type="month"
            value={mes}
            min={minimo}
            onChange={(ev) => setMes(ev.target.value)}
            className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
            {valido
              ? `A Projeção CEF da obra é recalculada com o registro em ${rotuloMesLongo(mes)}. Nenhuma importação do Geral desfaz esse mês; quando o Geral trouxer a data de registro, ela passa a valer.`
              : `Escolha ${rotuloMesLongo(minimo)} ou um mês depois — cliente sem registro não é projetado no passado.`}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          {manual ? (
            <button
              type="button"
              onClick={() => gravar(null)}
              disabled={salvando}
              title="Apaga o mês manual: o cliente volta a ser projetado pela assinatura + prazo dos Parâmetros"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50"
            >
              <RotateCcw size={13} />
              Voltar ao parâmetro
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => gravar(mes)} disabled={!valido || (manual && manual.mes === mes)} loading={salvando}>
              Salvar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
