import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, History, Lock, Trash2, TriangleAlert } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { useConfirm } from '../../../confirm/ConfirmContext';
import {
  alterarLancamentoManual,
  criarLancamentoManual,
  excluirLancamentoManual,
  obterLancamentoManual,
  opcoesLancamentoManual,
} from '../../../api/lancamentosManuais.api';

function moeda(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataBr(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function dataHora(v) {
  return v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

// "1.234,56" / "1234.56" -> 1234.56 (NaN se não for número).
function lerValor(texto) {
  const t = String(texto).trim().replace(/\s/g, '');
  if (!t) return NaN;
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
}

// Mesmo formato do valor na listagem: milhar, 2 casas e o sinal (saída negativa).
const valorEdicao = (v, tipo) => moeda((tipo === 'SAIDA' ? -1 : 1) * Math.abs(Number(v || 0)));

function Faixa({ titulo, colunas, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <div className={`grid items-end gap-x-4 gap-y-2 ${colunas}`}>{children}</div>
    </div>
  );
}

function Campo({ rotulo, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="mb-1 text-[11px] text-gray-400">{rotulo}</p>
      {children}
    </div>
  );
}

const INPUT =
  'w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-500';

const VAZIO = { tipo: 'SAIDA', data: '', documento: '', historico: '', centro_id: '', natureza_id: '', valor: '' };

// Janela de lançamento criado à mão (DRE › Financeiro): "Novo lançamento" (sem `id`) ou o lançamento
// criado clicado na listagem (com `id` — dá pra alterar e excluir). Entra como movimento, com o status
// "Criado" (tabela lancamentos_manuais, módulo lancamentos-manuais). Faixas: Lançamento (entrada ou
// saída, data dentro do exercício, documento e histórico) e Classificação (centro, natureza e valor);
// à direita, o log. Exercício em andamento (`travado`): só visualização — o backend também recusa.
export default function LancamentoManualModal({ empresaId, ano, id = null, onClose, onAlterado }) {
  const confirm = useConfirm();
  const [dados, setDados] = useState(null); // lançamento salvo (edição)
  const [opcoes, setOpcoes] = useState(null);
  const [form, setForm] = useState({ ...VAZIO, data: `${ano}-01-01` });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');

  function aplicar(d) {
    setDados(d);
    setOpcoes(d.opcoes);
    setForm({
      tipo: d.tipo,
      data: d.data,
      documento: d.documento || '',
      historico: d.historico || '',
      centro_id: d.centro_id,
      natureza_id: d.natureza_id,
      valor: valorEdicao(d.valor, d.tipo),
    });
  }

  useEffect(() => {
    setErro('');
    if (id) {
      obterLancamentoManual(empresaId, id)
        .then(aplicar)
        .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar o lançamento.'));
    } else {
      opcoesLancamentoManual(empresaId)
        .then(setOpcoes)
        .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar centros e naturezas.'));
    }
  }, [empresaId, id]);

  const opCentros = useMemo(() => (opcoes?.centros || []).map((c) => ({ value: c.id, label: `${c.id} - ${c.nome}` })), [opcoes]);
  // Naturezas que entram na DRE no centro escolhido (Máscara DRE no plano de contas dele).
  const opNaturezas = useMemo(() => {
    const permitidas = new Set(opcoes?.naturezas_por_centro?.[form.centro_id] || []);
    return (opcoes?.naturezas || []).filter((n) => permitidas.has(n.id)).map((n) => ({ value: n.id, label: `${n.id} ${n.nome}` }));
  }, [opcoes, form.centro_id]);
  const nomeCentro = (cid) => opCentros.find((c) => String(c.value) === String(cid))?.label || cid;
  const nomeNatureza = (nid) => {
    const n = (opcoes?.naturezas || []).find((x) => String(x.id) === String(nid));
    return n ? `${n.id} ${n.nome}` : nid;
  };

  // Exercício em andamento ou futuro: só visualização (mesma regra do backend).
  const travado = dados ? dados.travado : ano >= new Date().getFullYear();
  const mudar = (campo) => (v) => setForm((f) => ({ ...f, [campo]: v }));
  const valorNum = Math.abs(lerValor(form.valor));

  function trocarTipo(tipo) {
    setForm((f) => ({ ...f, tipo, valor: Number.isFinite(lerValor(f.valor)) ? valorEdicao(lerValor(f.valor), tipo) : f.valor }));
  }

  async function salvar() {
    setErroSalvar('');
    if (!form.data || form.data.slice(0, 4) !== String(ano)) return setErroSalvar(`Informe uma data de ${ano}.`);
    if (!form.historico.trim()) return setErroSalvar('Informe o histórico.');
    if (!form.centro_id || !form.natureza_id) return setErroSalvar('Escolha o centro de custo e a natureza.');
    if (!(valorNum > 0)) return setErroSalvar('Informe um valor maior que zero.');
    const payload = {
      tipo: form.tipo,
      data: form.data,
      documento: form.documento.trim(),
      historico: form.historico.trim(),
      centro_id: Number(form.centro_id),
      natureza_id: String(form.natureza_id),
      valor: valorNum,
    };
    setSalvando(true);
    try {
      const d = id ? await alterarLancamentoManual(empresaId, id, payload) : await criarLancamentoManual(empresaId, payload);
      onAlterado?.();
      if (id) aplicar(d);
      else onClose();
    } catch (e) {
      setErroSalvar(e.response?.data?.message || 'Não foi possível salvar o lançamento.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    const ok = await confirm({
      title: 'Excluir lançamento',
      description: `Excluir o lançamento criado "${form.historico}"? Ele sai da listagem; o log continua guardado.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    setSalvando(true);
    try {
      await excluirLancamentoManual(empresaId, id);
      onAlterado?.();
      onClose();
    } catch (e) {
      setErroSalvar(e.response?.data?.message || 'Não foi possível excluir o lançamento.');
      setSalvando(false);
    }
  }

  const resumo = (r) =>
    r
      ? `${r.tipo === 'SAIDA' ? 'Saída' : 'Entrada'} · ${dataBr(r.data)} · ${r.historico} · ${nomeCentro(r.centro_id)} · ${nomeNatureza(r.natureza_id)} · ${valorEdicao(r.valor, r.tipo)}`
      : '—';
  const ACOES = { CRIOU: 'Criou', ALTEROU: 'Alterou', EXCLUIU: 'Excluiu' };

  return (
    <Modal
      open
      onClose={onClose}
      title={id ? `Lançamento criado · Movimento` : `Novo lançamento · ${ano}`}
      maxWidthClass={id ? 'max-w-7xl' : 'max-w-5xl'}
      acoes={<span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">Criado</span>}
    >
      {erro ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          <TriangleAlert size={15} className="shrink-0" />
          {erro}
        </div>
      ) : !opcoes ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : (
        <div className={`grid grid-cols-1 gap-5 ${id ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
          <div className="min-w-0 space-y-3">
            {travado && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <Lock size={14} className="shrink-0" />
                Exercício em andamento: só pode ser visualizado, não aceita lançamento criado nem alterado.
              </div>
            )}

            <Faixa titulo="Lançamento" colunas="grid-cols-2 md:grid-cols-[220px_150px_150px_minmax(0,1fr)]">
              <Campo rotulo="Tipo">
                <div className="grid grid-cols-2 rounded-lg border border-gray-200 p-0.5">
                  {[
                    ['ENTRADA', 'Entrada', ArrowDownLeft, 'bg-emerald-50 text-emerald-700'],
                    ['SAIDA', 'Saída', ArrowUpRight, 'bg-red-50 text-red-600'],
                  ].map(([valor, rotulo, Icone, ativo]) => (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => trocarTipo(valor)}
                      disabled={travado}
                      aria-pressed={form.tipo === valor}
                      className={`flex items-center justify-center gap-1 rounded-md py-1.5 text-sm font-medium transition ${
                        form.tipo === valor ? ativo : 'text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      <Icone size={14} /> {rotulo}
                    </button>
                  ))}
                </div>
              </Campo>
              <Campo rotulo="Data">
                <input
                  type="date"
                  value={form.data}
                  min={`${ano}-01-01`}
                  max={`${ano}-12-31`}
                  onChange={(e) => mudar('data')(e.target.value)}
                  disabled={travado}
                  aria-label="Data do lançamento"
                  className={INPUT}
                />
              </Campo>
              <Campo rotulo="Documento (opcional)">
                <input value={form.documento} onChange={(e) => mudar('documento')(e.target.value)} disabled={travado} maxLength={50} className={INPUT} />
              </Campo>
              <Campo rotulo="Histórico">
                <input
                  value={form.historico}
                  onChange={(e) => mudar('historico')(e.target.value)}
                  disabled={travado}
                  maxLength={255}
                  placeholder="Descreva o lançamento"
                  aria-label="Histórico"
                  className={INPUT}
                />
              </Campo>
            </Faixa>

            <Faixa titulo="Classificação" colunas="grid-cols-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_170px]">
              <Campo rotulo="Centro de custo">
                <SearchableSelect value={form.centro_id} onChange={mudar('centro_id')} options={opCentros} placeholder="Centro de custo" disabled={travado} clearable={false} larguraPainel={380} />
              </Campo>
              <Campo rotulo="Natureza">
                <SearchableSelect
                  value={form.natureza_id}
                  onChange={mudar('natureza_id')}
                  options={opNaturezas}
                  placeholder={form.centro_id ? 'Natureza' : 'Escolha o centro primeiro'}
                  emptyMessage="Nenhuma natureza com Máscara DRE no plano deste centro."
                  disabled={travado || !form.centro_id}
                  clearable={false}
                  larguraPainel={460}
                />
              </Campo>
              <Campo rotulo={`Valor${form.tipo === 'SAIDA' ? ' (saída)' : ' (entrada)'}`} className="text-right">
                <input
                  value={form.valor}
                  onChange={(e) => mudar('valor')(e.target.value)}
                  onBlur={() => Number.isFinite(valorNum) && mudar('valor')(valorEdicao(valorNum, form.tipo))}
                  disabled={travado}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label="Valor do lançamento"
                  className={`${INPUT} text-right tabular-nums`}
                />
              </Campo>
            </Faixa>

            {erroSalvar && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erroSalvar}</p>}
            {!travado && (
              <div className="flex justify-end gap-2">
                {id && (
                  <Button type="button" variant="secondary" onClick={excluir} disabled={salvando}>
                    <Trash2 size={15} />
                    Excluir
                  </Button>
                )}
                <Button type="button" onClick={salvar} disabled={salvando}>
                  {salvando ? 'Salvando...' : id ? 'Salvar alterações' : 'Criar lançamento'}
                </Button>
              </div>
            )}
          </div>

          {id && dados && (
            <aside className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-gray-50/60 p-4 lg:max-h-[70vh]">
              <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <History size={13} /> Log de alterações
              </p>
              <ol className="-mr-2 space-y-3 overflow-y-auto pr-2">
                {dados.log.map((h, i) => (
                  <li key={i} className="rounded-lg border border-gray-200 bg-white p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sky-700">{ACOES[h.acao] || h.acao}</span>
                      <span className="shrink-0 text-[11px] text-gray-400">{dataHora(h.criado_em)}</span>
                    </div>
                    <p className="text-[11px] text-gray-500">{h.usuario || 'usuário'}</p>
                    <div className="mt-2 space-y-0.5 text-[11px] text-gray-500">
                      {h.antes && (
                        <p>
                          <span className="text-gray-400">De:</span> {resumo(h.antes)}
                        </p>
                      )}
                      <p>
                        <span className="text-gray-400">{h.antes ? 'Para:' : 'Lançamento:'}</span> {resumo(h.depois)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-3 border-t border-gray-200 pt-2 text-[11px] text-gray-400">
                Criado por {dados.usuario || 'usuário'} em {dataHora(dados.criado_em)}
              </p>
            </aside>
          )}
        </div>
      )}
    </Modal>
  );
}
