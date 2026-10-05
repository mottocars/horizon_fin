import { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Plane,
  Pencil,
  Send,
  Trash2,
  Undo2,
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
  opcoesPlanos,
  devolverCard,
  finalizarCard,
  obterCard,
} from '../../../api/projetos.api';
import Avatar from './Avatar';
import { BUCKET_POR_ID, dataBR, dataHora, prazo, tamanhoArquivo } from './kanban';

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
  const [planos, setPlanos] = useState([]);
  const [erroLocal, setErroLocal] = useState('');

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
    // planos de voo que eu enxergo nesta empresa (com as macro tarefas)
    opcoesPlanos(form.empresa_id)
      .then((lista) => {
        setPlanos(lista);
        setForm((f) => (f.plano_id && !lista.some((p) => String(p.id) === String(f.plano_id)) ? { ...f, plano_id: '', macro_id: '' } : f));
      })
      .catch(() => setPlanos([]));
  }, [form.empresa_id]);

  const macrosDoPlano = planos.find((p) => String(p.id) === String(form.plano_id))?.macros || [];

  const set = (campo) => (valor) => setForm((f) => ({ ...f, [campo]: valor }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        // plano de voo é opcional; se escolhido, a macro tarefa é obrigatória
        if (form.plano_id && !form.macro_id) {
          setErroLocal('Informe a macro tarefa do plano de voo.');
          return;
        }
        setErroLocal('');
        onSalvar({
          ...form,
          empresa_id: Number(form.empresa_id),
          responsavel_id: Number(form.responsavel_id),
          macro_id: form.plano_id ? Number(form.macro_id) : null,
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
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-100 bg-gray-50/60 p-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-700">
            <Plane size={14} className="-rotate-12 text-primary-600" /> Atribuir ao Plano de Voo
          </label>
          <SearchableSelect
            value={form.plano_id}
            onChange={(v) => setForm((f) => ({ ...f, plano_id: v || '', macro_id: '' }))}
            options={planos.map((p) => ({ value: p.id, label: p.nome }))}
            disabled={!form.empresa_id}
            placeholder={planos.length ? 'Opcional' : 'Nenhum plano de voo nesta empresa'}
            emptyMessage="Nenhum plano de voo nesta empresa."
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Macro tarefa {form.plano_id && <span className="text-red-500">*</span>}
          </label>
          <SearchableSelect
            value={form.macro_id}
            onChange={(v) => set('macro_id')(v || '')}
            options={macrosDoPlano.map((m) => ({ value: m.id, label: m.nome }))}
            disabled={!form.plano_id}
            clearable={false}
            placeholder={!form.plano_id ? 'Escolha o plano primeiro' : macrosDoPlano.length ? 'Selecione a macro tarefa' : 'O plano não tem macro tarefas'}
            emptyMessage="Este plano ainda não tem macro tarefas."
          />
        </div>
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
      {(erroLocal || erro) && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{erroLocal || erro}</div>}
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
// `inicialPlano` (nova atividade vinda do Gantt): { empresa_id, plano_id, macro_id } já preenchidos.
export default function CardModal({ aberto, cardId, onFechar, onAlterado, empresas, empresaPadrao, inicialPlano, visao, usuarioAtualId }) {
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
  const [finalizando, setFinalizando] = useState(false);
  const [devolvendo, setDevolvendo] = useState(false);
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

  // Devolver: quem criou não aprova o concluído e manda de volta (Progresso, ou Atrasado se já venceu).
  async function devolver() {
    setDevolvendo(true);
    await executar(() => devolverCard(cardId), 'Não foi possível devolver a atividade.');
    setDevolvendo(false);
  }

  async function finalizar() {
    setFinalizando(true);
    await executar(() => finalizarCard(cardId), 'Não foi possível finalizar a atividade.');
    setFinalizando(false);
  }

  // ─── nova atividade ──────────────────────────────────────────────────────
  if (novo) {
    const hoje = hojeSP();
    return (
      <Modal open={aberto} onClose={() => onFechar()} title="Nova atividade" maxWidthClass="max-w-2xl">
        <FormularioCard
          inicial={{
            empresa_id: inicialPlano?.empresa_id || empresaPadrao || empresas[0]?.value || '',
            plano_id: inicialPlano?.plano_id || '',
            macro_id: inicialPlano?.macro_id || '',
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
            plano_id: c.plano_id || '',
            macro_id: c.macro_id || '',
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
  const ocupado = finalizando || devolvendo;

  // Ações na linha do título "Atividade": Devolver / Finalizar (Concluído, só quem criou), Editar e Excluir.
  const acoes = card && (perm.devolver || perm.finalizar || perm.editar || perm.excluir) && (
    <div className="mr-1 flex items-center gap-1.5">
      {perm.devolver && (
        <button
          type="button"
          onClick={devolver}
          disabled={ocupado}
          title="Devolver para o responsável"
          className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
        >
          {devolvendo ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
          Devolver
        </button>
      )}
      {perm.finalizar && (
        <button
          type="button"
          onClick={finalizar}
          disabled={ocupado}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {finalizando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          Finalizar
        </button>
      )}
      {perm.editar && (
        <button
          type="button"
          onClick={() => setEditando(true)}
          title="Editar atividade"
          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          <Pencil size={16} />
        </button>
      )}
      {perm.excluir && (
        <button
          type="button"
          onClick={excluir}
          title="Excluir atividade"
          className="rounded-lg p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={16} />
        </button>
      )}
      <span className="ml-1 h-5 w-px bg-gray-200" />
    </div>
  );

  return (
    <Modal open={aberto} onClose={() => onFechar()} title="Atividade" maxWidthClass="max-w-5xl" acoes={acoes}>
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
              {card.plano_nome && (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700">
                  <Plane size={12} className="-rotate-12" /> {card.plano_nome} · {card.macro_nome}
                </span>
              )}
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
                {card.concluido_em && (
                  <LinhaDetalhe icone={BadgeCheck} rotulo="Concluída em">
                    {dataHora(card.concluido_em)}
                  </LinhaDetalhe>
                )}
                {card.finalizado_em && (
                  <LinhaDetalhe icone={CalendarCheck} rotulo="Finalizada em">
                    {dataHora(card.finalizado_em)}
                  </LinhaDetalhe>
                )}

                {card.bucket === 'CONCLUIDO' && !perm.finalizar && (
                  <p className="mt-3 border-t border-gray-200 pt-3 text-xs text-gray-500">
                    Concluída. Aguardando {usuarios[card.criador_id]?.nome || 'quem criou'} finalizar.
                  </p>
                )}
                {card.bucket === 'ATRASADO' && !perm.mover && (
                  <p className="mt-3 border-t border-gray-200 pt-3 text-xs text-red-600">Passou da data fim esperada sem ser concluída.</p>
                )}

              </div>

            </aside>
          </div>
        </div>
      )}
    </Modal>
  );
}
