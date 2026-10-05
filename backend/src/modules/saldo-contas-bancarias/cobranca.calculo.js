// Soma da cobrança que entra no saldo de um dia (função pura — backend/test/cobranca.test.js).
// Só títulos LIQUIDADOS com Dt Crédito DEPOIS de `depoisDe` (o fechamento do extrato usado) e
// até `ate` (o dia do saldo); o valor é o Vl Pago (com juros/multa).

const MOVIMENTOS_LIQUIDACAO = ['06', '17']; // 06 = liquidação, 17 = liquidação após baixa

function somaCreditos(titulos, depoisDe, ate) {
  let centavos = 0;
  let quantidade = 0;
  for (const t of titulos) {
    if (!t.data_credito || t.data_credito <= depoisDe || t.data_credito > ate) continue;
    if (!MOVIMENTOS_LIQUIDACAO.includes(t.cod_movimento)) continue;
    centavos += Math.round(Number(t.valor_pago) * 100);
    quantidade++;
  }
  return { titulos: quantidade, valor: centavos / 100 };
}

module.exports = { MOVIMENTOS_LIQUIDACAO, somaCreditos };
