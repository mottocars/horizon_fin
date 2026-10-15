import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarClock, FileSearch, Landmark, Wallet } from 'lucide-react';
import ControlesDashboard from '../ControlesDashboard';
import CabecalhoDashboard from '../CabecalhoDashboard';
import SearchableSelect from '../../../components/SearchableSelect';
import { getTelaFavorita, salvarTelaFavorita } from '../../../api/dashboards.api';
import { listEmpresas } from '../../../api/empresas.api';
import { listCentrosCustoDfc } from '../../../api/dfcCentros.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import DfcFluxoTab from '../../Operacoes/DfcConstrutoras/DfcFluxoTab';

// Dashboards > Econômico Financeiro — a tela inteira é do dashboard (só o menu lateral fica, ver
// AppShell.jsx): cabeçalho (nome do dashboard, título da tela e os filtros em uso) e o conteúdo
// ocupando o resto; o botão de menu abre o painel com as telas e os filtros da tela.
// Tela aberta: a da URL (?tela=); sem ela, a favorita do usuário (estrela, gravada no servidor);
// sem favorita, a primeira da lista (pedido do usuário).
// Fluxo de Caixa: a mesma grade da aba DFC do DFC Construtoras (DfcFluxoTab), com os filtros
// Empresa, Data início e fim e Centros de custo. A empresa fica na URL
// (?empresa_id=), como nas outras telas. As demais telas ainda serão construídas.
const DASHBOARD = 'economico-financeiro';
const TELAS = [
  { id: 'dre', label: 'Demonstração do Resultado', icon: BarChart3 },
  { id: 'fluxo-caixa', label: 'Fluxo de Caixa', icon: Wallet },
  { id: 'aging', label: 'Aging List', icon: CalendarClock },
  { id: 'detalhamento', label: 'Detalhamento Financeiro', icon: FileSearch },
  { id: 'saldos', label: 'Saldo das Contas', icon: Landmark },
];
const existe = (id) => TELAS.some((t) => t.id === id);

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Período padrão do fluxo (o mesmo da aba DFC): do mês anterior ao atual até o mês atual + 5.
function periodoPadrao() {
  const d = new Date();
  return { inicio: iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), fim: iso(new Date(d.getFullYear(), d.getMonth() + 6, 0)) };
}

function Campo({ rotulo, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{rotulo}</label>
      {children}
    </div>
  );
}

const classeData = 'w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100';

export default function EconomicoFinanceiroPage() {
  const [params, setParams] = useSearchParams();
  const [favorita, setFavorita] = useState(null);
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();

  function atualizarParams(patch) {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        Object.entries(patch).forEach(([k, v]) => (v === null || v === undefined || v === '' ? novo.delete(k) : novo.set(k, String(v))));
        return novo;
      },
      { replace: true }
    );
  }

  useEffect(() => {
    getTelaFavorita(DASHBOARD)
      .then((r) => setFavorita(existe(r.tela) ? r.tela : null))
      .catch(() => setFavorita(null));
  }, []);

  const daUrl = params.get('tela');
  const telaAtiva = existe(daUrl) ? daUrl : favorita || TELAS[0].id;
  const tela = TELAS.find((t) => t.id === telaAtiva);

  function favoritar(id) {
    const anterior = favorita;
    setFavorita(id);
    salvarTelaFavorita(DASHBOARD, id).catch(() => setFavorita(anterior));
  }

  // ─── Filtros ──────────────────────────────────────────────────────────────────────────────────
  const empresaId = params.get('empresa_id') || '';
  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
  const [periodo, setPeriodo] = useState(periodoPadrao);
  const [centros, setCentros] = useState([]);
  const [opcoesCentros, setOpcoesCentros] = useState([]);

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((r) => setEmpresas(r.data))
      .finally(() => setCarregandoEmpresas(false));
  }, []);

  // Usuário preso a uma empresa: ela vem marcada; com uma empresa só, já entra nela.
  useEffect(() => {
    if (empresaTravada && empresaIdTravada && empresaId !== String(empresaIdTravada)) atualizarParams({ empresa_id: empresaIdTravada });
    else if (!carregandoEmpresas && !empresaId && empresas.length === 1) atualizarParams({ empresa_id: empresas[0].id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaTravada, empresaIdTravada, carregandoEmpresas, empresas, empresaId]);

  // Centros com "Projeta DFC" da empresa; trocar de empresa limpa a seleção.
  useEffect(() => {
    setCentros([]);
    setOpcoesCentros([]);
    if (!empresaId) return;
    listCentrosCustoDfc(empresaId)
      .then((lista) =>
        setOpcoesCentros(
          lista
            .filter((c) => c.projeta_dfc)
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
            .map((c) => ({ value: c.sienge_id, label: c.name }))
        )
      )
      .catch(() => setOpcoesCentros([]));
  }, [empresaId]);

  const opcoesEmpresas = useMemo(() => empresas.map((e) => ({ value: e.id, label: nomeExibicaoEmpresa(e) })), [empresas]);
  const periodoValido = periodo.inicio && periodo.fim && periodo.fim >= periodo.inicio;

  const filtrosFluxo = (
    <>
      <Campo rotulo="Empresa">
        <SearchableSelect
          value={empresaId}
          onChange={(v) => atualizarParams({ empresa_id: v })}
          disabled={carregandoEmpresas || empresaTravada}
          options={opcoesEmpresas}
          placeholder={carregandoEmpresas ? 'Carregando...' : 'Selecione a empresa'}
          clearable={false}
        />
      </Campo>
      <div className="grid grid-cols-2 gap-2">
        <Campo rotulo="Data início">
          <input type="date" value={periodo.inicio} onChange={(e) => setPeriodo((p) => ({ ...p, inicio: e.target.value }))} className={classeData} />
        </Campo>
        <Campo rotulo="Data fim">
          <input type="date" value={periodo.fim} onChange={(e) => setPeriodo((p) => ({ ...p, fim: e.target.value }))} className={classeData} />
        </Campo>
      </div>
      {!periodoValido && <p className="text-xs text-amber-600">A data fim precisa ser igual ou depois da data início.</p>}
      <Campo rotulo="Centros de custo">
        <SearchableSelect
          multiple
          value={centros}
          onChange={(l) => setCentros(l || [])}
          disabled={!empresaId}
          options={opcoesCentros}
          placeholder="Todos os centros"
          larguraPainel={300}
        />
      </Campo>
    </>
  );

  // Etiquetas do cabeçalho: os filtros em uso na tela.
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesAno = (d) => `${MESES[Number(d.slice(5, 7)) - 1]}/${d.slice(0, 4)}`;
  const nomeEmpresa = opcoesEmpresas.find((e) => String(e.value) === String(empresaId))?.label;
  const nomesCentros = centros.map((id) => opcoesCentros.find((c) => String(c.value) === String(id))?.label).filter(Boolean);
  const etiquetas =
    telaAtiva === 'fluxo-caixa'
      ? [
          { rotulo: 'Empresa', valor: nomeEmpresa || '—' },
          { rotulo: 'Período', valor: periodoValido ? `${mesAno(periodo.inicio)} – ${mesAno(periodo.fim)}` : '—' },
          { rotulo: 'Centros', valor: nomesCentros.length ? (nomesCentros.length > 2 ? `${nomesCentros.length} selecionados` : nomesCentros.join(', ')) : 'Todos' },
          { rotulo: 'Fonte', valor: 'DFC Construtoras' },
        ]
      : [];

  return (
    <div className="flex h-full w-full flex-col gap-3 p-5">
      <CabecalhoDashboard dashboard="Econômico Financeiro" titulo={tela.label} etiquetas={etiquetas} />

      {telaAtiva === 'fluxo-caixa' && (
        <DfcFluxoTab
          variante="dashboard"
          empresaId={empresaId}
          inicio={periodo.inicio}
          fim={periodo.fim}
          centros={centros}
        />
      )}

      <ControlesDashboard
        telas={TELAS}
        telaAtiva={telaAtiva}
        onTela={(id) => atualizarParams({ tela: id })}
        telaFavorita={favorita}
        onFavoritar={favoritar}
        filtros={telaAtiva === 'fluxo-caixa' ? filtrosFluxo : null}
      />
    </div>
  );
}
