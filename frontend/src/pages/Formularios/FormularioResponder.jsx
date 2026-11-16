import { useMemo, useRef, useState } from 'react';
import { Building2, Check, CheckCircle2, RotateCcw, Star } from 'lucide-react';
import SearchableSelect from '../../components/SearchableSelect';
import CampoData from '../../components/CampoData';
import { corAlpha } from './tipos';
import './formularios.css';

// O formulário do jeito que quem responde vê — o mesmo componente na página pública (/f/:token), na janela
// que abre ao entrar no sistema (privados) e na prévia do construtor.
//
// formulario: { titulo, descricao, perguntas, cor_tema, mensagem_final, empresa_nome, empresa_logo }
//   — a logomarca da empresa (Cadastros › Empresas) vai no topo do cabeçalho, como um papel timbrado.
// onEnviar(respostas) → Promise; se rejeitar com `response.data.campos` ({ idPergunta: mensagem }), os erros
//   aparecem em cada pergunta.
// valores: respostas já gravadas — mostra o formulário preenchido e travado (aba Respostas › Individual).
// rodape: algo extra ao lado do botão Enviar (ex.: "Responder depois").
// compacto: sem o espaço de cima (dentro de janela).

const vazio = (v) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && v.trim() === '') ||
  (typeof v === 'object' && !Array.isArray(v) && ('opcoes' in v ? !(v.opcoes || []).length && !String(v.outro || '').trim() : !v.opcao && !String(v.outro || '').trim()));

export default function FormularioResponder({ formulario, onEnviar, valores, rodape, rotuloEnviar = 'Enviar', textoEnviado, compacto = false, aposEnviar }) {
  const somenteLeitura = valores !== undefined;
  const cor = formulario.cor_tema || '#2563eb';
  const perguntas = useMemo(() => formulario.perguntas || [], [formulario.perguntas]);
  const [respostas, setRespostas] = useState(() => valores || {});
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const refs = useRef({});

  const respondiveis = perguntas.filter((p) => p.tipo !== 'SECAO');
  const respondidas = respondiveis.filter((p) => !vazio(respostas[p.id])).length;
  const temObrigatoria = respondiveis.some((p) => p.obrigatoria);
  const progresso = respondiveis.length ? respondidas / respondiveis.length : 0;
  const respostasAtuais = somenteLeitura ? valores : respostas;

  function definir(id, valor) {
    setRespostas((r) => ({ ...r, [id]: valor }));
    if (erros[id]) setErros(({ [id]: _, ...resto }) => resto);
  }

  function rolarPara(id) {
    refs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function enviar(e) {
    e.preventDefault();
    if (somenteLeitura) return;
    const faltando = {};
    respondiveis.forEach((p) => {
      if (p.obrigatoria && vazio(respostas[p.id])) faltando[p.id] = 'Esta pergunta é obrigatória.';
    });
    if (Object.keys(faltando).length) {
      setErros(faltando);
      setErroGeral('Responda as perguntas obrigatórias destacadas.');
      rolarPara(Object.keys(faltando)[0]);
      return;
    }
    setEnviando(true);
    setErroGeral('');
    try {
      await onEnviar(respostas);
      setEnviado(true);
    } catch (err) {
      const campos = err?.response?.data?.campos;
      if (campos) {
        setErros(campos);
        rolarPara(Object.keys(campos)[0]);
      }
      setErroGeral(err?.response?.data?.message || 'Não foi possível enviar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <div className={`mx-auto w-full max-w-2xl ${compacto ? '' : 'py-2'}`}>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="h-2.5" style={{ backgroundColor: cor }} />
          <div className="flex flex-col items-center px-8 py-12 text-center">
            {formulario.empresa_logo && <img src={formulario.empresa_logo} alt={formulario.empresa_nome || ''} className="mb-6 h-12 w-auto max-w-48 object-contain" />}
            <span className="form-sucesso mb-5 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: corAlpha(cor, 0.12), color: cor }}>
              <CheckCircle2 size={34} strokeWidth={2} />
            </span>
            <h2 className="text-xl font-semibold text-gray-900">{formulario.titulo}</h2>
            <p className="mt-2 max-w-md whitespace-pre-line text-sm leading-relaxed text-gray-600">
              {textoEnviado || formulario.mensagem_final?.trim() || 'Sua resposta foi registrada. Obrigado por participar!'}
            </p>
            {aposEnviar && <div className="mt-7">{aposEnviar}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="mx-auto w-full max-w-2xl space-y-3" style={{ '--tema': cor, '--tema-suave': corAlpha(cor, 0.08) }}>
      {/* Cabeçalho */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="h-2.5" style={{ backgroundColor: cor }} />
        <div className="px-6 pb-5 pt-5 sm:px-7">
          <TimbreEmpresa nome={formulario.empresa_nome} logo={formulario.empresa_logo} />
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-gray-900">{formulario.titulo || 'Formulário sem título'}</h1>
          {formulario.descricao?.trim() && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">{formulario.descricao}</p>}
          {!somenteLeitura && respondiveis.length > 0 && (
            <div className="mt-5 flex items-center gap-3 border-t border-gray-100 pt-4">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progresso * 100}%`, backgroundColor: cor }} />
              </div>
              <span className="shrink-0 text-xs tabular-nums text-gray-500">
                {respondidas} de {respondiveis.length} respondida{respondiveis.length === 1 ? '' : 's'}
              </span>
            </div>
          )}
          {!somenteLeitura && temObrigatoria && (
            <p className="mt-3 text-xs text-rose-600">* Indica uma pergunta obrigatória</p>
          )}
        </div>
      </div>

      {perguntas.map((p) => {
        if (p.tipo === 'SECAO') {
          return (
            <div key={p.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="px-6 py-3 text-sm font-semibold text-white sm:px-7" style={{ backgroundColor: cor }}>
                {p.titulo || 'Seção sem título'}
              </div>
              {p.descricao?.trim() && <p className="whitespace-pre-line px-6 py-4 text-sm leading-relaxed text-gray-600 sm:px-7">{p.descricao}</p>}
            </div>
          );
        }
        const erro = erros[p.id];
        return (
          <div
            key={p.id}
            ref={(el) => (refs.current[p.id] = el)}
            className={`rounded-2xl border bg-white px-6 py-5 shadow-sm transition-colors sm:px-7 ${erro ? 'border-rose-300 ring-1 ring-rose-200' : 'border-gray-200'}`}
          >
            <p className="text-[15px] font-medium leading-snug text-gray-900">
              {p.titulo || 'Pergunta sem título'}
              {p.obrigatoria && <span className="ml-1 text-rose-600">*</span>}
            </p>
            {p.descricao?.trim() && <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-gray-500">{p.descricao}</p>}
            <div className="mt-4">
              <CampoResposta pergunta={p} valor={respostasAtuais[p.id]} onChange={(v) => definir(p.id, v)} cor={cor} travado={somenteLeitura} />
            </div>
            {erro && <p className="mt-3 text-xs font-medium text-rose-600">{erro}</p>}
          </div>
        );
      })}

      {!somenteLeitura && (
        <>
          {erroGeral && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{erroGeral}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={enviando}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-7 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
                style={{ backgroundColor: cor }}
              >
                {enviando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {rotuloEnviar}
              </button>
              {rodape}
            </div>
            {respondidas > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRespostas({});
                  setErros({});
                  setErroGeral('');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <RotateCcw size={13} />
                Limpar formulário
              </button>
            )}
          </div>
        </>
      )}
    </form>
  );
}

// Logomarca + nome da empresa no alto do cabeçalho. Sem logomarca cadastrada, fica só o nome.
export function TimbreEmpresa({ nome, logo }) {
  if (!nome && !logo) return null;
  return (
    <div className="mb-5 flex items-center gap-3 border-b border-gray-100 pb-4">
      {logo ? (
        <img src={logo} alt={nome || 'Logomarca'} className="h-12 w-auto max-w-48 shrink-0 object-contain" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
          <Building2 size={20} />
        </span>
      )}
      {nome && <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-gray-700">{nome}</span>}
    </div>
  );
}

const INPUT =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 transition placeholder:text-gray-400 focus:border-[var(--tema)] focus:outline-none focus:ring-4 focus:ring-[var(--tema-suave)] disabled:bg-gray-50 disabled:text-gray-700';

export function CampoResposta({ pergunta: p, valor, onChange, cor, travado }) {
  switch (p.tipo) {
    case 'TEXTO_CURTO':
      return (
        <input
          value={valor || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={travado}
          maxLength={500}
          placeholder="Sua resposta"
          className={`${INPUT} sm:max-w-md`}
        />
      );
    case 'TEXTO_LONGO':
      return (
        <textarea
          value={valor || ''}
          onChange={(e) => {
            onChange(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight + 2}px`;
          }}
          disabled={travado}
          maxLength={5000}
          rows={3}
          placeholder="Sua resposta"
          className={`${INPUT} resize-none`}
        />
      );
    case 'NUMERO':
      return (
        <input
          value={valor ?? ''}
          onChange={(e) => onChange(e.target.value.replace(/[^\d,.-]/g, ''))}
          disabled={travado}
          inputMode="decimal"
          placeholder="0"
          className={`${INPUT} tabular-nums sm:max-w-56`}
        />
      );
    case 'DATA':
      return <CampoData value={valor || ''} onChange={onChange} disabled={travado} className={`${INPUT} sm:max-w-56`} />;
    case 'LISTA':
      return (
        <div className="sm:max-w-md">
          <SearchableSelect
            value={valor?.opcao || ''}
            onChange={(v) => onChange(v ? { opcao: v } : null)}
            options={(p.opcoes || []).map((o) => ({ value: o.id, label: o.texto || '(sem texto)' }))}
            placeholder="Escolher"
            disabled={travado}
          />
        </div>
      );
    case 'MULTIPLA_ESCOLHA':
    case 'CAIXAS_SELECAO':
      return <Escolhas p={p} valor={valor} onChange={onChange} cor={cor} travado={travado} />;
    case 'ESCALA_LINEAR':
      return <Escala p={p} valor={valor} onChange={onChange} cor={cor} travado={travado} />;
    case 'AVALIACAO':
      return <Estrelas p={p} valor={valor} onChange={onChange} travado={travado} />;
    default:
      return null;
  }
}

function Marcador({ multipla, ativo, cor }) {
  return (
    <span
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center border-2 transition ${multipla ? 'rounded-[5px]' : 'rounded-full'}`}
      style={{ borderColor: ativo ? cor : '#cbd5e1', backgroundColor: ativo && multipla ? cor : 'transparent' }}
    >
      {ativo && (multipla ? <Check size={12} strokeWidth={3.5} className="text-white" /> : <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cor }} />)}
    </span>
  );
}

function Escolhas({ p, valor, onChange, cor, travado }) {
  const multipla = p.tipo === 'CAIXAS_SELECAO';
  const marcadas = multipla ? valor?.opcoes || [] : valor?.opcao ? [valor.opcao] : [];
  const outroTexto = valor?.outro ?? null;
  const outroAtivo = outroTexto !== null && outroTexto !== undefined;

  function alternar(id) {
    if (travado) return;
    if (multipla) {
      const prox = marcadas.includes(id) ? marcadas.filter((m) => m !== id) : [...marcadas, id];
      onChange({ opcoes: prox, outro: outroAtivo ? outroTexto : null });
    } else {
      onChange(marcadas[0] === id ? null : { opcao: id });
    }
  }

  function alternarOutro() {
    if (travado) return;
    if (multipla) onChange({ opcoes: marcadas, outro: outroAtivo ? null : '' });
    else onChange(outroAtivo ? null : { outro: '' });
  }

  const linha = (ativo) =>
    `flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${travado ? 'cursor-default' : 'cursor-pointer hover:border-gray-300'} ${ativo ? 'font-medium text-gray-900' : 'border-gray-200 text-gray-700'}`;
  const estiloAtivo = (ativo) => (ativo ? { borderColor: cor, backgroundColor: corAlpha(cor, 0.06) } : undefined);

  return (
    <div className="grid gap-2" role={multipla ? 'group' : 'radiogroup'}>
      {(p.opcoes || []).map((o) => {
        const ativo = marcadas.includes(o.id);
        return (
          <button key={o.id} type="button" role={multipla ? 'checkbox' : 'radio'} aria-checked={ativo} onClick={() => alternar(o.id)} className={linha(ativo)} style={estiloAtivo(ativo)}>
            <Marcador multipla={multipla} ativo={ativo} cor={cor} />
            <span className="min-w-0 break-words">{o.texto || '(sem texto)'}</span>
          </button>
        );
      })}
      {p.outro && (
        <div className={linha(outroAtivo)} style={estiloAtivo(outroAtivo)} onClick={() => !outroAtivo && alternarOutro()}>
          <button type="button" role={multipla ? 'checkbox' : 'radio'} aria-checked={outroAtivo} onClick={(e) => { e.stopPropagation(); alternarOutro(); }} className="flex items-center gap-3">
            <Marcador multipla={multipla} ativo={outroAtivo} cor={cor} />
            <span>Outro:</span>
          </button>
          <input
            value={outroTexto || ''}
            disabled={travado}
            onFocus={() => !outroAtivo && alternarOutro()}
            onChange={(e) => (multipla ? onChange({ opcoes: marcadas, outro: e.target.value }) : onChange({ outro: e.target.value }))}
            placeholder="Escreva aqui"
            maxLength={500}
            className="min-w-0 flex-1 border-b border-gray-200 bg-transparent py-0.5 text-sm font-normal focus:border-[var(--tema)] focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

function Escala({ p, valor, onChange, cor, travado }) {
  const { min = 1, max = 5, rotulo_min: rotuloMin, rotulo_max: rotuloMax } = p.escala || {};
  const valoresEscala = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {valoresEscala.map((n) => {
          const ativo = valor === n;
          return (
            <button
              key={n}
              type="button"
              disabled={travado && !ativo}
              onClick={() => !travado && onChange(ativo ? null : n)}
              className={`flex h-11 min-w-11 flex-1 items-center justify-center rounded-xl border text-sm font-semibold tabular-nums transition sm:max-w-14 ${
                ativo ? 'text-white shadow-sm' : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50'
              }`}
              style={ativo ? { backgroundColor: cor, borderColor: cor } : undefined}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(rotuloMin || rotuloMax) && (
        <div className="mt-2 flex justify-between gap-4 text-xs text-gray-500">
          <span>{rotuloMin}</span>
          <span className="text-right">{rotuloMax}</span>
        </div>
      )}
    </div>
  );
}

function Estrelas({ p, valor, onChange, travado }) {
  const max = p.escala?.max || 5;
  const [sobre, setSobre] = useState(0);
  const exibido = sobre || valor || 0;
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setSobre(0)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
          onMouseEnter={() => !travado && setSobre(n)}
          onClick={() => !travado && onChange(valor === n ? null : n)}
          className={`rounded-lg p-1 transition ${travado ? 'cursor-default' : 'hover:scale-110'}`}
        >
          <Star size={30} strokeWidth={1.6} className={n <= exibido ? 'fill-amber-400 text-amber-400' : 'text-gray-300'} />
        </button>
      ))}
      {valor ? <span className="ml-2 text-sm tabular-nums text-gray-500">{valor} de {max}</span> : null}
    </div>
  );
}
