import { useMemo } from 'react';
import { Loader2, Lock } from 'lucide-react';
import DreTab from '../DreTab';
import { rotuloMesLongo, somarMeses } from './util';

// Etapa 2: a DRE realizada do centro até o mês da trava — a MESMA tabela da aba DRE (DreTab com os dados
// prontos), um ano por coluna e o Consolidado fixo; clicar num ano abre o mês a mês dele (com AH %). A
// trava é o último mês do realizado (a projeção começa no mês seguinte): entre o mês antes do primeiro
// lançamento e o mês atual, sempre antes do fim do ciclo. Mudou a trava, a tabela recalcula até ela.
export default function EtapaHistorico({ historico, recalculando, trava, onTrava, cicloFim, empresaId }) {
  const { primeiro_mes: primeiro, mes_atual: atual } = historico;
  const min = somarMeses(primeiro, -1);
  const max = atual < cicloFim ? atual : somarMeses(cicloFim, -1);
  const invalida = !trava || trava < min || trava > max;
  const dados = useMemo(
    () => (historico.resultado ? { arvore: historico.arvore, resultado: historico.resultado } : null),
    [historico]
  );

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-primary-100 bg-primary-50/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-primary-600 shadow-sm">
            <Lock size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">Travar o realizado até</p>
            <p className="text-xs text-gray-500">
              {trava && !invalida ? `Projeção a partir de ${rotuloMesLongo(somarMeses(trava, 1))}` : 'Escolha o último mês realizado'}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-3">
          {recalculando && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 size={13} className="animate-spin" /> Recalculando até {rotuloMesLongo(trava)}…
            </span>
          )}
          <input
            type="month"
            value={trava || ''}
            min={min}
            max={max}
            onChange={(e) => onTrava(e.target.value || null)}
            className={`w-44 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 ${
              invalida ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
            }`}
          />
        </span>
      </div>

      {dados ? (
        <div className={recalculando ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
          <DreTab
            variante="dashboard"
            colunasSao="anos"
            empresaId={empresaId}
            de={historico.resultado.de}
            ate={historico.resultado.ate}
            dadosProntos={dados}
          />
        </div>
      ) : (
        <p className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">
          Sem valores realizados até {rotuloMesLongo(historico.ate)}.
        </p>
      )}
    </div>
  );
}
