// Funções puras da conexão API Itaú — validação dos campos, sanitização do subject do CSR,
// extração do certificado/secret da resposta do Itaú e identificador da conta. Sem acesso a
// banco nem rede (cobertas por backend/test/itau.test.js).

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validarUuid(valor) {
  return REGEX_UUID.test(String(valor || '').trim());
}

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

// Aceita com ou sem máscara (12.345.678/0001-95 ou 12345678000195).
function validarCnpj(valor) {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (base) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = digito(cnpj.slice(0, 12));
  const d2 = digito(cnpj.slice(0, 12) + d1);
  return cnpj.endsWith(`${d1}${d2}`);
}

// Passo 2 da especificação: sem acentos (ç→c, ã→a...), sem / \ = + , ; " < > #, espaços
// múltiplos viram um, trim e no máximo 64 caracteres (limite do X.509 pra OU/L).
function sanitizarCampoSubject(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[/\\=+,;"<>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
    .trim();
}

// Subject exatamente como vai no CSR. CN = credencial como digitada (só trim, mantém caixa);
// OU = razão social; L = cidade em MAIÚSCULAS; ST = UF (2 letras maiúsculas); C = BR.
function montarSubject({ clientId, razaoSocial, cidade, uf }) {
  return {
    CN: String(clientId || '').trim(),
    OU: sanitizarCampoSubject(razaoSocial),
    L: sanitizarCampoSubject(cidade).toUpperCase(),
    ST: String(uf || '').trim().toUpperCase(),
    C: 'BR',
  };
}

// Lista de problemas do subject (vazia = pode gerar). Roda depois da sanitização, então pega
// também campos que ficaram vazios só com caracteres removidos.
function validarSubject(subject) {
  const erros = [];
  if (!validarUuid(subject.CN)) erros.push('Credencial (client_id) deve estar no formato UUID.');
  if (!subject.OU) erros.push('Informe a razão social.');
  if (!subject.L) erros.push('Informe a cidade.');
  if (!/^[A-Z]{2}$/.test(subject.ST)) erros.push('UF deve ter 2 letras.');
  return erros;
}

const REGEX_CERTIFICADO = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
const REGEX_LINHA_SECRET = /^\s*(?:client[_ ]?)?secret\s*:\s*(\S+)\s*$/im;

function extrairCertificados(texto) {
  const blocos = String(texto || '').match(REGEX_CERTIFICADO);
  return blocos ? blocos.join('\n') : null;
}

// Procura secret/client_secret em qualquer nível do JSON (o Itaú pode aninhar a resposta).
function secretDoJson(obj, profundidade = 0) {
  if (!obj || typeof obj !== 'object' || profundidade > 3) return null;
  for (const [campo, valor] of Object.entries(obj)) {
    if (/^(client_?secret|secret)$/i.test(campo) && typeof valor === 'string' && valor.trim()) return valor.trim();
  }
  for (const valor of Object.values(obj)) {
    const achado = secretDoJson(valor, profundidade + 1);
    if (achado) return achado;
  }
  return null;
}

// Passo 6: resposta da solicitação do certificado → { certificadoPem, secret } (qualquer um
// pode vir null — quem chama decide: faltando algum, é ERRO_PROCESSAMENTO). Formato
// documentado: texto com a linha "Secret: <valor>" + certificado PEM; aceita também JSON.
function extrairRespostaCertificado(texto) {
  const bruto = String(texto || '');
  let json = null;
  try {
    json = JSON.parse(bruto);
  } catch {
    // texto puro (formato documentado)
  }
  if (json && typeof json === 'object') {
    return { certificadoPem: extrairCertificados(JSON.stringify(json).replace(/\\n/g, '\n')), secret: secretDoJson(json) };
  }
  const linha = bruto.replace(REGEX_CERTIFICADO, '').match(REGEX_LINHA_SECRET);
  return { certificadoPem: extrairCertificados(bruto), secret: linha ? linha[1] : null };
}

// Identificador da conta na API de extrato: agência(4) + "00" + conta(5) + DAC(1) = 12.
function identificadorConta({ agencia, conta, dac }) {
  const a = somenteDigitos(agencia);
  const c = somenteDigitos(conta);
  const d = somenteDigitos(dac);
  if (a.length !== 4 || c.length !== 5 || d.length !== 1) {
    throw new Error('Conta inválida: agência com 4 dígitos, conta com 5 e DAC com 1.');
  }
  return `${a}00${c}${d}`;
}

module.exports = {
  validarUuid,
  validarCnpj,
  somenteDigitos,
  sanitizarCampoSubject,
  montarSubject,
  validarSubject,
  extrairRespostaCertificado,
  identificadorConta,
};
