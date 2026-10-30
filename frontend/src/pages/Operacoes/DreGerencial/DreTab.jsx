import { Fragment, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, ChevronLeft, Minimize2, TriangleAlert } from 'lucide-react';
import { listDreMascaras } from '../../../api/dreMascaras.api';
import { calcularDre } from '../../../api/dreDemonstrativo.api';

const moeda = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (iso) => iso.split('-').reverse().join('/');

// Demonstração (nível 1 + nível 2) da DRE, em formato de tabela — mesma mecânica visual de
// SaldosContasTab.jsx (primeira coluna com a hierarquia, valor alinhado à direita), num quadro de
// bordas arredondadas como o do fluxo de caixa do DFC Construtoras. Colunas: CONSOLIDADO (o
// totalizador = soma dos centros) e um centro de custo por coluna, cada um com Valor e AV % (Avaliação
// Vertical, a partir da linha de nível 1 da aba Configurações); descrição e consolidado ficam
// congelados à esquerda quando os centros rolam. A hierarquia é a
// árvore cadastrada na aba Máscaras (dre_mascaras), na mesma ordem de lá. Valor = período do filtro
// (de/até) somando os centros escolhidos (vazio = todos com "Realiza DRE") — cálculo em
// dre-demonstrativo/demonstrativo.service.js; linha de nível 2 sem cálculo fica com traço.
// `telaCheia` / `onSairTelaCheia`: a DRE ocupa a tela inteira (por cima do menu e do topo, e em tela
// cheia de verdade no navegador quando ele deixa), como o fluxo do DFC Construtoras; sai pelo botão
// "Sair da tela cheia" ou com Esc.
export default function DreTab({ empresaId, de, ate, centros = [], telaCheia = false, onSairTelaCheia }) {
  const [arvore, setArvore] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState('');
  // Consolidado retrátil, como o Total do fluxo do DFC: clicar no título recolhe numa faixa com
  // "CONSOLIDADO" na vertical; clicar na faixa abre. Começa aberto (é o totalizador da DRE).
  const [consolidadoAberto, setConsolidadoAberto] = useState(true);
  const chaveCentros = centros.join(',');

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
  // Colunas de valor: o CONSOLIDADO (soma dos centros) e um centro de custo por coluna — cada uma com a
  // sua AV % ao lado.
  const colunas = [
    { chave: 'consolidado', valores: resultado?.valores || {} },
    ...(resultado?.por_centro || []).map((c) => ({ chave: c.id, nome: c.nome, valores: c.valores })),
  ];
  const linhas = comAcumulado(arvore, colunas);
  // AV %: a linha de nível 1 da aba Configurações vale 100% em cada coluna; ela e as de baixo mostram o
  // percentual dela (as de cima ficam vazias). Sem a linha configurada, traço.
  const av = resultado?.avaliacao_vertical || null;
  const indiceBase = av ? arvore.findIndex((g) => g.id === av.mascara_id) : -1;
  const bases = colunas.map((c, i) => {
    if (indiceBase < 0) return null;
    const g = arvore[indiceBase];
    return g.totalizadora ? linhas[indiceBase].acumulados[i] : totalDoGrupo(g, c.valores);
  });
  const semAv = resultado && indiceBase < 0;

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
            <h2 className="text-sm font-semibold text-gray-900">DRE</h2>
            <p className="text-xs text-gray-500">
              {dataBr(de)} a {dataBr(ate)}
              {centros.length > 0 && ` · ${centros.length} ${centros.length === 1 ? 'centro' : 'centros'} de custo`}
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
              {/* Cabeçalhos centralizados: o nome da coluna (Consolidado / centro) em cima, Valor e AV % embaixo. */}
              <tr className="text-xs uppercase tracking-wide text-gray-400">
                <th
                  rowSpan={2}
                  className={`${COL_DESCRICAO} border-b border-gray-200 bg-white py-1.5 pl-4 align-bottom font-medium`}
                >
                  Descrição
                </th>
                {consolidadoAberto ? (
                  <th
                    colSpan={2}
                    onClick={() => setConsolidadoAberto(false)}
                    title="Recolher o Consolidado"
                    className="sticky left-[380px] z-10 cursor-pointer border-b border-r border-b-blue-200 border-r-blue-200 bg-blue-100 px-3 pb-1 pt-1.5 text-center align-bottom font-semibold text-blue-800 transition-colors hover:bg-blue-200"
                  >
                    <span className="inline-flex items-center gap-1">
                      <ChevronLeft size={13} className="shrink-0 text-blue-500" />
                      Consolidado
                    </span>
                  </th>
                ) : (
                  <th
                    rowSpan={2}
                    onClick={() => setConsolidadoAberto(true)}
                    title="Mostrar o Consolidado (valor e AV %)"
                    className={`${COL_FAIXA} cursor-pointer border-b border-b-blue-200 bg-blue-100 px-0 py-2 text-center align-middle transition-colors hover:bg-blue-200`}
                  >
                    <span className="inline-flex rotate-180 items-center gap-1 text-[11px] font-bold uppercase tracking-[0.2em] text-blue-800 [writing-mode:vertical-rl]">
                      Consolidado
                      <ChevronLeft size={12} className="shrink-0 text-blue-500" />
                    </span>
                  </th>
                )}
                {colunas.slice(1).map((c) => (
                  <th
                    key={c.chave}
                    colSpan={2}
                    title={`${c.chave} - ${c.nome}`}
                    className="border-b border-l border-gray-200 bg-white px-3 pb-1 pt-1.5 text-center align-bottom font-medium"
                  >
                    <span className="line-clamp-2 whitespace-normal leading-tight">{c.nome}</span>
                  </th>
                ))}
              </tr>
              <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                {consolidadoAberto && (
                  <>
                    <th className={`${COL_CONSOLIDADO} border-b border-b-blue-200 bg-blue-100 py-1 text-center font-medium text-blue-700`}>Valor</th>
                    <th
                      className={`${COL_AV_CONSOLIDADO} border-b border-b-blue-200 bg-blue-100 py-1 text-center font-medium text-blue-700`}
                      title={av ? `Percentual de ${av.descricao}` : 'Avaliação Vertical não configurada'}
                    >
                      AV %
                    </th>
                  </>
                )}
                {colunas.slice(1).map((c) => (
                  <Fragment key={c.chave}>
                    <th className={`${COL_CENTRO} border-b border-l border-gray-200 bg-white py-1 text-center font-medium`}>Valor</th>
                    <th
                      className={`${COL_AV} border-b border-gray-200 bg-white py-1 text-center font-medium`}
                      title={av ? `Percentual de ${av.descricao}` : 'Avaliação Vertical não configurada'}
                    >
                      AV %
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
                  colunas={colunas}
                  acumulados={acumulados}
                  bases={indiceBase >= 0 && i >= indiceBase ? bases : null}
                  recolhido={!consolidadoAberto}
                  onAbrir={() => setConsolidadoAberto(true)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Totaliza = soma de todas as linhas de nível 2 acima dela na DRE (Receita Líquida = Receita Bruta +
// impostos…), só quando todas já têm valor; senão, traço. Uma por coluna (consolidado e centros).
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

// Larguras fixas: a descrição e o consolidado (valor + AV %) ficam congelados à esquerda quando os
// centros rolam (left = soma das larguras à esquerda: 380, +144).
const COL_DESCRICAO = 'sticky left-0 z-10 w-[380px] min-w-[380px] max-w-[380px]';
const COL_CONSOLIDADO = 'sticky left-[380px] z-10 w-36 min-w-36 max-w-36';
const COL_AV_CONSOLIDADO = 'sticky left-[524px] z-10 w-20 min-w-20 max-w-20 border-r border-r-blue-200';
// Consolidado recolhido: só a faixa (como o Total recolhido do fluxo do DFC).
const COL_FAIXA = 'sticky left-[380px] z-10 w-7 min-w-7 max-w-7 border-r border-r-blue-200';
const COL_CENTRO = 'w-32 min-w-32 max-w-32';
const COL_AV = 'w-20 min-w-20 max-w-20';

// AV % = valor ÷ |base| (o sinal do valor fica: despesa sai negativa). Sem base (ou zero), traço.
const pctAv = (v, base) => (v === null || v === undefined || !base ? null : (v / Math.abs(base)) * 100);
// Abaixo de 0,005% vira 0 (senão aparecia "-0,00%").
const formatoAv = (p) => `${(Math.abs(p) < 0.005 ? 0 : p).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

// Fundo e bordas de cada célula de valor / AV %, por tipo de linha e coluna (consolidado ou centro).
// As do consolidado são congeladas, então o fundo é sempre sólido.
function estilo(tipo, consolidado) {
  if (tipo === 'totalizadora')
    return { fundo: consolidado ? 'bg-[#174a70]' : 'bg-[#1d5c8a]', borda: 'border-b-[#1d5c8a]', divisa: 'border-l-white/10' };
  if (tipo === 'n1')
    return consolidado
      ? { fundo: 'bg-blue-100', borda: 'border-b-blue-200', divisa: '' }
      : { fundo: 'bg-gray-50', borda: 'border-b-gray-200', divisa: 'border-l-gray-200' };
  return consolidado
    ? { fundo: 'bg-blue-50 group-hover:bg-blue-100', borda: 'border-b-blue-100', divisa: '' }
    : { fundo: 'group-hover:bg-gray-50', borda: 'border-b-gray-100', divisa: 'border-l-gray-100' };
}

// As duas células de uma coluna (valor e AV %) numa linha. `base`: o 100% da AV % nessa coluna, ou
// undefined quando a linha fica sem AV (acima da linha configurada). Consolidado recolhido
// (`recolhido`): uma faixa só, que abre ao clicar (`onAbrir`).
function Celulas({ tipo, consolidado, valor, base, recolhido, onAbrir }) {
  const e = estilo(tipo, consolidado);
  if (consolidado && recolhido) {
    return (
      <td
        onClick={onAbrir}
        title="Mostrar o Consolidado (valor e AV %)"
        className={`${COL_FAIXA} cursor-pointer border-b ${e.borda} ${
          tipo === 'totalizadora' ? 'bg-[#174a70]' : tipo === 'n1' ? 'bg-blue-100 hover:bg-blue-200' : 'bg-blue-50 hover:bg-blue-100'
        }`}
      />
    );
  }
  const py = tipo === 'n2' ? 'py-0.5' : 'py-1';
  const forte = tipo === 'n2' ? (consolidado ? 'font-semibold' : '') : 'font-bold';
  const p = base === undefined ? undefined : pctAv(valor, base);
  return (
    <>
      <td
        className={`${consolidado ? COL_CONSOLIDADO : `${COL_CENTRO} border-l ${e.divisa}`} ${e.fundo} border-b ${e.borda} ${py} px-3 text-right text-xs tabular-nums ${forte}`}
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
      <td
        className={`${consolidado ? COL_AV_CONSOLIDADO : COL_AV} ${e.fundo} border-b ${e.borda} ${py} px-2 text-right text-[11px] tabular-nums ${
          tipo === 'n2' ? '' : 'font-semibold'
        } ${
          tipo === 'totalizadora'
            ? p !== null && p !== undefined && p < 0 ? 'text-red-300' : 'text-white/80'
            : p !== null && p !== undefined && p < 0 ? 'text-red-500' : 'text-gray-500'
        }`}
      >
        {p === undefined ? '' : p === null ? <span className={tipo === 'totalizadora' ? 'text-white/40' : 'text-gray-300'}>—</span> : formatoAv(p)}
      </td>
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

// Totaliza (aba Máscaras) é linha de subtotal: escura, fechando a seção, sem nível 2 — valor de cada
// coluna = `acumulados` (tudo acima). Linha de nível 1 = soma das de nível 2, só quando todas já têm
// valor. As células congeladas (descrição e consolidado) têm fundo sólido: os centros rolam por baixo.
// `bases`: o 100% da AV % de cada coluna, ou null quando o grupo está acima da linha configurada.
// `recolhido` / `onAbrir`: o Consolidado recolhido numa faixa.
function LinhaGrupo({ grupo, colunas, acumulados, bases, recolhido, onAbrir }) {
  const base = (i) => (bases ? bases[i] : undefined);
  const faixa = { recolhido, onAbrir };
  if (grupo.totalizadora) {
    return (
      <tr>
        <td className={`${COL_DESCRICAO} border-b border-[#1d5c8a] bg-[#1d5c8a] py-1 pl-4`}>
          <span className="flex items-center">
            <IconeLinha icone={grupo.icone} className="text-white" />
            <span className="truncate text-xs font-bold uppercase tracking-wide text-white">{grupo.descricao}</span>
          </span>
        </td>
        {colunas.map((c, i) => (
          <Celulas key={c.chave} tipo="totalizadora" consolidado={i === 0} valor={acumulados[i]} base={base(i)} {...faixa} />
        ))}
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
        {colunas.map((c, i) => (
          <Celulas key={c.chave} tipo="n1" consolidado={i === 0} valor={totalDoGrupo(grupo, c.valores)} base={base(i)} {...faixa} />
        ))}
      </tr>

      {grupo.filhos.length === 0 ? (
        <tr>
          <td className={`${COL_DESCRICAO} border-b border-gray-100 bg-white py-1 pl-20 text-xs italic text-gray-300`}>
            Nenhum item cadastrado nesta linha ainda.
          </td>
          {recolhido ? (
            <td className={`${COL_FAIXA} border-b border-b-blue-100 bg-blue-50`} />
          ) : (
            <>
              <td className={`${COL_CONSOLIDADO} border-b border-b-blue-100 bg-blue-50`} />
              <td className={`${COL_AV_CONSOLIDADO} border-b border-b-blue-100 bg-blue-50`} />
            </>
          )}
          <td colSpan={(colunas.length - 1) * 2} className="border-b border-gray-100" />
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
            {colunas.map((c, i) => (
              <Celulas key={c.chave} tipo="n2" consolidado={i === 0} valor={c.valores[item.id]} base={base(i)} {...faixa} />
            ))}
          </tr>
        ))
      )}
    </Fragment>
  );
}
