import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Globe2, Building2, ListTree, Loader2, Minus, Plus, TriangleAlert } from 'lucide-react';
import SearchableSelect from '../../../components/SearchableSelect';
import FiltroColuna, { passaNoFiltro } from '../../../components/FiltroColuna';
import { listContas } from '../../../api/planosFinanceirosSienge.api';
import { listDfcMascaras } from '../../../api/dfcMascaras.api';
import { listClassificacoesPlanoDfc, updateClassificacaoPlanoDfc } from '../../../api/dfcPlanoContas.api';
import { useConfirm } from '../../../confirm/ConfirmContext';

const LIMIT = 2000;

const GRADE = 'grid grid-cols-[minmax(0,1fr)_130px_240px_260px_80px] items-center gap-3';

// Opções fixas da "Origem Projeção" (pedido do usuário) — mesma lista do backend
// (dfcPlanoContas.controller.js) e do CHECK da tabela dfc_plano_contas.
// Rótulos em maiúsculo (pedido do usuário). Os códigos (value) são os gravados no banco — não
// mudaram quando os rótulos mudaram.
const ORIGENS_PROJECAO = [
  { value: 'CEF_NOVO_REGISTRO', label: 'CEF - NOVO REGISTRO' },
  { value: 'CEF_MEDICAO', label: 'CEF - MEDIÇÃO' },
  { value: 'CEF_CREDITO_PJ', label: 'CEF - CRÉDITO PJ' },
  { value: 'CEF_JUROS', label: 'CEF - JUROS' },
  { value: 'CEF_AMORTIZACAO', label: 'CEF - AMORTIZAÇÃO' },
  { value: 'SIENGE_ORCAMENTO_EMPRESARIAL', label: 'SIENGE - EMPRESARIAL DESEMBOLSO' },
  { value: 'SIENGE_AGING', label: 'SIENGE - AGING' },
  { value: 'HORIZON_ORCAMENTO_INFORMADO', label: 'HORIZON - INFORMADO' },
];

// Primeira opção dos filtros Máscara DFC e Origem Projeção (pedido do usuário): acha as contas
// com aquele campo em branco. O filtro Conta não tem essa opção.
const NAO_INFORMADO = '__nao_informado__';
const OPCAO_NAO_INFORMADO = { value: NAO_INFORMADO, label: 'NÃO INFORMADO' };

// Filtro da coluna Projeta DFC (marcada / desmarcada).
const OPCOES_FILTRO_PROJETA = [
  { value: 'S', label: 'SIM' },
  { value: 'N', label: 'NÃO' },
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
// cada mudança salva na hora, com o mesmo indicador de salvamento das outras abas. Antes delas, o
// "Projeta DFC" (pedido do usuário): desmarcado, a conta não aparece no Orçamento dos centros que
// usam este plano. Começa marcado.
// `centroVersao`: id do centro cuja versão própria do plano está sendo editada (null = plano Global,
// que vale pra todos os centros sem versão própria) — escolhido no topo da página.
// `tituloPlano` / `onVoltar`: cabeçalho do editor (nome do plano aberto e volta pros cards).
export default function DfcPlanoContasTab({
  empresaId,
  search = '',
  refreshToken = 0,
  onTotal,
  centroVersao = null,
  tituloPlano = '',
  onVoltar,
}) {
  const confirm = useConfirm();
  const [contas, setContas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState('');
  // Guarda as FECHADAS (não as abertas): vazio = árvore inteira aberta, que é o padrão.
  const [fechados, setFechados] = useState([]);
  // sienge_id -> { mascara_id, origem_projecao, projeta_dfc } (conta sem linha = Projeta DFC marcado)
  const [classificacoes, setClassificacoes] = useState({});
  const [mascaras, setMascaras] = useState([]);
  // Filtros de coluna (FiltroColuna): null = sem filtro (tudo marcado).
  const [filtroConta, setFiltroConta] = useState(null);
  const [filtroMascara, setFiltroMascara] = useState(null);
  const [filtroOrigem, setFiltroOrigem] = useState(null);
  const [filtroProjeta, setFiltroProjeta] = useState(null);
  const colunaContaRef = useRef(null);
  const colunaProjetaRef = useRef(null);
  const colunaMascaraRef = useRef(null);
  const colunaOrigemRef = useRef(null);
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
      listClassificacoesPlanoDfc(empresaId, centroVersao),
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
  }, [empresaId, centroVersao]);

  useEffect(() => {
    setFechados([]);
    setFiltroConta(null);
    setFiltroMascara(null);
    setFiltroOrigem(null);
    setFiltroProjeta(null);
    setErroSalvar('');
    setSalvoAlgumaVez(false);
  }, [empresaId, centroVersao]);

  // Só as máscaras de nível 2 são escolhíveis, na ordem da aba Máscaras — agrupadas pelo nível 1
  // (título no painel da combobox, pedido do usuário).
  const opcoesMascara = useMemo(
    () => mascaras.flatMap((g) => g.filhos.map((f) => ({ value: f.id, label: f.descricao, grupo: g.descricao }))),
    [mascaras]
  );

  // Atualiza na hora e grava; se falhar, volta o que estava.
  // Origem "CEF - ..." só pode estar em UMA conta (a Projeção CEF lança nela). Se já estiver em
  // outra, avisa antes e só grava se o usuário confirmar a transferência.
  function confirmarTransferencia(origem, contaAtual) {
    const rotulo = ORIGENS_PROJECAO.find((o) => o.value === origem)?.label || origem;
    return confirm({
      title: 'Origem já informada em outra conta',
      description: `"${rotulo}" já está na conta ${contaAtual.codigo} - ${contaAtual.name}. Cada origem CEF só pode estar em uma conta. Transferir para esta conta? A conta ${contaAtual.codigo} fica sem Origem Projeção.`,
      confirmLabel: 'Transferir',
      variant: 'warning',
    });
  }

  async function classificar(siengeId, patch) {
    const anterior = classificacoes[siengeId] || {
      sienge_id: siengeId,
      mascara_id: null,
      origem_projecao: null,
      projeta_dfc: true,
    };
    const novo = { ...anterior, ...patch };
    let transferir = false;
    if (patch.origem_projecao && patch.origem_projecao.startsWith('CEF_')) {
      const outra = Object.values(classificacoes).find(
        (c) => c.sienge_id !== siengeId && c.origem_projecao === patch.origem_projecao
      );
      if (outra) {
        const conta = contas.find((c) => c.sienge_id === outra.sienge_id);
        const ok = await confirmarTransferencia(patch.origem_projecao, {
          codigo: conta ? codigoFormatado(conta) : outra.sienge_id,
          name: conta?.name || '',
        });
        if (!ok) return;
        transferir = true;
      }
    }
    await gravar(siengeId, anterior, novo, transferir);
  }

  async function gravar(siengeId, anterior, novo, transferir) {
    setClassificacoes((atual) => ({ ...atual, [siengeId]: novo }));
    setErroSalvar('');
    setPendentes((n) => n + 1);
    try {
      const { origem_retirada_de: retiradaDe, ...salvo } = await updateClassificacaoPlanoDfc(empresaId, siengeId, novo, {
        transferir,
        centroId: centroVersao,
      });
      setClassificacoes((atual) => {
        const proximo = { ...atual, [siengeId]: salvo };
        if (retiradaDe && proximo[retiradaDe]) proximo[retiradaDe] = { ...proximo[retiradaDe], origem_projecao: null };
        return proximo;
      });
      setSalvoAlgumaVez(true);
    } catch (err) {
      setClassificacoes((atual) => ({ ...atual, [siengeId]: anterior }));
      const dados = err.response?.data;
      // Outra pessoa pôs a origem em outra conta depois que a tela carregou: pergunta agora.
      if (dados?.codigo === 'ORIGEM_CEF_EM_USO' && !transferir) {
        const conta = contas.find((c) => c.sienge_id === dados.conta?.sienge_id);
        const ok = await confirmarTransferencia(novo.origem_projecao, {
          codigo: conta ? codigoFormatado(conta) : dados.conta?.sienge_id,
          name: dados.conta?.name || '',
        });
        if (ok) await gravar(siengeId, anterior, novo, true);
      } else {
        setErroSalvar(dados?.message || 'Não foi possível salvar.');
      }
    } finally {
      setPendentes((n) => n - 1);
    }
  }

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  const arvore = useMemo(() => montarArvore(contas), [contas]);

  // Opções dos filtros de coluna — Máscara DFC e Origem Projeção com "NÃO INFORMADO" em primeiro.
  const opcoesFiltroConta = useMemo(
    () =>
      [...contas]
        .filter((c) => c.tp_conta !== 'T')
        .sort((a, b) => String(a.sienge_id).localeCompare(String(b.sienge_id)))
        .map((c) => ({ value: c.sienge_id, label: `${codigoFormatado(c)} ${c.name}` })),
    [contas]
  );
  const opcoesFiltroMascara = useMemo(() => [OPCAO_NAO_INFORMADO, ...opcoesMascara], [opcoesMascara]);
  const opcoesFiltroOrigem = useMemo(() => [OPCAO_NAO_INFORMADO, ...ORIGENS_PROJECAO], []);

  // Com busca e/ou filtros de coluna: só os ramos com alguma conta que passa, e tudo aberto. A
  // busca (código com ou sem pontos, ou descrição) vale pra qualquer conta; os filtros de coluna
  // valem pras analíticas — com eles ativos, as totalizadoras aparecem só como caminho até elas.
  const termo = search.trim().toLowerCase();
  // Filtro com nada marcado vale como sem filtro — mostra tudo (pedido do usuário).
  const efetivo = (f) => (f && f.length === 0 ? null : f);
  const fConta = efetivo(filtroConta);
  const fMascara = efetivo(filtroMascara);
  const fOrigem = efetivo(filtroOrigem);
  const fProjeta = efetivo(filtroProjeta);
  const filtrosAtivos = fConta != null || fMascara != null || fOrigem != null || fProjeta != null;
  const visivel = useMemo(() => {
    if (!termo && !filtrosAtivos) return null;
    const ids = new Set();
    const bateBusca = (c) =>
      !termo ||
      String(c.sienge_id).includes(termo.replace(/\./g, '')) ||
      codigoFormatado(c).includes(termo) ||
      (c.name || '').toLowerCase().includes(termo);
    const passaFiltros = (c) => {
      const cl = classificacoes[c.sienge_id] || {};
      return (
        passaNoFiltro(fConta, c.sienge_id) &&
        passaNoFiltro(fProjeta, cl.projeta_dfc === false ? 'N' : 'S') &&
        passaNoFiltro(fMascara, cl.mascara_id ?? NAO_INFORMADO) &&
        passaNoFiltro(fOrigem, cl.origem_projecao ?? NAO_INFORMADO)
      );
    };
    const marcar = (no) => {
      const algumFilho = no.filhos.map(marcar).some(Boolean);
      const proprio =
        no.tp_conta === 'T' ? !filtrosAtivos && termo && bateBusca(no) : passaFiltros(no) && bateBusca(no);
      if (algumFilho || proprio) {
        ids.add(no.sienge_id);
        return true;
      }
      return false;
    };
    arvore.forEach(marcar);
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arvore, termo, filtrosAtivos, filtroConta, filtroMascara, filtroOrigem, filtroProjeta, classificacoes]);

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
      {onVoltar && (
        <div className="-mt-1 mb-4 flex items-center gap-3 border-b border-gray-100 pb-3">
          <button
            type="button"
            onClick={onVoltar}
            className="flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-800"
          >
            <ArrowLeft size={16} />
            Planos de contas
          </button>
          <span className="text-gray-300">/</span>
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-gray-900">
            {centroVersao ? <Building2 size={15} className="shrink-0 text-primary-600" /> : <Globe2 size={15} className="shrink-0 text-primary-600" />}
            <span className="truncate">{tituloPlano}</span>
          </span>
          <span className="ml-auto shrink-0 text-xs text-gray-400">
            {centroVersao ? 'Vale só para este centro de custo' : 'Vale para todos os centros sem plano próprio'}
          </span>
        </div>
      )}
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
      ) : (
        <div>
          <div
            className={`${GRADE} sticky -top-6 z-20 rounded-t-lg border-b-2 border-blue-500 bg-blue-50 py-2.5 pl-4 pr-4 text-xs font-medium uppercase tracking-wide text-blue-700`}
          >
            <span ref={colunaContaRef} className="flex items-center gap-1.5">
              Conta
              <FiltroColuna
                filtro={filtroConta}
                onChange={setFiltroConta}
                opcoes={opcoesFiltroConta}
                label="Conta"
                colunaRef={colunaContaRef}
              />
            </span>
            {/* Texto centralizado sobre o checkbox; o ícone do filtro fica fora do centro, à direita. */}
            <span ref={colunaProjetaRef} className="flex justify-center">
              <span className="relative whitespace-nowrap">
                Projeta DFC
                <span className="absolute left-full top-1/2 ml-1.5 flex -translate-y-1/2 items-center">
                  <FiltroColuna
                    filtro={filtroProjeta}
                    onChange={setFiltroProjeta}
                    opcoes={OPCOES_FILTRO_PROJETA}
                    label="Projeta DFC"
                    colunaRef={colunaProjetaRef}
                  />
                </span>
              </span>
            </span>
            <span ref={colunaMascaraRef} className="flex items-center gap-1.5">
              Máscara DFC
              <FiltroColuna
                filtro={filtroMascara}
                onChange={setFiltroMascara}
                opcoes={opcoesFiltroMascara}
                label="Máscara DFC"
                colunaRef={colunaMascaraRef}
                larguraPainel={460}
              />
            </span>
            <span ref={colunaOrigemRef} className="flex items-center gap-1.5">
              Origem Projeção
              <FiltroColuna
                filtro={filtroOrigem}
                onChange={setFiltroOrigem}
                opcoes={opcoesFiltroOrigem}
                label="Origem Projeção"
                colunaRef={colunaOrigemRef}
                larguraPainel={360}
              />
            </span>
            <span>Status</span>
          </div>

          {/* Cabeçalho sempre visível (pedido do usuário) — inclusive pra desfazer um filtro de
              coluna que não achou nada. */}
          {linhas.length === 0 ? (
            contas.length === 0 ? (
              <div className="flex flex-col items-center gap-1 border-b border-gray-100 py-12 text-center">
                <ListTree size={26} className="mb-1 text-gray-300" />
                <p className="text-sm text-gray-600">Nenhuma conta no plano de contas desta empresa.</p>
                <p className="max-w-sm text-xs text-gray-400">
                  Use o ícone no canto direito, acima, para gerar a partir do Sienge.
                </p>
              </div>
            ) : (
              <div className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                Nenhuma conta encontrada para essa busca/filtro.
                {filtrosAtivos && (
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroConta(null);
                      setFiltroMascara(null);
                      setFiltroOrigem(null);
                      setFiltroProjeta(null);
                    }}
                    className="ml-2 font-medium text-primary-600 hover:text-primary-700"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            )
          ) : (
            linhas.map(({ conta, nivel }) => {
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
                    <span />
                  </>
                ) : (
                  <>
                    {/* Desmarcada, a conta não aparece no Orçamento dos centros que usam este plano. */}
                    <span className="flex justify-center">
                      <input
                        type="checkbox"
                        checked={classificacao.projeta_dfc !== false}
                        onChange={(e) => classificar(conta.sienge_id, { projeta_dfc: e.target.checked })}
                        title="Projeta DFC"
                        className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-100"
                      />
                    </span>
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
                      larguraPainel={360}
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
          })
          )}
        </div>
      )}
    </div>
  );
}
