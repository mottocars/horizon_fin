import { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { listCentrosCustoDre } from '../../../api/dreCentros.api';
import { criarVersaoPlanoDre } from '../../../api/drePlanoContas.api';

// Cria o plano de contas próprio de um centro de custo (aba Plano de Contas da DRE) — mesma janela
// do Plano Contas da DFC (NovaVersaoPlanoModal.jsx de DfcConstrutoras). O usuário escolhe de onde
// ele começa: cópia do Global, cópia do plano de outro centro ou em branco. Dali em diante é editado
// à parte. Lista os centros com "Realiza DRE" (aba Centros Custos) que ainda não têm plano próprio
// — mesmo esquema do "Projeta DFC" na DFC.
export default function NovaVersaoPlanoModal({ open, onClose, empresaId, versoes, onCriada }) {
  const [centros, setCentros] = useState([]);
  const [centroId, setCentroId] = useState('');
  const [copiarDe, setCopiarDe] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open || !empresaId) return;
    setCentroId('');
    setCopiarDe('');
    setErro('');
    const jaTem = new Set(versoes.map((v) => v.centro_id));
    listCentrosCustoDre(empresaId)
      .then((lista) =>
        setCentros(
          lista
            .filter((c) => c.realiza_dre && !jaTem.has(c.sienge_id))
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        )
      )
      .catch(() => setCentros([]));
  }, [open, empresaId, versoes]);

  const opcoesOrigem = [
    { value: 'global', label: 'Copiar o plano Global' },
    ...versoes.map((v) => ({ value: String(v.centro_id), label: `Copiar o plano de ${v.name}` })),
    { value: 'branco', label: 'Começar em branco' },
  ];

  async function criar() {
    setErro('');
    setSalvando(true);
    try {
      const origem = copiarDe === 'global' || copiarDe === 'branco' ? copiarDe : Number(copiarDe);
      const criada = await criarVersaoPlanoDre(empresaId, Number(centroId), origem);
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
          O plano próprio passa a valer só para o centro escolhido. Os demais centros continuam seguindo o Global.
        </p>
        {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Centro de custo</label>
          <SearchableSelect
            value={centroId}
            onChange={(v) => setCentroId(v || '')}
            options={centros.map((c) => ({ value: c.sienge_id, label: c.name }))}
            placeholder={centros.length ? 'Selecione o centro de custo' : 'Nenhum centro disponível'}
            emptyMessage="Nenhum centro com Realiza DRE sem plano próprio. Marque na aba Centros Custos."
            clearable={false}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Começar a partir de</label>
          <SearchableSelect
            value={copiarDe}
            onChange={(v) => setCopiarDe(v ? String(v) : '')}
            options={opcoesOrigem}
            placeholder="Copiar algum plano ou começar em branco?"
            clearable={false}
          />
          <p className="mt-1.5 text-[11px] text-gray-400">
            {copiarDe === 'branco'
              ? 'O plano começa sem nenhuma Máscara DRE — tudo a preencher.'
              : copiarDe
                ? 'O plano começa com a Máscara DRE de cada conta do plano escolhido; depois é editado à parte.'
                : 'Escolha um plano pra copiar ou comece em branco.'}
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={criar} disabled={!centroId || !copiarDe} loading={salvando}>
            Criar plano
          </Button>
        </div>
      </div>
    </Modal>
  );
}
