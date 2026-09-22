import { useState } from 'react';
import { Landmark } from 'lucide-react';

// Mesmo tamanho nos três casos abaixo, pra o nome da conta começar sempre no mesmo ponto.
const CAIXA = 'flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md';

// Logomarca pequena do banco (a URL vem da BrasilAPI — ver bancos-api.client.js). Sem logo
// (banco fora da lista oficial, sem imagem cadastrada, ou imagem que não carregou) mostra o
// código do banco; conta sem banco nenhum (ex.: "CAIXA") ganha um ícone neutro. O nome do
// banco fica no tooltip.
export default function LogoBanco({ codigo, info }) {
  const [falhou, setFalhou] = useState(false);
  const titulo = codigo ? `${codigo}${info?.nome ? ` - ${info.nome}` : ''}` : 'Sem banco definido';

  if (info?.logo && !falhou) {
    return (
      <span title={titulo} className={`${CAIXA} bg-white ring-1 ring-gray-200`}>
        <img
          src={info.logo}
          alt={titulo}
          loading="lazy"
          decoding="async"
          // Não manda o endereço interno do sistema como Referer pra CDN das imagens.
          referrerPolicy="no-referrer"
          onError={() => setFalhou(true)}
          className="h-4.5 w-4.5 object-contain"
        />
      </span>
    );
  }

  if (codigo) {
    return (
      <span title={titulo} className={`${CAIXA} bg-gray-100 text-[10px] font-semibold tabular-nums text-gray-500`}>
        {codigo}
      </span>
    );
  }

  return (
    <span title={titulo} className={`${CAIXA} bg-gray-50 text-gray-300`}>
      <Landmark size={13} />
    </span>
  );
}
