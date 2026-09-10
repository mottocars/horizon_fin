import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, PieChart } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import SearchableSelect from '../../components/SearchableSelect';
import { getItem, updateEnriquecimento } from '../../api/planosFinanceirosSienge.api';
import { listMascaras } from '../../api/mascaras.api';

const MESES = [
  { key: 'jan', label: 'Janeiro' },
  { key: 'fev', label: 'Fevereiro' },
  { key: 'mar', label: 'Março' },
  { key: 'abr', label: 'Abril' },
  { key: 'mai', label: 'Maio' },
  { key: 'jun', label: 'Junho' },
  { key: 'jul', label: 'Julho' },
  { key: 'ago', label: 'Agosto' },
  { key: 'set', label: 'Setembro' },
  { key: 'out', label: 'Outubro' },
  { key: 'nov', label: 'Novembro' },
  { key: 'dez', label: 'Dezembro' },
];

function parseBRNumber(value) {
  if (!value) return '';
  const cleaned = value.trim();
  if (cleaned.includes(',')) {
    return cleaned.replace(/\./g, '').replace(',', '.');
  }
  return cleaned;
}

function formatBRNumber(value) {
  if (value === null || value === undefined || value === '') return '';
  const num = Number(value);
  if (Number.isNaN(num)) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TIPO_PROJECAO_OPTIONS = [
  { value: 'BASE_ZERO', label: 'Base Zero' },
  { value: 'ULTIMO_REALIZADO', label: 'Último Realizado' },
  { value: 'MEDIA_ULTIMOS_MESES', label: 'Média dos Últimos Meses' },
  { value: 'REALIZADO_ANO_ANTERIOR', label: 'Realizado Ano Anterior' },
];

const FONTE_DADOS_OPTIONS = [
  { value: 'SIENGE', label: 'Sienge' },
  { value: 'CONTA_AZUL', label: 'Conta Azul' },
  { value: 'PORTAL_CONSTRUTORAS', label: 'Portal das Construtoras' },
];

const REGRAS_CALCULO_POR_FONTE = {
  SIENGE: [
    { value: 'FINANCEIRO', label: 'Financeiro' },
    { value: 'ORCAMENTO_OBRAS', label: 'Orçamento de Obras' },
    { value: 'ORCAMENTO_EMPRESARIAL', label: 'Orçamento Empresarial' },
  ],
  CONTA_AZUL: [{ value: 'FINANCEIRO', label: 'Financeiro' }],
  PORTAL_CONSTRUTORAS: [
    { value: 'REPASSE_CAIXA_PF', label: 'Repasse Caixa PF' },
    { value: 'NOVO_REGISTRO_PF', label: 'Novo Registro PF' },
    { value: 'MEDICAO_PF', label: 'Medição PF' },
    { value: 'REPASSE_CAIXA_PJ', label: 'Repasse Caixa PJ' },
    { value: 'AMORTIZACAO_PJ', label: 'Amortização PJ' },
    { value: 'JUROS_PJ', label: 'Juros PJ' },
  ],
};

const emptyIncrementos = Object.fromEntries(MESES.map((m) => [`incremento_${m.key}`, '']));

const emptyForm = {
  classificacao_dre_id: '',
  classificacao_dfc_id: '',
  submascara_dre_id: '',
  submascara_dfc_id: '',
  projeta_mes_atual_dfc: '',
  pacote_id: '',
  ...emptyIncrementos,
  tipo_projecao: '',
  quantidade_meses: '',
  gera_orcamento: '',
  fonte_dados: '',
  regra_calculo: '',
};

export default function PlanoFinanceiroItemDetalhe() {
  const { empresaId, siengeId } = useParams();
  const navigate = useNavigate();

  const [item, setItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [classificacoesDre, setClassificacoesDre] = useState([]);
  const [classificacoesDfc, setClassificacoesDfc] = useState([]);
  const [submascarasDre, setSubmascarasDre] = useState([]);
  const [submascarasDfc, setSubmascarasDfc] = useState([]);
  const [pacotes, setPacotes] = useState([]);
  const [geral, setGeral] = useState('');

  const loadItem = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getItem(empresaId, siengeId);
      setItem(data);
      const incrementos = Object.fromEntries(
        MESES.map((m) => [`incremento_${m.key}`, formatBRNumber(data[`incremento_${m.key}`])])
      );
      setGeral('');
      setForm({
        classificacao_dre_id: data.classificacao_dre_id ? String(data.classificacao_dre_id) : '',
        classificacao_dfc_id: data.classificacao_dfc_id ? String(data.classificacao_dfc_id) : '',
        submascara_dre_id: data.submascara_dre_id ? String(data.submascara_dre_id) : '',
        submascara_dfc_id: data.submascara_dfc_id ? String(data.submascara_dfc_id) : '',
        projeta_mes_atual_dfc:
          data.projeta_mes_atual_dfc === true ? 'true' : data.projeta_mes_atual_dfc === false ? 'false' : '',
        pacote_id: data.pacote_id ? String(data.pacote_id) : '',
        ...incrementos,
        tipo_projecao: data.tipo_projecao || '',
        quantidade_meses: data.quantidade_meses ?? '',
        gera_orcamento:
          data.gera_orcamento === true ? 'true' : data.gera_orcamento === false ? 'false' : '',
        fonte_dados: data.fonte_dados || '',
        regra_calculo: data.regra_calculo || '',
      });
    } finally {
      setLoading(false);
    }
  }, [empresaId, siengeId]);

  useEffect(() => {
    loadItem();
    listMascaras('DRE', empresaId).then(setClassificacoesDre);
    listMascaras('DFC', empresaId).then(setClassificacoesDfc);
    listMascaras('SUBMASCARA_DRE', empresaId).then(setSubmascarasDre);
    listMascaras('SUBMASCARA_DFC', empresaId).then(setSubmascarasDfc);
    listMascaras('PACOTES', empresaId).then(setPacotes);
  }, [loadItem, empresaId]);

  const isBaseZero = form.tipo_projecao === 'BASE_ZERO';
  const mostrarCamposProjecao = form.tipo_projecao !== '' && !isBaseZero;

  function handleChange(field, value) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'fonte_dados') next.regra_calculo = '';
      return next;
    });
  }

  function handleGeralChange(value) {
    if (!/^-?[0-9.,]*$/.test(value)) return;
    setGeral(value);
  }

  function handleReplicarTodos() {
    setForm((prev) => {
      const next = { ...prev };
      MESES.forEach((m) => {
        next[`incremento_${m.key}`] = geral;
      });
      return next;
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    if (item?.tp_conta === 'T') return;
    setError('');
    setSuccess(false);
    setSaving(true);
    try {
      const clearExtras = !mostrarCamposProjecao;
      const incrementosPayload = Object.fromEntries(
        MESES.map((m) => [
          `incremento_${m.key}`,
          clearExtras ? '' : parseBRNumber(form[`incremento_${m.key}`]),
        ])
      );
      const updated = await updateEnriquecimento(empresaId, siengeId, {
        ...form,
        ...incrementosPayload,
        quantidade_meses: form.tipo_projecao === 'MEDIA_ULTIMOS_MESES' ? form.quantidade_meses : '',
        gera_orcamento: form.gera_orcamento === '' ? '' : form.gera_orcamento === 'true',
        fonte_dados: clearExtras ? '' : form.fonte_dados,
        regra_calculo: clearExtras ? '' : form.regra_calculo,
        projeta_mes_atual_dfc:
          form.projeta_mes_atual_dfc === '' ? '' : form.projeta_mes_atual_dfc === 'true',
      });
      setItem(updated);
      const incrementosAtualizados = Object.fromEntries(
        MESES.map((m) => [`incremento_${m.key}`, formatBRNumber(updated[`incremento_${m.key}`])])
      );
      setForm((prev) => ({
        ...prev,
        ...incrementosAtualizados,
        quantidade_meses: updated.quantidade_meses ?? '',
        gera_orcamento:
          updated.gera_orcamento === true ? 'true' : updated.gera_orcamento === false ? 'false' : '',
        fonte_dados: updated.fonte_dados || '',
        regra_calculo: updated.regra_calculo || '',
        projeta_mes_atual_dfc:
          updated.projeta_mes_atual_dfc === true
            ? 'true'
            : updated.projeta_mes_atual_dfc === false
              ? 'false'
              : '',
      }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  }

  const travado = item?.tp_conta === 'T';

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>;
  }

  if (!item) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <PieChart size={28} className="text-gray-300" />
        <p className="text-sm text-gray-500">Conta não encontrada.</p>
        <Button variant="secondary" onClick={() => navigate(`/cadastros/planos-financeiros/${empresaId}`)}>
          Voltar
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(`/cadastros/planos-financeiros/${empresaId}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Planos Financeiros
      </button>

      <Card>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <PieChart size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{item.name}</h2>
            <p className="text-xs text-gray-500">Código {item.sienge_id}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {travado && (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
              Esta é uma conta totalizadora (tp_conta = T) e não pode ser editada.
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
              Alterações salvas com sucesso.
            </div>
          )}

          <fieldset disabled={travado} className="contents space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Classificação DRE">
              <SearchableSelect
                value={form.classificacao_dre_id}
                onChange={(value) => handleChange('classificacao_dre_id', value)}
                options={classificacoesDre.map((c) => ({ value: c.id, label: c.descricao }))}
                emptyMessage="Nenhuma classificação encontrada."
              />
              {classificacoesDre.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  Nenhuma classificação DRE cadastrada em Máscaras ainda.
                </p>
              )}
            </Field>

            <Field label="Classificação DFC">
              <SearchableSelect
                value={form.classificacao_dfc_id}
                onChange={(value) => handleChange('classificacao_dfc_id', value)}
                options={classificacoesDfc.map((c) => ({ value: c.id, label: c.descricao }))}
                emptyMessage="Nenhuma classificação encontrada."
              />
              {classificacoesDfc.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  Nenhuma classificação DFC cadastrada em Máscaras ainda.
                </p>
              )}
            </Field>

            <Field label="Submáscara DRE">
              <SearchableSelect
                value={form.submascara_dre_id}
                onChange={(value) => handleChange('submascara_dre_id', value)}
                options={submascarasDre.map((c) => ({ value: c.id, label: c.descricao }))}
                emptyMessage="Nenhuma submáscara encontrada."
              />
              {submascarasDre.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  Nenhuma submáscara DRE cadastrada em Máscaras ainda.
                </p>
              )}
            </Field>

            <Field label="Submáscara DFC">
              <SearchableSelect
                value={form.submascara_dfc_id}
                onChange={(value) => handleChange('submascara_dfc_id', value)}
                options={submascarasDfc.map((c) => ({ value: c.id, label: c.descricao }))}
                emptyMessage="Nenhuma submáscara encontrada."
              />
              {submascarasDfc.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  Nenhuma submáscara DFC cadastrada em Máscaras ainda.
                </p>
              )}
            </Field>

            <Field label="Projeta Mês Atual DFC">
              <SearchableSelect
                value={form.projeta_mes_atual_dfc}
                onChange={(value) => handleChange('projeta_mes_atual_dfc', value)}
                options={[
                  { value: 'true', label: 'Sim' },
                  { value: 'false', label: 'Não' },
                ]}
              />
            </Field>

            <Field label="Pacote">
              <SearchableSelect
                value={form.pacote_id}
                onChange={(value) => handleChange('pacote_id', value)}
                options={pacotes.map((c) => ({ value: c.id, label: c.descricao }))}
                emptyMessage="Nenhum pacote encontrado."
              />
              {pacotes.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  Nenhum pacote cadastrado em Máscaras ainda.
                </p>
              )}
            </Field>

            <Field label="Gera Orçamento">
              <SearchableSelect
                value={form.gera_orcamento}
                onChange={(value) => handleChange('gera_orcamento', value)}
                options={[
                  { value: 'true', label: 'Sim' },
                  { value: 'false', label: 'Não' },
                ]}
              />
            </Field>

            <Field label="Tipo de Projeção">
              <SearchableSelect
                value={form.tipo_projecao}
                onChange={(value) => handleChange('tipo_projecao', value)}
                options={TIPO_PROJECAO_OPTIONS}
                emptyMessage="Nenhum tipo encontrado."
              />
            </Field>

            {mostrarCamposProjecao && (
              <Field label="Fonte de Dados">
                <SearchableSelect
                  value={form.fonte_dados}
                  onChange={(value) => handleChange('fonte_dados', value)}
                  options={FONTE_DADOS_OPTIONS}
                  emptyMessage="Nenhuma fonte encontrada."
                />
              </Field>
            )}

            {mostrarCamposProjecao && (
              <Field label="Regra de Cálculo">
                <SearchableSelect
                  value={form.regra_calculo}
                  disabled={!form.fonte_dados}
                  onChange={(value) => handleChange('regra_calculo', value)}
                  options={REGRAS_CALCULO_POR_FONTE[form.fonte_dados] || []}
                  emptyMessage="Nenhuma regra encontrada."
                />
              </Field>
            )}

            {form.tipo_projecao === 'MEDIA_ULTIMOS_MESES' && (
              <Field label="Quantidade de Meses">
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={isBaseZero}
                  value={form.quantidade_meses}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (/^[0-9]*$/.test(raw)) handleChange('quantidade_meses', raw);
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:bg-gray-50 disabled:opacity-60"
                />
              </Field>
            )}
          </div>

          {mostrarCamposProjecao && (
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="mb-3 text-xs text-gray-500">
                Informe o percentual "Geral" e clique em "Replicar para todos" para aplicá-lo a
                todos os meses. Depois disso, você pode alterar qualquer mês individualmente.
                Aceita valores negativos.
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                <Field label="Geral">
                  <div className="flex gap-2">
                    <PercentInput value={geral} onChange={handleGeralChange} />
                    <button
                      type="button"
                      onClick={handleReplicarTodos}
                      title="Replicar para todos os meses, substituindo valores já preenchidos"
                      className="shrink-0 rounded-lg bg-primary-600 px-2 text-xs font-medium text-white hover:bg-primary-700"
                    >
                      Replicar todos
                    </button>
                  </div>
                </Field>
                {MESES.map((m) => (
                  <Field key={m.key} label={m.label}>
                    <PercentInput
                      value={form[`incremento_${m.key}`]}
                      onChange={(value) => handleChange(`incremento_${m.key}`, value)}
                    />
                  </Field>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={saving}>
              Salvar alterações
            </Button>
          </div>
          </fieldset>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

function PercentInput({ value, onChange, className = '' }) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        placeholder="0,00"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          if (/^-?[0-9.,]*$/.test(raw)) onChange(raw);
        }}
        className={`w-full rounded-lg border border-gray-200 px-3 py-2 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 ${className}`}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
        %
      </span>
    </div>
  );
}
