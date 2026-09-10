import { AlertOctagon, Frown, Meh, Smile, UserPlus } from 'lucide-react';

// Vocabulário da régua de cobrança — réplica do protótipo
// (regua-cobranca-configuracao.html) + do texto explicativo
// (regua-cobranca-como-funciona.md). "inad" (Inadimplência) é um cluster
// que existe só aqui, dentro da régua — não é uma categoria em
// cobranca_clientes_clusters (ver ClustersCobranca/constantes.js), que
// continua só com novo/bom/duvidoso/mau.
export const CLUSTERS = [
  {
    id: 'novo',
    nome: 'Novo cliente',
    tipo: 'venc',
    desc: 'Sem histórico suficiente. A régua é educativa: ensina o processo de pagamento e evita atraso por desconhecimento.',
  },
  {
    id: 'bom',
    nome: 'Bom pagador',
    tipo: 'venc',
    desc: 'Histórico consistente. Menos toques e tom leve — cobrar demais quem sempre paga desgasta a relação sem ganho nenhum.',
  },
  {
    id: 'duvidoso',
    nome: 'Pagador duvidoso',
    tipo: 'venc',
    desc: 'Paga, mas atrasa. Régua mais densa e antecipada, ainda cordial, com foco em remover obstáculos ao pagamento.',
  },
  {
    id: 'mau',
    nome: 'Mau pagador',
    tipo: 'venc',
    desc: 'Reincidência alta. Contato humano entra cedo e as condições contratuais são citadas desde as primeiras etapas.',
  },
  {
    id: 'inad',
    nome: 'Inadimplência',
    tipo: 'inad',
    desc: 'Cliente com parcela vencida há dias demais. Tom formal, consequências explícitas e caminho de acordo sempre aberto.',
  },
];

// Ícone + cor por cluster — usados nas abas internas da régua (ver
// ReguaCobrancaTab.jsx). Mesma paleta de sempre (azul/verde/âmbar/vermelho)
// usada em ClustersCobranca/constantes.js, pra reforçar que é o mesmo
// vocabulário de cluster em telas diferentes.
export const CLUSTER_ICON = { novo: UserPlus, bom: Smile, duvidoso: Meh, mau: Frown, inad: AlertOctagon };
export const CLUSTER_ICON_COR = {
  novo: 'text-primary-600',
  bom: 'text-emerald-500',
  duvidoso: 'text-amber-500',
  mau: 'text-red-500',
  inad: 'text-red-600',
};
// Estilo "chip" leve das abas internas quando ativas — nada de preenchimento
// sólido pesado, só um contorno e fundo bem suaves na cor do cluster.
// `primary` só tem os tons 50/100/500/600/700 definidos no tema (ver
// styles/index.css) — 100 é o mais próximo do 200 usado nos outros clusters
// (esses vêm da escala padrão do Tailwind, com todos os tons disponíveis).
export const CLUSTER_TAB_ATIVA = {
  novo: 'border-primary-100 bg-primary-50 text-primary-700',
  bom: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  duvidoso: 'border-amber-200 bg-amber-50 text-amber-700',
  mau: 'border-red-200 bg-red-50 text-red-700',
  inad: 'border-red-200 bg-red-50 text-red-700',
};

export function rotuloDia(d) {
  if (d > 0) return `D+${d}`;
  if (d < 0) return `D${d}`;
  return 'D0';
}

// Mesmo dia, só que sem o "D" — usado nas marcações visíveis do desenho da
// régua (pinos e ticks, ver ReguaVisual.jsx), onde "-5"/"0"/"5" já é claro
// o bastante pelo contexto. `rotuloDia` continua sendo usado em tooltip,
// faixa ativa e texto (onde "D+5" fica mais explícito fora do desenho).
export function numeroDia(d) {
  return String(d);
}

// Comparador de `.sort()` seguro pra `dias` em branco (etapa recém-criada,
// ver reguaCobranca.service.js::criarEtapa) — sem isso, `null - 5` vira -5
// em JS (null é tratado como 0 em conta), o que colocaria uma etapa vazia
// no meio da lista em vez de sempre por último.
export function compararDias(a, b) {
  if (a.dias == null && b.dias == null) return a.id - b.id;
  if (a.dias == null) return 1;
  if (b.dias == null) return -1;
  return a.dias - b.dias;
}

// Espelha `faixa()` do protótipo: a faixa ativa de uma etapa vai do dia
// dela até um dia antes da próxima já configurada (ou até o fim do
// intervalo da régua, se for a última) — nunca é digitada, sempre
// calculada a partir da lista já ordenada por dias. Uma etapa recém-criada
// (`dias` ainda em branco, ver reguaCobranca.service.js::criarEtapa) não
// tem faixa nenhuma pra mostrar, e é pulada ao procurar a "próxima" —
// não interfere na faixa de quem já está configurado ao redor dela.
export function faixaAtiva(etapas, i, cluster, limite) {
  const de = etapas[i].dias;
  if (de == null) return '—';
  const prox = etapas.slice(i + 1).find((e) => e.dias != null);
  if (!prox) return cluster.tipo === 'venc' ? `${rotuloDia(de)} a ${rotuloDia(limite)}` : `${rotuloDia(de)} em diante`;
  const ate = prox.dias - 1;
  return ate <= de ? `só em ${rotuloDia(de)}` : `${rotuloDia(de)} a ${rotuloDia(ate)}`;
}
