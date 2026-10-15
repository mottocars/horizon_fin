import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Check, RefreshCw, LogOut, ShieldCheck, Users, Search } from 'lucide-react';
import Card from '../../../components/Card';
import Button from '../../../components/Button';
import IconButton from '../../../components/IconButton';
import SearchableSelect from '../../../components/SearchableSelect';
import { listEmpresas } from '../../../api/empresas.api';
import {
  getMcpConector,
  createMcpConector,
  updateMcpConector,
  regenerarMcpToken,
  listMcpSessoes,
  encerrarMcpSessoes,
  listMcpUsuariosDisponiveis,
} from '../../../api/mcp.api';

// Duração do login do conector DFC Construtoras (depois disso o Claude pede para entrar de novo).
const DURACOES = [
  { value: 1, label: '1 hora' },
  { value: 8, label: '8 horas' },
  { value: 24, label: '24 horas' },
  { value: 72, label: '3 dias' },
  { value: 168, label: '7 dias' },
  { value: 720, label: '30 dias' },
];

function dataHora(v) {
  return v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}
import { nomeExibicaoEmpresa } from '../../../utils/empresa';
import { useEmpresaTravada } from '../../../hooks/useEmpresaTravada';
import { useConfirm } from '../../../confirm/ConfirmContext';

// O token é sempre gerado pelo backend (nunca digitado aqui, diferente da
// Z-API) — este formulário só coleta Empresa + Nome do conector. Depois de
// salvo, mostra a URL de conexão pronta pra colar no "Add custom connector"
// do Claude — nunca o token separado da URL (ver plano).
// Usuários liberados no conector: colaboradores ativos da empresa (MASTER pode sempre e não aparece).
// Nos conectores DFC, quem não tem a tela DFC Construtoras não consegue entrar — fica desabilitado.
function UsuariosConector({ usuarios, carregando, selecionados, onChange, dfc, temEmpresa }) {
  const [busca, setBusca] = useState('');
  const pode = (u) => !dfc || u.tem_dfc;
  const q = busca.trim().toLowerCase();
  const lista = (usuarios || []).filter((u) => !q || `${u.nome} ${u.username}`.toLowerCase().includes(q));
  const elegiveis = (usuarios || []).filter(pode).map((u) => u.id);
  const todos = elegiveis.length > 0 && elegiveis.every((id) => selecionados.includes(id));
  const alternar = (id) => onChange(selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id]);
  const iniciais = (nome) =>
    nome
      .split(' ')
      .slice(0, 2)
      .map((x) => x[0])
      .join('')
      .toUpperCase();
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Users size={16} className="text-primary-600" />
            Usuários com acesso
            {selecionados.length > 0 && (
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700">{selecionados.length}</span>
            )}
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {dfc
              ? 'Só os marcados conseguem entrar neste conector pelo Claude. Usuários MASTER têm acesso sempre.'
              : 'Este conector não pede login: a lista define quem vê a URL em "Conexões com IA". Usuários MASTER veem sempre.'}
          </p>
        </div>
        {elegiveis.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(todos ? [] : elegiveis)}
            className="text-xs font-medium text-primary-600 hover:text-primary-700"
          >
            {todos ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
        )}
      </div>
      {!temEmpresa ? (
        <p className="rounded-lg bg-gray-50 px-3 py-4 text-center text-xs text-gray-400">Selecione a empresa para ver os colaboradores.</p>
      ) : carregando ? (
        <p className="py-4 text-center text-xs text-gray-400">Carregando colaboradores...</p>
      ) : !usuarios?.length ? (
        <p className="rounded-lg bg-gray-50 px-3 py-4 text-center text-xs text-gray-400">
          Nenhum colaborador (não MASTER) vinculado a esta empresa.
        </p>
      ) : (
        <>
          {usuarios.length > 6 && (
            <div className="relative mb-2">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar colaborador"
                className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
              />
            </div>
          )}
          <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {lista.map((u) => {
              const habilitado = pode(u);
              const marcado = selecionados.includes(u.id);
              return (
                <label
                  key={u.id}
                  title={habilitado ? undefined : 'Sem acesso à tela DFC Construtoras — libere a tela no cadastro do usuário'}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${
                    habilitado ? 'cursor-pointer hover:bg-gray-50' : 'cursor-not-allowed opacity-50'
                  } ${marcado ? 'bg-primary-50/60' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={!habilitado}
                    onChange={() => alternar(u.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-[10px] font-semibold text-primary-700">
                    {u.avatar_url ? <img src={u.avatar_url} alt="" className="h-full w-full object-cover" /> : iniciais(u.nome)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-gray-800">{u.nome}</span>
                    <span className="block truncate text-[11px] text-gray-400">
                      {u.username}
                      {!habilitado ? ' · sem a tela DFC Construtoras' : ''}
                    </span>
                  </span>
                </label>
              );
            })}
            {!lista.length && <p className="col-span-full py-3 text-center text-xs text-gray-400">Ninguém encontrado.</p>}
          </div>
        </>
      )}
    </div>
  );
}

// Flags do conector DFC (excluentes).
const ESCOPOS_DFC = [
  {
    escopo: 'DFC_CONSTRUTORAS',
    titulo: 'DFC CONSTRUTORAS',
    descricao: 'Conector só para o DFC Construtoras (fluxo de caixa), somente leitura, protegido por login do Horizon Fin com validade.',
  },
  {
    escopo: 'DFC_ORCAMENTO',
    titulo: 'DFC CONSTRUTORAS (ALTERA ORÇAMENTO)',
    descricao:
      'O mesmo conector, e o Claude também pode inserir ou atualizar valores do Orçamento — só nas contas com Origem Projeção "HORIZON - INFORMADO" — e salvar a versão.',
  },
];

export default function McpForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { travada: empresaTravada, empresaIdTravada } = useEmpresaTravada();

  const [empresas, setEmpresas] = useState([]);
  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [copiado, setCopiado] = useState(false);

  // escopo: COBRANCA (padrão) ou uma das flags do DFC — "DFC CONSTRUTORAS" (DFC_CONSTRUTORAS: só as
  // ferramentas do DFC, leitura) ou "DFC CONSTRUTORAS (ALTERA ORÇAMENTO)" (DFC_ORCAMENTO: as mesmas, mais
  // inserir/atualizar valores HORIZON - INFORMADO). As duas com login do Horizon (OAuth) que vale
  // `sessao_horas`. Na edição, só troca entre as duas flags do DFC (mesma URL) — e isso encerra as
  // sessões ativas; cobrança continua definida na criação.
  const [form, setForm] = useState({ empresa_id: '', nome_conector: '', escopo: 'COBRANCA', sessao_horas: 24, usuario_ids: [] });
  const [usuariosEmpresa, setUsuariosEmpresa] = useState(null);
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(false);
  const [escopoOriginal, setEscopoOriginal] = useState(null);
  const dfc = form.escopo !== 'COBRANCA';
  const alteraOrcamento = form.escopo === 'DFC_ORCAMENTO';
  // Edição: conector de cobrança fica travado; conector DFC troca entre as duas flags.
  const travaEscopo = isEdit && escopoOriginal === 'COBRANCA';
  const trocouEscopo = isEdit && escopoOriginal !== null && form.escopo !== escopoOriginal;
  const [url, setUrl] = useState('');
  const [sessoes, setSessoes] = useState(null);
  const [encerrando, setEncerrando] = useState(false);

  useEffect(() => {
    listEmpresas({ ativo: true, limit: 100 })
      .then((result) => setEmpresas(result.data))
      .finally(() => setLoadingEmpresas(false));
  }, []);

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    getMcpConector(id)
      .then((data) => {
        if (!active) return;
        setForm({
          empresa_id: String(data.empresa_id),
          nome_conector: data.nome_conector,
          escopo: data.escopo || 'COBRANCA',
          sessao_horas: data.sessao_horas || 24,
          usuario_ids: data.usuario_ids || [],
        });
        setEscopoOriginal(data.escopo || 'COBRANCA');
        setUrl(data.url);
        if (data.escopo !== 'COBRANCA') listMcpSessoes(id).then(setSessoes).catch(() => setSessoes([]));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  // Administrador é restrito à própria empresa — o campo já vem preenchido
  // com ela e travado (mesmo padrão de ZapiForm.jsx).
  useEffect(() => {
    if (empresaTravada && empresaIdTravada) {
      setForm((prev) => ({ ...prev, empresa_id: empresaIdTravada }));
    }
  }, [empresaTravada, empresaIdTravada, loading]);

  // Colaboradores da empresa (lista de usuários com acesso). Trocar de empresa na criação limpa os marcados.
  useEffect(() => {
    if (!form.empresa_id) {
      setUsuariosEmpresa(null);
      return undefined;
    }
    let ativo = true;
    setCarregandoUsuarios(true);
    listMcpUsuariosDisponiveis(form.empresa_id)
      .then((lista) => {
        if (!ativo) return;
        setUsuariosEmpresa(lista);
        const ids = new Set(lista.map((u) => u.id));
        setForm((prev) => ({ ...prev, usuario_ids: prev.usuario_ids.filter((id) => ids.has(id)) }));
      })
      .catch(() => ativo && setUsuariosEmpresa([]))
      .finally(() => ativo && setCarregandoUsuarios(false));
    return () => {
      ativo = false;
    };
  }, [form.empresa_id]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCopiarUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError('Não foi possível copiar a URL — copie manualmente pelo campo acima.');
    }
  }

  async function handleRegenerarToken() {
    const confirmado = await confirm({
      title: 'Regenerar token',
      description:
        'A URL atual deste conector para de funcionar imediatamente. Você vai precisar atualizar o custom connector no Claude com a nova URL. Deseja continuar?',
      confirmLabel: 'Regenerar',
      variant: 'warning',
    });
    if (!confirmado) return;

    setRegenerando(true);
    try {
      const data = await regenerarMcpToken(id);
      setUrl(data.url);
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível regenerar o token.');
    } finally {
      setRegenerando(false);
    }
  }

  async function handleEncerrarSessoes() {
    const confirmado = await confirm({
      title: 'Encerrar sessões',
      description: 'Todos os logins ativos deste conector no Claude serão encerrados — quem estiver conectado precisará entrar de novo.',
      confirmLabel: 'Encerrar',
      variant: 'warning',
    });
    if (!confirmado) return;
    setEncerrando(true);
    try {
      await encerrarMcpSessoes(id);
      setSessoes(await listMcpSessoes(id));
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível encerrar as sessões.');
    } finally {
      setEncerrando(false);
    }
  }

  // Nos conectores DFC, quem não tem a tela DFC Construtoras não entra — não vai na lista.
  const usuariosValidos = form.usuario_ids.filter((uid) => !dfc || usuariosEmpresa?.find((u) => u.id === uid)?.tem_dfc);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const errors = {};
    if (!form.empresa_id) errors.empresa_id = 'Selecione uma empresa.';
    if (!form.nome_conector.trim()) errors.nome_conector = 'Nome do conector é obrigatório.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (isEdit) {
        if (trocouEscopo) {
          const confirmado = await confirm({
            title: 'Trocar o tipo do conector',
            description: `O conector passa a ser "${ESCOPOS_DFC.find((e) => e.escopo === form.escopo).titulo}". A URL continua a mesma, mas os logins ativos no Claude serão encerrados — quem estiver conectado precisa entrar de novo. Deseja continuar?`,
            confirmLabel: 'Trocar',
            variant: 'warning',
          });
          if (!confirmado) {
            setSaving(false);
            return;
          }
        }
        await updateMcpConector(id, {
          nome_conector: form.nome_conector.trim(),
          usuario_ids: usuariosValidos,
          ...(dfc ? { sessao_horas: Number(form.sessao_horas), escopo: form.escopo } : {}),
        });
        navigate('/integracoes/mcp', { replace: true });
      } else {
        const criado = await createMcpConector({
          empresa_id: Number(form.empresa_id),
          nome_conector: form.nome_conector.trim(),
          escopo: form.escopo,
          sessao_horas: Number(form.sessao_horas),
          usuario_ids: usuariosValidos,
        });
        // Diferente do padrão de ZapiForm (volta pra lista): aqui navega pra
        // edição do item recém-criado, pra já mostrar a URL de conexão —
        // é a única forma de exibi-la logo depois de criar.
        navigate(`/integracoes/mcp/${criado.id}`, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Não foi possível salvar o conector.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/integracoes/mcp')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Voltar para MCP
      </button>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-gray-900">
          {isEdit ? 'Editar conector MCP' : 'Novo conector MCP'}
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          {alteraOrcamento
            ? 'Um conector DFC Construtoras (altera orçamento) dá ao Claude o acesso de leitura ao fluxo de caixa (DFC) desta empresa e permite pedir a ele que insira ou atualize valores do Orçamento — só nas contas com Origem Projeção "HORIZON - INFORMADO" — e salve a versão. Ao conectar, o Claude pede o login do Horizon Fin, e as alterações ficam em nome de quem entrou.'
            : dfc
            ? 'Um conector DFC Construtoras dá ao Claude acesso de leitura ao fluxo de caixa (DFC) desta empresa — realizado, projetado, saldos, Projeção CEF e as bases — através de uma URL que você cola em "Add custom connector". Ao conectar, o Claude pede o login do Horizon Fin.'
            : 'Um conector MCP dá ao Claude acesso de leitura aos dados de cobrança e contas a receber desta empresa, através de uma URL que você cola em "Add custom connector".'}
        </p>

        {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400">Carregando...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
                <SearchableSelect
                  value={form.empresa_id}
                  onChange={(value) => handleChange('empresa_id', value)}
                  disabled={loadingEmpresas || empresaTravada || isEdit}
                  options={empresas.map((empresa) => ({ value: empresa.id, label: nomeExibicaoEmpresa(empresa) }))}
                  placeholder={loadingEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}
                  emptyMessage="Nenhuma empresa encontrada."
                />
                {fieldErrors.empresa_id && <p className="mt-1 text-xs text-red-600">{fieldErrors.empresa_id}</p>}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nome do conector</label>
                <input
                  type="text"
                  value={form.nome_conector}
                  onChange={(e) => handleChange('nome_conector', e.target.value)}
                  placeholder="ex.: Diretoria, Financeiro"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
                <p className="mt-1 text-xs text-gray-400">Identifica este conector quando a empresa tiver mais de um.</p>
                {fieldErrors.nome_conector && <p className="mt-1 text-xs text-red-600">{fieldErrors.nome_conector}</p>}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              {/* As duas flags do DFC são excluentes: marcar uma desmarca a outra. */}
              <div className="space-y-3">
                {ESCOPOS_DFC.map((op) => (
                  <label key={op.escopo} className={`flex items-start gap-3 ${travaEscopo ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={form.escopo === op.escopo}
                      disabled={travaEscopo}
                      // Na edição de um conector DFC não dá para desmarcar as duas (viraria cobrança).
                      onChange={(e) => handleChange('escopo', e.target.checked ? op.escopo : isEdit ? form.escopo : 'COBRANCA')}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">{op.titulo}</span>
                      <span className="block text-xs text-gray-500">
                        {op.descricao}
                        {travaEscopo ? ' Definido na criação do conector.' : ''}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {dfc && (
                <div className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Validade do login</label>
                    <select
                      value={form.sessao_horas}
                      onChange={(e) => handleChange('sessao_horas', Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100"
                    >
                      {DURACOES.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-400">Depois desse tempo o Claude pede para entrar de novo.</p>
                  </div>
                  <div className="flex items-start gap-2 rounded-lg bg-primary-50 px-3 py-2 text-xs text-primary-700">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                    {alteraOrcamento
                      ? 'Só entram os usuários marcados em Usuários com acesso (e os MASTER). Altera só valores HORIZON - INFORMADO, em nome de quem entrou.'
                      : 'Só entram os usuários marcados em Usuários com acesso (e os MASTER). O acesso é somente leitura.'}
                  </div>
                </div>
              )}
            </div>

            <UsuariosConector
              usuarios={usuariosEmpresa}
              carregando={carregandoUsuarios}
              selecionados={form.usuario_ids}
              onChange={(ids) => handleChange('usuario_ids', ids)}
              dfc={dfc}
              temEmpresa={Boolean(form.empresa_id)}
            />

            {isEdit && url && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">URL de conexão</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={url}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700 focus:outline-none"
                  />
                  <IconButton title="Copiar URL" onClick={handleCopiarUrl}>
                    {copiado ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  </IconButton>
                  <IconButton title="Regenerar token" onClick={handleRegenerarToken} disabled={regenerando}>
                    <RefreshCw size={16} className={regenerando ? 'animate-spin' : ''} />
                  </IconButton>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {dfc
                    ? 'Cole esta URL em "Add custom connector" no Claude e clique em Conectar: abre a tela de login do Horizon Fin. Regenerar o token invalida esta URL imediatamente.'
                    : 'Cole esta URL completa em "Add custom connector" no Claude. Quem tiver esta URL consegue ler os dados de cobrança desta empresa — trate-a como uma senha. Regenerar o token invalida esta URL imediatamente.'}
                </p>
              </div>
            )}

            {isEdit && dfc && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">Sessões ativas no Claude</label>
                  {sessoes?.length > 0 && (
                    <button
                      type="button"
                      onClick={handleEncerrarSessoes}
                      disabled={encerrando}
                      className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
                    >
                      <LogOut size={14} />
                      Encerrar todas
                    </button>
                  )}
                </div>
                {sessoes === null ? (
                  <p className="text-xs text-gray-400">Carregando...</p>
                ) : sessoes.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-center text-xs text-gray-400">Ninguém conectado.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-left text-gray-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Usuário</th>
                          <th className="px-3 py-2 font-medium">Entrou em</th>
                          <th className="px-3 py-2 font-medium">Último uso</th>
                          <th className="px-3 py-2 font-medium">Expira em</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessoes.map((s) => (
                          <tr key={s.id} className="border-t border-gray-100 text-gray-700">
                            <td className="px-3 py-2">{s.usuario}</td>
                            <td className="px-3 py-2">{dataHora(s.criado_em)}</td>
                            <td className="px-3 py-2">{dataHora(s.ultimo_uso_em)}</td>
                            <td className="px-3 py-2">{dataHora(s.sessao_expira_em)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => navigate('/integracoes/mcp')}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Salvar
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
