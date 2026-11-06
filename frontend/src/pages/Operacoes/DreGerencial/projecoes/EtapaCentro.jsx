import { Building2, HardHat } from 'lucide-react';
import SearchableSelect from '../../../../components/SearchableSelect';

const ORDEM_TIPO = (c) => (c.natureza === 'OBRA' ? 0 : c.natureza === 'ADMINISTRATIVO' ? 1 : 2);

const CAMPO =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:text-gray-400';

// Etapa 1: centro de custo e ciclo (mês de início e de fim). O centro não muda depois de criado o
// rascunho. Centros sem Tipo não podem ser orçados (o Tipo decide se há POC).
export default function EtapaCentro({ centros, valor, onChange, centroTravado, erro }) {
  const centro = centros.find((c) => String(c.sienge_id) === String(valor.centroId));
  return (
    <div className="space-y-5 p-6">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Centro de custo</label>
        <SearchableSelect
          value={valor.centroId ? String(valor.centroId) : ''}
          onChange={(v) => onChange({ ...valor, centroId: v ? Number(v) : null })}
          disabled={centroTravado}
          clearable={false}
          // Agrupadas pelo Tipo (a lista pede as opções já na ordem dos grupos), cada grupo na ordem da DRE.
          options={[...centros]
            .sort((a, b) => ORDEM_TIPO(a) - ORDEM_TIPO(b))
            .map((c) => ({
              value: String(c.sienge_id),
              label: `${c.sienge_id} - ${c.apelido || c.name}`,
              grupo: c.natureza === 'OBRA' ? 'Obras' : c.natureza === 'ADMINISTRATIVO' ? 'Administrativos' : 'Sem tipo',
            }))}
          placeholder="Selecione o centro de custo"
          emptyMessage="Nenhum centro com Realiza DRE."
        />
        {centro && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
            {centro.natureza === 'OBRA' ? (
              <>
                <HardHat size={13} className="text-primary-600" /> Obra · projeta a POC (vendas, custos e reconhecimento)
              </>
            ) : centro.natureza === 'ADMINISTRATIVO' ? (
              <>
                <Building2 size={13} className="text-primary-600" /> Administrativo · sem POC, direto ao plano de contas
              </>
            ) : (
              <span className="text-amber-700">Sem Tipo: defina Obra ou Administrativo na aba Centros Custos.</span>
            )}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Início do ciclo</label>
          <input
            type="month"
            value={valor.cicloInicio || ''}
            onChange={(e) => onChange({ ...valor, cicloInicio: e.target.value })}
            className={CAMPO}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Fim do ciclo</label>
          <input
            type="month"
            value={valor.cicloFim || ''}
            min={valor.cicloInicio || undefined}
            onChange={(e) => onChange({ ...valor, cicloFim: e.target.value })}
            className={CAMPO}
          />
        </div>
      </div>
      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{erro}</p>}
    </div>
  );
}
