// Máscaras de nível 2 detalhadas por tipo de parcela (aba Máscaras): quem recebe cada valor da conta que
// elas assumem. Mesma regra de frontend/src/pages/Operacoes/DfcConstrutoras/regrasParcela.js (mudou lá,
// muda aqui).
//
// - A conta assumida sai do plano de contas na DFC: o que o Plano Contas diria dela (Máscara DFC, Origem
//   Projeção) não vale mais — os valores dela são das máscaras.
// - Uma conta pode estar em várias máscaras, cada uma com os seus tipos de parcela (sem repetir). Valor da
//   conta com tipo de parcela cai na máscara que tem aquele tipo; sem tipo (lançamento que não veio de
//   parcela) ou com tipo que nenhuma máscara da conta escolheu, cai na primeira máscara da conta (ordem da
//   aba Máscaras), na linha do próprio tipo (ou "SEM TIPO DE PARCELA").
// - CEF - NOVO REGISTRO / CEF - MEDIÇÃO: a Projeção CEF entra no único tipo da máscara (máscara com origem
//   CEF tem um tipo só e não usa o Aging — o financiamento não é contado duas vezes).
// - SIENGE - AGING: as parcelas a receber da conta, nos tipos da máscara.

const ORIGENS_CEF = ['CEF_NOVO_REGISTRO', 'CEF_MEDICAO'];
const ORIGEM_AGING = 'SIENGE_AGING';
const SEM_TIPO = 'SEM TIPO DE PARCELA';

// `mascaras`: a árvore de dfcMascaras.list (nível 1 com `filhos`).
function regrasParcela(mascaras) {
  const porConta = new Map(); // conta -> [máscara de nível 2, na ordem da aba]
  const cef = []; // [{ mascaraId, conta, tipo, origens }]
  const aging = []; // [{ mascaraId, conta, tipos }]
  const cefPorOrigem = new Map(); // origem CEF -> máscara que a usa
  mascaras.forEach((g) =>
    g.filhos.forEach((f) => {
      if (f.tipo_detalhamento !== 'TIPO_PARCELA' || !f.parcela_conta_sienge_id) return;
      const conta = Number(f.parcela_conta_sienge_id);
      const tipos = f.parcela_tipos || [];
      const origens = f.parcela_origens || [];
      if (!porConta.has(conta)) porConta.set(conta, []);
      porConta.get(conta).push({ id: f.id, tipos });
      const origensCef = origens.filter((o) => ORIGENS_CEF.includes(o));
      if (origensCef.length) {
        cef.push({ mascaraId: f.id, conta, tipo: tipos[0] || '', origens: origensCef });
        origensCef.forEach((o) => cefPorOrigem.set(o, f.id));
      } else if (origens.includes(ORIGEM_AGING) && tipos.length) {
        aging.push({ mascaraId: f.id, conta, tipos });
      }
    })
  );

  const assumida = (conta) => porConta.has(Number(conta));
  // Máscara que recebe um valor da conta assumida com aquele tipo de parcela ('' = sem tipo).
  const mascaraDe = (conta, tipo = '') => {
    const lista = porConta.get(Number(conta));
    if (!lista) return null;
    return (lista.find((m) => tipo && m.tipos.includes(tipo)) || lista[0]).id;
  };
  return { assumida, mascaraDe, cef, aging, cefPorOrigem, contas: [...porConta.keys()] };
}

// Nome da linha de um tipo de parcela na DFC: "PM · PARCELA MENSAL"; '' = sem tipo.
function rotuloTipo(tipo, nomes = {}) {
  if (!tipo) return SEM_TIPO;
  return nomes[tipo] ? `${tipo} · ${nomes[tipo]}` : tipo;
}

module.exports = { regrasParcela, rotuloTipo, ORIGENS_CEF, ORIGEM_AGING, SEM_TIPO };
