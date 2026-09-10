import { useEffect, useState } from 'react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import SearchableSelect from '../../components/SearchableSelect';
import { listEmpresas } from '../../api/empresas.api';
import { gerarPlano } from '../../api/planosFinanceirosSienge.api';
import { nomeExibicaoEmpresa } from '../../utils/empresa';
import { useEmpresaTravada } from '../../hooks/useEmpresaTravada';

const MAX_NIVEIS = 7;

export default function GerarPlanoModal({ open, onClose, onGerado }) {
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();
  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [empresaId, setEmpresaId] = useState('');
  const [integracao, setIntegracao] = useState('sienge');
  const [quantidadeNiveis, setQuantidadeNiveis] = useState('');
  const [mascaraNiveis, setMascaraNiveis] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  useEffect(() => {
    if (!open) return;
    setEmpresaId(empresaTravada && empresaIdTravada ? empresaIdTravada : '');
    setIntegracao('sienge');
    setQuantidadeNiveis('');
    setMascaraNiveis([]);
    setError('');
    setFieldError('');
    setLoadingEmpresas(true);
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, [open, empresaTravada, empresaIdTravada]);

  function handleQuantidadeNiveisChange(value) {
    if (!/^[0-9]*$/.test(value)) return;
    setQuantidadeNiveis(value);

    const quantidade = Number(value);
    if (value !== '' && quantidade >= 1 && quantidade <= MAX_NIVEIS) {
      setMascaraNiveis(Array.from({ length: quantidade }, (_, i) => mascaraNiveis[i] || ''));
    } else {
      setMascaraNiveis([]);
    }
  }

  function handleNivelChange(index, value) {
    if (!/^[0-9]*$/.test(value)) return;
    setMascaraNiveis((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  const quantidadeValida =
    quantidadeNiveis !== '' && Number(quantidadeNiveis) >= 1 && Number(quantidadeNiveis) <= MAX_NIVEIS;

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
      const niveis = quantidadeValida ? mascaraNiveis.map((v) => (v === '' ? null : Number(v))) : undefined;
      const result = await gerarPlano(Number(empresaId), niveis);
      onGerado(result);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível gerar o plano financeiro.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Gerar Plano Financeiro">
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

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Quantos níveis a máscara tem?</label>
          <input
            type="text"
            inputMode="numeric"
            value={quantidadeNiveis}
            onChange={(e) => handleQuantidadeNiveisChange(e.target.value)}
            placeholder={`1 a ${MAX_NIVEIS}`}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          {quantidadeNiveis !== '' && !quantidadeValida && (
            <p className="mt-1 text-xs text-red-600">Informe um número entre 1 e {MAX_NIVEIS}.</p>
          )}
        </div>

        {quantidadeValida && (
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Máscara</label>
            <p className="mb-2 text-xs text-gray-400">
              Quantidade de dígitos do código que pertence a cada nível.
            </p>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${mascaraNiveis.length}, minmax(0, 1fr))` }}>
              {mascaraNiveis.map((valor, index) => (
                <div key={index}>
                  <label className="mb-1 block text-center text-xs text-gray-500">
                    Nível {index + 1}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={valor}
                    onChange={(e) => handleNivelChange(index, e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 py-2 text-center text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

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
