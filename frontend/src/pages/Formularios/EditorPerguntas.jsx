import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  GripHorizontal,
  GripVertical,
  Heading,
  ImagePlus,
  Loader2,
  RefreshCw,
  Mail,
  Phone,
  Plus,
  PlusCircle,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import SearchableSelect from '../../components/SearchableSelect';
import { TimbreEmpresa } from './FormularioResponder';
import { mostrarAviso } from './Aviso';
import { removerLogoCentralFormulario, salvarLogoCentralFormulario } from '../../api/formularios.api';
import { redimensionarLogoBanco } from '../../utils/imagemLogoBanco';
import { TIPO, TIPOS_COM_OPCOES, TIPOS_PERGUNTA, corAlpha, novaPergunta, novoId, trocarTipo } from './tipos';

// Aba Perguntas do construtor: o formulário montado como no Google Forms — cabeçalho (título/descrição) e um
// cartão por pergunta. Clicar num cartão abre a edição dele; os outros mostram como a pergunta vai aparecer.
// Tudo o que muda aqui vai para `alterar` (o salvamento automático fica em FormularioEditorPage).

function TextoAuto({ value, onChange, className = '', autoFocus, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return <textarea ref={ref} rows={1} value={value} onChange={(e) => onChange(e.target.value)} className={`block w-full resize-none overflow-hidden ${className}`} {...props} />;
}

export default function EditorPerguntas({ form, alterar, atualizadoNoServidor }) {
  const cor = form.cor_tema || '#2563eb';
  const perguntas = form.perguntas || [];
  const [ativo, setAtivo] = useState(perguntas[0]?.id || 'cabecalho');
  const [focarId, setFocarId] = useState(null);
  const [arrastavel, setArrastavel] = useState(null);
  const [arrastando, setArrastando] = useState(null);
  const [novos, setNovos] = useState(() => new Set());
  const cartoes = useRef({});

  const definirPerguntas = (lista) => alterar({ perguntas: lista });
  const atualizar = (id, patch) => definirPerguntas(perguntas.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  function inserir(p, depoisDe = ativo) {
    const i = perguntas.findIndex((x) => x.id === depoisDe);
    const lista = [...perguntas];
    lista.splice(i >= 0 ? i + 1 : lista.length, 0, p);
    definirPerguntas(lista);
    setAtivo(p.id);
    setFocarId(p.id);
    setNovos((s) => new Set(s).add(p.id));
    requestAnimationFrame(() => cartoes.current[p.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function adicionar(tipo) {
    const atual = perguntas.find((p) => p.id === ativo);
    const t = tipo || (atual && atual.tipo !== 'SECAO' ? atual.tipo : 'MULTIPLA_ESCOLHA');
    inserir(novaPergunta(t));
  }

  function duplicar(p) {
    const copia = JSON.parse(JSON.stringify(p));
    copia.id = novoId();
    if (copia.opcoes) copia.opcoes = copia.opcoes.map((o) => ({ ...o, id: novoId() }));
    inserir(copia, p.id);
  }

  function remover(p) {
    const i = perguntas.findIndex((x) => x.id === p.id);
    const lista = perguntas.filter((x) => x.id !== p.id);
    definirPerguntas(lista);
    setAtivo(lista[Math.max(0, i - 1)]?.id || 'cabecalho');
  }

  function mover(p, delta) {
    const i = perguntas.findIndex((x) => x.id === p.id);
    const j = i + delta;
    if (j < 0 || j >= perguntas.length) return;
    const lista = [...perguntas];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    definirPerguntas(lista);
    requestAnimationFrame(() => cartoes.current[p.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  // Arrastar: o cartão só fica "arrastável" enquanto o mouse está na alça (senão atrapalha selecionar texto).
  function aoArrastarSobre(e, alvo) {
    if (!arrastando || arrastando === alvo.id) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const metadeDeBaixo = e.clientY > r.top + r.height / 2;
    const semArrastado = perguntas.filter((p) => p.id !== arrastando);
    let destino = semArrastado.findIndex((p) => p.id === alvo.id) + (metadeDeBaixo ? 1 : 0);
    const atualIdx = perguntas.findIndex((p) => p.id === arrastando);
    const lista = [...semArrastado];
    lista.splice(destino, 0, perguntas[atualIdx]);
    if (lista.some((p, k) => p.id !== perguntas[k].id)) definirPerguntas(lista);
  }

  return (
    <div className="rounded-card rounded-tl-none bg-white p-3 shadow-card sm:p-5">
      <div className="rounded-xl px-3 py-6 sm:px-6 sm:py-8" style={{ backgroundColor: corAlpha(cor, 0.07) }}>
        <div className="mx-auto flex max-w-[52rem] items-start gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            {/* Cabeçalho */}
            <div
              onClick={() => setAtivo('cabecalho')}
              className={`relative overflow-hidden rounded-xl border bg-white shadow-sm transition ${ativo === 'cabecalho' ? 'border-gray-200 shadow-md' : 'border-gray-200'}`}
            >
              <div className="h-2.5" style={{ backgroundColor: cor }} />
              {ativo === 'cabecalho' && <span className="absolute bottom-0 left-0 top-2.5 w-1.5" style={{ backgroundColor: cor }} />}
              <div className="space-y-2 px-6 pb-5 pt-4">
                <TimbreEmpresa
                  nome={form.empresa_nome}
                  logo={form.empresa_logo}
                  centro={<LogoCentralEditavel form={form} atualizadoNoServidor={atualizadoNoServidor} />}
                />
                <TextoAuto
                  value={form.titulo}
                  onChange={(v) => alterar({ titulo: v.replace(/\n/g, ' ') })}
                  placeholder="Título do formulário"
                  maxLength={200}
                  className="border-b-2 border-transparent py-1 text-[26px] font-semibold leading-tight tracking-tight text-gray-900 placeholder:text-gray-300 focus:border-[var(--tema)] focus:outline-none"
                  style={{ '--tema': cor }}
                />
                <TextoAuto
                  value={form.descricao}
                  onChange={(v) => alterar({ descricao: v })}
                  placeholder="Descrição do formulário (opcional)"
                  maxLength={5000}
                  className="border-b border-transparent py-1 text-sm leading-relaxed text-gray-600 placeholder:text-gray-400 hover:border-gray-200 focus:border-[var(--tema)] focus:outline-none"
                  style={{ '--tema': cor }}
                />
              </div>
            </div>

            {perguntas.map((p, i) => (
              <div
                key={p.id}
                ref={(el) => (cartoes.current[p.id] = el)}
                draggable={arrastavel === p.id}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', p.id);
                  setArrastando(p.id);
                }}
                onDragEnd={() => {
                  setArrastando(null);
                  setArrastavel(null);
                }}
                onDragOver={(e) => aoArrastarSobre(e, p)}
                onDrop={(e) => e.preventDefault()}
                className={`${novos.has(p.id) ? 'form-cartao-novo' : ''} ${arrastando === p.id ? 'opacity-40' : ''}`}
              >
                {ativo === p.id ? (
                  <CartaoEdicao
                    p={p}
                    indice={i}
                    total={perguntas.length}
                    cor={cor}
                    focar={focarId === p.id}
                    onAlterar={(patch) => atualizar(p.id, patch)}
                    onTrocarTipo={(tipo) => definirPerguntas(perguntas.map((x) => (x.id === p.id ? trocarTipo(x, tipo) : x)))}
                    onDuplicar={() => duplicar(p)}
                    onRemover={() => remover(p)}
                    onMover={(d) => mover(p, d)}
                    onSegurarAlca={(sim) => setArrastavel(sim ? p.id : null)}
                  />
                ) : (
                  <CartaoPrevia p={p} cor={cor} onClick={() => setAtivo(p.id)} onSegurarAlca={(sim) => setArrastavel(sim ? p.id : null)} />
                )}
              </div>
            ))}

            <AdicionarRapido cor={cor} onEscolher={(tipo) => inserir(novaPergunta(tipo), perguntas[perguntas.length - 1]?.id)} />
          </div>

          {/* Barra lateral fixa, como a do Google Forms */}
          <div className="sticky top-2 hidden shrink-0 flex-col gap-1 rounded-xl border border-gray-200 bg-white p-1.5 shadow-md sm:flex">
            <BotaoBarra icone={PlusCircle} titulo="Adicionar pergunta" onClick={() => adicionar()} />
            <BotaoBarra icone={Heading} titulo="Adicionar título e descrição" onClick={() => adicionar('SECAO')} />
          </div>
        </div>
      </div>
    </div>
  );
}

function BotaoBarra({ icone: Icone, titulo, onClick }) {
  return (
    <button type="button" onClick={onClick} title={titulo} aria-label={titulo} className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-800">
      <Icone size={20} />
    </button>
  );
}

// "+ Adicionar pergunta" no fim da lista: abre a grade com todos os tipos.
function AdicionarRapido({ cor, onEscolher }) {
  const [aberto, setAberto] = useState(false);
  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white/60 py-4 text-sm font-medium text-gray-500 transition hover:border-[var(--tema)] hover:bg-white hover:text-[var(--tema)]"
        style={{ '--tema': cor }}
      >
        <Plus size={18} />
        Adicionar pergunta
      </button>
    );
  }
  return (
    <div className="form-cartao-novo rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-gray-800">Que tipo de pergunta?</p>
        <button type="button" onClick={() => setAberto(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Fechar">
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {TIPOS_PERGUNTA.map((t) => {
          const Icone = t.icone;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onEscolher(t.id);
                setAberto(false);
              }}
              className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 px-2 py-3 text-center text-xs font-medium text-gray-700 transition hover:border-[var(--tema)] hover:bg-[var(--tema-suave)]"
              style={{ '--tema': cor, '--tema-suave': corAlpha(cor, 0.06) }}
            >
              <Icone size={20} style={{ color: cor }} />
              {t.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Alca({ onSegurar, claro }) {
  return (
    <div
      onMouseDown={() => onSegurar(true)}
      onMouseUp={() => onSegurar(false)}
      onClick={(e) => e.stopPropagation()}
      title="Arraste para mudar a ordem"
      className={`flex cursor-grab justify-center pt-1.5 active:cursor-grabbing ${claro ? 'text-gray-300' : 'text-gray-300 opacity-0 transition group-hover:opacity-100'}`}
    >
      <GripHorizontal size={18} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Cartão fechado: como a pergunta vai aparecer.
// ---------------------------------------------------------------------------------------------

function CartaoPrevia({ p, cor, onClick, onSegurarAlca }) {
  if (p.tipo === 'SECAO') {
    return (
      <div onClick={onClick} className="group cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
        <div className="flex items-center justify-between px-6 py-2.5 text-sm font-semibold text-white" style={{ backgroundColor: cor }}>
          <span className="truncate">{p.titulo || 'Seção sem título'}</span>
        </div>
        <Alca onSegurar={onSegurarAlca} />
        {p.descricao && <p className="whitespace-pre-line px-6 pb-4 text-sm text-gray-600">{p.descricao}</p>}
      </div>
    );
  }
  const Icone = TIPO[p.tipo]?.icone;
  return (
    <div onClick={onClick} className="group cursor-pointer rounded-xl border border-gray-200 bg-white px-6 pb-5 shadow-sm transition hover:shadow-md">
      <Alca onSegurar={onSegurarAlca} />
      <div className="flex items-start justify-between gap-4">
        <p className={`text-[15px] font-medium leading-snug ${p.titulo ? 'text-gray-900' : 'italic text-gray-400'}`}>
          {p.titulo || 'Pergunta sem título'}
          {p.obrigatoria && <span className="ml-1 text-rose-600">*</span>}
        </p>
        {Icone && (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-gray-400">
            <Icone size={13} />
            {TIPO[p.tipo].rotulo}
          </span>
        )}
      </div>
      {p.descricao && <p className="mt-1 whitespace-pre-line text-xs text-gray-500">{p.descricao}</p>}
      <div className="mt-3">
        <PreviaCampo p={p} cor={cor} />
      </div>
    </div>
  );
}

function PreviaCampo({ p }) {
  switch (p.tipo) {
    case 'TEXTO_CURTO':
      return <div className="w-1/2 border-b border-dotted border-gray-300 pb-1.5 text-sm text-gray-400">Texto de resposta curta</div>;
    case 'TEXTO_LONGO':
      return <div className="w-4/5 border-b border-dotted border-gray-300 pb-1.5 text-sm text-gray-400">Texto de resposta longa</div>;
    case 'NUMERO':
      return <div className="w-40 border-b border-dotted border-gray-300 pb-1.5 text-sm text-gray-400">Número</div>;
    case 'EMAIL':
      return (
        <div className="flex w-64 items-center gap-2 border-b border-dotted border-gray-300 pb-1.5 text-sm text-gray-400">
          <Mail size={15} />
          nome@empresa.com.br
        </div>
      );
    case 'TELEFONE':
      return (
        <div className="flex w-52 items-center gap-2 border-b border-dotted border-gray-300 pb-1.5 text-sm tabular-nums text-gray-400">
          <Phone size={15} />
          (00) 00000-0000
        </div>
      );
    case 'DATA':
      return <div className="w-40 border-b border-dotted border-gray-300 pb-1.5 text-sm text-gray-400">dd/mm/aaaa</div>;
    case 'MULTIPLA_ESCOLHA':
    case 'CAIXAS_SELECAO':
    case 'LISTA':
      return (
        <div className="space-y-2">
          {(p.opcoes || []).slice(0, 8).map((o, i) => (
            <div key={o.id} className="flex items-center gap-3 text-sm text-gray-700">
              <MarcadorOpcao tipo={p.tipo} indice={i} />
              <span className="truncate">{o.texto || <span className="italic text-gray-400">(sem texto)</span>}</span>
            </div>
          ))}
          {(p.opcoes || []).length > 8 && <p className="pl-7 text-xs text-gray-400">+ {(p.opcoes || []).length - 8} opções</p>}
          {p.outro && (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <MarcadorOpcao tipo={p.tipo} />
              Outro…
            </div>
          )}
        </div>
      );
    case 'ESCALA_LINEAR': {
      const { min = 1, max = 5, rotulo_min: a, rotulo_max: b } = p.escala || {};
      return (
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          {a && <span>{a}</span>}
          {Array.from({ length: max - min + 1 }, (_, i) => (
            <span key={i} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 tabular-nums text-gray-600">
              {min + i}
            </span>
          ))}
          {b && <span>{b}</span>}
        </div>
      );
    }
    case 'AVALIACAO':
      return (
        <div className="flex gap-1">
          {Array.from({ length: p.escala?.max || 5 }, (_, i) => (
            <Star key={i} size={22} className="text-gray-300" strokeWidth={1.6} />
          ))}
        </div>
      );
    default:
      return null;
  }
}

function MarcadorOpcao({ tipo, indice }) {
  if (tipo === 'LISTA') return <span className="w-4 shrink-0 text-right text-xs tabular-nums text-gray-400">{indice !== undefined ? `${indice + 1}.` : ''}</span>;
  return <span className={`h-4 w-4 shrink-0 border-2 border-gray-300 ${tipo === 'CAIXAS_SELECAO' ? 'rounded-[4px]' : 'rounded-full'}`} />;
}

// ---------------------------------------------------------------------------------------------
// Cartão aberto: edição da pergunta.
// ---------------------------------------------------------------------------------------------

function CartaoEdicao({ p, indice, total, cor, focar, onAlterar, onTrocarTipo, onDuplicar, onRemover, onMover, onSegurarAlca }) {
  const [mostrarDescricao, setMostrarDescricao] = useState(Boolean(p.descricao));
  const secao = p.tipo === 'SECAO';
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-md" style={{ '--tema': cor }}>
      <span className="absolute bottom-0 left-0 top-0 w-1.5" style={{ backgroundColor: cor }} />
      <Alca onSegurar={onSegurarAlca} claro />
      <div className="px-6 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            {secao && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: cor }}>Título e descrição</p>}
            <TextoAuto
              value={p.titulo}
              onChange={(v) => onAlterar({ titulo: v.replace(/\n/g, ' ') })}
              autoFocus={focar}
              placeholder={secao ? 'Título da seção' : 'Pergunta'}
              maxLength={500}
              className={`rounded-t-lg border-b-2 border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-[var(--tema)] focus:bg-gray-100/70 focus:outline-none ${secao ? 'text-lg font-semibold' : 'text-[15px]'}`}
            />
          </div>
          <SeletorTipo valor={p.tipo} onChange={onTrocarTipo} cor={cor} />
        </div>

        {(mostrarDescricao || secao) && (
          <TextoAuto
            value={p.descricao || ''}
            onChange={(v) => onAlterar({ descricao: v })}
            placeholder="Descrição"
            maxLength={2000}
            className="mt-3 border-b border-gray-200 px-1 py-1.5 text-sm text-gray-600 placeholder:text-gray-400 focus:border-[var(--tema)] focus:outline-none"
          />
        )}

        <div className="mt-5">
          {TIPOS_COM_OPCOES.includes(p.tipo) && <EditorOpcoes p={p} onAlterar={onAlterar} />}
          {p.tipo === 'ESCALA_LINEAR' && <EditorEscala p={p} onAlterar={onAlterar} />}
          {p.tipo === 'AVALIACAO' && <EditorEstrelas p={p} onAlterar={onAlterar} />}
          {['TEXTO_CURTO', 'TEXTO_LONGO', 'NUMERO', 'DATA', 'EMAIL', 'TELEFONE'].includes(p.tipo) && <PreviaCampo p={p} />}
          {p.tipo === 'EMAIL' && <p className="mt-3 text-[11px] text-gray-400">Só aceita e-mail em formato válido (ex.: nome@empresa.com.br).</p>}
          {p.tipo === 'TELEFONE' && (
            <p className="mt-3 text-[11px] text-gray-400">Máscara com DDD — aceita fixo (00) 0000-0000 e celular (00) 90000-0000; DDD e quantidade de dígitos são conferidos.</p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-1 border-t border-gray-100 pt-3">
          <BotaoAcao icone={ArrowUp} titulo="Mover para cima" onClick={() => onMover(-1)} disabled={indice === 0} />
          <BotaoAcao icone={ArrowDown} titulo="Mover para baixo" onClick={() => onMover(1)} disabled={indice === total - 1} />
          <span className="mx-1.5 h-6 w-px bg-gray-200" />
          {!secao && (
            <BotaoAcao icone={AlignLeft} titulo={mostrarDescricao ? 'Esconder descrição' : 'Incluir descrição'} ativo={mostrarDescricao} onClick={() => {
              if (mostrarDescricao) onAlterar({ descricao: '' });
              setMostrarDescricao((v) => !v);
            }} />
          )}
          <BotaoAcao icone={Copy} titulo="Duplicar" onClick={onDuplicar} />
          <BotaoAcao icone={Trash2} titulo="Excluir" onClick={onRemover} perigo />
          {!secao && (
            <>
              <span className="mx-1.5 h-6 w-px bg-gray-200" />
              <label className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                Obrigatória
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.obrigatoria}
                  onClick={() => onAlterar({ obrigatoria: !p.obrigatoria })}
                  className="relative h-5 w-9 rounded-full transition-colors"
                  style={{ backgroundColor: p.obrigatoria ? cor : '#d1d5db' }}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${p.obrigatoria ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BotaoAcao({ icone: Icone, titulo, onClick, disabled, perigo, ativo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      aria-label={titulo}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-30 ${
        perigo ? 'text-gray-500 hover:bg-red-50 hover:text-red-600' : ativo ? 'bg-gray-100 text-gray-800' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
      }`}
    >
      <Icone size={18} />
    </button>
  );
}

// Escolha do tipo, com ícone (lista própria — o SearchableSelect não mostra ícones). O menu abre num portal,
// por cima de tudo (o cartão da pergunta corta o que passa da borda dele): para baixo quando cabe, senão para
// cima, e acompanha o botão se a página rolar.
const ALTURA_MENU = 440;

function SeletorTipo({ valor, onChange, cor }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!aberto) return undefined;
    function posicionar() {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const abaixo = window.innerHeight - r.bottom - 12;
      const acima = r.top - 12;
      const paraCima = abaixo < ALTURA_MENU && acima > abaixo;
      const largura = Math.max(r.width, 240);
      setPos({
        left: Math.min(r.right - largura, window.innerWidth - largura - 8),
        largura,
        ...(paraCima ? { bottom: window.innerHeight - r.top + 6, maxHeight: acima } : { top: r.bottom + 6, maxHeight: abaixo }),
      });
    }
    posicionar();
    const fechar = (e) => !ref.current?.contains(e.target) && !menuRef.current?.contains(e.target) && setAberto(false);
    const esc = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fechar);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', posicionar);
    window.addEventListener('scroll', posicionar, true);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', posicionar);
      window.removeEventListener('scroll', posicionar, true);
    };
  }, [aberto]);

  const atual = TIPO[valor] || TIPOS_PERGUNTA[0];
  const Icone = atual.icone;
  const grupos = [...new Set(TIPOS_PERGUNTA.map((t) => t.grupo))];
  return (
    <div ref={ref} className="relative sm:w-60">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`flex h-12 w-full items-center gap-2.5 rounded-lg border bg-white px-3 text-sm text-gray-800 transition hover:bg-gray-50 ${aberto ? 'border-[var(--tema)] ring-2 ring-primary-100' : 'border-gray-200'}`}
      >
        <Icone size={18} style={{ color: cor }} />
        <span className="flex-1 truncate text-left">{atual.rotulo}</span>
        <ChevronDown size={16} className={`text-gray-400 transition ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="form-cartao-novo fixed z-[100] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1.5 shadow-xl"
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.largura, maxHeight: Math.min(pos.maxHeight, ALTURA_MENU) }}
          >
            {grupos.map((g, gi) => (
              <div key={g} className={gi > 0 ? 'mt-1 border-t border-gray-100 pt-1' : ''}>
                {TIPOS_PERGUNTA.filter((t) => t.grupo === g).map((t) => {
                  const I = t.icone;
                  const sel = t.id === valor;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="option"
                      aria-selected={sel}
                      onClick={() => {
                        if (!sel) onChange(t.id);
                        setAberto(false);
                      }}
                      className={`flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm transition ${sel ? 'bg-gray-50 font-medium text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      <I size={17} style={{ color: sel ? cor : '#6b7280' }} />
                      <span className="flex-1">{t.rotulo}</span>
                      {sel && <Check size={15} style={{ color: cor }} />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

// Opções de múltipla escolha / caixas / lista. Enter cria a próxima; colar várias linhas cria uma opção por
// linha (dá para colar uma coluna do Excel); arrastar pela alça muda a ordem.
function EditorOpcoes({ p, onAlterar }) {
  const opcoes = p.opcoes || [];
  const refs = useRef({});
  const [focar, setFocar] = useState(null);
  const [arrastando, setArrastando] = useState(null);

  useEffect(() => {
    if (focar && refs.current[focar]) {
      refs.current[focar].focus();
      refs.current[focar].select();
      setFocar(null);
    }
  }, [focar, opcoes]);

  const setOpcoes = (lista) => onAlterar({ opcoes: lista });

  function adicionar(depoisDe, textos) {
    const novas = (textos || [`Opção ${opcoes.length + 1}`]).map((texto) => ({ id: novoId(), texto }));
    const i = depoisDe ? opcoes.findIndex((o) => o.id === depoisDe) + 1 : opcoes.length;
    const lista = [...opcoes];
    lista.splice(i, 0, ...novas);
    setOpcoes(lista);
    setFocar(novas[novas.length - 1].id);
  }

  function colar(e, o) {
    const linhas = e.clipboardData
      .getData('text')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (linhas.length < 2) return;
    e.preventDefault();
    const lista = opcoes.map((x) => (x.id === o.id ? { ...x, texto: linhas[0].slice(0, 300) } : x));
    const novas = linhas.slice(1).map((texto) => ({ id: novoId(), texto: texto.slice(0, 300) }));
    lista.splice(lista.findIndex((x) => x.id === o.id) + 1, 0, ...novas);
    setOpcoes(lista);
  }

  function sobre(e, alvo) {
    if (!arrastando || arrastando === alvo.id) return;
    e.preventDefault();
    const sem = opcoes.filter((o) => o.id !== arrastando);
    const r = e.currentTarget.getBoundingClientRect();
    const destino = sem.findIndex((o) => o.id === alvo.id) + (e.clientY > r.top + r.height / 2 ? 1 : 0);
    const lista = [...sem];
    lista.splice(destino, 0, opcoes.find((o) => o.id === arrastando));
    if (lista.some((o, k) => o.id !== opcoes[k].id)) setOpcoes(lista);
  }

  const duplicados = new Set(opcoes.map((o) => o.texto.trim().toLowerCase()).filter((t, i, arr) => t && arr.indexOf(t) !== i));

  return (
    <div className="space-y-1">
      {opcoes.map((o, i) => (
        <div
          key={o.id}
          draggable={arrastando === o.id}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', o.id);
          }}
          onDragOver={(e) => sobre(e, o)}
          onDragEnd={() => setArrastando(null)}
          onDrop={(e) => e.preventDefault()}
          className={`group/op flex items-center gap-2 rounded-lg py-1 pr-1 ${arrastando === o.id ? 'bg-gray-50 opacity-50' : ''}`}
        >
          <span onMouseDown={() => setArrastando(o.id)} onMouseUp={() => setArrastando(null)} className="cursor-grab text-gray-300 opacity-0 transition group-hover/op:opacity-100" title="Arraste para mudar a ordem">
            <GripVertical size={16} />
          </span>
          <MarcadorOpcao tipo={p.tipo} indice={i} />
          <input
            ref={(el) => (refs.current[o.id] = el)}
            value={o.texto}
            maxLength={300}
            onChange={(e) => setOpcoes(opcoes.map((x) => (x.id === o.id ? { ...x, texto: e.target.value } : x)))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                adicionar(o.id);
              }
              if (e.key === 'Backspace' && !o.texto && opcoes.length > 1) {
                e.preventDefault();
                setOpcoes(opcoes.filter((x) => x.id !== o.id));
                setFocar(i > 0 ? opcoes[i - 1].id : opcoes[1].id);
              }
            }}
            onPaste={(e) => colar(e, o)}
            placeholder={`Opção ${i + 1}`}
            className={`min-w-0 flex-1 border-b bg-transparent px-1 py-1.5 text-sm text-gray-800 hover:border-gray-200 focus:border-[var(--tema)] focus:outline-none ${
              duplicados.has(o.texto.trim().toLowerCase()) ? 'border-amber-300' : 'border-transparent'
            }`}
          />
          {duplicados.has(o.texto.trim().toLowerCase()) && <span className="shrink-0 text-[11px] text-amber-600">repetida</span>}
          {opcoes.length > 1 && (
            <button type="button" onClick={() => setOpcoes(opcoes.filter((x) => x.id !== o.id))} title="Remover opção" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <X size={16} />
            </button>
          )}
        </div>
      ))}
      {p.outro && (
        <div className="flex items-center gap-2 py-1 pr-1">
          <span className="w-4" />
          <MarcadorOpcao tipo={p.tipo} />
          <span className="flex-1 border-b border-dotted border-gray-300 px-1 py-1.5 text-sm text-gray-400">Outro…</span>
          <button type="button" onClick={() => onAlterar({ outro: false })} title="Remover “Outro”" className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 py-1 pl-6 text-sm">
        <MarcadorOpcao tipo={p.tipo} indice={opcoes.length} />
        <button type="button" onClick={() => adicionar()} className="rounded px-1 py-1 text-gray-500 hover:text-gray-800 hover:underline">
          Adicionar opção
        </button>
        {p.tipo !== 'LISTA' && !p.outro && (
          <>
            <span className="text-gray-400">ou</span>
            <button type="button" onClick={() => onAlterar({ outro: true })} className="rounded px-1 py-1 font-medium text-[var(--tema)] hover:underline">
              adicionar “Outro”
            </button>
          </>
        )}
      </div>
      <p className="pl-6 pt-1 text-[11px] text-gray-400">Dica: Enter cria a próxima opção; colar uma lista (uma por linha) cria todas de uma vez.</p>
    </div>
  );
}

function EditorEscala({ p, onAlterar }) {
  const e = p.escala || { min: 1, max: 5, rotulo_min: '', rotulo_max: '' };
  const set = (patch) => onAlterar({ escala: { ...e, ...patch } });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
        <span>De</span>
        <div className="w-20">
          <SearchableSelect compacto clearable={false} value={String(e.min)} onChange={(v) => set({ min: Number(v) })} options={[0, 1].map((n) => ({ value: String(n), label: String(n) }))} />
        </div>
        <span>até</span>
        <div className="w-20">
          <SearchableSelect
            compacto
            clearable={false}
            value={String(e.max)}
            onChange={(v) => set({ max: Number(v) })}
            options={[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </div>
        {e.min === 0 && e.max === 10 && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">Formato NPS — os resultados mostram o NPS</span>}
      </div>
      {[
        ['rotulo_min', e.min],
        ['rotulo_max', e.max],
      ].map(([campo, n]) => (
        <div key={campo} className="flex items-center gap-3">
          <span className="w-6 text-right text-sm tabular-nums text-gray-500">{n}</span>
          <input
            value={e[campo] || ''}
            maxLength={60}
            onChange={(ev) => set({ [campo]: ev.target.value })}
            placeholder="Rótulo (opcional)"
            className="w-full max-w-xs border-b border-gray-200 px-1 py-1.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-[var(--tema)] focus:outline-none"
          />
        </div>
      ))}
    </div>
  );
}

function EditorEstrelas({ p, onAlterar }) {
  const max = p.escala?.max || 5;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3 text-sm text-gray-700">
        <span>Estrelas</span>
        <div className="w-20">
          <SearchableSelect
            compacto
            clearable={false}
            value={String(max)}
            onChange={(v) => onAlterar({ escala: { min: 1, max: Number(v), rotulo_min: '', rotulo_max: '' } })}
            options={[3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: String(n) }))}
          />
        </div>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => (
          <Star key={i} size={24} className="fill-amber-100 text-amber-400" strokeWidth={1.6} />
        ))}
      </div>
    </div>
  );
}

// Logomarca opcional no centro do cabeçalho (entre a da empresa e a do Horizon). Grava na hora, sem
// depender do salvamento automático — igual à logomarca da empresa em Cadastros › Empresas.
function LogoCentralEditavel({ form, atualizadoNoServidor }) {
  const input = useRef(null);
  const [enviando, setEnviando] = useState(false);
  const logo = form.logo_central;

  async function escolher(e) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(arquivo.type)) {
      mostrarAviso('Envie uma imagem PNG, JPG, WEBP ou SVG.');
      return;
    }
    setEnviando(true);
    try {
      const imagem = await redimensionarLogoBanco(arquivo, { ladoMaximo: 480 });
      const r = await salvarLogoCentralFormulario(form.empresa_id, form.id, imagem);
      atualizadoNoServidor({ logo_central: r.logo_central });
      mostrarAviso(logo ? 'Logomarca trocada.' : 'Logomarca adicionada.');
    } catch (err) {
      mostrarAviso(err.response?.data?.message || err.message || 'Não foi possível enviar a logomarca.');
    } finally {
      setEnviando(false);
    }
  }

  async function remover(e) {
    e.stopPropagation();
    setEnviando(true);
    try {
      await removerLogoCentralFormulario(form.empresa_id, form.id);
      atualizadoNoServidor({ logo_central: null });
      mostrarAviso('Logomarca removida.');
    } catch (err) {
      mostrarAviso(err.response?.data?.message || 'Não foi possível remover a logomarca.');
    } finally {
      setEnviando(false);
    }
  }

  const abrir = (e) => {
    e.stopPropagation();
    if (!enviando) input.current?.click();
  };

  return (
    <>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={escolher} />
      {logo ? (
        <div className="group relative flex h-12 items-center">
          <img src={logo} alt="Logomarca central" className={`h-12 w-auto max-w-40 object-contain transition sm:max-w-56 ${enviando ? 'opacity-40' : 'group-hover:opacity-30'}`} />
          {enviando ? (
            <Loader2 size={18} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-gray-500" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 transition group-hover:opacity-100">
              <button type="button" onClick={abrir} title="Trocar logomarca" className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:text-primary-600">
                <RefreshCw size={15} />
              </button>
              <button type="button" onClick={remover} title="Remover logomarca" className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 hover:text-rose-600">
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={abrir}
          disabled={enviando}
          title="Logomarca opcional no centro do cabeçalho (PNG, JPG, WEBP ou SVG)"
          className="flex h-12 items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3.5 text-xs font-medium text-gray-400 transition hover:border-gray-400 hover:bg-gray-50 hover:text-gray-600 disabled:opacity-60"
        >
          {enviando ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
          <span className="hidden sm:inline">Logomarca (opcional)</span>
        </button>
      )}
    </>
  );
}
