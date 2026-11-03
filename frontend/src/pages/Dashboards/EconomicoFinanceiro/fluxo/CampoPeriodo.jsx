import { useEffect, useState } from 'react';

// Campo de mês (tipo 'month', Fluxo de Caixa e Demonstração do Resultado) ou de data (tipo 'date', Aging
// List) da barra dos painéis. Enquanto o ano é digitado o navegador manda 0002, 0020, 0202… — se o campo
// só aceitasse o valor válido, o React o voltaria pra data anterior no meio da digitação e o ano saía
// errado (2025 virava 2024). O texto digitado fica no estado local e só vai pro painel (`onChange`) quando
// está completo, com ano a partir de 1900 e dentro de `min`/`max`; incompleto ou fora do intervalo, volta
// à data do painel ao sair do campo. Mesmo esquema do CampoData do DRE Gerencial.
export default function CampoPeriodo({ id, rotulo, tipo = 'month', valor, min, max, onChange, dica }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const formato = tipo === 'month' ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  const valido = (v) => formato.test(v) && Number(v.slice(0, 4)) >= 1900 && (!min || v >= min) && (!max || v <= max);
  return (
    <div className="ctl">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        type={tipo}
        value={texto}
        min={min}
        max={max}
        title={dica}
        onChange={(e) => {
          const v = e.target.value;
          setTexto(v);
          if (valido(v) && v !== valor) onChange(v);
        }}
        onBlur={() => !valido(texto) && setTexto(valor)}
      />
    </div>
  );
}
