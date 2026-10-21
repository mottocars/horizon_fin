import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Info, Minimize2, TriangleAlert, Wallet } from 'lucide-react';
import { listDfcMascaras } from '../../../api/dfcMascaras.api';
import { listContas } from '../../../api/planosFinanceirosSienge.api';
import { listTodasClassificacoesPlanoDfc } from '../../../api/dfcPlanoContas.api';
import { getOrcamentoDfc } from '../../../api/dfcOrcamento.api';
import { getRealizadoDfc } from '../../../api/dfcSaldos.api';
import { mesesEntre } from './orcamentoValores';
import { codigoFormatado } from './codigoConta';
import DetalhamentoModal from './DetalhamentoModal';

const LARGURA_PRIMEIRA = 340;
const LARGURA_COLUNA = 104;
const LARGURA_DESVIO = 84;
const LARGURA_TOTAL_FECHADO = 34; // Total recolhido: só a faixa com "TOTAL" na vertical
const FOLGA = 36;
const ALTURA_MINIMA_GRADE = 320;
const ALTURA_CAB_MES = 32; // 1ª linha do cabeçalho (mês/ano) — a 2ª (Realizado/Projetado) gruda logo abaixo
const RECUO = [16, 36, 58, 80]; // máscara 1, entradas/saídas, máscara 2, conta
// Nível entre a máscara 1 e a 2 (pedido do usuário): valor positivo = ENTRADAS, negativo = SAÍDAS.
const LADOS = [
  ['E', 'ENTRADAS'],
  ['S', 'SAÍDAS'],
];
// Sombra na borda das colunas congeladas (nome + Total Realizado/Projetado/Desvio) quando os meses
// rolaram: no corpo é a 4ª célula da linha; no cabeçalho, a 2ª de cima ("Total") e a 3ª de baixo ("Desvio %").
// Total recolhido: a faixa é a 2ª célula do corpo e do 1º cabeçalho.
// (Classes escritas por inteiro: o Tailwind só gera as que aparecem literais no código.)
const SOMBRA_COLUNA_FIXA =
  '[&_tbody_tr>*:nth-child(4)]:shadow-[6px_0_8px_-6px_rgba(16,24,40,0.18)] [&_thead_tr:first-child>*:nth-child(2)]:shadow-[6px_0_8px_-6px_rgba(16,24,40,0.18)] [&_thead_tr:last-child>*:nth-child(3)]:shadow-[6px_0_8px_-6px_rgba(16,24,40,0.18)]';
const SOMBRA_COLUNA_FIXA_FECHADO =
  '[&_tbody_tr>*:nth-child(2)]:shadow-[6px_0_8px_-6px_rgba(16,24,40,0.18)] [&_thead_tr:first-child>*:nth-child(2)]:shadow-[6px_0_8px_-6px_rgba(16,24,40,0.18)]';
const MESES_CAB = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const R = 'R'; // realizado
const P = 'P'; // projetado
const D = 'D'; // desvio % (realizado × projetado)

// Sem casas decimais (pedido do usuário) — o cálculo continua em centavos, só a exibição arredonda.
function dinheiro(v) {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

// Largura (px) do texto no corpo da grade — text-xs semibold. Canvas reaproveitado.
let contextoMedida;
function larguraTexto(texto) {
  if (contextoMedida === undefined) {
    contextoMedida = document.createElement('canvas').getContext('2d');
    if (contextoMedida) contextoMedida.font = `600 12px ${getComputedStyle(document.body).fontFamily}`;
  }
  return contextoMedida ? contextoMedida.measureText(texto).width * 1.08 : texto.length * 7.5;
}

const r2 = (v) => Math.round(v * 100) / 100;

// Desvio % = (Realizado − Projetado) ÷ |Projetado| (pedido do usuário). Pelo sinal do caixa: positivo =
// melhor que o previsto (entrou mais / saiu menos), negativo = pior (entrou menos / saiu mais). Sem
// projetado (ou zero) não há base: null.
function desvioPct(real, proj) {
  if (!proj) return null;
  return ((real || 0) - proj) / Math.abs(proj) * 100;
}
const formatoPct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// 'AAAA-MM' + k meses.
function somarMeses(anoMes, k) {
  const [a, m] = anoMes.split('-').map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

function mesDeHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Operações > DFC Construtoras > DFC: o fluxo de caixa (pedido do usuário).
// Colunas: até o mês atual, cada mês tem REALIZADO, PROJETADO e DESVIO % (ver desvioPct); depois dele, só
// PROJETADO. No mês atual o desvio compara o realizado até hoje com o projetado do mês inteiro.
// Logo depois da primeira coluna, congeladas como na aba Orçamentos (pedido do usuário): TOTAL Realizado
// (soma dos meses com realizado), TOTAL Projetado (soma de todos os meses do período) e Desvio % do total
// — este compara o realizado com o projetado DOS MESMOS MESES (até o atual), não do período inteiro. Nas
// linhas de saldo o total fica vazio — saldo não se soma. O Total é retrátil (pedido do usuário): começa
// sempre recolhido numa faixa com "TOTAL" na vertical; clicar nela abre, clicar no título "Total" fecha.
// - Projetado: a última versão salva do Orçamento (todas as origens).
// - Realizado: o extrato das contas bancárias com "Projeta DFC" (aba Contas Correntes), já achatado
//   por rateio centro × natureza na sincronização (backend dfc-saldos / sie_extrato_contas_rateio).
// Lançamento sem natureza ou em conta sem Máscara DFC (aba Plano Contas) fica de fora do fluxo
// (pedido do usuário — antes ia pra "SEM MÁSCARA DFC").
// Ambos somando os centros do filtro do topo (`centros`; vazio = todos); a máscara de cada natureza é
// a do plano que o centro usa (o próprio ou o Global). Linhas:
// 1) SALDO INICIAL e 4) SALDO FINAL (= inicial + resultado):
//    - meses anteriores ao atual: só no Realizado — o saldo real das contas (abertura do mês / do
//      mês seguinte);
//    - mês atual: nos dois — os dois partem do saldo real de abertura;
//    - meses seguintes: só no Projetado, encadeando o saldo final projetado mês a mês.
// 2) Máscaras de nível 1 › ENTRADAS / SAÍDAS (pelo sinal do valor — no realizado, lançamento a
//    lançamento; no projetado, o valor do orçamento por conta e mês) › nível 2 › conta;
// 3) RESULTADO — entradas − saídas.
// Período = o mesmo da aba Orçamentos (filtros do topo). Visual de demonstrativo, rolagem própria com a
// primeira coluna congelada. `telaCheia` / `onSairTelaCheia`: tela cheia. `refreshToken`: recarrega.
// Também é o Fluxo de Caixa do dashboard Econômico Financeiro (`variante="dashboard"`: quadro solto,
// sem o encaixe de aba, ocupando a altura da tela; `alturaFixa`: altura da grade em px quando há
// conteúdo acima dela).
export default function DfcFluxoTab({
  empresaId,
  inicio,
  fim,
  centros: centrosFiltro = [],
  telaCheia = false,
  onSairTelaCheia,
  refreshToken = 0,
  variante = 'aba',
  alturaFixa = null,
}) {
  const dashboard = variante === 'dashboard';
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [abertos, setAbertos] = useState([]);
  const [realizado, setRealizado] = useState(null);
  const gradeRef = useRef(null);
  const [alturaGrade, setAlturaGrade] = useState(null);
  const [rolouX, setRolouX] = useState(false);
  const [detalhe, setDetalhe] = useState(null); // pedido da janela Detalhamento
  const [totalAberto, setTotalAberto] = useState(false); // Total começa sempre recolhido
  const fecharDetalhe = useCallback(() => setDetalhe(null), []);

  const mesAtual = mesDeHoje();
  const periodoValido = Boolean(inicio && fim && fim >= inicio);
  const meses = useMemo(() => (periodoValido ? mesesEntre(inicio, fim) : []), [inicio, fim, periodoValido]);
  const primeiro = meses[0] || null;
  const ultimo = meses[meses.length - 1] || null;

  // Colunas da grade: { mes, tipo } — R, P e D (desvio %) até o mês atual, só P depois.
  const colunas = useMemo(
    () =>
      meses.flatMap((m) =>
        m <= mesAtual ? [{ mes: m, tipo: R }, { mes: m, tipo: P }, { mes: m, tipo: D }] : [{ mes: m, tipo: P }]
      ),
    [meses, mesAtual]
  );

  const carregar = useCallback(() => {
    if (!empresaId) return;
    setCarregando(true);
    setErro('');
    Promise.all([
      listDfcMascaras(empresaId),
      listContas(empresaId, { page: 1, limit: 2000, search: '' }),
      listTodasClassificacoesPlanoDfc(empresaId),
      getOrcamentoDfc(empresaId),
    ])
      .then(([mascaras, contas, classificacoes, orcamento]) => setDados({ mascaras, contas: contas.data, classificacoes, orcamento }))
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível carregar o fluxo de caixa.'))
      .finally(() => setCarregando(false));
  }, [empresaId]);

  useEffect(() => {
    setDados(null);
    setRealizado(null);
    setAbertos([]);
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar, refreshToken]);

  // Realizado: do 1º mês (ou do atual, se o período começar depois) até o mês atual — sempre traz o
  // saldo real de abertura do mês atual, de onde a projeção parte.
  const deRealizado = primeiro && primeiro < mesAtual ? primeiro : mesAtual;
  useEffect(() => {
    if (!empresaId || !primeiro) return;
    getRealizadoDfc(empresaId, deRealizado, mesAtual)
      .then(setRealizado)
      .catch(() => setRealizado(null));
  }, [empresaId, deRealizado, mesAtual, primeiro, refreshToken]);

  // Árvore máscara 1 › máscara 2 › conta; cada nó com valores por 'AAAA-MM|R' / 'AAAA-MM|P'.
  const { estrutura, porColuna } = useMemo(() => {
    if (!dados) return { estrutura: [], porColuna: {} };
    const filtro = centrosFiltro.length ? new Set(centrosFiltro.map(Number)) : null;
    const mapaDe = (lista) => Object.fromEntries(lista.map((c) => [c.sienge_id, c.mascara_id]));
    const planoGlobal = mapaDe(dados.classificacoes.global);
    const planosCentro = Object.fromEntries(Object.entries(dados.classificacoes.centros).map(([id, l]) => [id, mapaDe(l)]));
    const pai = {}; // máscara 2 -> máscara 1
    dados.mascaras.forEach((g) => g.filhos.forEach((f) => (pai[f.id] = g.id)));
    const contaPorId = Object.fromEntries(dados.contas.map((c) => [c.sienge_id, c]));
    // Projeção do mês atual em diante entra no encadeamento do saldo mesmo fora do período na tela.
    const mesesP = new Set([...meses, ...(ultimo && mesAtual <= ultimo ? mesesEntre(`${mesAtual}-01`, `${ultimo}-01`) : [])]);
    const mesesR = new Set(meses.filter((m) => m <= mesAtual));

    // n1 -> lado (E/S) -> n2 -> conta -> 'mes|tipo' -> valor
    const arvore = new Map();
    // Centros que somam em cada célula de conta (pro Detalhamento): 'n1|lado|n2|conta' -> 'mes|tipo' -> Set.
    const centrosCelula = new Map();
    const lancar = (centroId, natureza, mes, tipo, valor) => {
      if (filtro && !filtro.has(centroId)) return;
      if (!valor) return;
      const lado = valor > 0 ? 'E' : 'S';
      if (natureza === null || natureza === undefined) return;
      const n2 = (planosCentro[centroId] || planoGlobal)[natureza];
      if (!n2 || !pai[n2]) return;
      const n1 = pai[n2];
      const conta = natureza;
      if (!arvore.has(n1)) arvore.set(n1, new Map());
      const lados = arvore.get(n1);
      if (!lados.has(lado)) lados.set(lado, new Map());
      const nivel2 = lados.get(lado);
      if (!nivel2.has(n2)) nivel2.set(n2, new Map());
      const contas = nivel2.get(n2);
      if (!contas.has(conta)) contas.set(conta, {});
      const pc = contas.get(conta);
      const k = `${mes}|${tipo}`;
      pc[k] = r2((pc[k] || 0) + valor);
      const chaveCelula = `${n1}|${lado}|${n2}|${conta}`;
      if (!centrosCelula.has(chaveCelula)) centrosCelula.set(chaveCelula, {});
      const porCol = centrosCelula.get(chaveCelula);
      (porCol[k] = porCol[k] || new Set()).add(centroId ?? null);
    };
    (dados.orcamento?.valores || []).forEach((v) => mesesP.has(v.mes) && lancar(v.centro_id, v.sienge_id, v.mes, P, v.valor));
    (realizado?.valores || []).forEach((v) => mesesR.has(v.mes) && lancar(v.centro_id, v.sienge_id, v.mes, R, v.valor));

    const somar = (listas) => {
      const total = {};
      listas.forEach((pc) => Object.entries(pc).forEach(([k, val]) => (total[k] = r2((total[k] || 0) + val))));
      return total;
    };
    const grupos = [];
    const montarN1 = (id, descricao, filhosOrdem) => {
      const lados = arvore.get(id);
      if (!lados) return;
      const montarLado = (nivel2, lado) =>
        filhosOrdem
        .filter(([fid]) => nivel2.has(fid))
        .map(([fid, fdesc]) => {
          const contas = [...nivel2.get(fid).entries()]
            .map(([cid, pc]) => ({
              conta: contaPorId[cid] || { sienge_id: cid, name: `Natureza ${cid}` },
              porColuna: pc,
              lado,
              centros: centrosCelula.get(`${id}|${lado}|${fid}|${cid}`) || {},
            }))
            .sort((a, b) => String(a.conta.sienge_id).localeCompare(String(b.conta.sienge_id)));
          return { chave: `m${fid}`, descricao: fdesc, contas, porColuna: somar(contas.map((c) => c.porColuna)) };
        });
      const ladosMontados = LADOS.filter(([k]) => lados.has(k)).map(([k, rot]) => {
        const filhos = montarLado(lados.get(k), k);
        return { chave: k, descricao: rot, filhos, porColuna: somar(filhos.map((f) => f.porColuna)) };
      });
      grupos.push({
        chave: `m${id}`,
        descricao,
        lados: ladosMontados,
        porColuna: somar(ladosMontados.map((l) => l.porColuna)),
      });
    };
    dados.mascaras.forEach((g) => montarN1(g.id, g.descricao, g.filhos.map((f) => [f.id, f.descricao])));

    // Resultado e saldos.
    const resultado = somar(grupos.map((g) => g.porColuna));
    const saldoReal = realizado?.saldos || {};
    const saldoInicial = {};
    const saldoFinal = {};
    // Realizado: meses até o atual — saldo real de abertura; final = abertura do mês seguinte (meses
    // fechados) ou abertura + resultado realizado (mês atual, ainda aberto).
    meses
      .filter((m) => m <= mesAtual)
      .forEach((m) => {
        const ini = saldoReal[m] ?? 0;
        saldoInicial[`${m}|${R}`] = ini;
        saldoFinal[`${m}|${R}`] = m < mesAtual ? (saldoReal[somarMeses(m, 1)] ?? r2(ini + (resultado[`${m}|${R}`] || 0))) : r2(ini + (resultado[`${m}|${R}`] || 0));
      });
    // Projetado: do mês atual em diante, partindo do saldo real de abertura do mês atual.
    if (ultimo && mesAtual <= ultimo) {
      let saldo = saldoReal[mesAtual] ?? 0;
      mesesEntre(`${mesAtual}-01`, `${ultimo}-01`).forEach((m) => {
        saldoInicial[`${m}|${P}`] = r2(saldo);
        saldo = r2(saldo + (resultado[`${m}|${P}`] || 0));
        saldoFinal[`${m}|${P}`] = saldo;
      });
    }
    return { estrutura: grupos, porColuna: { resultado, saldoInicial, saldoFinal } };
  }, [dados, realizado, meses, ultimo, mesAtual, centrosFiltro]);

  // Total do período de uma linha: Realizado = meses até o atual; Projetado = todos os meses na tela.
  // `ateAtual`: só os meses até o atual (o Projetado comparável ao Realizado, pro Desvio % do total).
  const total = useCallback(
    (pc, tipo, ateAtual = tipo === R) => {
      let t = 0;
      let tem = false;
      meses.forEach((m) => {
        if (ateAtual && m > mesAtual) return;
        const v = pc[`${m}|${tipo}`];
        if (v) {
          t += v;
          tem = true;
        }
      });
      return tem ? r2(t) : null;
    },
    [meses, mesAtual]
  );

  // Larguras: o bastante pro maior valor de cada coluna.
  const larguras = useMemo(() => {
    const linhas = [porColuna.saldoInicial || {}, porColuna.resultado || {}, porColuna.saldoFinal || {}];
    estrutura.forEach((g) => {
      linhas.push(g.porColuna);
      g.lados.forEach((l) => {
        linhas.push(l.porColuna);
        l.filhos.forEach((f) => {
          linhas.push(f.porColuna);
          f.contas.forEach((c) => linhas.push(c.porColuna));
        });
      });
    });
    const largura = (v) => (v ? larguraTexto(dinheiro(v)) : 0);
    const porColunaMes = colunas.map((c) =>
      c.tipo === D
        ? LARGURA_DESVIO
        : Math.max(LARGURA_COLUNA, Math.ceil(Math.max(0, ...linhas.map((pc) => largura(pc[`${c.mes}|${c.tipo}`])))) + FOLGA)
    );
    // Totais: o saldo não entra (fica vazio no total).
    const semSaldo = linhas.slice(1, 2).concat(linhas.slice(3));
    const larguraTotal = (tipo) => Math.max(LARGURA_COLUNA, Math.ceil(Math.max(0, ...semSaldo.map((pc) => largura(total(pc, tipo))))) + FOLGA);
    return { meses: porColunaMes, totalR: larguraTotal(R), totalP: larguraTotal(P) };
  }, [estrutura, porColuna, colunas, total]);

  // Tela cheia: pede também a do navegador; o Esc dele sai e o `fullscreenchange` fecha a nossa
  // junto. Sem a do navegador, o Esc é tratado aqui.
  useEffect(() => {
    if (!telaCheia) return undefined;
    const doc = document.documentElement;
    if (!document.fullscreenElement && doc.requestFullscreen) doc.requestFullscreen().catch(() => {});
    const aoTrocar = () => {
      if (!document.fullscreenElement) onSairTelaCheia?.();
    };
    const aoTeclar = (e) => {
      if (e.key === 'Escape') onSairTelaCheia?.();
    };
    document.addEventListener('fullscreenchange', aoTrocar);
    window.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('fullscreenchange', aoTrocar);
      window.removeEventListener('keydown', aoTeclar);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telaCheia]);

  // A grade ocupa a altura que sobra na tela (mesma regra do Orçamentos).
  useLayoutEffect(() => {
    const el = gradeRef.current;
    if (!el) return undefined;
    const medir = () => {
      const main = el.closest('main');
      // Em tela cheia o quadro é fixo na janela (não rola com o <main>).
      const topo = el.getBoundingClientRect().top + (main && !telaCheia ? main.scrollTop : 0);
      const folga = telaCheia ? 20 : dashboard ? 20 : 44; // dashboard: só a margem da tela
      const altura = alturaFixa ?? Math.max(ALTURA_MINIMA_GRADE, Math.floor(window.innerHeight - topo - folga));
      setAlturaGrade((atual) => (atual === altura ? atual : altura));
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  });

  function alternar(chave) {
    setAbertos((atual) => (atual.includes(chave) ? atual.filter((v) => v !== chave) : [...atual, chave]));
  }

  if (!empresaId) {
    return (
      <div
        className={`flex min-h-70 flex-col items-center justify-center bg-white text-center shadow-card ${
          dashboard ? 'rounded-2xl' : 'rounded-card rounded-tl-none'
        }`}
      >
        <Wallet size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          {dashboard ? 'Escolha a empresa nos Filtros (botão no canto inferior direito).' : 'Escolha a empresa no filtro acima para ver o fluxo de caixa.'}
        </p>
      </div>
    );
  }

  const versao = dados?.orcamento?.versao || null;
  const MESES_LONGOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const rotulo = (m) => `${MESES_LONGOS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
  // Meses que cada coluna do Total soma: Projetado = o período todo; Realizado e Desvio = até o mês atual.
  const ultimoReal = ultimo && ultimo < mesAtual ? ultimo : mesAtual;
  const intervalo = (de, ate) => (de === ate ? rotulo(de) : `${rotulo(de)} a ${rotulo(ate)}`);
  const periodoTotal = {
    P: primeiro && ultimo ? intervalo(primeiro, ultimo) : '',
    R: primeiro && primeiro <= mesAtual ? intervalo(primeiro, ultimoReal) : '',
  };
  const larguraTotais = totalAberto ? larguras.totalR + larguras.totalP + LARGURA_DESVIO : LARGURA_TOTAL_FECHADO;
  const larguraTabela = LARGURA_PRIMEIRA + larguraTotais + larguras.meses.reduce((t, l) => t + l, 0);
  const esquerdaTotal = { [R]: LARGURA_PRIMEIRA, [P]: LARGURA_PRIMEIRA + larguras.totalR, [D]: LARGURA_PRIMEIRA + larguras.totalR + larguras.totalP };
  const temRealizado = meses.some((m) => m <= mesAtual);
  // Primeira coluna de cada mês ganha a divisória à esquerda (separa os meses).
  const inicioDeMes = (i) => i === 0 || colunas[i - 1].mes !== colunas[i].mes;

  // Estilo de cada tipo de linha (a primeira coluna é congelada, então o fundo é sempre sólido).
  const ESTILO = {
    saldo: { fundo: 'bg-slate-50', texto: 'text-[13px] font-semibold text-slate-900', py: 'py-3', borda: 'border-slate-200' },
    resultado: { fundo: 'bg-white', texto: 'text-[13px] font-semibold text-gray-900', py: 'py-3', borda: 'border-gray-200' },
    n1: { fundo: 'bg-white', texto: 'text-[13px] font-semibold text-gray-900', py: 'py-2.5', borda: 'border-gray-100' },
    lado: { fundo: 'bg-white', texto: 'text-[11px] font-semibold uppercase tracking-wider text-gray-500', py: 'py-2', borda: 'border-gray-100' },
    n2: { fundo: 'bg-white', texto: 'text-xs text-gray-700', py: 'py-2', borda: 'border-gray-100' },
    conta: { fundo: 'bg-white', texto: 'text-xs text-gray-500', py: 'py-1.5', borda: 'border-gray-100' },
  };
  const corValor = (v) => (v < 0 ? 'text-rose-600' : 'text-gray-900');

  // Uma linha da grade. `tipo`: 'saldo' | 'resultado' | 'n1' | 'lado' | 'n2' | 'conta'. `pc`: valores por
  // 'AAAA-MM|R' / 'AAAA-MM|P'.
  // Clique no valor de uma conta (último nível): abre o Detalhamento daquela célula.
  function abrirDetalhe(c, coluna, codigo) {
    const centros = [...(c.centros[`${coluna.mes}|${coluna.tipo}`] || [])].map((id) => (id === null ? 'sem' : id));
    setDetalhe({
      tipo: coluna.tipo,
      mes: coluna.mes,
      lado: c.lado,
      natureza: c.conta.sienge_id,
      centros,
      codigo,
      contaNome: c.conta.name,
    });
  }

  function linha({ chave, tipo, rotulo: texto, sub, pc, nivel = 0, podeAbrir = false, dica, separar = false, onValor }) {
    const aberto = abertos.includes(chave);
    const e = ESTILO[tipo];
    const numeros = tipo === 'saldo' || tipo === 'resultado' || tipo === 'n1' ? 'font-semibold' : tipo === 'conta' ? 'text-gray-600' : '';
    return (
      <tr
        key={chave}
        onClick={() => podeAbrir && alternar(chave)}
        className={`group/linha ${podeAbrir ? 'cursor-pointer' : ''} ${separar ? '[&>td]:border-t [&>td]:border-t-gray-300' : ''}`}
      >
        <td
          className={`sticky left-0 z-10 border-b ${e.borda} ${e.fundo} ${e.py} pr-3 transition-colors ${
            tipo === 'saldo' ? '' : 'group-hover/linha:bg-gray-50'
          }`}
          style={{ paddingLeft: tipo === 'saldo' || tipo === 'resultado' ? 20 : RECUO[nivel] }}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {(tipo === 'n1' || tipo === 'lado' || tipo === 'n2') && (
              <ChevronRight
                size={14}
                className={`shrink-0 transition-transform ${aberto ? 'rotate-90' : ''} ${podeAbrir ? 'text-gray-400' : 'text-gray-200'}`}
              />
            )}
            {sub && <span className="shrink-0 font-mono text-[11px] text-gray-400">{sub}</span>}
            <span className={`min-w-0 truncate ${e.texto}`}>{texto}</span>
            {dica && (
              <span title={dica} className="shrink-0 text-slate-400">
                <Info size={13} />
              </span>
            )}
          </span>
        </td>
        {!totalAberto && (
          <td
            onClick={(ev) => {
              ev.stopPropagation();
              setTotalAberto(true);
            }}
            title="Mostrar o Total (realizado, projetado e desvio)"
            className={`sticky z-10 cursor-pointer border-b border-r border-b-blue-100 border-r-blue-200 bg-blue-50 transition-colors hover:bg-blue-100 ${e.py}`}
            style={{ left: LARGURA_PRIMEIRA }}
          />
        )}
        {totalAberto && [R, P].map((t) => {
          const v = tipo === 'saldo' ? null : total(pc, t);
          return (
            <td
              key={`total|${t}`}
              title={tipo === 'saldo' ? undefined : t === R ? 'Total realizado do período (meses até o atual)' : 'Total projetado do período (todos os meses)'}
              className={`sticky z-10 border-b border-b-blue-100 bg-blue-50 px-3 text-center tabular-nums transition-colors group-hover/linha:bg-blue-100 ${e.py} ${
                tipo === 'saldo' || tipo === 'resultado' ? 'text-[13px]' : 'text-xs'
              } ${numeros} ${v ? corValor(v) : ''}`}
              style={{ left: esquerdaTotal[t] }}
            >
              {v ? dinheiro(v) : ''}
            </td>
          );
        })}
        {totalAberto && (() => {
          // Desvio % do total: realizado × projetado dos mesmos meses (até o atual).
          const real = tipo === 'saldo' ? null : total(pc, R);
          const proj = tipo === 'saldo' ? null : total(pc, P, true);
          const d = desvioPct(real, proj);
          const semNada = !real && !proj;
          return (
            <td
              key={`total|${D}`}
              title={
                semNada
                  ? undefined
                  : d === null
                    ? 'Sem projetado nos meses com realizado — não há base para o desvio.'
                    : `Total realizado ÷ projetado dos mesmos meses (até o atual: ${dinheiro(real || 0)} × ${dinheiro(proj)}). Inclui o mês atual, ainda em andamento.`
              }
              className={`sticky z-10 border-b border-r border-b-blue-100 border-r-blue-200 bg-blue-50 px-2 text-center text-[11px] tabular-nums transition-colors group-hover/linha:bg-blue-100 ${e.py} ${
                tipo === 'saldo' || tipo === 'resultado' || tipo === 'n1' ? 'font-semibold' : ''
              } ${d === null ? 'text-gray-300' : Math.abs(d) < 0.05 ? 'text-gray-500' : d > 0 ? 'text-emerald-600' : 'text-rose-600'}`}
              style={{ left: esquerdaTotal[D] }}
            >
              {semNada || !temRealizado ? '' : d === null ? '—' : formatoPct(d)}
            </td>
          );
        })()}
        {colunas.map((c, i) => {
          if (c.tipo === D) {
            const real = pc[`${c.mes}|${R}`];
            const proj = pc[`${c.mes}|${P}`];
            const d = desvioPct(real, proj);
            const semNada = !real && !proj;
            const parcial = c.mes === mesAtual;
            return (
              <td
                key={`${c.mes}|${D}`}
                title={
                  semNada
                    ? undefined
                    : d === null
                      ? 'Sem projetado no mês — não há base para o desvio.'
                      : `(Realizado − Projetado) ÷ |Projetado|${parcial ? ' — mês em andamento: realizado até hoje × projetado do mês inteiro' : ''}`
                }
                className={`border-b px-2 text-center text-[11px] tabular-nums transition-colors ${e.borda} ${e.fundo} ${e.py} ${
                  tipo === 'saldo' ? '' : 'group-hover/linha:bg-gray-50'
                } ${tipo === 'saldo' || tipo === 'resultado' || tipo === 'n1' ? 'font-semibold' : ''} ${
                  d === null ? 'text-gray-300' : Math.abs(d) < 0.05 ? 'text-gray-500' : d > 0 ? 'text-emerald-600' : 'text-rose-600'
                } ${parcial ? 'italic' : ''}`}
              >
                {semNada ? '' : d === null ? '—' : formatoPct(d)}
              </td>
            );
          }
          const v = pc[`${c.mes}|${c.tipo}`];
          const vazio = v === undefined || v === null || v === 0;
          return (
            <td
              key={`${c.mes}|${c.tipo}`}
              className={`border-b px-3 text-center tabular-nums transition-colors ${e.borda} ${e.fundo} ${e.py} ${
                inicioDeMes(i) ? 'border-l border-l-gray-200' : ''
              } ${tipo === 'saldo' ? '' : 'group-hover/linha:bg-gray-50'} ${
                tipo === 'saldo' || tipo === 'resultado' ? 'text-[13px]' : 'text-xs'
              } ${numeros} ${vazio ? '' : corValor(v)}`}
            >
              {vazio ? (
                ''
              ) : onValor ? (
                <button
                  type="button"
                  onClick={() => onValor(c)}
                  title="Detalhamento"
                  className="-mx-1.5 rounded px-1.5 py-0.5 tabular-nums underline-offset-2 transition-colors hover:bg-primary-50 hover:text-primary-700 hover:underline"
                >
                  {dinheiro(v)}
                </button>
              ) : (
                dinheiro(v)
              )}
            </td>
          );
        })}
      </tr>
    );
  }

  const dicaSaldoInicial =
    'Realizado: saldo real das contas com Projeta DFC (aba Contas Correntes) na abertura do mês, pelo extrato do Sienge. Projetado: a partir do mês atual, parte do saldo real de abertura dele e segue o Saldo Final projetado do mês anterior.';

  return (
    <div
      className={
        telaCheia
          ? 'fixed inset-0 z-40 flex flex-col bg-white p-5'
          : dashboard
            ? 'min-w-0' // dashboard: só a tabela, sem o quadro em volta
            : 'min-w-0 rounded-card rounded-tl-none bg-white p-5 shadow-card'
      }
    >
      {telaCheia && (
        <div className="-mt-1 mb-4 flex items-center gap-3 border-b border-gray-100 pb-3">
          <Wallet size={18} className="shrink-0 text-primary-600" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">Fluxo de caixa</h2>
            {periodoValido && meses.length > 0 && (
              <p className="text-xs text-gray-500">
                {rotulo(meses[0])} a {rotulo(meses[meses.length - 1])}
              </p>
            )}
          </div>
          <span className="ml-auto hidden text-xs text-gray-400 sm:inline">Esc para sair</span>
          <button
            type="button"
            onClick={onSairTelaCheia}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Minimize2 size={15} />
            Sair da tela cheia
          </button>
        </div>
      )}

      {!periodoValido ? (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <TriangleAlert size={15} className="shrink-0" />A Data fim precisa ser igual ou depois da Data início.
        </div>
      ) : carregando && !dados ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : erro ? (
        <div className="flex flex-col items-center gap-2 py-14 text-center">
          <TriangleAlert size={26} className="text-red-400" />
          <p className="text-sm text-gray-600">{erro}</p>
          <button
            type="button"
            onClick={carregar}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <div
          ref={gradeRef}
          onScroll={(e) => setRolouX(e.currentTarget.scrollLeft > 0)}
          className={`overflow-auto overscroll-x-contain rounded-lg border border-gray-200 ${dashboard ? 'bg-white' : ''} ${
            rolouX ? (totalAberto ? SOMBRA_COLUNA_FIXA : SOMBRA_COLUNA_FIXA_FECHADO) : ''
          }`}
          // Com `alturaFixa` a grade cresce com as linhas abertas até essa altura (fechada, ocupa só o que tem).
          style={{ maxHeight: alturaGrade ?? undefined, height: dashboard && alturaFixa === null ? (alturaGrade ?? undefined) : undefined }}
        >
          <table
            className="border-separate border-spacing-0 text-left"
            style={{ tableLayout: 'fixed', width: larguraTabela, minWidth: '100%' }}
          >
            <colgroup>
              <col style={{ width: LARGURA_PRIMEIRA }} />
              {totalAberto ? (
                <>
                  <col style={{ width: larguras.totalR }} />
                  <col style={{ width: larguras.totalP }} />
                  <col style={{ width: LARGURA_DESVIO }} />
                </>
              ) : (
                <col style={{ width: LARGURA_TOTAL_FECHADO }} />
              )}
              {colunas.map((c, i) => (
                <col key={`${c.mes}|${c.tipo}`} style={{ width: larguras.meses[i] }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 top-0 z-30 border-b border-gray-200 bg-white py-3 pl-5 pr-3 align-bottom text-[11px] font-semibold uppercase tracking-wider text-gray-500"
                >
                  Fluxo de caixa
                </th>
                {totalAberto ? (
                  <th
                    colSpan={3}
                    onClick={() => setTotalAberto(false)}
                    title="Recolher o Total"
                    className="sticky top-0 z-30 cursor-pointer border-r border-r-blue-200 bg-blue-100 px-3 pt-2.5 text-center align-bottom text-[11px] font-semibold uppercase tracking-wider text-blue-800 transition-colors hover:bg-blue-200"
                    style={{ left: LARGURA_PRIMEIRA, height: ALTURA_CAB_MES }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <ChevronLeft size={13} className="shrink-0 text-blue-500" />
                      Total
                      {periodoTotal.P && (
                        <span className="ml-1 text-[10px] font-medium normal-case tracking-normal text-blue-600">· {periodoTotal.P}</span>
                      )}
                    </span>
                  </th>
                ) : (
                  <th
                    rowSpan={2}
                    onClick={() => setTotalAberto(true)}
                    title="Mostrar o Total (realizado, projetado e desvio)"
                    className="sticky top-0 z-30 cursor-pointer border-b border-r border-b-blue-200 border-r-blue-200 bg-blue-100 px-0 py-2 text-center align-middle transition-colors hover:bg-blue-200"
                    style={{ left: LARGURA_PRIMEIRA }}
                  >
                    <span className="inline-flex rotate-180 items-center gap-1 text-[11px] font-bold uppercase tracking-[0.2em] text-blue-800 [writing-mode:vertical-rl]">
                      Total
                      <ChevronLeft size={12} className="shrink-0 text-blue-500" />
                    </span>
                  </th>
                )}
                {meses.map((m) => {
                  const atual = m === mesAtual;
                  return (
                    <th
                      key={m}
                      colSpan={m <= mesAtual ? 3 : 1}
                      title={atual ? 'Mês atual' : undefined}
                      className={`sticky top-0 z-20 border-l px-3 pt-2.5 text-center align-bottom ${
                        atual ? 'border-l-gray-200 bg-[#1d5c8a]' : 'border-l-gray-200 bg-white'
                      }`}
                      style={{ height: ALTURA_CAB_MES }}
                    >
                      {/* "SET/2026" numa linha só, com o ano um pouco menor (pedido do usuário). O mês atual em azul
                          forte com a fonte branca, no dashboard e na aba DFC (pedido do usuário). */}
                      <span
                        className={`text-[11px] font-semibold tracking-wider ${atual ? 'text-white' : 'text-gray-600'}`}
                      >
                        {MESES_CAB[Number(m.slice(5, 7)) - 1]}
                        <span
                          className={`text-[10px] font-medium tracking-normal ${atual ? 'text-white/75' : 'text-gray-400'}`}
                        >
                          /{m.slice(0, 4)}
                        </span>
                      </span>
                    </th>
                  );
                })}
              </tr>
              <tr>
                {totalAberto && [R, P, D].map((t) => (
                  <th
                    key={`total|${t}`}
                    title={
                      t === D
                        ? 'Total realizado × projetado DOS MESMOS MESES (até o atual) — não do período inteiro. Positivo (verde) = melhor para o caixa.'
                        : undefined
                    }
                    className={`sticky z-30 border-b border-b-blue-200 bg-blue-100 px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider ${
                      t === R ? 'text-teal-700' : t === P ? 'text-blue-700' : 'border-r border-r-blue-200 text-indigo-500'
                    }`}
                    style={{ top: ALTURA_CAB_MES, left: esquerdaTotal[t] }}
                  >
                    {t === R ? 'Realizado' : t === P ? 'Projetado' : 'Desvio %'}
                    <span className="block text-[9px] font-medium normal-case tracking-normal text-blue-500/90">
                      {(t === P ? periodoTotal.P : periodoTotal.R) || 'sem realizado'}
                    </span>
                  </th>
                ))}
                {colunas.map((c, i) => {
                  const atual = c.mes === mesAtual;
                  return (
                    <th
                      key={`${c.mes}|${c.tipo}`}
                      className={`sticky z-20 border-b px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider ${
                        inicioDeMes(i) ? 'border-l border-l-gray-200' : ''
                      } ${atual ? 'border-b-2 border-b-primary-500 bg-primary-50/60' : 'border-gray-200 bg-white'} ${
                        c.tipo === R ? 'text-teal-700' : c.tipo === D ? 'text-indigo-500' : 'text-gray-400'
                      }`}
                      style={{ top: ALTURA_CAB_MES }}
                      title={
                        c.tipo === D
                          ? '(Realizado − Projetado) ÷ |Projetado|. Positivo (verde) = melhor para o caixa: entrou mais ou saiu menos que o previsto. Negativo (vermelho) = pior.'
                          : undefined
                      }
                    >
                      {c.tipo === R ? 'Realizado' : c.tipo === P ? 'Projetado' : 'Desvio %'}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {linha({
                chave: 'saldo-inicial',
                tipo: 'saldo',
                rotulo: 'Saldo inicial',
                pc: porColuna.saldoInicial || {},
                dica: dicaSaldoInicial,
              })}
              {estrutura.length === 0 && (
                <tr>
                  <td colSpan={colunas.length + (totalAberto ? 4 : 2)} className="border-b border-gray-100 py-10 text-center text-sm text-gray-400">
                    {versao ? 'Nenhum valor no período.' : 'Sem valores projetados — nenhuma versão salva do Orçamento.'}
                  </td>
                </tr>
              )}
              {estrutura.map((n1) => {
                const chaveN1 = n1.chave;
                return (
                  <Fragment key={chaveN1}>
                    {linha({
                      chave: chaveN1,
                      tipo: 'n1',
                      rotulo: n1.descricao,
                      pc: n1.porColuna,
                      podeAbrir: n1.lados.length > 0,
                    })}
                    {abertos.includes(chaveN1) &&
                      n1.lados.map((lado) => {
                        const chaveLado = `${chaveN1}|${lado.chave}`;
                        return (
                          <Fragment key={chaveLado}>
                            {linha({
                              chave: chaveLado,
                              tipo: 'lado',
                              nivel: 1,
                              rotulo: lado.descricao,
                              pc: lado.porColuna,
                              podeAbrir: lado.filhos.length > 0,
                            })}
                            {abertos.includes(chaveLado) &&
                              lado.filhos.map((n2) => {
                                const chaveN2 = `${chaveLado}|${n2.chave}`;
                                return (
                                  <Fragment key={chaveN2}>
                                    {linha({
                                      chave: chaveN2,
                                      tipo: 'n2',
                                      nivel: 2,
                                      rotulo: n2.descricao,
                                      pc: n2.porColuna,
                                      podeAbrir: n2.contas.length > 0,
                                    })}
                                    {abertos.includes(chaveN2) &&
                                      n2.contas.map((c) => {
                                        const codigo = c.conta.mascara_nivel_1 ? codigoFormatado(c.conta) : String(c.conta.sienge_id);
                                        return linha({
                                          chave: `${chaveN2}|${c.conta.sienge_id}`,
                                          tipo: 'conta',
                                          nivel: 3,
                                          sub: codigo,
                                          rotulo: c.conta.name,
                                          pc: c.porColuna,
                                          onValor: (coluna) => abrirDetalhe(c, coluna, codigo),
                                        });
                                      })}
                                  </Fragment>
                                );
                              })}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })}
              {linha({
                chave: 'resultado',
                tipo: 'resultado',
                rotulo: 'Resultado do mês',
                pc: porColuna.resultado || {},
                separar: true,
              })}
              {linha({
                chave: 'saldo-final',
                tipo: 'saldo',
                rotulo: 'Saldo final',
                pc: porColuna.saldoFinal || {},
                dica: 'Saldo Inicial + Resultado — vira o Saldo Inicial do mês seguinte. Meses fechados: o saldo real das contas no início do mês seguinte.',
              })}
            </tbody>
          </table>
        </div>
      )}
      <DetalhamentoModal empresaId={empresaId} pedido={detalhe} onClose={fecharDetalhe} />
    </div>
  );
}
