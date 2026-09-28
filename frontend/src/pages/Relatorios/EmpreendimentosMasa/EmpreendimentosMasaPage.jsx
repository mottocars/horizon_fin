import { Building2 } from 'lucide-react';
import Card from '../../../components/Card';

// Placeholder — pedido do usuário foi só reservar o lugar no menu por enquanto (tela em
// branco), conteúdo real fica pra outra rodada.
export default function EmpreendimentosMasaPage() {
  return (
    <div className="space-y-4">
      <Card className="flex min-h-70 flex-col items-center justify-center text-center">
        <Building2 size={28} className="mb-3 text-gray-300" />
        <span className="mb-3 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium uppercase tracking-wide text-primary-600">
          Em breve
        </span>
        <h2 className="text-sm font-semibold text-gray-900">Empreendimentos Masa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">Relatório em desenvolvimento.</p>
      </Card>
    </div>
  );
}
