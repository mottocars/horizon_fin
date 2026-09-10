import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Contact, Database, RefreshCw } from 'lucide-react';
import Modal from '../../../../components/Modal';
import { sincronizarIncomeSienge } from '../../../../api/incomeSienge.api';
import { sincronizarCustomersSienge } from '../../../../api/customersSienge.api';
import { recalcularClusters } from '../../../../api/cobrancaClusters.api';

// Junta as ações que antes eram botões separados (o "Sincronizar agora" da
// extinta aba Painel Geral, e o "Recalcular clusters" desta tela) num só
// botão "Sincronizar" — clicar abre este modal, que deixa o usuário
// escolher qual delas rodar. `onClustersRecalculados` avisa a tela pra
// recarregar o resumo dos clusters assim que o recálculo termina;
// `onClientesAtualizados` avisa a aba Clientes pra recarregar o drilldown
// dela assim que "Atualizar clientes" termina (o resto do módulo não
// precisa saber — são recargas independentes, cada aba só escuta a que
// afeta o que ela mostra).
export default function SincronizarModal({ open, onClose, empresaId, onClustersRecalculados, onClientesAtualizados }) {
  const [executando, setExecutando] = useState(null); // 'base' | 'clientes' | 'clusters' | null
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');

  function fechar() {
    setResultado(null);
    setErro('');
    onClose();
  }

  async function handleAtualizarBase() {
    setErro('');
    setResultado(null);
    setExecutando('base');
    try {
      const r = await sincronizarIncomeSienge(empresaId);
      setResultado(
        `${r.total_importado.toLocaleString('pt-BR')} parcelas importadas do Sienge. Os clusters ainda refletem a base anterior — rode "Recalcular clusters" para atualizá-los com os dados novos.`
      );
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível atualizar a base do Sienge.');
    } finally {
      setExecutando(null);
    }
  }

  async function handleAtualizarClientes() {
    setErro('');
    setResultado(null);
    setExecutando('clientes');
    try {
      const r = await sincronizarCustomersSienge(empresaId);
      setResultado(`${r.total_importado.toLocaleString('pt-BR')} clientes importados do Sienge.`);
      onClientesAtualizados?.();
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível atualizar os clientes do Sienge.');
    } finally {
      setExecutando(null);
    }
  }

  async function handleRecalcular() {
    setErro('');
    setResultado(null);
    setExecutando('clusters');
    try {
      const r = await recalcularClusters(empresaId);
      setResultado(
        `${r.total_clientes.toLocaleString('pt-BR')} clientes recalculados com a versão ${r.versao_utilizada} do Motor de Risco.`
      );
      onClustersRecalculados?.();
    } catch (err) {
      setErro(err.response?.data?.message || 'Não foi possível recalcular os clusters.');
    } finally {
      setExecutando(null);
    }
  }

  return (
    <Modal open={open} title="Sincronizar" onClose={fechar}>
      <p className="text-sm text-gray-500">Escolha o que você quer sincronizar:</p>

      <div className="mt-4 space-y-3">
        <button
          type="button"
          onClick={handleAtualizarBase}
          disabled={Boolean(executando)}
          className="flex w-full items-start gap-3 rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Database size={18} className="mt-0.5 shrink-0 text-primary-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">Atualizar base</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Puxa de novo o contas a receber (parcelas e recebimentos) direto do Sienge. Pode levar alguns minutos.
            </p>
          </div>
          {executando === 'base' && <RefreshCw size={16} className="mt-0.5 shrink-0 animate-spin text-primary-600" />}
        </button>

        <button
          type="button"
          onClick={handleAtualizarClientes}
          disabled={Boolean(executando)}
          className="flex w-full items-start gap-3 rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Contact size={18} className="mt-0.5 shrink-0 text-primary-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">Atualizar clientes</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Puxa de novo o cadastro de clientes (dados pessoais, contatos, endereços) direto do Sienge.
            </p>
          </div>
          {executando === 'clientes' && <RefreshCw size={16} className="mt-0.5 shrink-0 animate-spin text-primary-600" />}
        </button>

        <button
          type="button"
          onClick={handleRecalcular}
          disabled={Boolean(executando)}
          className="flex w-full items-start gap-3 rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={18} className="mt-0.5 shrink-0 text-primary-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">Recalcular clusters</p>
            <p className="mt-0.5 text-xs text-gray-500">
              Aplica a versão vigente do Motor de Risco sobre a base já sincronizada, classificando cada cliente de
              novo.
            </p>
          </div>
          {executando === 'clusters' && <RefreshCw size={16} className="mt-0.5 shrink-0 animate-spin text-primary-600" />}
        </button>
      </div>

      {erro && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          <AlertTriangle size={15} className="shrink-0" />
          {erro}
        </div>
      )}
      {resultado && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          {resultado}
        </div>
      )}
    </Modal>
  );
}
