// CNAB 240 manual (arquivos anexados na abertura do período) — `npm test`.
// Arquivos montados aqui com as posições do retorno real da CAIXA (nov/2026), dados fictícios.
const test = require('node:test');
const assert = require('node:assert');
const { detectarTipoCnab, loteDaConta } = require('../src/utils/cnab240');
const cnab = require('../src/modules/saldo-contas-bancarias/cnab-manual.service');

function linha(campos) {
  const l = Array(240).fill(' ');
  for (const [pos, texto] of campos) for (let i = 0; i < texto.length; i++) l[pos - 1 + i] = texto[i];
  return l.join('');
}
const num = (v, tam) => String(v).padStart(tam, '0');

// Extrato eletrônico: header de lote (operação E, conta 59-70, DV 71, saldo inicial) + trailer
// de lote (saldo final em 143-168, D/C em 169, F em 170).
function extrato({ conta, dv, banco = '104', dataFinal, centavos, situacao = 'C' }) {
  return [
    linha([[1, `${banco}00000`], [144, '04112026']]),
    linha([[1, `${banco}00011E0440033`], [59, num(conta, 12)], [71, dv], [143, '31102026'], [151, num(100, 18)], [169, 'CF']]),
    linha([[1, `${banco}00015`], [143, dataFinal], [151, num(centavos, 18)], [169, `${situacao}F`]]),
    linha([[1, `${banco}99999`]]),
  ].join('\r\n');
}

// Retorno de cobrança SIGCB: beneficiário no header (59-64) e em cada segmento T (24-29).
function cobranca({ beneficiario, dv = '4', banco = '104' }) {
  return [
    linha([[1, `${banco}00000`], [59, `${beneficiario}${dv}`], [144, '03112026']]),
    linha([[1, `${banco}00011T0100030`]]),
    linha([[1, `${banco}00013${num(1, 5)}T 06`], [24, beneficiario], [40, '14000000000012345'], [74, '05112026'], [82, num(150000, 15)]]),
    linha([[1, `${banco}00013${num(2, 5)}U 06`], [78, num(150000, 15)], [93, num(150000, 15)], [138, '04112026'], [146, '04112026']]),
    linha([[1, `${banco}00015`]]),
    linha([[1, `${banco}99999`]]),
  ].join('\r\n');
}

const arquivo = (nome, texto) => ({ nome, buffer: Buffer.from(texto, 'latin1') });
const contaOn = { company_id: 6, numero_conta: '5776337727', nome: 'ON', banco: '104', conta_enriquecida: '577633772', digito: '7', codigo_beneficiario: '124718' };

test('detecta extrato, cobrança e arquivo que não é CNAB', () => {
  assert.strictEqual(detectarTipoCnab(extrato({ conta: '577633772', dv: '7', dataFinal: '03112026', centavos: 1 }).split('\r\n')), 'EXTRATO');
  assert.strictEqual(detectarTipoCnab(cobranca({ beneficiario: '124718' }).split('\r\n')), 'COBRANCA');
  assert.strictEqual(detectarTipoCnab(['qualquer coisa']), null);
});

test('lê os arquivos pelo conteúdo, não pelo campo', () => {
  const r = cnab.lerArquivos([
    arquivo('ext.RET', extrato({ conta: '577633772', dv: '7', dataFinal: '03112026', centavos: 1111874 })),
    arquivo('cob.RET', cobranca({ beneficiario: '124718' })),
    arquivo('outro.txt', 'nada'),
    arquivo('itau.RET', cobranca({ beneficiario: '124718', banco: '341' })),
  ]);
  assert.deepStrictEqual(r.lidos.map((l) => l.tipo), ['EXTRATO', 'COBRANCA']);
  assert.strictEqual(r.extratos[0].lotes[0].saldoFinal.valorCentavos, 1111874);
  assert.strictEqual(r.cobrancas[0].titulos[0].valorPago, 150000);
  assert.match(r.avisos.join('\n'), /outro\.txt: não é um arquivo/);
  assert.match(r.avisos.join('\n'), /itau\.RET: retorno de cobrança do banco 341/);
});

test('extrato: vale o saldo final mais recente ANTES do dia; avisa o antigo e a conta sem cadastro', () => {
  const { extratos } = cnab.lerArquivos([
    arquivo('a.RET', extrato({ conta: '577633772', dv: '7', dataFinal: '31102026', centavos: 500 })),
    arquivo('b.RET', extrato({ conta: '000577633772', dv: '7', dataFinal: '03112026', centavos: 900, situacao: 'D' })),
    arquivo('c.RET', extrato({ conta: '999', dv: '1', dataFinal: '03112026', centavos: 1 })),
  ]);
  const dia4 = cnab.casarExtratos([contaOn], extratos, '2026-11-04');
  assert.strictEqual(dia4.encontrados.length, 1);
  assert.strictEqual(dia4.encontrados[0].lote.saldoFinal.data, '2026-11-03');
  assert.strictEqual(dia4.encontrados[0].lote.saldoFinal.situacao, 'D');
  assert.match(dia4.avisos.join('\n'), /c\.RET: a conta 999-1 \(banco 104\) não está cadastrada/);

  // o saldo final do próprio dia não serve (fechamento é de um dia anterior)
  const dia3 = cnab.casarExtratos([contaOn], extratos, '2026-11-03');
  assert.strictEqual(dia3.encontrados[0].lote.saldoFinal.data, '2026-10-31');
  assert.match(dia3.avisos.join('\n'), /ON: usado o saldo final de 31\/10\/2026 .* anterior ao último dia útil, 02\/11\/2026/);
});

test('cobrança: casa pelo beneficiário (sem zeros à esquerda) e avisa beneficiário sem conta', () => {
  const { cobrancas } = cnab.lerArquivos([arquivo('cob.RET', cobranca({ beneficiario: '124718' }))]);
  const casou = cnab.casarCobrancas([{ ...contaOn, codigo_beneficiario: '0124718' }], cobrancas);
  assert.strictEqual(casou.porConta.size, 1);
  assert.strictEqual([...casou.porConta.values()][0][0].titulos.length, 1);
  // cadastro com o DV junto (124718-4 digitado como 1247184) também casa; DV errado não
  assert.strictEqual(cnab.casarCobrancas([{ ...contaOn, codigo_beneficiario: '1247184' }], cobrancas).porConta.size, 1);
  assert.strictEqual(cnab.casarCobrancas([{ ...contaOn, codigo_beneficiario: '1247185' }], cobrancas).porConta.size, 0);
  const semConta = cnab.casarCobrancas([{ ...contaOn, codigo_beneficiario: '999999' }], cobrancas);
  assert.strictEqual(semConta.porConta.size, 0);
  assert.match(semConta.avisos[0], /beneficiário 124718-4 não está em nenhuma conta/);
  assert.strictEqual(cnab.chaveCobranca('0124718'), 'CNAB:124718');
});

test('loteDaConta ignora zeros à esquerda e exige o dígito', () => {
  const lote = { banco: '104', conta: '577633772', digitoConta: '7' };
  assert.ok(loteDaConta(lote, { banco: '0104', conta_enriquecida: '000577633772', digito: '7' }));
  assert.ok(!loteDaConta(lote, { banco: '104', conta_enriquecida: '577633772', digito: '8' }));
});
