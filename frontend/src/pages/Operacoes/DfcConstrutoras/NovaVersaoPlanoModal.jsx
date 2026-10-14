import { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { listCentrosCustoDfc } from '../../../api/dfcCentros.api';
import { criarVersaoPlanoDfc } from '../../../api/dfcPlanoContas.api';

// Cria a versão própria do plano de contas pra um centro de custo (aba Plano Contas). Começa como
// cópia do plano Global de hoje; dali em diante é editada à parte e tem prioridade no Orçamento e
// na Projeção CEF daquele centro. Lista os centros com "Projeta DFC" que ainda não têm versão.
export default function NovaVersaoPlanoModal({ open, onClose, empresaId, versoes, onCriada }) {
  const [centros, setCentros] = useState([]);
  const [centroId, setCentroId] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open || !empresaId) return;
    setCentroId('');
    setErro('');
    const jaTem = new Set(versoes.map((v) => v.centro_id));
    listCentrosCustoDfc(empresaId)
      .then((lista) =>
        setCentros(
          lista
            .filter((c) => c.projeta_dfc && !jaTem.has(c.sienge_id))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        )
      )
      .catch(() => setCentros([]));
  }, [open, empresaId, versoes]);

  async function criar() {
    setErro('');
    setSalvando(true);
    try {
      const criada = await criarVersaoPlanoDfc(empresaId, Number(centroId));
      onCriada(criada);
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível criar o plano.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={salvando ? () => {} : onClose} title="Novo plano por centro de custo">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-gray-500">
          O plano começa como uma <strong className="font-medium text-gray-700">cópia do plano Global</strong> de hoje
          (Máscara DFC e Origem Projeção de cada conta). Depois é editado à parte e passa a valer só para o centro
          escolhido — no Orçamento e na Projeção CEF. Os demais centros continuam seguindo o Global.
        </p>
        {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Centro de custo</label>
          <SearchableSelect
            value={centroId}
            onChange={(v) => setCentroId(v || '')}
            options={centros.map((c) => ({ value: c.sienge_id, label: c.name }))}
            placeholder={centros.length ? 'Selecione o centro de custo' : 'Nenhum centro disponível'}
            emptyMessage="Todos os centros com Projeta DFC já têm plano próprio."
            clearable={false}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={criar} disabled={!centroId} loading={salvando}>
            Criar plano
          </Button>
        </div>
      </div>
    </Modal>
  );
}
