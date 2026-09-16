import Card from '../../../components/Card';
import { TELAS_SISTEMA } from '../../../config/telas';

const LIMITE = 10;

export default function RankingTelasChart({ porTela }) {
  const top = porTela.slice(0, LIMITE);
  const maiorValor = Math.max(1, ...top.map((t) => t.total));
  const restantes = porTela.length - top.length;

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-900">Telas mais acessadas</h2>
      <p className="text-xs text-gray-500">Ranking de acessos no período selecionado</p>

      {top.length === 0 ? (
        <p className="mt-6 py-6 text-center text-sm text-gray-400">Sem acessos registrados nesse período.</p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {top.map((item) => {
            const label = TELAS_SISTEMA[item.tela]?.title || item.tela;
            const pct = Math.max(3, Math.round((item.total / maiorValor) * 100));
            return (
              <div key={item.tela} className="group -mx-1 flex items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-gray-50">
                <p className="w-36 shrink-0 truncate text-xs text-gray-600 sm:w-44" title={label}>
                  {label}
                </p>
                <div className="h-2 min-w-0 flex-1 bg-gray-100">
                  <div
                    className="h-2 bg-primary-600 transition-[width]"
                    style={{ width: `${pct}%`, borderRadius: '0 4px 4px 0' }}
                  />
                </div>
                <p className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-gray-700">
                  {item.total.toLocaleString('pt-BR')}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {restantes > 0 && (
        <p className="mt-3 text-xs text-gray-400">+{restantes} outras telas com acesso no período.</p>
      )}
    </Card>
  );
}
