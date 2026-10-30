// POC (percentual de obra concluída) com 6 casas decimais no percentual (pedido do usuário):
// 64,047026% = 0,64047026 — a fração fica com 8 casas. Usada no cálculo da DRE e na prévia da aba
// Configurações, pra a tela mostrar exatamente a POC que multiplica os valores.
function arredondarPoc(fracao) {
  return Math.round(fracao * 1e8) / 1e8;
}

module.exports = { arredondarPoc };
