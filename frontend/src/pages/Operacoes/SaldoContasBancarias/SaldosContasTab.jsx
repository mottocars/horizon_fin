import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsDownUp, ChevronsUpDown, Landmark, Loader2, Minus, Plus, TriangleAlert } from 'lucide-react';
import { getSaldosContas, salvarSaldosContas } from '../../../api/saldoContasBancarias.api';
import {
  GRUPOS_CLASSIFICACAO,
  SEM_CLASSIFICACAO,
  formatarSaldo,
  interpretarSaldo,
  listarDias,
  nomeMes,
  numeroParaEdicao,
  somarSaldos,
} from './constantes';

// Geometria da grade — a tabela tem largura fixa (colunas em px) e rola dentro do card:
// com até 31+ colunas de valor não existe largura de tela que acomode tudo sem rolar.
const LARGURA_PRIMEIRA = 340;
const LARGURA_DIA = 112;
const ALTURA_MES = 28;
// A coluna de nomes é sticky: o que foca/rola por baixo dela precisa de margem, senão a
// célula focada por teclado fica escondida atrás da coluna/cabeçalho fixos.
const MARGEM_ROLAGEM = 'scroll-mt-[84px] scroll-mb-14 scroll-ml-[356px] scroll-mr-4';

const tomNegativo = (valor) => (valor < 0 ? 'text-red-600' : 'text-gray-900');

// ---------------------------------------------------------------------------
// Célula editável de saldo (conta x dia).
//
// Sem estado de edição, mostra o valor formatado (1.234,56). Ao focar, vira texto puro
// editável ("1234,56") e tudo selecionado; ao sair (blur/Enter) o texto é interpretado e,
// se mudou, vai pro pai gravar. Vazio = apagar o lançamento ("não informado"); 0 é um
// saldo válido e diferente de vazio. Texto inválido descarta a edição e volta ao valor.
// ---------------------------------------------------------------------------
const CelulaSaldo = memo(function CelulaSaldo({
  companyId,
  numeroConta,
  rotulo,
  dia,
  valor,
  onCommit,
  onNavegar,
  onColar,
  registrar,
}) {
  const [texto, setTexto] = useState(null); // null = fora de edição
  // O texto também vive num ref: o Enter faz commit e em seguida move o foco, o que dispara
  // o blur DESTA célula ainda com o state antigo — sem o ref gravaria duas vezes.
  const textoRef = useRef(null);
  const chave = `${companyId}|${numeroConta}|${dia.iso}`;
  const setRef = useCallback((el) => registrar(chave, el), [registrar, chave]);

  function atualizarTexto(novo) {
    textoRef.current = novo;
    setTexto(novo);
  }

  function commit() {
    const digitado = textoRef.current;
    if (digitado === null) return;
    atualizarTexto(null);
    const novo = interpretarSaldo(digitado);
    if (Number.isNaN(novo)) return; // inválido: descarta e volta ao valor anterior
    if (novo === (valor ?? null)) return; // não mudou
    onCommit(companyId, numeroConta, dia.iso, novo);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      commit();
      if (!onNavegar(companyId, numeroConta, dia.iso, 1)) e.currentTarget.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      commit();
      onNavegar(companyId, numeroConta, dia.iso, -1);
    } else if (e.key === 'Escape') {
      atualizarTexto(null); // descarta a edição
      e.currentTarget.blur();
    }
  }

  function handlePaste(e) {
    const colado = e.clipboardData.getData('text');
    // Um valor só cola normalmente no campo; vários (tabela copiada do Excel) espalham
    // pelas células seguintes — pra baixo e pra direita.
    if (!/[\t\n]/.test(colado.replace(/[\t\n\r]+$/, ''))) return;
    e.preventDefault();
    atualizarTexto(null);
    onColar(companyId, numeroConta, dia.iso, colado);
  }

  const editando = texto !== null;
  const preenchido = valor !== undefined && valor !== null;
  const tom = preenchido
    ? 'border-primary-100 bg-primary-50 hover:border-primary-500'
    : dia.pendente
      ? 'border-amber-200 bg-amber-50 hover:border-amber-400'
      : 'border-transparent bg-transparent hover:border-gray-300 hover:bg-white';

  return (
    <input
      ref={setRef}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      aria-label={`${rotulo} — saldo do dia ${dia.dia}`}
      value={editando ? texto : preenchido ? formatarSaldo(valor) : ''}
      onFocus={(e) => {
        atualizarTexto(preenchido ? numeroParaEdicao(valor) : '');
        const campo = e.currentTarget;
        setTimeout(() => campo.select(), 0);
      }}
      onChange={(e) => {
        if (/^[-\d.,\sR$]*$/i.test(e.target.value)) atualizarTexto(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      className={`h-8 w-full rounded-md border px-2 text-right text-xs tabular-nums outline-none transition-colors focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-100 ${MARGEM_ROLAGEM} ${tom} ${
        editando ? 'text-gray-900' : preenchido ? tomNegativo(valor) : 'text-gray-900'
      }`}
    />
  );
});

function ValorTotal({ valor, className = '' }) {
  if (valor === undefined) return <span className="text-gray-300">—</span>;
  return <span className={`${valor < 0 ? 'text-red-600' : ''} ${className}`}>{formatarSaldo(valor)}</span>;
}

function Esqueleto() {
  return (
    <div className="animate-pulse space-y-2 px-5 py-6" aria-label="Carregando saldos">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-8 w-75 shrink-0 rounded-md bg-gray-100" />
          <div className="h-8 flex-1 rounded-md bg-gray-50" />
        </div>
      ))}
    </div>
  );
}

// Nível 1 = classificação (totais por dia), nível 2 = conta bancária (saldo de cada dia,
// preenchível). Toda a matemática dos totais roda aqui no navegador em cima do que já veio
// carregado, então editar uma célula atualiza o total da classificação na hora.
export default function SaldosContasTab({
  empresaId,
  dataInicio,
  dataFim,
  companyIds,
  classificacoes,
  bancos,
  nomesBancos,
  refreshToken = 0,
}) {
  const [contas, setContas] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [abertos, setAbertos] = useState([]);

  const [pendentes, setPendentes] = useState(0);
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');
  const [aviso, setAviso] = useState('');

  const scrollRef = useRef(null);
  const inputsRef = useRef(new Map());
  const linhasVisiveisRef = useRef([]);
  const filaRef = useRef(Promise.resolve());
  const requisicaoRef = useRef(0);
  const carregarRef = useRef(() => {});
  const rolouAposCargaRef = useRef(false);

  const dias = useMemo(() => listarDias(dataInicio, dataFim), [dataInicio, dataFim]);

  const carregar = useCallback(() => {
    if (!empresaId) {
      setContas(null);
      return;
    }
    const minhaRequisicao = ++requisicaoRef.current;
    rolouAposCargaRef.current = false;
    setCarregando(true);
    setErroCarga('');
    getSaldosContas(empresaId, { dataInicio, dataFim, companyIds, classificacoes, bancos })
      .then((resposta) => {
        if (minhaRequisicao === requisicaoRef.current) setContas(resposta.contas);
      })
      .catch((err) => {
        if (minhaRequisicao === requisicaoRef.current) {
          setContas(null);
          setErroCarga(err.response?.data?.message || 'Não foi possível carregar os saldos.');
        }
      })
      .finally(() => {
        if (minhaRequisicao === requisicaoRef.current) setCarregando(false);
      });
  }, [empresaId, dataInicio, dataFim, companyIds, classificacoes, bancos]);

  carregarRef.current = carregar;

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  // ---------------------------------------------------------------- agrupamento e totais
  const grupos = useMemo(() => {
    if (!contas) return [];
    return GRUPOS_CLASSIFICACAO.map((grupo) => ({
      ...grupo,
      contas: contas.filter((c) => (c.classificacao || SEM_CLASSIFICACAO) === grupo.value),
    })).filter((grupo) => grupo.contas.length > 0);
  }, [contas]);

  const { totaisPorGrupo, totalGeral } = useMemo(() => {
    const porGrupo = {};
    const somaGeral = {};
    for (const grupo of grupos) {
      const porDia = {};
      for (const conta of grupo.contas) {
        for (const [data, valor] of Object.entries(conta.saldos)) (porDia[data] ||= []).push(valor);
      }
      porGrupo[grupo.value] = Object.fromEntries(Object.entries(porDia).map(([data, v]) => [data, somarSaldos(v)]));
      for (const [data, v] of Object.entries(porGrupo[grupo.value])) (somaGeral[data] ||= []).push(v);
    }
    return {
      totaisPorGrupo: porGrupo,
      totalGeral: Object.fromEntries(Object.entries(somaGeral).map(([data, v]) => [data, somarSaldos(v)])),
    };
  }, [grupos]);

  // Quanto do que já deveria estar informado (dias úteis até hoje) está preenchido.
  const preenchimento = useMemo(() => {
    if (!contas) return { feitas: 0, esperadas: 0, pct: 0 };
    const diasUteis = dias.filter((d) => d.pendente);
    const esperadas = contas.length * diasUteis.length;
    const feitas = contas.reduce((acc, c) => acc + diasUteis.filter((d) => c.saldos[d.iso] !== undefined).length, 0);
    return { feitas, esperadas, pct: esperadas ? Math.round((feitas / esperadas) * 100) : 0 };
  }, [contas, dias]);

  const meses = useMemo(() => {
    const segmentos = [];
    for (const d of dias) {
      const ultimo = segmentos[segmentos.length - 1];
      if (ultimo && ultimo.mes === d.mes && ultimo.ano === d.ano) ultimo.dias += 1;
      else segmentos.push({ mes: d.mes, ano: d.ano, dias: 1 });
    }
    return segmentos;
  }, [dias]);

  // Linhas de conta visíveis (grupo aberto), na ordem da tela — é a base da navegação por
  // teclado (Enter/setas) e da colagem de várias linhas.
  const linhasVisiveis = useMemo(
    () =>
      grupos
        .filter((g) => abertos.includes(g.value))
        .flatMap((g) => g.contas.map((c) => ({ companyId: c.company_id, numeroConta: c.numero_conta }))),
    [grupos, abertos]
  );
  useEffect(() => {
    linhasVisiveisRef.current = linhasVisiveis;
  }, [linhasVisiveis]);

  // Ao terminar de carregar, rola a grade pra deixar a coluna de hoje à vista (a coluna de
  // nomes ocupa a esquerda; sem isso, num mês inteiro o dia atual ficaria fora da tela).
  // Só uma vez por carga: `contas` muda a cada edição salva e não pode puxar a rolagem de
  // volta pra hoje enquanto o usuário preenche outro dia.
  useEffect(() => {
    if (carregando || !contas || rolouAposCargaRef.current || !scrollRef.current) return;
    rolouAposCargaRef.current = true;
    const colunaHoje = scrollRef.current.querySelector('#saldo-coluna-hoje');
    scrollRef.current.scrollLeft = colunaHoje
      ? Math.max(0, colunaHoje.offsetLeft - LARGURA_PRIMEIRA - LARGURA_DIA * 2)
      : 0;
  }, [carregando, contas]);

  // ---------------------------------------------------------------------------- gravação
  // Aplica na hora (otimista) e grava por uma fila: cada lote só sai depois que o anterior
  // terminou, então duas edições seguidas da mesma célula nunca chegam fora de ordem.
  // Se um lote falha, recarrega do servidor — a tela nunca fica mostrando algo não gravado.
  const aplicarLocal = useCallback((itens) => {
    setContas((prev) => {
      if (!prev) return prev;
      const porConta = new Map();
      for (const item of itens) {
        const chave = `${item.company_id}|${item.numero_conta}`;
        if (!porConta.has(chave)) porConta.set(chave, []);
        porConta.get(chave).push(item);
      }
      return prev.map((conta) => {
        const lista = porConta.get(`${conta.company_id}|${conta.numero_conta}`);
        if (!lista) return conta;
        const saldos = { ...conta.saldos };
        for (const item of lista) {
          if (item.saldo === null) delete saldos[item.data];
          else saldos[item.data] = item.saldo;
        }
        return { ...conta, saldos };
      });
    });
  }, []);

  const salvar = useCallback(
    (itens) => {
      if (!itens.length) return;
      aplicarLocal(itens);
      setPendentes((n) => n + 1);
      setErroSalvar('');
      filaRef.current = filaRef.current
        .then(() => salvarSaldosContas(empresaId, itens))
        .then(() => setSalvoAlgumaVez(true))
        .catch((err) => {
          setErroSalvar(err.response?.data?.message || 'Não foi possível salvar. Recarregando os saldos...');
          carregarRef.current();
        })
        .finally(() => setPendentes((n) => n - 1));
    },
    [empresaId, aplicarLocal]
  );

  const handleCommit = useCallback(
    (companyId, numeroConta, data, saldo) => salvar([{ company_id: companyId, numero_conta: numeroConta, data, saldo }]),
    [salvar]
  );

  const registrarInput = useCallback((chave, el) => {
    if (el) inputsRef.current.set(chave, el);
    else inputsRef.current.delete(chave);
  }, []);

  // Enter/seta: foca a célula do mesmo dia na linha de baixo/de cima. Devolve false se não
  // existe (última/primeira linha), pra célula só sair do foco.
  const handleNavegar = useCallback((companyId, numeroConta, data, passo) => {
    const linhas = linhasVisiveisRef.current;
    const atual = linhas.findIndex((l) => l.companyId === companyId && l.numeroConta === numeroConta);
    const alvo = linhas[atual + passo];
    if (atual === -1 || !alvo) return false;
    const campo = inputsRef.current.get(`${alvo.companyId}|${alvo.numeroConta}|${data}`);
    if (!campo) return false;
    campo.focus();
    return true;
  }, []);

  // Cola uma tabela (linhas separadas por quebra de linha, colunas por TAB — o que o Excel
  // copia) a partir da célula onde o cursor está: linhas -> contas seguintes, colunas -> dias
  // seguintes. Célula vazia no meio do que foi colado não apaga nada; valor inválido é ignorado.
  const handleColar = useCallback(
    (companyId, numeroConta, data, texto) => {
      const linhas = linhasVisiveisRef.current;
      const linhaInicial = linhas.findIndex((l) => l.companyId === companyId && l.numeroConta === numeroConta);
      const colunaInicial = dias.findIndex((d) => d.iso === data);
      if (linhaInicial === -1 || colunaInicial === -1) return;

      const matriz = texto
        .replace(/\r/g, '')
        .replace(/\n+$/, '')
        .split('\n')
        .map((linha) => linha.split('\t'));

      const itens = [];
      let ignorados = 0;
      matriz.forEach((celulas, r) => {
        celulas.forEach((bruto, c) => {
          const conta = linhas[linhaInicial + r];
          const dia = dias[colunaInicial + c];
          if (bruto.trim() === '') return;
          const valor = interpretarSaldo(bruto);
          if (!conta || !dia || Number.isNaN(valor)) {
            ignorados += 1;
            return;
          }
          itens.push({ company_id: conta.companyId, numero_conta: conta.numeroConta, data: dia.iso, saldo: valor });
        });
      });

      salvar(itens);
      setAviso(
        `${itens.length} valor(es) colado(s)` + (ignorados ? ` · ${ignorados} ignorado(s) (inválido ou fora da grade)` : '')
      );
      setTimeout(() => setAviso(''), 5000);
    },
    [dias, salvar]
  );

  function alternarGrupo(valor) {
    setAbertos((atual) => (atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor]));
  }

  const todosAbertos = grupos.length > 0 && grupos.every((g) => abertos.includes(g.value));

  // -------------------------------------------------------------------------- renderização
  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <Landmark size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver e informar o saldo das contas bancárias.
        </p>
      </div>
    );
  }

  const semContas = !carregando && !erroCarga && contas && contas.length === 0;

  return (
    <div className="rounded-card rounded-tl-none bg-white shadow-card">
      <div className="flex flex-col gap-3 px-5 pb-3 pt-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Saldos das contas</h2>
            <p className="text-xs text-gray-500">
              {contas
                ? `${contas.length} conta${contas.length === 1 ? '' : 's'} em ${grupos.length} classificaç${grupos.length === 1 ? 'ão' : 'ões'}`
                : 'Carregando...'}
              {' · '}
              {dias.length} dias
            </p>
          </div>

          {contas && preenchimento.esperadas > 0 && (
            <div
              className="flex items-center gap-2"
              title={`${preenchimento.feitas} de ${preenchimento.esperadas} saldos de dias úteis até hoje já informados`}
            >
              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${preenchimento.pct}%` }} />
              </div>
              <span className="text-xs text-gray-500">
                <span className="font-semibold text-gray-700">{preenchimento.pct}%</span> preenchido até hoje
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-3 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-primary-100 bg-primary-50" />
              Informado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-amber-200 bg-amber-50" />
              Pendente
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-gray-200 bg-gray-100" />
              Fim de semana
            </span>
          </div>

          <div className="flex min-w-32.5 items-center justify-end text-xs" aria-live="polite">
            {pendentes > 0 ? (
              <span className="flex items-center gap-1.5 text-gray-500">
                <Loader2 size={14} className="animate-spin" /> Salvando...
              </span>
            ) : erroSalvar ? (
              <span className="flex items-center gap-1.5 text-red-600" title={erroSalvar}>
                <TriangleAlert size={14} /> Erro ao salvar
              </span>
            ) : salvoAlgumaVez ? (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <Check size={14} /> Alterações salvas
              </span>
            ) : null}
          </div>

          {grupos.length > 0 && (
            <button
              type="button"
              onClick={() => setAbertos(todosAbertos ? [] : grupos.map((g) => g.value))}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              {todosAbertos ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
              {todosAbertos ? 'Recolher tudo' : 'Expandir tudo'}
            </button>
          )}
        </div>
      </div>

      {(erroSalvar || aviso) && (
        <div
          className={`mx-5 mb-3 rounded-lg px-3 py-2 text-xs ${erroSalvar ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-700'}`}
          role="status"
        >
          {erroSalvar || aviso}
        </div>
      )}

      {carregando ? (
        <div className="border-t border-gray-200">
          <Esqueleto />
        </div>
      ) : erroCarga ? (
        <div className="flex flex-col items-center gap-2 border-t border-gray-200 py-14 text-center">
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
      ) : semContas ? (
        <div className="flex flex-col items-center gap-1 border-t border-gray-200 py-14 text-center">
          <Landmark size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma conta bancária encontrada.</p>
          <p className="max-w-sm text-xs text-gray-400">
            Ajuste os filtros ou, se a empresa ainda não tem contas, importe-as em Cadastros → Contas Bancárias.
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="overflow-auto rounded-b-card border-t border-gray-200"
          style={{ maxHeight: 'calc(100vh - 22rem)', minHeight: 320 }}
        >
          {/* Só a coluna de nomes tem largura fixa; as de dia dividem o que sobrar. Com poucos
              dias (o padrão são 8) elas esticam pra preencher o card em vez de deixar uma
              faixa em branco à direita; com muitos, `minWidth` garante 112px por dia e a
              grade rola na horizontal. */}
          <table
            className="border-separate border-spacing-0 text-left text-xs"
            style={{ tableLayout: 'fixed', width: '100%', minWidth: LARGURA_PRIMEIRA + dias.length * LARGURA_DIA }}
          >
            <colgroup>
              <col style={{ width: LARGURA_PRIMEIRA }} />
              {dias.map((d) => (
                <col key={d.iso} />
              ))}
            </colgroup>

            <thead>
              <tr style={{ height: ALTURA_MES }}>
                <th
                  rowSpan={2}
                  className="sticky left-0 top-0 z-30 border-b-2 border-r border-gray-300 border-r-gray-200 bg-white pl-4 text-xs font-medium uppercase tracking-wide text-gray-400"
                >
                  Classificação / Conta bancária
                </th>
                {meses.map((m) => (
                  <th
                    key={`${m.ano}-${m.mes}`}
                    colSpan={m.dias}
                    className="sticky top-0 z-20 border-b border-l border-gray-200 bg-white px-3 text-left text-xs font-semibold text-gray-700"
                    style={{ height: ALTURA_MES }}
                  >
                    <span className="sticky inline-block" style={{ left: LARGURA_PRIMEIRA + 12 }}>
                      {nomeMes(m.ano, m.mes)}
                    </span>
                  </th>
                ))}
              </tr>
              <tr>
                {dias.map((d) => (
                  <th
                    key={d.iso}
                    id={d.hoje ? 'saldo-coluna-hoje' : undefined}
                    className={`sticky z-20 border-b-2 border-l border-b-gray-300 border-l-gray-200 py-1.5 text-center font-medium ${
                      d.fimDeSemana ? 'bg-gray-50' : 'bg-white'
                    }`}
                    style={{ top: ALTURA_MES }}
                    title={`${d.semana}, ${String(d.dia).padStart(2, '0')}/${String(d.mes + 1).padStart(2, '0')}/${d.ano}${d.hoje ? ' (hoje)' : ''}`}
                  >
                    <span className={`block text-[10px] uppercase tracking-wide ${d.fimDeSemana ? 'text-gray-300' : 'text-gray-400'}`}>
                      {d.semana}
                    </span>
                    <span
                      className={`mx-auto mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-sm font-semibold tabular-nums ${
                        d.hoje ? 'bg-primary-600 text-white' : d.fimDeSemana ? 'text-gray-400' : 'text-gray-800'
                      }`}
                    >
                      {String(d.dia).padStart(2, '0')}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {grupos.map((grupo) => {
                const aberto = abertos.includes(grupo.value);
                const Icone = grupo.icon;
                const totais = totaisPorGrupo[grupo.value] || {};
                return (
                  <Fragment key={grupo.value}>
                    <tr onClick={() => alternarGrupo(grupo.value)} className="group/grupo cursor-pointer">
                      <td className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 py-2.5 pl-3 pr-2 group-hover/grupo:bg-gray-100">
                        <span className="flex items-center gap-2">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                            {aberto ? <Minus size={10} /> : <Plus size={10} />}
                          </span>
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${grupo.fundo}`}>
                            <Icone size={13} className={grupo.cor} />
                          </span>
                          <span className="truncate text-xs font-semibold text-gray-900">{grupo.label}</span>
                          <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium tabular-nums text-gray-500 ring-1 ring-gray-200">
                            {grupo.contas.length}
                          </span>
                        </span>
                      </td>
                      {dias.map((d) => (
                        <td
                          key={d.iso}
                          className="border-b border-l border-gray-200 bg-gray-50 px-3 text-right text-xs font-semibold tabular-nums text-gray-900 group-hover/grupo:bg-gray-100"
                        >
                          <ValorTotal valor={totais[d.iso]} />
                        </td>
                      ))}
                    </tr>

                    {aberto &&
                      grupo.contas.map((conta) => {
                        // Tooltip com o banco por extenso; na linha, o código vira uma etiqueta antes
                        // do nome da empresa — o nome da empresa é longo e, se viesse depois dele,
                        // empurraria o banco pra fora da coluna.
                        const banco = conta.banco_codigo
                          ? `${conta.banco_codigo} ${nomesBancos?.get(conta.banco_codigo) || ''}`.trim()
                          : '';
                        const subtitulo = [banco, conta.company_name].filter(Boolean).join(' · ');
                        return (
                          <tr key={`${conta.company_id}|${conta.numero_conta}`}>
                            <td className="sticky left-0 z-10 border-b border-r border-gray-100 border-r-gray-200 bg-white py-1.5 pl-10 pr-3">
                              <div className="flex items-center gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-medium text-gray-800" title={conta.nome || conta.numero_conta}>
                                    {conta.nome || conta.numero_conta}
                                  </div>
                                  {subtitulo && (
                                    <div className="flex items-center gap-1.5 text-[11px] text-gray-400" title={subtitulo}>
                                      {conta.banco_codigo && (
                                        <span className="shrink-0 rounded bg-gray-100 px-1 text-[10px] font-semibold tabular-nums text-gray-500">
                                          {conta.banco_codigo}
                                        </span>
                                      )}
                                      <span className="min-w-0 truncate">{conta.company_name}</span>
                                    </div>
                                  )}
                                </div>
                                {conta.status !== 'ENABLED' && (
                                  <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                    Inativa
                                  </span>
                                )}
                              </div>
                            </td>
                            {dias.map((d) => (
                              <td
                                key={d.iso}
                                className={`border-b border-l border-gray-100 p-1 ${d.fimDeSemana ? 'bg-gray-50/80' : 'bg-white'}`}
                              >
                                <CelulaSaldo
                                  companyId={conta.company_id}
                                  numeroConta={conta.numero_conta}
                                  rotulo={conta.nome || conta.numero_conta}
                                  dia={d}
                                  valor={conta.saldos[d.iso]}
                                  onCommit={handleCommit}
                                  onNavegar={handleNavegar}
                                  onColar={handleColar}
                                  registrar={registrarInput}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>

            <tfoot>
              <tr>
                <td className="sticky bottom-0 left-0 z-30 border-r border-t-2 border-gray-200 border-t-gray-300 bg-white py-3 pl-4 text-xs font-semibold uppercase tracking-wide text-gray-700">
                  Total geral
                </td>
                {dias.map((d) => (
                  <td
                    key={d.iso}
                    className={`sticky bottom-0 z-20 border-l border-t-2 border-gray-200 border-t-gray-300 px-3 text-right text-xs font-bold tabular-nums text-gray-900 ${
                      d.fimDeSemana ? 'bg-gray-50' : 'bg-white'
                    }`}
                  >
                    <ValorTotal valor={totalGeral[d.iso]} />
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
