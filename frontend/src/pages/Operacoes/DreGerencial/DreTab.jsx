import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BarChart3, ChevronLeft, ChevronRight, Minimize2, TriangleAlert } from 'lucide-react';
import { listDreMascaras } from '../../../api/dreMascaras.api';
import { calcularDre } from '../../../api/dreDemonstrativo.api';

// Mesmas medidas e cores do fluxo de caixa do DFC Construtoras (DfcConstrutoras/DfcFluxoTab.jsx).
const LARGURA_PRIMEIRA = 340;
const LARGURA_COLUNA = 96; // cabe um valor de 8 dígitos (-17.203.274)
const LARGURA_TOTAL = 112;
const LARGURA_TOTAL_FECHADO = 28; // Total recolhido: só a faixa com "TOTAL" na vertical
const ALTURA_MINIMA_GRADE = 320;
const MESES_CAB = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
// Sombra na borda das colunas congeladas (descrição + Total) quando os meses rolaram: a 2ª célula de
// cada linha. (Classe escrita por inteiro: o Tailwind só gera as que aparecem literais no código.)
const SOMBRA_COLUNA_FIXA = '[&_tr>*:nth-child(2)]:shadow-[6px_0_8px_-6px_rgba(16,24,40,0.18)]';
const TOTAL = 'total';

// Sem casas decimais, como no fluxo — o cálculo continua em centavos, só a exibição arredonda.
const dinheiro = (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const dataBr = (iso) => iso.split('-').reverse().join('/');
const fimDoMes = (anoMes) =>
  new Date(Date.UTC(Number(anoMes.slice(0, 4)), Number(anoMes.slice(5, 7)), 0)).toISOString().slice(0, 10);

function mesDeHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Estilo de cada tipo de linha (a primeira coluna é congelada, então o fundo é sempre sólido) — os do
// fluxo: grupo de nível 1 = máscara 1, nível 2 = máscara 2, totalizadora = linha de saldo.
const ESTILO = {
  totalizadora: { fundo: 'bg-slate-50', texto: 'text-[13px] font-semibold text-slate-900', py: 'py-3', borda: 'border-slate-200' },
  n1: { fundo: 'bg-white', texto: 'text-[13px] font-semibold text-gray-900', py: 'py-2.5', borda: 'border-gray-100' },
  n2: { fundo: 'bg-white', texto: 'text-xs text-gray-700', py: 'py-2', borda: 'border-gray-100' },
};
const corValor = (v) => (v < 0 ? 'text-rose-600' : 'text-gray-900');

// Operações > DRE Gerencial > DRE: o demonstrativo, no layout e na identidade visual do fluxo de caixa
// do DFC Construtoras (pedido do usuário). Linhas = a árvore da aba Máscaras (dre_mascaras), na ordem
// de lá: o nível 1 abre e fecha (começa fechado, como no fluxo) mostrando o nível 2; a totalizadora
// (Totaliza) fecha a seção com a soma de tudo acima dela. Colunas = TOTAL do período (retrátil, como no
// fluxo; começa aberto — é o valor do filtro) e um mês por coluna (o primeiro e o último podem ser
// parciais). Valores somando os centros escolhidos (vazio = todos com "Realiza DRE") — cálculo em
// dre-demonstrativo/demonstrativo.service.js; linha de nível 2 sem cálculo fica com traço.
// `telaCheia` / `onSairTelaCheia`: a DRE ocupa a tela inteira (por cima do menu e do topo, e em tela
// cheia de verdade no navegador quando ele deixa), como o fluxo; sai pelo botão "Sair da tela cheia" ou
// com Esc.
export default function DreTab({ empresaId, de, ate, centros = [], telaCheia = false, onSairTelaCheia }) {
  const [arvore, setArvore] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState('');
  const [abertos, setAbertos] = useState([]);
  const [totalAberto, setTotalAberto] = useState(true);
  const gradeRef = useRef(null);
  const [alturaGrade, setAlturaGrade] = useState(null);
  const [rolouX, setRolouX] = useState(false);
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

  // A grade ocupa a altura que sobra na tela (mesma regra do fluxo).
  useLayoutEffect(() => {
    const el = gradeRef.current;
    if (!el) return undefined;
    const medir = () => {
      const main = el.closest('main');
      // Em tela cheia o quadro é fixo na janela (não rola com o <main>).
      const topo = el.getBoundingClientRect().top + (main && !telaCheia ? main.scrollTop : 0);
      const altura = Math.max(ALTURA_MINIMA_GRADE, Math.floor(window.innerHeight - topo - (telaCheia ? 20 : 44)));
      setAlturaGrade((atual) => (atual === altura ? atual : altura));
    };
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  });

  const meses = useMemo(() => resultado?.meses || [], [resultado]);

  // Valores de cada linha por coluna (TOTAL + 'AAAA-MM'): nível 2 = o calculado; nível 1 = soma do
  // nível 2 (só com todos calculados); totalizadora = soma de todo o nível 2 acima dela (idem).
  const porLinha = useMemo(() => {
    const colunas = [[TOTAL, resultado?.valores || {}], ...meses.map((m) => [m.mes, m.valores])];
    const linhas = {};
    colunas.forEach(([coluna, valores]) => {
      let soma = 0;
      let completo = true;
      arvore.forEach((grupo) => {
        const chave = `g${grupo.id}`;
        linhas[chave] = linhas[chave] || {};
        if (grupo.totalizadora) {
          linhas[chave][coluna] = resultado && completo ? soma : null;
          return;
        }
        let doGrupo = 0;
        let grupoCompleto = grupo.filhos.length > 0;
        grupo.filhos.forEach((f) => {
          const v = resultado ? valores[f.id] : null;
          linhas[`m${f.id}`] = linhas[`m${f.id}`] || {};
          linhas[`m${f.id}`][coluna] = v ?? null;
          if (v === null || v === undefined) {
            completo = false;
            grupoCompleto = false;
          } else {
            soma += v;
            doGrupo += v;
          }
        });
        linhas[chave][coluna] = grupoCompleto ? doGrupo : null;
      });
    });
    return linhas;
  }, [arvore, resultado, meses]);

  function alternar(chave) {
    setAbertos((atual) => (atual.includes(chave) ? atual.filter((v) => v !== chave) : [...atual, chave]));
  }

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
  const larguraTabela = LARGURA_PRIMEIRA + (totalAberto ? LARGURA_TOTAL : LARGURA_TOTAL_FECHADO) + meses.length * LARGURA_COLUNA;
  const periodoTotal = `${dataBr(de).slice(0, 5)} a ${dataBr(ate)}`;

  // Uma linha da grade. `tipo`: 'totalizadora' | 'n1' | 'n2'. `pc`: valores por coluna (TOTAL / 'AAAA-MM').
  function linha({ chave, tipo, rotulo, icone, selo, pc = {}, podeAbrir = false, separar = false }) {
    const aberto = abertos.includes(chave);
    const e = ESTILO[tipo];
    const destaque = tipo !== 'n2';
    const celula = (v) => {
      if (v === null || v === undefined) return <span className="text-gray-300">—</span>;
      return Math.abs(v) < 0.005 ? '' : dinheiro(v);
    };
    const cor = (v) => (v === null || v === undefined || Math.abs(v) < 0.005 ? '' : corValor(v));
    return (
      <tr
        key={chave}
        onClick={() => podeAbrir && alternar(chave)}
        className={`group/linha ${podeAbrir ? 'cursor-pointer' : ''} ${separar ? '[&>td]:border-t [&>td]:border-t-gray-300' : ''}`}
      >
        <td
          className={`sticky left-0 z-10 border-b ${e.borda} ${e.fundo} ${e.py} pr-3 transition-colors ${
            tipo === 'totalizadora' ? '' : 'group-hover/linha:bg-gray-50'
          }`}
          style={{ paddingLeft: tipo === 'n2' ? 42 : 16 }}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {tipo === 'n1' && (
              <ChevronRight
                size={14}
                className={`shrink-0 transition-transform ${aberto ? 'rotate-90' : ''} ${podeAbrir ? 'text-gray-400' : 'text-gray-200'}`}
              />
            )}
            {/* Espaço da seta: a descrição da totalizadora alinha com a do nível 1. */}
            {tipo === 'totalizadora' && <span className="w-3.5 shrink-0" />}
            {icone && <span className="w-7 shrink-0 text-[11px] font-semibold tabular-nums text-gray-400">{icone}</span>}
            <span className={`min-w-0 truncate ${e.texto}`}>{rotulo}</span>
            {selo}
          </span>
        </td>
        {totalAberto ? (
          <td
            className={`sticky z-10 border-b border-r border-b-blue-100 border-r-blue-200 bg-blue-50 px-1.5 text-center tabular-nums transition-colors group-hover/linha:bg-blue-100 ${e.py} ${
              destaque ? 'text-[13px] font-semibold' : 'text-xs'
            } ${cor(pc[TOTAL])}`}
            style={{ left: LARGURA_PRIMEIRA }}
          >
            {celula(pc[TOTAL])}
          </td>
        ) : (
          <td
            onClick={(ev) => {
              ev.stopPropagation();
              setTotalAberto(true);
            }}
            title="Mostrar o Total do período"
            className={`sticky z-10 cursor-pointer border-b border-r border-b-blue-100 border-r-blue-200 bg-blue-50 transition-colors hover:bg-blue-100 ${e.py}`}
            style={{ left: LARGURA_PRIMEIRA }}
          />
        )}
        {meses.map((m, i) => (
          <td
            key={m.mes}
            className={`border-b px-1.5 text-center tabular-nums transition-colors ${e.borda} ${e.fundo} ${e.py} ${
              i > 0 ? 'border-l border-l-gray-200' : ''
            } ${tipo === 'totalizadora' ? '' : 'group-hover/linha:bg-gray-50'} ${
              tipo === 'totalizadora' ? 'text-[13px]' : 'text-xs'
            } ${destaque ? 'font-semibold' : ''} ${cor(pc[m.mes])}`}
          >
            {celula(pc[m.mes])}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <div
      className={
        telaCheia ? 'fixed inset-0 z-40 flex flex-col bg-white p-5' : 'min-w-0 rounded-card rounded-tl-none bg-white p-5 shadow-card'
      }
    >
      {telaCheia && (
        <div className="-mt-1 mb-4 flex items-center gap-3 border-b border-gray-100 pb-3">
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

      {(erro || semMascaraPoc) && (
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
        </div>
      )}

      {carregando || (calculando && !resultado) ? (
        <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
      ) : arvore.length === 0 ? (
        <div className="flex flex-col items-center gap-1 py-14 text-center">
          <BarChart3 size={26} className="mb-1 text-gray-300" />
          <p className="text-sm text-gray-600">Nenhuma máscara da DRE cadastrada ainda.</p>
          <p className="max-w-sm text-xs text-gray-400">Monte a estrutura da DRE (nível 1 e nível 2) na aba Máscaras.</p>
        </div>
      ) : (
        <div
          ref={gradeRef}
          onScroll={(ev) => setRolouX(ev.currentTarget.scrollLeft > 0)}
          className={`overflow-auto overscroll-x-contain rounded-lg border border-gray-200 ${rolouX ? SOMBRA_COLUNA_FIXA : ''}`}
          style={{ maxHeight: alturaGrade ?? undefined }}
        >
          <table
            className="border-separate border-spacing-0 text-left"
            style={{ tableLayout: 'fixed', width: larguraTabela, minWidth: '100%' }}
          >
            <colgroup>
              <col style={{ width: LARGURA_PRIMEIRA }} />
              <col style={{ width: totalAberto ? LARGURA_TOTAL : LARGURA_TOTAL_FECHADO }} />
              {meses.map((m) => (
                <col key={m.mes} style={{ width: LARGURA_COLUNA }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 border-b border-gray-200 bg-white py-3 pl-5 pr-3 align-bottom text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  DRE
                </th>
                {totalAberto ? (
                  <th
                    onClick={() => setTotalAberto(false)}
                    title="Recolher o Total"
                    className="sticky top-0 z-30 cursor-pointer border-b border-r border-b-blue-200 border-r-blue-200 bg-blue-100 px-2 py-3 text-center align-bottom transition-colors hover:bg-blue-200"
                    style={{ left: LARGURA_PRIMEIRA }}
                  >
                    <span className="inline-flex flex-col items-center gap-0.5">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-blue-800">
                        <ChevronLeft size={13} className="shrink-0 text-blue-500" />
                        Total
                      </span>
                      <span className="text-[10px] font-medium normal-case tracking-normal text-blue-600">{periodoTotal}</span>
                    </span>
                  </th>
                ) : (
                  <th
                    onClick={() => setTotalAberto(true)}
                    title="Mostrar o Total do período"
                    className="sticky top-0 z-30 cursor-pointer border-b border-r border-b-blue-200 border-r-blue-200 bg-blue-100 px-0 py-2 text-center align-middle transition-colors hover:bg-blue-200"
                    style={{ left: LARGURA_PRIMEIRA }}
                  >
                    <span className="inline-flex rotate-180 items-center gap-1 text-[11px] font-bold uppercase tracking-[0.2em] text-blue-800 [writing-mode:vertical-rl]">
                      Total
                      <ChevronLeft size={12} className="shrink-0 text-blue-500" />
                    </span>
                  </th>
                )}
                {meses.map((m, i) => {
                  const atual = m.mes === mesAtual;
                  const parcial = m.de.slice(8) !== '01' || m.ate !== fimDoMes(m.mes);
                  return (
                    <th
                      key={m.mes}
                      title={parcial ? `${dataBr(m.de)} a ${dataBr(m.ate)}` : undefined}
                      className={`sticky top-0 z-20 border-b px-3 py-3 text-center align-bottom ${i > 0 ? 'border-l border-l-gray-200' : ''} ${
                        atual ? 'border-b-2 border-b-primary-500 bg-[#1d5c8a]' : 'border-b-gray-200 bg-white'
                      }`}
                    >
                      {/* "OUT/2026" numa linha só, com o ano um pouco menor; o mês atual em azul forte, como no fluxo. */}
                      <span className={`text-[11px] font-semibold tracking-wider ${atual ? 'text-white' : 'text-gray-600'}`}>
                        {MESES_CAB[Number(m.mes.slice(5, 7)) - 1]}
                        <span className={`text-[10px] font-medium tracking-normal ${atual ? 'text-white/75' : 'text-gray-400'}`}>
                          /{m.mes.slice(0, 4)}
                        </span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className={calculando ? 'opacity-50 transition-opacity' : ''}>
              {arvore.map((grupo, i) => {
                if (grupo.totalizadora) {
                  return linha({
                    chave: `g${grupo.id}`,
                    tipo: 'totalizadora',
                    rotulo: grupo.descricao,
                    icone: SIMBOLO_ICONE[grupo.icone] && `(${SIMBOLO_ICONE[grupo.icone]})`,
                    pc: porLinha[`g${grupo.id}`],
                    separar: i > 0,
                  });
                }
                const chave = `g${grupo.id}`;
                return (
                  <Fragment key={chave}>
                    {linha({
                      chave,
                      tipo: 'n1',
                      rotulo: grupo.descricao,
                      icone: SIMBOLO_ICONE[grupo.icone] && `(${SIMBOLO_ICONE[grupo.icone]})`,
                      pc: porLinha[chave],
                      podeAbrir: grupo.filhos.length > 0,
                    })}
                    {abertos.includes(chave) &&
                      grupo.filhos.map((item) =>
                        linha({
                          chave: `m${item.id}`,
                          tipo: 'n2',
                          rotulo: item.descricao,
                          selo: item.realiza_poc && <SeloPoc tipo={item.tipo_poc} />,
                          pc: porLinha[`m${item.id}`],
                        })
                      )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const SIMBOLO_ICONE = { IGUAL: '=', MAIS: '+', MENOS: '-', MAIS_MENOS: '+/-' };

const ROTULO_TIPO_POC = { RECEITA: 'POC Receita', DESPESA: 'POC Despesa' };

// Selo da marcação "% POC" (nível 2, aba Máscaras), com o Tipo POC quando informado.
function SeloPoc({ tipo }) {
  return (
    <span
      title="% POC"
      className="ml-1 shrink-0 rounded bg-primary-50 px-1.5 py-px text-[10px] font-semibold text-primary-600 ring-1 ring-primary-100"
    >
      {ROTULO_TIPO_POC[tipo] || 'POC'}
    </span>
  );
}
