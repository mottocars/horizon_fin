import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { VARS } from './constantes';

const normalizar = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// Propriedades de fonte/espaçamento que precisam ser idênticas entre o
// textarea real e o espelho invisível, senão a posição calculada do cursor
// (offsetTop/offsetLeft do espelho) não bate com a posição de verdade.
const PROPRIEDADES_ESPELHADAS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'padding',
  'borderWidth',
  'borderStyle',
  'width',
  'boxSizing',
];

// Corpo da mensagem com autocomplete de variável ao digitar "@" — porta pra
// React a mesma técnica do protótipo (comunicacao-templates.html): um
// `<div>` espelho, invisível, com o texto digitado até o cursor; a posição
// dele na tela (offsetTop/offsetLeft) é onde o combobox de variáveis abre.
// `ref` expõe `inserirVariavel(chave)`, usado tanto pelo Enter/Tab do
// próprio combobox quanto pelo clique numa variável no painel lateral
// (ver VariablesPanel.jsx/TemplateEditor.jsx).
//
// Buffer local (igual ao CampoBuffer de EtapasTabela.jsx/TemplateEditor.jsx):
// `onChange` (que salva na API) só é chamado no blur, nunca a cada tecla —
// sem isso, cada letra digitada disparava um PUT, e como as respostas não
// chegam necessariamente na mesma ordem que foram enviadas, uma resposta
// atrasada podia sobrescrever o texto já mais recente na tela, embaralhando
// o que a pessoa tinha acabado de digitar.
const MentionTextarea = forwardRef(function MentionTextarea({ value, onChange, placeholder, className, wrapperClassName }, ref) {
  const taRef = useRef(null);
  const mirrorRef = useRef(null);
  const [local, setLocal] = useState(value || '');
  const [mention, setMention] = useState(null); // { lista, indice, inicio, top, left } | null

  useEffect(() => setLocal(value || ''), [value]);

  function commit(valorFinal) {
    if (valorFinal !== value) onChange(valorFinal);
  }

  function coordsCursor(pos) {
    const ta = taRef.current;
    const mirror = mirrorRef.current;
    const cs = getComputedStyle(ta);
    PROPRIEDADES_ESPELHADAS.forEach((p) => {
      mirror.style[p] = cs[p];
    });
    mirror.textContent = ta.value.slice(0, pos);
    const marca = document.createElement('span');
    marca.textContent = '​';
    mirror.appendChild(marca);
    const top = marca.offsetTop - ta.scrollTop + parseFloat(cs.lineHeight || '20');
    const left = marca.offsetLeft;
    mirror.textContent = '';
    return { top, left: Math.min(left, ta.offsetWidth - 240) };
  }

  function avaliarMention() {
    const ta = taRef.current;
    const pos = ta.selectionStart;
    const antes = ta.value.slice(0, pos);
    const m = antes.match(/@([a-zA-Z_]*)$/);
    if (!m) {
      setMention(null);
      return;
    }
    const q = normalizar(m[1]);
    const lista = VARS.filter((v) => normalizar(v.rotulo).includes(q) || v.chave.includes(q));
    const { top, left } = coordsCursor(pos);
    setMention({ lista, indice: 0, inicio: pos - m[0].length, top, left });
  }

  function inserirVariavel(chave) {
    const ta = taRef.current;
    const pos = ta.selectionStart;
    const inicio = mention ? mention.inicio : pos;
    const novoValor = `${ta.value.slice(0, inicio)}@${chave} ${ta.value.slice(pos)}`;
    setLocal(novoValor);
    const novaPos = inicio + chave.length + 2;
    setMention(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(novaPos, novaPos);
    });
  }

  useImperativeHandle(ref, () => ({ inserirVariavel, focar: () => taRef.current?.focus() }));

  function handleKeyDown(e) {
    if (!mention || mention.lista.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setMention((m) => ({ ...m, indice: (m.indice + 1) % m.lista.length }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMention((m) => ({ ...m, indice: (m.indice - 1 + m.lista.length) % m.lista.length }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      inserirVariavel(mention.lista[mention.indice].chave);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setMention(null);
    }
  }

  return (
    <div className={`relative ${wrapperClassName || ''}`}>
      <textarea
        ref={taRef}
        value={local}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => {
          setLocal(e.target.value);
          avaliarMention();
        }}
        onClick={avaliarMention}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          commit(e.target.value);
          setTimeout(() => setMention(null), 140);
        }}
        className={className}
      />
      {/* Espelho invisível — nunca aparece, só serve pra medir onde o
          cursor está renderizado de verdade dentro do textarea. */}
      <div
        ref={mirrorRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 overflow-hidden whitespace-pre-wrap break-words"
      />
      {mention && (
        <div
          role="listbox"
          aria-label="Variáveis disponíveis"
          className="absolute z-40 max-h-[210px] min-w-[230px] overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
          style={{ top: mention.top, left: Math.max(0, mention.left) }}
        >
          {mention.lista.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-gray-500">Nenhuma variável com esse nome.</p>
          ) : (
            mention.lista.map((v, i) => (
              <button
                key={v.chave}
                type="button"
                role="option"
                aria-selected={i === mention.indice}
                onMouseDown={(e) => {
                  e.preventDefault();
                  inserirVariavel(v.chave);
                }}
                className={`block w-full rounded px-2.5 py-1.5 text-left ${i === mention.indice ? 'bg-primary-50' : 'hover:bg-gray-50'}`}
              >
                <b className="block text-sm font-medium text-gray-900">{v.rotulo}</b>
                <small className={`block font-mono text-[11px] ${i === mention.indice ? 'text-primary-600' : 'text-gray-400'}`}>
                  @{v.chave}
                </small>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
});

export default MentionTextarea;
