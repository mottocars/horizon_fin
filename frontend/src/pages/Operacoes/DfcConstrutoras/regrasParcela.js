// Máscaras de nível 2 detalhadas por tipo de parcela (aba Máscaras): quem recebe cada valor da conta que
// elas assumem. Mesma regra de backend/src/modules/dfc-mascaras/regrasParcela.js (mudou lá, muda aqui).
//
// A conta assumida sai do plano de contas na DFC. Valor dela com tipo de parcela cai na máscara que tem
// aquele tipo; sem tipo (lançamento que não veio de parcela) ou com tipo que nenhuma máscara da conta
// escolheu, cai na primeira máscara da conta (ordem da aba Máscaras), na linha do próprio tipo (ou
// "SEM TIPO DE PARCELA").

export const SEM_TIPO = 'SEM TIPO DE PARCELA';

// `mascaras`: a árvore da aba Máscaras (nível 1 com `filhos`).
export function regrasParcela(mascaras) {
  const porConta = new Map(); // conta -> [{ id, tipos }] na ordem da aba
  (mascaras || []).forEach((g) =>
    g.filhos.forEach((f) => {
      if (f.tipo_detalhamento !== 'TIPO_PARCELA' || !f.parcela_conta_sienge_id) return;
      const conta = Number(f.parcela_conta_sienge_id);
      if (!porConta.has(conta)) porConta.set(conta, []);
      porConta.get(conta).push({ id: f.id, tipos: f.parcela_tipos || [] });
    })
  );
  const assumida = (conta) => porConta.has(Number(conta));
  const mascaraDe = (conta, tipo = '') => {
    const lista = porConta.get(Number(conta));
    if (!lista) return null;
    return (lista.find((m) => tipo && m.tipos.includes(tipo)) || lista[0]).id;
  };
  // Todas as máscaras que assumem a conta, na ordem da aba.
  const mascarasDe = (conta) => (porConta.get(Number(conta)) || []).map((m) => m.id);
  return { assumida, mascaraDe, mascarasDe };
}
