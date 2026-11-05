const crypto = require('crypto');

// ---------------------------------------------------------------------------------------
// Anonimizador da empresa modelo (HZN CONSTRUTORA). Transforma os dados copiados da empresa de
// origem em dados fictícios, de forma DETERMINÍSTICA: o mesmo cliente / fornecedor / CNPJ /
// obra vira sempre o mesmo personagem fictício, em qualquer tabela e em qualquer execução —
// então joins por nome, somas por fornecedor e a remontagem diária continuam coerentes.
// Valores em R$ não são alterados (decisão do usuário, 05/11/2026).
// ---------------------------------------------------------------------------------------

const SAL = 'hzn-construtora-modelo';

function hash(texto) {
  return crypto.createHash('sha256').update(`${SAL}:${texto}`).digest();
}
function inteiro(h, i = 0) {
  return h.readUInt32BE(i % 28);
}
function escolher(lista, h, i = 0) {
  return lista[inteiro(h, i) % lista.length];
}

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

// ─── listas ─────────────────────────────────────────────────────────────────────────────

const PRENOMES_F = `ANA ADRIANA ALICE AMANDA BEATRIZ BIANCA BRUNA CAMILA CAROLINA CECILIA CLARA CLAUDIA CRISTINA
  DANIELA DEBORA ELAINE ELISA EDUARDA FABIANA FERNANDA FLAVIA GABRIELA GIOVANA HELENA ISABELA JULIANA
  JULIA KARINA LARISSA LAURA LETICIA LIVIA LUANA LUCIANA MANUELA MARCELA MARIANA MARINA MELISSA NATALIA
  OLIVIA PAMELA PATRICIA PAULA PRISCILA RAFAELA REGINA RENATA ROBERTA SABRINA SILVIA SIMONE SOFIA
  TATIANA TERESA VALENTINA VANESSA VERA VIVIANE YASMIN`.split(/\s+/).filter(Boolean);
const PRENOMES_M = `ADRIANO ALEXANDRE ANDRE ANTONIO ARTUR BERNARDO BRUNO CAIO CARLOS CESAR DANIEL DAVI DIEGO
  EDUARDO ENZO FABIO FELIPE FERNANDO GABRIEL GUILHERME GUSTAVO HEITOR HENRIQUE HUGO IGOR JOAO JORGE
  JOSE LEANDRO LEONARDO LUCAS LUIZ MARCELO MARCOS MATEUS MAURICIO MIGUEL NICOLAS OTAVIO PAULO PEDRO
  RAFAEL RENATO RICARDO RODOLFO ROGERIO SAMUEL SERGIO THIAGO TIAGO VICTOR VINICIUS VITOR WAGNER`.split(/\s+/).filter(Boolean);
const SOBRENOMES = `ALMEIDA ALVES AMARAL ANDRADE ARAUJO AZEVEDO BARBOSA BARROS BASTOS BATISTA BEZERRA BORGES
  BRAGA BRANDAO CABRAL CALDEIRA CAMARGO CAMPOS CARDOSO CARVALHO CASTRO CAVALCANTI CORDEIRO CORREIA COSTA
  COUTINHO CUNHA DAMASCENO DIAS DUARTE ESTEVES FARIA FARIAS FERRAZ FIGUEIREDO FONSECA FRANCO FREITAS
  GALVAO GOMES GUEDES GUIMARAES LACERDA LEAL LEMOS LIMA LOBO LOPES MACEDO MACHADO MAGALHAES MARQUES
  MARTINS MATOS MEDEIROS MELO MENDES MENDONCA MENEZES MESQUITA MIRANDA MONTEIRO MORAES MOREIRA MOTA
  NASCIMENTO NEVES NOGUEIRA NUNES OLIVEIRA PACHECO PAIVA PEIXOTO PEREIRA PIMENTEL PINHEIRO PINTO PIRES
  PRADO QUEIROZ RAMOS REIS REZENDE RIBEIRO ROCHA RODRIGUES SALES SAMPAIO SANTANA SANTOS SIQUEIRA SOARES
  SOUSA TAVARES TEIXEIRA TORRES VALADARES VASCONCELOS VAZ VELOSO VIANA VIEIRA XAVIER`.split(/\s+/).filter(Boolean);
const EMPRESA_RAIZ = `ACQUA ALFA ALIANCA ALPHA ALTA ALTIVA AMAZONIA ANDES ARCO ARGOS ATLAS ATLANTICO AURUM
  AVANTE BASE BELA BRASILIS CAMPO CANAA CAPITAL CEDRO CENTAURO CIMA COLINA CONFIANCA CONTINENTAL CRUZEIRO
  DELTA DINAMICA DOMINIO ELO EMPORIO ESTRELA EUROPA EXATA FENIX FORTE FRONTEIRA GALAXIA GAMMA GIRASSOL
  GRANITO HORTENCIA IBERICA IDEAL IMPERIO INOVA IPE ITAPOA JACARANDA JADE JEQUITIBA LIDER LINEA LUMEN
  MAGNA MAPLE MARE MERIDIANO MESTRE MINAS MODELO MONTEVERDE MOSAICO NOBRE NORTE NOVA OLIMPO OMEGA OPCAO
  ORION PAINEIRA PALMARES PANTANAL PARANA PEROLA PIONEIRA PLANALTO POLO PRIMA PRISMA PROGRESSO QUARTZO
  RAIZ REAL RECANTO RIBEIRA ROCHEDO RUBI SAFIRA SANTA FE SERRA SIGMA SOLAR SOLIDA SUL TABOCA TERRA
  TITAN TOPAZIO TRIUNFO UNIAO URBANA VALE VANGUARDA VECTOR VERDE VERTICE VIA VITORIA ZENITE`.split(/\s+/).filter(Boolean);
const EMPRESA_RAMO = [
  'MATERIAIS DE CONSTRUCAO', 'SERVICOS DE ENGENHARIA', 'COMERCIO E SERVICOS', 'LOCACAO DE EQUIPAMENTOS',
  'TRANSPORTES', 'INSTALACOES ELETRICAS', 'CONCRETO', 'ESQUADRIAS', 'VIDROS E ESPELHOS', 'PISOS E REVESTIMENTOS',
  'HIDRAULICA', 'TERRAPLENAGEM', 'ESTRUTURAS METALICAS', 'MADEIRAS', 'TINTAS', 'IMPERMEABILIZACAO',
  'ELEVADORES', 'CONSULTORIA', 'TECNOLOGIA', 'SEGURANCA', 'LIMPEZA E CONSERVACAO', 'PROJETOS',
  'ARQUITETURA', 'TOPOGRAFIA', 'AGREGADOS', 'FERRAGENS', 'GESSO E DRYWALL', 'AR CONDICIONADO',
  'MARMORARIA', 'SERRALHERIA', 'DISTRIBUIDORA', 'ARTEFATOS DE CIMENTO', 'MANUTENCAO PREDIAL',
  'SANEAMENTO', 'ENERGIA SOLAR', 'PAISAGISMO', 'CONTABILIDADE', 'ADVOCACIA', 'MARKETING', 'IMOBILIARIA',
];
const EMPRESA_SUFIXO = ['LTDA', 'LTDA', 'LTDA', 'EIRELI', 'S/A', 'ME', 'LTDA EPP'];
const RUAS = `DAS ACACIAS|DOS IPES|DAS PALMEIRAS|DO SOL NASCENTE|DO HORIZONTE|DAS AMENDOEIRAS|DOS JACARANDAS|
  SAO JOAO|DAS FLORES|DO COMERCIO|DA INDEPENDENCIA|SETE DE SETEMBRO|QUINZE DE NOVEMBRO|DAS ORQUIDEAS|
  DOS GIRASSOIS|DA AURORA|DO MIRANTE|DAS GAIVOTAS|DO PROGRESSO|DA LIBERDADE|DOS BANDEIRANTES|DA PAZ|
  DAS MANGUEIRAS|DOS CEDROS|DA CONSTITUICAO|DO CRUZEIRO|DAS ROSAS|DOS LIRIOS|DA ESPERANCA|DO PARQUE`.split('|').map((s) => s.trim());
const TIPOS_RUA = ['RUA', 'RUA', 'RUA', 'AVENIDA', 'TRAVESSA', 'ALAMEDA'];
const DOMINIOS = ['exemplo.com.br', 'email.com.br', 'correio.com.br', 'mail.com.br'];

// ─── documentos ─────────────────────────────────────────────────────────────────────────

function dv(base, pesos) {
  const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}
function cpfDe(h) {
  let base = '';
  for (let i = 0; i < 9; i += 1) base += String(h[i] % 10);
  if (/^(\d)\1+$/.test(base)) base = `9${base.slice(1)}`;
  const d1 = dv(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${d1}${d2}`;
}
function cnpjDe(h, filial = '0001') {
  let base = '';
  for (let i = 0; i < 8; i += 1) base += String(h[i] % 10);
  base += filial;
  const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${d1}${d2}`;
}

// Documento fictício no MESMO formato do original (com ou sem máscara, zeros à esquerda,
// CNPJ de filial mantém a filial). Mesma raiz de CNPJ → mesma raiz fictícia.
const docFixos = new Map(); // dígitos originais → dígitos fictícios (ex.: CNPJ da origem → CNPJ da empresa modelo)
function fixarDocumento(original, ficticio) {
  docFixos.set(soDigitos(original), soDigitos(ficticio));
}
// CPF com zeros à esquerda em campo de 14 dígitos (a Caixa manda assim: 000 + CPF).
function cpfValido(d) {
  if (!/^\d{11}$/.test(d) || /^(\d)+$/.test(d)) return false;
  return dv(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[9]) && dv(d.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]) === Number(d[10]);
}
function ehCpfPreenchido(dig) {
  return dig.length === 14 && dig.startsWith('000') && cpfValido(dig.slice(3));
}

function documentoDigitos(dig) {
  if (!dig) return dig;
  if (docFixos.has(dig)) return docFixos.get(dig);
  if (/^0+$/.test(dig)) return dig;
  if (ehCpfPreenchido(dig)) return `000${cpfDe(hash(`cpf:${dig.slice(3)}`))}`;
  if (dig.length === 14) {
    const raizFixa = [...docFixos.entries()].find(([o]) => o.length === 14 && o.slice(0, 8) === dig.slice(0, 8));
    if (raizFixa) return cnpjDe(Buffer.from(raizFixa[1].slice(0, 8).split('').map(Number)), dig.slice(8, 12));
    return cnpjDe(hash(`cnpj:${dig.slice(0, 8)}`), dig.slice(8, 12));
  }
  if (dig.length === 11) return cpfDe(hash(`cpf:${dig}`));
  // CPF com zeros à esquerda (Sienge às vezes manda 15 dígitos: 0000 + CPF) / CNPJ com zero extra
  const semZeros = dig.replace(/^0+/, '');
  if (dig.length > 11 && semZeros.length <= 11) return dig.slice(0, dig.length - 11) + cpfDe(hash(`cpf:${semZeros.padStart(11, '0')}`));
  if (dig.length > 14 && semZeros.length <= 14) return dig.slice(0, dig.length - 14) + documentoDigitos(semZeros.padStart(14, '0'));
  // qualquer outro número de documento: mesmos tamanho e zeros, dígitos trocados
  const h = hash(`num:${dig}`);
  let i = 0;
  return dig.replace(/\d/g, () => String(h[(i += 1) % 32] % 10));
}
function documento(valor) {
  if (valor === null || valor === undefined || valor === '') return valor;
  const texto = String(valor);
  const dig = soDigitos(texto);
  if (!dig) return valor;
  const novo = documentoDigitos(dig);
  let i = 0;
  return texto.replace(/\d/g, () => novo[i++] ?? '0');
}
function formatarCnpj(d) {
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

// ─── pessoas e empresas ─────────────────────────────────────────────────────────────────

const SUFIXOS_PJ = /\b(LTDA|LTD|S\/?A|S\.A|ME|EPP|EIRELI|MEI|CIA|COMPANHIA|CONDOMINIO|CONDOMINIO|ASSOCIACAO|INSTITUTO|FUNDACAO|SPE|COOPERATIVA|SINDICATO|BANCO|EMPREENDIMENTOS?|CONSTRU\w*|COMERCIO|SERVICOS?|INDUSTRIA|ENGENHARIA|TRANSPORTES?|MATERIAIS|DISTRIBUIDORA|LOCACAO|LOCACOES|ADMINISTRADORA|IMOBILIARIA|CONSULTORIA|TECNOLOGIA|INCORPORA\w*|PARTICIPACOES|HOLDING|GRUPO|COMERCIAL|AUTO|POSTO|FERRAGENS|MADEIREIRA|DEPOSITO|ELETRICA|HIDRAULICA|SOLUCOES|SISTEMAS|ARQUITETURA|PROJETOS|SEGUROS?|SOCIEDADE|ADVOGADOS|CONTABIL\w*|AGENCIA|EDITORA|LABORATORIO|CLINICA|HOTEL|RESTAURANTE|SUPERMERCADO|MERCADO|LOJA|LOJAS)\b/;

function sexoProvavel(nome) {
  const primeiro = normalizar(nome).replace(/^\d[\d.]*\s+/, '').split(' ')[0] || '';
  if (FEMININOS_SEM_A.has(primeiro)) return 'F';
  return /A$/.test(primeiro) && !/^(LUCA|JOSUA|NICOLA|ANDREA|BATISTA|JOSHUA|GARCIA)$/.test(primeiro) ? 'F' : 'M';
}

function ehPessoaJuridica(nome, doc) {
  const d = soDigitos(doc).replace(/^0+(?=\d{14}$)/, '');
  if (ehCpfPreenchido(d)) return false;
  if (d.length === 14) return true;
  if (d.length === 11) return false;
  return SUFIXOS_PJ.test(normalizar(nome));
}

// Entidades conhecidas que podem ficar "genéricas" (órgãos públicos, bancos, concessionárias):
// o nome real não identifica a empresa de origem, mas a cidade sim — então vira um rótulo genérico.
const ENTIDADES_GENERICAS = [
  [/RECEITA FEDERAL|SECRETARIA DA RECEITA|MINISTERIO DA FAZENDA|\bRFB\b/, 'RECEITA FEDERAL DO BRASIL'],
  [/\bINSS\b|PREVIDENCIA SOCIAL/, 'INSTITUTO NACIONAL DO SEGURO SOCIAL'],
  [/\bFGTS\b/, 'FGTS - FUNDO DE GARANTIA'],
  [/PREFEITURA|MUNICIPIO DE|FAZENDA MUNICIPAL|SECRETARIA MUNICIPAL/, 'PREFEITURA MUNICIPAL'],
  [/SECRETARIA (DE ESTADO )?DA FAZENDA|SEFAZ|ESTADO D[OE] /, 'SECRETARIA ESTADUAL DA FAZENDA'],
  [/CAIXA ECONOMICA/, 'CAIXA ECONOMICA FEDERAL'],
  [/BANCO DO BRASIL/, 'BANCO DO BRASIL S/A'],
  [/\bITAU\b/, 'ITAU UNIBANCO S/A'],
  [/BRADESCO/, 'BANCO BRADESCO S/A'],
  [/SANTANDER/, 'BANCO SANTANDER S/A'],
  [/SICOOB|SICREDI|COOPERATIVA DE CREDITO/, 'COOPERATIVA DE CREDITO'],
  [/\bLIGHT\b|\bENEL\b|\bCEMIG\b|ENERGISA|AMPLA|ENERGIA ELETRICA|DISTRIBUIDORA DE ENERGIA/, 'CONCESSIONARIA DE ENERGIA'],
  [/SANEAMENTO|\bSAAE\b|AGUAS DO|\bCEDAE\b|COPASA|CESAMA|\bSAAE\b|AGUA E ESGOTO/, 'COMPANHIA DE SANEAMENTO'],
  [/CARTORIO|OFICIO DE REGISTRO|REGISTRO DE IMOVEIS|TABELIONATO|TABELIAO/, 'CARTORIO DE REGISTRO DE IMOVEIS'],
  [/CORREIOS|EMPRESA BRASILEIRA DE CORREIOS/, 'EMPRESA BRASILEIRA DE CORREIOS E TELEGRAFOS'],
  [/\bCREA\b|CONSELHO REGIONAL DE ENGENHARIA/, 'CONSELHO REGIONAL DE ENGENHARIA E AGRONOMIA'],
  [/\bCAU\b|CONSELHO DE ARQUITETURA/, 'CONSELHO DE ARQUITETURA E URBANISMO'],
  [/SINDICATO|SINDUSCON/, 'SINDICATO DA CONSTRUCAO CIVIL'],
  [/TRIBUNAL|JUSTICA|PODER JUDICIARIO|VARA (CIVEL|DO TRABALHO)/, 'PODER JUDICIARIO'],
  [/DETRAN/, 'DEPARTAMENTO ESTADUAL DE TRANSITO'],
  [/VIVO\b|TELEFONICA|\bCLARO\b|\bTIM\b|\bOI\b S/, 'OPERADORA DE TELECOMUNICACOES'],
];
function entidadeGenerica(nome) {
  const n = normalizar(nome);
  for (const [re, rotulo] of ENTIDADES_GENERICAS) if (re.test(n)) return rotulo;
  return null;
}

// Nomes fixos (obras, empresas do grupo, pessoas da origem) — preenchidos pelo clonador antes
// de qualquer transformação: chave = nome normalizado.
const nomesFixos = new Map();
function fixarNome(original, ficticio) {
  const n = normalizar(original);
  if (n) nomesFixos.set(n, ficticio);
}

const FEMININOS_SEM_A = new Set(`THAIS RAQUEL ISABEL MIRIAM BEATRIZ ALICE ELIANE ELIENE IRENE ROSANGELA JAQUELINE
  JACQUELINE CRISTIANE GISELE ALINE ADRIANE DAIANE LUCIENE MICHELE RACHEL ESTER ESTHER LIZ INES CARMEN ELIZABETH
  ELISABETH IVONE YVONE SUELI SUELY NADIR RUTH KELLY KATHLEEN LUCI LUCY ROSE DENISE CLARICE BERENICE
  EUNICE NAIR LAIS INGRID MARILENE SOLANGE HELOISE HELOISA JANE CRISTIANY DEISE DAYSE`.split(/\s+/).filter(Boolean));

function nomePessoa(chave, sexo) {
  const h = hash(`pf:${chave}`);
  const prenomes = sexo === 'F' ? PRENOMES_F : PRENOMES_M;
  const p = escolher(prenomes, h, 0);
  const s1 = escolher(SOBRENOMES, h, 4);
  let s2 = escolher(SOBRENOMES, h, 8);
  if (s2 === s1) s2 = escolher(SOBRENOMES, h, 12);
  return inteiro(h, 16) % 3 === 0 ? `${p} ${escolher(SOBRENOMES, h, 20)} ${s1} ${s2}` : `${p} ${s1} ${s2}`;
}
function nomeEmpresa(chave) {
  const h = hash(`pj:${chave}`);
  return `${escolher(EMPRESA_RAIZ, h, 0)} ${escolher(EMPRESA_RAMO, h, 4)} ${escolher(EMPRESA_SUFIXO, h, 8)}`;
}

// Mantém o "jeitão" do original: caixa (maiúsculas / Título), prefixo de MEI ("12.345.678 NOME").
function aplicarCaixa(modelo, texto) {
  const letras = String(modelo).replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letras && letras === letras.toLowerCase()) return texto.toLowerCase();
  if (letras && letras !== letras.toUpperCase()) {
    return texto
      .toLowerCase()
      .replace(/(^|\s)(\S)/g, (m, e, c) => e + c.toUpperCase())
      .replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase())
      .replace(/\b(Hzn|Spe|Ii|Iii|Iv|Ltda|S\/a|Me|Epp|Eireli|Cef)\b/g, (m) => m.toUpperCase());
  }
  return texto;
}

// Nome real → fictício já gerado com documento: quem aparece depois só com o nome (ex.: o
// cliente no título a receber, sem CPF) recebe o mesmo nome fictício do cadastro dele.
const registroNomes = new Map();

// Nome fictício de uma pessoa/empresa. `doc` (CPF/CNPJ) é a melhor chave; sem ele, o nome.
function nome(original, { doc = null, tipo = null } = {}) {
  if (original === null || original === undefined) return original;
  const texto = String(original);
  const n = normalizar(texto);
  if (!n) return original;
  if (nomesFixos.has(n)) return aplicarCaixa(texto, nomesFixos.get(n));
  if (!soDigitos(doc) && registroNomes.has(n)) return aplicarCaixa(texto, registroNomes.get(n));
  // MEI: "12.345.678 FULANO DE TAL" — prefixo = raiz do CNPJ
  const mei = texto.match(/^(\d{2}\.?\d{3}\.?\d{3})\s+(.+)$/);
  if (mei) {
    const raiz = soDigitos(mei[1]);
    const novaRaiz = documentoDigitos(`${raiz}000100`).slice(0, 8);
    const prefixo = mei[1].includes('.') ? `${novaRaiz.slice(0, 2)}.${novaRaiz.slice(2, 5)}.${novaRaiz.slice(5, 8)}` : novaRaiz;
    return `${prefixo} ${nomePessoa(`mei:${raiz}`, sexoProvavel(mei[2]))}`;
  }
  const generica = entidadeGenerica(texto);
  if (generica) return aplicarCaixa(texto, generica);
  const chaveDoc = soDigitos(doc).replace(/^0+(?=\d{11}$)/, '');
  const chave = chaveDoc || n;
  const pj = tipo ? tipo === 'PJ' : ehPessoaJuridica(texto, doc);
  const ficticio = pj ? nomeEmpresa(chave) : nomePessoa(chave, sexoProvavel(texto));
  if (chaveDoc && !registroNomes.has(n)) registroNomes.set(n, ficticio);
  return aplicarCaixa(texto, ficticio);
}

function primeiroNome(original) {
  return nome(original).split(' ')[0];
}

function email(original, nomeFicticio) {
  if (!original) return original;
  const base = normalizar(nomeFicticio || nome(original))
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .split(' ')
    .filter(Boolean);
  const h = hash(`email:${normalizar(original)}`);
  const usuario = base.length >= 2 ? `${base[0]}.${base[base.length - 1]}` : base[0] || `contato${inteiro(h) % 1000}`;
  return `${usuario}${inteiro(h, 4) % 7 === 0 ? inteiro(h, 8) % 100 : ''}@${escolher(DOMINIOS, h, 12)}`;
}

// Telefone: mantém DDI/DDD e o formato; troca o número.
function telefone(original) {
  if (!original) return original;
  const texto = String(original);
  const h = hash(`tel:${soDigitos(texto)}`);
  const digitos = soDigitos(texto);
  const manter = digitos.length >= 10 ? (digitos.length >= 12 ? 4 : 2) : 0; // DDI+DDD ou DDD
  let i = 0;
  let pos = 0;
  return texto.replace(/\d/g, (d) => {
    pos += 1;
    if (pos <= manter) return d;
    if (pos === manter + 1 && digitos.length - manter === 9) return '9';
    return String(h[(i += 1) % 32] % 10);
  });
}

function logradouro(original) {
  if (!original) return original;
  const h = hash(`rua:${normalizar(original)}`);
  return aplicarCaixa(String(original), `${escolher(TIPOS_RUA, h, 0)} ${escolher(RUAS, h, 4)}`);
}
function numeroEndereco(original) {
  if (!original || !/\d/.test(String(original))) return original;
  const h = hash(`nro:${original}`);
  return String((inteiro(h) % 1900) + 10);
}
function cep(original) {
  if (!original) return original;
  const d = soDigitos(original);
  if (d.length !== 8) return original;
  // mantém a região (5 primeiros dígitos), troca o sufixo
  const h = hash(`cep:${d}`);
  const novo = `${d.slice(0, 5)}${String(inteiro(h) % 1000).padStart(3, '0')}`;
  let i = 0;
  return String(original).replace(/\d/g, () => novo[i++]);
}

// Número qualquer (RG, CNH, apólice, autenticação): mesmo formato, dígitos trocados.
function numero(original) {
  if (original === null || original === undefined || original === '') return original;
  const texto = String(original);
  const h = hash(`n:${texto}`);
  let i = 0;
  return texto.replace(/\d/g, () => String(h[(i += 1) % 32] % 10));
}

// ─── texto livre ───────────────────────────────────────────────────────────────────────

// Substituições de texto livre (obras, empresas, pessoas da origem, marca). Montadas pelo
// clonador a partir da origem; aplicadas da mais longa para a mais curta, sem diferenciar
// acento/caixa, preservando a caixa do trecho trocado.
let substituicoes = [];
function definirSubstituicoes(lista) {
  substituicoes = lista
    .filter(([o]) => normalizar(o).length >= 2)
    .map(([o, f]) => [normalizar(o), f])
    .sort((a, b) => b[0].length - a[0].length);
}

const MAPA_ACENTO = { A: '[AÁÀÂÃÄaáàâãä]', E: '[EÉÈÊËeéèêë]', I: '[IÍÌÎÏiíìîï]', O: '[OÓÒÔÕÖoóòôõö]', U: '[UÚÙÛÜuúùûü]', C: '[CÇcç]' };
function regexSemAcento(normal) {
  const corpo = normal
    .split('')
    .map((ch) => MAPA_ACENTO[ch] || (/[A-Z]/.test(ch) ? `[${ch}${ch.toLowerCase()}]` : ch === ' ' ? '\\s+' : ch.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')))
    .join('');
  return new RegExp(`(^|[^A-Za-zÀ-ÿ0-9])(${corpo})(?=$|[^A-Za-zÀ-ÿ0-9])`, 'g');
}
const cacheRegex = new Map();
function texto(valor) {
  if (valor === null || valor === undefined || typeof valor !== 'string' || !valor) return valor;
  let t = valor;
  const tn = normalizar(t);
  for (const [orig, fict] of substituicoes) {
    if (!tn.includes(orig)) continue;
    let re = cacheRegex.get(orig);
    if (!re) {
      re = regexSemAcento(orig);
      cacheRegex.set(orig, re);
    }
    re.lastIndex = 0;
    t = t.replace(re, (m, antes, trecho) => antes + aplicarCaixa(trecho, fict));
  }
  // CNPJs/CPFs formatados no meio do texto
  // (também com ponto no lugar da barra, e só dígitos com 11/14 casas)
  t = t.replace(/\b\d{2}\.\d{3}\.\d{3}[./]\d{4}-?\d{2}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{14}\b|\b\d{11}\b/g, (m) => documento(m));
  return t;
}

// JSON (objeto/array): aplica `texto` em todas as strings, recursivamente.
function json(valor, fnTexto = texto) {
  if (valor === null || valor === undefined) return valor;
  if (typeof valor === 'string') return fnTexto(valor);
  if (Array.isArray(valor)) return valor.map((v) => json(v, fnTexto));
  if (typeof valor === 'object' && !(valor instanceof Date)) {
    const out = {};
    for (const [k, v] of Object.entries(valor)) out[k] = json(v, fnTexto);
    return out;
  }
  return valor;
}

// Chave de acesso NF-e (44) / NFS-e (50): troca o documento do emitente embutido e recalcula o DV.
function chaveAcesso(chave, docOriginal) {
  if (!chave) return chave;
  let c = soDigitos(chave);
  const d = soDigitos(docOriginal);
  if (d && c.includes(d)) c = c.replace(d, documentoDigitos(d));
  else c = c.slice(0, 6) + numero(c.slice(6, 20)) + c.slice(20); // sem o documento: troca o trecho do CNPJ
  if (c.length === 44) {
    const base = c.slice(0, 43);
    let peso = 2;
    let soma = 0;
    for (let i = base.length - 1; i >= 0; i -= 1) {
      soma += Number(base[i]) * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    c = base + String(resto < 2 ? 0 : 11 - resto);
  }
  return c;
}

module.exports = {
  normalizar,
  soDigitos,
  hash,
  documento,
  documentoDigitos,
  fixarDocumento,
  formatarCnpj,
  nome,
  primeiroNome,
  fixarNome,
  nomePessoa,
  nomeEmpresa,
  ehPessoaJuridica,
  email,
  telefone,
  logradouro,
  numeroEndereco,
  cep,
  numero,
  texto,
  json,
  definirSubstituicoes,
  chaveAcesso,
  aplicarCaixa,
  cpfDe,
  cnpjDe,
};
