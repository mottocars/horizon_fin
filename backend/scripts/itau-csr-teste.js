// Gera um CSR com dados fictícios (mesma função usada pelo sistema) e imprime o subject, pra
// conferir com o que o `openssl req -noout -subject` mostraria. Nada é gravado nem enviado.
//   node scripts/itau-csr-teste.js [credencial] [razão social] [cidade] [UF]
const forge = require('node-forge');
const { montarSubject, validarSubject } = require('../src/modules/integracoes-itau/itau.validacao');
const { gerarChaveECsr } = require('../src/modules/integracoes-itau/itau.sts');

const [
  clientId = 'a1b2c3d4-0000-1111-2222-333344445555',
  razaoSocial = 'Construtora Exemplo Ação & Cia Ltda.',
  cidade = 'São José dos Campos',
  uf = 'sp',
] = process.argv.slice(2);

const subject = montarSubject({ clientId, razaoSocial, cidade, uf });
const erros = validarSubject(subject);
if (erros.length) {
  console.error('Dados inválidos:', erros.join(' '));
  process.exitCode = 1;
} else {
  const { csrPem } = gerarChaveECsr(subject);
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  console.log(csr.subject.attributes.map((a) => `${a.shortName} = ${a.value}`).join(', '));
  console.log(`Assinatura: ${forge.pki.oids[csr.siginfo.algorithmOid]} | chave: RSA ${csr.publicKey.n.bitLength()} bits | assinatura válida: ${csr.verify()}`);
  console.log(`\n${csrPem}`);
}
