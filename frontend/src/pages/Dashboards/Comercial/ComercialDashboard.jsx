import { House } from 'lucide-react';
import ControlesDashboard from '../ControlesDashboard';
import CapaDashboard from '../capa/CapaDashboard';
import executiva from '../../../assets/dashboards/executiva-comercial.webp';

// Dashboards > Comercial (pedido do usuário) — no layout dos outros dashboards (tela cheia, só o menu
// lateral). Por enquanto só a capa: igual à do Econômico/Financeiro, em verde, com a executiva
// comercial (imagem do ChatGPT com o fundo recortado), abrindo com o menu de telas aberto. As telas
// novas entram em TELAS e no switch abaixo, como em EconomicoFinanceiroPage.jsx.
const TELAS = [{ id: 'home', label: 'Home', icon: House }];

export default function ComercialDashboard() {
  return (
    <div className="h-full w-full">
      <CapaDashboard imagem={executiva} nome="Comercial" tema="verde" />
      <ControlesDashboard telas={TELAS} telaAtiva="home" abertoInicial />
    </div>
  );
}
