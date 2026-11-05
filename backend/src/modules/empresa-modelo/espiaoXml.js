const A = require('./anonimizador');

// ---------------------------------------------------------------------------------------
// XML fictício das notas do Espião da empresa modelo (NF-e 4.00 / NFS-e nacional). Os dados
// da nota (emitente, destinatário, número, data, valor, chave) são os já anonimizados da
// linha de espiao_notas; os itens/serviço são inventados conforme a categoria do título do
// Sienge vinculado à nota, com o total batendo centavo a centavo com o valor da nota.
// O DANFE/DANFSe sai deste XML pelo gerador oficial (gerar_documento_fiscal.py).
// ---------------------------------------------------------------------------------------

const CATALOGO = [
  [/ELETRIC|ILUMINA|ENERGIA/, [['CABO FLEXIVEL 2,5MM 750V ROLO 100M', 'RL', 389.9], ['DISJUNTOR DIN BIPOLAR 32A', 'UN', 68.5], ['ELETRODUTO CORRUGADO 3/4 ROLO 50M', 'RL', 94.0], ['TOMADA 2P+T 10A COM PLACA', 'UN', 14.9], ['QUADRO DE DISTRIBUICAO 24 DISJUNTORES', 'UN', 289.0]]],
  [/HIDRA|AGUA|ESGOTO|LOUCA|METAIS/, [['TUBO PVC SOLDAVEL 25MM BARRA 6M', 'BR', 32.4], ['JOELHO 90 PVC SOLDAVEL 25MM', 'UN', 1.85], ['REGISTRO DE GAVETA 3/4', 'UN', 78.9], ['TUBO ESGOTO 100MM BARRA 6M', 'BR', 96.0], ['CAIXA D AGUA POLIETILENO 1000L', 'UN', 649.0]]],
  [/PINTURA|TINTA|MASSA/, [['TINTA ACRILICA FOSCA BRANCA 18L', 'LT', 389.0], ['MASSA CORRIDA PVA 25KG', 'BD', 96.5], ['SELADOR ACRILICO 18L', 'LT', 189.0], ['LIXA PARA PAREDE GRAO 150', 'UN', 1.9], ['ROLO DE LA 23CM', 'UN', 32.0]]],
  [/REVEST|PISO|CERAM|PORCEL|ACABAMENTO/, [['PORCELANATO POLIDO 80X80 CX 1,28M2', 'CX', 112.0], ['ARGAMASSA AC-III 20KG', 'SC', 42.9], ['REJUNTE FLEXIVEL 1KG', 'UN', 12.5], ['RODAPE PORCELANATO 10X80', 'UN', 18.4]]],
  [/ESQUADR|VIDRO|ALUMIN|SERRALH/, [['JANELA DE CORRER ALUMINIO 1,20X1,00', 'UN', 890.0], ['VIDRO TEMPERADO 8MM M2', 'M2', 265.0], ['PORTA DE ALUMINIO 0,80X2,10', 'UN', 1240.0]]],
  [/MADEIR|FORMA|ESCORA/, [['CHAPA COMPENSADO RESINADO 18MM', 'UN', 139.9], ['PONTALETE DE EUCALIPTO 3M', 'UN', 18.0], ['TABUA DE PINUS 30CM 3M', 'UN', 39.5], ['PREGO 18X27 KG', 'KG', 19.9]]],
  [/ACO|FERRAGEM|ARMA|METAL/, [['VERGALHAO CA-50 10MM BARRA 12M', 'BR', 52.9], ['VERGALHAO CA-50 8MM BARRA 12M', 'BR', 34.7], ['ARAME RECOZIDO 18 KG', 'KG', 21.5], ['TELA SOLDADA Q-138 PAINEL', 'UN', 289.0]]],
  [/IMPERME/, [['MANTA ASFALTICA 4MM ROLO 10M', 'RL', 259.0], ['IMPERMEABILIZANTE CIMENTICIO 18KG', 'CX', 139.0], ['PRIMER ASFALTICO 18L', 'LT', 219.0]]],
  [/COMBUST|VEICUL|ABASTEC/, [['OLEO DIESEL S10', 'L', 6.29], ['GASOLINA COMUM', 'L', 6.19], ['ARLA 32', 'L', 4.9]]],
  [/ESCRIT|INFORM|EXPEDIENTE|LIMPEZA|COPA/, [['PAPEL A4 75G CX 10 RESMAS', 'CX', 289.0], ['TONER COMPATIVEL', 'UN', 159.0], ['DETERGENTE NEUTRO 5L', 'GL', 29.9], ['CAFE TORRADO 500G', 'PC', 24.9]]],
  [/EPI|SEGURANCA|UNIFORME/, [['CAPACETE DE SEGURANCA CLASSE B', 'UN', 39.9], ['BOTINA DE SEGURANCA BICO PVC', 'PR', 89.0], ['LUVA DE VAQUETA', 'PR', 18.5], ['CINTO PARAQUEDISTA', 'UN', 289.0]]],
];
const PADRAO = [['CIMENTO CP II-E-32 50KG', 'SC', 38.9], ['AREIA MEDIA LAVADA M3', 'M3', 145.0], ['BRITA 1 M3', 'M3', 168.0], ['BLOCO CERAMICO 14X19X29', 'MIL', 1390.0], ['CAL HIDRATADA CH-III 20KG', 'SC', 21.9]];

const SERVICOS = [
  [/LOCAC|EQUIPAMENTO/, ['070401', 'Locação de equipamentos para construção civil (andaimes, betoneira e escoramento metálico) — período de medição.']],
  [/PROJETO|ARQUITET|ENGENHAR|CONSULT|SONDAGEM|TOPOGRAF/, ['070101', 'Elaboração de projetos e consultoria de engenharia para o empreendimento.']],
  [/CONTAB|JURID|ADVOC|AUDIT/, ['170201', 'Prestação de serviços profissionais (assessoria contábil/jurídica) referente à competência.']],
  [/MARKET|PUBLICID|PROPAGANDA|STAND|VENDA|CORRET|COMISS/, ['170601', 'Serviços de publicidade, corretagem e apoio às vendas do empreendimento.']],
  [/MAO DE OBRA|EMPREITA|SERVICO|INSTALA|MONTAGEM|PINTURA|ELETRIC|HIDRA/, ['070201', 'Execução de serviços de construção civil por empreitada — medição do período.']],
  [/LIMPEZA|CONSERVA|VIGIL|SEGURAN/, ['071001', 'Serviços de limpeza, conservação e vigilância do canteiro de obras.']],
];
const SERVICO_PADRAO = ['070201', 'Execução de serviços de construção civil conforme contrato — medição do período.'];

const xmlEsc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dinheiro = (c) => (c / 100).toFixed(2);
const soDig = (v) => String(v ?? '').replace(/\D/g, '');

function dataIso(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '2026-01-01T10:00:00-03:00';
  const local = new Date(dt.getTime() - 3 * 3600 * 1000);
  return `${local.toISOString().slice(0, 19)}-03:00`;
}

// Divide `totalCent` em itens do catálogo, com quantidades inteiras e o último item fechando
// o total exato.
function itensPara(totalCent, categoria, semente) {
  const cat = (CATALOGO.find(([re]) => re.test(A.normalizar(categoria || ''))) || [null, PADRAO])[1];
  const h = A.hash(`itens:${semente}`);
  const n = Math.max(1, Math.min(cat.length, 1 + (h[0] % 4), Math.floor(totalCent / 2000) || 1));
  const itens = [];
  let restante = totalCent;
  for (let i = 0; i < n; i += 1) {
    const [desc, un, preco] = cat[(h[1] + i) % cat.length];
    const precoCent = Math.max(1, Math.round(preco * 100));
    if (i === n - 1) {
      // último: quantidade 1 com o valor que falta (ou fracionada para ficar plausível)
      const qtd = Math.max(1, Math.floor(restante / precoCent));
      const unit = restante / qtd;
      itens.push({ desc, un, qtd, unitario: (unit / 100).toFixed(4), total: restante });
    } else {
      const parte = Math.floor((restante * (0.25 + (h[2 + i] % 40) / 100)) / precoCent) * precoCent;
      if (parte <= 0) continue;
      itens.push({ desc, un, qtd: parte / precoCent, unitario: (precoCent / 100).toFixed(4), total: parte });
      restante -= parte;
    }
  }
  return itens;
}

function enderecoXml(semente, cidade = 'Volta Redonda', uf = 'RJ', cMun = '3306305') {
  const h = A.hash(`end:${semente}`);
  return {
    xLgr: A.logradouro(`RUA ${semente}`),
    nro: String((h[0] * 7) % 1800 + 10),
    xBairro: ['CENTRO', 'ATERRADO', 'VILA SANTA CECILIA', 'RETIRO', 'JARDIM AMERICA', 'SAO GERALDO'][h[1] % 6],
    cMun,
    xMun: cidade,
    UF: uf,
    CEP: `2725${String(h[2] % 10)}${String(h[3] % 1000).padStart(3, '0')}`,
  };
}

function docTag(doc) {
  const d = soDig(doc);
  return d.length === 11 ? `<CPF>${d}</CPF>` : `<CNPJ>${d.padStart(14, '0')}</CNPJ>`;
}

function xmlNfe(nota, { categoria }) {
  const chave = soDig(nota.chave_acesso).padStart(44, '0').slice(-44);
  const total = Math.round(Number(nota.valor_total || 0) * 100);
  const itens = itensPara(total, categoria, nota.chave_acesso);
  const e = enderecoXml(`emit:${nota.cnpj_emitente}`);
  const d = enderecoXml(`dest:${nota.cnpj_destinatario}`);
  const dh = dataIso(nota.data_emissao);
  const det = itens
    .map(
      (it, i) => `<det nItem="${i + 1}"><prod><cProd>${String(1000 + i * 37)}</cProd><cEAN>SEM GTIN</cEAN><xProd>${xmlEsc(it.desc)}</xProd><NCM>${['68101900', '25232910', '72142000', '39172300', '85444900'][i % 5]}</NCM><CFOP>5102</CFOP><uCom>${it.un}</uCom><qCom>${Number(it.qtd).toFixed(4)}</qCom><vUnCom>${it.unitario}</vUnCom><vProd>${dinheiro(it.total)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${it.un}</uTrib><qTrib>${Number(it.qtd).toFixed(4)}</qTrib><vUnTrib>${it.unitario}</vUnTrib><indTot>1</indTot></prod><imposto><ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS><PIS><PISOutr><CST>99</CST><vBC>0.00</vBC><pPIS>0.0000</pPIS><vPIS>0.00</vPIS></PISOutr></PIS><COFINS><COFINSOutr><CST>99</CST><vBC>0.00</vBC><pCOFINS>0.0000</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS></imposto></det>`
    )
    .join('');
  const v = dinheiro(total);
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${chave}" versao="4.00"><ide><cUF>${chave.slice(0, 2)}</cUF><cNF>${chave.slice(35, 43)}</cNF><natOp>VENDA DE MERCADORIA</natOp><mod>55</mod><serie>${Number(nota.serie_nota) || 1}</serie><nNF>${soDig(nota.numero_nota) || '1'}</nNF><dhEmi>${dh}</dhEmi><dhSaiEnt>${dh}</dhSaiEnt><tpNF>1</tpNF><idDest>1</idDest><cMunFG>3306305</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${chave.slice(43)}</cDV><tpAmb>1</tpAmb><finNFe>1</finNFe><indFinal>0</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>HZN-DEMO</verProc></ide><emit>${docTag(nota.cnpj_emitente)}<xNome>${xmlEsc(nota.emissor)}</xNome><enderEmit><xLgr>${e.xLgr}</xLgr><nro>${e.nro}</nro><xBairro>${e.xBairro}</xBairro><cMun>${e.cMun}</cMun><xMun>${e.xMun}</xMun><UF>${e.UF}</UF><CEP>${e.CEP}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></enderEmit><IE>${A.numero(`7${soDig(nota.cnpj_emitente).slice(0, 8)}`)}</IE><CRT>1</CRT></emit><dest>${docTag(nota.cnpj_destinatario)}<xNome>${xmlEsc(nota.destinatario)}</xNome><enderDest><xLgr>${d.xLgr}</xLgr><nro>${d.nro}</nro><xBairro>${d.xBairro}</xBairro><cMun>${d.cMun}</cMun><xMun>${d.xMun}</xMun><UF>${d.UF}</UF><CEP>${d.CEP}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></enderDest><indIEDest>9</indIEDest></dest>${det}<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${v}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${v}</vNF></ICMSTot></total><transp><modFrete>9</modFrete></transp><pag><detPag><tPag>15</tPag><vPag>${v}</vPag></detPag></pag><infAdic><infCpl>DOCUMENTO FICTICIO - EMPRESA MODELO DE DEMONSTRACAO</infCpl></infAdic></infNFe></NFe><protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><verAplic>HZN-DEMO</verAplic><chNFe>${chave}</chNFe><dhRecbto>${dh}</dhRecbto><nProt>3${chave.slice(20, 34)}</nProt><digVal>ZmljdGljaW8=</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;
}

function xmlNfse(nota, { categoria }) {
  const chave = soDig(nota.chave_acesso);
  const total = Math.round(Number(nota.valor_total || 0) * 100);
  const [cTrib, desc] = (SERVICOS.find(([re]) => re.test(A.normalizar(categoria || ''))) || [null, SERVICO_PADRAO])[1];
  const iss = Math.round(total * 0.02);
  const dh = dataIso(nota.data_emissao);
  const e = enderecoXml(`emit:${nota.cnpj_emitente}`);
  const t = enderecoXml(`dest:${nota.cnpj_destinatario}`);
  const ns = 'http://www.sped.fazenda.gov.br/nfse';
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="${ns}" versao="1.00"><infNFSe Id="NFS${chave}"><xLocEmi>Volta Redonda</xLocEmi><xLocPrestacao>Volta Redonda</xLocPrestacao><nNFSe>${soDig(nota.numero_nota) || '1'}</nNFSe><cLocIncid>3306305</cLocIncid><xLocIncid>Volta Redonda</xLocIncid><xTribNac>${xmlEsc(desc.split(' — ')[0].slice(0, 120))}</xTribNac><verAplic>HZN-DEMO</verAplic><ambGer>2</ambGer><tpEmis>1</tpEmis><procEmi>1</procEmi><cStat>100</cStat><dhProc>${dh}</dhProc><nDFSe>${chave.slice(-9)}</nDFSe><emit>${docTag(nota.cnpj_emitente)}<xNome>${xmlEsc(nota.emissor)}</xNome><enderNac><xLgr>${e.xLgr}</xLgr><nro>${e.nro}</nro><xBairro>${e.xBairro}</xBairro><cMun>${e.cMun}</cMun><UF>${e.UF}</UF><CEP>${e.CEP}</CEP></enderNac></emit><valores><vBC>${dinheiro(total)}</vBC><pAliqAplic>2.00</pAliqAplic><vISSQN>${dinheiro(iss)}</vISSQN><vLiq>${dinheiro(total)}</vLiq></valores><DPS versao="1.00"><infDPS Id="DPS${chave.slice(0, 42).padEnd(42, '0')}"><tpAmb>1</tpAmb><dhEmi>${dh}</dhEmi><verAplic>HZN-DEMO</verAplic><serie>${Number(nota.serie_nota) || 900}</serie><nDPS>${soDig(nota.numero_nota) || '1'}</nDPS><dCompet>${dh.slice(0, 10)}</dCompet><tpEmit>1</tpEmit><cLocEmi>3306305</cLocEmi><prest>${docTag(nota.cnpj_emitente)}<regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest><toma>${docTag(nota.cnpj_destinatario)}<xNome>${xmlEsc(nota.destinatario)}</xNome><end><endNac><cMun>${t.cMun}</cMun><CEP>${t.CEP}</CEP></endNac><xLgr>${t.xLgr}</xLgr><nro>${t.nro}</nro><xBairro>${t.xBairro}</xBairro></end></toma><serv><locPrest><cLocPrestacao>3306305</cLocPrestacao></locPrest><cServ><cTribNac>${cTrib}</cTribNac><xDescServ>${xmlEsc(`${desc} DOCUMENTO FICTICIO - EMPRESA MODELO DE DEMONSTRACAO.`)}</xDescServ></cServ></serv><valores><vServPrest><vServ>${dinheiro(total)}</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><indTotTrib>0</indTotTrib></totTrib></trib></valores></infDPS></DPS></infNFSe></NFSe>`;
}

function gerarXml(nota, contexto = {}) {
  return nota.tipo === 'NFSE' ? xmlNfse(nota, contexto) : xmlNfe(nota, contexto);
}

module.exports = { gerarXml, itensPara };
