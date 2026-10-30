import { Fragment, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, BarChart3, CalendarDays, ChevronLeft, Minimize2, TriangleAlert } from 'lucide-react';
import { listDreMascaras } from '../../../api/dreMascaras.api';
import { calcularDre } from '../../../api/dreDemonstrativo.api';

const moeda = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (iso) => iso.split('-').reverse().join('/');
const MESES_CAB = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
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
export default function DreTab({ empresaId, de, ate, centros = [], telaCheia = false, onSairTelaCheia }) {
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
    setCarregando(true);
    listDreMascaras(empresaId)
      .then(setArvore)
      .finally(() => setCarregando(false));
  }, [empresaId]);

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
    let ativo = true;
    setCalculando(true);
    calcularDre(empresaId, { de, ate, centros: chaveCentros ? chaveCentros.split(',') : [] })
      .then((r) => ativo && setResultado(r))
      .catch((e) => ativo && setErro(e.response?.data?.message || 'Não foi possível calcular a DRE.'))
      .finally(() => ativo && setCalculando(false));
    return () => {
      ativo = false;
    };
  }, [empresaId, de, ate, chaveCentros]);

  // Outra empresa: volta pra visão dos centros.
  useEffect(() => {
    setMensal(null);
  }, [empresaId]);

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

  // Colunas de valor. `segunda`: a coluna ao lado do valor — 'av' (AV %), 'ah' (AH %) ou nenhuma.
  const colunas = centroMensal
    ? [
        { chave: 'total', nome: 'Total', valores: centroMensal.valores, segunda: null },
        ...centroMensal.meses.map((m) => ({ chave: m.mes, mes: m.mes, de: m.de, ate: m.ate, valores: m.valores, segunda: 'ah' })),
      ]
    : [
        { chave: 'consolidado', nome: 'Consolidado', valores: resultado?.valores || {}, segunda: 'av' },
        ...(resultado?.por_centro || []).map((c) => ({ chave: c.id, nome: c.nome, valores: c.valores, segunda: 'av' })),
      ];
  const fixa = colunas[0];
  // Visão mês a mês: o mês antes do período entra só no cálculo (coluna `oculta`), pra AH % do primeiro.
  const colunasCalc = centroMensal
    ? [...colunas, { chave: 'anterior', valores: centroMensal.mes_anterior.valores, oculta: true }]
    : colunas;
  const linhas = comAcumulado(arvore, colunasCalc);
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

  function abrirMensal(id) {
    setMensal(id);
    setFixaAberta(true);
  }

  return (
    <div
      className={
        telaCheia ? 'fixed inset-0 z-40 flex flex-col overflow-y-auto bg-white p-5' : 'rounded-card rounded-tl-none bg-white p-5 shadow-card'
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
            Voltar aos centros
          </button>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <CalendarDays size={15} className="text-primary-600" />
            {centroMensal.nome}
            <span className="font-normal text-gray-500">· mês a mês</span>
          </span>
          <span className="text-xs text-gray-400">AH % = variação de cada mês sobre o mês anterior</span>
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
                    colSpan={fixa.segunda ? 2 : 1}
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
                    <CabecalhoMes key={c.chave} coluna={c} atual={c.mes === mesAtual} />
                  ) : (
                    // O próprio nome do centro é o botão do mês a mês: acende no hover.
                    <th key={c.chave} colSpan={2} className="border-b border-l border-gray-200 bg-white p-1 text-center align-bottom font-semibold">
                      <button
                        type="button"
                        onClick={() => abrirMensal(c.chave)}
                        title={`${c.chave} - ${c.nome} · ver mês a mês`}
                        className="group/centro flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 uppercase tracking-wide text-gray-700 transition-colors hover:bg-primary-600 hover:text-white"
                      >
                        <span className="line-clamp-2 whitespace-normal leading-tight">{c.nome}</span>
                        <CalendarDays size={12} className="shrink-0 text-gray-300 transition-colors group-hover/centro:text-white" />
                      </button>
                    </th>
                  )
                )}
              </tr>
              <tr className="text-[10px] uppercase tracking-wide text-gray-500">
                {fixaAberta && (
                  <>
                    <th
                      className={`${COL_FIXA_VALOR} ${fixa.segunda ? '' : 'border-r border-r-blue-200'} border-b border-b-blue-200 bg-blue-100 py-1 text-center font-medium text-blue-700`}
                    >
                      Valor
                    </th>
                    {fixa.segunda && (
                      <th
                        className={`${COL_FIXA_SEGUNDA} border-b border-b-blue-200 bg-blue-100 py-1 text-center font-medium text-blue-700`}
                        title={tituloSegunda(fixa)}
                      >
                        AV %
                      </th>
                    )}
                  </>
                )}
                {colunas.slice(1).map((c) => (
                  <Fragment key={c.chave}>
                    <th
                      className={`${COL_VALOR} border-b border-l border-gray-200 py-1 text-center font-semibold ${
                        c.mes === mesAtual ? 'bg-[#f5f9ff]' : 'bg-white'
                      }`}
                    >
                      Valor
                    </th>
                    <th
                      className={`${COL_SEGUNDA} border-b border-gray-200 py-1 text-center font-semibold ${c.mes === mesAtual ? 'bg-[#f5f9ff]' : 'bg-white'}`}
                      title={tituloSegunda(c)}
                    >
                      {c.segunda === 'ah' ? 'AH %' : 'AV %'}
                    </th>
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
                  acumulados={acumulados}
                  bases={indiceBase >= 0 && i >= indiceBase ? bases : null}
                  recolhido={!fixaAberta}
                  onAbrir={() => setFixaAberta(true)}
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
function CabecalhoMes({ coluna, atual }) {
  const parcial = coluna.de.slice(8) !== '01' || coluna.ate !== fimDoMes(coluna.mes);
  return (
    <th
      colSpan={2}
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

// Larguras fixas: a descrição e a coluna fixa (Consolidado / Total: valor + AV %) ficam congeladas à
// esquerda quando as outras rolam (left = soma das larguras à esquerda: 380, +144).
const COL_DESCRICAO = 'sticky left-0 z-10 w-[380px] min-w-[380px] max-w-[380px]';
const COL_FIXA_VALOR = 'sticky left-[380px] z-10 w-36 min-w-36 max-w-36';
const COL_FIXA_SEGUNDA = 'sticky left-[524px] z-10 w-20 min-w-20 max-w-20 border-r border-r-blue-200';
const COL_VALOR = 'w-32 min-w-32 max-w-32';
const COL_SEGUNDA = 'w-20 min-w-20 max-w-20';
// Coluna fixa recolhida: só a faixa (como o Total recolhido do fluxo do DFC). Sem z-index aqui: o
// cabeçalho fica acima (z-20) pra palavra vertical passar por cima das células.
const COL_FAIXA = 'sticky left-[380px] w-7 min-w-7 max-w-7 border-r border-r-blue-200';

// AV % = valor ÷ |base| (o sinal do valor fica: despesa sai negativa). Sem base (ou zero), traço.
const pctAv = (v, base) => (v === null || v === undefined || !base ? null : (v / Math.abs(base)) * 100);
// AH % = (mês − mês anterior) ÷ |mês anterior|: positivo = melhor pro resultado (entrou mais / saiu
// menos), negativo = pior — mesmo critério do Desvio % do fluxo do DFC. Sem mês anterior (ou zero), traço.
const pctAh = (v, anterior) =>
  v === null || v === undefined || anterior === null || anterior === undefined || !anterior ? null : ((v - anterior) / Math.abs(anterior)) * 100;
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

// Cor do AV % (sinal do valor) e do AH % (verde = melhor, vermelho = pior), clara nas totalizadoras.
function corPct(tipo, segunda, p) {
  const total = tipo === 'totalizadora';
  if (p === null || p === undefined || Math.abs(p) < 0.005) return total ? 'text-white/80' : 'text-gray-500';
  if (segunda === 'ah') return p > 0 ? (total ? 'text-emerald-300' : 'text-emerald-600') : total ? 'text-red-300' : 'text-red-500';
  return p < 0 ? (total ? 'text-red-300' : 'text-red-500') : total ? 'text-white/80' : 'text-gray-500';
}

// As células de uma coluna numa linha: o valor e, se a coluna tiver, o AV % / AH % (`pct`: número,
// null = traço, undefined = vazio). Coluna fixa recolhida (`recolhido`): uma faixa só, que abre ao
// clicar (`onAbrir`).
function Celulas({ tipo, fixa, segunda, valor, pct, recolhido, onAbrir }) {
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
  const py = tipo === 'n2' ? 'py-0.5' : 'py-1';
  const forte = tipo === 'n2' ? (fixa ? 'font-semibold' : '') : 'font-bold';
  return (
    <>
      <td
        className={`${fixa ? `${COL_FIXA_VALOR} ${segunda ? '' : 'border-r border-r-blue-200'}` : `${COL_VALOR} border-l ${e.divisa}`} ${
          e.fundo
        } border-b ${e.borda} ${py} px-3 text-right text-xs tabular-nums ${forte}`}
      >
        {tipo === 'totalizadora' ? (
          valor === null || valor === undefined ? (
            <span className="text-white/50">—</span>
          ) : (
            <span className={valor < 0 ? 'text-red-300' : 'text-white'}>{moeda(valor)}</span>
          )
        ) : (
          <Valor valor={valor} cor={tipo === 'n1' ? 'text-gray-900' : 'text-gray-700'} />
        )}
      </td>
      {segunda && (
        <td
          className={`${fixa ? COL_FIXA_SEGUNDA : COL_SEGUNDA} ${e.fundo} border-b ${e.borda} ${py} px-2 text-right text-[11px] tabular-nums ${
            tipo === 'n2' ? '' : 'font-semibold'
          } ${corPct(tipo, segunda, pct)}`}
        >
          {pct === undefined ? '' : pct === null ? <span className={tipo === 'totalizadora' ? 'text-white/40' : 'text-gray-300'}>—</span> : formatoPct(pct, segunda === 'ah')}
        </td>
      )}
    </>
  );
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
    <span className="inline-flex h-5 w-6 shrink-0 items-center justify-center">
      {realiza && (
        <span
          title={s.titulo}
          className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold leading-none ring-1 ${s.cor}`}
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

// Valor ou traço (cálculo ainda não feito); negativo em vermelho.
function Valor({ valor, vazio = 'text-gray-300', cor = 'text-gray-700' }) {
  if (valor === null || valor === undefined) return <span className={vazio}>—</span>;
  return <span className={valor < 0 ? 'text-red-600' : cor}>{moeda(valor)}</span>;
}

// As células de valor de uma linha: `vals` = o valor em cada coluna. AV % = valor ÷ base da coluna
// (`bases`, null quando a linha está acima da linha configurada → vazio); AH % = sobre a coluna
// anterior, se ela também for um mês; o primeiro mês compara com a coluna `oculta` (o mês antes do
// período), que não é desenhada.
function CelulasDaLinha({ tipo, colunas, vals, bases, recolhido, onAbrir }) {
  const iAnterior = colunas.findIndex((c) => c.oculta);
  return colunas.map((c, i) => {
    if (c.oculta) return null;
    let pct;
    if (c.segunda === 'av') pct = bases ? pctAv(vals[i], bases[i]) : undefined;
    else if (c.segunda === 'ah') {
      const j = colunas[i - 1]?.mes ? i - 1 : iAnterior;
      pct = j >= 0 ? pctAh(vals[i], vals[j]) : null;
    }
    return (
      <Celulas
        key={c.chave}
        tipo={tipo}
        fixa={i === 0}
        segunda={c.segunda}
        valor={vals[i]}
        pct={pct}
        recolhido={recolhido}
        onAbrir={onAbrir}
      />
    );
  });
}

// Totaliza (aba Máscaras) é linha de subtotal: escura, fechando a seção, sem nível 2 — valor de cada
// coluna = `acumulados` (tudo acima). Linha de nível 1 = soma das de nível 2, só quando todas já têm
// valor. As células congeladas (descrição e coluna fixa) têm fundo sólido: as outras rolam por baixo.
// `bases`: o 100% da AV % de cada coluna, ou null quando o grupo está acima da linha configurada.
// `recolhido` / `onAbrir`: a coluna fixa recolhida numa faixa.
function LinhaGrupo({ grupo, colunas, acumulados, bases, recolhido, onAbrir }) {
  const faixa = { colunas, bases, recolhido, onAbrir };
  if (grupo.totalizadora) {
    return (
      <tr>
        <td className={`${COL_DESCRICAO} border-b border-[#1d5c8a] bg-[#1d5c8a] py-1 pl-4`}>
          <span className="flex items-center">
            <IconeLinha icone={grupo.icone} className="text-white" />
            <span className="truncate text-xs font-bold uppercase tracking-wide text-white">{grupo.descricao}</span>
          </span>
        </td>
        <CelulasDaLinha tipo="totalizadora" vals={acumulados} {...faixa} />
      </tr>
    );
  }

  return (
    <Fragment>
      <tr>
        <td className={`${COL_DESCRICAO} border-b border-gray-200 bg-gray-50 py-1 pl-4`}>
          <span className="flex items-center">
            <IconeLinha icone={grupo.icone} className="text-gray-500" />
            <span className="truncate text-xs font-bold uppercase tracking-wide text-gray-900">{grupo.descricao}</span>
          </span>
        </td>
        <CelulasDaLinha tipo="n1" vals={colunas.map((c) => totalDoGrupo(grupo, c.valores))} {...faixa} />
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
              colSpan={colunas[0].segunda ? 2 : 1}
              className="sticky left-[380px] z-10 border-b border-r border-b-blue-100 border-r-blue-200 bg-blue-50"
            />
          )}
          <td colSpan={(colunas.filter((c) => !c.oculta).length - 1) * 2} className="border-b border-gray-100" />
        </tr>
      ) : (
        grupo.filhos.map((item) => (
          <tr key={item.id} className="group">
            {/* Recuo menor que o do aviso de linha vazia (pl-20): a bolinha da POC ocupa o espaço e a
                descrição fica na mesma posição de antes. */}
            <td className={`${COL_DESCRICAO} border-b border-gray-100 bg-white py-0.5 pl-[50px] text-xs text-gray-700 group-hover:bg-gray-50`}>
              <span className="flex items-center gap-1.5">
                <StatusPoc realiza={item.realiza_poc} tipo={item.tipo_poc} />
                <span className="truncate" title={item.descricao}>{item.descricao}</span>
              </span>
            </td>
            <CelulasDaLinha tipo="n2" vals={colunas.map((c) => c.valores[item.id])} {...faixa} />
          </tr>
        ))
      )}
    </Fragment>
  );
}
