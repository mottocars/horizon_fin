import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Search } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import {
  getItem,
  updateEnriquecimento,
  listEtapas,
  createEtapa,
  updateEtapa,
  deleteEtapa,
} from '../../api/centrosCustoSienge.api';
import { listMascaras } from '../../api/mascaras.api';
import { listPrevisionProjetos } from '../../api/prevision.api';
import SearchableSelect from '../../components/SearchableSelect';
import { consultarCep } from '../../api/cep.api';

const FAIXAS = ['FAIXA_1', 'FAIXA_2', 'FAIXA_3', 'FAIXA_4', 'SBPE'];

function faixaLabel(value) {
  if (value === 'SBPE') return 'SBPE';
  if (!value) return value;
  return value.replace('FAIXA_', 'Faixa ');
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
  status: 'ATIVO',
  apelido: '',
  unidade_negocio_id: '',
  numero_unidades: '',
  codigo_prevision: '',
  prevision_primary_view: true,
  codigo_construtor_vendas: '',
  codigo_contrato_caixa: '',
  cep: '',
  cidade_enriquecida: '',
  estado_enriquecido: '',
  valor_geral_vendas: '',
  faixa: '',
};

export default function CentroCustoItemDetalhe() {
  const { empresaId, siengeId } = useParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState('cadastro');
  const [item, setItem] = useState(null);
  const [form, setForm] = useState(emptyForm);
  // Retrato do que está salvo no servidor — só muda ao carregar ou depois
  // de um salvamento bem-sucedido. Comparar `form` com isto é o que diz se
  // há alteração pendente no Cadastro (ver `formAlterado` abaixo).
  const [formOriginal, setFormOriginal] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [unidadesNegocio, setUnidadesNegocio] = useState([]);
  const [projetosPrevision, setProjetosPrevision] = useState([]);
  const [erroProjetosPrevision, setErroProjetosPrevision] = useState('');

  const [etapas, setEtapas] = useState([]);
  const [loadingEtapas, setLoadingEtapas] = useState(false);
  // Edição pendente das etapas — só vira chamada à API quando o usuário
  // clica em "Salvar alterações", igual ao Cadastro. Um único botão salva
  // as duas abas juntas (ver handleSalvarTudo) — o usuário pode ir e voltar
  // entre Cadastro e Histórico de Etapas à vontade, sem perder o que já
  // preencheu em nenhuma das duas, e só grava tudo quando pedir.
  const [etapasForm, setEtapasForm] = useState({});

  const loadItem = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getItem(empresaId, siengeId);
      setItem(data);
      const proximoForm = {
        status: data.status || 'ATIVO',
        apelido: data.apelido || '',
        unidade_negocio_id: data.unidade_negocio_id ? String(data.unidade_negocio_id) : '',
        numero_unidades: data.numero_unidades ?? '',
        codigo_prevision: data.codigo_prevision || '',
        prevision_primary_view: data.prevision_primary_view !== false,
        codigo_construtor_vendas: data.codigo_construtor_vendas || '',
        codigo_contrato_caixa: data.codigo_contrato_caixa || '',
        cep: data.cep || '',
        cidade_enriquecida: data.cidade_enriquecida || '',
        estado_enriquecido: data.estado_enriquecido || '',
        valor_geral_vendas: formatBRNumber(data.valor_geral_vendas),
        faixa: data.faixa || '',
      };
      setForm(proximoForm);
      setFormOriginal(proximoForm);
    } finally {
      setLoading(false);
    }
  }, [empresaId, siengeId]);

  const loadEtapas = useCallback(async () => {
    setLoadingEtapas(true);
    try {
      const result = await listEtapas(empresaId, siengeId);
      setEtapas(result);
    } finally {
      setLoadingEtapas(false);
    }
  }, [empresaId, siengeId]);

  useEffect(() => {
    loadItem();
    listMascaras('UNIDADES_NEGOCIO', empresaId).then(setUnidadesNegocio);
    listPrevisionProjetos(empresaId)
      .then((projetos) => {
        setProjetosPrevision(projetos);
        setErroProjetosPrevision('');
      })
      .catch((err) => {
        setProjetosPrevision([]);
        setErroProjetosPrevision(
          err.response?.data?.message || 'Não foi possível carregar os projetos do Prevision.'
        );
      });
  }, [loadItem, empresaId]);

  useEffect(() => {
    if (tab === 'etapas') loadEtapas();
  }, [tab, loadEtapas]);

  // Reflete o que está salvo no formulário de edição sempre que `etapas`
  // é (re)carregado — tanto na primeira carga quanto depois de um
  // `handleSalvarTudo` bem-sucedido (que recarrega pra pegar os IDs dos
  // registros recém-criados).
  useEffect(() => {
    const next = {};
    for (const etapa of etapas) {
      next[etapa.mascara_item_id] = {
        data_inicio: etapa.data_inicio ? etapa.data_inicio.slice(0, 10) : '',
        data_fim: etapa.data_fim ? etapa.data_fim.slice(0, 10) : '',
      };
    }
    setEtapasForm(next);
  }, [etapas]);

  const etapasAlteradas = useMemo(
    () =>
      etapas.some((etapa) => {
        const atual = etapasForm[etapa.mascara_item_id] || { data_inicio: '', data_fim: '' };
        const salvoInicio = etapa.data_inicio ? etapa.data_inicio.slice(0, 10) : '';
        const salvoFim = etapa.data_fim ? etapa.data_fim.slice(0, 10) : '';
        return atual.data_inicio !== salvoInicio || atual.data_fim !== salvoFim;
      }),
    [etapas, etapasForm]
  );

  const formAlterado = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(formOriginal),
    [form, formOriginal]
  );
  const haAlteracoesPendentes = formAlterado || etapasAlteradas;

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    const digits = form.cep.replace(/\D/g, '');
    if (digits.length !== 8) return;

    let cancelled = false;
    const timeout = setTimeout(async () => {
      setBuscandoCep(true);
      try {
        const result = await consultarCep(digits);
        if (cancelled) return;
        setForm((prev) => ({
          ...prev,
          cidade_enriquecida: result.cidade || prev.cidade_enriquecida,
          estado_enriquecido: result.estado || prev.estado_enriquecido,
        }));
      } catch {
        // CEP não encontrado — mantém os campos como estão, sem bloquear o usuário
      } finally {
        if (!cancelled) setBuscandoCep(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cep]);

  function handleChangeEtapa(mascaraItemId, campo, valor) {
    setEtapasForm((prev) => ({
      ...prev,
      [mascaraItemId]: { ...prev[mascaraItemId], [campo]: valor },
    }));
  }

  // Um único botão salva as duas abas juntas — o Cadastro (se algo mudou) e
  // todas as linhas alteradas do Histórico de Etapas — não importa em qual
  // aba o usuário está no momento do clique. Se o Cadastro falhar (ex.: um
  // código duplicado), para ali e nem chega a mexer nas etapas; se o
  // Cadastro salvar mas alguma etapa tiver conflito de datas, as outras
  // etapas continuam salvando normalmente e o erro sai agregado ao final.
  async function handleSalvarTudo() {
    setError('');
    setSuccess(false);
    setSaving(true);
    try {
      if (formAlterado) {
        const updated = await updateEnriquecimento(empresaId, siengeId, {
          ...form,
          cep: form.cep.replace(/\D/g, ''),
          valor_geral_vendas: parseBRNumber(form.valor_geral_vendas),
        });
        setItem(updated);
        const proximoForm = { ...form, valor_geral_vendas: formatBRNumber(updated.valor_geral_vendas) };
        setForm(proximoForm);
        setFormOriginal(proximoForm);
      }

      const falhasEtapas = [];
      for (const etapa of etapas) {
        const atual = etapasForm[etapa.mascara_item_id] || { data_inicio: '', data_fim: '' };
        const salvoInicio = etapa.data_inicio ? etapa.data_inicio.slice(0, 10) : '';
        const salvoFim = etapa.data_fim ? etapa.data_fim.slice(0, 10) : '';
        if (atual.data_inicio === salvoInicio && atual.data_fim === salvoFim) continue;

        try {
          if (!atual.data_inicio) {
            if (etapa.historico_id) await deleteEtapa(empresaId, siengeId, etapa.historico_id);
          } else if (etapa.historico_id) {
            await updateEtapa(empresaId, siengeId, etapa.historico_id, {
              mascara_item_id: etapa.mascara_item_id,
              data_inicio: atual.data_inicio,
              data_fim: atual.data_fim || null,
            });
          } else {
            await createEtapa(empresaId, siengeId, {
              mascara_item_id: etapa.mascara_item_id,
              data_inicio: atual.data_inicio,
              data_fim: atual.data_fim || null,
            });
          }
        } catch (err) {
          falhasEtapas.push(
            `${etapa.etapa_descricao}: ${err.response?.data?.message || 'não foi possível salvar.'}`
          );
        }
      }

      if (etapas.length > 0) await loadEtapas();

      if (falhasEtapas.length > 0) {
        setError(`Algumas etapas não foram salvas — ${falhasEtapas.join(' | ')}`);
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
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
        <Building2 size={28} className="text-gray-300" />
        <p className="text-sm text-gray-500">Centro de custo não encontrado.</p>
        <Button variant="secondary" onClick={() => navigate(`/cadastros/centros-de-custo/${empresaId}`)}>
          Voltar
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(`/cadastros/centros-de-custo/${empresaId}`)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para Centros de Custo
      </button>

      <Card>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <Building2 size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{item.name}</h2>
            <p className="text-xs text-gray-500">
              Código {item.sienge_id} · {item.company_name}
            </p>
          </div>
        </div>

        <div className="mb-5 flex gap-1 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setTab('cadastro')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === 'cadastro'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Cadastro
            {formAlterado && (
              <span
                title="Há alterações não salvas nesta aba"
                className="h-1.5 w-1.5 rounded-full bg-amber-500"
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('etapas')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === 'etapas'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Histórico de Etapas
            {etapasAlteradas && (
              <span
                title="Há alterações não salvas nesta aba"
                className="h-1.5 w-1.5 rounded-full bg-amber-500"
              />
            )}
          </button>
        </div>

        {/* Erro/sucesso de um salvamento único (Cadastro + Etapas juntos)
            ficam aqui, fora das abas, pra continuar visíveis mesmo se o
            usuário trocar de aba logo depois de salvar. */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-600">
            Alterações salvas com sucesso.
          </div>
        )}

        {tab === 'cadastro' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Status">
                <SearchableSelect
                  value={form.status}
                  onChange={(value) => handleChange('status', value)}
                  options={[
                    { value: 'ATIVO', label: 'Ativo' },
                    { value: 'INATIVO', label: 'Inativo' },
                  ]}
                  clearable={false}
                />
              </Field>

              <Field label="Apelido">
                <input
                  type="text"
                  value={form.apelido}
                  onChange={(e) => handleChange('apelido', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>

              <Field label="Unidade de Negócio">
                <SearchableSelect
                  value={form.unidade_negocio_id}
                  onChange={(value) => handleChange('unidade_negocio_id', value)}
                  options={unidadesNegocio.map((un) => ({ value: un.id, label: un.descricao }))}
                  emptyMessage="Nenhuma unidade de negócio encontrada."
                />
                {unidadesNegocio.length === 0 && (
                  <p className="mt-1 text-xs text-gray-400">
                    Nenhuma unidade de negócio cadastrada em Máscaras ainda.
                  </p>
                )}
              </Field>

              <Field label="Número de Unidades">
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.numero_unidades}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (/^[0-9]*$/.test(raw)) handleChange('numero_unidades', raw);
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>

              <Field label="Código Prevision">
                <SearchableSelect
                  value={form.codigo_prevision}
                  onChange={(value) => handleChange('codigo_prevision', value)}
                  options={[
                    ...(form.codigo_prevision &&
                    !projetosPrevision.some((p) => String(p.codigo) === String(form.codigo_prevision))
                      ? [{ value: form.codigo_prevision, label: form.codigo_prevision }]
                      : []),
                    ...projetosPrevision.map((p) => ({ value: p.codigo, label: `${p.codigo} - ${p.nome}` })),
                  ]}
                  emptyMessage="Nenhum projeto encontrado."
                />
                {erroProjetosPrevision && (
                  <p className="mt-1 text-xs text-gray-400">{erroProjetosPrevision}</p>
                )}
              </Field>

              <Field label="Classificação de Orçamento">
                <SearchableSelect
                  value={form.prevision_primary_view ? 'PRIMARIO' : 'SECUNDARIO'}
                  onChange={(value) => handleChange('prevision_primary_view', value === 'PRIMARIO')}
                  options={[
                    { value: 'PRIMARIO', label: 'Primário' },
                    { value: 'SECUNDARIO', label: 'Secundário' },
                  ]}
                  clearable={false}
                />
              </Field>

              <Field label="Código Construtor de Vendas">
                <input
                  type="text"
                  value={form.codigo_construtor_vendas}
                  onChange={(e) => handleChange('codigo_construtor_vendas', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>

              <Field label="Código Contrato Caixa">
                <input
                  type="text"
                  value={form.codigo_contrato_caixa}
                  onChange={(e) => handleChange('codigo_contrato_caixa', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>

              <Field label="CEP">
                <div className="relative">
                  <input
                    type="text"
                    value={form.cep}
                    onChange={(e) => handleChange('cep', e.target.value)}
                    maxLength={9}
                    placeholder="00000-000"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                  {buscandoCep && (
                    <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-pulse text-gray-400" />
                  )}
                </div>
              </Field>

              <Field label="Cidade">
                <input
                  type="text"
                  value={form.cidade_enriquecida}
                  onChange={(e) => handleChange('cidade_enriquecida', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>

              <Field label="Estado">
                <input
                  type="text"
                  value={form.estado_enriquecido}
                  maxLength={2}
                  onChange={(e) => handleChange('estado_enriquecido', e.target.value.toUpperCase())}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>

              <Field label="R$ Valor Geral de Vendas">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.valor_geral_vendas}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (/^[0-9.,]*$/.test(raw)) handleChange('valor_geral_vendas', raw);
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </Field>

              <Field label="Faixa">
                <SearchableSelect
                  value={form.faixa}
                  onChange={(value) => handleChange('faixa', value)}
                  options={FAIXAS.map((f) => ({ value: f, label: faixaLabel(f) }))}
                  emptyMessage="Nenhuma faixa encontrada."
                />
              </Field>
            </div>
          </div>
        )}

        {tab === 'etapas' && (
          <div>
            {etapas.length === 0 ? (
              <p className="mb-4 text-xs text-gray-400">
                Nenhuma etapa cadastrada em Máscaras (Etapas do Centro de Custo) para esta empresa ainda.
              </p>
            ) : (
              <p className="mb-4 text-xs text-gray-400">
                Preencha a data de início de cada etapa para registrar o andamento da obra e clique em
                "Salvar alterações". Deixe a data fim em branco enquanto a etapa estiver em curso.
              </p>
            )}

            {loadingEtapas ? (
              <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
            ) : etapas.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-400">
                Cadastre as etapas em Máscaras → Etapas do Centro de Custo.
              </div>
            ) : (
              <>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                      <th className="w-12 py-3 font-medium">Seq.</th>
                      <th className="py-3 font-medium">Etapa</th>
                      <th className="py-3 font-medium">Data início</th>
                      <th className="py-3 font-medium">Data fim</th>
                      <th className="py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {etapas.map((etapa) => (
                      <EtapaRow
                        key={etapa.mascara_item_id}
                        etapa={etapa}
                        form={etapasForm[etapa.mascara_item_id] || { data_inicio: '', data_fim: '' }}
                        disabled={saving}
                        onChange={handleChangeEtapa}
                      />
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {/* Um único botão pras duas abas — salva o Cadastro (se mudou algo)
            e todas as etapas alteradas juntos, não importa em qual aba o
            usuário está agora. Os pontinhos ambar nas abas acima mostram
            onde tem alteração pendente. */}
        <div className="flex justify-end border-t border-gray-100 pt-4 mt-5">
          <Button type="button" onClick={handleSalvarTudo} loading={saving} disabled={!haAlteracoesPendentes}>
            Salvar alterações
          </Button>
        </div>
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

const STATUS_STYLES = {
  NAO_INFORMADA: { label: 'Etapa não Informada', className: 'bg-red-50 text-red-600' },
  FUTURA: { label: 'Etapa Futura', className: 'bg-gray-100 text-gray-500' },
  ATUAL: { label: 'Etapa Atual', className: 'bg-primary-50 text-primary-600' },
  FINALIZADA: { label: 'Etapa Finalizada', className: 'bg-emerald-50 text-emerald-600' },
};

function computeStatus(dataInicio, dataFim) {
  if (!dataInicio) return 'NAO_INFORMADA';

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicio = new Date(`${dataInicio}T00:00:00`);
  if (inicio > hoje) return 'FUTURA';

  if (dataFim) {
    const fim = new Date(`${dataFim}T00:00:00`);
    if (fim < hoje) return 'FINALIZADA';
  }

  return 'ATUAL';
}

// Puramente controlado pelo pai — só reflete o que está no `etapasForm`
// (edição pendente) e devolve as mudanças via `onChange`. Nada aqui chama a
// API: quem persiste é o handleSalvarTudo() do componente pai, todo de uma
// vez, ao clicar em "Salvar alterações".
function EtapaRow({ etapa, form, disabled, onChange }) {
  const { data_inicio: dataInicio, data_fim: dataFim } = form;
  const status = computeStatus(dataInicio, dataFim);
  const statusInfo = STATUS_STYLES[status];

  return (
    <tr className="border-b border-gray-50 last:border-0 align-top">
      <td className="py-3 text-gray-600">{etapa.etapa_sequencia}</td>
      <td className="py-3 text-gray-900">{etapa.etapa_descricao}</td>
      <td className="py-3">
        <input
          type="date"
          value={dataInicio}
          disabled={disabled}
          onChange={(e) => onChange(etapa.mascara_item_id, 'data_inicio', e.target.value)}
          className="rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
        />
      </td>
      <td className="py-3">
        <input
          type="date"
          value={dataFim}
          disabled={disabled || !dataInicio}
          onChange={(e) => onChange(etapa.mascara_item_id, 'data_fim', e.target.value)}
          className="rounded-md border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
        />
      </td>
      <td className="py-3">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusInfo.className}`}>
          {statusInfo.label}
        </span>
      </td>
    </tr>
  );
}
