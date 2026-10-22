import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { createHistoricoImposto, listHistoricoImposto, removeHistoricoImposto } from '../../../api/dreMascaras.api';

// 'AAAA-MM' -> 'MM/AAAA'
const rotuloMes = (anoMes) => {
  const [ano, mes] = anoMes.split('-');
  return `${mes}/${ano}`;
};

function mesAnterior(anoMes) {
  let [ano, mes] = anoMes.split('-').map(Number);
  mes -= 1;
  if (mes < 1) {
    mes = 12;
    ano -= 1;
  }
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

const formatarAliquota = (v) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;

// Alíquota digitada ("4", "4,5", "0,6500") -> número; inválida -> null.
function lerAliquota(texto) {
  const limpo = texto.trim().replace('%', '').trim();
  if (!/^\d{1,3}([,.]\d{1,4})?$/.test(limpo)) return null;
  const valor = Number(limpo.replace(',', '.'));
  return valor <= 100 ? valor : null;
}

// O que o histórico novo muda nos que já existem: o vigente antes dele passa a terminar no mês
// anterior, e ele vale até o mês anterior ao próximo (se houver um depois). `historico` vem do
// mais recente pro mais antigo.
function efeitoDoNovo(historico, inicio) {
  if (!inicio) return null;
  const anterior = historico.find((h) => h.inicio < inicio);
  const proximo = [...historico].reverse().find((h) => h.inicio > inicio);
  const partes = [];
  if (anterior) {
    partes.push(
      `O histórico de ${formatarAliquota(anterior.aliquota)} (desde ${rotuloMes(anterior.inicio)}) passa a terminar em ${rotuloMes(mesAnterior(inicio))}.`
    );
  }
  partes.push(
    proximo
      ? `Este vale de ${rotuloMes(inicio)} a ${rotuloMes(mesAnterior(proximo.inicio))}.`
      : `Este vale a partir de ${rotuloMes(inicio)}, sem data de fim.`
  );
  return partes.join(' ');
}

// DRE Gerencial > Máscaras, origem Imposto Fixo > "Informar histórico": as alíquotas da máscara,
// cada uma valendo a partir de um mês. O fim não é digitado — cada uma vai até o mês anterior ao
// início da seguinte (calculado no backend), então criar uma nova fecha a anterior.
// `mascara`: { id, descricao } ou null (fechada).
export default function HistoricoImpostoModal({ empresaId, mascara, onClose }) {
  const confirm = useConfirm();
  const [historico, setHistorico] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [inicio, setInicio] = useState('');
  const [aliquotaTexto, setAliquotaTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!mascara) return;
    setHistorico([]);
    setInicio('');
    setAliquotaTexto('');
    setErro('');
    setCarregando(true);
    listHistoricoImposto(empresaId, mascara.id)
      .then(setHistorico)
      .catch((err) => setErro(err.response?.data?.message || 'Não foi possível carregar o histórico.'))
      .finally(() => setCarregando(false));
  }, [empresaId, mascara]);

  if (!mascara) return null;
  const aliquota = lerAliquota(aliquotaTexto);
  const repetido = historico.some((h) => h.inicio === inicio);
  const podeAdicionar = Boolean(inicio) && aliquota !== null && !repetido;

  async function adicionar() {
    setErro('');
    setSalvando(true);
    try {
      setHistorico(await createHistoricoImposto(empresaId, mascara.id, { inicio, aliquota }));
      setInicio('');
      setAliquotaTexto('');
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível salvar o histórico.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(h) {
    const confirmado = await confirm({
      title: 'Remover histórico',
      description: `Remover a alíquota de ${formatarAliquota(h.aliquota)} que começa em ${rotuloMes(h.inicio)}? O histórico anterior volta a valer no lugar dela.`,
      confirmLabel: 'Remover',
    });
    if (!confirmado) return;
    setErro('');
    try {
      setHistorico(await removeHistoricoImposto(empresaId, mascara.id, h.id));
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível remover o histórico.');
    }
  }

  const campo =
    'h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

  return (
    <Modal open onClose={salvando ? () => {} : onClose} title="Histórico do imposto fixo" maxWidthClass="max-w-lg">
      <div className="space-y-4">
        <p className="truncate rounded-lg bg-gray-50 px-3 py-2.5 text-xs font-medium text-gray-800" title={mascara.descricao}>
          {mascara.descricao}
        </p>

        {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}

        <div className="overflow-hidden rounded-lg border border-gray-200">
          <div className="grid grid-cols-[1fr_1fr_1fr_32px] gap-2 bg-blue-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-blue-700">
            <span>Início</span>
            <span>Fim</span>
            <span className="text-right">Alíquota</span>
            <span />
          </div>
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
              <Loader2 size={14} className="animate-spin" />
              Carregando...
            </div>
          ) : historico.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">Nenhum histórico informado ainda.</p>
          ) : (
            historico.map((h) => (
              <div
                key={h.id}
                className="grid grid-cols-[1fr_1fr_1fr_32px] items-center gap-2 border-t border-gray-100 px-3 py-1.5 text-xs text-gray-800"
              >
                <span className="tabular-nums">{rotuloMes(h.inicio)}</span>
                <span className={h.fim ? 'tabular-nums' : 'font-medium text-emerald-600'}>{h.fim ? rotuloMes(h.fim) : 'Vigente'}</span>
                <span className="text-right font-semibold tabular-nums">{formatarAliquota(h.aliquota)}</span>
                <button
                  type="button"
                  title="Remover"
                  onClick={() => remover(h)}
                  className="flex h-6 w-6 items-center justify-center justify-self-end rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2 rounded-lg border border-dashed border-gray-200 p-3">
          <p className="text-sm font-medium text-gray-700">Novo histórico</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Início (mês/ano)</label>
              <input type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} className={campo} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Alíquota (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={aliquotaTexto}
                placeholder="Ex.: 4,00"
                onChange={(e) => setAliquotaTexto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && podeAdicionar && !salvando && adicionar()}
                className={campo}
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            {repetido
              ? `Já existe um histórico começando em ${rotuloMes(inicio)}. Remova-o antes para informar outra alíquota nesse mês.`
              : aliquotaTexto && aliquota === null
                ? 'Alíquota inválida: use um número de 0 a 100, com até 4 casas decimais.'
                : efeitoDoNovo(historico, inicio) || 'Escolha o mês de início e a alíquota.'}
          </p>
          <div className="flex justify-end">
            <Button type="button" onClick={adicionar} disabled={!podeAdicionar} loading={salvando}>
              <Plus size={16} />
              Adicionar
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
