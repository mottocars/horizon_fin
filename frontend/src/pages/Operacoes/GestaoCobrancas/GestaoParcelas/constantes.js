import { CLUSTERS, CLUSTER_ICON, CLUSTER_ICON_COR, rotuloDia } from '../ReguaCobranca/constantes';
import { formatarData, formatarMoeda } from '../ClustersCobranca/constantes';

// Reaproveita o vocabulário de 5 clusters da Régua de Cobrança (que já
// inclui "inad"/Inadimplência) em vez do de ClustersCobranca/constantes.js
// (que só tem os 4 de score) — esta tela, diferente de "Clusters de
// Clientes", precisa mostrar Inadimplência como um cluster próprio.
export { CLUSTER_ICON, CLUSTER_ICON_COR, formatarData, formatarMoeda, rotuloDia };

export const CLUSTER_ORDEM = CLUSTERS.map((c) => c.id);
export const CLUSTER_LABEL = Object.fromEntries(CLUSTERS.map((c) => [c.id, c.nome]));

// Mesmas 4 cores de ClustersCobranca/constantes.js::CLUSTER_TAG_ESTILO, mais
// um vermelho mais forte pra Inadimplência — pra não ficar visualmente igual
// ao badge de "Mau pagador" (que já usa um vermelho mais claro).
export const CLUSTER_TAG_ESTILO = {
  novo: 'bg-primary-50 text-primary-700',
  bom: 'bg-emerald-50 text-emerald-600',
  duvidoso: 'bg-amber-50 text-amber-600',
  mau: 'bg-red-50 text-red-600',
  inad: 'bg-red-100 text-red-700',
};
