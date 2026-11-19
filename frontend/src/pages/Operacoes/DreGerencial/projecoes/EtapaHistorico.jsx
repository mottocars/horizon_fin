import { useMemo } from 'react';
import { Loader2, Lock } from 'lucide-react';
import DreTab from '../DreTab';
import { rotuloMesLongo, somarMeses } from './util';

// Etapa 2: a DRE realizada do centro até o mês da trava — a MESMA tabela da aba DRE (DreTab com os dados
// prontos), um ano por coluna e o Consolidado fixo; clicar num ano abre o mês a mês dele (com AH %). A
// trava é o último mês do realizado (a projeção começa no mês seguinte) e é o CORTE da versão da DRE (o
// último mês fechado) — a mesma pra todo orçamento, sem escolha (versões da DRE, aba Versões).
export default function EtapaHistorico({ historico, recalculando, trava, empresaId }) {
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
            <p className="text-sm font-semibold text-gray-900">Realizado até {trava ? rotuloMesLongo(trava) : '—'}</p>
            <p className="text-xs text-gray-500">
              O corte da versão da DRE (o último mês fechado){trava ? ` · projeção a partir de ${rotuloMesLongo(somarMeses(trava, 1))}` : ''}
            </p>
          </div>
        </div>
        <span className="flex items-center gap-3">
          {recalculando && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <Loader2 size={13} className="animate-spin" /> Recalculando até {rotuloMesLongo(trava)}…
            </span>
          )}
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
