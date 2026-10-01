// Testes da conexão API Itaú — rodar com `npm test` (node:test, sem dependência extra).
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const forge = require('node-forge');
const v = require('../src/modules/integracoes-itau/itau.validacao');
const sts = require('../src/modules/integracoes-itau/itau.sts');

test('sanitização do subject', async (t) => {
  await t.test('remove acentos e caracteres proibidos, colapsa espaços', () => {
    assert.strictEqual(v.sanitizarCampoSubject('  Construtora Ação & Cia / Ltda  '), 'Construtora Acao & Cia Ltda');
    assert.strictEqual(v.sanitizarCampoSubject('a/b\\c=d+e,f;g"h<i>j#k'), 'abcdefghijk');
    assert.strictEqual(v.sanitizarCampoSubject('Paçoca   Ñandu\tÜber'), 'Pacoca Nandu Uber');
  });
  await t.test('limita a 64 caracteres', () => {
    assert.strictEqual(v.sanitizarCampoSubject('x'.repeat(100)).length, 64);
  });
  await t.test('monta o subject: cidade maiúscula, UF maiúscula, CN intacto', () => {
    const s = v.montarSubject({
      clientId: '  AbCd1234-0000-1111-2222-333344445555 ',
      razaoSocial: 'Horizon Construções Ltda',
      cidade: 'São José dos Campos',
      uf: 'sp',
    });
    assert.deepStrictEqual(s, {
      CN: 'AbCd1234-0000-1111-2222-333344445555',
      OU: 'Horizon Construcoes Ltda',
      L: 'SAO JOSE DOS CAMPOS',
      ST: 'SP',
      C: 'BR',
    });
    assert.deepStrictEqual(v.validarSubject(s), []);
  });
  await t.test('acusa campos vazios depois da sanitização e UF inválida', () => {
    const erros = v.validarSubject(v.montarSubject({ clientId: 'x', razaoSocial: '///', cidade: '', uf: 'S' }));
    assert.strictEqual(erros.length, 4);
  });
});

test('validação de CNPJ', () => {
  assert.ok(v.validarCnpj('11.222.333/0001-81'));
  assert.ok(v.validarCnpj('11222333000181'));
  assert.ok(!v.validarCnpj('11.222.333/0001-82'));
  assert.ok(!v.validarCnpj('00000000000000'));
  assert.ok(!v.validarCnpj('1122233300018'));
  assert.ok(!v.validarCnpj(''));
});

test('validação de UUID', () => {
  assert.ok(v.validarUuid('a1b2c3d4-0000-1111-2222-333344445555'));
  assert.ok(v.validarUuid(' A1B2C3D4-0000-1111-2222-333344445555 '));
  assert.ok(v.validarUuid(crypto.randomUUID()));
  assert.ok(!v.validarUuid('a1b2c3d4000011112222333344445555'));
  assert.ok(!v.validarUuid('a1b2c3d4-0000-1111-2222-33334444555g'));
  assert.ok(!v.validarUuid(''));
});

test('extração do certificado e do secret', async (t) => {
  const cert = '-----BEGIN CERTIFICATE-----\nMIIBfake\nABCD\n-----END CERTIFICATE-----';

  await t.test('resposta em texto (formato documentado)', () => {
    const r = v.extrairRespostaCertificado(`Secret: 9f8e7d6c-aaaa-bbbb\n${cert}\n`);
    assert.strictEqual(r.secret, '9f8e7d6c-aaaa-bbbb');
    assert.strictEqual(r.certificadoPem, cert);
  });
  await t.test('resposta em texto com CRLF e secret depois do certificado', () => {
    const r = v.extrairRespostaCertificado(`${cert.replace(/\n/g, '\r\n')}\r\nSecret:   s3cr3t\r\n`);
    assert.strictEqual(r.secret, 's3cr3t');
    assert.ok(r.certificadoPem.startsWith('-----BEGIN CERTIFICATE-----'));
    assert.ok(r.certificadoPem.endsWith('-----END CERTIFICATE-----'));
  });
  await t.test('resposta em JSON (secret e client_secret, inclusive aninhado)', () => {
    let r = v.extrairRespostaCertificado(JSON.stringify({ secret: 'abc', certificate: cert }));
    assert.strictEqual(r.secret, 'abc');
    assert.strictEqual(r.certificadoPem, cert);
    r = v.extrairRespostaCertificado(JSON.stringify({ data: { client_secret: 'xyz', crt: cert } }));
    assert.strictEqual(r.secret, 'xyz');
    assert.strictEqual(r.certificadoPem, cert);
  });
  await t.test('sem secret ou sem certificado → null (vira ERRO_PROCESSAMENTO)', () => {
    assert.strictEqual(v.extrairRespostaCertificado(cert).secret, null);
    assert.strictEqual(v.extrairRespostaCertificado('Secret: abc').certificadoPem, null);
    assert.deepStrictEqual(v.extrairRespostaCertificado(''), { certificadoPem: null, secret: null });
  });
});

test('identificador da conta', () => {
  assert.strictEqual(v.identificadorConta({ agencia: '1234', conta: '56789', dac: '0' }), '123400567890');
  assert.strictEqual(v.identificadorConta({ agencia: '1234', conta: '56789', dac: '0' }).length, 12);
  assert.throws(() => v.identificadorConta({ agencia: '123', conta: '56789', dac: '0' }));
  assert.throws(() => v.identificadorConta({ agencia: '1234', conta: '5678', dac: '0' }));
  assert.throws(() => v.identificadorConta({ agencia: '1234', conta: '56789', dac: '' }));
});

test('CSR: RSA 2048, SHA-512, subject na ordem certa e certificado casando com a chave', () => {
  const subject = v.montarSubject({
    clientId: 'a1b2c3d4-0000-1111-2222-333344445555',
    razaoSocial: 'Horizon Construções & Cia',
    cidade: 'São Paulo',
    uf: 'sp',
  });
  const { chavePem, csrPem } = sts.gerarChaveECsr(subject);
  assert.match(csrPem, /^-----BEGIN CERTIFICATE REQUEST-----/);
  assert.match(chavePem, /^-----BEGIN PRIVATE KEY-----/);
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  assert.ok(csr.verify());
  assert.strictEqual(csr.siginfo.algorithmOid, forge.pki.oids.sha512WithRSAEncryption);
  assert.strictEqual(csr.publicKey.n.bitLength(), 2048);
  assert.deepStrictEqual(
    csr.subject.attributes.map((a) => `${a.shortName}=${a.value}`),
    ['CN=a1b2c3d4-0000-1111-2222-333344445555', 'OU=Horizon Construcoes & Cia', 'L=SAO PAULO', 'ST=SP', 'C=BR']
  );

  // certificado "emitido" pra chave pública do CSR → lerCertificado devolve a validade
  const ca = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 864e5);
  cert.setSubject(csr.subject.attributes);
  cert.setIssuer([{ name: 'commonName', value: 'CA de teste' }]);
  cert.sign(ca.privateKey, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);
  assert.ok(sts.lerCertificado(certPem, chavePem).validade > new Date());
  // chave de outro CSR não casa
  assert.strictEqual(sts.lerCertificado(certPem, sts.gerarChaveECsr(subject).chavePem), null);
});

test('criptografia AES-256-GCM com ITAU_ENCRYPTION_KEY', () => {
  const anterior = process.env.ITAU_ENCRYPTION_KEY;
  const { criptografar, descriptografar } = require('../src/modules/integracoes-itau/itau.crypto');
  try {
    process.env.ITAU_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    const cifrado = criptografar('segredo-123');
    assert.notStrictEqual(cifrado, 'segredo-123');
    assert.strictEqual(descriptografar(cifrado), 'segredo-123');
    assert.notStrictEqual(criptografar('segredo-123'), cifrado); // IV aleatório

    process.env.ITAU_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    assert.throws(() => descriptografar(cifrado)); // outra chave não abre

    delete process.env.ITAU_ENCRYPTION_KEY;
    assert.throws(() => criptografar('x'), /ITAU_ENCRYPTION_KEY/);
    process.env.ITAU_ENCRYPTION_KEY = 'curta';
    assert.throws(() => criptografar('x'), /ITAU_ENCRYPTION_KEY/);
  } finally {
    if (anterior === undefined) delete process.env.ITAU_ENCRYPTION_KEY;
    else process.env.ITAU_ENCRYPTION_KEY = anterior;
  }
});

test('URL do extrato: statementId com "00", type=current_account e start-date', () => {
  const url = sts.montarUrlExtrato({ agencia: '1234', conta: '56789', dac: '0' }, { dataInicio: '2026-10-01', dataFim: '2026-10-01' });
  assert.strictEqual(
    url,
    'https://account-statement.api.itau.com/account-statement/v1/statements/123400567890?type=current_account&start-date=2026-10-01'
  );
});
