import { useEffect, useState } from 'react';
import { dataValida } from './cronogramaDatas';

// Campos do cronograma das obras — usados na aba Centros de Custos de Cronogramas Obras e na aba
// Histórico de Etapas do cadastro do centro de custo (as duas editam o mesmo dado). `classe`
// troca o visual (a grade de Cronogramas Obras é compacta; o cadastro usa as cores âmbar/azul).

export const CLASSE_CAMPO_COMPACTO =
  'w-full min-w-0 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-300';

// Data de início da etapa. Só confirma ao sair do campo (ou Enter): o campo de data do navegador
// muda a cada dígito (o ano passa por 0002, 0020...) e com a digitação pela metade fica vazio —
// `badInput` diferencia isso de apagar a data de propósito.
export function CampoData({ valor, onSalvar, title, disabled, classe = CLASSE_CAMPO_COMPACTO }) {
  const [texto, setTexto] = useState(valor || '');
  useEffect(() => setTexto(valor || ''), [valor]);

  function confirmar(e) {
    if (e.currentTarget.validity.badInput || (texto && !dataValida(texto))) {
      setTexto(valor || '');
      return;
    }
    if (texto === (valor || '')) return;
    onSalvar(texto || null);
  }

  return (
    <input
      type="date"
      value={texto}
      disabled={disabled}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      title={title}
      aria-label={title}
      className={classe}
    />
  );
}

// Quantidade (meses até a próxima etapa; na última, anos até o término). Mostra a conta feita a
// partir das datas; digitar um número calcula a data seguinte. Também só confirma ao sair (ou Enter).
export function CampoQtd({ valor, maximo, disabled, onSalvar, title, classe = CLASSE_CAMPO_COMPACTO }) {
  const [texto, setTexto] = useState(valor ?? '');
  useEffect(() => setTexto(valor ?? ''), [valor]);

  function confirmar() {
    const n = Number(texto);
    if (String(texto).trim() === '' || !Number.isInteger(n) || n < 0 || n > maximo || n === valor) {
      setTexto(valor ?? '');
      return;
    }
    onSalvar(n);
  }

  return (
    <input
      type="number"
      min={0}
      max={maximo}
      step={1}
      value={texto}
      disabled={disabled}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      title={title}
      aria-label={title}
      className={`${classe} text-center tabular-nums ${valor < 0 ? 'border-red-300 text-red-600' : ''}`}
    />
  );
}
