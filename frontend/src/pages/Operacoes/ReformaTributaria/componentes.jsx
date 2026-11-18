import { moeda, REGIMES } from './formatos';

// Peças comuns das abas Impacto DRE e Impacto DFC.

export const CABECALHO = 'border-b-2 border-blue-500 bg-blue-50 text-xs font-medium uppercase tracking-wide text-blue-700';

// Diferença (com a reforma − hoje): verde quando melhora, vermelho quando piora.
export const corDiferenca = (d) => (Math.abs(d) < 0.5 ? 'text-gray-400' : d > 0 ? 'text-emerald-600' : 'text-red-600');
export const comSinal = (d) => (Math.abs(d) < 0.5 ? '—' : `${d > 0 ? '+' : '−'}${moeda(Math.abs(d))}`);
export const comSinalCompacto = (d) => (Math.abs(d) < 0.5 ? 'R$ 0' : `${d > 0 ? '+' : '−'}${moeda(Math.abs(d), { compacta: true })}`);

export function Bloco({ titulo, subtitulo, children, rodape }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
        {subtitulo && <p className="mt-0.5 text-xs text-gray-500">{subtitulo}</p>}
      </div>
      <div className="overflow-x-auto">{children}</div>
      {rodape && <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-gray-500">{rodape}</p>}
    </div>
  );
}

export function SeloRegime({ centro }) {
  if (centro.natureza && centro.natureza !== 'OBRA') return <span className="text-xs text-gray-400">Administrativo</span>;
  const r = REGIMES[centro.regime];
  if (!r) return <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Não configurado</span>;
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.classe}`}>{r.curto}</span>;
}

// Tabela "hoje × com a reforma × diferença" de linhas { tipo: grupo | linha | total, descricao, hoje, reforma, nova }.
export function TabelaComparativa({ linhas, valor }) {
  return (
    <table className="w-full min-w-[640px] text-sm">
      <thead>
        <tr className={CABECALHO}>
          <th className="py-2.5 pl-4 pr-3 text-left">Linha</th>
          <th className="px-3 py-2.5 text-right">Projeção hoje</th>
          <th className="px-3 py-2.5 text-right">Com a reforma</th>
          <th className="py-2.5 pl-3 pr-4 text-right">Diferença</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => {
          const d = l.reforma - l.hoje;
          const total = l.tipo === 'total';
          const linha = l.tipo === 'linha';
          const pequeno = linha ? 'text-xs' : '';
          return (
            <tr
              key={`${l.tipo}-${l.id}`}
              className={`border-b border-gray-100 ${total ? 'bg-gray-50 font-semibold text-gray-900' : linha ? 'text-gray-600' : 'font-medium text-gray-800'}`}
            >
              <td className={`py-2.5 pr-3 ${linha ? 'pl-9 text-xs' : 'pl-4'}`}>
                {l.descricao}
                {l.nova && <span className="ml-2 rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700">reforma</span>}
              </td>
              <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${pequeno}`}>{valor(l.hoje)}</td>
              <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${pequeno}`}>{valor(l.reforma)}</td>
              <td className={`whitespace-nowrap py-2.5 pl-3 pr-4 text-right tabular-nums ${pequeno} ${corDiferenca(d)}`}>{comSinal(d)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
