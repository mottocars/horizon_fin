import { useEffect, useMemo, useState } from 'react';
import { History, Lock, RotateCcw, TriangleAlert } from 'lucide-react';
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

// Valor do campo no mesmo formato do valor original (milhar, 2 casas e o sinal da linha: saída negativa).
const valorEdicao = (v, sinal) => moeda(sinal * Math.abs(Number(v || 0)));

function Info({ rotulo, children, direita = false }) {
  return (
    <div className={`min-w-0 ${direita ? 'text-right' : ''}`}>
      <p className="text-[11px] text-gray-400">{rotulo}</p>
      <p className="truncate text-sm tabular-nums text-gray-900" title={typeof children === 'string' ? children : undefined}>
        {children || children === 0 ? children : '—'}
      </p>
    </div>
  );
}

// Uma faixa da janela: título pequeno e os campos lado a lado (`colunas` = classes do grid).
function Faixa({ titulo, colunas, fundo = 'bg-white', borda = 'border-gray-200', children }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${fundo} ${borda}`}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <div className={`grid items-end gap-x-4 gap-y-2 ${colunas}`}>{children}</div>
    </div>
  );
}

// Centro | Natureza | % Rateio | Valor — mesmas colunas no rateio original e no ajuste, alinhadas.
const COLUNAS_RATEIO = 'grid-cols-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_100px_150px]';

const rotuloCentro = (id, nome) => (id === null || id === undefined ? 'Sem centro' : `${id} - ${nome || ''}`);
const rotuloNatureza = (id, nome) => (id ? `${id} ${nome || ''}` : 'Sem natureza');

// Janela de ajuste de UMA linha de rateio da listagem do Financeiro (título × centro × natureza, ou
// movimento do extrato), em faixas: cabeçalho (cliente/fornecedor, documento, emissão, valor do
// título, valor do rateio e parcelas), rateio original, ajuste (centro, natureza e valor que passam a
// valer no lugar, sem mexer no Sienge — tabela lancamentos_ajustes, módulo lancamentos-ajustes) e
// motivo. À direita, o log de alterações da linha com o motivo de cada uma. Lançamento do exercício
// em andamento (`travado`): só visualização.
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
    setValor(valorEdicao(base.valor, d.linha.valor < 0 ? -1 : 1));
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
  // Naturezas que entram na DRE no centro escolhido (Máscara DRE no plano de contas dele).
  const opNaturezas = useMemo(() => {
    const permitidas = new Set(dados?.opcoes.naturezas_por_centro?.[centro] || []);
    return (dados?.opcoes.naturezas || []).filter((n) => permitidas.has(n.id)).map((n) => ({ value: n.id, label: `${n.id} ${n.nome}` }));
  }, [dados, centro]);

  const travado = Boolean(dados?.travado);
  const sinal = dados && dados.linha.valor < 0 ? -1 : 1;
  // O sinal vem da linha original: o que foi digitado vale pelo módulo.
  const valorNovo = Math.abs(lerValor(valor));
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
  const nomeNatureza = (id) => {
    const n = (dados?.opcoes.naturezas || []).find((x) => String(x.id) === String(id));
    return n ? `${n.id} ${n.nome}` : id;
  };
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
      maxWidthClass="max-w-7xl"
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
        // Esquerda: cabeçalho, rateio original, ajuste e motivo, cada um numa faixa. Direita: o log.
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            {travado && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                <Lock size={14} className="shrink-0" />
                Exercício em andamento: este lançamento só pode ser visualizado, não pode ser ajustado.
              </div>
            )}

            <Faixa titulo={origem === 'E' ? 'Movimento' : 'Título'} colunas="grid-cols-2 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_110px_130px_130px_90px]">
              <Info rotulo={origem === 'E' ? 'Histórico' : 'Cliente / Fornecedor'}>{dados.contraparte}</Info>
              <Info rotulo="Documento">{[dados.documento, dados.numero].filter(Boolean).join(' ')}</Info>
              <Info rotulo={origem === 'E' ? 'Data' : 'Emissão'}>{dataBr(dados.data)}</Info>
              <Info rotulo={origem === 'E' ? 'Valor do movimento' : 'Valor do título'} direita>
                {moeda(dados.valor_lancamento)}
              </Info>
              <Info rotulo="Valor do rateio" direita>
                {moeda(dados.linha.valor)}
              </Info>
              <Info rotulo="Parcelas" direita>
                {dados.parcelas ?? '—'}
              </Info>
            </Faixa>

            <Faixa titulo="Rateio original (Sienge)" colunas={COLUNAS_RATEIO} fundo="bg-gray-50">
              <Info rotulo="Centro de custo">{rotuloCentro(dados.linha.centro_id, dados.linha.centro_nome)}</Info>
              <Info rotulo="Natureza">{rotuloNatureza(dados.linha.natureza_id, dados.linha.natureza_nome)}</Info>
              <Info rotulo="% Rateio" direita>
                {pct(dados.linha.percentual)}
              </Info>
              <Info rotulo="Valor" direita>
                {moeda(dados.linha.valor)}
              </Info>
            </Faixa>

            <Faixa
              titulo={dados.ajuste ? 'Ajuste (em uso)' : 'Ajuste'}
              colunas={COLUNAS_RATEIO}
              fundo={dados.ajuste ? 'bg-violet-50/40' : 'bg-white'}
              borda={dados.ajuste ? 'border-violet-200' : 'border-gray-200'}
            >
              <div className="min-w-0">
                <p className="mb-1 text-[11px] text-gray-400">Centro de custo</p>
                <SearchableSelect value={centro} onChange={setCentro} options={opCentros} placeholder="Centro de custo" disabled={travado} clearable={false} larguraPainel={380} />
              </div>
              <div className="min-w-0">
                <p className="mb-1 text-[11px] text-gray-400">Natureza</p>
                <SearchableSelect
                  value={natureza}
                  onChange={setNatureza}
                  options={opNaturezas}
                  placeholder="Natureza"
                  emptyMessage="Nenhuma natureza com Máscara DRE no plano deste centro."
                  disabled={travado}
                  clearable={false}
                  larguraPainel={460}
                />
              </div>
              <div className="text-right">
                <p className="mb-1 text-[11px] text-gray-400">% Rateio</p>
                <p className="py-2 text-sm tabular-nums text-gray-700">{pct(pctNovo)}</p>
              </div>
              <div>
                <p className="mb-1 text-right text-[11px] text-gray-400">Valor{sinal < 0 ? ' (saída)' : ''}</p>
                <input
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  onBlur={() => Number.isFinite(valorNovo) && setValor(valorEdicao(valorNovo, sinal))}
                  disabled={travado}
                  inputMode="decimal"
                  placeholder="0,00"
                  aria-label="Valor ajustado"
                  className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>
            </Faixa>

            <div className="rounded-xl border border-gray-200 px-4 py-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Motivo</p>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                disabled={travado}
                rows={2}
                maxLength={1000}
                placeholder="Descreva o motivo do ajuste"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-500"
              />
              {erroSalvar && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erroSalvar}</p>}
              {!travado && (
                <div className="mt-2 flex justify-end gap-2">
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
            </div>
          </div>

          {/* Log de alterações da linha, com o motivo de cada uma. */}
          <aside className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-gray-50/60 p-4 lg:max-h-[70vh]">
            <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              <History size={13} /> Log de alterações
            </p>
            {dados.historico.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhuma alteração nesta linha — está como veio do Sienge.</p>
            ) : (
              <ol className="-mr-2 space-y-3 overflow-y-auto pr-2">
                {dados.historico.map((h, i) => {
                  const motivo = h.acao === 'AJUSTOU' ? h.depois?.observacao : null;
                  return (
                    <li key={i} className="rounded-lg border border-gray-200 bg-white p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-semibold ${h.acao === 'AJUSTOU' ? 'text-violet-700' : 'text-gray-700'}`}>
                          {h.acao === 'AJUSTOU' ? 'Ajustou' : 'Restaurou o original'}
                        </span>
                        <span className="shrink-0 text-[11px] text-gray-400">{dataHora(h.criado_em)}</span>
                      </div>
                      <p className="text-[11px] text-gray-500">{h.usuario || 'usuário'}</p>
                      <p className={`mt-2 rounded-md px-2 py-1.5 ${motivo ? 'bg-amber-50 text-gray-800' : 'bg-gray-50 italic text-gray-400'}`}>
                        {motivo || (h.acao === 'AJUSTOU' ? 'Sem motivo informado' : 'Voltou ao rateio do Sienge')}
                      </p>
                      <div className="mt-2 space-y-0.5 text-[11px] text-gray-500">
                        <p>
                          <span className="text-gray-400">De:</span> {resumo(h.antes)}
                        </p>
                        <p>
                          <span className="text-gray-400">Para:</span> {resumo(h.depois)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            {dados.ajuste && (
              <p className="mt-3 border-t border-gray-200 pt-2 text-[11px] text-gray-400">
                Ajuste em uso desde {dataHora(dados.ajuste.atualizado_em)}, por {dados.ajuste.usuario || 'usuário'}
              </p>
            )}
          </aside>
        </div>
      )}
    </Modal>
  );
}
