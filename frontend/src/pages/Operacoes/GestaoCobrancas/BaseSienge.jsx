import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, RefreshCw } from 'lucide-react';
import Button from '../../../components/Button';
import { getResumoIncomeSienge, sincronizarIncomeSienge } from '../../../api/incomeSienge.api';

function formatarDataHora(data) {
  if (!data) return null;
  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Puxa o contas a receber (bulk-data/v1/income) do Sienge da empresa
// selecionada e substitui inteiro o que já estava salvo — é essa base
// (sie_income e as tabelas filhas) que alimenta o Motor de Risco pra
// clusterizar o cliente, e no futuro a régua de cobrança.
export default function BaseSienge({ empresaId }) {
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  useEffect(() => {
    setErro('');
    setSucesso('');
    if (!empresaId) {
      setResumo(null);
      return;
    }
    setCarregando(true);
    getResumoIncomeSienge(empresaId)
      .then(setResumo)
      .finally(() => setCarregando(false));
  }, [empresaId]);

  async function handleSincronizar() {
    setErro('');
    setSucesso('');
    setSincronizando(true);
    try {
      const resultado = await sincronizarIncomeSienge(empresaId);
      setSucesso(`${resultado.total_importado.toLocaleString('pt-BR')} parcelas importadas com sucesso.`);
      setResumo(await getResumoIncomeSienge(empresaId));
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível sincronizar a base do Sienge.');
    } finally {
      setSincronizando(false);
    }
  }

  if (!empresaId) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
        <Database size={28} className="mb-3 text-gray-300" />
        <h2 className="text-sm font-semibold text-gray-900">Selecione uma empresa</h2>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Escolha a empresa no filtro acima para sincronizar a base de contas a receber do Sienge.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            <Database size={20} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Base de contas a receber (Sienge)</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {carregando
                ? 'Carregando...'
                : resumo?.total_parcelas > 0
                  ? `${resumo.total_parcelas.toLocaleString('pt-BR')} parcelas — última sincronização em ${formatarDataHora(resumo.ultima_sincronizacao)}.`
                  : 'Nenhuma parcela sincronizada ainda para esta empresa.'}
            </p>
          </div>
        </div>
        <Button
          onClick={handleSincronizar}
          disabled={sincronizando}
          title="Buscar tudo de novo direto do Sienge — pode levar alguns minutos"
          className="shrink-0"
        >
          <RefreshCw size={16} className={sincronizando ? 'animate-spin' : ''} />
          Sincronizar agora
        </Button>
      </div>

      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-gray-500">
        Puxa todas as parcelas do contas a receber diretamente do Sienge, com os recebimentos e movimentos
        bancários de cada uma. Cada sincronização substitui inteiro o que já estava salvo desta empresa — pode
        levar alguns minutos dependendo do volume.
      </p>

      {erro && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          <AlertTriangle size={15} className="shrink-0" />
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
          <CheckCircle2 size={15} className="shrink-0" />
          {sucesso}
        </div>
      )}
    </div>
  );
}
