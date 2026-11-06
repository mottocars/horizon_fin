import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { createHistoricoImposto, getBaseImposto, listHistoricoImposto, removeHistoricoImposto, salvarBaseImposto } from '../../../api/dreMascaras.api';

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

export const formatarAliquota = (v) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}%`;

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
// Embaixo, a BASE do imposto (pedido do usuário): quais linhas de nível 2 acima dele entram na conta
// (−alíquota × soma delas). Todas marcadas = todas as linhas acima, inclusive as criadas depois.
// `mascara`: { id, descricao } ou null (fechada). `onAlterado(historico)` a cada criação/remoção,
// com a lista nova (a linha da máscara mostra a alíquota do mais recente); `onBaseAlterada(ids | null)`
// ao salvar a base (null = todas acima).
export default function HistoricoImpostoModal({ empresaId, mascara, onClose, onAlterado, onBaseAlterada }) {
  const confirm = useConfirm();
  const [historico, setHistorico] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [inicio, setInicio] = useState('');
  const [aliquotaTexto, setAliquotaTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  // Base do imposto: as opções (linhas acima) e as marcadas na tela.
  const [base, setBase] = useState(null);
  const [marcadas, setMarcadas] = useState(new Set());
  const [salvandoBase, setSalvandoBase] = useState(false);
  const [erroBase, setErroBase] = useState('');
  const [baseSalva, setBaseSalva] = useState(false);

  const aplicarBase = (b) => {
    setBase(b);
    setMarcadas(new Set(b.opcoes.filter((o) => o.na_base).map((o) => o.id)));
  };

  useEffect(() => {
    if (!mascara) return;
    setBase(null);
    setErroBase('');
    setBaseSalva(false);
    getBaseImposto(empresaId, mascara.id)
      .then(aplicarBase)
      .catch((err) => setErroBase(err.response?.data?.message || 'Não foi possível carregar a base do imposto.'));
  }, [empresaId, mascara]);

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

  // As opções agrupadas pelo nível 1, na ordem da DRE.
  const grupos = useMemo(() => {
    const lista = [];
    (base?.opcoes || []).forEach((o) => {
      const g = lista[lista.length - 1];
      if (g && g.nome === o.grupo) g.itens.push(o);
      else lista.push({ nome: o.grupo, itens: [o] });
    });
    return lista;
  }, [base]);

  if (!mascara) return null;
  const aliquota = lerAliquota(aliquotaTexto);
  const totalOpcoes = base?.opcoes.length || 0;
  const mudouBase = Boolean(base) && base.opcoes.some((o) => o.na_base !== marcadas.has(o.id));
  const marcarTodas = (sim) => {
    setBaseSalva(false);
    setMarcadas(new Set(sim ? base.opcoes.map((o) => o.id) : []));
  };
  const alternar = (ids, sim) => {
    setBaseSalva(false);
    setMarcadas((atual) => {
      const novo = new Set(atual);
      ids.forEach((id) => (sim ? novo.add(id) : novo.delete(id)));
      return novo;
    });
  };

  async function salvarBase() {
    setErroBase('');
    setSalvandoBase(true);
    try {
      const nova = await salvarBaseImposto(empresaId, mascara.id, [...marcadas]);
      aplicarBase(nova);
      setBaseSalva(true);
      onBaseAlterada?.(nova.todas ? null : nova.opcoes.filter((o) => o.na_base).map((o) => o.id));
    } catch (err) {
      setErroBase(err.response?.data?.message || 'Não foi possível salvar a base do imposto.');
    } finally {
      setSalvandoBase(false);
    }
  }
  const repetido = historico.some((h) => h.inicio === inicio);
  const podeAdicionar = Boolean(inicio) && aliquota !== null && !repetido;

  async function adicionar() {
    setErro('');
    setSalvando(true);
    try {
      const novo = await createHistoricoImposto(empresaId, mascara.id, { inicio, aliquota });
      setHistorico(novo);
      onAlterado(novo);
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
      const novo = await removeHistoricoImposto(empresaId, mascara.id, h.id);
      setHistorico(novo);
      onAlterado(novo);
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível remover o histórico.');
    }
  }

  const campo =
    'h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

  return (
    <Modal open onClose={salvando || salvandoBase ? () => {} : onClose} title="Histórico do imposto fixo" maxWidthClass="max-w-xl">
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

        <div className="space-y-2 rounded-lg border border-gray-200 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Base do imposto</p>
              <p className="text-[11px] text-gray-500">
                Linhas de nível 2 acima do imposto que entram na conta: −alíquota × soma delas, no mês.
              </p>
            </div>
            {base && totalOpcoes > 0 && (
              <div className="flex shrink-0 items-center gap-2 text-[11px]">
                <button type="button" onClick={() => marcarTodas(true)} className="font-medium text-primary-600 hover:underline">
                  Todas
                </button>
                <span className="text-gray-300">|</span>
                <button type="button" onClick={() => marcarTodas(false)} className="font-medium text-primary-600 hover:underline">
                  Limpar
                </button>
              </div>
            )}
          </div>

          {erroBase && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erroBase}</div>}

          {!base ? (
            !erroBase && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
                <Loader2 size={14} className="animate-spin" />
                Carregando...
              </div>
            )
          ) : totalOpcoes === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">Não há linhas de nível 2 acima deste imposto na DRE.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-100">
              {grupos.map((g) => {
                const ids = g.itens.map((o) => o.id);
                const todasDoGrupo = ids.every((id) => marcadas.has(id));
                return (
                  <div key={g.nome} className="border-b border-gray-100 last:border-b-0">
                    <label className="flex cursor-pointer items-center gap-2 bg-gray-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary-600"
                        checked={todasDoGrupo}
                        ref={(el) => el && (el.indeterminate = !todasDoGrupo && ids.some((id) => marcadas.has(id)))}
                        onChange={(e) => alternar(ids, e.target.checked)}
                      />
                      {g.nome}
                    </label>
                    {g.itens.map((o) => (
                      <label key={o.id} className="flex cursor-pointer items-center gap-2 px-3 py-1 pl-7 text-xs text-gray-800 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-primary-600"
                          checked={marcadas.has(o.id)}
                          onChange={(e) => alternar([o.id], e.target.checked)}
                        />
                        <span className="truncate" title={o.descricao}>
                          {o.descricao}
                        </span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {base?.ignoradas?.length > 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertTriangle size={12} className="mt-px shrink-0" />
              {base.ignoradas.length === 1 ? 'Uma linha marcada antes' : `${base.ignoradas.length} linhas marcadas antes`} não está mais acima do
              imposto (foi movida ou apagada) e não conta. Salve para limpar.
            </p>
          )}

          {base && totalOpcoes > 0 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-gray-500">
                {marcadas.size === 0
                  ? 'Marque ao menos uma linha.'
                  : marcadas.size === totalOpcoes
                    ? 'Todas as linhas acima — as criadas depois acima do imposto também entram.'
                    : `${marcadas.size} de ${totalOpcoes} linhas na base.`}
                {baseSalva && !mudouBase && <span className="ml-1 font-medium text-emerald-600">Base salva.</span>}
              </p>
              <Button type="button" onClick={salvarBase} disabled={!mudouBase && !(base.ignoradas?.length > 0) || marcadas.size === 0} loading={salvandoBase}>
                <Save size={16} />
                Salvar
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvando || salvandoBase}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
