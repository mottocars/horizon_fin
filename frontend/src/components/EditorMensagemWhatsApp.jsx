import { Fragment, useLayoutEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Quote, Strikethrough } from 'lucide-react';

// Caixa de texto pra mensagem que vai no WhatsApp: a barra aplica a marcação do próprio WhatsApp
// (*negrito*, _itálico_, ~tachado~, "- " lista, "1. " lista numerada, "> " citação) no trecho
// selecionado — o texto é enviado como está, quem formata é o WhatsApp — e a prévia abaixo mostra
// como vai chegar. Ctrl+B / Ctrl+I também funcionam.
const INLINE = [
  { marca: '*', rotulo: 'Negrito (Ctrl+B)', Icone: Bold },
  { marca: '_', rotulo: 'Itálico (Ctrl+I)', Icone: Italic },
  { marca: '~', rotulo: 'Tachado', Icone: Strikethrough },
];
const LINHA = [
  { tipo: 'lista', rotulo: 'Lista com marcadores', Icone: List },
  { tipo: 'numerada', rotulo: 'Lista numerada', Icone: ListOrdered },
  { tipo: 'citacao', rotulo: 'Citação', Icone: Quote },
];

export default function EditorMensagemWhatsApp({ id, value, onChange, maxLength = 1000, rows = 5, placeholder }) {
  const ref = useRef(null);
  // Seleção a restaurar depois que o texto formatado for renderizado (layout effect: aplica antes
  // de qualquer clique/tecla seguinte, sem sobrescrever uma seleção nova do usuário).
  const selecaoPendente = useRef(null);

  useLayoutEffect(() => {
    if (!selecaoPendente.current || !ref.current) return;
    const [ini, fim] = selecaoPendente.current;
    selecaoPendente.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(ini, fim);
  }, [value]);

  // Troca o trecho [inicio, fim) por `novo` e devolve a seleção pra caixa depois do render.
  function substituir(inicio, fim, novo, selInicio, selFim) {
    const texto = value.slice(0, inicio) + novo + value.slice(fim);
    if (texto.length > maxLength) return;
    selecaoPendente.current = [selInicio, selFim];
    onChange(texto);
  }

  function aplicarInline(marca) {
    const { selectionStart: ini, selectionEnd: fim } = ref.current;
    const trecho = value.slice(ini, fim);
    // Espaços nas pontas ficam fora da marcação — "*texto *" não vira negrito no WhatsApp.
    const antes = trecho.match(/^\s*/)[0];
    const depois = trecho.slice(antes.length).match(/\s*$/)[0];
    const miolo = trecho.slice(antes.length, trecho.length - depois.length);
    const novo = `${antes}${marca}${miolo}${marca}${depois}`;
    const cursor = ini + antes.length + 1;
    substituir(ini, fim, novo, cursor, cursor + miolo.length);
  }

  function aplicarLinha(tipo) {
    const { selectionStart: ini, selectionEnd: fim } = ref.current;
    const inicioLinha = value.lastIndexOf('\n', ini - 1) + 1;
    const fimLinha = value.indexOf('\n', fim) === -1 ? value.length : value.indexOf('\n', fim);
    const linhas = value.slice(inicioLinha, fimLinha).split('\n');
    const novo = linhas
      .map((l, i) => (tipo === 'lista' ? `- ${l}` : tipo === 'numerada' ? `${i + 1}. ${l}` : `> ${l}`))
      .join('\n');
    substituir(inicioLinha, fimLinha, novo, inicioLinha + novo.length, inicioLinha + novo.length);
  }

  function handleKeyDown(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const tecla = e.key.toLowerCase();
    if (tecla === 'b' || tecla === 'i') {
      e.preventDefault();
      aplicarInline(tecla === 'b' ? '*' : '_');
    }
  }

  // Clicar no botão não tira o foco (nem a seleção) da caixa de texto.
  const manterFoco = (e) => e.preventDefault();

  const botao =
    'flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800';

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-primary-100">
        <div className="flex items-center gap-0.5 border-b border-gray-100 bg-gray-50 px-1.5 py-1">
          {INLINE.map(({ marca, rotulo, Icone }) => (
            <button key={marca} type="button" title={rotulo} aria-label={rotulo} onMouseDown={manterFoco} onClick={() => aplicarInline(marca)} className={botao}>
              <Icone size={15} />
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-gray-200" />
          {LINHA.map(({ tipo, rotulo, Icone }) => (
            <button key={tipo} type="button" title={rotulo} aria-label={rotulo} onMouseDown={manterFoco} onClick={() => aplicarLinha(tipo)} className={botao}>
              <Icone size={15} />
            </button>
          ))}
          <span className="ml-auto pr-1 text-[11px] tabular-nums text-gray-400">
            {value.length}/{maxLength}
          </span>
        </div>
        <textarea
          id={id}
          ref={ref}
          rows={rows}
          maxLength={maxLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="block w-full resize-y px-3 py-2 text-sm focus:outline-none"
        />
      </div>

      {value.trim() && (
        <div className="rounded-lg bg-[#efeae2] p-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">Prévia no WhatsApp</p>
          <div className="max-w-full rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm text-gray-800 shadow-sm">
            <PreviaWhatsApp texto={value} />
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ prévia (sem innerHTML)

const MARCAS = { '*': 'strong', _: 'em', '~': 's' };
// A marca precisa encostar no texto (sem espaço logo depois da abertura nem antes do fechamento),
// como no WhatsApp.
const REGEX_INLINE = /([*_~])(?!\s)([^\n]*?[^\s])\1/;

function formatarInline(texto, chave = 'i') {
  const m = REGEX_INLINE.exec(texto);
  if (!m) return texto;
  const Tag = MARCAS[m[1]];
  return [
    texto.slice(0, m.index),
    <Tag key={chave}>{formatarInline(m[2], `${chave}-d`)}</Tag>,
    <Fragment key={`${chave}-r`}>{formatarInline(texto.slice(m.index + m[0].length), `${chave}-r`)}</Fragment>,
  ];
}

function PreviaWhatsApp({ texto }) {
  return texto.split('\n').map((linha, i) => {
    const lista = linha.match(/^[-*] (.*)$/);
    const numerada = linha.match(/^(\d+)\. (.*)$/);
    const citacao = linha.match(/^> ?(.*)$/);
    if (lista) {
      return (
        <div key={i} className="flex gap-2 pl-1">
          <span>•</span>
          <span className="min-w-0 break-words">{formatarInline(lista[1])}</span>
        </div>
      );
    }
    if (numerada) {
      return (
        <div key={i} className="flex gap-1.5 pl-1">
          <span className="tabular-nums">{numerada[1]}.</span>
          <span className="min-w-0 break-words">{formatarInline(numerada[2])}</span>
        </div>
      );
    }
    if (citacao) {
      return (
        <div key={i} className="border-l-4 border-gray-300 pl-2 text-gray-600">
          {formatarInline(citacao[1])}
        </div>
      );
    }
    return (
      <div key={i} className="min-h-5 whitespace-pre-wrap break-words">
        {formatarInline(linha)}
      </div>
    );
  });
}
