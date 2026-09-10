// Matemática do score — espelho fiel de
// frontend/src/pages/Operacoes/GestaoCobrancas/MotorRisco/calculo.js.
// Qualquer mudança na fórmula do simulador precisa ser replicada aqui, senão
// o cluster real do cliente diverge do que a tela de calibração mostra.

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// Converte um valor bruto pra uma nota de 0 a 100, dado o pior valor
// aceitável (nota0) e o ideal (nota100) — funciona tanto pra escalas
// crescentes quanto decrescentes (o sinal da subtração inverte sozinho).
function nota(valor, nota0, nota100) {
  if (nota100 === nota0) return 0;
  return clamp(((valor - nota0) / (nota100 - nota0)) * 100, 0, 100);
}

// indicadores: [{indicador, nota_0, nota_100, peso}], brutos: { [indicador]: valor }
function calcularNotas(indicadores, brutos) {
  return indicadores.map((ind) => nota(brutos[ind.indicador] ?? 0, Number(ind.nota_0), Number(ind.nota_100)));
}

function calcularScore(indicadores, notas) {
  return indicadores.reduce((acc, ind, i) => acc + (notas[i] * Number(ind.peso)) / 100, 0);
}

// Rótulo de exibição de cada cluster — mesmo vocabulário de `tom` usado no
// simulador do frontend (novo/bom/duvidoso/mau), que é também o valor
// gravado na coluna `cluster` de cobranca_clientes_clusters.
const CLUSTER_LABELS = {
  novo: 'Novo cliente',
  bom: 'Bom pagador',
  duvidoso: 'Pagador duvidoso',
  mau: 'Mau pagador',
};

// Classifica o cliente em cluster. Ordem de precedência:
// 1) regra dura (dias vencidos além do limite da régua de cobrança) — Mau
//    pagador na hora, nem olha o score;
// 2) mínimo de parcelas — sem histórico suficiente, é Novo cliente;
// 3) score contra as faixas de corte.
// (A trava de subida de cluster é aplicada depois, fora desta função, por
// quem já conhece o cluster oficial anterior do cliente — ver
// cobranca-clusters/cobrancaClusters.service.js::aplicarTravaSubida.)
function classificarCluster(score, qtdParcelas, minimoParcelas, corteBom, corteDuvidoso, regraDuraAtiva) {
  if (regraDuraAtiva) return { cluster: 'mau', classe: CLUSTER_LABELS.mau, motivo: 'regra_dura' };
  if (qtdParcelas < minimoParcelas) return { cluster: 'novo', classe: CLUSTER_LABELS.novo, motivo: 'novo_cliente' };
  if (score >= corteBom) return { cluster: 'bom', classe: CLUSTER_LABELS.bom, motivo: 'score' };
  if (score >= corteDuvidoso) return { cluster: 'duvidoso', classe: CLUSTER_LABELS.duvidoso, motivo: 'score' };
  return { cluster: 'mau', classe: CLUSTER_LABELS.mau, motivo: 'score' };
}

module.exports = { clamp, nota, calcularNotas, calcularScore, classificarCluster, CLUSTER_LABELS };
