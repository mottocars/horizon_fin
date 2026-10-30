import http from './http';

// Aba DRE: coluna Valor de cada Máscara DRE de nível 2 no período (de/até, 'AAAA-MM-DD', inclusive),
// somando os centros de custo pedidos (vazio = todos com "Realiza DRE"). Resposta: { de, ate,
// centros, poc_receita: { mascara: null | { id, descricao }, obras: [...] }, valores: { [mascara_id]:
// número | null } } — null = cálculo ainda não feito (a tela mostra traço).
export function calcularDre(empresaId, { de, ate, centros = [] }) {
  const params = new URLSearchParams({ de, ate });
  centros.forEach((c) => params.append('centro', c));
  return http.get(`/dre-demonstrativo/${empresaId}?${params}`).then((res) => res.data);
}
