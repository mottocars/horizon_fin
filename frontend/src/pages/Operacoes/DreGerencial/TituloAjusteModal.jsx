import { useEffect, useMemo, useState } from 'react';
import { Lock, Plus, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { obterTituloAjuste, restaurarTituloAjuste, salvarAjusteTitulo } from '../../../api/titulosAjustes.api';

const ORIGENS = { R: 'A receber', P: 'A pagar' };

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

const paraEdicao = (linhas) =>
  linhas.map((l) => ({
    centro_id: l.centro_id ?? '',
    natureza_id: l.natureza_id ?? '',
    valor: Number(l.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }),
  }));

function Info({ rotulo, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-gray-400">{rotulo}</p>
      <p className="truncate text-sm text-gray-900">{children || '—'}</p>
    </div>
  );
}

function Secao({ titulo, children, acao }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

const thx = 'px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-blue-700';
const tdx = 'px-3 py-1.5 text-xs';

// Janela do título (DRE › Financeiro): os dados do título no Sienge (parcelas e rateio original) e o
// ajuste — linhas de centro de custo × natureza × valor que substituem o rateio original sem mexer no
// título (tabelas titulos_ajustes, módulo titulos-ajustes). Salvar grava o ajuste; "Restaurar
// original" apaga. Título do exercício em andamento (`travado`): só visualização. Histórico de quem
// alterou o quê no fim.
export default function TituloAjusteModal({ empresaId, origem, billId, onClose, onAlterado }) {
  const confirm = useConfirm();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [linhas, setLinhas] = useState([]);
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');

  function aplicar(d) {
    setDados(d);
    setLinhas(paraEdicao(d.ajuste ? d.ajuste.linhas : d.original));
    setObservacao(d.ajuste?.observacao || '');
  }

  useEffect(() => {
    setDados(null);
    setErro('');
    setErroSalvar('');
    obterTituloAjuste(empresaId, origem, billId)
      .then(aplicar)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar o título.'));
  }, [empresaId, origem, billId]);

  const opCentros = useMemo(
    () => (dados?.opcoes.centros || []).map((c) => ({ value: c.id, label: `${c.id} - ${c.nome}` })),
    [dados]
  );
  const opNaturezas = useMemo(
    () => (dados?.opcoes.naturezas || []).map((n) => ({ value: n.id, label: `${n.id} ${n.nome}` })),
    [dados]
  );

  const travado = Boolean(dados?.travado);
  const totalAjuste = linhas.reduce((s, l) => s + (Number.isFinite(lerValor(l.valor)) ? lerValor(l.valor) : 0), 0);
  const diferenca = dados ? Math.round((totalAjuste - dados.valor_original) * 100) / 100 : 0;

  const mudarLinha = (i, campo, valor) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  async function salvar() {
    setErroSalvar('');
    const payload = linhas.map((l) => ({ centro_id: Number(l.centro_id), natureza_id: String(l.natureza_id), valor: lerValor(l.valor) }));
    const ruim = payload.findIndex((l) => !l.centro_id || !l.natureza_id || !(l.valor > 0));
    if (!payload.length || ruim >= 0) {
      setErroSalvar(
        !payload.length ? 'Informe ao menos uma linha.' : `Linha ${ruim + 1}: escolha centro e natureza e informe um valor maior que zero.`
      );
      return;
    }
    setSalvando(true);
    try {
      aplicar(await salvarAjusteTitulo(empresaId, origem, billId, { linhas: payload, observacao }));
      onAlterado?.();
    } catch (e) {
      setErroSalvar(e.response?.data?.message || 'Não foi possível salvar o ajuste.');
    } finally {
      setSalvando(false);
    }
  }

  async function restaurar() {
    const ok = await confirm({
      title: 'Restaurar original',
      description: `Apagar o ajuste do título ${billId} e voltar ao rateio original do Sienge? O histórico continua guardado.`,
      confirmLabel: 'Restaurar',
      variant: 'warning',
    });
    if (!ok) return;
    setSalvando(true);
    setErroSalvar('');
    try {
      aplicar(await restaurarTituloAjuste(empresaId, origem, billId));
      onAlterado?.();
    } catch (e) {
      setErroSalvar(e.response?.data?.message || 'Não foi possível restaurar o título.');
    } finally {
      setSalvando(false);
    }
  }

  const nomeCentro = (id) => opCentros.find((c) => String(c.value) === String(id))?.label || id;
  const nomeNatureza = (id) => opNaturezas.find((n) => String(n.value) === String(id))?.label || id;
  const resumo = (r) =>
    r ? r.linhas.map((l) => `${nomeCentro(l.centro_id)} · ${nomeNatureza(l.natureza_id)}: ${moeda(l.valor)}`).join(' | ') : 'original do Sienge';

  return (
    <Modal
      open
      onClose={onClose}
      title={`Título ${billId}${dados ? ` · ${ORIGENS[origem]}` : ''}`}
      maxWidthClass="max-w-4xl"
      acoes={
        dados && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              dados.ajuste ? 'bg-violet-50 text-violet-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {dados.ajuste ? 'Ajustado' : 'Original'}
          </span>
        )
      }
    >
      {erro ? (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          <TriangleAlert size={15} className="shrink-0" />
          {erro}
        </div>
      ) : !dados ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : (
        <>
          {travado && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <Lock size={14} className="shrink-0" />
              Exercício em andamento: este título só pode ser visualizado, não pode ser ajustado.
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            <Info rotulo="Cliente / Fornecedor">{dados.contraparte}</Info>
            <Info rotulo="Documento">
              {[dados.documento, dados.numero].filter(Boolean).join(' ')}
              {dados.documento_nome ? <span className="text-gray-400"> · {dados.documento_nome}</span> : null}
            </Info>
            <Info rotulo="Emissão">{dataBr(dados.emissao)}</Info>
            <Info rotulo="Valor do título (Sienge)">{moeda(dados.valor_original)}</Info>
          </div>

          <Secao titulo={`Parcelas (${dados.parcelas.length})`}>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-100">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-blue-50">
                  <tr>
                    <th className={thx}>Parcela</th>
                    <th className={thx}>Emissão</th>
                    <th className={thx}>Vencimento</th>
                    <th className={`${thx} text-right`}>Valor</th>
                    <th className={`${thx} text-right`}>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.parcelas.map((p) => (
                    <tr key={`${p.parcela}-${p.vencimento}`} className="border-t border-gray-100">
                      <td className={`${tdx} tabular-nums`}>{p.parcela}</td>
                      <td className={`${tdx} tabular-nums`}>{dataBr(p.emissao)}</td>
                      <td className={`${tdx} tabular-nums`}>{dataBr(p.vencimento)}</td>
                      <td className={`${tdx} text-right tabular-nums`}>{moeda(p.valor)}</td>
                      <td className={`${tdx} text-right tabular-nums text-gray-500`}>{moeda(p.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>

          <Secao titulo="Rateio original (Sienge)">
            <table className="w-full border-collapse rounded-lg border border-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className={`${thx} text-gray-500`}>Centro de custo</th>
                  <th className={`${thx} text-gray-500`}>Natureza</th>
                  <th className={`${thx} text-right text-gray-500`}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {dados.original.map((l, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className={tdx}>{l.centro_id != null ? `${l.centro_id} - ${l.centro_nome || ''}` : 'Sem centro'}</td>
                    <td className={tdx}>{l.natureza_id ? `${l.natureza_id} ${l.natureza_nome || ''}` : 'Sem natureza'}</td>
                    <td className={`${tdx} text-right tabular-nums`}>{moeda(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Secao>

          <Secao
            titulo={dados.ajuste ? 'Ajuste (em uso)' : 'Ajuste'}
            acao={
              !travado && (
                <button
                  type="button"
                  onClick={() => setLinhas((ls) => [...ls, { centro_id: '', natureza_id: '', valor: '' }])}
                  className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  <Plus size={13} /> Linha
                </button>
              )
            }
          >
            <div className="space-y-2">
              {linhas.map((l, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_140px_32px] items-center gap-2">
                  <SearchableSelect
                    value={l.centro_id}
                    onChange={(v) => mudarLinha(i, 'centro_id', v)}
                    options={opCentros}
                    placeholder="Centro de custo"
                    disabled={travado}
                    clearable={false}
                    larguraPainel={380}
                  />
                  <SearchableSelect
                    value={l.natureza_id}
                    onChange={(v) => mudarLinha(i, 'natureza_id', v)}
                    options={opNaturezas}
                    placeholder="Natureza"
                    disabled={travado}
                    clearable={false}
                    larguraPainel={460}
                  />
                  <input
                    value={l.valor}
                    onChange={(e) => mudarLinha(i, 'valor', e.target.value)}
                    disabled={travado}
                    inputMode="decimal"
                    placeholder="0,00"
                    aria-label={`Valor da linha ${i + 1}`}
                    className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                  {!travado && linhas.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                      title="Remover linha"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-end gap-4 text-xs text-gray-500">
              <span>
                Total do ajuste: <span className="font-medium tabular-nums text-gray-900">{moeda(totalAjuste)}</span>
              </span>
              <span className={diferenca ? 'text-amber-600' : ''}>
                Diferença para o Sienge: <span className="font-medium tabular-nums">{moeda(diferenca)}</span>
              </span>
            </div>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={travado}
              rows={2}
              maxLength={1000}
              placeholder="Motivo do ajuste (opcional)"
              className="mt-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-500"
            />
            {dados.ajuste && (
              <p className="mt-1 text-[11px] text-gray-400">
                Ajustado por {dados.ajuste.usuario || 'usuário'} em {dataHora(dados.ajuste.atualizado_em)}
              </p>
            )}
            {erroSalvar && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erroSalvar}</p>}
            {!travado && (
              <div className="mt-3 flex justify-end gap-2">
                {dados.ajuste && (
                  <Button type="button" variant="secondary" onClick={restaurar} disabled={salvando}>
                    <RotateCcw size={15} />
                    Restaurar original
                  </Button>
                )}
                <Button type="button" onClick={salvar} disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar ajuste'}
                </Button>
              </div>
            )}
          </Secao>

          {dados.historico.length > 0 && (
            <Secao titulo="Histórico">
              <ul className="space-y-1.5 text-xs text-gray-600">
                {dados.historico.map((h, i) => (
                  <li key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                    <span className="font-medium text-gray-800">{h.acao === 'AJUSTOU' ? 'Ajustou' : 'Restaurou o original'}</span>
                    {' · '}
                    {h.usuario || 'usuário'} em {dataHora(h.criado_em)}
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      De: {resumo(h.antes)}
                      <br />
                      Para: {resumo(h.depois)}
                      {h.depois?.observacao ? ` — ${h.depois.observacao}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </Secao>
          )}
        </>
      )}
    </Modal>
  );
}
