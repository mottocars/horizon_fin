import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import SearchableSelect from '../../../components/SearchableSelect';
import { useConfirm } from '../../../confirm/ConfirmContext';
import {
  anexarArquivos,
  atualizarCard,
  baixarAnexo,
  comentarCard,
  criarCard,
  excluirAnexo,
  excluirCard,
  excluirComentario,
  listarResponsaveis,
  moverCard,
  obterCard,
} from '../../../api/projetos.api';
import Avatar from './Avatar';
import { BUCKET_POR_ID, dataBR, dataHora, destinosPermitidos, prazo, tamanhoArquivo } from './kanban';

const INPUT =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100';

function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function somarDias(iso, dias) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function Secao({ icone: Icone, titulo, extra, children }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <Icone size={14} className="text-gray-400" />
          {titulo}
        </h4>
        {extra}
      </div>
      {children}
    </section>
  );
}

function LinhaDetalhe({ icone: Icone, rotulo, children }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icone size={15} className="mt-0.5 shrink-0 text-gray-400" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-gray-400">{rotulo}</p>
        <div className="text-sm text-gray-800">{children}</div>
      </div>
    </div>
  );
}

// Formulário de criação/edição (só o criador edita).
function FormularioCard({ inicial, empresas, salvando, erro, onSalvar, onCancelar, rotuloSalvar }) {
  const [form, setForm] = useState(inicial);
  const [responsaveis, setResponsaveis] = useState([]);
  const [carregandoResp, setCarregandoResp] = useState(false);

  useEffect(() => {
    if (!form.empresa_id) {
      setResponsaveis([]);
      return;
    }
    setCarregandoResp(true);
    listarResponsaveis(form.empresa_id)
      .then((lista) => {
        setResponsaveis(lista);
        // responsável escolhido sem acesso à nova empresa: limpa
        setForm((f) => (f.responsavel_id && !lista.some((u) => String(u.id) === String(f.responsavel_id)) ? { ...f, responsavel_id: '' } : f));
      })
      .catch(() => setResponsaveis([]))
      .finally(() => setCarregandoResp(false));
  }, [form.empresa_id]);

  const set = (campo) => (valor) => setForm((f) => ({ ...f, [campo]: valor }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSalvar({
          ...form,
          empresa_id: Number(form.empresa_id),
          responsavel_id: Number(form.responsavel_id),
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
          <SearchableSelect
            value={form.empresa_id}
            onChange={(v) => set('empresa_id')(v || '')}
            options={empresas}
            placeholder="Selecione a empresa"
            clearable={false}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Responsável</label>
          <SearchableSelect
            value={form.responsavel_id}
            onChange={(v) => set('responsavel_id')(v || '')}
            options={responsaveis.map((u) => ({ value: u.id, label: u.nome }))}
            disabled={!form.empresa_id || carregandoResp}
            placeholder={!form.empresa_id ? 'Escolha a empresa primeiro' : carregandoResp ? 'Carregando...' : 'Selecione o responsável'}
            clearable={false}
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Assunto</label>
        <input type="text" value={form.assunto} onChange={(e) => set('assunto')(e.target.value)} maxLength={200} className={INPUT} placeholder="O que precisa ser feito" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Data de início</label>
          <input type="date" value={form.data_inicio} max={form.data_fim || undefined} onChange={(e) => set('data_inicio')(e.target.value)} className={INPUT} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Data fim esperada</label>
          <input type="date" value={form.data_fim} min={form.data_inicio || undefined} onChange={(e) => set('data_fim')(e.target.value)} className={INPUT} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Descrição detalhada</label>
        <textarea
          value={form.descricao}
          onChange={(e) => set('descricao')(e.target.value)}
          rows={7}
          className={`${INPUT} resize-y leading-relaxed`}
          placeholder="Contexto, passo a passo, critérios de pronto..."
        />
      </div>
      {erro && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}
      <div className="flex justify-end gap-2">
        {onCancelar && (
          <Button type="button" variant="secondary" onClick={onCancelar} disabled={salvando}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={salvando}>
          {rotuloSalvar}
        </Button>
      </div>
    </form>
  );
}

// Modal da atividade. cardId null = nova atividade.
export default function CardModal({ aberto, cardId, onFechar, onAlterado, empresas, empresaPadrao, visao, usuarioAtualId }) {
  const confirm = useConfirm();
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [erroAcao, setErroAcao] = useState('');
  const [comentario, setComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
  const [movendo, setMovendo] = useState(null);
  const inputArquivoRef = useRef(null);

  const novo = !cardId;

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    setErroAcao('');
    setComentario('');
    setEditando(false);
    if (!cardId) {
      setDados(null);
      return;
    }
    setCarregando(true);
    obterCard(cardId)
      .then(setDados)
      .catch((e) => setErro(e.response?.data?.message || 'Não foi possível abrir a atividade.'))
      .finally(() => setCarregando(false));
  }, [aberto, cardId]);

  // Toda alteração devolve o card completo atualizado — aplica e avisa o quadro.
  function aplicar(novoDados) {
    setDados(novoDados);
    onAlterado?.();
  }

  async function executar(fn, msg) {
    setErroAcao('');
    try {
      aplicar(await fn());
      return true;
    } catch (e) {
      setErroAcao(e.response?.data?.message || msg);
      return false;
    }
  }

  async function salvarNovo(form) {
    setErro('');
    setSalvando(true);
    try {
      const criado = await criarCard(form);
      onAlterado?.();
      setDados(criado);
      onFechar(criado.card.id);
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível criar a atividade.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarEdicao(form) {
    setErro('');
    setSalvando(true);
    try {
      aplicar(await atualizarCard(cardId, form));
      setEditando(false);
    } catch (e) {
      setErro(e.response?.data?.message || 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    const ok = await confirm({
      title: 'Excluir atividade',
      description: `Excluir "${dados.card.assunto}"? Comentários e anexos também serão apagados.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await excluirCard(cardId);
      onAlterado?.();
      onFechar();
    } catch (e) {
      setErroAcao(e.response?.data?.message || 'Não foi possível excluir.');
    }
  }

  async function enviarComentario(e) {
    e.preventDefault();
    if (!comentario.trim()) return;
    setEnviandoComentario(true);
    const ok = await executar(() => comentarCard(cardId, comentario.trim()), 'Não foi possível comentar.');
    if (ok) setComentario('');
    setEnviandoComentario(false);
  }

  async function enviarArquivos(lista) {
    const arquivos = [...lista];
    if (!arquivos.length) return;
    setEnviandoAnexo(true);
    await executar(() => anexarArquivos(cardId, arquivos), 'Não foi possível enviar o anexo.');
    setEnviandoAnexo(false);
    if (inputArquivoRef.current) inputArquivoRef.current.value = '';
  }

  async function baixar(anexo) {
    try {
      const blob = await baixarAnexo(cardId, anexo.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = anexo.nome_original;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErroAcao('Não foi possível baixar o anexo.');
    }
  }

  async function mover(destino) {
    setMovendo(destino);
    await executar(() => moverCard(cardId, destino), 'Não foi possível mover a atividade.');
    setMovendo(null);
  }

  // ─── nova atividade ──────────────────────────────────────────────────────
  if (novo) {
    const hoje = hojeSP();
    return (
      <Modal open={aberto} onClose={() => onFechar()} title="Nova atividade" maxWidthClass="max-w-2xl">
        <FormularioCard
          inicial={{
            empresa_id: empresaPadrao || empresas[0]?.value || '',
            responsavel_id: visao === 'minhas' ? usuarioAtualId : '',
            assunto: '',
            descricao: '',
            data_inicio: hoje,
            data_fim: somarDias(hoje, 7),
          }}
          empresas={empresas}
          salvando={salvando}
          erro={erro}
          onSalvar={salvarNovo}
          onCancelar={() => onFechar()}
          rotuloSalvar="Criar atividade"
        />
      </Modal>
    );
  }

  // ─── editar: mesmo formulário da criação, já preenchido ──────────────────
  if (editando && dados?.card) {
    const c = dados.card;
    return (
      <Modal open={aberto} onClose={() => setEditando(false)} title="Editar atividade" maxWidthClass="max-w-2xl">
        <FormularioCard
          inicial={{
            empresa_id: c.empresa_id,
            responsavel_id: c.responsavel_id,
            assunto: c.assunto,
            descricao: c.descricao || '',
            data_inicio: c.data_inicio,
            data_fim: c.data_fim,
          }}
          empresas={empresas}
          salvando={salvando}
          erro={erro}
          onSalvar={salvarEdicao}
          onCancelar={() => setEditando(false)}
          rotuloSalvar="Salvar alterações"
        />
      </Modal>
    );
  }

  // ─── atividade existente ─────────────────────────────────────────────────
  const card = dados?.card;
  const usuarios = dados?.usuarios || {};
  const perm = dados?.permissoes || {};
  const bucket = card ? BUCKET_POR_ID[card.bucket] : null;
  const hoje = hojeSP();
  const destinos = card && perm.mover ? destinosPermitidos(card, hoje) : [];

  return (
    <Modal open={aberto} onClose={() => onFechar()} title="Atividade" maxWidthClass="max-w-5xl">
      {carregando || !card ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
          {erro ? <span className="text-red-600">{erro}</span> : <><Loader2 size={16} className="animate-spin" /> Carregando...</>}
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${bucket.chip}`}>
                <bucket.Icone size={13} /> {bucket.titulo}
              </span>
              <span className="rounded-md bg-gray-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                {card.empresa_nome}
              </span>
            </div>
            <h2 className="text-xl font-semibold leading-snug text-gray-900">{card.assunto}</h2>
          </div>

          {erroAcao && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erroAcao}</div>}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* coluna principal */}
            <div className="space-y-6 lg:col-span-2">
                <Secao icone={FileText} titulo="Descrição">
                  {card.descricao ? (
                    <p className="whitespace-pre-wrap rounded-xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-700">{card.descricao}</p>
                  ) : (
                    <p className="text-sm italic text-gray-400">Sem descrição.</p>
                  )}
                </Secao>

              <Secao
                icone={Paperclip}
                titulo={`Anexos (${dados.anexos.length})`}
                extra={
                  perm.anexar && (
                    <>
                      <input ref={inputArquivoRef} type="file" multiple className="hidden" onChange={(e) => enviarArquivos(e.target.files)} />
                      <button
                        type="button"
                        onClick={() => inputArquivoRef.current?.click()}
                        disabled={enviandoAnexo}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {enviandoAnexo ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                        Anexar
                      </button>
                    </>
                  )
                }
              >
                <div
                  onDragOver={(e) => {
                    if (!perm.anexar || !e.dataTransfer.types.includes('Files')) return;
                    e.preventDefault();
                    setArrastandoArquivo(true);
                  }}
                  onDragLeave={() => setArrastandoArquivo(false)}
                  onDrop={(e) => {
                    if (!perm.anexar) return;
                    e.preventDefault();
                    setArrastandoArquivo(false);
                    enviarArquivos(e.dataTransfer.files);
                  }}
                  className={`rounded-xl transition-colors ${arrastandoArquivo ? 'bg-primary-50 ring-2 ring-primary-500' : ''}`}
                >
                  {dados.anexos.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-200 px-4 py-4 text-center text-xs text-gray-400">
                      {perm.anexar ? 'Arraste arquivos aqui ou clique em Anexar (até 20 MB cada).' : 'Nenhum anexo.'}
                    </p>
                  ) : (
                    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                      {dados.anexos.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                            <FileText size={15} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <button type="button" onClick={() => baixar(a)} className="block max-w-full truncate text-left text-sm font-medium text-gray-800 hover:text-primary-600">
                              {a.nome_original}
                            </button>
                            <p className="text-[11px] text-gray-400">
                              {tamanhoArquivo(a.tamanho)} · {usuarios[a.usuario_id]?.nome || 'Usuário'} · {dataHora(a.criado_em)}
                            </p>
                          </div>
                          <button type="button" onClick={() => baixar(a)} title="Baixar" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                            <Download size={15} />
                          </button>
                          {(a.usuario_id === usuarioAtualId || perm.editar) && (
                            <button
                              type="button"
                              title="Excluir anexo"
                              onClick={async () => {
                                const ok = await confirm({ title: 'Excluir anexo', description: `Excluir "${a.nome_original}"?`, confirmLabel: 'Excluir', variant: 'danger' });
                                if (ok) executar(() => excluirAnexo(cardId, a.id), 'Não foi possível excluir o anexo.');
                              }}
                              className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Secao>

              <Secao icone={MessageSquare} titulo={`Comentários (${dados.comentarios.length})`}>
                <ul className="space-y-3">
                  {dados.comentarios.map((c) => {
                    const autor = usuarios[c.usuario_id];
                    return (
                      <li key={c.id} className="group flex gap-2.5">
                        <Avatar usuario={autor} tamanho="md" anel={false} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-gray-800">{autor?.nome || 'Usuário'}</span>
                            <span className="text-[11px] text-gray-400">{dataHora(c.criado_em)}</span>
                            {c.usuario_id === usuarioAtualId && (
                              <button
                                type="button"
                                onClick={() => executar(() => excluirComentario(cardId, c.id), 'Não foi possível excluir o comentário.')}
                                className="ml-auto text-[11px] text-gray-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                              >
                                Excluir
                              </button>
                            )}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap rounded-xl rounded-tl-sm bg-gray-50 px-3 py-2 text-sm text-gray-700">{c.texto}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {perm.comentar && (
                  <form onSubmit={enviarComentario} className="mt-3 flex items-start gap-2.5">
                    <Avatar usuario={usuarios[usuarioAtualId] || { id: usuarioAtualId }} tamanho="md" anel={false} />
                    <div className="flex-1">
                      <textarea
                        value={comentario}
                        onChange={(e) => setComentario(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarComentario(e);
                        }}
                        rows={2}
                        placeholder="Escreva um comentário... (Ctrl+Enter envia)"
                        className={`${INPUT} resize-y`}
                      />
                      <div className="mt-1.5 flex justify-end">
                        <Button type="submit" loading={enviandoComentario} disabled={!comentario.trim()}>
                          <Send size={14} />
                          Comentar
                        </Button>
                      </div>
                    </div>
                  </form>
                )}
              </Secao>
            </div>

            {/* coluna lateral */}
            <aside className="space-y-4">
              <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
                <LinhaDetalhe icone={UserRound} rotulo="Responsável">
                  <span className="mt-0.5 flex items-center gap-2">
                    <Avatar usuario={usuarios[card.responsavel_id]} tamanho="sm" anel={false} />
                    {usuarios[card.responsavel_id]?.nome}
                  </span>
                </LinhaDetalhe>
                <LinhaDetalhe icone={Pencil} rotulo="Criada por">
                  <span className="mt-0.5 flex items-center gap-2">
                    <Avatar usuario={usuarios[card.criador_id]} tamanho="xs" anel={false} />
                    {usuarios[card.criador_id]?.nome}
                    <span className="text-[11px] text-gray-400">{dataHora(card.criado_em)}</span>
                  </span>
                </LinhaDetalhe>
                <LinhaDetalhe icone={CalendarPlus} rotulo="Início">
                  {dataBR(card.data_inicio)}
                </LinhaDetalhe>
                <LinhaDetalhe icone={CalendarClock} rotulo="Fim esperado">
                  {dataBR(card.data_fim)} <span className={`ml-1 text-xs ${prazo(card, hoje).tom}`}>{prazo(card, hoje).texto}</span>
                </LinhaDetalhe>
                {card.finalizado_em && (
                  <LinhaDetalhe icone={CalendarCheck} rotulo="Finalizada em">
                    {dataHora(card.finalizado_em)}
                  </LinhaDetalhe>
                )}

                {destinos.length > 0 && (
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-400">Mover para</p>
                    <div className="flex flex-wrap gap-1.5">
                      {destinos.map((d) => {
                        const b = BUCKET_POR_ID[d];
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => mover(d)}
                            disabled={Boolean(movendo)}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition hover:brightness-95 disabled:opacity-60 ${b.chip}`}
                          >
                            {movendo === d ? <Loader2 size={12} className="animate-spin" /> : <ArrowRight size={12} />}
                            {b.titulo}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {card.bucket === 'ATRASADO' && !perm.mover && (
                  <p className="mt-3 border-t border-gray-200 pt-3 text-xs text-red-600">Passou da data fim esperada sem ser finalizada.</p>
                )}

                {(perm.editar || perm.excluir) && (
                  <div className="mt-3 flex gap-2 border-t border-gray-200 pt-3">
                    {perm.editar && (
                      <Button type="button" variant="secondary" onClick={() => setEditando(true)} className="flex-1">
                        <Pencil size={14} />
                        Editar
                      </Button>
                    )}
                    {perm.excluir && (
                      <button
                        type="button"
                        onClick={excluir}
                        title="Excluir atividade"
                        className="flex items-center justify-center rounded-lg border border-gray-200 px-3 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                )}
              </div>

            </aside>
          </div>
        </div>
      )}
    </Modal>
  );
}
