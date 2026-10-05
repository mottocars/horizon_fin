// Foto do usuário (avatar_url, a mesma do Meu Perfil/Topbar) ou as iniciais num círculo com
// cor fixa por pessoa quando não tem foto.
const CORES = [
  'bg-primary-100 text-primary-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-sky-100 text-sky-700',
];

const TAMANHOS = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
};

function iniciais(nome = '') {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export default function Avatar({ usuario, tamanho = 'sm', anel = true, titulo }) {
  const classes = `${TAMANHOS[tamanho]} shrink-0 overflow-hidden rounded-full ${anel ? 'ring-2 ring-white' : ''}`;
  const nome = usuario?.nome || 'Usuário';
  if (usuario?.avatar_url) {
    return <img src={usuario.avatar_url} alt={nome} title={titulo ?? nome} className={`${classes} object-cover`} />;
  }
  const cor = CORES[(usuario?.id || 0) % CORES.length];
  return (
    <span title={titulo ?? nome} className={`${classes} ${cor} inline-flex items-center justify-center font-semibold`}>
      {iniciais(nome)}
    </span>
  );
}
