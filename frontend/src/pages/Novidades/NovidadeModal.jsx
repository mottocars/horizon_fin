import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, ImagePlus, Trash2, X } from 'lucide-react';
import Modal from '../../components/Modal';
import Button from '../../components/Button';
import SearchableSelect from '../../components/SearchableSelect';
import { Interruptor } from '../Operacoes/GestaoAprovacoes/ui';
import { useAuth } from '../../auth/AuthContext';
import { useConfirm } from '../../confirm/ConfirmContext';
import { JanelaNovidades, useMidiaNovidade } from '../../layout/Novidades';
import {
  excluirNovidade,
  obterNovidade,
  opcoesEmpresasNovidade,
  opcoesUsuariosNovidade,
  salvarNovidade,
} from '../../api/novidades.api';

const TAMANHO_MAXIMO = 10 * 1024 * 1024;
const TIPOS = ['image/gif', 'image/png', 'image/jpeg', 'image/webp'];
const ROTULO = 'mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-gray-400';
const CAMPO = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100';

function formatarTamanho(bytes) {
  if (!bytes) return '';
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const VAZIA = { nome: '', descricao: '', publico: 'EMPRESAS', empresas: [] };

// Criar/editar uma novidade (Cadastros › Novidades). `novidadeId` nulo = nova.
// Público: "Todos os usuários" (só Master) ou por empresa — várias empresas,
// cada uma com todos os usuários dela ou só os escolhidos.
export default function NovidadeModal({ open, novidadeId, onFechar, onSalvo }) {
  const { user } = useAuth();
  const master = user?.permissao === 'MASTER';
  const confirm = useConfirm();
  const [form, setForm] = useState(VAZIA);
  const [original, setOriginal] = useState(null); // a novidade como está no banco (edição)
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
    opcoesEmpresasNovidade().then(setEmpresasOpcoes).catch(() => setEmpresasOpcoes([]));
    if (!novidadeId) {
      setForm(VAZIA);
      setOriginal(null);
      return;
    }
    setCarregando(true);
    obterNovidade(novidadeId)
      .then((n) => {
        setOriginal(n);
        setForm({
          nome: n.nome,
          descricao: n.descricao,
          publico: n.publico,
          empresas: n.empresas.map((e) => ({ empresa_id: e.empresa_id, todos_usuarios: e.todos_usuarios, usuario_ids: e.usuario_ids || [] })),
        });
      })
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível abrir a novidade.'))
      .finally(() => setCarregando(false));
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
    (arquivo || original?.tem_midia) &&
    (form.publico === 'TODOS' || (form.empresas.length > 0 && form.empresas.every((e) => e.todos_usuarios || e.usuario_ids.length > 0)));

  async function handleSalvar() {
    setSalvando(true);
    setErro('');
    try {
      const dados = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim(),
        publico: form.publico,
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
    descricao: form.descricao || 'A descrição aparece aqui.',
    criado_em: original?.criado_em || new Date().toISOString(),
    tem_midia: Boolean(original?.tem_midia),
    atualizado_em: original?.atualizado_em,
    midia_url: arquivoUrl || undefined,
  };

  return (
    <>
      <Modal open={open} onClose={onFechar} title={novidadeId ? 'Editar novidade' : 'Nova novidade'} maxWidthClass="max-w-5xl">
        {carregando ? (
          <div className="py-12 text-center text-sm text-gray-400">Carregando...</div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              {/* Coluna 1: o conteúdo da janela */}
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
                  <label htmlFor="novidade-descricao" className={ROTULO}>
                    Descrição
                  </label>
                  <textarea
                    id="novidade-descricao"
                    value={form.descricao}
                    rows={9}
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
                <div>
                  <span className={ROTULO}>GIF explicativo</span>
                  <div className="overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50">
                    {midiaUrl ? (
                      <img src={midiaUrl} alt="Prévia do GIF da novidade" className="block h-auto w-full bg-white" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="flex w-full flex-col items-center justify-center gap-2 px-4 py-10 text-sm text-gray-500 transition hover:bg-primary-50 hover:text-primary-700"
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
              </div>

              {/* Coluna 2: quem vai ver */}
              <div className="space-y-4 rounded-xl bg-gray-50 p-4">
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
                  <>
                    <div>
                      <span className={ROTULO}>Empresas</span>
                      <SearchableSelect
                        multiple
                        value={form.empresas.map((e) => e.empresa_id)}
                        onChange={escolherEmpresas}
                        options={empresasOpcoes.map((e) => ({ value: e.id, label: e.nome }))}
                        placeholder="Escolha as empresas"
                        emptyMessage="Nenhuma empresa encontrada."
                      />
                    </div>
                    <div className="space-y-2.5">
                      {form.empresas.map((e) => {
                        const usuarios = usuariosPorEmpresa[e.empresa_id];
                        return (
                          <div key={e.empresa_id} className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
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
                  </>
                )}
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
