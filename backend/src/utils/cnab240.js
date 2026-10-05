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

// ---------------------------------------------------------------------------------------
// Retorno de COBRANÇA CAIXA (CNAB 240, SIGCB — arquivos "GCB.<apelido>.RETORNO...").
// Posições conferidas campo a campo contra o CSV do mesmo arquivo (out/2026). Cada título
// vem em 2 registros: segmento T (dados do título) seguido do U (valores e datas).
// Valores em centavos; datas em YYYY-MM-DD.
// ---------------------------------------------------------------------------------------
const centavos = (linha, de, ate) => Number(campo(linha, de, ate) || 0);

function segmentoT(l) {
  return {
    codMovimento: campo(l, 16, 17),
    beneficiarioCodigo: campo(l, 24, 29),
    nossoNumero: campo(l, 40, 56),
    nossoNumeroDv: campo(l, 57, 57), // provável DV do nosso número (não vai pro CSV da Caixa)
    carteira: campo(l, 58, 58), // 1 = Simples
    numeroDocumento: campo(l, 59, 69),
    vencimento: converterData(campo(l, 74, 81)),
    valorTitulo: centavos(l, 82, 96),
    bancoCobrador: campo(l, 97, 99),
    agenciaCobradora: campo(l, 100, 105), // agência (5) + DV (1)
    identTituloEmpresa: campo(l, 106, 130),
    pagadorTipo: campo(l, 133, 133), // 1 = CPF, 2 = CNPJ
    pagadorDocumento: campo(l, 134, 148),
    pagadorNome: campo(l, 149, 188),
    valorTarifa: centavos(l, 199, 213),
    canal: campo(l, 214, 215), // 04 = compensação eletrônica, 06 = internet banking...
    motivoOcorrencia: campo(l, 214, 223),
  };
}

function segmentoU(l) {
  return {
    jurosMulta: centavos(l, 18, 32),
    desconto: centavos(l, 33, 47),
    abatimento: centavos(l, 48, 62),
    iof: centavos(l, 63, 77),
    valorPago: centavos(l, 78, 92),
    valorCreditado: centavos(l, 93, 107),
    outrasDespesas: centavos(l, 108, 122),
    outrosCreditos: centavos(l, 123, 137),
    dataOcorrencia: converterData(campo(l, 138, 145)),
    dataCredito: converterData(campo(l, 146, 153)),
    dataDebitoTarifa: converterData(campo(l, 158, 165)),
    pagadorEfetivo: /^0*$/.test(campo(l, 181, 195)) ? null : campo(l, 181, 195), // provável (tipo + CPF/CNPJ)
  };
}

function parseRetornoCobrancaCaixa(linhas) {
  const arquivo = { beneficiarioCodigo: null, nsa: null, geradoEm: null };
  const titulos = [];
  let pendenteT = null;

  for (const linha of linhas) {
    if (!linha || linha.length < 17) continue; // a API pode cortar os espaços do fim da linha
    const tipoRegistro = linha[7];
    if (tipoRegistro === '0') {
      const data = converterData(campo(linha, 144, 151));
      const hora = campo(linha, 152, 157);
      arquivo.beneficiarioCodigo = campo(linha, 59, 64);
      arquivo.nsa = campo(linha, 158, 163);
      arquivo.geradoEm = data && /^\d{6}$/.test(hora) ? `${data}T${hora.slice(0, 2)}:${hora.slice(2, 4)}:${hora.slice(4, 6)}` : data;
    } else if (tipoRegistro === '3') {
      const segmento = linha[13];
      if (segmento === 'T') pendenteT = linha;
      else if (segmento === 'U' && pendenteT) {
        titulos.push({ ...segmentoT(pendenteT), ...segmentoU(linha), linhaT: pendenteT, linhaU: linha });
        pendenteT = null;
      }
    }
  }
  return { arquivo, titulos };
}

module.exports = { parseRetornoCaixa, parseRetornoCobrancaCaixa };
