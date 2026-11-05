const crypto = require('crypto');
const pool = require('../../config/db');

// ---------------------------------------------------------------------------------------
// Máscara do extrato do Itaú das conexões ESPELHO da empresa modelo (conexoes_itau com
// conexao_origem_id). A consulta é real e ao vivo (contas da empresa de origem), mas nada que
// identifique a origem chega à tela: contraparte (nome, CPF/CNPJ, agência/conta), nomes dentro
// dos históricos e complementos, e os nomes da empresa de origem. Os VALORES ficam reais
// (decisão do usuário, 05/11/2026). Tudo determinístico: o mesmo nome real vira sempre o mesmo
// nome fictício, então somas por contraparte continuam fazendo sentido.
// ---------------------------------------------------------------------------------------

const PRENOMES = [
  'ANA', 'BRUNO', 'CARLA', 'DANIEL', 'EDUARDA', 'FELIPE', 'GABRIELA', 'HEITOR', 'ISABELA', 'JOAO',
  'KARINA', 'LUCAS', 'MARINA', 'NICOLAS', 'OLIVIA', 'PEDRO', 'RAFAELA', 'SAMUEL', 'TATIANA', 'VITOR',
  'BEATRIZ', 'CAIO', 'DEBORA', 'ENZO', 'FERNANDA', 'GUSTAVO', 'HELENA', 'IGOR', 'JULIA', 'LEONARDO',
  'MARCELA', 'OTAVIO', 'PAULA', 'RENATO', 'SOFIA', 'THIAGO', 'VALENTINA', 'WAGNER', 'YASMIN', 'ALICE',
];
const SOBRENOMES = [
  'ALMEIDA', 'BARROS', 'CARDOSO', 'DUARTE', 'FARIAS', 'GUIMARAES', 'MACEDO', 'MOREIRA', 'NOGUEIRA',
  'PACHECO', 'QUEIROZ', 'RIBEIRO', 'SAMPAIO', 'TEIXEIRA', 'VASCONCELOS', 'AZEVEDO', 'BRANDAO',
  'CAVALCANTI', 'FONSECA', 'LACERDA', 'MENDONCA', 'PIMENTEL', 'REZENDE', 'SIQUEIRA', 'TAVARES', 'VIANA',
];
const EMPRESA_RAIZ = [
  'AURORA', 'VERTICE', 'PRISMA', 'ATLAS', 'NOVA ERA', 'ALIANCA', 'SOLARIS', 'MERIDIANO', 'PORTO SUL',
  'TERRA FIRME', 'ESTRELA', 'VALE VERDE', 'ALTO PADRAO', 'MONTE CLARO', 'BOA VISTA', 'RIO CLARO',
];
const EMPRESA_RAMO = [
  'MATERIAIS DE CONSTRUCAO', 'SERVICOS', 'ENGENHARIA', 'COMERCIO', 'LOCACOES', 'TRANSPORTES',
  'INSTALACOES', 'CONCRETO', 'SISTEMAS', 'CONSULTORIA', 'DISTRIBUIDORA', 'METALURGICA',
];

// Vocabulário bancário que pode ficar no histórico. Qualquer outra palavra (fora números e
// datas) é tratada como parte de um nome e trocada.
const VOCABULARIO = new Set(`
  PIX TRANSF TRANSFERENCIA TED DOC TEF SISPAG FORNECEDORES FORNECEDOR SALARIO SALARIOS TAR TARIFA
  TARIFAS PACOTE SERVICOS SERVICO REND RENDIMENTO RENDIMENTOS PAGO PAGAMENTO PAGAMENTOS PAG PGTO
  APLIC APLICACAO AUT AUTOMATICA MAIS APL RES RESGATE BOLETO BOLETOS COBRANCA LIQUIDACAO DEP
  DEPOSITO DINHEIRO CHEQUE CH COMPENSADO SAQUE IOF JUROS ESTORNO ESTORN DEVOLUCAO DEV ENVIADO
  ENVIADA RECEBIDO RECEBIDA RECEB QRS QR CODE DEB DEBITO CRED CREDITO INT INTERNET MESMA
  TITULARIDADE TIT CONTA CONTAS CORRENTE CC CP POUP POUPANCA SALDO ANTERIOR DIA TOTAL DISPONIVEL
  EM DE DA DO DAS DOS E A O AO P PARA COM SEM REF REFERENTE TRIBUTOS TRIBUTO IMPOSTO IMPOSTOS
  CONCESSIONARIA CONCESSIONARIAS GUIA DARF GPS DAS FGTS INSS ISS ICMS IPTU SIMPLES NACIONAL
  CONVENIO CONVENIOS FOLHA ADIANTAMENTO RECOLHIMENTO DEBITO AUTOMATICO AGENDADO AGENDAMENTO
  CARTAO CARTOES MASTERCARD VISA ELO ANTECIPACAO RECEBIVEIS COB TIT. ITAU UNIBANCO BANCO
  CAIXA ECONOMICA FEDERAL BRADESCO SANTANDER BRASIL SICOOB SICREDI INTER NUBANK BB CEF
  CONSIGNADO EMPRESTIMO EMPREST FINANC FINANCIAMENTO PARC PARCELA PRESTACAO OPERACAO OP
  ENVIO RECEBIMENTO LIQ LIQUIDO BRUTO VALOR TAXA TAXAS MANUTENCAO CADASTRO CONTRATO SEGURO
  SEGUROS CAPITALIZACAO PREVIDENCIA INVEST INVESTIMENTO CDB LCI LCA FUNDO FUNDOS COTAS
  ALUGUEL CONDOMINIO ENERGIA AGUA TELEFONE GAS INTERNET LUZ
`.split(/\s+/).filter(Boolean));

function hash(texto) {
  return crypto.createHash('sha256').update(`hzn-itau:${texto}`).digest();
}

function escolher(lista, h, i = 0) {
  return lista[h.readUInt32BE(i % 28) % lista.length];
}

function soDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

// CPF/CNPJ fictícios com dígitos verificadores válidos (mesmo tamanho do original).
function digitoVerificador(base, pesos) {
  const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}
function cpfFicticio(h) {
  let base = '';
  for (let i = 0; i < 9; i += 1) base += String(h[i] % 10);
  const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(base + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${d1}${d2}`;
}
function cnpjFicticio(h) {
  let base = '';
  for (let i = 0; i < 8; i += 1) base += String(h[i] % 10);
  base += '0001';
  const d1 = digitoVerificador(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base}${d1}${d2}`;
}

function documentoFicticio(documento) {
  const dig = soDigitos(documento);
  if (!dig) return documento || '';
  const h = hash(`doc:${dig}`);
  // mesmo formato do original (com ou sem pontuação)
  const noFormato = (novo) => {
    let i = 0;
    return String(documento).replace(/\d/g, () => novo[i++]);
  };
  if (dig.length === 14) return noFormato(cnpjFicticio(h));
  if (dig.length === 11) return noFormato(cpfFicticio(h));
  // Documento mascarado/parcial (ex.: ***.123.456-**): mantém o formato, troca os dígitos.
  let i = 0;
  return String(documento).replace(/\d/g, () => String(h[(i += 1) % 32] % 10));
}

function ehPessoaJuridica(nome, documento) {
  if (soDigitos(documento).length === 14) return true;
  return /\b(LTDA|S\/?A|ME|EPP|EIRELI|CONDOMINIO|ASSOCIACAO|INSTITUTO|SPE|EMPREEND|CONSTRU|COMERCIO|SERVICOS)\b/.test(
    normalizar(nome)
  );
}

function nomeFicticio(nome, documento) {
  const chave = soDigitos(documento) || normalizar(nome).replace(/\s+/g, ' ').trim();
  const h = hash(`nome:${chave}`);
  if (ehPessoaJuridica(nome, documento)) {
    return `${escolher(EMPRESA_RAIZ, h, 0)} ${escolher(EMPRESA_RAMO, h, 4)} LTDA`;
  }
  return `${escolher(PRENOMES, h, 0)} ${escolher(SOBRENOMES, h, 4)} ${escolher(SOBRENOMES, h, 8)}`;
}

function digitosFicticios(valor, semente) {
  const v = String(valor || '');
  if (!v) return v;
  const h = hash(`num:${semente}:${v}`);
  let i = 0;
  return v.replace(/\d/g, () => String(h[(i += 1) % 32] % 10));
}

function escaparRegex(t) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Contexto da máscara: nomes da empresa de origem que nunca podem aparecer (razão social,
// fantasia, nomes das conexões, nomes das contas e das empresas do Sienge) → nome da empresa
// modelo. Cache de 10 min por empresa de origem.
const cacheContexto = new Map();
async function contextoMascara(conexaoOrigem, conexaoExibicao) {
  const chave = `${conexaoOrigem.empresa_id}:${conexaoExibicao.empresa_id}`;
  const emCache = cacheContexto.get(chave);
  if (emCache && emCache.expira > Date.now()) return emCache.valor;

  const { rows: emp } = await pool.query(
    'SELECT id, razao_social, nome_fantasia, cnpj FROM empresas WHERE id = ANY($1::int[])',
    [[conexaoOrigem.empresa_id, conexaoExibicao.empresa_id]]
  );
  const origem = emp.find((e) => e.id === conexaoOrigem.empresa_id) || {};
  const modelo = emp.find((e) => e.id === conexaoExibicao.empresa_id) || {};
  const nomeModelo = normalizar(modelo.nome_fantasia || modelo.razao_social || 'HZN CONSTRUTORA');

  const { rows: nomes } = await pool.query(
    `SELECT nome, razao_social, cnpj FROM conexoes_itau WHERE empresa_id = $1
     UNION ALL SELECT nome, company_name, NULL FROM contas_bancarias_sienge WHERE empresa_id = $1
     UNION ALL SELECT name, company_name, cnpj FROM centros_custo_sienge WHERE empresa_id = $1`,
    [conexaoOrigem.empresa_id]
  );
  const proibidos = new Set();
  const docs = new Set([soDigitos(origem.cnpj)]);
  const juntar = (t) => {
    const n = normalizar(t).replace(/^ITAU\s+/, '').trim();
    if (n.length >= 4) proibidos.add(n);
  };
  [origem.razao_social, origem.nome_fantasia].forEach(juntar);
  for (const r of nomes) {
    juntar(r.nome);
    juntar(r.razao_social);
    if (r.cnpj) docs.add(soDigitos(r.cnpj));
  }
  // Palavras marcantes da razão social da origem (ex.: GENESIS) também não podem aparecer soltas.
  for (const p of normalizar(origem.nome_fantasia || '').split(/\s+/)) if (p.length >= 4) proibidos.add(p);

  const valor = {
    nomeModelo,
    proibidos: [...proibidos].sort((a, b) => b.length - a.length),
    documentosOrigem: [...docs].filter((d) => d.length >= 11),
  };
  cacheContexto.set(chave, { valor, expira: Date.now() + 10 * 60 * 1000 });
  return valor;
}

// Troca, num texto livre do extrato: nomes proibidos da origem, o nome da contraparte (inteiro
// ou truncado, como o Itaú costuma mostrar no histórico), CPF/CNPJ e qualquer sequência de
// palavras fora do vocabulário bancário.
function mascararTexto(texto, ctx, contraparte) {
  if (!texto) return texto;
  let t = normalizar(texto);

  for (const p of ctx.proibidos) t = t.replace(new RegExp(`\\b${escaparRegex(p)}\\b`, 'g'), ctx.nomeModelo);

  if (contraparte?.original && contraparte?.ficticio) {
    const original = normalizar(contraparte.original).replace(/\s+/g, ' ').trim();
    const ficticio = contraparte.ficticio;
    // nome inteiro e prefixos (≥ 5 letras) — o histórico corta o nome no meio
    for (let tam = original.length; tam >= 5; tam -= 1) {
      const pedaco = original.slice(0, tam).trim();
      if (pedaco.length < 5) break;
      if (t.includes(pedaco)) {
        t = t.split(pedaco).join(ficticio.slice(0, Math.max(pedaco.length, 5)).trim());
        break;
      }
    }
  }

  // documentos (formatados ou não)
  t = t.replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, (m) => documentoFicticio(m));

  // palavras fora do vocabulário → nome fictício (corridas de palavras viram um nome só)
  const nomeModeloPalavras = new Set(ctx.nomeModelo.split(/\s+/));
  const ficticioPalavras = new Set(String(contraparte?.ficticio || '').split(/\s+/));
  t = t.replace(/[A-Z][A-Z'&.-]*(?:\s+[A-Z][A-Z'&.-]*)*/g, (corrida) => {
    const palavras = corrida.split(/\s+/);
    const saida = [];
    let nomeAtual = [];
    const fecharNome = () => {
      if (!nomeAtual.length) return;
      const h = hash(`txt:${nomeAtual.join(' ')}`);
      const troca = nomeAtual.length === 1 ? escolher(SOBRENOMES, h, 0) : `${escolher(PRENOMES, h, 0)} ${escolher(SOBRENOMES, h, 4)}`;
      saida.push(troca);
      nomeAtual = [];
    };
    for (const p of palavras) {
      const limpa = p.replace(/[.'&-]+$/g, '');
      const permitida = VOCABULARIO.has(limpa) || limpa.length <= 2 || nomeModeloPalavras.has(limpa) || ficticioPalavras.has(limpa);
      if (permitida) {
        fecharNome();
        saida.push(p);
      } else {
        nomeAtual.push(p);
      }
    }
    fecharNome();
    return saida.join(' ');
  });
  return t;
}

// Aplica a máscara num evento cru da API de extrato (mesmo formato que extratos.calculo.js lê).
function mascararEvento(e, ctx) {
  const c = e.counterpart || {};
  const original = c.name || '';
  const ficticio = original ? nomeFicticio(original, c.document) : '';
  const cp = { original, ficticio };
  const literal = e.literal
    ? {
        ...e.literal,
        complete: mascararTexto(e.literal.complete, ctx, cp),
        shortened: mascararTexto(e.literal.shortened, ctx, cp),
        complementary: mascararTexto(e.literal.complementary, ctx, cp),
      }
    : e.literal;
  const origin = e.origin ? { ...e.origin, complement: mascararTexto(e.origin.complement, ctx, cp) } : e.origin;
  const counterpart = e.counterpart
    ? {
        ...c,
        name: ficticio,
        document: c.document ? documentoFicticio(c.document) : c.document,
        agency: c.agency ? digitosFicticios(c.agency, 'ag') : c.agency,
        account: c.account ? digitosFicticios(c.account, 'cc') : c.account,
        digit: c.digit ? digitosFicticios(c.digit, `dv:${c.account}`) : c.digit,
      }
    : e.counterpart;
  return { ...e, literal, origin, counterpart };
}

function mascararSaldo(b, ctx) {
  if (!b?.literal) return b;
  return {
    ...b,
    literal: {
      ...b.literal,
      complete: mascararTexto(b.literal.complete, ctx, null),
      shortened: mascararTexto(b.literal.shortened, ctx, null),
    },
  };
}

async function mascararExtrato({ eventos, saldos }, conexaoOrigem, conexaoExibicao) {
  const ctx = await contextoMascara(conexaoOrigem, conexaoExibicao);
  return {
    eventos: eventos.map((e) => mascararEvento(e, ctx)),
    saldos: saldos.map((b) => mascararSaldo(b, ctx)),
  };
}

module.exports = { mascararExtrato, mascararTexto, mascararEvento, nomeFicticio, documentoFicticio, contextoMascara, normalizar };
