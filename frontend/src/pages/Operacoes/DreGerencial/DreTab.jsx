import { Fragment, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, BarChart3, CalendarDays, ChevronLeft, Minimize2, TriangleAlert } from 'lucide-react';
import { listDreMascaras } from '../../../api/dreMascaras.api';
import { calcularDre } from '../../../api/dreDemonstrativo.api';
import { projetadoDre } from '../../../api/dreProjecoes.api';

const moeda = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (iso) => iso.split('-').reverse().join('/');
const MESES_CAB = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
// '2026-09' -> 'set/26'.
const rotuloMesCab = (m) => `${MESES_CAB[Number(m.slice(5, 7)) - 1].toLowerCase()}/${m.slice(2, 4)}`;
const fimDoMes = (anoMes) =>
  new Date(Date.UTC(Number(anoMes.slice(0, 4)), Number(anoMes.slice(5, 7)), 0)).toISOString().slice(0, 10);

function mesDeHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Demonstração (nível 1 + nível 2) da DRE, em formato de tabela — mesma mecânica visual de
// SaldosContasTab.jsx (primeira coluna com a hierarquia, valor alinhado à direita), num quadro de
// bordas arredondadas como o do fluxo de caixa do DFC Construtoras. A hierarquia é a árvore cadastrada
// na aba Máscaras (dre_mascaras), na mesma ordem de lá. Valores do período do filtro (de/até) — cálculo
// em dre-demonstrativo/demonstrativo.service.js; linha de nível 2 sem cálculo fica com traço.
// Duas visões:
// - Centros (padrão): CONSOLIDADO (o totalizador = soma dos centros, retrátil como o Total do fluxo do
//   DFC) e um centro de custo por coluna (na ordem da aba Centros Custos), cada um com Valor e AV %
//   (Avaliação Vertical, a partir da linha de nível 1 da aba Configurações).
// - Mês a mês de um centro: o nome do centro no cabeçalho é um botão (acende no hover); clicando, as
//   colunas viram o TOTAL do centro no período e os meses (JAN/2026…, como no DFC), cada mês com Valor e
//   AH % (Avaliação Horizontal: variação sobre o mês anterior — o primeiro mês compara com o mês antes
//   do período, que vem do backend sem aparecer). "Voltar aos centros" volta.
// A primeira coluna (DRE) e a coluna fixa (Consolidado / Total) ficam congeladas quando as outras rolam.
// `telaCheia` / `onSairTelaCheia`: a DRE ocupa a tela inteira (por cima do menu e do topo, e em tela
// cheia de verdade no navegador quando ele deixa), como o fluxo do DFC Construtoras; sai pelo botão
// "Sair da tela cheia" ou com Esc.
// `variante="dashboard"`: sem o quadro em volta (o painel do dashboard Econômico Financeiro já tem o
// dele). `dadosProntos` ({ arvore, resultado }): máscaras e DRE já carregadas por quem embute (o
// dashboard) — aí a aba não busca de novo.
// `colunasSao`: 'centros' (padrão) ou 'anos' — o histórico da aba Projeções usa esta mesma tabela com um
// ano por coluna (dadosProntos com por_centro = os anos); muda só os textos do botão de voltar e da dica.
// Projetado (pedido do usuário): `colunasVisiveis` — as subcolunas de cada coluna, entre 'valor', 'pct'
// (AV % nos centros, AH % no mês a mês), 'proj' (Projetado) e 'desvio' (Desvio %); `projecao` — de onde
// vem o projetado ({ fonte: 'atual' | 'versao', versao }, null = sem projetado; ver projetadoDre);
// `onProjecaoInfo(r)`: devolve as versões disponíveis (pro seletor da página). Projetado de cada centro =
// a DRE do orçamento mês a mês no período (até o mês de corte é o realizado da data do orçamento — em
// cinza no mês a mês; depois, o projetado — amarelo pastel). Desvio % = (Valor − Projetado) ÷ |Projetado|
// com o projetado só dos meses até o atual (o realizado nunca passa de hoje) — a regra do DFC.
export default function DreTab({
  empresaId,
  de,
  ate,
  centros = [],
  telaCheia = false,
  onSairTelaCheia,
  variante = 'aba',
  dadosProntos = null,
  colunasSao = 'centros',
  colunasVisiveis = ['valor', 'pct'],
  projecao = null,
  onProjecaoInfo,
  ocultarSemProjecao = false,
}) {
  const [arvore, setArvore] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState('');
  // Coluna fixa retrátil, como o Total do fluxo do DFC: clicar no título recolhe numa faixa com o nome
  // na vertical; clicar na faixa abre. Começa aberta (é o totalizador da DRE).
  const [fixaAberta, setFixaAberta] = useState(true);
  const [mensal, setMensal] = useState(null); // centro na visão mês a mês
  const chaveCentros = centros.join(',');
  const mesAtual = mesDeHoje();

  const carregar = useCallback(() => {
    if (!empresaId) {
      setArvore([]);
      return;
    }
    if (dadosProntos) {
      setArvore(dadosProntos.arvore);
      return;
    }
    setCarregando(true);
    listDreMascaras(empresaId)
      .then(setArvore)
      .finally(() => setCarregando(false));
  }, [empresaId, dadosProntos]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    setErro('');
    if (!empresaId) {
      setResultado(null);
      return undefined;
    }
    if (de > ate) {
      setErro('A data início não pode ser depois da data fim.');
      return undefined;
    }
    if (dadosProntos) {
      setResultado(dadosProntos.resultado);
      return undefined;
    }
    let ativo = true;
    setCalculando(true);
    calcularDre(empresaId, { de, ate, centros: chaveCentros ? chaveCentros.split(',') : [] })
      .then((r) => ativo && setResultado(r))
      .catch((e) => ativo && setErro(e.response?.data?.message || 'Não foi possível calcular a DRE.'))
      .finally(() => ativo && setCalculando(false));
    return () => {
      ativo = false;
    };
  }, [empresaId, de, ate, chaveCentros, dadosProntos]);

  // Outra empresa: volta pra visão dos centros.
  useEffect(() => {
    setMensal(null);
  }, [empresaId]);

  // Projetado: só quando alguma coluna de projeção está visível.
  const [projDados, setProjDados] = useState(null);
  const querProj = Boolean(projecao) && (colunasVisiveis.includes('proj') || colunasVisiveis.includes('desvio'));
  const chaveProj = querProj ? `${projecao.fonte}|${projecao.versao || ''}` : '';
  useEffect(() => {
    if (!chaveProj || !empresaId || de > ate) {
      setProjDados(null);
      return undefined;
    }
    let ativo = true;
    const [fonte, versao] = chaveProj.split('|');
    projetadoDre(empresaId, { fonte, versao: versao || null, de, ate, centros: chaveCentros ? chaveCentros.split(',') : [] })
      .then((r) => {
        if (!ativo) return;
        setProjDados(r);
        onProjecaoInfo?.(r);
      })
      .catch((e) => ativo && setErro(e.response?.data?.message || 'Não foi possível buscar o projetado.'));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, de, ate, chaveCentros, chaveProj]);

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

  if (!empresaId) {
    return (
      <div className="flex min-h-70 flex-col items-center justify-center rounded-card rounded-tl-none bg-white text-center shadow-card">
        <BarChart3 size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para ver a DRE.
        </p>
      </div>
    );
  }

  const semMascaraPoc = resultado && !resultado.poc_receita.mascara;
  // Centro da visão mês a mês (se o filtro tirou o centro, volta pros centros).
  const centroMensal = mensal !== null ? (resultado?.por_centro || []).find((c) => c.id === mensal) : null;

  // Mês a mês: só do primeiro ao último mês com algum valor (pedido do usuário — um período desde 2000
  // de uma obra que começou em 2024 não mostra anos de colunas zeradas); os meses vazios do meio ficam.
  // O AH % do primeiro mês mostrado compara com o mês antes dele (o último cortado, ou o mês antes do
  // período).
  // Projetado de cada centro (o do orçamento, mês a mês) somado num filtro de meses dentro do período.
  const idsN2 = arvore.flatMap((g) => g.filhos.map((f) => f.id));
  const mesDe = (de || '').slice(0, 7);
  const mesAte = (ate || '').slice(0, 7);
  const projCentro = (id) => (querProj ? projDados?.centros?.[id] || null : null);
  const somaProj = (pc, filtro) => {
    if (!pc) return null;
    const out = Object.fromEntries(idsN2.map((id) => [id, 0]));
    pc.meses.forEach((m, i) => {
      if (m < mesDe || m > mesAte || !filtro(m)) return;
      idsN2.forEach((id) => {
        const v = pc.valores[id]?.[i];
        if (v) out[id] += v;
      });
    });
    return out;
  };
  const somarMapas = (mapas) => {
    const lista = mapas.filter(Boolean);
    if (!lista.length) return null;
    return Object.fromEntries(idsN2.map((id) => [id, lista.reduce((t, m) => t + (m[id] || 0), 0)]));
  };
  const projDoMes = (pc, mes) => {
    const i = pc ? pc.meses.indexOf(mes) : -1;
    return i < 0 ? null : Object.fromEntries(idsN2.map((id) => [id, pc.valores[id]?.[i] ?? 0]));
  };
  const projMensal = centroMensal ? projCentro(centroMensal.id) : null;

  const mensalAparado = (() => {
    if (!centroMensal) return null;
    // Com o projetado visível, mês com projeção também conta (os meses futuros aparecem).
    const temValor = (m) =>
      Object.values(m.valores || {}).some((v) => v !== null && v !== undefined && Math.abs(v) >= 0.005) ||
      Object.values(projDoMes(projMensal, m.mes) || {}).some((v) => Math.abs(v) >= 0.005);
    const i = centroMensal.meses.findIndex(temValor);
    if (i < 0) return { meses: [], anterior: centroMensal.mes_anterior };
    let j = centroMensal.meses.length - 1;
    while (j > i && !temValor(centroMensal.meses[j])) j -= 1;
    return { meses: centroMensal.meses.slice(i, j + 1), anterior: i > 0 ? centroMensal.meses[i - 1] : centroMensal.mes_anterior };
  })();

  // Colunas de valor. `segunda`: a coluna ao lado do valor — 'av' (AV %), 'ah' (AH %) ou nenhuma.
  // `projetado`: o do período (ou do mês); `comparavel`: só dos meses até o atual — a base do Desvio %;
  // `cinza`: mês até o corte do orçamento (o projetado é o realizado da data do orçamento).
  const ateAtual = (m) => m <= mesAtual;
  const colunas = centroMensal
    ? [
        {
          chave: 'total',
          nome: 'Total',
          valores: centroMensal.valores,
          segunda: null,
          projetado: somaProj(projMensal, () => true),
          comparavel: somaProj(projMensal, ateAtual),
        },
        ...mensalAparado.meses.map((m) => {
          const p = projDoMes(projMensal, m.mes);
          return {
            chave: m.mes,
            mes: m.mes,
            de: m.de,
            ate: m.ate,
            // Mês depois do atual não tem realizado (a DRE não tem futuro): traço, não zero — e, com o
            // projetado visível, só a coluna Projetado (`futuro`; ver subsDe).
            valores: m.mes > mesAtual ? {} : m.valores,
            futuro: m.mes > mesAtual,
            segunda: 'ah',
            projetado: p,
            comparavel: p && ateAtual(m.mes) ? p : null,
            cinza: Boolean(p && projMensal.trava && m.mes <= projMensal.trava),
          };
        }),
      ]
    : (() => {
        const porCentro = (resultado?.por_centro || []).map((c) => {
          const pc = projCentro(c.id);
          return { chave: c.id, nome: c.nome, valores: c.valores, segunda: 'av', projetado: somaProj(pc, () => true), comparavel: somaProj(pc, ateAtual) };
        });
        return [
          {
            chave: 'consolidado',
            nome: 'Consolidado',
            valores: resultado?.valores || {},
            segunda: 'av',
            projetado: somarMapas(porCentro.map((c) => c.projetado)),
            comparavel: somarMapas(porCentro.map((c) => c.comparavel)),
            // O Desvio do consolidado compara só o realizado dos centros COM projeção (o Valor segue o de
            // todos): senão um centro sem orçamento entra no realizado e não no projetado.
            valoresDesvio: somarMapas(porCentro.filter((c) => c.projetado).map((c) => c.valores)),
          },
          ...porCentro,
        ];
      })();
  const fixa = colunas[0];
  // Visão mês a mês: o mês antes do período entra só no cálculo (coluna `oculta`), pra AH % do primeiro.
  const colunasCalc = centroMensal
    ? [...colunas, { chave: 'anterior', valores: mensalAparado.anterior.valores, oculta: true }]
    : colunas;
  const linhas = comAcumulado(arvore, colunasCalc);
  const linhasProj = comAcumulado(arvore, colunasCalc.map((c) => ({ valores: c.projetado || {} })));
  const linhasComp = comAcumulado(arvore, colunasCalc.map((c) => ({ valores: c.comparavel || {} })));
  const linhasDesv = comAcumulado(arvore, colunasCalc.map((c) => ({ valores: c.valoresDesvio || c.valores || {} })));
  // Quantos centros do consolidado têm projeção (a legenda avisa quando não são todos).
  const centrosComProj = !centroMensal ? colunas.slice(1).filter((c) => c.projetado).length : 0;
  const centrosTotal = !centroMensal ? colunas.length - 1 : 0;

  // Subcolunas visíveis (na ordem Valor, AV/AH %, Projetado, Desvio %): o % só nas colunas que têm (o
  // Total do mês a mês não tem AH %). Nenhuma marcada = só o Valor.
  // `ocultarSemProjecao` (dashboard): sem nenhum orçamento salvo, as colunas de projeção somem.
  const semProjecaoAgora = querProj && projDados && !Object.keys(projDados.centros || {}).length;
  const mostraProj = querProj && !(ocultarSemProjecao && (semProjecaoAgora || !projDados));
  const subsVisiveis = (() => {
    const s = ['valor', 'pct', 'proj', 'desvio'].filter((k) => colunasVisiveis.includes(k) && ((k !== 'proj' && k !== 'desvio') || mostraProj));
    return s.length ? s : ['valor'];
  })();
  const subsDe = (c) => {
    // Mês futuro (mês a mês): sem realizado, AH % e desvio — só o Projetado (pedido do usuário).
    if (c.futuro && subsVisiveis.includes('proj')) return ['proj'];
    const s = subsVisiveis.filter((k) => k !== 'pct' || c.segunda);
    return s.length ? s : ['valor'];
  };
  const posFixa = posicoesFixa(subsDe(colunas[0]));
  const rotuloSub = (c, k) => (k === 'pct' ? (c.segunda === 'ah' ? 'AH %' : 'AV %') : ROTULO_SUB[k]);
  // AV % (visão dos centros): a linha de nível 1 da aba Configurações vale 100% em cada coluna; ela e as
  // de baixo mostram o percentual dela (as de cima ficam vazias). Sem a linha configurada, traço.
  const av = resultado?.avaliacao_vertical || null;
  const indiceBase = av ? arvore.findIndex((g) => g.id === av.mascara_id) : -1;
  const bases = colunasCalc.map((c, i) => {
    if (indiceBase < 0) return null;
    const g = arvore[indiceBase];
    return g.totalizadora ? linhas[indiceBase].acumulados[i] : totalDoGrupo(g, c.valores);
  });
  const semAv = resultado && !centroMensal && indiceBase < 0;
  const tituloSegunda = (c) =>
    c.segunda === 'ah'
      ? 'Avaliação Horizontal: variação sobre o mês anterior — (mês − mês anterior) ÷ |mês anterior|'
      : av
        ? `Avaliação Vertical: percentual de ${av.descricao}`
        : 'Avaliação Vertical não configurada';
  const tituloSub = (c, k) => {
    if (k === 'pct') return tituloSegunda(c);
    if (k === 'proj')
      return c.cinza
        ? 'Realizado na data do orçamento (mês até o corte)'
        : c.mes
          ? 'Projetado do mês'
          : 'Projetado do período inteiro do filtro';
    if (k === 'desvio')
      return `(Valor − Projetado) ÷ |Projetado|, com o projetado só dos meses até o atual. Positivo (verde) = melhor que o projetado; dentro de ±${TOLERANCIA_DESVIO}% fica neutro.`;
    return undefined;
  };
  const rotuloFonte = projDados
    ? projDados.fonte === 'versao'
      ? `versão ${projDados.versao?.numero ?? '—'}`
      : `rascunhos atuais${projDados.versao ? ` (sem rascunho: versão ${projDados.versao.numero})` : ''}`
    : '';
  const semProjecao = querProj && projDados && !Object.keys(projDados.centros || {}).length;

  function abrirMensal(id) {
    setMensal(id);
    setFixaAberta(true);
  }

  return (
    <div
      className={
        telaCheia
          ? 'fixed inset-0 z-40 flex flex-col overflow-y-auto bg-white p-5'
          : variante === 'dashboard'
            ? 'min-w-0'
            : 'rounded-card rounded-tl-none bg-white p-5 shadow-card'
      }
    >
      {telaCheia && (
        <div className="-mt-1 mb-2 flex items-center gap-3 border-b border-gray-100 pb-3">
          <BarChart3 size={18} className="shrink-0 text-primary-600" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">DRE{centroMensal ? ` · ${centroMensal.nome} mês a mês` : ''}</h2>
            <p className="text-xs text-gray-500">
              {dataBr(de)} a {dataBr(ate)}
              {!centroMensal && centros.length > 0 && ` · ${centros.length} ${centros.length === 1 ? 'centro' : 'centros'} de custo`}
            </p>
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
      {(erro || semMascaraPoc || semAv) && (
        <div className="mb-4 space-y-2">
          {erro && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              <TriangleAlert size={15} className="shrink-0" /> {erro}
            </div>
          )}
          {semMascaraPoc && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle size={14} className="shrink-0" />
              POC de Receita não gerada: escolha a Máscara DRE Nível 2 na aba Configurações.
            </div>
          )}
          {semAv && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle size={14} className="shrink-0" />
              Avaliação Vertical não configurada: escolha a linha de nível 1 que vale 100% na aba Configurações.
            </div>
          )}
        </div>
      )}
      {centroMensal && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setMensal(null)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft size={14} />
            {colunasSao === 'anos' ? 'Voltar aos anos' : 'Voltar aos centros'}
          </button>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <CalendarDays size={15} className="text-primary-600" />
            {centroMensal.nome}
            <span className="font-normal text-gray-500">· mês a mês</span>
          </span>
          <span className="text-xs text-gray-400">AH % = variação de cada mês sobre o mês anterior</span>
        </div>
      )}
      {querProj && mostraProj && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
          {!projDados ? (
            <span className="text-gray-400">Buscando o projetado…</span>
          ) : semProjecao ? (
            <span className="text-amber-700">
              Sem projeção {projDados.fonte === 'versao' ? 'salva em versão' : 'nos rascunhos nem na última versão'} para os centros do filtro.
            </span>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm border border-amber-200 bg-[#fdf6d3]" /> Projetado · {rotuloFonte}
              </span>
              {centroMensal && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm border border-gray-200 bg-gray-100" />
                  Realizado na data do orçamento (até o corte{projMensal?.trava ? ` ${rotuloMesCab(projMensal.trava)}` : ''})
                </span>
              )}
              <span>Desvio % até o mês atual · ±{TOLERANCIA_DESVIO}% neutro</span>
              {!centroMensal && centrosComProj > 0 && centrosComProj < centrosTotal && (
                <span className="text-amber-700">
                  Consolidado: Projetado e Desvio só dos {centrosComProj} de {centrosTotal} centros com projeção
                </span>
              )}
              {projDados.avisos?.map((a) => (
                <span key={a} className="text-amber-700">
                  {a}
                </span>
              ))}
            </>
          )}
        </div>
      )}
      {carregando ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : arvore.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <BarChart3 size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma máscara da DRE cadastrada ainda.</p>
          <p className="max-w-sm text-xs text-gray-400">Monte a estrutura da DRE (nível 1 e nível 2) na aba Máscaras.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full border-separate border-spacing-0 text-left text-xs">
            <thead>
              {/* Cabeçalhos centralizados: o nome da coluna (Consolidado / centro / mês) em cima, Valor e
                  AV % / AH % embaixo. */}
              <tr className="text-xs uppercase tracking-wide text-gray-700">
                <th
                  rowSpan={2}
                  className={`${COL_DESCRICAO} border-b border-gray-200 bg-white py-1.5 pl-4 align-bottom font-semibold`}
                >
                  DRE
                </th>
                {fixaAberta ? (
                  <th
                    colSpan={subsDe(fixa).length}
                    onClick={() => setFixaAberta(false)}
                    title={`Recolher o ${fixa.nome}`}
                    className="sticky left-[380px] z-10 cursor-pointer border-b border-r border-b-blue-200 border-r-blue-200 bg-blue-100 px-3 pb-1 pt-1.5 text-center align-bottom font-semibold text-blue-800 transition-colors hover:bg-blue-200"
                  >
                    <span className="inline-flex items-center gap-1">
                      <ChevronLeft size={13} className="shrink-0 text-blue-500" />
                      {fixa.nome}
                    </span>
                  </th>
                ) : (
                  <th
                    rowSpan={2}
                    onClick={() => setFixaAberta(true)}
                    title={`Mostrar o ${fixa.nome}`}
                    className={`${COL_FAIXA} z-20 cursor-pointer border-b border-b-blue-200 bg-blue-100 px-0 py-2 text-center align-bottom transition-colors hover:bg-blue-200`}
                  >
                    {/* Só a seta no cabeçalho (que fica na altura normal); a palavra, na vertical, desce
                        pela faixa por cima das linhas — é do cabeçalho, então não recebe o clique. */}
                    <ChevronLeft size={12} className="mx-auto rotate-180 text-blue-500" />
                    <span className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 rotate-180 whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.2em] text-blue-800 [writing-mode:vertical-rl]">
                      {fixa.nome}
                    </span>
                  </th>
                )}
                {colunas.slice(1).map((c) =>
                  c.mes ? (
                    <CabecalhoMes key={c.chave} coluna={c} atual={c.mes === mesAtual} colSpan={subsDe(c).length} />
                  ) : (
                    // A célula inteira do centro é o botão do mês a mês: o fundo todo acende no hover.
                    <th
                      key={c.chave}
                      colSpan={subsDe(c).length}
                      onClick={() => abrirMensal(c.chave)}
                      className="group/centro cursor-pointer border-b border-l border-gray-200 bg-white p-0 text-center align-bottom font-semibold transition-colors hover:bg-primary-600"
                    >
                      <button
                        type="button"
                        title={colunasSao === 'anos' ? `${c.nome} · ver mês a mês` : `${c.chave} - ${c.nome} · ver mês a mês`}
                        className="flex w-full items-center justify-center gap-1 px-3 pb-1 pt-1.5 uppercase tracking-wide text-gray-700 transition-colors group-hover/centro:text-white"
                      >
                        <span className="line-clamp-2 whitespace-normal leading-tight">{c.nome}</span>
                        <CalendarDays size={12} className="shrink-0 text-gray-300 transition-colors group-hover/centro:text-white" />
                      </button>
                    </th>
                  )
                )}
              </tr>
              <tr className="text-[10px] uppercase tracking-wide text-gray-500">
                {fixaAberta &&
                  subsDe(fixa).map((k, idx, lista) => (
                    <th
                      key={k}
                      style={estiloLargura(LARGURA_SUB[k], posFixa[k])}
                      title={tituloSub(fixa, k)}
                      className={`sticky z-10 border-b border-b-blue-200 py-1 text-center font-medium ${
                        idx === lista.length - 1 ? 'border-r border-r-blue-200' : ''
                      } ${k === 'proj' ? 'bg-[#fdf6d3] text-amber-800' : 'bg-blue-100 text-blue-700'}`}
                    >
                      {rotuloSub(fixa, k)}
                    </th>
                  ))}
                {colunas.slice(1).map((c) => (
                  <Fragment key={c.chave}>
                    {subsDe(c).map((k, idx) => (
                      <th
                        key={k}
                        style={estiloLargura(LARGURA_SUB_MOVEL[k])}
                        title={tituloSub(c, k)}
                        className={`border-b border-gray-200 py-1 text-center font-semibold ${idx === 0 ? 'border-l' : ''} ${
                          k === 'proj' ? (c.cinza ? 'bg-gray-100 text-gray-500' : 'bg-[#fdf6d3] text-amber-800') : c.mes === mesAtual ? 'bg-[#f5f9ff]' : 'bg-white'
                        }`}
                      >
                        {rotuloSub(c, k)}
                      </th>
                    ))}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody className={calculando ? 'opacity-50 transition-opacity' : ''}>
              {linhas.map(({ grupo, acumulados }, i) => (
                <LinhaGrupo
                  key={grupo.id}
                  grupo={grupo}
                  colunas={colunasCalc}
                  acumulados={
                    acumulados
                      ? {
                          valores: acumulados,
                          projetado: linhasProj[i].acumulados,
                          comparavel: linhasComp[i].acumulados,
                          valoresDesvio: linhasDesv[i].acumulados,
                        }
                      : null
                  }
                  bases={indiceBase >= 0 && i >= indiceBase ? bases : null}
                  recolhido={!fixaAberta}
                  onAbrir={() => setFixaAberta(true)}
                  subsDe={subsDe}
                  posFixa={posFixa}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// "OUT/2026" numa linha só, com o ano um pouco menor; o mês atual em azul forte, como no fluxo do DFC.
// Mês parcial (o primeiro e o último do período) mostra as datas ao passar o mouse.
function CabecalhoMes({ coluna, atual, colSpan = 2 }) {
  const parcial = coluna.de.slice(8) !== '01' || coluna.ate !== fimDoMes(coluna.mes);
  return (
    <th
      colSpan={colSpan}
      title={parcial ? `${dataBr(coluna.de)} a ${dataBr(coluna.ate)}` : undefined}
      className={`border-b border-l px-3 pb-1 pt-1.5 text-center align-bottom ${
        atual ? 'border-b-[#1d5c8a] border-l-gray-200 bg-[#1d5c8a]' : 'border-gray-200 bg-white'
      }`}
    >
      <span className={`text-[11px] font-semibold tracking-wider ${atual ? 'text-white' : 'text-gray-700'}`}>
        {MESES_CAB[Number(coluna.mes.slice(5, 7)) - 1]}
        <span className={`text-[10px] font-medium tracking-normal ${atual ? 'text-white/75' : 'text-gray-400'}`}>
          /{coluna.mes.slice(0, 4)}
        </span>
      </span>
    </th>
  );
}

// Totaliza = soma de todas as linhas de nível 2 acima dela na DRE (Receita Líquida = Receita Bruta +
// impostos…), só quando todas já têm valor; senão, traço. Uma por coluna.
function comAcumulado(arvore, colunas) {
  const soma = colunas.map(() => 0);
  const completo = colunas.map(() => true);
  return arvore.map((grupo) => {
    if (grupo.totalizadora) return { grupo, acumulados: colunas.map((_, i) => (completo[i] ? soma[i] : null)) };
    colunas.forEach((c, i) => {
      grupo.filhos.forEach((f) => {
        const v = c.valores[f.id];
        if (v === null || v === undefined) completo[i] = false;
        else soma[i] += v;
      });
    });
    return { grupo, acumulados: null };
  });
}

// Linha de nível 1 = soma das de nível 2, só quando todas já têm valor.
function totalDoGrupo(grupo, valores) {
  const doGrupo = grupo.filhos.map((f) => valores[f.id]);
  return doGrupo.length && doGrupo.every((v) => v !== null && v !== undefined) ? doGrupo.reduce((t, v) => t + v, 0) : null;
}

// Larguras fixas: a descrição e a coluna fixa (Consolidado / Total) ficam congeladas à esquerda quando
// as outras rolam. A coluna fixa tem até quatro subcolunas (Valor, AV % / AH %, Projetado, Desvio %), cada
// uma congelada no `left` = 380 + a soma das larguras das que vêm antes (`posicoesFixa`).
const COL_DESCRICAO = 'sticky left-0 z-10 w-[380px] min-w-[380px] max-w-[380px]';
const LARGURA_DESCRICAO = 380;
const LARGURA_SUB = { valor: 144, pct: 80, proj: 144, desvio: 80 };
const LARGURA_SUB_MOVEL = { valor: 128, pct: 80, proj: 128, desvio: 80 };
const ROTULO_SUB = { valor: 'Valor', proj: 'Projetado', desvio: 'Desvio %' };
// Coluna fixa recolhida: só a faixa (como o Total recolhido do fluxo do DFC). Sem z-index aqui: o
// cabeçalho fica acima (z-20) pra palavra vertical passar por cima das células.
const COL_FAIXA = 'sticky left-[380px] w-7 min-w-7 max-w-7 border-r border-r-blue-200';

// `left` de cada subcoluna da coluna fixa e a largura total.
function posicoesFixa(subs) {
  let left = LARGURA_DESCRICAO;
  const pos = {};
  subs.forEach((k) => {
    pos[k] = left;
    left += LARGURA_SUB[k];
  });
  return pos;
}
const estiloLargura = (w, left) => ({ width: w, minWidth: w, maxWidth: w, ...(left !== undefined ? { left } : {}) });

// AV % = valor ÷ |base| (o sinal do valor fica: despesa sai negativa). Sem base (ou zero), traço.
const pctAv = (v, base) => (v === null || v === undefined || !base ? null : (v / Math.abs(base)) * 100);
// AH % = (mês − mês anterior) ÷ |mês anterior|: positivo = melhor pro resultado (entrou mais / saiu
// menos), negativo = pior — mesmo critério do Desvio % do fluxo do DFC. Sem mês anterior (ou zero), traço.
const pctAh = (v, anterior) =>
  v === null || v === undefined || anterior === null || anterior === undefined || !anterior ? null : ((v - anterior) / Math.abs(anterior)) * 100;
// Desvio % = (Realizado − Projetado) ÷ |Projetado| — a fórmula do Desvio % do fluxo do DFC: positivo =
// melhor pro resultado (receita maior / despesa menor), negativo = pior. Sem projetado (ou zero), traço.
const pctDesvio = (real, proj) => (proj === null || proj === undefined || !proj ? null : (((real || 0) - proj) / Math.abs(proj)) * 100);
// Tolerância do desvio: dentro dela (em módulo) fica neutro; fora, verde (melhor) ou vermelho (pior).
const TOLERANCIA_DESVIO = 10;
// Abaixo de 0,005% vira 0 (senão aparecia "-0,00%").
const formatoPct = (p, comSinal) => {
  const x = Math.abs(p) < 0.005 ? 0 : p;
  return `${comSinal && x > 0 ? '+' : ''}${x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

// Fundo e bordas de cada célula, por tipo de linha e coluna (fixa ou não). As da coluna fixa são
// congeladas, então o fundo é sempre sólido.
function estilo(tipo, fixa) {
  if (tipo === 'totalizadora')
    return { fundo: fixa ? 'bg-[#174a70]' : 'bg-[#1d5c8a]', borda: 'border-b-[#1d5c8a]', divisa: 'border-l-white/10' };
  if (tipo === 'n1')
    return fixa
      ? { fundo: 'bg-blue-100', borda: 'border-b-blue-200', divisa: '' }
      : { fundo: 'bg-gray-50', borda: 'border-b-gray-200', divisa: 'border-l-gray-200' };
  return fixa
    ? { fundo: 'bg-blue-50 group-hover:bg-blue-100', borda: 'border-b-blue-100', divisa: '' }
    : { fundo: 'group-hover:bg-gray-50', borda: 'border-b-gray-100', divisa: 'border-l-gray-100' };
}

// Fundo da célula Projetada: amarelo pastel; nos meses até o corte (o "projetado" é o realizado da data
// do orçamento), cinza. Nas totalizadoras (fundo escuro) só um tom do próprio azul.
function fundoProjetado(tipo, cinza) {
  if (tipo === 'totalizadora') return cinza ? 'bg-[#2b5f82]' : 'bg-[#26658f]';
  if (cinza) return tipo === 'n1' ? 'bg-gray-100' : 'bg-gray-50';
  return tipo === 'n1' ? 'bg-[#fdf6d3]' : 'bg-[#fefbe8]';
}

// Cor do AV % (sinal do valor) e do AH % / Desvio % (verde = melhor, vermelho = pior), clara nas
// totalizadoras. O Desvio % dentro da tolerância fica neutro.
function corPct(tipo, segunda, p) {
  const total = tipo === 'totalizadora';
  if (p === null || p === undefined || Math.abs(p) < 0.005) return total ? 'text-white/80' : 'text-gray-500';
  if (segunda === 'desvio' && Math.abs(p) < TOLERANCIA_DESVIO) return total ? 'text-white/80' : 'text-gray-500';
  if (segunda === 'ah' || segunda === 'desvio')
    return p > 0 ? (total ? 'text-emerald-300' : 'text-emerald-600') : total ? 'text-red-300' : 'text-red-500';
  return p < 0 ? (total ? 'text-red-300' : 'text-red-500') : total ? 'text-white/80' : 'text-gray-500';
}

// As células de uma coluna numa linha, nas subcolunas `subs` (valor, pct = AV % / AH %, proj, desvio):
// `valor`, `pct` (número; null = traço; undefined = vazio), `proj` (projetado; undefined = sem projeção),
// `desvio` e `cinza` (projetado que é o realizado da data do orçamento). Coluna fixa recolhida
// (`recolhido`): uma faixa só, que abre ao clicar (`onAbrir`). `posFixa`: o left de cada subcoluna fixa.
function Celulas({ tipo, fixa, subs, segunda, valor, pct, proj, desvio, cinza, recolhido, onAbrir, posFixa }) {
  const e = estilo(tipo, fixa);
  if (fixa && recolhido) {
    return (
      <td
        onClick={onAbrir}
        title="Mostrar a coluna"
        className={`${COL_FAIXA} z-10 cursor-pointer border-b ${e.borda} ${
          tipo === 'totalizadora' ? 'bg-[#174a70]' : tipo === 'n1' ? 'bg-blue-100 hover:bg-blue-200' : 'bg-blue-50 hover:bg-blue-100'
        }`}
      />
    );
  }
  const py = tipo === 'n2' ? 'py-px' : 'py-0.5';
  const forte = tipo === 'n2' ? (fixa ? 'font-semibold' : '') : 'font-bold';
  const total = tipo === 'totalizadora';
  const ultima = subs[subs.length - 1];
  const largura = (k) => (fixa ? estiloLargura(LARGURA_SUB[k], posFixa[k]) : estiloLargura(LARGURA_SUB_MOVEL[k]));
  const base = (k) =>
    `${fixa ? `sticky z-10 ${k === ultima ? 'border-r border-r-blue-200' : ''}` : k === subs[0] ? `border-l ${e.divisa}` : ''} border-b ${e.borda} ${py}`;
  const traco = <span className={total ? 'text-white/40' : 'text-gray-300'}>—</span>;
  const moedaCelula = (v, corNormal) =>
    v === null || v === undefined ? (
      <span className={total ? 'text-white/50' : 'text-gray-300'}>—</span>
    ) : total ? (
      <span className={v < 0 ? 'text-red-300' : 'text-white'}>{moeda(v)}</span>
    ) : (
      <span className={v < 0 ? 'text-red-600' : corNormal}>{moeda(v)}</span>
    );
  const pctCelula = (p, tipoPct) =>
    p === undefined ? '' : p === null ? traco : formatoPct(p, tipoPct === 'ah' || tipoPct === 'desvio');

  return subs.map((k) => {
    if (k === 'valor')
      return (
        <td key={k} style={largura(k)} className={`${base(k)} ${e.fundo} px-3 text-right text-xs tabular-nums ${forte}`}>
          {moedaCelula(valor, tipo === 'n1' ? 'text-gray-900' : 'text-gray-700')}
        </td>
      );
    if (k === 'pct')
      return (
        <td key={k} style={largura(k)} className={`${base(k)} ${e.fundo} px-2 text-right text-[11px] tabular-nums ${tipo === 'n2' ? '' : 'font-semibold'} ${corPct(tipo, segunda, pct)}`}>
          {pctCelula(pct, segunda)}
        </td>
      );
    if (k === 'proj')
      return (
        <td
          key={k}
          style={largura(k)}
          title={cinza ? 'Realizado na data do orçamento (até o mês de corte)' : 'Projetado'}
          className={`${base(k)} ${fixa && !total ? (cinza ? 'bg-gray-100' : 'bg-[#fdf6d3]') : fundoProjetado(tipo, cinza)} px-3 text-right text-xs tabular-nums ${forte} ${cinza && !total ? 'opacity-70' : ''}`}
        >
          {proj === undefined ? traco : moedaCelula(proj, cinza ? 'text-gray-500' : 'text-gray-800')}
        </td>
      );
    return (
      <td key={k} style={largura(k)} className={`${base(k)} ${e.fundo} px-2 text-right text-[11px] tabular-nums ${tipo === 'n2' ? '' : 'font-semibold'} ${corPct(tipo, 'desvio', desvio)}`}>
        {pctCelula(desvio, 'desvio')}
      </td>
    );
  });
}

const STATUS_POC = {
  RECEITA: { sigla: 'PR', titulo: 'POC de Receita', cor: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  DESPESA: { sigla: 'PD', titulo: 'POC de Despesa', cor: 'bg-red-100 text-red-700 ring-red-200' },
};

// Bolinha de status da marcação "% POC" (nível 2, aba Máscaras), à esquerda da descrição: PR (verde) =
// POC de Receita, PD (vermelho) = POC de Despesa; sem Tipo POC, só "P". Sem "% POC" fica o espaço
// vazio, pra as descrições ficarem alinhadas.
function StatusPoc({ realiza, tipo }) {
  const s = STATUS_POC[tipo] || { sigla: 'P', titulo: '% POC', cor: 'bg-gray-100 text-gray-600 ring-gray-200' };
  return (
    <span className="inline-flex h-4 w-6 shrink-0 items-center justify-center">
      {realiza && (
        <span
          title={s.titulo}
          className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold leading-none ring-1 ${s.cor}`}
        >
          {s.sigla}
        </span>
      )}
    </span>
  );
}

const SIMBOLO_ICONE = { IGUAL: '=', MAIS: '+', MENOS: '-', MAIS_MENOS: '+/-' };

// Ícone (sinal) da linha de nível 1, escolhido na aba Máscaras (o = vem com Totaliza), à frente da
// descrição. Largura fixa, mesmo sem ícone, pra as descrições ficarem alinhadas.
function IconeLinha({ icone, className }) {
  return (
    <span className={`inline-block w-9 shrink-0 text-xs font-bold tabular-nums ${className}`}>
      {SIMBOLO_ICONE[icone] ? `(${SIMBOLO_ICONE[icone]})` : ''}
    </span>
  );
}

// As células de valor de uma linha. `vals` = { valores, projetado, comparavel }: o valor da linha em
// cada coluna (realizado, projetado do período e projetado dos meses até o atual — a base do Desvio %).
// AV % = valor ÷ base da coluna (`bases`, null quando a linha está acima da linha configurada → vazio);
// AH % = sobre a coluna anterior, se ela também for um mês; o primeiro mês compara com a coluna
// `oculta` (o mês antes do período), que não é desenhada.
function CelulasDaLinha({ tipo, colunas, vals, bases, recolhido, onAbrir, subsDe, posFixa }) {
  const iAnterior = colunas.findIndex((c) => c.oculta);
  return colunas.map((c, i) => {
    if (c.oculta) return null;
    let pct;
    if (c.segunda === 'av') pct = bases ? pctAv(vals.valores[i], bases[i]) : undefined;
    else if (c.segunda === 'ah') {
      const j = colunas[i - 1]?.mes ? i - 1 : iAnterior;
      pct = j >= 0 ? pctAh(vals.valores[i], vals.valores[j]) : null;
    }
    // Projetado: o do período inteiro. Desvio %: o realizado (que nunca passa de hoje) × o projetado dos
    // meses até o atual (`comparavel`) — a regra do Total do fluxo do DFC. Coluna sem projeção: vazio.
    const temProj = Boolean(c.projetado);
    const proj = temProj ? vals.projetado[i] : undefined;
    const realDesvio = c.valoresDesvio ? vals.valoresDesvio[i] : vals.valores[i];
    const desvio = temProj && c.comparavel ? pctDesvio(realDesvio, vals.comparavel[i]) : undefined;
    return (
      <Celulas
        key={c.chave}
        tipo={tipo}
        fixa={i === 0}
        subs={subsDe(c)}
        segunda={c.segunda}
        valor={vals.valores[i]}
        pct={pct}
        proj={proj}
        desvio={desvio}
        cinza={c.cinza}
        recolhido={recolhido}
        onAbrir={onAbrir}
        posFixa={posFixa}
      />
    );
  });
}

// O valor de uma linha em cada coluna, num dos campos da coluna (valores / projetado / comparavel):
// totalizadora = acumulado (tudo acima, de `acumulados`); nível 1 = soma das de nível 2; nível 2 = o
// valor da máscara.
function valoresDaLinha(colunas, campo, { grupo, item, acumulados }) {
  if (acumulados) return acumulados[campo];
  return colunas.map((c) => {
    const v = c[campo];
    if (!v) return null;
    return item ? (v[item.id] ?? null) : totalDoGrupo(grupo, v);
  });
}

// Totaliza (aba Máscaras) é linha de subtotal: escura, fechando a seção, sem nível 2 — valor de cada
// coluna = `acumulados` (tudo acima, em cada campo). Linha de nível 1 = soma das de nível 2, só quando
// todas já têm valor. As células congeladas (descrição e coluna fixa) têm fundo sólido: as outras rolam
// por baixo. `bases`: o 100% da AV % de cada coluna, ou null quando o grupo está acima da linha
// configurada. `recolhido` / `onAbrir`: a coluna fixa recolhida numa faixa. `subsDe(coluna)`: as
// subcolunas visíveis da coluna; `posFixa`: o left das subcolunas da coluna fixa.
const CAMPOS = ['valores', 'projetado', 'comparavel', 'valoresDesvio'];
function LinhaGrupo({ grupo, colunas, acumulados, bases, recolhido, onAbrir, subsDe, posFixa }) {
  const faixa = { colunas, bases, recolhido, onAbrir, subsDe, posFixa };
  const vals = (alvo) => Object.fromEntries(CAMPOS.map((campo) => [campo, valoresDaLinha(colunas, campo, alvo)]));
  if (grupo.totalizadora) {
    return (
      <tr>
        <td className={`${COL_DESCRICAO} border-b border-[#1d5c8a] bg-[#1d5c8a] py-0.5 pl-4`}>
          <span className="flex items-center">
            <IconeLinha icone={grupo.icone} className="text-white" />
            <span className="truncate text-xs font-bold uppercase tracking-wide text-white">{grupo.descricao}</span>
          </span>
        </td>
        <CelulasDaLinha tipo="totalizadora" vals={vals({ acumulados })} {...faixa} />
      </tr>
    );
  }

  const visiveis = colunas.filter((c) => !c.oculta);
  return (
    <Fragment>
      <tr>
        <td className={`${COL_DESCRICAO} border-b border-gray-200 bg-gray-50 py-0.5 pl-4`}>
          <span className="flex items-center">
            <IconeLinha icone={grupo.icone} className="text-gray-500" />
            <span className="truncate text-xs font-bold uppercase tracking-wide text-gray-900">{grupo.descricao}</span>
          </span>
        </td>
        <CelulasDaLinha tipo="n1" vals={vals({ grupo })} {...faixa} />
      </tr>

      {grupo.filhos.length === 0 ? (
        <tr>
          <td className={`${COL_DESCRICAO} border-b border-gray-100 bg-white py-1 pl-20 text-xs italic text-gray-300`}>
            Nenhum item cadastrado nesta linha ainda.
          </td>
          {recolhido ? (
            <td className={`${COL_FAIXA} z-10 border-b border-b-blue-100 bg-blue-50`} />
          ) : (
            <td
              colSpan={subsDe(visiveis[0]).length}
              className="sticky left-[380px] z-10 border-b border-r border-b-blue-100 border-r-blue-200 bg-blue-50"
            />
          )}
          <td colSpan={visiveis.slice(1).reduce((t, c) => t + subsDe(c).length, 0)} className="border-b border-gray-100" />
        </tr>
      ) : (
        grupo.filhos.map((item) => (
          <tr key={item.id} className="group">
            {/* Recuo menor que o do aviso de linha vazia (pl-20): a bolinha da POC ocupa o espaço e a
                descrição fica na mesma posição de antes. */}
            <td className={`${COL_DESCRICAO} border-b border-gray-100 bg-white py-px pl-[50px] text-xs text-gray-700 group-hover:bg-gray-50`}>
              <span className="flex items-center gap-1.5">
                <StatusPoc realiza={item.realiza_poc} tipo={item.tipo_poc} />
                <span className="truncate" title={item.descricao}>{item.descricao}</span>
              </span>
            </td>
            <CelulasDaLinha tipo="n2" vals={vals({ item })} {...faixa} />
          </tr>
        ))
      )}
    </Fragment>
  );
}
