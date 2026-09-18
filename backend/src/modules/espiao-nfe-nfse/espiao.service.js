const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');
const forge = require('node-forge');
const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const { codigoUf } = require('./uf');

const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'certificados');
const NOTAS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'espiao-notas');

const AMBIENTE = 1; // 1 = Produção | 2 = Homologação
const NFE_ENDPOINT =
  AMBIENTE === 1
    ? 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
    : 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';
const NFSE_BASE_URL =
  AMBIENTE === 1
    ? 'https://adn.nfse.gov.br/contribuintes'
    : 'https://adn.producaorestrita.nfse.gov.br/contribuintes';

const NS_NFE = 'http://www.portalfiscal.inf.br/nfe';
const NS_WSDL = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe';
const NSU_ZERADO = '000000000000000';
const MAX_PAGINAS = 100;

const CONSULTA_INTERVALO_MIN_MS = 60 * 60 * 1000; // limite da Receita: 1 consulta/hora por CNPJ

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeArquivo(texto) {
  return String(texto || 'sem-nome').replace(/[\\/*?:"<>|]/g, '_');
}

// Extrai o conteúdo de uma tag tolerando prefixo de namespace (<tag>,
// <ns2:tag>, etc.) — equivalente ao wildcard "{*}" do lxml usado no script
// de referência em Python.
function extrairTagTexto(texto, tag) {
  const m = texto.match(new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${tag}>`));
  return m ? m[1].trim() : null;
}

// Mesma ideia, mas só procura a tag DENTRO de um bloco específico (ex.:
// <xNome> dentro de <dest>, não o primeiro <xNome> do documento inteiro).
function extrairTagDentroDe(texto, containerTag, innerTag) {
  const containerMatch = texto.match(
    new RegExp(`<(?:\\w+:)?${containerTag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${containerTag}>`)
  );
  if (!containerMatch) return null;
  return extrairTagTexto(containerMatch[1], innerTag);
}

// ────────────────────────────────────────────────────────────────
// Certificado → agente HTTPS com autenticação mTLS
// ────────────────────────────────────────────────────────────────

function extrairCnpjDoNome(nome) {
  const digitos = String(nome || '').match(/(\d{14})/);
  return digitos ? digitos[1] : null;
}

function carregarAgente(certificado) {
  const caminho = path.join(UPLOADS_DIR, certificado.arquivo_armazenado);
  const buffer = fs.readFileSync(caminho);
  const senha = decrypt(certificado.senha_enc);

  // node-forge (puro JS) em vez de passar o .pfx direto pro https.Agent
  // (`{ pfx, passphrase }`, que usa o parser PKCS12 nativo do Node/OpenSSL):
  // alguns certificados .pfx — sobretudo os exportados com configurações
  // "compatíveis" por ferramentas mais antigas — criptografam o conteúdo
  // do PKCS12 com RC2-40-CBC, um algoritmo que o OpenSSL 3 (usado pelo Node
  // desde a v18) desativou por padrão e rejeita o arquivo inteiro com
  // "Unsupported PKCS12 PFX data", mesmo com a senha certa. O node-forge
  // não depende do OpenSSL do sistema — é a mesma biblioteca que já lê o
  // certificado no upload (ver certificados.service.js::lerDadosPfx) — e
  // abre esses arquivos igual; aqui só extraímos a chave/certificado em
  // PEM e montamos o agente HTTPS a partir deles, funcionando pros dois
  // formatos de PKCS12 (novo e legado).
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(buffer.toString('binary')));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag =
    (keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [])[0] ||
    (p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])[0];
  if (!keyBag) {
    throw new Error('Chave privada não encontrada no certificado.');
  }
  const keyPem = forge.pki.privateKeyToPem(keyBag.key);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certsPem = (certBags[forge.pki.oids.certBag] || []).map((bag) => forge.pki.certificateToPem(bag.cert));
  if (certsPem.length === 0) {
    throw new Error('Certificado não encontrado dentro do arquivo .pfx.');
  }

  // Todos os certificados (titular + cadeia intermediária, quando existe)
  // vão concatenados em `cert` — é a cadeia que o cliente APRESENTA no
  // handshake mTLS. NÃO usar `ca` aqui: essa opção é pra validar o
  // certificado do SERVIDOR (SEFAZ/ADN), e se preenchida com a cadeia do
  // certificado do CLIENTE substitui a lista de CAs confiáveis padrão do
  // Node por ela — quebrando a verificação do lado do servidor com
  // "unable to get local issuer certificate" (bug encontrado testando
  // este fix). Sem `ca`, o Node usa a lista de raízes confiáveis padrão
  // pra validar o servidor, exatamente como fazia antes com `{ pfx }`.
  const certChainPem = certsPem.join('\n');

  return new https.Agent({ key: keyPem, cert: certChainPem, keepAlive: false });
}

function httpsRequest({ method, url, agent, headers, body, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        method,
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        port: 443,
        agent,
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Tempo limite excedido.')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ────────────────────────────────────────────────────────────────
// NF-e — DistribuiçãoDFe (SOAP 1.2 + mTLS)
// ────────────────────────────────────────────────────────────────

function montarEnvelopeNfe(cnpj, cUFAutor, ultNsu) {
  const distDFeInt = [
    `<distDFeInt xmlns="${NS_NFE}" versao="1.01">`,
    `<tpAmb>${AMBIENTE}</tpAmb>`,
    `<cUFAutor>${cUFAutor}</cUFAutor>`,
    `<CNPJ>${cnpj}</CNPJ>`,
    `<distNSU><ultNSU>${String(ultNsu).padStart(15, '0')}</ultNSU></distNSU>`,
    `</distDFeInt>`,
  ].join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">',
    '<soap12:Body>',
    `<nfeDistDFeInteresse xmlns="${NS_WSDL}"><nfeDadosMsg>${distDFeInt}</nfeDadosMsg></nfeDistDFeInteresse>`,
    '</soap12:Body>',
    '</soap12:Envelope>',
  ].join('');
}

function extrairTag(xmlText, tag) {
  const m = xmlText.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : '';
}

function parsearRespostaNfe(xmlText) {
  const cStat = extrairTag(xmlText, 'cStat');
  const xMotivo = extrairTag(xmlText, 'xMotivo');
  const maxNsu = extrairTag(xmlText, 'ultNSU');

  const docs = [];
  const regex = /<docZip([^>]*)>([\s\S]*?)<\/docZip>/g;
  let match;
  while ((match = regex.exec(xmlText))) {
    const atributos = match[1];
    const nsuMatch = atributos.match(/NSU="([^"]*)"/);
    const schemaMatch = atributos.match(/schema="([^"]*)"/);
    docs.push({
      nsu: nsuMatch ? nsuMatch[1] : '',
      schema: schemaMatch ? schemaMatch[1] : '',
      conteudo: match[2].trim(),
    });
  }

  return { cStat, xMotivo, docs, maxNsu };
}

async function consultarNFe(agent, cnpj, cUFAutor, ultNsuInicial) {
  const encontradas = [];
  let ultNsu = ultNsuInicial || NSU_ZERADO;
  let paginas = 0;
  let bloqueado = false;
  let mensagem = '';

  while (paginas < MAX_PAGINAS) {
    paginas++;
    const envelope = montarEnvelopeNfe(cnpj, cUFAutor, ultNsu);

    let resposta;
    try {
      resposta = await httpsRequest({
        method: 'POST',
        url: NFE_ENDPOINT,
        agent,
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8;',
          Accept: 'application/soap+xml; charset=utf-8;',
        },
        body: envelope,
      });
    } catch (err) {
      mensagem = `Erro de rede na NF-e: ${err.message}`;
      console.error(`[espiao-nfe] cnpj=${cnpj} pagina=${paginas} erro de rede: code=${err.code} message=${err.message}`);
      break;
    }

    const xmlText = resposta.body.toString('utf-8');
    const { cStat, xMotivo, docs, maxNsu } = parsearRespostaNfe(xmlText);
    mensagem = xMotivo || mensagem;
    console.log(`[espiao-nfe] cnpj=${cnpj} pagina=${paginas} cStat=${cStat} xMotivo="${xMotivo}" docs=${docs.length} maxNsu=${maxNsu}`);

    for (const doc of docs) {
      try {
        const raw = zlib.gunzipSync(Buffer.from(doc.conteudo, 'base64'));
        encontradas.push({ raw, nsu: doc.nsu, schema: doc.schema });
      } catch {
        // documento não veio corretamente compactado — ignora esse item
      }
    }

    if (cStat === '656') {
      bloqueado = true;
      mensagem = 'Consumo indevido detectado pela SEFAZ — aguarde 1 hora antes de tentar novamente.';
      break;
    }

    if (!maxNsu || maxNsu <= ultNsu) break;
    ultNsu = maxNsu;
    if (cStat === '137') break;
  }

  return { notas: encontradas, ultNsu, bloqueado, mensagem };
}

function extrairChaveNfe(xmlBuffer) {
  const texto = xmlBuffer.toString('utf-8');
  const idMatch = texto.match(/Id="NFe(\d{44})"/);
  if (idMatch) return idMatch[1];
  const chNFe = extrairTagTexto(texto, 'chNFe');
  return chNFe && /^\d{44}$/.test(chNFe) ? chNFe : null;
}

// resNFe (resumo) tem <resNFe> como elemento raiz do documento — sem os
// itens/produtos (<det>) que só existem no documento completo
// (procNFe/nfeProc). Usado pra marcar apenas_resumo em salvarNota; essas
// notas ficam escondidas de toda listagem até a SEFAZ eventualmente
// distribuir a versão completa da mesma chave (ver comentário na coluna,
// em database/schema.sql).
function ehResumoNfe(xmlBuffer) {
  const texto = xmlBuffer.toString('utf-8');
  return /<resNFe[ >]/.test(texto);
}

function extrairEmitenteNfe(xmlBuffer) {
  const texto = xmlBuffer.toString('utf-8');
  // procNFe/NFe completa: <emit><xNome>. resNFe (resumo): <xNome> solto,
  // sem wrapper <emit> — cai no fallback do primeiro <xNome> do documento.
  return extrairTagDentroDe(texto, 'emit', 'xNome') || extrairTagTexto(texto, 'xNome');
}

function extrairDestinatarioNfe(xmlBuffer) {
  const texto = xmlBuffer.toString('utf-8');
  return extrairTagDentroDe(texto, 'dest', 'xNome');
}

function extrairDataEmissaoNfe(xmlBuffer) {
  const texto = xmlBuffer.toString('utf-8');
  return extrairTagTexto(texto, 'dhEmi') || extrairTagTexto(texto, 'dEmi');
}

// resNFe (resumo) não traz <nNF>/<serie> soltos — só o procNFe (nota
// completa) tem esses campos dentro de <ide>. Quando faltam, dá pra derivar
// os dois direto da própria chave de 44 dígitos, que segue um layout de
// posições fixas: UF(2) AAMM(4) CNPJ(14) mod(2) série(3) número(9) tpEmis(1)
// cNF(8) cDV(1) — testado contra chave real: posições 22-25 = série,
// 25-34 = número.
function extrairNumeroSerieNfe(xmlBuffer, chave) {
  const texto = xmlBuffer.toString('utf-8');
  let numero = extrairTagTexto(texto, 'nNF');
  let serie = extrairTagTexto(texto, 'serie');
  if ((!numero || !serie) && chave && /^\d{44}$/.test(chave)) {
    if (!serie) serie = String(Number(chave.slice(22, 25)));
    if (!numero) numero = String(Number(chave.slice(25, 34)));
  }
  return { numero, serie };
}

// distDFeInt devolve tanto a NF-e em si (resNFe/procNFe) quanto eventos
// (resEvento/procEventoNFe — cancelamento, carta de correção, etc.) que só
// referenciam uma NF-e já existente via <chNFe>. Evento não é uma nota nova;
// é uma mudança de situação de uma nota que (talvez) já temos.
// Existem duas variantes de evento: resEvento (resumo, usa <xEvento>) e
// procEventoNFe (evento completo/processado, usa <descEvento> dentro de
// <detEvento>) — busca no texto inteiro, não numa janela de bytes fixa (o
// XML real vem com <?xml ...?> na frente), e tolera prefixo de namespace.
function ehEventoNfe(xmlBuffer) {
  const texto = xmlBuffer.toString('utf-8');
  return extrairTagTexto(texto, 'xEvento') !== null || extrairTagTexto(texto, 'descEvento') !== null;
}

function extrairEventoNfe(xmlBuffer) {
  const texto = xmlBuffer.toString('utf-8');
  return {
    chaveReferenciada: extrairTagTexto(texto, 'chNFe'),
    descricao: extrairTagTexto(texto, 'xEvento') || extrairTagTexto(texto, 'descEvento') || 'Evento',
    // <dhEvento> no evento completo (procEventoNFe), <dhRecbto> no resumo
    // (resEvento) — data/hora real do evento na SEFAZ, não a data em que o
    // Espião consultou (usada no histórico de etapas da nota).
    dataEvento: extrairTagTexto(texto, 'dhEvento') || extrairTagTexto(texto, 'dhRecbto'),
  };
}

// ────────────────────────────────────────────────────────────────
// NFS-e — ADN nacional (REST + mTLS, polling por NSU)
// ────────────────────────────────────────────────────────────────

async function consultarNFSe(agent, ultNsuInicial) {
  const encontradas = [];
  let ultNsu = Number(ultNsuInicial) || 0;
  let paginas = 0;
  let mensagem = '';

  while (paginas < MAX_PAGINAS) {
    paginas++;
    const url = `${NFSE_BASE_URL}/DFe/${ultNsu}`;

    let resposta = null;
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      try {
        resposta = await httpsRequest({ method: 'GET', url, agent, headers: { Accept: 'application/json' } });
      } catch (err) {
        mensagem = `Erro de rede na NFS-e: ${err.message}`;
        console.error(`[espiao-nfse] pagina=${paginas} tentativa=${tentativa} erro de rede: code=${err.code} message=${err.message}`);
        resposta = null;
        break;
      }

      if (resposta.statusCode !== 429) break;

      const retryAfter = Number(resposta.headers['retry-after']);
      const espera = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** tentativa * 1000;
      await sleep(espera);
    }

    if (!resposta) break;
    console.log(`[espiao-nfse] pagina=${paginas} url=${url} status=${resposta.statusCode}`);
    if (resposta.statusCode === 204 || resposta.statusCode === 404) break;
    if (resposta.statusCode >= 400) {
      mensagem = `ADN retornou HTTP ${resposta.statusCode}.`;
      break;
    }

    let payload;
    try {
      payload = JSON.parse(resposta.body.toString('utf-8'));
    } catch {
      mensagem = 'Resposta da ADN não é um JSON válido.';
      break;
    }

    const lote = payload.LoteDFe || payload.loteDFe || payload.lote || payload.documentos || [];
    console.log(`[espiao-nfse] pagina=${paginas} loteSize=${lote.length} payloadKeys=${Object.keys(payload).join(',')}`);
    if (!lote.length) break;

    let maxNsuLote = ultNsu;
    for (const doc of lote) {
      const nsuDoc = Number(doc.NSU ?? doc.nsu ?? 0);
      if (nsuDoc > maxNsuLote) maxNsuLote = nsuDoc;

      const arquivoB64 = doc.ArquivoXml || doc.arquivoXml || doc.xml;
      if (arquivoB64) {
        try {
          const raw = zlib.gunzipSync(Buffer.from(arquivoB64, 'base64'));
          encontradas.push({ raw, nsu: nsuDoc });
        } catch {
          // documento não veio corretamente compactado — ignora esse item
        }
      }
    }

    const proximo = Number(payload.UltimoNSU ?? payload.ultimoNSU ?? payload.maxNSU ?? maxNsuLote);
    if (!Number.isFinite(proximo) || proximo <= ultNsu) break;
    ultNsu = proximo;
    await sleep(1000);
  }

  return { notas: encontradas, ultNsu, mensagem };
}

// O feed da ADN traz tanto a NFS-e em si (fatura, com Id="NFS<chave>" no
// <infNFSe> — o prefixo real é "NFS", SEM o "e" no final, diferente do que a
// convenção da NF-e ("NFe<chave>") sugeriria) quanto eventos (ex.:
// cancelamento) que só referenciam uma NFS-e já existente via <chNFSe>
// solto, sem Id="NFS.... Evento não é uma nota nova — é uma mudança de
// situação de uma nota que (talvez) já temos. Busca no texto inteiro (não
// numa janela de bytes fixa — o XML real vem com <?xml ...?> na frente) e
// não ancora no nome da tag (pode vir com prefixo de namespace).
function ehEventoNfse(xmlBuffer) {
  const texto = xmlBuffer.toString('utf-8');
  return extrairTagTexto(texto, 'chNFSe') !== null && !/Id="NFSe?\d/.test(texto);
}

function extrairInfoNfse(xmlBuffer) {
  const texto = xmlBuffer.toString('utf-8');
  const idInvoiceMatch = texto.match(/Id="NFSe?(\d+)"/);
  if (!idInvoiceMatch) {
    return { chave: null, emissor: null, destinatario: null, dataEmissao: null, numero: null, serie: null };
  }

  return {
    chave: idInvoiceMatch[1],
    // <emit> = prestador do serviço (emissor); <toma> = tomador (destinatário).
    emissor: extrairTagDentroDe(texto, 'emit', 'xNome') || extrairTagTexto(texto, 'xNome'),
    destinatario: extrairTagDentroDe(texto, 'toma', 'xNome'),
    dataEmissao: extrairTagTexto(texto, 'dhEmi'),
    numero: extrairTagTexto(texto, 'nNFSe'),
    // A NFS-e nacional não tem o conceito de série da nota em si — o campo
    // <serie> que existe vem da DPS (declaração que originou a nota).
    serie: extrairTagDentroDe(texto, 'infDPS', 'serie') || extrairTagTexto(texto, 'serie'),
  };
}

function extrairEventoNfse(xmlBuffer) {
  const texto = xmlBuffer.toString('utf-8');
  return {
    chaveReferenciada: extrairTagTexto(texto, 'chNFSe'),
    descricao: extrairTagTexto(texto, 'xDesc') || 'Evento',
    // Data/hora real do evento (ver comentário equivalente em
    // extrairEventoNfe) — fica null se a tag não existir nessa variante.
    dataEvento: extrairTagTexto(texto, 'dhEvento'),
  };
}

// ────────────────────────────────────────────────────────────────
// Persistência das notas encontradas
// ────────────────────────────────────────────────────────────────

async function salvarNota(
  empresaId,
  certificadoId,
  tipo,
  { raw, chave, emissor, destinatario, dataEmissao, numero, serie, apenasResumo = false }
) {
  if (!chave) return false;

  const empresaDir = path.join(NOTAS_DIR, String(empresaId));
  fs.mkdirSync(empresaDir, { recursive: true });
  const arquivoArmazenado = path.join(String(empresaId), `${sanitizeArquivo(chave)}.xml`);
  fs.writeFileSync(path.join(NOTAS_DIR, arquivoArmazenado), raw);

  // apenas_resumo, como arquivo_armazenado, é sobrescrito sem COALESCE —
  // precisa poder virar FALSE quando a versão completa da mesma chave
  // chegar depois (diferente de emissor/destinatario/etc., que só
  // preenchem o que ainda está em branco).
  // `(xmax = 0)` é o jeito padrão do Postgres de saber, no retorno de um
  // INSERT ... ON CONFLICT, se a linha foi realmente inserida agora
  // (xmax = 0) ou já existia e só foi atualizada (xmax preenchido) — usado
  // abaixo pra criar a 1ª etapa ("Emitida") do histórico só na primeira
  // vez que essa chave aparece, nunca de novo quando um resNFe é
  // substituído pela versão completa da mesma nota.
  const { rows } = await pool.query(
    `INSERT INTO espiao_notas (empresa_id, certificado_id, tipo, chave_acesso, emissor, destinatario, data_emissao, numero_nota, serie_nota, arquivo_armazenado, apenas_resumo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (empresa_id, chave_acesso) DO UPDATE SET
       emissor = COALESCE(espiao_notas.emissor, EXCLUDED.emissor),
       destinatario = COALESCE(espiao_notas.destinatario, EXCLUDED.destinatario),
       data_emissao = COALESCE(espiao_notas.data_emissao, EXCLUDED.data_emissao),
       numero_nota = COALESCE(espiao_notas.numero_nota, EXCLUDED.numero_nota),
       serie_nota = COALESCE(espiao_notas.serie_nota, EXCLUDED.serie_nota),
       arquivo_armazenado = EXCLUDED.arquivo_armazenado,
       apenas_resumo = EXCLUDED.apenas_resumo
     RETURNING id, (xmax = 0) AS inserted`,
    [empresaId, certificadoId, tipo, chave, emissor, destinatario, dataEmissao, numero, serie, arquivoArmazenado, apenasResumo]
  );

  const notaSalva = rows[0];
  if (notaSalva?.inserted) {
    await pool.query(
      `INSERT INTO espiao_notas_eventos (nota_id, descricao, categoria, data_evento)
       VALUES ($1, 'Emitida', 'emitida', $2)`,
      [notaSalva.id, dataEmissao]
    );
  }
  return Boolean(notaSalva);
}

// Documento que não bateu nem com "é fatura" nem com "é evento" — salva o
// XML cru pra dar pra inspecionar depois (em vez de só contar e descartar),
// já que uma consulta real não pode ser repetida à vontade (limite de
// 1/hora da Receita por CNPJ).
function salvarDiagnostico(empresaId, tipo, raw) {
  try {
    const dir = path.join(NOTAS_DIR, '_diagnostico', String(empresaId));
    fs.mkdirSync(dir, { recursive: true });
    const nome = `${tipo}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.xml`;
    fs.writeFileSync(path.join(dir, nome), raw);
  } catch {
    // diagnóstico é best-effort — nunca deve derrubar a consulta principal
  }
}

// 3 categorias de situação (pedido do usuário): 'emitida' (nenhum evento
// ainda), 'cancelada' (a nota perdeu o valor fiscal) e 'complementada'
// (qualquer outro evento — autorização de CT-e, registro de passagem,
// comprovante de entrega etc.). A distinção não é só "contém a palavra
// cancelamento": "Cancelamento Comprovante de Entrega do CT-e" cancela um
// COMPROVANTE (documento de transporte), não a nota em si, então fica
// complementada — daí o `!includes('comprovante')`. Mesma lógica cobre
// "MDF-e cancelado" (cancela o manifesto, não a nota): não começa com
// "cancelamento", então nunca cai aqui.
function classificarEventoSituacao(descricao) {
  const texto = String(descricao || '').trim().toLowerCase();
  if (texto.startsWith('cancelamento') && !texto.includes('comprovante')) return 'cancelada';
  return 'complementada';
}

// Evento (cancelamento, correção, etc.) não é uma nota nova — é uma etapa a
// mais no histórico da nota já cadastrada com a mesma chave (histórico
// completo em espiao_notas_eventos; espiao_notas.situacao/situacao_categoria
// sempre refletem só a ÚLTIMA etapa, pra listar/filtrar sem precisar juntar
// com o histórico). Se a nota original ainda não foi capturada, o evento é
// descartado (nada pra atualizar). Cancelamento é definitivo pelas regras da
// SEFAZ (não existe evento de "descancelar" uma NF-e/NFS-e) — por isso, uma
// vez que a categoria vira 'cancelada', nenhum evento posterior muda isso de
// volta, mesmo que venha um evento "neutro" depois (ex.: passagem em posto
// fiscal registrada depois do cancelamento).
async function registrarEvento(empresaId, tipo, chaveReferenciada, descricao, dataEvento) {
  if (!chaveReferenciada) return false;

  const { rows } = await pool.query(
    `SELECT id, situacao_categoria FROM espiao_notas
     WHERE empresa_id = $1 AND tipo = $2 AND chave_acesso = $3`,
    [empresaId, tipo, chaveReferenciada]
  );
  const nota = rows[0];
  if (!nota) return false;

  const categoriaDoEvento = classificarEventoSituacao(descricao);
  const categoriaFinal = nota.situacao_categoria === 'cancelada' ? 'cancelada' : categoriaDoEvento;

  await pool.query(`UPDATE espiao_notas SET situacao = $1, situacao_categoria = $2 WHERE id = $3`, [
    descricao,
    categoriaFinal,
    nota.id,
  ]);
  await pool.query(
    `INSERT INTO espiao_notas_eventos (nota_id, descricao, categoria, data_evento)
     VALUES ($1, $2, $3, $4)`,
    [nota.id, descricao, categoriaDoEvento, dataEvento || null]
  );
  return true;
}

// ────────────────────────────────────────────────────────────────
// Orquestração
// ────────────────────────────────────────────────────────────────

async function getEstado(certificadoId) {
  const { rows } = await pool.query(
    'SELECT * FROM espiao_certificado_estado WHERE certificado_id = $1',
    [certificadoId]
  );
  return rows[0] || null;
}

async function salvarEstado(certificadoId, { cnpj, ultimoNsuNfe, ultimoNsuNfse }) {
  await pool.query(
    `INSERT INTO espiao_certificado_estado (certificado_id, cnpj, ultima_consulta_em, ultimo_nsu_nfe, ultimo_nsu_nfse)
     VALUES ($1, $2, NOW(), $3, $4)
     ON CONFLICT (certificado_id) DO UPDATE SET
       cnpj = EXCLUDED.cnpj,
       ultima_consulta_em = NOW(),
       ultimo_nsu_nfe = EXCLUDED.ultimo_nsu_nfe,
       ultimo_nsu_nfse = EXCLUDED.ultimo_nsu_nfse`,
    [certificadoId, cnpj, ultimoNsuNfe, ultimoNsuNfse]
  );
}

async function consultarPorCertificado(empresaId, certificado, cUFAutor) {
  const cnpj = extrairCnpjDoNome(certificado.nome);
  if (!cnpj) {
    return { certificadoId: certificado.id, ok: false, mensagem: 'Não foi possível identificar o CNPJ pelo nome do certificado.' };
  }

  const estado = await getEstado(certificado.id);
  if (estado?.ultima_consulta_em) {
    const decorrido = Date.now() - new Date(estado.ultima_consulta_em).getTime();
    if (decorrido < CONSULTA_INTERVALO_MIN_MS) {
      const restamMin = Math.ceil((CONSULTA_INTERVALO_MIN_MS - decorrido) / 60000);
      return {
        certificadoId: certificado.id,
        ok: false,
        mensagem: `Aguarde mais ${restamMin} min (limite de 1 consulta/hora por CNPJ da Receita Federal).`,
      };
    }
  }

  let agent;
  try {
    agent = carregarAgente(certificado);
  } catch (err) {
    return { certificadoId: certificado.id, ok: false, mensagem: `Falha ao carregar o certificado: ${err.message}` };
  }

  const ultNsuNfe = estado?.ultimo_nsu_nfe || NSU_ZERADO;
  const ultNsuNfse = estado?.ultimo_nsu_nfse || 0;

  // Log de diagnóstico — não persiste em lugar nenhum (o cStat/xMotivo da
  // SEFAZ e o status HTTP da ADN nunca chegavam a ser vistos por ninguém
  // quando a consulta roda pelo agendador, em segundo plano, sem toast).
  // Só aparece em `docker logs`.
  console.log(`[espiao] consultando cnpj=${cnpj} certificado=${certificado.id} ultNsuNfe=${ultNsuNfe} ultNsuNfse=${ultNsuNfse}`);

  const resultadoNfe = await consultarNFe(agent, cnpj, cUFAutor, ultNsuNfe);
  let salvasNfe = 0;
  let naoReconhecidosNfe = 0;
  for (const doc of resultadoNfe.notas) {
    if (ehEventoNfe(doc.raw)) {
      const { chaveReferenciada, descricao, dataEvento } = extrairEventoNfe(doc.raw);
      await registrarEvento(empresaId, 'NFE', chaveReferenciada, descricao, dataEvento);
      continue;
    }
    const chave = extrairChaveNfe(doc.raw);
    if (!chave) {
      naoReconhecidosNfe++;
      salvarDiagnostico(empresaId, 'NFE', doc.raw);
      continue;
    }
    const { numero, serie } = extrairNumeroSerieNfe(doc.raw, chave);
    const salvou = await salvarNota(empresaId, certificado.id, 'NFE', {
      raw: doc.raw,
      chave,
      emissor: extrairEmitenteNfe(doc.raw),
      destinatario: extrairDestinatarioNfe(doc.raw),
      dataEmissao: extrairDataEmissaoNfe(doc.raw),
      numero,
      serie,
      apenasResumo: ehResumoNfe(doc.raw),
    });
    if (salvou) salvasNfe++;
  }

  const resultadoNfse = await consultarNFSe(agent, ultNsuNfse);
  let salvasNfse = 0;
  let naoReconhecidosNfse = 0;
  for (const doc of resultadoNfse.notas) {
    if (ehEventoNfse(doc.raw)) {
      const { chaveReferenciada, descricao, dataEvento } = extrairEventoNfse(doc.raw);
      await registrarEvento(empresaId, 'NFSE', chaveReferenciada, descricao, dataEvento);
      continue;
    }
    const info = extrairInfoNfse(doc.raw);
    if (!info.chave) {
      naoReconhecidosNfse++;
      salvarDiagnostico(empresaId, 'NFSE', doc.raw);
      continue;
    }
    const salvou = await salvarNota(empresaId, certificado.id, 'NFSE', { raw: doc.raw, ...info });
    if (salvou) salvasNfse++;
  }

  const avisosFormato = [];
  if (naoReconhecidosNfe > 0) {
    avisosFormato.push(`${naoReconhecidosNfe} documento(s) de NF-e em formato não reconhecido`);
  }
  if (naoReconhecidosNfse > 0) {
    avisosFormato.push(`${naoReconhecidosNfse} documento(s) de NFS-e em formato não reconhecido`);
  }

  await salvarEstado(certificado.id, {
    cnpj,
    ultimoNsuNfe: resultadoNfe.ultNsu,
    ultimoNsuNfse: resultadoNfse.ultNsu,
  });

  const mensagemBase = resultadoNfe.bloqueado
    ? resultadoNfe.mensagem
    : resultadoNfe.mensagem || resultadoNfse.mensagem || 'Consulta concluída.';

  return {
    certificadoId: certificado.id,
    cnpj,
    ok: !resultadoNfe.bloqueado,
    notasProdutosEncontradas: resultadoNfe.notas.length,
    notasProdutosSalvas: salvasNfe,
    notasServicosEncontradas: resultadoNfse.notas.length,
    notasServicosSalvas: salvasNfse,
    mensagem: avisosFormato.length > 0 ? `${mensagemBase} (${avisosFormato.join('; ')})` : mensagemBase,
  };
}

async function consultarEmpresa(empresaId) {
  const { rows: empresaRows } = await pool.query('SELECT id, estado FROM empresas WHERE id = $1', [empresaId]);
  const empresa = empresaRows[0];
  if (!empresa) {
    const err = new Error('Empresa não encontrada.');
    err.status = 404;
    err.expose = true;
    throw err;
  }

  const { rows: certificados } = await pool.query(
    `SELECT * FROM certificados_digitais
     WHERE empresa_id = $1 AND (validade_ate IS NULL OR validade_ate >= CURRENT_DATE)
     ORDER BY nome ASC`,
    [empresaId]
  );

  if (certificados.length === 0) {
    const err = new Error('Esta empresa não tem nenhum certificado digital válido cadastrado.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const cUFAutor = codigoUf(empresa.estado);
  const resultados = [];
  for (const certificado of certificados) {
    const resultado = await consultarPorCertificado(empresaId, certificado, cUFAutor);
    resultados.push({ ...resultado, nomeCertificado: certificado.nome });
  }

  return { empresa_id: empresaId, resultados };
}

async function consultarCertificadoAvulso(certificadoId) {
  const { rows: certRows } = await pool.query(
    'SELECT * FROM certificados_digitais WHERE id = $1',
    [certificadoId]
  );
  const certificado = certRows[0];
  if (!certificado) {
    const err = new Error('Certificado não encontrado.');
    err.status = 404;
    err.expose = true;
    throw err;
  }

  const { rows: empresaRows } = await pool.query('SELECT estado FROM empresas WHERE id = $1', [
    certificado.empresa_id,
  ]);
  const cUFAutor = codigoUf(empresaRows[0]?.estado);

  const resultado = await consultarPorCertificado(certificado.empresa_id, certificado, cUFAutor);
  return { ...resultado, nomeCertificado: certificado.nome };
}

// ────────────────────────────────────────────────────────────────
// Leitura para a tela
// ────────────────────────────────────────────────────────────────

// Todos os certificados da empresa (válidos e vencidos) — vencidos continuam
// aparecendo, só não podem ser usados para uma consulta nova, e mesmo assim
// mantêm o histórico de notas já encontradas com eles.
async function listCertificadosComEstado(empresaId) {
  // Contagens totais (não filtradas por data/busca) pra mostrar direto no
  // card, sem precisar expandir — inclui as inativas separadamente pra
  // servir tanto o modo "notas ativas" quanto "notas inativadas".
  const { rows } = await pool.query(
    `SELECT c.id, c.nome, c.validade_ate, ce.ultima_consulta_em,
            COUNT(n.id) FILTER (WHERE n.tipo = 'NFE' AND n.inativa = FALSE)::int AS total_nfe,
            COUNT(n.id) FILTER (WHERE n.tipo = 'NFSE' AND n.inativa = FALSE)::int AS total_nfse,
            COUNT(n.id) FILTER (WHERE n.tipo = 'NFE' AND n.inativa = TRUE)::int AS total_nfe_inativas,
            COUNT(n.id) FILTER (WHERE n.tipo = 'NFSE' AND n.inativa = TRUE)::int AS total_nfse_inativas
     FROM certificados_digitais c
     LEFT JOIN espiao_certificado_estado ce ON ce.certificado_id = c.id
     LEFT JOIN espiao_notas n ON n.certificado_id = c.id
     WHERE c.empresa_id = $1
     GROUP BY c.id, c.nome, c.validade_ate, ce.ultima_consulta_em
     ORDER BY c.nome ASC`,
    [empresaId]
  );
  return rows;
}

async function listEmpresasComStatus() {
  const { rows } = await pool.query(
    `SELECT e.id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS razao_social, e.cnpj,
            COUNT(c.id)::int AS total_certificados,
            MAX(ce.ultima_consulta_em) AS ultima_consulta_em
     FROM empresas e
     JOIN certificados_digitais c ON c.empresa_id = e.id
     LEFT JOIN espiao_certificado_estado ce ON ce.certificado_id = c.id
     GROUP BY e.id, e.nome_fantasia, e.razao_social, e.cnpj
     ORDER BY e.razao_social ASC`
  );
  return rows;
}

function montarFiltrosNotas(params, where, { dataInicio, dataFim, chave, numero, emissor, destinatario }, prefixo = '') {
  if (dataInicio) {
    params.push(dataInicio);
    where += ` AND ${prefixo}data_emissao >= $${params.length}`;
  }
  if (dataFim) {
    params.push(`${dataFim} 23:59:59`);
    where += ` AND ${prefixo}data_emissao <= $${params.length}`;
  }
  if (chave) {
    params.push(`%${chave}%`);
    where += ` AND ${prefixo}chave_acesso ILIKE $${params.length}`;
  }
  if (numero) {
    params.push(`%${numero}%`);
    where += ` AND ${prefixo}numero_nota ILIKE $${params.length}`;
  }
  if (emissor) {
    params.push(`%${emissor}%`);
    where += ` AND ${prefixo}emissor ILIKE $${params.length}`;
  }
  if (destinatario) {
    params.push(`%${destinatario}%`);
    where += ` AND ${prefixo}destinatario ILIKE $${params.length}`;
  }
  return where;
}

async function listNotas(empresaId, filtros) {
  const params = [empresaId];
  // apenas_resumo = FALSE: nota só-resumo (resNFe) não tem valor de
  // auditoria nenhum (sem itens) — fica escondida até a SEFAZ distribuir a
  // versão completa da mesma chave (ver ehResumoNfe/salvarNota).
  const where = montarFiltrosNotas(params, 'empresa_id = $1 AND inativa = FALSE AND apenas_resumo = FALSE', filtros);

  const { rows } = await pool.query(
    `SELECT id, tipo, chave_acesso, numero_nota, serie_nota, emissor, destinatario, data_emissao, situacao, situacao_categoria, ciente_em
     FROM espiao_notas
     WHERE ${where}
     ORDER BY data_emissao DESC`,
    params
  );

  return {
    produtos: rows.filter((r) => r.tipo === 'NFE'),
    servicos: rows.filter((r) => r.tipo === 'NFSE'),
  };
}

async function listNotasPorCertificado(certificadoId, filtros) {
  const params = [certificadoId];
  const where = montarFiltrosNotas(
    params,
    'certificado_id = $1 AND inativa = FALSE AND apenas_resumo = FALSE',
    filtros
  );

  const { rows } = await pool.query(
    `SELECT id, tipo, chave_acesso, numero_nota, serie_nota, emissor, destinatario, data_emissao, situacao, situacao_categoria, ciente_em
     FROM espiao_notas
     WHERE ${where}
     ORDER BY data_emissao DESC`,
    params
  );

  return {
    produtos: rows.filter((r) => r.tipo === 'NFE'),
    servicos: rows.filter((r) => r.tipo === 'NFSE'),
  };
}

// ────────────────────────────────────────────────────────────────
// Inativação manual de notas
// ────────────────────────────────────────────────────────────────

// Marca as notas escolhidas como inativas, registrando quem fez e por quê.
// A partir daqui elas somem da listagem comum (listNotas/listNotasPorCertificado
// já filtram "inativa = FALSE") e só aparecem em listNotasInativadas.
async function inativarNotas(notaIds, motivo, usuarioId) {
  const { rows } = await pool.query(
    `UPDATE espiao_notas
     SET inativa = TRUE, inativada_por = $1, inativada_em = NOW(), motivo_inativacao = $2
     WHERE id = ANY($3::int[]) AND inativa = FALSE
     RETURNING id`,
    [usuarioId, motivo, notaIds]
  );
  return rows.map((r) => r.id);
}

// Desfaz a inativação — a nota volta a aparecer na tela comum. `destino`
// escolhe pra qual aba ela volta: 'novas' zera ciente_em, 'cientes' marca
// ciente_em = NOW() na hora — não herda o que a nota tinha ANTES de ser
// inativada, é uma escolha explícita de quem reativa (ver TABS_NOTAS no
// frontend).
async function reativarNotas(notaIds, destino, usuarioId) {
  const marcarCiente = destino === 'cientes';
  const { rows } = await pool.query(
    `UPDATE espiao_notas
     SET inativa = FALSE, inativada_por = NULL, inativada_em = NULL, motivo_inativacao = NULL,
         ciente_por = ${marcarCiente ? '$2' : 'NULL'}, ciente_em = ${marcarCiente ? 'NOW()' : 'NULL'}
     WHERE id = ANY($1::int[]) AND inativa = TRUE
     RETURNING id, ciente_em`,
    marcarCiente ? [notaIds, usuarioId] : [notaIds]
  );
  return rows;
}

// Marca as notas escolhidas como cientes — sai da aba "Novas" e passa pra
// aba "Cientes" (ver TABS_NOTAS no frontend). Diferente de inativar: não
// tira a nota da tela comum, só muda em qual aba ela aparece. Idempotente
// de propósito (sem `AND ciente_em IS NULL`) — declarar ciência de novo
// numa nota já ciente só atualiza o carimbo, sem erro.
async function declararCiencia(notaIds, usuarioId) {
  const { rows } = await pool.query(
    `UPDATE espiao_notas
     SET ciente_por = $1, ciente_em = NOW()
     WHERE id = ANY($2::int[]) AND inativa = FALSE
     RETURNING id, ciente_em`,
    [usuarioId, notaIds]
  );
  return rows;
}

// Desfaz a ciência — a nota volta da aba "Cientes" pra "Novas". Simétrico a
// declararCiencia (mesma ideia, ao contrário).
async function desmarcarCiencia(notaIds) {
  const { rows } = await pool.query(
    `UPDATE espiao_notas
     SET ciente_por = NULL, ciente_em = NULL
     WHERE id = ANY($1::int[]) AND inativa = FALSE
     RETURNING id, ciente_em`,
    [notaIds]
  );
  return rows;
}

async function listNotasInativadas(empresaId, filtros) {
  const params = [empresaId];
  const where = montarFiltrosNotas(
    params,
    'n.empresa_id = $1 AND n.inativa = TRUE AND n.apenas_resumo = FALSE',
    filtros,
    'n.'
  );

  const { rows } = await pool.query(
    `SELECT n.id, n.tipo, n.chave_acesso, n.numero_nota, n.serie_nota, n.emissor, n.destinatario, n.data_emissao, n.situacao, n.situacao_categoria,
            n.inativada_em, n.motivo_inativacao,
            u.nome AS inativada_por_nome
     FROM espiao_notas n
     LEFT JOIN usuarios u ON u.id = n.inativada_por
     WHERE ${where}
     ORDER BY n.inativada_em DESC`,
    params
  );

  return rows;
}

// Mesmo formato de listNotasPorCertificado (agrupado em produtos/serviços,
// pra alimentar o card por certificado) só que só com notas inativas — usada
// pela tela de Notas Inativadas, que espelha a tela comum.
async function listNotasInativadasPorCertificado(certificadoId, filtros) {
  const params = [certificadoId];
  const where = montarFiltrosNotas(
    params,
    'n.certificado_id = $1 AND n.inativa = TRUE AND n.apenas_resumo = FALSE',
    filtros,
    'n.'
  );

  const { rows } = await pool.query(
    `SELECT n.id, n.tipo, n.chave_acesso, n.numero_nota, n.serie_nota, n.emissor, n.destinatario, n.data_emissao, n.situacao, n.situacao_categoria,
            n.inativada_em, n.motivo_inativacao,
            u.nome AS inativada_por_nome
     FROM espiao_notas n
     LEFT JOIN usuarios u ON u.id = n.inativada_por
     WHERE ${where}
     ORDER BY n.data_emissao DESC`,
    params
  );

  return {
    produtos: rows.filter((r) => r.tipo === 'NFE'),
    servicos: rows.filter((r) => r.tipo === 'NFSE'),
  };
}

async function getArquivoNota(notaId) {
  const { rows } = await pool.query('SELECT * FROM espiao_notas WHERE id = $1', [notaId]);
  const nota = rows[0];
  if (!nota) return null;
  return {
    caminhoAbsoluto: path.join(NOTAS_DIR, nota.arquivo_armazenado),
    nomeArquivo: `${nota.chave_acesso}.xml`,
  };
}

// Histórico completo de etapas de uma nota (janela flutuante da tela — ver
// EspiaoNfeNfsePage.jsx). Ordena por `id` (ordem de chegada), não por
// `data_evento`: a 1ª linha é sempre "Emitida" (criada junto com a nota em
// salvarNota) e as seguintes chegam na mesma ordem em que a SEFAZ as
// distribuiu (NSU crescente) — mais confiável do que `data_evento`, que
// pode vir null em alguns tipos de evento (ver extrairEventoNfe) e
// bagunçaria a ordem se usado como critério principal.
async function listEventosPorNota(notaId) {
  const { rows } = await pool.query(
    `SELECT id, descricao, categoria, data_evento, criado_em
     FROM espiao_notas_eventos
     WHERE nota_id = $1
     ORDER BY id ASC`,
    [notaId]
  );
  return rows;
}

// Usado pelo gerador de PDF (pdf.service.js) — devolve a linha da nota
// inteira (não só o caminho do arquivo) junto com o XML já lido do disco.
async function getNotaComXml(notaId) {
  const { rows } = await pool.query('SELECT * FROM espiao_notas WHERE id = $1', [notaId]);
  const nota = rows[0];
  if (!nota) return null;
  const caminhoAbsoluto = path.join(NOTAS_DIR, nota.arquivo_armazenado);
  const xml = fs.readFileSync(caminhoAbsoluto, 'utf8');
  return { nota, xml };
}

async function getAgendamento(empresaId) {
  const { rows } = await pool.query(
    'SELECT empresa_id, intervalo_horas FROM espiao_agendamentos WHERE empresa_id = $1',
    [empresaId]
  );
  return rows[0] || null;
}

async function salvarAgendamento(empresaId, intervaloHoras) {
  const { rows } = await pool.query(
    `INSERT INTO espiao_agendamentos (empresa_id, intervalo_horas)
     VALUES ($1, $2)
     ON CONFLICT (empresa_id) DO UPDATE SET intervalo_horas = EXCLUDED.intervalo_horas
     RETURNING empresa_id, intervalo_horas`,
    [empresaId, intervaloHoras]
  );
  return rows[0];
}

// Usado pelo agendador (agendador.js) — devolve as empresas cujo intervalo
// configurado já venceu (nunca rodou ainda, ou já passou tempo suficiente
// desde a última execução).
async function listAgendamentosPendentes() {
  const { rows } = await pool.query(
    `SELECT empresa_id, intervalo_horas
     FROM espiao_agendamentos
     WHERE ultima_execucao_em IS NULL
        OR ultima_execucao_em <= NOW() - (intervalo_horas || ' hours')::interval`
  );
  return rows;
}

async function marcarAgendamentoExecutado(empresaId) {
  await pool.query('UPDATE espiao_agendamentos SET ultima_execucao_em = NOW() WHERE empresa_id = $1', [empresaId]);
}

module.exports = {
  consultarEmpresa,
  consultarCertificadoAvulso,
  listEmpresasComStatus,
  listCertificadosComEstado,
  listNotas,
  listNotasPorCertificado,
  getArquivoNota,
  getNotaComXml,
  listEventosPorNota,
  getAgendamento,
  salvarAgendamento,
  listAgendamentosPendentes,
  marcarAgendamentoExecutado,
  inativarNotas,
  reativarNotas,
  declararCiencia,
  desmarcarCiencia,
  listNotasInativadas,
  listNotasInativadasPorCertificado,
  extrairTagTexto,
  extrairTagDentroDe,
};
