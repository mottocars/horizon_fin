import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarClock, FileSearch, Landmark, Wallet } from 'lucide-react';
import ControlesDashboard from '../ControlesDashboard';
import CabecalhoDashboard from '../CabecalhoDashboard';
import { getTelaFavorita, salvarTelaFavorita } from '../../../api/dashboards.api';
import { listEmpresas } from '../../../api/empresas.api';
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import FluxoCaixaPainel from './fluxo/FluxoCaixaPainel';
import AgingPainel from './aging/AgingPainel';

// Dashboards > Econômico Financeiro — a tela inteira é do dashboard (só o menu lateral fica, ver
// AppShell.jsx): cabeçalho (nome do dashboard, título da tela e o contexto dos dados) e o conteúdo
// ocupando o resto; o botão de menu abre o painel com as telas.
// Tela aberta: a da URL (?tela=); sem ela, a favorita do usuário (estrela, gravada no servidor);
// sem favorita, a primeira da lista (pedido do usuário).
// Fluxo de Caixa: painel no layout do painel do CFO (fluxo/FluxoCaixaPainel.jsx), com os filtros na
// barra de controles dele. Aging List: no mesmo layout (aging/AgingPainel.jsx). A empresa fica na URL
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

  // ─── Empresa ──────────────────────────────────────────────────────────────────────────────────
  const empresaId = params.get('empresa_id') || '';
  const [empresas, setEmpresas] = useState([]);
  const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);

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

  const opcoesEmpresas = useMemo(() => empresas.map((e) => ({ value: e.id, label: nomeExibicaoEmpresa(e) })), [empresas]);
  // Logomarca (cadastro da empresa) da empresa escolhida, no canto direito do cabeçalho.
  const empresaAtual = empresas.find((e) => String(e.id) === String(empresaId));
  const marcaEmpresa = empresaAtual ? { logo: empresaAtual.logo || null, nome: nomeExibicaoEmpresa(empresaAtual) } : null;

  return (
    <div className="flex min-h-full w-full flex-col gap-3 p-5">
      {telaAtiva === 'fluxo-caixa' ? (
        <FluxoCaixaPainel
          dashboard="Econômico Financeiro"
          tituloTela={tela.label}
          empresaId={empresaId}
          onEmpresa={(v) => atualizarParams({ empresa_id: v })}
          opcoesEmpresas={opcoesEmpresas}
          empresaTravada={empresaTravada}
          carregandoEmpresas={carregandoEmpresas}
          marcaEmpresa={marcaEmpresa}
        />
      ) : telaAtiva === 'aging' ? (
        <AgingPainel
          dashboard="Econômico Financeiro"
          tituloTela={tela.label}
          empresaId={empresaId}
          onEmpresa={(v) => atualizarParams({ empresa_id: v })}
          opcoesEmpresas={opcoesEmpresas}
          empresaTravada={empresaTravada}
          carregandoEmpresas={carregandoEmpresas}
          marcaEmpresa={marcaEmpresa}
        />
      ) : (
        <CabecalhoDashboard dashboard="Econômico Financeiro" titulo={tela.label} marca={marcaEmpresa} />
      )}

      <ControlesDashboard
        telas={TELAS}
        telaAtiva={telaAtiva}
        onTela={(id) => atualizarParams({ tela: id })}
        telaFavorita={favorita}
        onFavoritar={favoritar}
      />
    </div>
  );
}
