import { useEffect, useState } from 'react';

// Devolve `valor` só depois de `atraso` ms sem mudar — pra campo de busca não disparar uma consulta a
// cada tecla (ex.: busca de cliente da Gestão de Cobranças). Vazio aplica na hora (limpar a busca não
// precisa esperar).
export default function useValorAtrasado(valor, atraso = 400) {
  const [aplicado, setAplicado] = useState(valor);
  useEffect(() => {
    if (valor === '' || valor == null) {
      setAplicado(valor);
      return undefined;
    }
    const t = setTimeout(() => setAplicado(valor), atraso);
    return () => clearTimeout(t);
  }, [valor, atraso]);
  return aplicado;
}
