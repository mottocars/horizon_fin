import { Fragment, forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Check, History, Landmark, Loader2, Minus, Pencil, Plus, TriangleAlert, Zap } from 'lucide-react';
import { getSaldosContas, salvarSaldosContas } from '../../../api/saldoContasBancarias.api';
import LogoBanco from './LogoBanco';
import { gerarRelatorioSaldosPdf } from './gerarRelatorioPdf';
import { formatarSaldo, interpretarSaldo, listarDias, nomeMes, numeroParaEdicao, somarSaldos } from './constantes';

// Geometria da grade — a tabela tem largura fixa (colunas em px) e rola dentro do card:
// com até 31+ colunas de valor não existe largura de tela que acomode tudo sem rolar.
const LARGURA_PRIMEIRA = 340;
const LARGURA_DIA = 112;
const ALTURA_MES = 28;
// Cabeçalho do dia numa linha só (dia da semana + número lado a lado, pedido do usuário) —
// bem mais baixo que o layout antigo, em duas linhas empilhadas.
const ALTURA_DIA = 28;
// A coluna de nomes é sticky: o que foca/rola por baixo dela precisa de margem, senão a
// célula focada por teclado fica escondida atrás da coluna/cabeçalho fixos. scroll-mt =
// ALTURA_MES + ALTURA_DIA + uma folga pequena.
const MARGEM_ROLAGEM = 'scroll-mt-[60px] scroll-mb-14 scroll-ml-[356px] scroll-mr-4';

const tomNegativo = (valor) => (valor < 0 ? 'text-red-600' : 'text-gray-900');

// Origem do saldo (só pra cor/ícone da célula — não afeta valor nem gravação): API = achado
// automaticamente na VanPix; HERDADO = repetido do dia anterior (VanPix não trouxe nada pra
// essa conta e a classificação prioriza isso); MANUAL = digitado/colado na grade (inclusive
// quando sobrescreve um valor que era API/HERDADO). Cores discretas (tom 50/100), mesmo peso
// visual do âmbar/azul já usados — "sutil", não um selo chamativo.
const ORIGEM_INFO = {
  API: { icone: Zap, tom: 'border-emerald-100 bg-emerald-50 hover:border-emerald-400', icone_cor: 'text-emerald-500', titulo: 'Saldo automático (VanPix)' },
  HERDADO: { icone: History, tom: 'border-purple-100 bg-purple-50 hover:border-purple-400', icone_cor: 'text-purple-500', titulo: 'Saldo repetido do dia anterior' },
  MANUAL: { icone: Pencil, tom: 'border-primary-100 bg-primary-50 hover:border-primary-500', icone_cor: 'text-primary-500', titulo: 'Saldo lançado manualmente' },
};

// Sobe a árvore a partir de `el` até achar o ancestral que rola de verdade (overflow auto ou
// scroll em algum eixo) — hoje é o <main> do AppShell, mas a função não depende de conhecer
// essa estrutura: funciona igual se um dia a página ganhar outro wrapper. Sem nenhum, cai no
// próprio documento (scroll da janela).
function ancestralRolavel(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const estilo = getComputedStyle(node);
    if (/(auto|scroll)/.test(estilo.overflowX + estilo.overflowY)) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

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
  origem,
  bloqueada,
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
  // Origem decide o ÍCONE sempre que tem valor e não está em edição — inclusive bloqueada
  // (período encerrado): o pedido do usuário foi "o fundo cinza continua, mas o ícone colorido
  // precisa sempre permanecer". Já a COR DE FUNDO (tom) só reflete a origem no dia liberado;
  // bloqueada é sempre cinza plano, como antes. Cai em MANUAL se por algum motivo vier sem
  // origem (não deveria, a coluna é NOT NULL, mas evita um visual quebrado).
  const infoOrigem = preenchido && !editando ? ORIGEM_INFO[origem] || ORIGEM_INFO.MANUAL : null;
  // Fora do dia liberado (cadeado): cinza e sem hover, igual a um campo desabilitado comum —
  // o disabled abaixo já impede focar/digitar/colar, isso é só o reforço visual.
  const tom = bloqueada
    ? 'border-transparent bg-gray-50'
    : preenchido
      ? infoOrigem?.tom || ORIGEM_INFO.MANUAL.tom
      : dia.pendente
        ? 'border-amber-200 bg-amber-50 hover:border-amber-400'
        : 'border-transparent bg-transparent hover:border-gray-300 hover:bg-white';
  const Icone = infoOrigem?.icone;

  return (
    <div className="relative">
      {Icone && (
        <Icone
          size={11}
          className={`pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 ${infoOrigem.icone_cor}`}
          aria-hidden="true"
        />
      )}
      <input
        ref={setRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        disabled={bloqueada}
        title={infoOrigem?.titulo}
        aria-label={`${rotulo} — saldo do dia ${dia.dia}${bloqueada ? ' (bloqueado — fora do período aberto)' : ''}${infoOrigem ? ` (${infoOrigem.titulo})` : ''}`}
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
        className={`h-8 w-full rounded-md border text-right text-xs tabular-nums outline-none transition-colors focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed ${Icone ? 'pl-5 pr-2' : 'px-2'} ${MARGEM_ROLAGEM} ${tom} ${
          bloqueada ? 'text-gray-400' : editando ? 'text-gray-900' : preenchido ? tomNegativo(valor) : 'text-gray-900'
        }`}
      />
    </div>
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
//
// `ref` expõe `exportarPDF(meta)` pra página-mãe (o botão "Exportar relatório" fica lá, junto
// do cadeado) — os dados de grade (grupos/dias/totais) já estão todos calculados aqui, então é
// mais simples expor um método do que replicar esse cálculo na página.
const SaldosContasTab = forwardRef(function SaldosContasTab(
  {
    empresaId,
    dataInicio,
    dataFim,
    companyIds,
    bancos,
    contas: contasFiltro,
    infoBancos,
    refreshToken = 0,
    // Dia liberado pra lançar saldo (cadeado, gerenciado na página) — só ele aceita edição;
    // os demais ficam bloqueados. `onPeriodoDessincronizado` é chamado quando o servidor recusa
    // uma gravação por o período liberado ter mudado nesse meio tempo (outra aba/pessoa), pra
    // página recarregar o valor real.
    dataAberta = '',
    onPeriodoDessincronizado,
  },
  ref
) {
  const [contas, setContas] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroCarga, setErroCarga] = useState('');
  const [abertos, setAbertos] = useState([]);

  const [pendentes, setPendentes] = useState(0);
  const [salvoAlgumaVez, setSalvoAlgumaVez] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');
  const [aviso, setAviso] = useState('');

  const tabelaRef = useRef(null);
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
    getSaldosContas(empresaId, { dataInicio, dataFim, companyIds, bancos, contas: contasFiltro })
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
  }, [empresaId, dataInicio, dataFim, companyIds, bancos, contasFiltro]);

  carregarRef.current = carregar;

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  // ---------------------------------------------------------------- agrupamento e totais
  // O backend já só devolve contas classificadas + projetando saldo (getSaldos), então todo
  // mundo aqui tem `classificacao` preenchida. Classificação não é mais uma lista fixa (virou
  // cadastro por empresa — ver ClassificacoesTab.jsx): os grupos vêm dos nomes que realmente
  // aparecem nas contas carregadas, ordenados alfabeticamente.
  const grupos = useMemo(() => {
    if (!contas) return [];
    const nomes = [...new Set(contas.map((c) => c.classificacao))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return nomes.map((nome) => ({
      value: nome,
      label: nome,
      contas: contas.filter((c) => c.classificacao === nome),
    }));
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

  // Ao terminar de carregar, rola até deixar a coluna de hoje à vista (a coluna de nomes
  // ocupa a esquerda — com a semana inteira normalmente cabendo na tela isso raramente faz
  // diferença, mas sobra pra viewports estreitas). Quem rola é a PÁGINA (o <main> do
  // AppShell) — ver o comentário grande no JSX sobre por que a grade não tem overflow
  // próprio. Só uma vez por carga: `contas` muda a cada edição salva e não pode puxar a
  // rolagem de volta pra hoje enquanto o usuário preenche outro dia.
  useEffect(() => {
    if (carregando || !contas || rolouAposCargaRef.current || !tabelaRef.current) return;
    rolouAposCargaRef.current = true;
    const colunaHoje = tabelaRef.current.querySelector('#saldo-coluna-hoje');
    if (!colunaHoje) return;
    const scroller = ancestralRolavel(colunaHoje);
    const desloc = colunaHoje.getBoundingClientRect().left - scroller.getBoundingClientRect().left;
    scroller.scrollLeft += desloc - LARGURA_PRIMEIRA - LARGURA_DIA * 2;
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
        const origens = { ...conta.origens };
        for (const item of lista) {
          if (item.saldo === null) {
            delete saldos[item.data];
            delete origens[item.data];
          } else {
            saldos[item.data] = item.saldo;
            // Toda gravação que passa por aqui é digitação/colagem na grade — sempre MANUAL,
            // mesmo sobrescrevendo o que antes era API/HERDADO (pedido do usuário). O servidor
            // aplica a mesma regra (ver saldos.controller.js) — isso só antecipa a cor na hora.
            origens[item.data] = 'MANUAL';
          }
        }
        return { ...conta, saldos, origens };
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
          // 409 = o período liberado mudou desde que a tela carregou (outra aba/pessoa abriu
          // outro dia) — além de recarregar os saldos, a página precisa saber pra corrigir
          // qual dia fica editável agora.
          if (err.response?.status === 409) onPeriodoDessincronizado?.();
          carregarRef.current();
        })
        .finally(() => setPendentes((n) => n - 1));
    },
    [empresaId, aplicarLocal, onPeriodoDessincronizado]
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
          // dia.iso !== dataAberta: coluna fora do período liberado, mesma regra da célula
          // sozinha (input desabilitado) — colar por cima de várias colunas não pode furar isso.
          if (!conta || !dia || Number.isNaN(valor) || dia.iso !== dataAberta) {
            ignorados += 1;
            return;
          }
          itens.push({ company_id: conta.companyId, numero_conta: conta.numeroConta, data: dia.iso, saldo: valor });
        });
      });

      salvar(itens);
      setAviso(
        `${itens.length} valor(es) colado(s)` + (ignorados ? ` · ${ignorados} ignorado(s) (inválido ou fora da grade/do período liberado)` : '')
      );
      setTimeout(() => setAviso(''), 5000);
    },
    [dias, salvar, dataAberta]
  );

  function alternarGrupo(valor) {
    setAbertos((atual) => (atual.includes(valor) ? atual.filter((v) => v !== valor) : [...atual, valor]));
  }

  // ------------------------------------------------------------------ exportar em PDF
  // A página-mãe (botão "Exportar relatório", junto do cadeado) chama isto via ref — os dados
  // de grade já estão todos calculados aqui (grupos/dias/totais), sem precisar recalcular na
  // página. `meta` traz só o que a página sabe e este componente não: rótulo da empresa, dos
  // filtros aplicados e o nome de quem está exportando.
  const exportarPDF = useCallback(
    async (meta) => {
      if (!contas || contas.length === 0) throw new Error('Nenhuma conta encontrada para exportar.');
      // Só entra no relatório quem tem ao menos 1 saldo lançado nesta semana (pedido do
      // usuário) — uma conta sem nenhum valor no período não agrega nada ao PDF. Um grupo que
      // fica sem nenhuma conta depois desse filtro também não aparece.
      const gruposComSaldo = grupos
        .map((grupo) => ({ ...grupo, contas: grupo.contas.filter((c) => Object.keys(c.saldos).length > 0) }))
        .filter((grupo) => grupo.contas.length > 0);
      if (gruposComSaldo.length === 0) throw new Error('Nenhuma conta com saldo lançado nesta semana para exportar.');
      const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      await gerarRelatorioSaldosPdf({
        ...meta,
        geradoEm,
        dias,
        meses,
        grupos: gruposComSaldo,
        totaisPorGrupo,
        totalGeral,
        infoBancos,
        semanaArquivo: `${dataInicio}_a_${dataFim}`,
      });
    },
    [contas, grupos, dias, meses, totaisPorGrupo, totalGeral, infoBancos, dataInicio, dataFim]
  );

  useImperativeHandle(ref, () => ({ exportarPDF }), [exportarPDF]);

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
  // Empresa tem contas, mas nenhuma classificada — distinto de "sem contas": aqui o problema
  // é a classificação, não o cadastro.
  const semClassificadas = !carregando && !erroCarga && contas && contas.length > 0 && grupos.length === 0;

  // Só o indicador de salvamento — pedido do usuário: sem contagens, sem legenda, sem botão
  // de expandir tudo, "pode subir essa tela pra ficar com mais foco na tabela". Some por
  // completo (nem reserva espaço) enquanto não há nada pra mostrar.
  const statusSalvamento = pendentes > 0 ? 'salvando' : erroSalvar ? 'erro' : salvoAlgumaVez ? 'salvo' : null;

  return (
    <div className="rounded-card rounded-tl-none bg-white shadow-card">
      {statusSalvamento && (
        <div className="flex items-center justify-end border-b border-gray-100 px-5 py-2 text-xs" aria-live="polite">
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

      {(erroSalvar || aviso) && (
        <div
          className={`mx-5 mt-4 mb-3 rounded-lg px-3 py-2 text-xs ${erroSalvar ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-700'}`}
          role="status"
        >
          {erroSalvar || aviso}
        </div>
      )}

      {carregando ? (
        <Esqueleto />
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
      ) : semContas ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <Landmark size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma conta bancária encontrada.</p>
          <p className="max-w-sm text-xs text-gray-400">
            Ajuste os filtros ou, se a empresa ainda não tem contas, importe-as em Cadastros → Contas Bancárias.
          </p>
        </div>
      ) : semClassificadas ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <Landmark size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma conta classificada encontrada.</p>
          <p className="max-w-sm text-xs text-gray-400">
            {contas.length} conta(s) sem classificação neste filtro. Classifique-as em Cadastros → Contas
            Bancárias para elas aparecerem aqui.
          </p>
        </div>
      ) : (
        // Nenhum wrapper com overflow-x/overflow-y próprio aqui de propósito (pedido do
        // usuário: "a barra de rolagem deve ser da tela, e não do objeto" — mesmo padrão já
        // usado em GestaoParcelasTab.jsx). Chegamos a testar overflow-x-auto só neste `div`
        // pra resolver um período muito longo desformatando a tela ao rolar — mas isso quebra
        // o `sticky` do cabeçalho/coluna de nomes (que passa a colar relativo a este `div`, e
        // ele nunca rola de verdade na vertical, então o cabeçalho "foge" ao rolar a PÁGINA;
        // é uma limitação real do CSS, não bug de implementação). A solução ficou noutro
        // lugar: a grade agora está travada numa semana (7 dias) só — ver `semana` na página
        // (SaldoContasBancariasPage.jsx) — então a tabela não fica larga o bastante pra
        // precisar rolar na horizontal na prática, e o cabeçalho/rodapé grudam relativo ao
        // <main> do AppShell, que já tem overflow-y-auto (o CSS força overflow-x a virar
        // "auto" também nesse caso, então uma janela bem estreita ainda rola, só que na
        // barra da página mesmo — caso raro o bastante pra não valer a complexidade).
        <div ref={tabelaRef} className="rounded-b-card">
          {/* Só a coluna de nomes tem largura fixa; as de dia dividem o que sobrar — com
              exatamente 7 dias (a grade está travada numa semana, ver comentário acima) elas
              esticam pra preencher o card em vez de deixar uma faixa em branco à direita. */}
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
              <tr style={{ height: ALTURA_DIA }}>
                {dias.map((d) => {
                  const aberto = d.iso === dataAberta;
                  return (
                    <th
                      key={d.iso}
                      id={d.hoje ? 'saldo-coluna-hoje' : undefined}
                      className={`sticky z-20 border-b-2 border-l border-b-gray-300 border-l-gray-200 px-2 py-1 font-medium ${
                        aberto ? 'bg-amber-100' : d.fimDeSemana ? 'bg-gray-50' : 'bg-white'
                      }`}
                      style={{ top: ALTURA_MES }}
                      title={`${d.semana}, ${String(d.dia).padStart(2, '0')}/${String(d.mes + 1).padStart(2, '0')}/${d.ano}${d.hoje ? ' (hoje)' : ''}${aberto ? ' — período aberto pra lançamento' : ''}`}
                    >
                      {/* Uma linha só (dia da semana à esquerda, número à direita) — pedido do
                          usuário, no lugar do layout antigo em 2 linhas empilhadas. O dia
                          liberado pro cadeado não precisa de mais nada além do fundo âmbar da
                          própria célula (marcação "no campo inteiro") — sem ícone extra aqui. */}
                      <span className="flex items-center justify-between gap-1">
                        <span className={`text-[10px] uppercase tracking-wide ${aberto ? 'text-amber-700' : d.fimDeSemana ? 'text-gray-300' : 'text-gray-400'}`}>
                          {d.semana}
                        </span>
                        <span
                          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums ${
                            d.hoje ? 'bg-primary-600 text-white' : aberto ? 'text-amber-800' : d.fimDeSemana ? 'text-gray-400' : 'text-gray-800'
                          }`}
                        >
                          {String(d.dia).padStart(2, '0')}
                        </span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {grupos.map((grupo) => {
                const aberto = abertos.includes(grupo.value);
                const totais = totaisPorGrupo[grupo.value] || {};
                return (
                  <Fragment key={grupo.value}>
                    <tr onClick={() => alternarGrupo(grupo.value)} className="group/grupo cursor-pointer">
                      <td className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 py-2.5 pl-3 pr-2 group-hover/grupo:bg-gray-100">
                        <span className="flex items-center gap-2">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary-100 text-primary-600">
                            {aberto ? <Minus size={10} /> : <Plus size={10} />}
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
                          className={`border-b border-l border-gray-200 px-3 text-right text-xs font-semibold tabular-nums text-gray-900 group-hover/grupo:bg-gray-100 ${
                            d.iso === dataAberta ? 'bg-amber-50' : 'bg-gray-50'
                          }`}
                        >
                          <ValorTotal valor={totais[d.iso]} />
                        </td>
                      ))}
                    </tr>

                    {aberto &&
                      grupo.contas.map((conta) => {
                        return (
                          <tr key={`${conta.company_id}|${conta.numero_conta}`}>
                            {/* pl-9: a logomarca fica alinhada com o ícone da classificação na
                                linha de cima. Só o nome da conta — a empresa não precisa
                                aparecer aqui (existe o filtro Empresa da conta) — e o banco vai
                                no tooltip da logomarca. */}
                            <td className="sticky left-0 z-10 border-b border-r border-gray-100 border-r-gray-200 bg-white py-1.5 pl-9 pr-3">
                              <div className="flex items-center gap-2.5">
                                <LogoBanco codigo={conta.banco_codigo} info={infoBancos?.get(conta.banco_codigo)} />
                                <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800" title={conta.nome || conta.numero_conta}>
                                  {conta.nome || conta.numero_conta}
                                </span>
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
                                  origem={conta.origens?.[d.iso]}
                                  bloqueada={d.iso !== dataAberta}
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
                      d.iso === dataAberta ? 'bg-amber-50' : d.fimDeSemana ? 'bg-gray-50' : 'bg-white'
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
});

SaldosContasTab.displayName = 'SaldosContasTab';

export default SaldosContasTab;
