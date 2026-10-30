import { Fragment, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, Minimize2, TriangleAlert } from 'lucide-react';
import { listDreMascaras } from '../../../api/dreMascaras.api';
import { calcularDre } from '../../../api/dreDemonstrativo.api';

const moeda = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (iso) => iso.split('-').reverse().join('/');

// Demonstração (nível 1 + nível 2) da DRE, em formato de tabela — mesma mecânica visual de
// SaldosContasTab.jsx (primeira coluna com a hierarquia, valor alinhado à direita), num quadro de
// bordas arredondadas como o do fluxo de caixa do DFC Construtoras. Colunas: CONSOLIDADO (o
// totalizador = soma dos centros) e um centro de custo por coluna; descrição e consolidado ficam
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
  // Colunas de valor: o CONSOLIDADO (soma dos centros) e um centro de custo por coluna.
  const colunas = [
    { chave: 'consolidado', valores: resultado?.valores || {} },
    ...(resultado?.por_centro || []).map((c) => ({ chave: c.id, nome: c.nome, valores: c.valores })),
  ];

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
              <tr className="text-xs uppercase tracking-wide text-gray-400">
                <th className={`${COL_DESCRICAO} border-b border-gray-200 bg-white py-1.5 pl-4 align-bottom font-medium`}>Descrição</th>
                <th className={`${COL_CONSOLIDADO} border-b border-gray-200 bg-slate-100 px-4 py-1.5 text-right align-bottom font-semibold text-slate-600`}>
                  Consolidado
                </th>
                {colunas.slice(1).map((c) => (
                  <th
                    key={c.chave}
                    title={`${c.chave} - ${c.nome}`}
                    className={`${COL_CENTRO} border-b border-l border-gray-200 bg-white px-3 py-1.5 text-right align-bottom font-medium`}
                  >
                    <span className="line-clamp-2 whitespace-normal leading-tight">{c.nome}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={calculando ? 'opacity-50 transition-opacity' : ''}>
              {comAcumulado(arvore, colunas).map(({ grupo, acumulados }) => (
                <LinhaGrupo key={grupo.id} grupo={grupo} colunas={colunas} acumulados={acumulados} />
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

// Larguras fixas: a descrição e o consolidado ficam congelados à esquerda quando os centros rolam.
const COL_DESCRICAO = 'sticky left-0 z-10 w-[380px] min-w-[380px] max-w-[380px]';
const COL_CONSOLIDADO = 'sticky left-[380px] z-10 w-36 min-w-36 border-r border-r-gray-300';
const COL_CENTRO = 'w-32 min-w-32 max-w-32';

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
function LinhaGrupo({ grupo, colunas, acumulados }) {
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
          <td
            key={c.chave}
            className={`${i === 0 ? `${COL_CONSOLIDADO} bg-[#174a70]` : `${COL_CENTRO} border-l border-l-white/10 bg-[#1d5c8a]`} border-b border-b-[#1d5c8a] px-3 py-1 text-right text-xs font-bold tabular-nums`}
          >
            {acumulados[i] === null ? (
              <span className="text-white/50">—</span>
            ) : (
              <span className={acumulados[i] < 0 ? 'text-red-300' : 'text-white'}>{moeda(acumulados[i])}</span>
            )}
          </td>
        ))}
      </tr>
    );
  }

  const totalDoGrupo = (valores) => {
    const doGrupo = grupo.filhos.map((f) => valores[f.id]);
    return doGrupo.length && doGrupo.every((v) => v !== null && v !== undefined) ? doGrupo.reduce((t, v) => t + v, 0) : null;
  };

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
          <td
            key={c.chave}
            className={`${i === 0 ? `${COL_CONSOLIDADO} bg-slate-100` : `${COL_CENTRO} border-l border-l-gray-200 bg-gray-50`} border-b border-b-gray-200 px-3 py-1 text-right text-xs font-bold tabular-nums`}
          >
            <Valor valor={totalDoGrupo(c.valores)} cor="text-gray-900" />
          </td>
        ))}
      </tr>

      {grupo.filhos.length === 0 ? (
        <tr>
          <td className={`${COL_DESCRICAO} border-b border-gray-100 bg-white py-1 pl-20 text-xs italic text-gray-300`}>
            Nenhum item cadastrado nesta linha ainda.
          </td>
          <td className={`${COL_CONSOLIDADO} border-b border-gray-100 bg-slate-50`} />
          <td colSpan={colunas.length - 1} className="border-b border-gray-100" />
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
              <td
                key={c.chave}
                className={`${
                  i === 0 ? `${COL_CONSOLIDADO} bg-slate-50 font-semibold group-hover:bg-slate-100` : `${COL_CENTRO} border-l border-l-gray-100 group-hover:bg-gray-50`
                } border-b border-b-gray-100 px-3 py-0.5 text-right text-xs tabular-nums`}
              >
                <Valor valor={c.valores[item.id]} />
              </td>
            ))}
          </tr>
        ))
      )}
    </Fragment>
  );
}
