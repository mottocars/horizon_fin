import { BadgeCheck, CheckCircle2, CircleDashed, Clock3, Loader } from 'lucide-react';

// Buckets do quadro (o backend calcula `bucket`: ATRASADO quando a data fim esperada passou e
// o card ainda está em Aguardando/Progresso). Concluído = entregue pelo responsável, esperando
// o criador finalizar. Classes escritas por extenso pro Tailwind achar no build.
export const BUCKETS = [
  {
    id: 'AGUARDANDO',
    titulo: 'Aguardando',
    Icone: CircleDashed,
    iconeCor: 'text-slate-400',
    contador: 'bg-slate-100 text-slate-600',
    chip: 'bg-slate-100 text-slate-700',
    alvo: 'ring-slate-300',
  },
  {
    id: 'PROGRESSO',
    titulo: 'Progresso',
    Icone: Loader,
    iconeCor: 'text-violet-500',
    contador: 'bg-violet-50 text-violet-600',
    chip: 'bg-violet-50 text-violet-700',
    alvo: 'ring-violet-400',
  },
  {
    id: 'ATRASADO',
    titulo: 'Atrasado',
    Icone: Clock3,
    iconeCor: 'text-red-500',
    contador: 'bg-red-50 text-red-600',
    chip: 'bg-red-50 text-red-700',
    alvo: 'ring-red-400',
  },
  {
    id: 'CONCLUIDO',
    titulo: 'Concluído',
    Icone: BadgeCheck,
    iconeCor: 'text-primary-500',
    contador: 'bg-primary-50 text-primary-600',
    chip: 'bg-primary-50 text-primary-700',
    alvo: 'ring-primary-500',
  },
  {
    id: 'FINALIZADO',
    titulo: 'Finalizado',
    Icone: CheckCircle2,
    iconeCor: 'text-emerald-500',
    contador: 'bg-emerald-50 text-emerald-600',
    chip: 'bg-emerald-50 text-emerald-700',
    alvo: 'ring-emerald-500',
  },
];

export const BUCKET_POR_ID = Object.fromEntries(BUCKETS.map((b) => [b.id, b]));

// Pra onde o RESPONSÁVEL pode arrastar um card (mesmas regras do backend,
// projetos.service.js::mover): só Aguardando, Progresso e Concluído — Finalizado é do criador
// (botão Finalizar); ninguém solta em Atrasado; de Atrasado só pra Concluído; com a data fim
// vencida, fora de Concluído ele voltaria a atrasar.
export function destinosPermitidos(card, hoje) {
  if (card.bucket === 'FINALIZADO') return [];
  if (card.bucket === 'ATRASADO') return ['CONCLUIDO'];
  const vencido = card.data_fim < hoje;
  return ['AGUARDANDO', 'PROGRESSO', 'CONCLUIDO'].filter((b) => b !== card.bucket && (!vencido || b === 'CONCLUIDO'));
}

export function dataBR(iso, comAno = true) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return comAno ? `${d}/${m}/${a}` : `${d}/${m}`;
}

export function diasEntre(deIso, ateIso) {
  return Math.round((Date.parse(`${ateIso}T12:00:00Z`) - Date.parse(`${deIso}T12:00:00Z`)) / 86400000);
}

// Prazo legível do card: "Vence hoje", "Em 3 dias", "3 dias de atraso", "Concluído 05/10", "Finalizado 05/10".
const diaSP = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

export function prazo(card, hoje) {
  if (card.bucket === 'CONCLUIDO') {
    const quando = card.concluido_em ? diaSP(card.concluido_em) : null;
    return { texto: quando ? `Concluído ${dataBR(quando, false)}` : 'Concluído', tom: 'text-primary-600' };
  }
  if (card.bucket === 'FINALIZADO') {
    const quando = card.finalizado_em
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(card.finalizado_em))
      : null;
    const noPrazo = !quando || quando <= card.data_fim;
    return { texto: quando ? `Finalizado ${dataBR(quando, false)}` : 'Finalizado', tom: noPrazo ? 'text-emerald-600' : 'text-amber-600' };
  }
  const dias = diasEntre(hoje, card.data_fim);
  if (dias < 0) return { texto: `${-dias} dia${dias === -1 ? '' : 's'} de atraso`, tom: 'text-red-600' };
  if (dias === 0) return { texto: 'Vence hoje', tom: 'text-amber-600' };
  if (dias === 1) return { texto: 'Vence amanhã', tom: 'text-amber-600' };
  if (dias <= 3) return { texto: `Em ${dias} dias`, tom: 'text-amber-600' };
  return { texto: `Em ${dias} dias`, tom: 'text-gray-400' };
}

export function tamanhoArquivo(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function dataHora(iso) {
  return iso
    ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })
    : '';
}
