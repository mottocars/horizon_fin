import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import SearchableSelect from '../../components/SearchableSelect';
import { listEmpresas } from '../../api/empresas.api';
import { gerarCentrosCusto } from '../../api/centrosCustoSienge.api';
import { nomeExibicaoEmpresa } from '../../utils/empresa';
import { useEmpresaTravada } from '../../hooks/useEmpresaTravada';

export default function GerarCentroCustoModal({ open, onClose, onGerado }) {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');
  const [integracao, setIntegracao] = useState('sienge');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  useEffect(() => {
    if (!open) return;
    setEmpresaId(empresaTravada && empresaIdTravada ? empresaIdTravada : '');
    setIntegracao('sienge');
    setError('');
    setFieldError('');
    setLoadingEmpresas(true);
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, [open, empresaTravada, empresaIdTravada]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!empresaId) {
      setFieldError('Selecione uma empresa.');
      return;
    }
    setFieldError('');

    setSaving(true);
    try {
      const result = await gerarCentrosCusto(Number(empresaId));
      onGerado(result);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível gerar os centros de custo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Gerar Centros de Custo">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
          <SearchableSelect
            value={empresaId}
            onChange={setEmpresaId}
            disabled={loadingEmpresas || empresaTravada}
            options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
            placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
            emptyMessage="Nenhuma empresa encontrada."
          />
          {fieldError && <p className="mt-1 text-xs text-red-600">{fieldError}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de Integração</label>
          <SearchableSelect
            value={integracao}
            onChange={setIntegracao}
            options={[{ value: 'sienge', label: 'Sienge' }]}
            placeholder="Selecione"
            clearable={false}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Gerar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
