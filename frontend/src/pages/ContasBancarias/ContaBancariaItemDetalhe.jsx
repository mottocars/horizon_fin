import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Landmark } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import SearchableSelect from '../../components/SearchableSelect';
import { getItem, listBancos, updateEnriquecimento } from '../../api/contasBancariasSienge.api';

const CLASSIFICACOES = [
  { value: 'APLICACAO', label: 'Aplicação' },
  { value: 'BLOQUEADA', label: 'Bloqueada' },
  { value: 'CHEQUE_ESPECIAL', label: 'Cheque Especial' },
  { value: 'DEDICADA', label: 'Dedicada' },
  { value: 'GARANTIDA', label: 'Garantida' },
  { value: 'LIBERADA', label: 'Liberada' },
];

// O Sienge guarda o código do banco em banco_numero ("104", "001", "341"...).
// Só vira sugestão se esse código existir na lista de bancos brasileiros — códigos
// internos do Sienge (ex.: 901 "Escritório 01") ficam sem preenchimento.
function sugerirBanco(bancoNumero, bancos) {
  const digitos = String(bancoNumero ?? '').replace(/\D/g, '');
  if (!digitos) return '';
  const codigo = digitos.padStart(3, '0');
  return bancos.some((b) => b.codigo === codigo) ? codigo : '';
}

// Mesmo padrão dos filtros do Espião NFe/NFSe (corCampoFiltro em EspiaoNfeNfsePage.jsx):
// âmbar quando o campo está em branco, azul claro quando já tem valor — dá pra ver de
// relance o que ainda falta preencher na conta.
// A borda azul é primary-100/500 (não 200/400 como no Espião): o tema (styles/index.css)
// só define primary 50, 100, 500, 600 e 700 — classe de tom inexistente não gera CSS e a
// borda cairia na cor padrão (preta).
const COR_CAMPO_VAZIO = 'border-amber-200 bg-amber-50 focus:border-amber-400';
const COR_CAMPO_PREENCHIDO = 'border-primary-100 bg-primary-50 focus:border-primary-500';

function estaPreenchido(valor) {
  return String(valor ?? '').trim() !== '';
}

function corCampo(valor) {
  return estaPreenchido(valor)
    ? `${COR_CAMPO_PREENCHIDO} focus:ring-primary-100`
    : `${COR_CAMPO_VAZIO} focus:ring-amber-100`;
}

// O gatilho do SearchableSelect já traz o próprio anel de foco (primary-100), então aqui
// vão só borda e fundo — repetir o anel geraria conflito de especificidade no Tailwind.
function corSelect(valor) {
  return estaPreenchido(valor) ? COR_CAMPO_PREENCHIDO : COR_CAMPO_VAZIO;
}

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

const emptyForm = {
  banco_enriquecido: '',
  agencia_enriquecida: '',
  conta_enriquecida: '',
  digito: '',
  classificacao: '',
  projeta_saldo: '',
  saldo_inicial: '',
  data_saldo_inicial: '',
};

export default function ContaBancariaItemDetalhe() {
  const { empresaId, companyId, numeroConta } = useParams();
  const navigate = useNavigate();
  // A tela-mãe (lista/cadastro) virou a aba "Contas Bancárias" de Operações > Saldo Contas
  // Bancárias — volta pra lá com a mesma empresa já selecionada.
  const destinoVoltar = `/operacoes/saldo-contas-bancarias?aba=contas&empresa_id=${empresaId}`;

  const [item, setItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [bancos, setBancos] = useState([]);
  const [erroBancos, setErroBancos] = useState(false);
  const [bancoSugerido, setBancoSugerido] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const loadItem = useCallback(async () => {
    setLoading(true);
    try {
      // A lista de bancos vem de uma API externa: se ela falhar, a tela abre do mesmo
      // jeito, só sem as opções (e o banco já salvo continua aparecendo).
      const [data, listaBancos] = await Promise.all([
        getItem(empresaId, companyId, numeroConta),
        listBancos().catch(() => null),
      ]);
      const lista = listaBancos || [];
      const sugerido = data.banco_enriquecido ? '' : sugerirBanco(data.banco_numero, lista);
      setBancos(lista);
      setErroBancos(!listaBancos);
      setBancoSugerido(sugerido);
      setItem(data);
      setForm({
        banco_enriquecido: data.banco_enriquecido || sugerido,
        agencia_enriquecida: data.agencia_enriquecida || '',
        conta_enriquecida: data.conta_enriquecida || '',
        digito: data.digito || '',
        classificacao: data.classificacao || '',
        projeta_saldo:
          data.projeta_saldo === true ? 'true' : data.projeta_saldo === false ? 'false' : '',
        saldo_inicial: formatBRNumber(data.saldo_inicial),
        data_saldo_inicial: data.data_saldo_inicial ? data.data_saldo_inicial.slice(0, 10) : '',
      });
    } finally {
      setLoading(false);
    }
  }, [empresaId, companyId, numeroConta]);

  useEffect(() => {
    loadItem();
  }, [loadItem]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const bancosOpcoes = useMemo(() => {
    const opcoes = bancos.map((b) => ({ value: b.codigo, label: `${b.codigo} - ${b.nome}` }));
    // Valor já salvo que não está na lista (ex.: a API de bancos falhou agora) continua
    // selecionável, senão o campo pareceria vazio e o próximo "Salvar" apagaria o banco.
    if (form.banco_enriquecido && !opcoes.some((o) => o.value === form.banco_enriquecido)) {
      opcoes.unshift({ value: form.banco_enriquecido, label: form.banco_enriquecido });
    }
    return opcoes;
  }, [bancos, form.banco_enriquecido]);

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setSaving(true);
    try {
      const updated = await updateEnriquecimento(empresaId, companyId, numeroConta, {
        ...form,
        projeta_saldo: form.projeta_saldo === '' ? '' : form.projeta_saldo === 'true',
        saldo_inicial: parseBRNumber(form.saldo_inicial),
      });
      setItem(updated);
      setForm((prev) => ({ ...prev, saldo_inicial: formatBRNumber(updated.saldo_inicial) }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>;
  }

  if (!item) {
    return (
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <Landmark size={28} className="text-gray-300" />
        <p className="text-sm text-gray-500">Conta bancária não encontrada.</p>
        <Button variant="secondary" onClick={() => navigate(destinoVoltar)}>
          Voltar
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(destinoVoltar)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Contas Bancárias
      </button>

      <Card>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <Landmark size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{item.nome}</h2>
            <p className="text-xs text-gray-500">Conta {item.numero_conta}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
              Alterações salvas com sucesso.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Banco">
              <SearchableSelect
                value={form.banco_enriquecido}
                onChange={(value) => handleChange('banco_enriquecido', value)}
                options={bancosOpcoes}
                placeholder="Selecione o banco"
                emptyMessage="Nenhum banco encontrado."
                corClasses={corSelect(form.banco_enriquecido)}
              />
              {erroBancos && (
                <p className="mt-1 text-xs text-red-500">
                  Não foi possível carregar a lista de bancos. Recarregue a página para tentar de novo.
                </p>
              )}
              {!item.banco_enriquecido && bancoSugerido && form.banco_enriquecido === bancoSugerido && (
                <p className="mt-1 text-xs text-gray-400">
                  Preenchido pelo código do banco no Sienge ({item.banco_numero}). Salve para gravar.
                </p>
              )}
            </Field>

            <Field label="Agência">
              <input
                type="text"
                value={form.agencia_enriquecida}
                onChange={(e) => handleChange('agencia_enriquecida', e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${corCampo(form.agencia_enriquecida)}`}
              />
            </Field>

            <div className="flex gap-3">
              <Field label="Conta" className="flex-1">
                <input
                  type="text"
                  value={form.conta_enriquecida}
                  onChange={(e) => handleChange('conta_enriquecida', e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${corCampo(form.conta_enriquecida)}`}
                />
              </Field>

              <Field label="Dígito" className="w-16 shrink-0">
                <input
                  type="text"
                  maxLength={1}
                  value={form.digito}
                  onChange={(e) => handleChange('digito', e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-center text-sm focus:outline-none focus:ring-2 ${corCampo(form.digito)}`}
                />
              </Field>
            </div>

            <Field label="Classificação">
              <SearchableSelect
                value={form.classificacao}
                onChange={(value) => handleChange('classificacao', value)}
                options={CLASSIFICACOES}
                placeholder="Selecione a classificação"
                corClasses={corSelect(form.classificacao)}
              />
            </Field>

            <Field label="Projeta Saldo">
              <SearchableSelect
                value={form.projeta_saldo}
                onChange={(value) => handleChange('projeta_saldo', value)}
                options={[
                  { value: 'true', label: 'Sim' },
                  { value: 'false', label: 'Não' },
                ]}
                corClasses={corSelect(form.projeta_saldo)}
              />
            </Field>

            <Field label="R$ Saldo Inicial">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  R$
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.saldo_inicial}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (/^-?[0-9.,]*$/.test(raw)) handleChange('saldo_inicial', raw);
                  }}
                  className={`w-full rounded-lg border px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 ${corCampo(form.saldo_inicial)}`}
                />
              </div>
            </Field>

            <Field label="Data Saldo Inicial">
              <input
                type="date"
                value={form.data_saldo_inicial}
                onChange={(e) => handleChange('data_saldo_inicial', e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${corCampo(form.data_saldo_inicial)}`}
              />
            </Field>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" loading={saving}>
              Salvar alterações
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}
