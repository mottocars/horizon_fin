// Empresa modelo (HZN CONSTRUTORA): máscara do extrato Itaú das conexões espelho e anonimizador
// — `npm test`. Eventos no formato da API de extrato do Itaú, com nomes/documentos inventados
// fazendo o papel da empresa de origem.
const test = require('node:test');
const assert = require('node:assert');
const { mascararTexto, mascararEvento, nomeFicticio, documentoFicticio, normalizar } = require('../src/modules/integracoes-itau/itau.mascara');
const A = require('../src/modules/empresa-modelo/anonimizador');
const { montarExtrato } = require('../src/modules/relatorio-extratos-bancarios/extratos.calculo');

const ctx = {
  nomeModelo: 'HZN CONSTRUTORA',
  proibidos: ['ORIGEM INCORPORADORA E EMPREENDIMENTOS LTDA', 'SPE RECANTO DAS AGUAS LTDA', 'ORIGEM'].map(normalizar),
  documentosOrigem: ['12164139000150'],
};

const evento = (over = {}) => ({
  id: 'e1',
  date: { event: '2026-11-03T10:15:00-03:00', accounting: '2026-11-03' },
  operation: 'C',
  amount: { value: 1234.56 },
  literal: { complete: 'PIX TRANSF JOAO DA SILV03/11', shortened: 'PIX JOAO DA SILVA' },
  origin: { complement: 'ORIGEM INCORPORADORA E EMPREENDIMENTOS LTDA', channel: 'INTERNET', type: 'PIX' },
  counterpart: { name: 'JOAO DA SILVA', document: '123.456.789-09', institution: 'BANCO X', agency: '1234', account: '56789', digit: '0' },
  ...over,
});

test('máscara do Itaú: contraparte, documento e conta trocados, valor intacto', () => {
  const m = mascararEvento(evento(), ctx);
  assert.notStrictEqual(m.counterpart.name, 'JOAO DA SILVA');
  assert.strictEqual(m.counterpart.name, nomeFicticio('JOAO DA SILVA', '123.456.789-09'));
  assert.notStrictEqual(m.counterpart.document, '123.456.789-09');
  assert.match(m.counterpart.document, /^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
  assert.notStrictEqual(m.counterpart.account, '56789');
  assert.strictEqual(m.amount.value, 1234.56);
  assert.strictEqual(m.operation, 'C');
  assert.strictEqual(m.date.event, '2026-11-03T10:15:00-03:00');
});

test('máscara do Itaú: nada da origem nos históricos (nome inteiro, truncado, razão social)', () => {
  const m = mascararEvento(evento(), ctx);
  const tudo = JSON.stringify([m.literal, m.origin]);
  assert.doesNotMatch(tudo, /JOAO|SILV|ORIGEM|EMPREENDIMENTOS/);
  assert.match(m.origin.complement, /HZN CONSTRUTORA/);
  assert.match(m.literal.complete, /^PIX TRANSF /);
});

test('máscara do Itaú: nome solto sem contraparte e CNPJ no texto também saem', () => {
  const t = mascararTexto('TED 341 MARIA APARECIDA ROCHA 12.164.139/0001-50 SISPAG FORNECEDORES', ctx, null);
  assert.doesNotMatch(t, /MARIA|APARECIDA|ROCHA|12\.164\.139/);
  assert.match(t, /^TED 341 /);
  assert.match(t, /SISPAG FORNECEDORES$/);
});

test('máscara do Itaú: determinística (mesmo nome real → mesmo fictício)', () => {
  assert.strictEqual(nomeFicticio('JOAO DA SILVA', '123.456.789-09'), nomeFicticio('joão da silva', '12345678909'));
  assert.strictEqual(documentoFicticio('12.164.139/0001-50').replace(/\D/g, ''), documentoFicticio('12164139000150'));
  assert.strictEqual(documentoFicticio('12.164.139/0001-50').length, '12.164.139/0001-50'.length);
});

test('máscara do Itaú: o extrato mascarado continua montando dias e saldos iguais', () => {
  const eventos = [evento(), evento({ id: 'e2', operation: 'D', amount: { value: 200 }, counterpart: { name: 'SPE RECANTO DAS AGUAS LTDA', document: '11.222.333/0001-81' } })];
  const saldos = [{ type: 'saldo_disponivel', literal: { complete: 'SALDO TOTAL DISPONÍVEL DIA' }, amount: { value: 5000 }, date: { event: '2026-11-03T23:59:00-03:00' } }];
  const real = montarExtrato({ eventos, saldos, dataInicio: '2026-11-03', dataFim: '2026-11-03' });
  const masc = montarExtrato({ eventos: eventos.map((e) => mascararEvento(e, ctx)), saldos, dataInicio: '2026-11-03', dataFim: '2026-11-03' });
  assert.deepStrictEqual(masc.dias.map((d) => [d.saldoInicial, d.entradas, d.saidas, d.saldoFinal]), real.dias.map((d) => [d.saldoInicial, d.entradas, d.saidas, d.saldoFinal]));
  assert.doesNotMatch(JSON.stringify(masc), /RECANTO|JOAO DA SILVA|11\.222\.333/);
});

test('anonimizador: CPF com zeros à esquerda (Caixa) é pessoa física e casa com o CPF de 11 dígitos', () => {
  const a = A.nome('ADRIANA BARBOSA VILELA', { doc: '00000020918798' });
  const b = A.nome('ADRIANA BARBOSA VILELA', { doc: '00020918798' });
  assert.strictEqual(a, b);
  assert.doesNotMatch(a, /LTDA|EIRELI|S\/A|ME$/);
  assert.strictEqual(A.documento('00000020918798').slice(3), A.documento('00020918798'));
});

test('anonimizador: CNPJ fixo da origem vira o da empresa modelo, com a mesma filial', () => {
  A.fixarDocumento('05093251000181', '48375926000198');
  assert.strictEqual(A.documento('05.093.251/0001-81'), '48.375.926/0001-98');
  assert.match(A.documento('05093251000262'), /^483759260002\d\d$/);
});
