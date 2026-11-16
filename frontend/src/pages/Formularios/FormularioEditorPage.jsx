import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CloudOff,
  Copy,
  ExternalLink,
  Building2,
  Eye,
  Inbox,
  Link2,
  ListChecks,
  Loader2,
  Lock,
  Send,
  Settings,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import Card from '../../components/Card';
import Tabs from '../../components/Tabs';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import { useConfirm } from '../../confirm/ConfirmContext';
import {
  alterarStatusFormulario,
  duplicarFormulario,
  excluirFormulario,
  linkPublico,
  obterFormulario,
  salvarFormulario,
} from '../../api/formularios.api';
import EditorPerguntas from './EditorPerguntas';
import ConfiguracoesFormulario from './ConfiguracoesFormulario';
import RespostasFormulario from './RespostasFormulario';
import FormularioResponder from './FormularioResponder';
import { MODALIDADES, STATUS, corAlpha, mensagemErro } from './tipos';
import { useAviso } from './Aviso';
import './formularios.css';

// Campos que a tela edita e o salvamento automático envia.
const CAMPOS_EDITAVEIS = [
  'titulo',
  'descricao',
  'modalidade',
  'cor_tema',
  'mensagem_final',
  'publico_alvo',
  'usuario_ids',
  'anonimo',
  'uma_resposta_por_pessoa',
  'inicio_em',
  'fim_em',
  'perguntas',
];
const ESPERA_SALVAR_MS = 900;

// Cadastros › Formulários › construtor (/cadastros/formularios/:id?empresa_id=N — o formulário é sempre da
// empresa da URL). Abas Perguntas / Respostas / Configurações, como no Google Forms.
// Tudo o que é editado salva sozinho (~1 s depois da última alteração); o indicador do cabeçalho mostra o estado.
export default function FormularioEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const aviso = useAviso();
  const [params, setParams] = useSearchParams();
  const aba = ['perguntas', 'respostas', 'configuracoes'].includes(params.get('aba')) ? params.get('aba') : 'perguntas';
  const empresaId = params.get('empresa_id') || '';
  const lista = `/cadastros/formularios${empresaId ? `?empresa_id=${empresaId}` : ''}`;

  const [form, setForm] = useState(null);
  const [erroCarregar, setErroCarregar] = useState('');
  const [estado, setEstado] = useState('salvo'); // salvo | pendente | salvando | erro
  const [erroSalvar, setErroSalvar] = useState('');
  const [salvoEm, setSalvoEm] = useState(null);
  const [previa, setPrevia] = useState(false);
  const [compartilhar, setCompartilhar] = useState(false);
  const [problemas, setProblemas] = useState(null);
  const [mudandoStatus, setMudandoStatus] = useState(false);
  const [versaoRespostas, setVersaoRespostas] = useState(0);

  const formRef = useRef(null);
  const versaoLocal = useRef(0);
  const versaoSalva = useRef(0);
  const salvando = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!empresaId) {
      navigate('/cadastros/formularios', { replace: true });
      return undefined;
    }
    let vivo = true;
    obterFormulario(empresaId, id)
      .then((f) => {
        if (!vivo) return;
        formRef.current = f;
        setForm(f);
      })
      .catch((e) => vivo && setErroCarregar(mensagemErro(e, 'Não foi possível abrir o formulário.')));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, empresaId]);

  // Grava o estado atual. Se algo mudar durante a gravação, grava de novo no fim.
  const salvarAgora = useCallback(async () => {
    clearTimeout(timer.current);
    if (salvando.current) {
      await salvando.current;
      if (versaoLocal.current === versaoSalva.current) return true;
    }
    if (versaoLocal.current === versaoSalva.current) return true;
    const enviada = versaoLocal.current;
    const atual = formRef.current;
    const payload = Object.fromEntries(CAMPOS_EDITAVEIS.map((c) => [c, atual[c]]));
    setEstado('salvando');
    const promessa = salvarFormulario(atual.empresa_id, atual.id, payload)
      .then((r) => {
        versaoSalva.current = Math.max(versaoSalva.current, enviada);
        setForm((f) => {
          const prox = { ...f, status: r.status, atualizado_em: r.atualizado_em, qtd_respostas: r.qtd_respostas };
          formRef.current = prox;
          return prox;
        });
        setSalvoEm(new Date());
        setErroSalvar('');
        setEstado(versaoLocal.current === versaoSalva.current ? 'salvo' : 'pendente');
        return true;
      })
      .catch((e) => {
        setErroSalvar(mensagemErro(e, 'Não foi possível salvar.'));
        setEstado('erro');
        return false;
      })
      .finally(() => {
        salvando.current = null;
      });
    salvando.current = promessa;
    const ok = await promessa;
    if (ok && versaoLocal.current !== versaoSalva.current) return salvarAgora();
    return ok;
  }, []);

  const alterar = useCallback(
    (patch) => {
      setForm((f) => {
        const prox = { ...f, ...patch };
        formRef.current = prox;
        return prox;
      });
      versaoLocal.current += 1;
      setEstado('pendente');
      clearTimeout(timer.current);
      timer.current = setTimeout(salvarAgora, ESPERA_SALVAR_MS);
    },
    [salvarAgora]
  );

  // Mudanças que o servidor já gravou (ex.: link novo) — só atualiza a tela.
  const atualizadoNoServidor = useCallback((patch) => {
    setForm((f) => {
      const prox = { ...f, ...patch };
      formRef.current = prox;
      return prox;
    });
  }, []);

  // Sair da tela com alteração pendente: avisa o navegador e grava ao desmontar.
  useEffect(() => {
    const antes = (e) => {
      if (versaoLocal.current !== versaoSalva.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', antes);
    return () => {
      window.removeEventListener('beforeunload', antes);
      if (versaoLocal.current !== versaoSalva.current && formRef.current) salvarAgora();
    };
  }, [salvarAgora]);

  function trocarAba(nova) {
    salvarAgora();
    const next = new URLSearchParams(params);
    if (nova === 'perguntas') next.delete('aba');
    else next.set('aba', nova);
    setParams(next, { replace: true });
  }

  async function mudarStatus(status) {
    setMudandoStatus(true);
    try {
      if (!(await salvarAgora())) return;
      if (status === 'ENCERRADO') {
        const ok = await confirm({
          title: 'Encerrar respostas',
          description:
            form.modalidade === 'PUBLICO'
              ? 'O link passa a avisar que o formulário não aceita mais respostas. Dá para reabrir depois.'
              : 'A janela deixa de aparecer para quem ainda não respondeu. Dá para reabrir depois.',
          confirmLabel: 'Encerrar',
          variant: 'warning',
        });
        if (!ok) return;
      }
      const r = await alterarStatusFormulario(form.empresa_id, form.id, status);
      atualizadoNoServidor({ status: r.status, publicado_em: r.publicado_em });
      if (status === 'PUBLICADO') {
        if (form.modalidade === 'PUBLICO') setCompartilhar(true);
        else aviso(form.modalidade === 'PRIVADO_OBRIGATORIO' ? 'Publicado: o público-alvo responde ao entrar no sistema.' : 'Publicado: a janela aparece para o público-alvo ao entrar.');
      } else aviso(status === 'ENCERRADO' ? 'Respostas encerradas.' : 'Formulário de volta a rascunho.');
    } catch (e) {
      const lista = e?.response?.data?.problemas;
      if (lista?.length) setProblemas(lista);
      else aviso(mensagemErro(e, 'Não foi possível alterar a situação.'));
    } finally {
      setMudandoStatus(false);
    }
  }

  async function duplicar() {
    await salvarAgora();
    try {
      const novo = await duplicarFormulario(form.empresa_id, form.id);
      aviso('Cópia criada.');
      navigate(`/cadastros/formularios/${novo.id}?empresa_id=${novo.empresa_id}`);
    } catch (e) {
      aviso(mensagemErro(e, 'Não foi possível duplicar.'));
    }
  }

  async function excluir() {
    const ok = await confirm({
      title: 'Excluir formulário',
      description: `Excluir "${form.titulo}"${form.qtd_respostas ? ` e as ${form.qtd_respostas} resposta(s) recebidas` : ''}? Não dá para desfazer.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      clearTimeout(timer.current);
      versaoSalva.current = versaoLocal.current;
      await excluirFormulario(form.empresa_id, form.id);
      aviso('Formulário excluído.');
      navigate(lista);
    } catch (e) {
      aviso(mensagemErro(e, 'Não foi possível excluir.'));
    }
  }

  if (erroCarregar) {
    return (
      <Card className="py-14 text-center">
        <p className="text-sm font-medium text-gray-800">{erroCarregar}</p>
        <button type="button" onClick={() => navigate(lista)} className="mt-3 text-sm font-medium text-primary-600 hover:underline">
          Voltar para a lista
        </button>
      </Card>
    );
  }
  if (!form) return <Card className="py-16 text-center text-sm text-gray-400">Carregando...</Card>;

  const mod = MODALIDADES[form.modalidade];
  const st = STATUS[form.status];
  const ModIcone = mod.icone;
  const abas = [
    { id: 'perguntas', label: 'Perguntas', icon: ListChecks },
    { id: 'respostas', label: `Respostas${form.qtd_respostas ? ` (${form.qtd_respostas})` : ''}`, icon: Inbox },
    { id: 'configuracoes', label: 'Configurações', icon: Settings },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={async () => {
                await salvarAgora();
                navigate(lista);
              }}
              title="Voltar para a lista"
              className="flex shrink-0 items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
            >
              <ArrowLeft size={18} />
            </button>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: corAlpha(form.cor_tema, 0.12), color: form.cor_tema }}>
              <ListChecks size={20} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-gray-900">{form.titulo || 'Formulário sem título'}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                {form.empresa_nome && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700" title="Empresa do formulário">
                    <Building2 size={12} />
                    {form.empresa_nome}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${mod.cor}`}>
                  <ModIcone size={12} />
                  {mod.rotulo}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${st.cor}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${st.ponto}`} />
                  {st.rotulo}
                </span>
                <IndicadorSalvamento estado={estado} salvoEm={salvoEm} erro={erroSalvar} onTentar={salvarAgora} />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <BotaoQuadrado icone={Eye} titulo="Pré-visualizar" onClick={() => setPrevia(true)} />
            {form.modalidade === 'PUBLICO' && <BotaoQuadrado icone={Link2} titulo="Compartilhar link" onClick={() => setCompartilhar(true)} />}
            <BotaoQuadrado icone={Copy} titulo="Duplicar" onClick={duplicar} />
            <BotaoQuadrado icone={Trash2} titulo="Excluir" onClick={excluir} perigo />
            <span className="mx-1 hidden h-7 w-px bg-gray-200 sm:block" />
            {form.status === 'RASCUNHO' && (
              <Button onClick={() => mudarStatus('PUBLICADO')} loading={mudandoStatus}>
                {!mudandoStatus && <Send size={16} />}
                Publicar
              </Button>
            )}
            {form.status === 'PUBLICADO' && (
              <Button variant="secondary" onClick={() => mudarStatus('ENCERRADO')} loading={mudandoStatus}>
                {!mudandoStatus && <Lock size={16} />}
                Encerrar respostas
              </Button>
            )}
            {form.status === 'ENCERRADO' && (
              <>
                <Button variant="secondary" onClick={() => mudarStatus('RASCUNHO')} disabled={mudandoStatus}>
                  Voltar a rascunho
                </Button>
                <Button onClick={() => mudarStatus('PUBLICADO')} loading={mudandoStatus}>
                  {!mudandoStatus && <Unlock size={16} />}
                  Reabrir
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      <div>
        <Tabs tabs={abas} activeId={aba} onChange={trocarAba} />
        {aba === 'perguntas' && <EditorPerguntas form={form} alterar={alterar} />}
        {aba === 'respostas' && <RespostasFormulario form={form} versao={versaoRespostas} />}
        {aba === 'configuracoes' && <ConfiguracoesFormulario form={form} alterar={alterar} onAtualizado={atualizadoNoServidor} />}
      </div>

      {previa && <PreviaModal form={form} onClose={() => setPrevia(false)} />}
      {compartilhar && <CompartilharModal form={form} onClose={() => setCompartilhar(false)} onIrConfiguracoes={() => { setCompartilhar(false); trocarAba('configuracoes'); }} />}
      <Modal open={!!problemas} title="Falta pouco para publicar" onClose={() => setProblemas(null)}>
        <p className="text-sm text-gray-600">Ajuste estes pontos e publique de novo:</p>
        <ul className="mt-3 space-y-2">
          {(problemas || []).map((p) => (
            <li key={p} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {p}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setProblemas(null)}>Entendi</Button>
        </div>
      </Modal>
      {/* Recarrega a aba Respostas quando volta para ela (pode ter chegado resposta nova). */}
      <RecarregarAoVoltar aba={aba} onVoltar={() => setVersaoRespostas((n) => n + 1)} />
    </div>
  );
}

function RecarregarAoVoltar({ aba, onVoltar }) {
  const anterior = useRef(aba);
  useEffect(() => {
    if (aba === 'respostas' && anterior.current !== 'respostas') onVoltar();
    anterior.current = aba;
  }, [aba, onVoltar]);
  return null;
}

function BotaoQuadrado({ icone: Icone, titulo, onClick, perigo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className={`flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-500 transition ${perigo ? 'hover:border-red-200 hover:bg-red-50 hover:text-red-600' : 'hover:bg-gray-50 hover:text-gray-700'}`}
    >
      <Icone size={18} />
    </button>
  );
}

function IndicadorSalvamento({ estado, salvoEm, erro, onTentar }) {
  if (estado === 'salvando' || estado === 'pendente') {
    return (
      <span className="inline-flex items-center gap-1 text-gray-400">
        <Loader2 size={12} className="animate-spin" />
        Salvando…
      </span>
    );
  }
  if (estado === 'erro') {
    return (
      <button type="button" onClick={onTentar} title={erro} className="inline-flex max-w-md items-center gap-1 truncate text-red-600 hover:underline">
        <CloudOff size={12} className="shrink-0" />
        <span className="truncate">{erro} Tentar de novo</span>
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-gray-400">
      <CheckCircle2 size={12} />
      {salvoEm ? `Salvo às ${salvoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Todas as alterações salvas'}
    </span>
  );
}

// Prévia: o formulário como quem responde vê; o envio não grava nada.
function PreviaModal({ form, onClose }) {
  const [chave, setChave] = useState(0);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="form-janela-fundo fixed inset-0 z-50 flex items-stretch justify-center bg-gray-900/50 p-0 backdrop-blur-sm sm:p-6">
      <div className="form-janela flex w-full max-w-4xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Eye size={16} className="text-gray-400" />
            <span className="font-semibold text-gray-900">Pré-visualização</span>
            <span className="hidden text-gray-400 sm:inline">· as respostas desta prévia não são gravadas</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setChave((n) => n + 1)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100">
              Recomeçar
            </button>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Fechar">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-8 sm:px-8" style={{ backgroundColor: corAlpha(form.cor_tema, 0.07) }}>
          <FormularioResponder
            key={chave}
            formulario={form}
            onEnviar={() => new Promise((ok) => setTimeout(ok, 400))}
            textoEnviado={`${form.mensagem_final?.trim() || 'Sua resposta foi registrada. Obrigado por participar!'}\n\n(Prévia — nada foi gravado.)`}
          />
        </div>
      </div>
    </div>
  );
}

function CompartilharModal({ form, onClose, onIrConfiguracoes }) {
  const aviso = useAviso();
  const link = linkPublico(form.token_publico);
  const publicado = form.status === 'PUBLICADO';
  const textoWhats = encodeURIComponent(`${form.titulo}\n${link}`);
  const assunto = encodeURIComponent(form.titulo);
  const corpo = encodeURIComponent(`${form.descricao ? `${form.descricao}\n\n` : ''}Responda pelo link: ${link}`);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      aviso('Link copiado.');
    } catch {
      aviso(link);
    }
  }
  return (
    <Modal open title={publicado ? 'Formulário publicado' : 'Compartilhar'} onClose={onClose} maxWidthClass="max-w-lg">
      {publicado ? (
        <p className="text-sm text-gray-600">Qualquer pessoa com este link responde, sem precisar entrar no sistema.</p>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {form.status === 'RASCUNHO' ? 'Ainda é um rascunho — o link só funciona depois de publicar.' : 'O formulário está encerrado — o link avisa que não aceita respostas.'}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <input readOnly value={link} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700 focus:outline-none" />
        <Button onClick={copiar}>
          <Copy size={15} />
          Copiar
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <a href={`https://wa.me/?text=${textoWhats}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          WhatsApp
        </a>
        <a href={`mailto:?subject=${assunto}&body=${corpo}`} className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          E-mail
        </a>
        <a href={link} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
          <ExternalLink size={14} />
          Abrir
        </a>
      </div>
      <button type="button" onClick={onIrConfiguracoes} className="mt-4 text-xs font-medium text-primary-600 hover:underline">
        Período de respostas, limite por pessoa e link novo ficam em Configurações
      </button>
    </Modal>
  );
}
