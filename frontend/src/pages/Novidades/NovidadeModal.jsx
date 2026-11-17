import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Eye, ImagePlus, Trash2, Users, X } from 'lucide-react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import CampoData from '../../components/CampoData';
import SearchableSelect from '../../components/SearchableSelect';
import { Interruptor } from '../Operacoes/GestaoAprovacoes/ui';
import { useAuth } from '../../auth/AuthContext';
import { TELAS_SISTEMA } from '../../config/telasSistema';
import { useConfirm } from '../../confirm/ConfirmContext';
import { JanelaNovidades, formatarDataNovidade, useMidiaNovidade } from '../../layout/Novidades';
import {
  excluirNovidade,
  obterNovidade,
  opcoesEmpresasNovidade,
  opcoesUsuariosNovidade,
  salvarNovidade,
  vistasNovidade,
} from '../../api/novidades.api';

const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const TIPOS = ['image/gif', 'image/png', 'image/jpeg', 'image/webp'];
const ROTULO = 'mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-gray-400';
const CAMPO = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100';

function formatarTamanho(bytes) {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Hoje no fuso do navegador (o usuário está no Brasil), como 'AAAA-MM-DD'.
function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dataHora(iso) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function iniciais(nome) {
  return (nome || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

// Módulos do Horizon para o campo "Módulo": os nomes das telas do sistema (os mesmos do Mapa de
// Acessos), sem repetir nome (ex.: Repasses CEF existe em Operações e em Relatórios).
const MODULOS = [...new Set(TELAS_SISTEMA.flatMap((g) => g.telas.map((t) => t.label)))]
  .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  .map((label) => ({ value: label, label }));

const vazia = () => ({ nome: '', modulo: '', descricao: '', publico: 'EMPRESAS', exibir_a_partir: hojeIso(), novos_usuarios: true, empresas: [] });

// Criar/editar uma novidade (Cadastros › Novidades). `novidadeId` nulo = nova.
// Esquerda: todo o formulário (nome, descrição, quando aparece, quem vê).
// Direita: o GIF e, embaixo, quem já viu e o percentual sobre quem deveria ver.
export default function NovidadeModal({ open, novidadeId, onFechar, onSalvo }) {
  const { user } = useAuth();
  const master = user?.permissao === 'MASTER';
  const confirm = useConfirm();
  const [form, setForm] = useState(vazia);
  const [original, setOriginal] = useState(null); // a novidade como está no banco (edição)
  const [vistas, setVistas] = useState(null);
  const [arquivo, setArquivo] = useState(null);
  const [arquivoUrl, setArquivoUrl] = useState(null);
  const [empresasOpcoes, setEmpresasOpcoes] = useState([]);
  const [usuariosPorEmpresa, setUsuariosPorEmpresa] = useState({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [previa, setPrevia] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setErro('');
    setArquivo(null);
    setPrevia(false);
    setVistas(null);
    opcoesEmpresasNovidade().then(setEmpresasOpcoes).catch(() => setEmpresasOpcoes([]));
    if (!novidadeId) {
      setForm(vazia());
      setOriginal(null);
      return;
    }
    setCarregando(true);
    obterNovidade(novidadeId)
      .then((n) => {
        setOriginal(n);
        setForm({
          nome: n.nome,
          modulo: n.modulo || '',
          descricao: n.descricao,
          publico: n.publico,
          exibir_a_partir: n.exibir_a_partir,
          novos_usuarios: n.novos_usuarios,
          empresas: n.empresas.map((e) => ({ empresa_id: e.empresa_id, todos_usuarios: e.todos_usuarios, usuario_ids: e.usuario_ids || [] })),
        });
      })
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível abrir a novidade.'))
      .finally(() => setCarregando(false));
    vistasNovidade(novidadeId)
      .then(setVistas)
      .catch(() => setVistas({ publico_total: 0, vistas_publico: 0, percentual: 0, usuarios: [] }));
  }, [open, novidadeId]);

  // Prévia local do arquivo escolhido agora.
  useEffect(() => {
    if (!arquivo) {
      setArquivoUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(arquivo);
    setArquivoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  // Usuários de cada empresa escolhida (carregados uma vez por empresa).
  useEffect(() => {
    for (const e of form.empresas) {
      if (usuariosPorEmpresa[e.empresa_id]) continue;
      setUsuariosPorEmpresa((m) => ({ ...m, [e.empresa_id]: 'carregando' }));
      opcoesUsuariosNovidade(e.empresa_id)
        .then((lista) => setUsuariosPorEmpresa((m) => ({ ...m, [e.empresa_id]: lista })))
        .catch(() => setUsuariosPorEmpresa((m) => ({ ...m, [e.empresa_id]: [] })));
    }
  }, [form.empresas, usuariosPorEmpresa]);

  const midiaSalva = useMidiaNovidade(original && !arquivo ? original : null, true);
  const midiaUrl = arquivoUrl || midiaSalva;
  const midiaNome = arquivo ? `${arquivo.name} · ${formatarTamanho(arquivo.size)}` : original?.midia_nome ? `${original.midia_nome} · ${formatarTamanho(original.midia_tamanho)}` : '';

  const nomeEmpresa = useMemo(() => Object.fromEntries(empresasOpcoes.map((e) => [e.id, e.nome])), [empresasOpcoes]);
  const agendada = form.exibir_a_partir > hojeIso();

  function campo(chave, valor) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  function escolherEmpresas(ids) {
    setForm((f) => ({
      ...f,
      empresas: ids.map((id) => f.empresas.find((e) => e.empresa_id === id) || { empresa_id: id, todos_usuarios: true, usuario_ids: [] }),
    }));
  }

  function alterarEmpresa(empresaId, patch) {
    setForm((f) => ({ ...f, empresas: f.empresas.map((e) => (e.empresa_id === empresaId ? { ...e, ...patch } : e)) }));
  }

  function escolherArquivo(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!TIPOS.includes(f.type)) return setErro('Envie um GIF (ou PNG, JPG, WEBP).');
    if (f.size > TAMANHO_MAXIMO) return setErro('O arquivo passa de 10 MB.');
    setErro('');
    setArquivo(f);
  }

  const valido =
    form.nome.trim() &&
    form.descricao.trim() &&
    form.exibir_a_partir &&
    (arquivo || original?.tem_midia) &&
    (form.publico === 'TODOS' || (form.empresas.length > 0 && form.empresas.every((e) => e.todos_usuarios || e.usuario_ids.length > 0)));

  async function handleSalvar() {
    setSalvando(true);
    setErro('');
    try {
      const dados = {
        nome: form.nome.trim(),
        modulo: form.modulo || null,
        descricao: form.descricao.trim(),
        publico: form.publico,
        exibir_a_partir: form.exibir_a_partir,
        novos_usuarios: form.novos_usuarios,
        empresas: form.publico === 'EMPRESAS' ? form.empresas : [],
      };
      await salvarNovidade(novidadeId, dados, arquivo);
      onSalvo?.();
      onFechar();
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível salvar a novidade.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleExcluir() {
    const ok = await confirm({
      title: 'Excluir novidade',
      description: `Excluir "${original?.nome}"? Ela some da janela e do botão Novidades de todos. Não dá para desfazer.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await excluirNovidade(novidadeId);
      onSalvo?.();
      onFechar();
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível excluir.');
    }
  }

  const rascunhoPrevia = {
    id: original?.id,
    nome: form.nome || 'Nome da novidade',
    modulo: form.modulo,
    descricao: form.descricao || 'A descrição aparece aqui.',
    exibir_a_partir: form.exibir_a_partir,
    tem_midia: Boolean(original?.tem_midia),
    atualizado_em: original?.atualizado_em,
    midia_url: arquivoUrl || undefined,
  };

  return (
    <>
      <Modal open={open} onClose={onFechar} title={novidadeId ? 'Editar novidade' : 'Nova novidade'} maxWidthClass="max-w-6xl">
        {carregando ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {/* ── Esquerda: todo o formulário ── */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="novidade-nome" className={ROTULO}>
                    Nome
                  </label>
                  <input
                    id="novidade-nome"
                    type="text"
                    value={form.nome}
                    maxLength={150}
                    onChange={(e) => campo('nome', e.target.value)}
                    placeholder="Ex.: Seleção em massa de clientes na gestão de cobrança"
                    className={CAMPO}
                  />
                </div>
                <div>
                  <span className={ROTULO}>Módulo</span>
                  <SearchableSelect
                    value={form.modulo}
                    onChange={(v) => campo('modulo', v || '')}
                    options={MODULOS}
                    placeholder="De qual parte do Horizon é a novidade (opcional)"
                    emptyMessage="Nenhum módulo encontrado."
                  />
                  <p className="mt-1 text-xs text-gray-400">Aparece ao lado de “Novidade” na janela, por exemplo: Novidade · Gestão de Cobranças.</p>
                </div>
                <div>
                  <label htmlFor="novidade-descricao" className={ROTULO}>
                    Descrição
                  </label>
                  <textarea
                    id="novidade-descricao"
                    value={form.descricao}
                    rows={8}
                    maxLength={5000}
                    onChange={(e) => campo('descricao', e.target.value)}
                    placeholder="O que mudou e o ganho para quem usa."
                    className={`${CAMPO} resize-y leading-relaxed`}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Deixe uma linha em branco entre parágrafos. Linhas começando com <b className="font-semibold text-gray-600">-</b> viram a
                    lista de benefícios com ✓.
                  </p>
                </div>

                <div className="grid gap-4 rounded-xl border border-gray-200 p-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
                  <div>
                    <label htmlFor="novidade-data" className={ROTULO}>
                      Exibir a partir de
                    </label>
                    <CampoData
                      id="novidade-data"
                      value={form.exibir_a_partir}
                      onChange={(v) => campo('exibir_a_partir', v)}
                      className={CAMPO}
                    />
                    {agendada && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                        <CalendarClock size={12} />
                        Agendada
                      </p>
                    )}
                  </div>
                  <div className="sm:pt-5">
                    <Interruptor
                      ligado={form.novos_usuarios}
                      onChange={(v) => campo('novos_usuarios', v)}
                      rotulo="Novos usuários também veem"
                      descricao={
                        form.novos_usuarios
                          ? 'Quem for cadastrado depois desta data recebe a novidade no primeiro acesso.'
                          : 'Só vê quem já existia nesta data. Usuários cadastrados depois não recebem.'
                      }
                    />
                  </div>
                </div>

                <div>
                  <span className={ROTULO}>Quem vai ver</span>
                  <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 bg-white" role="group" aria-label="Quem vai ver">
                    {[
                      ['TODOS', 'Todos os usuários'],
                      ['EMPRESAS', 'Por empresa'],
                    ].map(([valor, rotulo]) => {
                      const desabilitado = valor === 'TODOS' && !master;
                      return (
                        <button
                          key={valor}
                          type="button"
                          aria-pressed={form.publico === valor}
                          disabled={desabilitado}
                          title={desabilitado ? 'Só o Master pode mostrar uma novidade para todos os usuários do sistema.' : undefined}
                          onClick={() => campo('publico', valor)}
                          className={`px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            form.publico === valor ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {rotulo}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    {form.publico === 'TODOS'
                      ? 'Todos os usuários ativos do sistema, de todas as empresas, verão esta novidade.'
                      : 'Escolha uma ou mais empresas e, em cada uma, todos os usuários ou só alguns. Usuários Master veem todas as novidades.'}
                  </p>
                </div>

                {form.publico === 'EMPRESAS' && (
                  <div className="space-y-2.5">
                    <SearchableSelect
                      multiple
                      value={form.empresas.map((e) => e.empresa_id)}
                      onChange={escolherEmpresas}
                      options={empresasOpcoes.map((e) => ({ value: e.id, label: e.nome }))}
                      placeholder="Escolha as empresas"
                      emptyMessage="Nenhuma empresa encontrada."
                    />
                    {form.empresas.map((e) => {
                      const usuarios = usuariosPorEmpresa[e.empresa_id];
                      return (
                        <div key={e.empresa_id} className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900">{nomeEmpresa[e.empresa_id] || `Empresa ${e.empresa_id}`}</p>
                            <button
                              type="button"
                              onClick={() => escolherEmpresas(form.empresas.filter((x) => x.empresa_id !== e.empresa_id).map((x) => x.empresa_id))}
                              aria-label="Tirar empresa"
                              className="text-gray-300 hover:text-red-500"
                            >
                              <X size={15} />
                            </button>
                          </div>
                          <Interruptor
                            ligado={e.todos_usuarios}
                            onChange={(v) => alterarEmpresa(e.empresa_id, { todos_usuarios: v })}
                            rotulo="Todos os usuários desta empresa"
                          />
                          {!e.todos_usuarios && (
                            <SearchableSelect
                              multiple
                              value={e.usuario_ids}
                              onChange={(ids) => alterarEmpresa(e.empresa_id, { usuario_ids: ids })}
                              options={(Array.isArray(usuarios) ? usuarios : []).map((u) => ({
                                value: u.id,
                                label: u.permissao === 'MASTER' ? `${u.nome} (Master)` : u.nome,
                              }))}
                              placeholder={usuarios === 'carregando' ? 'Carregando usuários...' : 'Escolha os usuários'}
                              emptyMessage="Nenhum usuário nesta empresa."
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Direita: o GIF e quem já viu ── */}
              <div className="space-y-4">
                <div>
                  <span className={ROTULO}>GIF explicativo</span>
                  <div className="overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50">
                    {midiaUrl ? (
                      <img src={midiaUrl} alt="Prévia do GIF da novidade" className="block h-auto w-full bg-white" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="flex w-full flex-col items-center justify-center gap-2 px-4 py-14 text-sm text-gray-500 transition hover:bg-primary-50 hover:text-primary-700"
                      >
                        <ImagePlus size={22} />
                        Escolher o GIF (até 10 MB)
                      </button>
                    )}
                    {midiaUrl && (
                      <div className="flex items-center justify-between gap-2 border-t border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
                        <span className="truncate">{midiaNome}</span>
                        <button type="button" onClick={() => inputRef.current?.click()} className="shrink-0 font-semibold text-primary-700 hover:underline">
                          Trocar GIF
                        </button>
                      </div>
                    )}
                  </div>
                  <input ref={inputRef} type="file" accept={TIPOS.join(',')} onChange={escolherArquivo} className="hidden" />
                </div>

                <QuemJaViu novidadeId={novidadeId} vistas={vistas} agendada={original?.agendada} exibirAPartir={original?.exibir_a_partir} />
              </div>
            </div>

            {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4">
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setPrevia(true)} disabled={!form.nome.trim() && !form.descricao.trim()}>
                  <span className="flex items-center gap-1.5">
                    <Eye size={15} />
                    Ver como fica
                  </span>
                </Button>
                {novidadeId && (
                  <Button type="button" variant="secondary" onClick={handleExcluir}>
                    <span className="flex items-center gap-1.5 text-red-600">
                      <Trash2 size={15} />
                      Excluir
                    </span>
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={onFechar} disabled={salvando}>
                  Cancelar
                </Button>
                <Button type="button" onClick={handleSalvar} loading={salvando} disabled={!valido}>
                  Salvar novidade
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {previa && <JanelaNovidades novidades={[rascunhoPrevia]} cadastro onFechar={() => setPrevia(false)} />}
    </>
  );
}

// Embaixo do GIF: percentual de quem já viu sobre quem deveria ver (o
// público atual, com a regra de novos usuários) e a lista de quem viu.
function QuemJaViu({ novidadeId, vistas, agendada, exibirAPartir }) {
  if (!novidadeId) {
    return (
      <div className="rounded-xl border border-gray-200 px-4 py-5 text-center text-xs text-gray-500">
        Depois de salvar, aqui aparece quem já viu esta novidade.
      </div>
    );
  }
  if (!vistas) {
    return <div className="rounded-xl border border-gray-200 px-4 py-5 text-center text-xs text-gray-400">Carregando...</div>;
  }
  const pct = Math.min(100, vistas.percentual);
  return (
    <div className="rounded-xl border border-gray-200">
      <div className="space-y-2.5 border-b border-gray-100 px-4 py-3.5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <span className={ROTULO}>Quem já viu</span>
            <p className="text-sm text-gray-600">
              <b className="font-semibold text-gray-900">{vistas.vistas_publico}</b> de {vistas.publico_total}{' '}
              {vistas.publico_total === 1 ? 'usuário que deveria ver' : 'usuários que deveriam ver'}
            </p>
          </div>
          <span className="text-2xl font-semibold tabular-nums text-gray-900">{pct.toLocaleString('pt-BR')}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {agendada && (
          <p className="flex items-center gap-1 text-xs text-amber-700">
            <CalendarClock size={12} />
            Começa a aparecer em {formatarDataNovidade(exibirAPartir)}.
          </p>
        )}
      </div>
      {vistas.usuarios.length === 0 ? (
        <p className="flex items-center justify-center gap-1.5 px-4 py-6 text-xs text-gray-400">
          <Users size={14} />
          Ninguém viu ainda.
        </p>
      ) : (
        <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto">
          {vistas.usuarios.map((u) => (
            <li key={u.id} className={`flex items-center gap-3 px-4 py-2.5 ${u.no_publico ? '' : 'opacity-60'}`}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-700">
                {iniciais(u.nome)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-800">
                  {u.nome}
                  {u.permissao === 'MASTER' && <span className="ml-1.5 text-[11px] text-gray-400">Master</span>}
                </span>
                {!u.no_publico && <span className="block text-[11px] text-gray-400">Fora do público atual</span>}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-gray-500">{dataHora(u.vista_em)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
