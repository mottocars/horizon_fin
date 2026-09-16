import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, LayoutGrid, Trophy, Users } from 'lucide-react';
import Card from '../../../components/Card';
import { getMetricasUso } from '../../../api/logsAcesso.api';
import { TELAS_SISTEMA } from '../../../config/telas';
import TendenciaAcessosChart from './TendenciaAcessosChart';
import RankingTelasChart from './RankingTelasChart';
import HeatmapUsuarioTela from './HeatmapUsuarioTela';

const PRESETS = [
  { id: '7', label: '7 dias', dias: 7 },
  { id: '30', label: '30 dias', dias: 30 },
  { id: '90', label: '90 dias', dias: 90 },
];

function toISODate(data) {
  return data.toISOString().slice(0, 10);
}

function calcularPeriodo(dias) {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - (dias - 1));
  return { dataInicio: toISODate(inicio), dataFim: toISODate(fim) };
}

const TOTAL_TELAS_SISTEMA = Object.keys(TELAS_SISTEMA).length;

function StatTile({ icon: Icon, label, value, hint }) {
  return (
    <Card className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="mt-0.5 truncate text-2xl font-semibold text-gray-900" title={typeof value === 'string' ? value : undefined}>
          {value}
        </p>
        {hint && <p className="mt-0.5 truncate text-xs text-gray-400">{hint}</p>}
      </div>
    </Card>
  );
}

export default function MetricasUsoPage() {
  const [preset, setPreset] = useState('30');
  const [periodo, setPeriodo] = useState(() => calcularPeriodo(30));
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);

  const carregar = useCallback((periodoAtual) => {
    setCarregando(true);
    getMetricasUso(periodoAtual)
      .then((resultado) => {
        setDados(resultado);
        setErro(null);
      })
      .catch(() => setErro('Não foi possível carregar as métricas de uso.'))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    if (!periodo.dataInicio || !periodo.dataFim) return;
    carregar(periodo);
  }, [periodo.dataInicio, periodo.dataFim, carregar]);

  function aplicarPreset(dias, id) {
    setPreset(id);
    setPeriodo(calcularPeriodo(dias));
  }

  function editarData(campo, valor) {
    setPreset(null);
    setPeriodo((prev) => ({ ...prev, [campo]: valor }));
  }

  const primeiraCarga = dados === null && carregando;
  const telaMaisAcessadaLabel = dados?.resumo.telaMaisAcessada
    ? TELAS_SISTEMA[dados.resumo.telaMaisAcessada.tela]?.title || dados.resumo.telaMaisAcessada.tela
    : '—';

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => aplicarPreset(p.dias, p.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    preset === p.id ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex min-w-0 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Data início</label>
                <input
                  type="date"
                  value={periodo.dataInicio}
                  max={periodo.dataFim}
                  onChange={(e) => editarData('dataInicio', e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Data fim</label>
                <input
                  type="date"
                  value={periodo.dataFim}
                  min={periodo.dataInicio}
                  max={toISODate(new Date())}
                  onChange={(e) => editarData('dataFim', e.target.value)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {primeiraCarga ? (
        <div className="py-16 text-center text-sm text-gray-400">Carregando métricas...</div>
      ) : erro && !dados ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle size={20} />
          </div>
          <p className="text-sm font-medium text-gray-700">{erro}</p>
          <button
            type="button"
            onClick={() => carregar(periodo)}
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Tentar novamente
          </button>
        </Card>
      ) : (
        <div className={`space-y-4 transition-opacity ${carregando ? 'opacity-60' : 'opacity-100'}`}>
          {erro && (
            <p className="text-xs font-medium text-amber-600">
              Não foi possível atualizar agora — mostrando o último período carregado.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={Activity} label="Total de acessos" value={dados.resumo.totalAcessos.toLocaleString('pt-BR')} />
            <StatTile icon={Users} label="Usuários ativos" value={dados.resumo.usuariosAtivos.toLocaleString('pt-BR')} />
            <StatTile
              icon={LayoutGrid}
              label="Telas acessadas"
              value={dados.resumo.telasAcessadas.toLocaleString('pt-BR')}
              hint={`de ${TOTAL_TELAS_SISTEMA} telas no sistema`}
            />
            <StatTile
              icon={Trophy}
              label="Tela mais acessada"
              value={telaMaisAcessadaLabel}
              hint={dados.resumo.telaMaisAcessada ? `${dados.resumo.telaMaisAcessada.total.toLocaleString('pt-BR')} acessos` : undefined}
            />
          </div>

          <TendenciaAcessosChart porDia={dados.porDia} />

          {/* minmax(0, ...) em vez de 1fr/1.4fr puro — sem isso a coluna do
              heatmap (tabela larga, com scroll próprio) "estoura" pro
              tamanho do seu conteúdo e espreme a do ranking até quase
              sumir, já que uma track fr sozinha tem mínimo automático
              baseado no maior min-content dos filhos. */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <RankingTelasChart porTela={dados.porTela} />
            <HeatmapUsuarioTela matriz={dados.matriz} porTela={dados.porTela} />
          </div>
        </div>
      )}
    </div>
  );
}
