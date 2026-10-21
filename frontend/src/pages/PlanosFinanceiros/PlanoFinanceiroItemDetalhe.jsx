import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, PieChart } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import SearchableSelect from '../../components/SearchableSelect';
import { getItem, listResponsaveis, updateEnriquecimento } from '../../api/planosFinanceirosSienge.api';
import { listMascaras } from '../../api/mascaras.api';

// Mesmo padrão de ContaBancariaItemDetalhe.jsx/ConveniosBancariosForm.jsx (corSelect):
// âmbar quando o campo está em branco, azul claro quando já tem valor — dá pra ver de relance
// o que ainda falta preencher no cadastro desta conta do plano financeiro.
// A borda azul é primary-100/500 (não 200/400): o tema (styles/index.css) só define primary
// 50, 100, 500, 600 e 700 — classe de tom inexistente não gera CSS e a borda cairia na cor
// padrão (preta).
// O gatilho do SearchableSelect já traz o próprio anel de foco (primary-100), então aqui
// vão só borda e fundo — repetir o anel geraria conflito de especificidade no Tailwind.
const COR_CAMPO_VAZIO = 'border-amber-200 bg-amber-50 focus:border-amber-400';
const COR_CAMPO_PREENCHIDO = 'border-primary-100 bg-primary-50 focus:border-primary-500';

function corSelect(valor) {
  return String(valor ?? '').trim() !== '' ? COR_CAMPO_PREENCHIDO : COR_CAMPO_VAZIO;
}

// O cadastro da conta tem só Pacote e Responsável — os demais campos de enriquecimento
// (classificações, submáscaras, projeção, incrementos) saíram da tela; a Classificação DRE
// continua na aba Plano de Contas da DRE POC Gerencial.
const emptyForm = {
  pacote_id: '',
  responsavel_id: '',
};

function formDoItem(data) {
  return {
    pacote_id: data.pacote_id ? String(data.pacote_id) : '',
    responsavel_id: data.responsavel_id ? String(data.responsavel_id) : '',
  };
}

export default function PlanoFinanceiroItemDetalhe() {
  const { empresaId, siengeId } = useParams();
  const navigate = useNavigate();

  const [item, setItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [pacotes, setPacotes] = useState([]);
  const [responsaveis, setResponsaveis] = useState([]);

  const loadItem = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getItem(empresaId, siengeId);
      setItem(data);
      setForm(formDoItem(data));
    } finally {
      setLoading(false);
    }
  }, [empresaId, siengeId]);

  useEffect(() => {
    loadItem();
    listMascaras('PACOTES', empresaId).then(setPacotes);
    listResponsaveis(empresaId).then(setResponsaveis);
  }, [loadItem, empresaId]);

  // O responsável gravado continua aparecendo mesmo que tenha sido inativado ou desvinculado
  // da empresa depois (aí não vem na lista) — senão o campo ficaria em branco sem ter sido limpo.
  const opcoesResponsavel = responsaveis.map((u) => ({ value: u.id, label: u.nome }));
  if (item?.responsavel_id && !responsaveis.some((u) => u.id === item.responsavel_id)) {
    opcoesResponsavel.push({ value: item.responsavel_id, label: item.responsavel_nome || 'Usuário removido' });
  }

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (item?.tp_conta === 'T') return;
    setError('');
    setSuccess(false);
    setSaving(true);
    try {
      const updated = await updateEnriquecimento(empresaId, siengeId, form);
      setItem(updated);
      setForm(formDoItem(updated));
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
            <Field label="Pacote">
              <SearchableSelect
                value={form.pacote_id}
                onChange={(value) => handleChange('pacote_id', value)}
                options={pacotes.map((c) => ({ value: c.id, label: c.descricao }))}
                emptyMessage="Nenhum pacote encontrado."
                corClasses={corSelect(form.pacote_id)}
              />
              {pacotes.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  Nenhum pacote cadastrado em Máscaras ainda.
                </p>
              )}
            </Field>

            <Field label="Responsável">
              <SearchableSelect
                value={form.responsavel_id}
                onChange={(value) => handleChange('responsavel_id', value)}
                options={opcoesResponsavel}
                emptyMessage="Nenhum usuário encontrado."
                corClasses={corSelect(form.responsavel_id)}
              />
              {responsaveis.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">
                  Nenhum usuário ativo vinculado a esta empresa.
                </p>
              )}
            </Field>
          </div>

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
