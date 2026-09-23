// Parser do retorno CAIXA em CNAB240 (layout "Extrato Eletrônico para Conciliação Bancária",
// manual 38.185 v005) — só os campos usados hoje (Header/Trailer de Lote, saldo inicial e
// final por conta). Posições do manual são 1-based [de, até] inclusive.
function campo(linha, de, ate) {
  return linha.substring(de - 1, ate).trim();
}

// CONTA vem com zeros à esquerda (picture 9(012) na prática, mesmo o manual descrevendo o
// campo do Header de Lote como X(012)) — remove os zeros pra bater com o texto livre que fica
// salvo em contas_bancarias_sienge.conta_enriquecida (ex.: "000577057721" -> "577057721").
function semZerosEsquerda(texto) {
  const semZeros = texto.replace(/^0+/, '');
  return semZeros === '' ? '0' : semZeros;
}

function parseSaldo(linha, deData, deValor) {
  return {
    data: converterData(campo(linha, deData, deData + 7)),
    valorCentavos: Number(campo(linha, deValor, deValor + 17)),
    situacao: campo(linha, deValor + 18, deValor + 18), // D ou C, logo após o valor (18 dígitos)
  };
}

// DDMMAAAA -> YYYY-MM-DD (mesmo formato usado em toda a aplicação).
function converterData(ddmmaaaa) {
  if (!/^\d{8}$/.test(ddmmaaaa)) return null;
  return `${ddmmaaaa.slice(4, 8)}-${ddmmaaaa.slice(2, 4)}-${ddmmaaaa.slice(0, 2)}`;
}

// Recebe as linhas de UM arquivo de retorno (já sem quebras de linha, uma string por
// registro) e devolve 1 item por LOTE (conta) com saldo inicial e final.
function parseRetornoCaixa(linhas) {
  const lotes = new Map(); // lote (0004-0007) -> { banco, conta, digitoConta, saldoInicial, saldoFinal }

  for (const linha of linhas) {
    if (!linha || linha.length < 170) continue;
    const numeroLote = campo(linha, 4, 7);
    const tipoRegistro = linha[7];

    if (tipoRegistro === '1') {
      lotes.set(numeroLote, {
        banco: campo(linha, 1, 3),
        conta: semZerosEsquerda(campo(linha, 59, 70)),
        digitoConta: campo(linha, 71, 71),
        saldoInicial: parseSaldo(linha, 143, 151),
      });
    } else if (tipoRegistro === '5') {
      const lote = lotes.get(numeroLote);
      if (!lote) continue; // trailer sem header correspondente (não deveria acontecer)
      lote.saldoFinal = {
        ...parseSaldo(linha, 143, 151),
        status: campo(linha, 170, 170), // F = final, P = parcial
      };
    }
  }

  return [...lotes.values()].filter((l) => l.saldoFinal);
}

module.exports = { parseRetornoCaixa };
