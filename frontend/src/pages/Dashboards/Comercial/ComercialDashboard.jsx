import { Handshake } from 'lucide-react';
import CabecalhoDashboard from '../CabecalhoDashboard';

// Dashboards > I.H - Comercial (pedido do usuário) — criado vazio, no layout dos outros dashboards
// (tela cheia, só o menu lateral). As telas entram aqui como no Econômico/Financeiro: lista TELAS +
// ControlesDashboard (menu flutuante) quando houver mais de uma.
const NOME = 'I.H - Comercial';

export default function ComercialDashboard() {
  return (
    <div className="flex min-h-full w-full flex-col gap-3 p-5">
      <CabecalhoDashboard dashboard={NOME} titulo="Comercial" />
      <div className="flex flex-1 items-center justify-center">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-card bg-white px-8 py-10 text-center shadow-card">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">
            <Handshake size={22} />
          </span>
          <h2 className="text-base font-semibold text-gray-900">Dashboard em construção</h2>
          <p className="text-sm text-gray-500">As telas do {NOME} ainda serão criadas.</p>
        </div>
      </div>
    </div>
  );
}
