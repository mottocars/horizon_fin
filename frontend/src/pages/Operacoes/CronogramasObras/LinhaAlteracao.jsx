import { formatarData } from '../../CentrosCusto/cronogramaDatas';

const data = (d) => (d ? formatarData(d) : 'sem data');

// Uma alteração de etapa (linhasDaObra de cronogramaObras.js): etapa, de quando para quando.
export default function LinhaAlteracao({ linha }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="w-24 shrink-0 font-medium text-gray-700">{linha.etapa}</span>
      <span className="text-gray-400">{linha.rotulo}</span>
      <span className="tabular-nums text-gray-400 line-through decoration-gray-300">{data(linha.antes)}</span>
      <span className="text-gray-300">→</span>
      <span className="font-semibold tabular-nums text-gray-900">{data(linha.depois)}</span>
    </li>
  );
}
