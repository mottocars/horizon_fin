// Matemática do score — puro, sem estado, espelhando exatamente a fórmula
// usada pelo motor de verdade (fica fácil auditar/testar isolado).

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

// Converte um valor bruto (ex.: "11 dias de atraso") pra uma nota de 0 a 100,
// dado o pior valor aceitável (nota0) e o ideal (nota100). Funciona tanto
// pra escalas crescentes (nota100 > nota0, ex. % pago em dia) quanto
// decrescentes (nota100 < nota0, ex. dias de atraso) — o mesmo sinal da
// subtração já inverte sozinho.
export function nota(valor, nota0, nota100) {
  if (nota100 === nota0) return 0;
  return clamp(((valor - nota0) / (nota100 - nota0)) * 100, 0, 100);
}

export function fmt(n) {
  return (Math.round(n * 10) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

// indicadores: [{id, nota_0, nota_100, peso}], brutos: { [id]: valor }
export function calcularNotas(indicadores, brutos) {
  return indicadores.map((ind) => nota(brutos[ind.id] ?? 0, ind.nota_0, ind.nota_100));
}

export function calcularScore(indicadores, notas) {
  return indicadores.reduce((acc, ind, i) => acc + (notas[i] * ind.peso) / 100, 0);
}

// Classifica o cliente em cluster. Ordem de precedência:
// 1) regra dura da régua de cobrança (`regraDuraAtiva` — pelo menos 1
//    parcela em aberto vencida além do limite configurado): Mau pagador na
//    hora, nem olha o score;
// 2) mínimo de parcelas: histórico curto demais pra confiar em score —
//    vira "Novo cliente" (também regra dura, não passa pelo score);
// 3) score contra as faixas de corte.
export function classificarCluster(score, qtdParcelas, minimoParcelas, corteBom, corteDuvidoso, regraDuraAtiva) {
  if (regraDuraAtiva) return { classe: 'Mau pagador', tom: 'mau', motivo: 'regra_dura' };
  if (qtdParcelas < minimoParcelas) return { classe: 'Novo cliente', tom: 'novo', motivo: 'novo_cliente' };
  if (score >= corteBom) return { classe: 'Bom pagador', tom: 'bom', motivo: 'score' };
  if (score >= corteDuvidoso) return { classe: 'Pagador duvidoso', tom: 'duvidoso', motivo: 'score' };
  return { classe: 'Mau pagador', tom: 'mau', motivo: 'score' };
}

// Reparte 100 pontos entre os indicadores proporcionalmente ao peso atual de
// cada um, arredondando e jogando a sobra/falta (do arredondamento) no maior
// peso — nunca deixa a soma fechar em 99 ou 101.
export function distribuirProporcionalmente(pesos) {
  const soma = pesos.reduce((a, p) => a + p, 0);
  if (!soma) return pesos;
  const novos = pesos.map((p) => Math.round((p * 100) / soma));
  const diferenca = 100 - novos.reduce((a, n) => a + n, 0);
  const idxMaior = novos.indexOf(Math.max(...novos));
  novos[idxMaior] += diferenca;
  return novos;
}
