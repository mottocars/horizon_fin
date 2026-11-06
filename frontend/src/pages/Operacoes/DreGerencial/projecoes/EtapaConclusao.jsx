import { Check } from 'lucide-react';
import { corValor, moeda, rotuloMesLongo } from './util';

// Etapa final: o orçamento concluído — o fechamento do ciclo no nível 1 da DRE (realizado até a trava,
// projetado e total). Fica aguardando "Salvar versão".
export default function EtapaConclusao({ resultado, centroNome }) {
  const { janela, niveis1 } = resultado;
  const temRealizado = janela.ciclo_inicio <= janela.trava;
  return (
    <div className="p-6">
      <div className="flex flex-col items-center text-center">
        <span className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-200 opacity-60 [animation-iteration-count:2]" />
          <span className="relative flex h-16 w-16 animate-item-sobe items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            <Check size={30} strokeWidth={2.5} />
          </span>
        </span>
        <h3 className="mt-4 text-lg font-semibold text-gray-900">Parabéns! Orçamento concluído.</h3>
        <p className="mt-1 text-sm text-gray-500">
          {centroNome} · ciclo de {rotuloMesLongo(janela.ciclo_inicio)} a {rotuloMesLongo(janela.ciclo_fim)}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">Aguardando Salvar versão.</p>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200">
        <table className="w-full border-separate border-spacing-0 text-left text-xs">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-blue-700">
              <th className="rounded-tl-lg border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 font-medium">Fechamento do ciclo</th>
              {temRealizado && (
                <th className="w-36 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 text-right font-medium">
                  Realizado até {rotuloMesLongo(janela.trava)}
                </th>
              )}
              <th className="w-36 border-b-2 border-blue-500 bg-blue-50 px-3 py-2.5 text-right font-medium">Projetado</th>
              <th className="w-40 rounded-tr-lg border-b-2 border-blue-500 bg-blue-100 px-3 py-2.5 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {niveis1.map((n) => (
              <tr key={n.id} className={n.totalizadora ? 'bg-blue-50/70' : 'bg-white'}>
                <td className={`border-b border-gray-100 px-3 py-1.5 font-semibold ${n.totalizadora ? 'text-blue-900' : 'text-gray-800'}`}>
                  {n.descricao}
                </td>
                {temRealizado && (
                  <td className={`border-b border-gray-100 px-3 py-1.5 text-right tabular-nums ${corValor(n.realizado)}`}>{moeda(n.realizado)}</td>
                )}
                <td className={`border-b border-gray-100 px-3 py-1.5 text-right tabular-nums ${corValor(n.projetado)}`}>{moeda(n.projetado)}</td>
                <td className={`border-b border-gray-100 bg-blue-50/40 px-3 py-1.5 text-right font-semibold tabular-nums ${corValor(n.total)}`}>
                  {moeda(n.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
