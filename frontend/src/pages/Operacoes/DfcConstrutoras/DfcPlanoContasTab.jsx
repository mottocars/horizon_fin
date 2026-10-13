import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ListTree, Loader2, Minus, Plus, TriangleAlert } from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';
import { listContas } from '../../../api/planosFinanceirosSienge.api';
import { listDfcMascaras } from '../../../api/dfcMascaras.api';
import { listClassificacoesPlanoDfc, updateClassificacaoPlanoDfc } from '../../../api/dfcPlanoContas.api';

const LIMIT = 2000;

const GRADE = 'grid grid-cols-[minmax(0,1fr)_240px_260px_80px] items-center gap-3';

// Opções fixas da "Origem Projeção" (pedido do usuário) — mesma lista do backend
// (dfcPlanoContas.controller.js) e do CHECK da tabela dfc_plano_contas.
const ORIGENS_PROJECAO = [
  { value: 'CEF_NOVO_REGISTRO', label: 'CEF - Novo Registro' },
  { value: 'CEF_MEDICAO', label: 'CEF - Medição' },
  { value: 'CEF_CREDITO_PJ', label: 'CEF - Crédito PJ' },
  { value: 'CEF_JUROS', label: 'CEF - Juros' },
  { value: 'CEF_AMORTIZACAO', label: 'CEF - Amortização' },
  { value: 'SIENGE_ORCAMENTO_EMPRESARIAL', label: 'Sienge - Orçamento Empresarial (desembolso)' },
  { value: 'SIENGE_AGING', label: 'Sienge - Aging' },
  { value: 'HORIZON_ORCAMENTO_INFORMADO', label: 'Horizon - Orçamento Informado' },
];

// Mesmo par de cores das outras abas da DFC: vazio em âmbar, preenchido em azul claro.
function corCampo(valor) {
  return valor ? 'border-primary-100 bg-primary-50' : 'border-amber-300 bg-amber-50';
}

// Mesma lógica de PlanoFinanceiroDetalhe.jsx::formatarCodigoMascara (duplicada aqui de
// propósito — telas não importam umas das outras nesse projeto).
function formatarCodigoMascara(codigo, larguras) {
  const digitos = String(codigo);
  const segmentos = [];
  let pos = 0;

  for (const largura of larguras) {
    if (pos >= digitos.length) break;
    if (!largura) {
      segmentos[segmentos.length - 1] += digitos.slice(pos);
      pos = digitos.length;
      break;
    }
    segmentos.push(digitos.slice(pos, pos + largura));
    pos += largura;
  }

  if (pos < digitos.length && segmentos.length > 0) {
    segmentos[segmentos.length - 1] += digitos.slice(pos);
  }

  return segmentos.length > 0 ? segmentos.join('.') : digitos;
}

function codigoFormatado(conta) {
  return formatarCodigoMascara(conta.sienge_id, [
    conta.mascara_nivel_1,
    conta.mascara_nivel_2,
    conta.mascara_nivel_3,
    conta.mascara_nivel_4,
    conta.mascara_nivel_5,
    conta.mascara_nivel_6,
    conta.mascara_nivel_7,
  ]);
}

// Monta a árvore pelo próprio código: a mãe de uma conta é a conta totalizadora (tp_conta 'T')
// mais próxima cujo código é prefixo do dela (1 → 101 → 10101 → 1010101).
function montarArvore(contas) {
  const ordenadas = [...contas].sort((a, b) => String(a.sienge_id).localeCompare(String(b.sienge_id)));
  const raizes = [];
  const pilha = [];
  ordenadas.forEach((conta) => {
    const codigo = String(conta.sienge_id);
    while (pilha.length && !codigo.startsWith(String(pilha[pilha.length - 1].sienge_id))) pilha.pop();
    const no = { ...conta, filhos: [] };
    if (pilha.length) pilha[pilha.length - 1].filhos.push(no);
    else raizes.push(no);
    if (conta.tp_conta === 'T') pilha.push(no);
  });
  return raizes;
}

// Operações > DFC Construtoras > Plano Contas: espelho do cadastro Cadastros > Planos Financeiros
// da empresa (mesma fonte, mesmas colunas — código, descrição e status), no drilldown da aba
// Máscaras (pedido do usuário): as contas totalizadoras são as linhas cinza com +/- e contador, e
// cada nível abaixo vem mais recuado. Tudo começa aberto (pedido do usuário); com busca, mostra as contas que batem
// junto com as totalizadoras acima delas, já abertas. A atualização a partir do Sienge mora no
// topo da página (DfcConstrutorasPage.jsx). No último nível (contas analíticas, tp_conta diferente
// de 'T') ficam as comboboxes Máscara DFC (só as de nível 2 da aba Máscaras) e Origem Projeção —
// cada mudança salva na hora, com o mesmo indicador de salvamento das outras abas.
export default function DfcPlanoContasTab({ empresaId, search = '', refreshToken = 0, onTotal }) {
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  // Guarda as FECHADAS (não as abertas): vazio = árvore inteira aberta, que é o padrão.
  const [fechados, setFechados] = useState([]);
  // sienge_id -> { mascara_id, origem_projecao }
  const [classificacoes, setClassificacoes] = useState({});
  const [mascaras, setMascaras] = useState([]);
  const [pendentes, setPendentes] = useState(0);
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setContas([]);
      onTotal?.(0);
      return;
    }
    setCarregando(true);
    setErroCarga('');
    Promise.all([
      listContas(empresaId, { page: 1, limit: LIMIT, search: '' }),
      listClassificacoesPlanoDfc(empresaId),
      listDfcMascaras(empresaId),
    ])
      .then(([result, lista, arvoreMascaras]) => {
        setContas(result.data);
        setClassificacoes(Object.fromEntries(lista.map((c) => [c.sienge_id, c])));
        setMascaras(arvoreMascaras);
        onTotal?.(result.pagination.total);
      })
      .catch((err) => setErroCarga(err.response?.data?.message || 'Não foi possível carregar o plano de contas.'))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    setFechados([]);
    setErroSalvar('');
    setSalvoAlgumaVez(false);
  }, [empresaId]);

  // Só as máscaras de nível 2 são escolhíveis, na ordem da aba Máscaras — agrupadas pelo nível 1
  // (título no painel da combobox, pedido do usuário).
  const opcoesMascara = useMemo(
    () => mascaras.flatMap((g) => g.filhos.map((f) => ({ value: f.id, label: f.descricao, grupo: g.descricao }))),
    [mascaras]
  );

  // Atualiza na hora e grava; se falhar, volta o que estava.
  async function classificar(siengeId, patch) {
    const anterior = classificacoes[siengeId] || { sienge_id: siengeId, mascara_id: null, origem_projecao: null };
    const novo = { ...anterior, ...patch };
    setClassificacoes((atual) => ({ ...atual, [siengeId]: novo }));
    setErroSalvar('');
    setPendentes((n) => n + 1);
    try {
      const salvo = await updateClassificacaoPlanoDfc(empresaId, siengeId, novo);
      setClassificacoes((atual) => ({ ...atual, [siengeId]: salvo }));
      setSalvoAlgumaVez(true);
    } catch (err) {
      setClassificacoes((atual) => ({ ...atual, [siengeId]: anterior }));
      setErroSalvar(err.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setPendentes((n) => n - 1);
    }
  }

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  const arvore = useMemo(() => montarArvore(contas), [contas]);

  // Com busca: só os ramos com alguma conta que bate (pelo código, com ou sem pontos, ou pela
  // descrição), e tudo aberto.
  const termo = search.trim().toLowerCase();
  const visivel = useMemo(() => {
    if (!termo) return null;
    const ids = new Set();
    const bate = (c) =>
      String(c.sienge_id).includes(termo.replace(/\./g, '')) ||
      codigoFormatado(c).includes(termo) ||
      (c.name || '').toLowerCase().includes(termo);
    const marcar = (no) => {
      const algumFilho = no.filhos.map(marcar).some(Boolean);
      if (algumFilho || bate(no)) {
        ids.add(no.sienge_id);
        return true;
      }
      return false;
    };
    arvore.forEach(marcar);
    return ids;
  }, [arvore, termo]);

  function alternar(id) {
    setFechados((atual) => (atual.includes(id) ? atual.filter((v) => v !== id) : [...atual, id]));
  }

  // Lista achatada das linhas visíveis, com a profundidade de cada uma (pro recuo).
  const linhas = [];
  const percorrer = (nos, nivel) => {
    nos.forEach((no) => {
      if (visivel && !visivel.has(no.sienge_id)) return;
      linhas.push({ conta: no, nivel });
      const aberto = visivel ? true : !fechados.includes(no.sienge_id);
      if (aberto && no.filhos.length) percorrer(no.filhos, nivel + 1);
    });
  };
  percorrer(arvore, 0);

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <ListTree size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Escolha a empresa no filtro acima para ver o plano de contas.</p>
      </div>
    );
  }

  const statusSalvamento = pendentes > 0 ? 'salvando' : erroSalvar ? 'erro' : salvoAlgumaVez ? 'salvo' : null;

  return (
    // Tabela dentro do quadro branco, com margem em volta (p-5) e cabeçalho de cantos de cima
    // arredondados — mesmo padrão das abas Máscaras e Centros Custos.
    <div className="rounded-card rounded-tl-none bg-white p-5 shadow-card">
      {statusSalvamento && (
        <div className="-mt-1 mb-3 flex items-center justify-end text-xs" aria-live="polite">
          {statusSalvamento === 'salvando' ? (
            <span className="flex items-center gap-1.5 text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Salvando...
            </span>
          ) : statusSalvamento === 'erro' ? (
            <span className="flex items-center gap-1.5 text-red-600" title={erroSalvar}>
              <TriangleAlert size={14} /> Erro ao salvar
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-600">
              <Check size={14} /> Alterações salvas
            </span>
          )}
        </div>
      )}

      {erroSalvar && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600" role="status">
          {erroSalvar}
        </div>
      )}

      {carregando && contas.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erroCarga ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TriangleAlert size={26} className="text-red-400" />
          <p className="text-sm text-gray-600">{erroCarga}</p>
          <button
            type="button"
            onClick={carregar}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Tentar de novo
          </button>
        </div>
      ) : contas.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <ListTree size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma conta no plano de contas desta empresa.</p>
          <p className="max-w-sm text-xs text-gray-400">Use o ícone no canto direito, acima, para gerar a partir do Sienge.</p>
        </div>
      ) : linhas.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">Nenhuma conta encontrada para essa busca.</div>
      ) : (
        <div>
          <div
            className={`${GRADE} rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700`}
          >
            <span>Conta</span>
            <span>Máscara DFC</span>
            <span>Origem Projeção</span>
            <span>Status</span>
          </div>

          {linhas.map(({ conta, nivel }) => {
            const totalizadora = conta.tp_conta === 'T';
            const temFilhos = conta.filhos.length > 0;
            const aberto = visivel ? true : !fechados.includes(conta.sienge_id);
            const recuo = { paddingLeft: 16 + nivel * 28 };
            const classificacao = classificacoes[conta.sienge_id] || {};
            const conteudo = (
              <>
                <span className="flex min-w-0 items-center gap-2" style={recuo}>
                  {totalizadora ? (
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                        temFilhos ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-300'
                      }`}
                    >
                      {aberto && temFilhos ? <Minus size={10} /> : <Plus size={10} />}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-xs tabular-nums text-gray-400">{codigoFormatado(conta)}</span>
                  <span
                    className={`min-w-0 truncate text-xs ${totalizadora ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}
                    title={conta.name}
                  >
                    {conta.name}
                  </span>
                  {totalizadora && temFilhos && (
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                      {conta.filhos.length}
                    </span>
                  )}
                </span>
                {totalizadora ? (
                  <>
                    <span />
                    <span />
                  </>
                ) : (
                  <>
                    <SearchableSelect
                      value={classificacao.mascara_id ?? ''}
                      onChange={(v) => classificar(conta.sienge_id, { mascara_id: v ? Number(v) : null })}
                      options={opcoesMascara}
                      placeholder="Selecione a máscara"
                      emptyMessage="Nenhuma máscara de nível 2. Cadastre na aba Máscaras."
                      corClasses={corCampo(classificacao.mascara_id)}
                      larguraPainel={460}
                      alturaLista="max-h-64"
                    />
                    <SearchableSelect
                      value={classificacao.origem_projecao ?? ''}
                      onChange={(v) => classificar(conta.sienge_id, { origem_projecao: v || null })}
                      options={ORIGENS_PROJECAO}
                      placeholder="Selecione a origem"
                      corClasses={corCampo(classificacao.origem_projecao)}
                    />
                  </>
                )}
                <span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      conta.fl_ativa === 'S' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {conta.fl_ativa === 'S' ? 'Ativa' : 'Inativa'}
                  </span>
                </span>
              </>
            );

            return totalizadora ? (
              <div
                key={conta.sienge_id}
                role="button"
                tabIndex={0}
                onClick={() => temFilhos && !visivel && alternar(conta.sienge_id)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && temFilhos && !visivel) alternar(conta.sienge_id);
                }}
                className={`${GRADE} border-b border-gray-200 bg-gray-50 py-2.5 pr-4 ${
                  temFilhos && !visivel ? 'cursor-pointer hover:bg-gray-100' : ''
                }`}
              >
                {conteudo}
              </div>
            ) : (
              <div key={conta.sienge_id} className={`${GRADE} border-b border-gray-100 bg-white py-1.5 pr-4 hover:bg-gray-50`}>
                {conteudo}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
