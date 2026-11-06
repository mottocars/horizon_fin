import { Percent } from 'lucide-react';
import { corValor, moeda, pct, rotuloMes, rotuloMesLongo } from './util';

const COL_NOME = 'sticky left-0 w-[300px] min-w-[300px] max-w-[300px]';
const COL_MES = 'w-[116px] min-w-[116px]';
// Total dos meses mostrados (os projetados).
const totalDe = (l) => Object.values(l.meses).reduce((t, v) => t + (Number(v) || 0), 0);

function Indicador({ rotulo, de, para }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] text-gray-500">{rotulo}</p>
      <p className="mt-0.5 flex items-baseline gap-2 tabular-nums">
        <span className="text-sm text-gray-400">{pct(de)}</span>
        <span className="text-gray-300">→</span>
        <span className="text-lg font-semibold text-gray-900">{pct(para)}</span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <span className="block h-full bg-primary-500" style={{ width: `${Math.min(100, (para || 0) * 100)}%` }} />
      </div>
    </div>
  );
}

// Etapa 5 (obra): as POCs mês a mês, do primeiro mês projetado ao fim do ciclo, e as linhas de nível 2
// que passam pela POC (receitas pocadas, custo dos imóveis, estornos, comissão, legalização…) com o
// valor reconhecido em cada mês — o resultado do motor da DRE com o que foi informado nas etapas.
export default function EtapaPoc({ calculo }) {
  const { meses, poc, nivel2, janela } = calculo;
  const linhas = nivel2.filter((l) => l.poc);
  const ultimo = poc.meses[poc.meses.length - 1];
  // Líquida = POC de Despesa − fração distratada: o que de fato fica reconhecido do custo (o CIV aplica a
  // POC de Despesa e o Estorno de Custo devolve a distratada).
  const liquida = (p) => (p.despesa === null ? null : p.despesa - (p.distratada || 0));
  const linhasPoc = [
    { chave: 'receita', rotulo: 'POC de Receita', titulo: 'Custo acumulado ÷ orçamento vigente', valor: (p) => p.receita },
    { chave: 'despesa', rotulo: 'POC de Despesa', titulo: 'Fração ideal vendida (todo contrato) + permutas', valor: (p) => p.despesa },
    { chave: 'distratada', rotulo: 'Fração distratada', titulo: 'Fração ideal dos contratos distratados', valor: (p) => p.distratada },
    { chave: 'liquida', rotulo: 'POC de Despesa líquida', titulo: 'POC de Despesa − fração distratada', valor: liquida, forte: true },
  ];
  return (
    <div className="space-y-4 p-6">
      <div className="flex gap-3">
        <Indicador rotulo={`POC de Receita · ${rotuloMesLongo(janela.trava)} → ${rotuloMesLongo(janela.ciclo_fim)}`} de={poc.trava.receita} para={ultimo.receita} />
        <Indicador rotulo="POC de Despesa líquida" de={liquida(poc.trava)} para={liquida(ultimo)} />
        <div className="min-w-0 flex-1 rounded-xl border border-gray-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <p className="text-[11px] text-gray-500">Custo acumulado no fim · orçamento</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">R$ {moeda(ultimo.custo)}</p>
          <p className="text-[11px] tabular-nums text-gray-400">de R$ {moeda(ultimo.orcamento)}</p>
        </div>
      </div>

      <div className="inline-block min-w-full rounded-lg border border-gray-200 align-top">
        <table className="border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-blue-700">
              <th className={`${COL_NOME} top-0 z-30 rounded-tl-lg border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 font-medium`}>
                <span className="flex items-center gap-1.5">
                  <Percent size={13} /> POC
                </span>
              </th>
              {meses.map((m) => (
                <th key={m} className={`${COL_MES} sticky top-0 z-10 border-b-2 border-blue-500 bg-blue-50 px-2 py-2.5 text-right font-medium tabular-nums`}>
                  {rotuloMes(m)}
                </th>
              ))}
              <th className="sticky top-0 z-10 w-[132px] min-w-[132px] rounded-tr-lg border-b-2 border-blue-500 bg-blue-100 px-3 py-2.5 text-right font-semibold">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {linhasPoc.map((l) => (
              <tr key={l.chave} className="bg-primary-50">
                <td
                  className={`${COL_NOME} z-[1] border-b border-gray-100 bg-primary-50 px-3 py-1.5 text-gray-800 ${l.forte ? 'font-semibold' : 'font-medium'}`}
                  title={l.titulo}
                >
                  {l.rotulo}
                </td>
                {poc.meses.map((p) => {
                  const v = l.valor(p);
                  const cheio = (l.chave === 'receita' || l.chave === 'liquida') && v >= 0.999995;
                  return (
                    <td
                      key={p.mes}
                      title={v === null ? '' : pct(v, 6)}
                      className={`${COL_MES} border-b border-gray-100 px-2 py-1.5 text-right tabular-nums ${cheio ? 'font-semibold text-primary-700' : 'text-gray-700'}`}
                    >
                      {pct(v)}
                    </td>
                  );
                })}
                <td className="border-b border-gray-100 bg-blue-50 px-3 py-1.5" />
              </tr>
            ))}
            {linhas.map((l) => (
              <tr key={l.id} className="bg-white hover:bg-gray-50/60">
                <td className={`${COL_NOME} z-[1] border-b border-gray-100 bg-white px-3 py-1.5 text-gray-800`}>{l.descricao}</td>
                {meses.map((m) => {
                  const v = l.meses[m];
                  return (
                    <td key={m} className={`${COL_MES} border-b border-gray-100 px-2 py-1.5 text-right tabular-nums ${v ? corValor(v) : 'text-gray-300'}`}>
                      {v === null ? '—' : v ? moeda(v) : '—'}
                    </td>
                  );
                })}
                <td className={`border-b border-gray-100 bg-blue-50/40 px-3 py-1.5 text-right font-semibold tabular-nums ${corValor(totalDe(l))}`}>
                  {moeda(totalDe(l))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
