import { Frown, Meh, Smile, UserPlus } from 'lucide-react';
import { formatarDataISO } from '../../../../utils/datas';

// Vocabulário e estilos compartilhados entre as telas de clusterização
// (nível 1, nível 2 e detalhe do cliente) — mesmo `tom`/rótulo usados pelo
// simulador "Testar com um cliente" (ver MotorRisco/calculo.js), pra nunca
// existir uma classificação com nome diferente em telas diferentes.
export const CLUSTER_ORDEM = ['novo', 'bom', 'duvidoso', 'mau'];

export const CLUSTER_LABEL = {
  novo: 'Novo cliente',
  bom: 'Bom pagador',
  duvidoso: 'Pagador duvidoso',
  mau: 'Mau pagador',
};

export const CLUSTER_TAG_ESTILO = {
  novo: 'bg-primary-50 text-primary-700',
  bom: 'bg-emerald-50 text-emerald-600',
  duvidoso: 'bg-amber-50 text-amber-600',
  mau: 'bg-red-50 text-red-600',
};

// Cara feliz/passiva/triste na frente do cluster — os 3 que têm score
// (bom/duvidoso/mau); "Novo cliente" não passa pelo score, então usa um
// ícone à parte (pessoa nova) em vez de cara. Cor combina com o badge
// (CLUSTER_TAG_ESTILO) de cada um. Usado tanto nos badges (nível 1/2) quanto
// nas colunas só-de-ícone do nível 0 (ver CentrosCustoResumo.jsx).
export const CLUSTER_ICON = {
  novo: UserPlus,
  bom: Smile,
  duvidoso: Meh,
  mau: Frown,
};

export const CLUSTER_ICON_COR = {
  novo: 'text-primary-600',
  bom: 'text-emerald-500',
  duvidoso: 'text-amber-500',
  mau: 'text-red-500',
};

export const MOTIVO_LABEL = {
  score: 'Score',
  novo_cliente: 'Novo cliente (mínimo de parcelas)',
  regra_dura: 'Regra dura (dias vencidos)',
};

export function formatarMoeda(valor) {
  return (Number(valor) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatarDataHora(data) {
  if (!data) return null;
  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Todos os chamadores (due_date, data_pagamento, mes_referencia,
// data_registro, etapa.data...) passam DATA PURA 'YYYY-MM-DD' — coluna DATE
// ou dia montado no backend. Formata só pelo texto (utils/datas): passar por
// `new Date('YYYY-MM-DD')` lê meia-noite UTC e, no Brasil (UTC-3), mostrava
// o dia anterior. Não usar com timestamp — pra isso, formatarDataHora acima.
export function formatarData(data) {
  return formatarDataISO(data);
}

// Cabeçalho das tabelas da Gestão de Cobranças (Rotinas, Gestão das Parcelas,
// Clusters de Clientes) — mesma identidade do cabeçalho do Espião NF-e/NFS-e
// (EspiaoNfeNfsePage.jsx::TEMA_CABECALHO, aba Recebidas): fundo azul claro,
// texto azul, borda de baixo azul forte, divisores azul bem claro e cantos de
// cima arredondados. Gruda no topo do <main> ao rolar — `-top-6` cancela o
// p-6 dele (com `top-0` sobrava uma faixa de 24px por onde as linhas
// apareciam por cima do cabeçalho). Só funciona sem nenhum wrapper com
// overflow entre a tabela e o <main>, e com `border-separate` na tabela.
export const CABECALHO_TABELA = {
  thead: 'sticky -top-6 z-10',
  tr: 'text-xs uppercase tracking-wide text-blue-700 [&>th:first-child]:rounded-tl-lg [&>th:last-child]:rounded-tr-lg',
  th: 'border-b-2 border-b-blue-500 bg-blue-50',
  divisor: 'border-l border-l-blue-100',
};
