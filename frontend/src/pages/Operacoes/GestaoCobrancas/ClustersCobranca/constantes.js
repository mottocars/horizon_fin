import { Frown, Meh, Smile, UserPlus } from 'lucide-react';

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

// "YYYY-MM-DD" puro (sem hora — é como due_date/data_registro/etapa.data
// voltam do backend em vários lugares da Gestão de Cobranças, sempre que
// já são strings de dia de calendário, não timestamps) precisa ser tratado
// à parte: `new Date('YYYY-MM-DD')` é interpretado pela spec como meia-noite
// EM UTC, e o `toLocaleDateString` logo depois reconverte pro fuso local do
// navegador — em fusos atrás de UTC (Brasil, UTC-3), isso empurra a data
// pro dia anterior (ex.: "2026-09-07" virava "06/09/2026"). Construindo a
// data a partir dos componentes (ano/mês/dia) direto no fuso local, esse
// dia de calendário nunca muda de fuso nenhum — é só isso que ele é.
// Quando `data` já vem com hora (timestamp completo, tipo `criado_em`) ou
// já é um objeto Date, o comportamento de sempre continua valendo.
export function formatarData(data) {
  if (!data) return '—';
  if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const [ano, mes, dia] = data.split('-').map(Number);
    return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
