import { useEffect, useState } from 'react';
import { dataValida } from './cronogramaDatas';

// Campos da aba Histórico de Etapas do cadastro do centro de custo (CentroCustoEditor.jsx) — data de
// início e duração de cada etapa. `classe`: o visual (o cadastro passa as cores âmbar/azul).

// Data de início da etapa. Só confirma ao sair do campo (ou Enter): o campo de data do navegador
// muda a cada dígito (o ano passa por 0002, 0020...) e com a digitação pela metade fica vazio —
// `badInput` diferencia isso de apagar a data de propósito.
export function CampoData({ valor, onSalvar, title, disabled, classe }) {
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

// Quantidade (até a próxima etapa; na última, até o término), na unidade do "Tipo duração" da
// etapa. Mostra a conta feita a partir das datas; digitar um número calcula a data seguinte. Também
// só confirma ao sair (ou Enter). `decimais`: aceita número quebrado (anos: 2,5).
export function CampoQtd({ valor, maximo, disabled, onSalvar, title, classe, decimais = false }) {
  const [texto, setTexto] = useState(valor ?? '');
  useEffect(() => setTexto(valor ?? ''), [valor]);

  function confirmar() {
    const n = Number(String(texto).replace(',', '.'));
    if (String(texto).trim() === '' || !Number.isFinite(n) || (!decimais && !Number.isInteger(n)) || n < 0 || n > maximo || n === valor) {
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
      step={decimais ? 'any' : 1}
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
