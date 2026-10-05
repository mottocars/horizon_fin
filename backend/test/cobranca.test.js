// Retorno de cobrança CAIXA (CNAB 240/SIGCB) e soma da cobrança no saldo — `npm test`.
// O arquivo é montado aqui com as mesmas posições do retorno real (out/2026), mas com nomes e
// documentos fictícios.
const test = require('node:test');
const assert = require('node:assert');
const { parseRetornoCobrancaCaixa } = require('../src/utils/cnab240');
const { somaCreditos } = require('../src/modules/saldo-contas-bancarias/cobranca.calculo');

// Linha de 240 posições com cada texto na sua posição (1-based, como no manual).
function linha(campos) {
  const l = Array(240).fill(' ');
  for (const [pos, texto] of campos) for (let i = 0; i < texto.length; i++) l[pos - 1 + i] = texto[i];
  return l.join('');
}
const num = (centavos, tam = 15) => String(centavos).padStart(tam, '0');

function titulo({ seq, nossoNumero, doc, venc, valor, banco, cpf, nome, canal, juros = 0, pago, ocorrencia, credito }) {
  const t = linha([
    [1, `10400013${num(seq, 5)}T 06`], [18, '000000'], [24, '121193'], [40, nossoNumero], [57, '6'], [58, '1'],
    [59, doc], [74, venc], [82, num(valor)], [97, banco], [100, '061820'], [106, doc], [131, '09'], [133, '1'],
    [134, num(cpf, 15)], [149, nome], [199, num(240)], [214, `${canal}0301`],
  ]);
  const u = linha([
    [1, `10400013${num(seq + 1, 5)}U 06`], [18, num(juros)], [33, num(0)], [48, num(0)], [63, num(0)],
    [78, num(pago)], [93, num(pago)], [108, num(0)], [123, num(0)], [138, ocorrencia], [146, credito], [154, '0000'],
    [158, credito], [166, num(0)],
  ]);
  return [t, u];
}

const ARQUIVO = [
  linha([[1, '104000000'], [18, '218384058000141'], [53, '042625121193'], [73, 'EMPRESA TESTE'], [143, '2021020260136520007740470'] ]),
  linha([[1, '10400011T0100037'], [18, '2018384058000141121193']]),
  ...titulo({ seq: 1, nossoNumero: '14000000000004306', doc: '59552', venc: '20092026', valor: 271172, banco: '341', cpf: 11111111111, nome: 'PAGADOR UM', canal: '04', juros: 6507, pago: 277679, ocorrencia: '02102026', credito: '05102026' }),
  ...titulo({ seq: 3, nossoNumero: '14000000000004334', doc: '59701', venc: '20102026', valor: 178301, banco: '509', cpf: 22222222222, nome: 'PAGADOR DOIS', canal: '04', pago: 178301, ocorrencia: '02102026', credito: '05102026' }),
  ...titulo({ seq: 5, nossoNumero: '14000000000004362', doc: '60275', venc: '10102026', valor: 100000, banco: '104', cpf: 33333333333, nome: 'PAGADOR TRES', canal: '06', pago: 100000, ocorrencia: '02102026', credito: '05102026' }),
  linha([[1, '10400015'], [18, '000008']]),
  linha([[1, '10499999'], [18, '000001000010']]),
];

test('retorno de cobrança: 1 título por par T+U, com valores e datas do segmento U', () => {
  const { arquivo, titulos } = parseRetornoCobrancaCaixa(ARQUIVO);
  assert.deepStrictEqual(arquivo, { beneficiarioCodigo: '121193', nsa: '000774', geradoEm: '2026-10-02T01:36:52' });
  assert.strictEqual(titulos.length, 3);
  const [t1, , t3] = titulos;
  assert.strictEqual(t1.nossoNumero, '14000000000004306');
  assert.strictEqual(t1.numeroDocumento, '59552');
  assert.strictEqual(t1.vencimento, '2026-09-20');
  assert.strictEqual(t1.valorTitulo, 271172);
  assert.strictEqual(t1.jurosMulta, 6507, 'pagou depois do vencimento');
  assert.strictEqual(t1.valorPago, 277679, 'Vl Pago = título + juros');
  assert.strictEqual(t1.valorCreditado, 277679);
  assert.strictEqual(t1.dataOcorrencia, '2026-10-02');
  assert.strictEqual(t1.dataCredito, '2026-10-05');
  assert.strictEqual(t1.bancoCobrador, '341');
  assert.strictEqual(t1.valorTarifa, 240);
  assert.strictEqual(t1.pagadorNome, 'PAGADOR UM');
  assert.strictEqual(t1.codMovimento, '06');
  assert.strictEqual(t1.canal, '04');
  assert.strictEqual(t3.canal, '06');
  assert.strictEqual(t1.linhaT.length, 240);
});

test('retorno sem espaços no fim da linha (como pode vir da API) continua lendo', () => {
  const { titulos } = parseRetornoCobrancaCaixa(ARQUIVO.map((l) => l.trimEnd()));
  assert.strictEqual(titulos.length, 3);
  assert.strictEqual(titulos[1].valorPago, 178301);
});

test('título não pago (entrada/baixa) vem com datas zeradas: ficam null, sem quebrar a gravação', () => {
  const [t, u] = titulo({ seq: 1, nossoNumero: '14000000000009999', doc: '70000', venc: '20112026', valor: 50000, banco: '000', cpf: 44444444444, nome: 'PAGADOR QUATRO', canal: '00', pago: 0, ocorrencia: '05102026', credito: '00000000' });
  const { titulos } = parseRetornoCobrancaCaixa([t, u]);
  assert.strictEqual(titulos[0].dataCredito, null);
  assert.strictEqual(titulos[0].dataDebitoTarifa, null);
  assert.strictEqual(titulos[0].dataOcorrencia, '2026-10-05');
});

test('soma da cobrança: créditos depois do fechamento do extrato até o dia, só liquidação', () => {
  const titulos = [
    { cod_movimento: '06', valor_pago: '5231.61', data_credito: '2026-10-02' }, // sexta: já está no fechamento de sexta
    { cod_movimento: '06', valor_pago: '2776.79', data_credito: '2026-10-05' },
    { cod_movimento: '06', valor_pago: '1783.01', data_credito: '2026-10-05' },
    { cod_movimento: '06', valor_pago: '1000.00', data_credito: '2026-10-05' },
    { cod_movimento: '06', valor_pago: '500.00', data_credito: '2026-10-06' }, // depois do dia
    { cod_movimento: '02', valor_pago: '0', data_credito: '2026-10-05' }, // entrada, não é pagamento
    { cod_movimento: '02', valor_pago: '0', data_credito: null },
  ];
  // segunda 05/10 com o fechamento de sexta 02/10: entra de sábado até segunda
  assert.deepStrictEqual(somaCreditos(titulos, '2026-10-02', '2026-10-05'), { titulos: 3, valor: 5559.8 });
  // fechamento mais antigo (quinta 01/10): a sexta também entra
  assert.deepStrictEqual(somaCreditos(titulos, '2026-10-01', '2026-10-05'), { titulos: 4, valor: 10791.41 });
  assert.deepStrictEqual(somaCreditos(titulos, '2026-10-06', '2026-10-07'), { titulos: 0, valor: 0 });
});
