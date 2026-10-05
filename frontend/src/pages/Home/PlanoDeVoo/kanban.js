import { CheckCircle2, Clock3, Hourglass, PlayCircle } from 'lucide-react';

// Buckets do quadro (o backend calcula `bucket`: ATRASADO quando a data fim esperada passou
// e o card não foi finalizado). Classes escritas por extenso pro Tailwind achar no build.
export const BUCKETS = [
  {
    id: 'AGUARDANDO',
    titulo: 'Aguardando',
    Icone: Hourglass,
    ponto: 'bg-slate-400',
    barra: 'border-l-slate-300',
    chip: 'bg-slate-100 text-slate-700',
    coluna: 'bg-slate-50',
    alvo: 'ring-slate-300 bg-slate-100/80',
    vazio: 'Nada aguardando.',
  },
  {
    id: 'PROGRESSO',
    titulo: 'Progresso',
    Icone: PlayCircle,
    ponto: 'bg-primary-500',
    barra: 'border-l-primary-500',
    chip: 'bg-primary-50 text-primary-700',
    coluna: 'bg-primary-50/40',
    alvo: 'ring-primary-500 bg-primary-50',
    vazio: 'Nenhuma atividade em andamento.',
  },
  {
    id: 'ATRASADO',
    titulo: 'Atrasado',
    Icone: Clock3,
    ponto: 'bg-red-500',
    barra: 'border-l-red-500',
    chip: 'bg-red-50 text-red-700',
    coluna: 'bg-red-50/40',
    alvo: 'ring-red-400 bg-red-50',
    vazio: 'Nenhuma atividade atrasada.',
    dica: 'Automático: entra aqui o que passou da data fim sem ser finalizado.',
  },
  {
    id: 'FINALIZADO',
    titulo: 'Finalizado',
    Icone: CheckCircle2,
    ponto: 'bg-emerald-500',
    barra: 'border-l-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700',
    coluna: 'bg-emerald-50/40',
    alvo: 'ring-emerald-500 bg-emerald-50',
    vazio: 'Nada finalizado ainda.',
  },
];

export const BUCKET_POR_ID = Object.fromEntries(BUCKETS.map((b) => [b.id, b]));

// Pra onde um card pode ser arrastado (mesmas regras do backend, projetos.service.js::mover):
// ninguém solta em Atrasado; de Atrasado só pra Finalizado; com a data fim vencida, fora de
// Finalizado ele voltaria a atrasar — então também só Finalizado.
export function destinosPermitidos(card, hoje) {
  if (card.bucket === 'ATRASADO' || card.data_fim < hoje) return card.bucket === 'FINALIZADO' ? [] : ['FINALIZADO'];
  return ['AGUARDANDO', 'PROGRESSO', 'FINALIZADO'].filter((b) => b !== card.bucket);
}

export function dataBR(iso, comAno = true) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return comAno ? `${d}/${m}/${a}` : `${d}/${m}`;
}

export function diasEntre(deIso, ateIso) {
  return Math.round((Date.parse(`${ateIso}T12:00:00Z`) - Date.parse(`${deIso}T12:00:00Z`)) / 86400000);
}

// Prazo legível do card: "vence hoje", "em 3 dias", "3 dias de atraso", "finalizado em 05/10".
export function prazo(card, hoje) {
  if (card.bucket === 'FINALIZADO') {
    const quando = card.finalizado_em
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(card.finalizado_em))
      : null;
    const noPrazo = !quando || quando <= card.data_fim;
    return { texto: quando ? `Finalizado ${dataBR(quando, false)}` : 'Finalizado', tom: noPrazo ? 'text-emerald-600' : 'text-amber-600' };
  }
  const dias = diasEntre(hoje, card.data_fim);
  if (dias < 0) return { texto: `${-dias} dia${dias === -1 ? '' : 's'} de atraso`, tom: 'text-red-600 font-semibold' };
  if (dias === 0) return { texto: 'Vence hoje', tom: 'text-amber-600 font-semibold' };
  if (dias === 1) return { texto: 'Vence amanhã', tom: 'text-amber-600' };
  if (dias <= 3) return { texto: `Vence em ${dias} dias`, tom: 'text-amber-600' };
  return { texto: `Vence em ${dias} dias`, tom: 'text-gray-500' };
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
