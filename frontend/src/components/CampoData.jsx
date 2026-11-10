import { useEffect, useRef, useState } from 'react';

// Campo de data (<input type="date">) que aceita digitação. Enquanto se digita o ano, o navegador solta
// datas parciais (0002, 0020, 0202...) a cada tecla; repassar isso direto pro estado da tela (ou pra URL)
// faz o campo ser regravado no meio da digitação e o ano vira "0026". Aqui o texto fica local e o
// `onChange(valor 'AAAA-MM-DD')` só é chamado com a data completa (ano a partir de 1900). Ao sair do campo
// com a data incompleta, volta pro último valor válido.
const completa = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 1900;

export default function CampoData({ value, onChange, onFocus, onBlur, ...props }) {
  const [texto, setTexto] = useState(value || '');
  const focado = useRef(false);

  useEffect(() => {
    if (!focado.current) setTexto(value || '');
  }, [value]);

  return (
    <input
      type="date"
      {...props}
      value={texto}
      onFocus={(e) => {
        focado.current = true;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focado.current = false;
        if (!completa(texto)) setTexto(value || '');
        onBlur?.(e);
      }}
      onChange={(e) => {
        const v = e.target.value;
        setTexto(v);
        if (completa(v) && v !== value) onChange(v);
      }}
    />
  );
}
