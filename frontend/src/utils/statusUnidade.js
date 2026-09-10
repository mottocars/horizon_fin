export const STATUS_CONFIG = {
  D: { label: 'Disponível', dot: 'bg-emerald-500', bg: 'bg-emerald-500', text: 'text-white' },
  C: { label: 'Reservada', dot: 'bg-amber-400', bg: 'bg-amber-400', text: 'text-gray-900' },
  R: { label: 'Reserva Técnica', dot: 'bg-gray-400', bg: 'bg-gray-400', text: 'text-white' },
  E: { label: 'Permuta', dot: 'bg-purple-500', bg: 'bg-purple-500', text: 'text-white' },
  M: { label: 'Mútuo', dot: 'bg-pink-500', bg: 'bg-pink-500', text: 'text-white' },
  P: { label: 'Proposta', dot: 'bg-sky-500', bg: 'bg-sky-500', text: 'text-white' },
  V: { label: 'Vendida', dot: 'bg-red-500', bg: 'bg-red-500', text: 'text-white' },
  L: { label: 'Locado', dot: 'bg-teal-500', bg: 'bg-teal-500', text: 'text-white' },
  T: { label: 'Transferido', dot: 'bg-indigo-500', bg: 'bg-indigo-500', text: 'text-white' },
  G: { label: 'Vendido/Terceiros', dot: 'bg-rose-800', bg: 'bg-rose-800', text: 'text-white' },
  O: { label: 'Vendida em Pré-contrato', dot: 'bg-orange-500', bg: 'bg-orange-500', text: 'text-white' },
  PROJETADO: { label: 'Projetados', dot: 'bg-yellow-400', bg: 'bg-yellow-400', text: 'text-white' },
};

export const STATUS_SEM_CADASTRO = {
  label: 'Sem status',
  dot: 'bg-gray-200',
  bg: 'bg-gray-200',
  text: 'text-gray-500',
};

export function statusConfig(codigo) {
  return STATUS_CONFIG[codigo] || STATUS_SEM_CADASTRO;
}
