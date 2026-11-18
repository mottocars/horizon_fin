import { REGIMES } from './formatos';

// Peças comuns das abas Impacto DRE e Impacto DFC, com a identidade visual das tabelas da aba POC do DRE
// Gerencial (DreGerencial/PocTab.jsx): cabeçalho branco em caixa alta, linhas densas, primeira coluna
// congelada, grupos em cinza, totais em azul-escuro, valores com centavos e negativos em vermelho.

const NUM = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const fmt = (v) => Number(v).toLocaleString('pt-BR', NUM);

// Fundo, bordas e texto de cada tipo de linha (os mesmos da POC).
const ESTILO = {
  item: { fundo: 'bg-white group-hover:bg-gray-50', borda: 'border-b-gray-100', divisa: 'border-l-gray-100', texto: 'text-gray-800' },
  linha: { fundo: 'bg-white group-hover:bg-gray-50', borda: 'border-b-gray-100', divisa: 'border-l-gray-100', texto: 'text-gray-700' },
  grupo: { fundo: 'bg-gray-50 group-hover:bg-gray-100', borda: 'border-b-gray-200', divisa: 'border-l-gray-200', texto: 'font-bold text-gray-900' },
  total: { fundo: 'bg-[#1d5c8a]', borda: 'border-b-[#1d5c8a]', divisa: 'border-l-white/10', texto: 'font-bold text-white' },
  destaque: { fundo: 'bg-blue-50 group-hover:bg-blue-100', borda: 'border-b-blue-100', divisa: 'border-l-blue-100', texto: 'text-gray-800' },
};

// Classes de uma célula: a primeira (congelada, o rótulo) ou uma de valor.
export function celula(tipo = 'item', { primeira = false, recuo = 'pl-4', alinhar = 'text-right' } = {}) {
  const e = ESTILO[tipo] || ESTILO.item;
  return primeira
    ? `sticky left-0 z-[1] ${e.fundo} border-b ${e.borda} ${recuo} pr-3 py-1 text-xs ${e.texto}`
    : `${e.fundo} border-b border-l ${e.borda} ${e.divisa} px-3 py-1 ${alinhar} text-xs tabular-nums whitespace-nowrap ${tipo === 'grupo' || tipo === 'total' ? 'font-bold' : ''}`;
}

// Valor em R$ (sem o símbolo, com centavos, como a POC); null = traço.
export function Numero({ v, tipo }) {
  const total = tipo === 'total';
  if (v === null || v === undefined) return <span className={total ? 'text-white/50' : 'text-gray-300'}>—</span>;
  const n = Math.abs(v) < 0.005 ? 0 : v;
  return <span className={n < 0 ? (total ? 'text-red-300' : 'text-red-600') : total ? 'text-white' : 'text-gray-800'}>{fmt(n)}</span>;
}

// Diferença (com a reforma − hoje): verde quando melhora, vermelho quando piora; zero = traço.
export function Diferenca({ d, tipo }) {
  const total = tipo === 'total';
  if (Math.abs(d) < 0.005) return <span className={total ? 'text-white/50' : 'text-gray-300'}>—</span>;
  const cor = d > 0 ? (total ? 'text-emerald-300' : 'text-emerald-600') : total ? 'text-red-300' : 'text-red-600';
  return <span className={cor}>{`${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`}</span>;
}

// Cabeçalho no estilo da POC: `colunas` = [{ rotulo, esquerda }] (a primeira fica congelada).
export function Cabecalho({ colunas }) {
  return (
    <thead>
      <tr className="text-[11px] uppercase tracking-wide text-gray-700">
        {colunas.map((c, i) => (
          <th
            key={c.rotulo}
            className={
              i === 0
                ? 'sticky left-0 z-10 border-b border-gray-200 bg-white py-1.5 pl-4 pr-3 text-left align-bottom font-semibold'
                : `border-b border-l border-gray-200 bg-white px-3 py-1.5 align-bottom font-semibold ${c.esquerda ? 'text-left' : 'text-right'}`
            }
          >
            {c.rotulo}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// Um quadro: o título e o subtítulo em cima (como a linha de texto da POC) e a tabela com a borda da POC.
// `children` = o <thead> e o <tbody>.
export function Bloco({ titulo, subtitulo, children, rodape, larguraMinima = 'min-w-[640px]' }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
        {subtitulo && <span className="text-xs text-gray-500">{subtitulo}</span>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className={`w-full ${larguraMinima} border-separate border-spacing-0 text-left text-xs`}>{children}</table>
      </div>
      {rodape && <p className="mt-2 text-xs text-gray-500">{rodape}</p>}
    </div>
  );
}

export function SeloRegime({ centro }) {
  if (centro.natureza && centro.natureza !== 'OBRA') return <span className="text-gray-400">Administrativo</span>;
  const r = REGIMES[centro.regime];
  if (!r) return <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Não configurado</span>;
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.classe}`}>{r.curto}</span>;
}

// Tabela "hoje × com a reforma × diferença" de linhas { tipo: grupo | linha | total, descricao, hoje, reforma, nova }.
// Vai dentro de um Bloco.
export function TabelaComparativa({ linhas }) {
  return (
    <>
      <Cabecalho colunas={[{ rotulo: 'Linha' }, { rotulo: 'Projeção hoje' }, { rotulo: 'Com a reforma' }, { rotulo: 'Diferença' }]} />
      <tbody>
        {linhas.map((l) => {
          const linha = l.tipo === 'linha';
          return (
            <tr key={`${l.tipo}-${l.id}`} className="group">
              <td className={celula(l.tipo, { primeira: true, recuo: linha ? 'pl-[34px]' : 'pl-4' })}>
                {l.descricao}
                {l.nova && <span className="ml-2 rounded bg-primary-50 px-1.5 py-px text-[10px] font-semibold text-primary-700">reforma</span>}
              </td>
              <td className={celula(l.tipo)}>
                <Numero v={l.hoje} tipo={l.tipo} />
              </td>
              <td className={celula(l.tipo)}>
                <Numero v={l.reforma} tipo={l.tipo} />
              </td>
              <td className={celula(l.tipo)}>
                <Diferenca d={l.reforma - l.hoje} tipo={l.tipo} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </>
  );
}
