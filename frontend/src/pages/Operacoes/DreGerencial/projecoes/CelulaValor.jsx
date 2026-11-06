import { useState } from 'react';
import { interpretarValor, moeda } from './util';

// Célula de valor digitável — mesma mecânica da célula "HORIZON - INFORMADO" do Orçamento da DFC
// (DfcOrcamentosTab.jsx::CelulaInformada): formato brasileiro, Enter grava, Esc desfaz, vazio em âmbar,
// preenchido em azul claro, negativo em vermelho. `onMenu(evento, valorAtual)`: botão direito (menu de
// replicar / distribuir). `placeholder`: o que vale quando vazio (ex.: o ticket médio).
// `sugestao`: o vazio vale o placeholder (ex.: ticket médio) — campo neutro, com o valor legível.
export default function CelulaValor({ valor, onCommit, onMenu, placeholder = '—', className = '', title, sugestao = false }) {
  const [texto, setTexto] = useState(null);
  const editando = texto !== null;
  const vazio = valor === null || valor === undefined;

  function valorAtual() {
    if (texto === null) return vazio ? null : valor;
    const novo = interpretarValor(texto);
    return Number.isNaN(novo) ? (vazio ? null : valor) : novo === 0 ? null : novo;
  }

  function commit() {
    if (texto === null) return;
    const novo = valorAtual();
    setTexto(null);
    if (novo === (vazio ? null : valor)) return;
    onCommit(novo);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={editando ? texto : vazio ? '' : moeda(valor)}
      placeholder={placeholder}
      title={title}
      onFocus={(e) => {
        setTexto(vazio ? '' : String(valor).replace('.', ','));
        const campo = e.currentTarget;
        setTimeout(() => campo.select(), 0);
      }}
      onChange={(e) => {
        if (/^[-\d.,\s]*$/.test(e.target.value)) setTexto(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          setTexto(null);
          e.currentTarget.blur();
        }
      }}
      onContextMenu={
        onMenu
          ? (e) => {
              e.preventDefault();
              const atual = valorAtual();
              commit();
              onMenu(e, atual);
            }
          : undefined
      }
      className={`h-7 w-full rounded-md border px-1.5 text-right text-xs tabular-nums outline-none transition-colors placeholder:text-gray-300 focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-100 ${
        vazio
          ? sugestao
            ? 'border-gray-200 bg-white placeholder:text-gray-500'
            : 'border-amber-200 bg-amber-50'
          : 'border-primary-100 bg-primary-50'
      } ${!editando && !vazio && valor < 0 ? 'text-red-600' : 'text-gray-900'} ${className}`}
    />
  );
}
