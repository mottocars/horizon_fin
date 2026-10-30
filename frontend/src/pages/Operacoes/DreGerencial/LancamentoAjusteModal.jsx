import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Lock, RotateCcw, TriangleAlert } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { useConfirm } from '../../../confirm/ConfirmContext';
import { obterAjusteLancamento, restaurarAjusteLancamento, salvarAjusteLancamento } from '../../../api/lancamentosAjustes.api';

const ORIGENS = { R: 'A receber', P: 'A pagar', E: 'Movimento' };

function moeda(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(v) {
  return v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
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

const valorEdicao = (v) => Math.abs(Number(v || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

function Info({ rotulo, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-gray-400">{rotulo}</p>
      <p className="truncate text-sm text-gray-900" title={typeof children === 'string' ? children : undefined}>
        {children || '—'}
      </p>
    </div>
  );
}

const rotuloCentro = (id, nome) => (id === null || id === undefined ? 'Sem centro' : `${id} - ${nome || ''}`);
const rotuloNatureza = (id, nome) => (id ? `${id} ${nome || ''}` : 'Sem natureza');

// Janela de ajuste de UMA linha de rateio da listagem do Financeiro (título × centro × natureza, ou
// movimento do extrato): o lançamento, a linha original (centro, natureza, % do rateio e valor) e o
// ajuste dela — centro, natureza e valor que passam a valer no lugar, sem mexer no Sienge (tabela
// lancamentos_ajustes, módulo lancamentos-ajustes). Lançamento do exercício em andamento
// (`travado`): só visualização. Histórico da linha no fim.
export default function LancamentoAjusteModal({ empresaId, origem, chave, linha: linhaOriginal, onClose, onAlterado }) {
  const confirm = useConfirm();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [centro, setCentro] = useState('');
  const [natureza, setNatureza] = useState('');
  const [valor, setValor] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');

  function aplicar(d) {
    setDados(d);
    const base = d.ajuste || d.linha;
    setCentro(base.centro_id ?? '');
    setNatureza(base.natureza_id ?? '');
    setValor(valorEdicao(base.valor));
    setObservacao(d.ajuste?.observacao || '');
  }

  useEffect(() => {
    setDados(null);
    setErro('');
    setErroSalvar('');
    obterAjusteLancamento(empresaId, origem, chave, linhaOriginal)
      .then(aplicar)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar o lançamento.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, origem, chave, linhaOriginal.centro, linhaOriginal.natureza]);

  const opCentros = useMemo(() => (dados?.opcoes.centros || []).map((c) => ({ value: c.id, label: `${c.id} - ${c.nome}` })), [dados]);
  const opNaturezas = useMemo(() => (dados?.opcoes.naturezas || []).map((n) => ({ value: n.id, label: `${n.id} ${n.nome}` })), [dados]);

  const travado = Boolean(dados?.travado);
  const sinal = dados && dados.linha.valor < 0 ? -1 : 1;
  const valorNovo = lerValor(valor);
  const pctNovo =
    dados && Number.isFinite(valorNovo) && dados.valor_lancamento
      ? ((sinal * valorNovo) / (dados.valor_lancamento - dados.linha.valor + sinal * valorNovo)) * 100
      : null;

  async function salvar() {
    setErroSalvar('');
    if (!centro || !natureza || !(valorNovo > 0)) {
      setErroSalvar('Escolha o centro de custo e a natureza e informe um valor maior que zero.');
      return;
    }
    setSalvando(true);
    try {
      aplicar(await salvarAjusteLancamento(empresaId, origem, chave, linhaOriginal, { centro_id: Number(centro), natureza_id: String(natureza), valor: valorNovo, observacao }));
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
      description: 'Apagar o ajuste desta linha e voltar ao centro, natureza e valor originais do Sienge? O histórico continua guardado.',
      confirmLabel: 'Restaurar',
      variant: 'warning',
    });
    if (!ok) return;
    setSalvando(true);
    setErroSalvar('');
    try {
      aplicar(await restaurarAjusteLancamento(empresaId, origem, chave, linhaOriginal));
      onAlterado?.();
    } catch (e) {
      setErroSalvar(e.response?.data?.message || 'Não foi possível restaurar.');
    } finally {
      setSalvando(false);
    }
  }

  const nomeCentro = (id) => opCentros.find((c) => String(c.value) === String(id))?.label || id;
  const nomeNatureza = (id) => opNaturezas.find((n) => String(n.value) === String(id))?.label || id;
  const resumo = (r) => (r ? `${nomeCentro(r.centro_id)} · ${nomeNatureza(r.natureza_id)} · ${moeda(r.valor)}` : 'original do Sienge');

  const titulo =
    origem === 'E'
      ? `Movimento do extrato${dados?.documento ? ` · ${[dados.documento, dados.numero].filter(Boolean).join(' ')}` : ''}`
      : `Título ${chave} · ${ORIGENS[origem]}`;

  return (
    <Modal
      open
      onClose={onClose}
      title={titulo}
      maxWidthClass="max-w-3xl"
      acoes={
        dados && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${dados.ajuste ? 'bg-violet-50 text-violet-700' : 'bg-gray-100 text-gray-600'}`}>
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
              Exercício em andamento: este lançamento só pode ser visualizado, não pode ser ajustado.
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            <Info rotulo={origem === 'E' ? 'Histórico' : 'Cliente / Fornecedor'}>{dados.contraparte}</Info>
            <Info rotulo="Documento">{[dados.documento, dados.numero].filter(Boolean).join(' ')}</Info>
            <Info rotulo={origem === 'E' ? 'Data do movimento' : 'Emissão'}>
              {dataBr(dados.data)}
              {dados.parcelas > 1 ? ` · ${dados.parcelas} parcelas` : ''}
            </Info>
            <Info rotulo={origem === 'E' ? 'Valor do movimento' : 'Valor do título'}>{moeda(dados.valor_lancamento)}</Info>
          </div>

          <div className="mt-5 grid grid-cols-1 items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.25fr)]">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Original (Sienge)</p>
              <div className="space-y-2 text-sm">
                <Info rotulo="Centro de custo">{rotuloCentro(dados.linha.centro_id, dados.linha.centro_nome)}</Info>
                <Info rotulo="Natureza">{rotuloNatureza(dados.linha.natureza_id, dados.linha.natureza_nome)}</Info>
                <div className="grid grid-cols-2 gap-3">
                  <Info rotulo="% Rateio">{pct(dados.linha.percentual)}</Info>
                  <Info rotulo="Valor">{moeda(dados.linha.valor)}</Info>
                </div>
              </div>
            </div>

            <div className="hidden items-center text-gray-300 md:flex">
              <ArrowRight size={20} />
            </div>

            <div className={`rounded-xl border p-4 ${dados.ajuste ? 'border-violet-200 bg-violet-50/40' : 'border-gray-200'}`}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">{dados.ajuste ? 'Ajuste (em uso)' : 'Ajuste'}</p>
              <div className="space-y-2.5">
                <div>
                  <p className="mb-1 text-[11px] text-gray-400">Centro de custo</p>
                  <SearchableSelect value={centro} onChange={setCentro} options={opCentros} placeholder="Centro de custo" disabled={travado} clearable={false} larguraPainel={380} />
                </div>
                <div>
                  <p className="mb-1 text-[11px] text-gray-400">Natureza</p>
                  <SearchableSelect value={natureza} onChange={setNatureza} options={opNaturezas} placeholder="Natureza" disabled={travado} clearable={false} larguraPainel={460} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-[11px] text-gray-400">% Rateio</p>
                    <p className="py-2 text-sm tabular-nums text-gray-700">{pct(pctNovo)}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] text-gray-400">Valor{sinal < 0 ? ' (saída)' : ''}</p>
                    <input
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      disabled={travado}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-label="Valor ajustado"
                      className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                </div>
              </div>
            </div>
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

          {dados.historico.length > 0 && (
            <section className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Histórico</h3>
              <ul className="space-y-1.5 text-xs text-gray-600">
                {dados.historico.map((h, i) => (
                  <li key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                    <span className="font-medium text-gray-800">{h.acao === 'AJUSTOU' ? 'Ajustou' : 'Restaurou o original'}</span>
                    {' · '}
                    {h.usuario || 'usuário'} em {dataHora(h.criado_em)}
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      De: {resumo(h.antes)} → Para: {resumo(h.depois)}
                      {h.depois?.observacao ? ` — ${h.depois.observacao}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Modal>
  );
}
