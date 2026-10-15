import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarClock, FileSearch, Landmark, Wallet } from 'lucide-react';
import ControlesDashboard from '../ControlesDashboard';
import { getTelaFavorita, salvarTelaFavorita } from '../../../api/dashboards.api';

// Dashboards > Econômico Financeiro — a tela inteira é do dashboard (só o menu lateral fica, ver
// AppShell.jsx), com o botão de menu (painel com as telas do dashboard e os filtros da tela).
// Tela aberta: a da URL (?tela=); sem ela, a favorita do usuário (estrela, gravada no servidor);
// sem favorita, a primeira da lista (pedido do usuário). O conteúdo de cada tela e os filtros ainda
// serão definidos.
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

  useEffect(() => {
    getTelaFavorita(DASHBOARD)
      .then((r) => setFavorita(existe(r.tela) ? r.tela : null))
      .catch(() => setFavorita(null));
  }, []);

  const daUrl = params.get('tela');
  const telaAtiva = existe(daUrl) ? daUrl : favorita || TELAS[0].id;

  function escolherTela(id) {
    setParams(
      (atual) => {
        const novo = new URLSearchParams(atual);
        novo.set('tela', id);
        return novo;
      },
      { replace: true }
    );
  }

  function favoritar(id) {
    const anterior = favorita;
    setFavorita(id);
    salvarTelaFavorita(DASHBOARD, id).catch(() => setFavorita(anterior));
  }

  return (
    <div className="h-full w-full">
      <ControlesDashboard
        telas={TELAS}
        telaAtiva={telaAtiva}
        onTela={escolherTela}
        telaFavorita={favorita}
        onFavoritar={favoritar}
      />
    </div>
  );
}
