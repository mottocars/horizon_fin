import { useEffect, useState } from 'react';
import { dataPeriodoValida } from './cronogramaObras';

// Campo De/Até do período (aba Cronogramas e dashboard Cronogramas de Obras — pedido do usuário:
// digita dia, mês e ano, mas só o mês e o ano valem). O texto fica num estado próprio: enquanto o
// ano é digitado o navegador passa por datas como 0002-07-01 e 0020-07-01 — essas não chegam na tela
// (nem invertem De/Até) e o campo não volta pro valor anterior no meio da digitação. Ao sair do
// campo com a data incompleta, volta a data em vigor.
export default function CampoDataPeriodo({ value, onChange, ...props }) {
  const [texto, setTexto] = useState(value);
  useEffect(() => setTexto(value), [value]);
  return (
    <input
      type="date"
      {...props}
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        if (dataPeriodoValida(e.target.value)) onChange(e.target.value);
      }}
      onBlur={() => setTexto(value)}
    />
  );
}
