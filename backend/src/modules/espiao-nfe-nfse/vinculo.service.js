const pool = require('../../config/db');
const { decrypt } = require('../../utils/crypto');
const { siengeFetch } = require('../../utils/siengeFetch');

// Vinculação nota recebida (Espião) ↔ título do contas a pagar no Sienge.
// Fluxo: a tela abre a janela de vínculo de uma nota → listTitulosParaNota
// busca TODOS os títulos (public/api/v1/bills) do período da tela com o
// código de documento configurado pro tipo da nota (aba Configurações) →
// o usuário escolhe um → vincular() grava o vínculo com um retrato do título.

const PAGE_LIMIT = 200;
// Quantos /creditors/{id} buscar em paralelo — o Sienge limita requisições
// por minuto (siengeFetch já espera e tenta de novo num 429); alguns em
// paralelo tiram a espera sequencial sem martelar a API.
const CONCORRENCIA_CREDORES = 10;
// Credor muda muito pouco (nome/CNPJ): fica no banco (sienge_credores_cache)
// e só é buscado de novo no Sienge depois disso — a 1ª abertura de um período
// paga o custo de buscar os fornecedores; as seguintes, mesmo depois de
// reiniciar o servidor, só buscam os que ainda não conhece.
const DIAS_VALIDADE_CREDOR = 7;
// Títulos do período ficam em cache por pouco tempo: abrir a janela de várias
// notas em sequência (o caso comum — conciliar o lote do dia) não refaz a
// paginação inteira a cada nota. Curto de propósito, pra refletir logo um
// título recém-lançado; a janela também tem "Atualizar" pra forçar.
const TTL_TITULOS_MS = 2 * 60 * 1000;

const cacheTitulos = new Map(); // `${tenant}|${codigo}|${inicio}|${fim}` -> { em, titulos }

function erro(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  Object.assign(err, extra);
  return err;
}

const soDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');
// "000001965" e "1965" são o mesmo número de documento.
const numeroNormalizado = (valor) => soDigitos(valor).replace(/^0+/, '');

// CNPJ/CPF do emissor sai direto da chave de acesso, sem abrir o XML:
// - NF-e (44 dígitos): cUF(2) AAMM(4) CNPJ(14) ... → posições 6-19.
// - NFS-e nacional (50 dígitos): cMun(7) amb(1) tpInsc(1) CNPJ/CPF(14) ... →
//   posições 9-22 (conferido contra notas reais: o nNFSe logo em seguida
//   bate com o número da nota).
function documentoEmissorDaChave(tipo, chave) {
  const digitos = soDigitos(chave);
  if (tipo === 'NFE' && digitos.length === 44) return digitos.slice(6, 20);
  if (tipo === 'NFSE' && digitos.length === 50) return digitos.slice(9, 23);
  return null;
}

async function getNota(notaId) {
  const { rows } = await pool.query(
    `SELECT id, empresa_id, tipo, chave_acesso, numero_nota, serie_nota, emissor, destinatario,
            to_char(data_emissao, 'YYYY-MM-DD"T"HH24:MI:SS') AS data_emissao
     FROM espiao_notas WHERE id = $1`,
    [notaId]
  );
  if (!rows[0]) throw erro(404, 'Nota não encontrada.');
  return rows[0];
}

async function getCredenciais(empresaId) {
  const { rows } = await pool.query(
    'SELECT tenant, username, password_enc FROM integracoes_sienge WHERE empresa_id = $1 AND ativo = TRUE LIMIT 1',
    [empresaId]
  );
  const integracao = rows[0];
  if (!integracao) {
    throw erro(400, 'Esta empresa não tem uma integração Sienge ativa. Cadastre em Integrações > Sienge.', {
      codigo: 'SEM_INTEGRACAO',
    });
  }
  return {
    tenant: integracao.tenant,
    auth: `Basic ${Buffer.from(`${integracao.username}:${decrypt(integracao.password_enc)}`).toString('base64')}`,
  };
}

async function getCodigoDocumento(empresaId, tipo) {
  const coluna = tipo === 'NFSE' ? 'codigo_documento_nfse' : 'codigo_documento_nfe';
  const { rows } = await pool.query(`SELECT ${coluna} AS codigo FROM espiao_configuracoes WHERE empresa_id = $1`, [
    empresaId,
  ]);
  return rows[0]?.codigo || null;
}

async function siengeGet(credenciais, caminho, descricao) {
  const url = `https://api.sienge.com.br/${credenciais.tenant}/public/api/v1${caminho}`;
  const resposta = await siengeFetch(url, {
    headers: { Authorization: credenciais.auth, Accept: 'application/json', 'User-Agent': 'HorizonFin/1.0' },
  });
  // O Sienge responde 404 ("Resource not found") quando o filtro não encontra
  // nada — pra listagem isso é "zero resultados", não erro.
  if (resposta.status === 404) return null;
  if (resposta.status === 401 || resposta.status === 403) {
    throw erro(502, 'O Sienge recusou as credenciais da integração desta empresa. Revise usuário e senha em Integrações > Sienge.');
  }
  if (!resposta.ok) {
    throw erro(502, `A API do Sienge retornou erro ao buscar ${descricao} (status ${resposta.status}).`);
  }
  return resposta.json();
}

// Pagina /bills (limit 200 + offset) até esgotar resultSetMetadata.count.
// `onPagina({ paginaAtual, totalPaginas })` — progresso pra log da varredura
// automática (ver vinculacaoAutomatica.js).
async function buscarTodosTitulos(credenciais, { codigo, dataInicio, dataFim, atualizar, onPagina }) {
  const chaveCache = `${credenciais.tenant}|${codigo}|${dataInicio}|${dataFim}`;
  const emCache = cacheTitulos.get(chaveCache);
  if (!atualizar && emCache && Date.now() - emCache.em < TTL_TITULOS_MS) return emCache.titulos;

  const titulos = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const params = new URLSearchParams({
      startDate: dataInicio,
      endDate: dataFim,
      documentsIdentificationId: codigo,
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    const pagina = await siengeGet(credenciais, `/bills?${params}`, 'os títulos do contas a pagar');
    const resultados = Array.isArray(pagina?.results) ? pagina.results : [];
    total = Number(pagina?.resultSetMetadata?.count ?? resultados.length);
    titulos.push(...resultados);
    onPagina?.({ paginaAtual: offset / PAGE_LIMIT + 1, totalPaginas: Math.max(1, Math.ceil(total / PAGE_LIMIT)) });
    if (resultados.length === 0) break;
    offset += PAGE_LIMIT;
  }

  cacheTitulos.set(chaveCache, { em: Date.now(), titulos });
  return titulos;
}

function resumirCredor(credor, id) {
  if (!credor) return { id, nome: null, documento: null };
  return {
    id: credor.id ?? id,
    nome: credor.name || credor.tradeName || null,
    documento: credor.cnpj || credor.cpf || null,
  };
}

// Busca 1 credor no Sienge e atualiza o cache do banco.
async function buscarCredorNoSienge(credenciais, id) {
  const credor = resumirCredor(await siengeGet(credenciais, `/creditors/${id}`, 'o fornecedor'), id);
  await pool.query(
    `INSERT INTO sienge_credores_cache (tenant, credor_id, nome, documento, atualizado_em)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (tenant, credor_id) DO UPDATE SET
       nome = EXCLUDED.nome, documento = EXCLUDED.documento, atualizado_em = NOW()`,
    [credenciais.tenant, id, credor.nome, credor.documento]
  );
  return credor;
}

// Resolve vários credores: o que está no cache (e ainda válido) sai do banco
// numa consulta só; o resto é buscado no Sienge, em lotes paralelos.
// `onProgresso({ buscados, aBuscar })` — só conta os que foram ao Sienge.
async function buscarCredores(credenciais, ids, onProgresso) {
  const unicos = [...new Set(ids.filter((id) => id != null).map(Number))];
  const porId = new Map();
  if (unicos.length === 0) return porId;

  const { rows } = await pool.query(
    `SELECT credor_id, nome, documento FROM sienge_credores_cache
     WHERE tenant = $1 AND credor_id = ANY($2::int[])
       AND atualizado_em > NOW() - ($3 || ' days')::interval`,
    [credenciais.tenant, unicos, String(DIAS_VALIDADE_CREDOR)]
  );
  rows.forEach((row) => porId.set(row.credor_id, { id: row.credor_id, nome: row.nome, documento: row.documento }));

  const faltando = unicos.filter((id) => !porId.has(id));
  for (let i = 0; i < faltando.length; i += CONCORRENCIA_CREDORES) {
    const lote = faltando.slice(i, i + CONCORRENCIA_CREDORES);
    const credores = await Promise.all(lote.map((id) => buscarCredorNoSienge(credenciais, id)));
    credores.forEach((credor, j) => porId.set(lote[j], credor));
    onProgresso?.({ buscados: Math.min(i + CONCORRENCIA_CREDORES, faltando.length), aBuscar: faltando.length });
  }
  return porId;
}

// Confere o título contra a nota nas 3 hipóteses (pedido do usuário):
// - cnpj: CPF/CNPJ do credor = emissor da nota (tirado da chave de acesso);
// - data: data de emissão do título = data de emissão da nota;
// - numero: nº do documento do título = nº da nota (sem zeros à esquerda).
// Sugerido = pelo menos 1 das 3; `pontuacao` (0-3) = quantas conferem.
function conferirTitulo(titulo, credor, nota, documentoEmissor) {
  const numeroNota = numeroNormalizado(nota.numero_nota);
  const dataNota = String(nota.data_emissao || '').slice(0, 10);
  const conferencia = {
    cnpj: Boolean(documentoEmissor) && soDigitos(credor?.documento) === documentoEmissor,
    data: Boolean(dataNota) && String(titulo.issueDate || '').slice(0, 10) === dataNota,
    numero: Boolean(numeroNota) && numeroNormalizado(titulo.documentNumber) === numeroNota,
  };
  const pontuacao = Object.values(conferencia).filter(Boolean).length;
  return { conferencia, pontuacao };
}

// Desempate entre títulos com a mesma pontuação — qual hipótese sozinha diz
// mais: nº do documento é quase uma identidade; CNPJ restringe ao
// fornecedor; data igual é a mais fraca (vários títulos no mesmo dia).
const PESO_HIPOTESE = { numero: 4, cnpj: 2, data: 1 };
const pesoConferencia = (conferencia) =>
  Object.entries(conferencia).reduce((soma, [hipotese, confere]) => soma + (confere ? PESO_HIPOTESE[hipotese] : 0), 0);

async function getVinculo(notaId) {
  const { rows } = await pool.query(
    `SELECT v.sienge_titulo_id, v.documento_identificacao, v.documento_numero,
            v.data_emissao::text AS data_emissao, v.valor::float AS valor,
            v.credor_id, v.credor_nome, v.credor_documento, v.vinculado_em, u.nome AS vinculado_por_nome
     FROM espiao_notas_vinculos v
     LEFT JOIN usuarios u ON u.id = v.vinculado_por
     WHERE v.nota_id = $1`,
    [notaId]
  );
  const v = rows[0];
  if (!v) return null;
  // Mesmo formato do `vinculo` que vem em cada nota da listagem (ver
  // espiao.service.js::SUBSELECT_VINCULO), + quem vinculou.
  return {
    tituloId: v.sienge_titulo_id,
    documentoIdentificacao: v.documento_identificacao,
    documentoNumero: v.documento_numero,
    dataEmissao: v.data_emissao,
    valor: v.valor,
    credorNome: v.credor_nome,
    credorDocumento: v.credor_documento,
    vinculadoEm: v.vinculado_em,
    vinculadoPorNome: v.vinculado_por_nome,
  };
}

async function listTitulosParaNota(notaId, { dataInicio, dataFim, atualizar = false }) {
  const nota = await getNota(notaId);
  const documentoEmissor = documentoEmissorDaChave(nota.tipo, nota.chave_acesso);
  const notaResumo = {
    id: nota.id,
    tipo: nota.tipo,
    numero: nota.numero_nota,
    serie: nota.serie_nota,
    emissor: nota.emissor,
    documentoEmissor,
    dataEmissao: nota.data_emissao,
    chaveAcesso: nota.chave_acesso,
  };
  const vinculoAtual = await getVinculo(notaId);

  const codigo = await getCodigoDocumento(nota.empresa_id, nota.tipo);
  if (!codigo) {
    return { configurado: false, nota: notaResumo, vinculoAtual, parametros: { dataInicio, dataFim }, titulos: [] };
  }

  const credenciais = await getCredenciais(nota.empresa_id);
  const titulosSienge = await buscarTodosTitulos(credenciais, { codigo, dataInicio, dataFim, atualizar });
  const credores = await buscarCredores(credenciais, titulosSienge.map((t) => t.creditorId));

  // Títulos deste lote já vinculados a OUTRA nota da empresa — aparecem na
  // lista, mas bloqueados, com a nota a que já pertencem.
  const { rows: vinculados } = await pool.query(
    `SELECT v.sienge_titulo_id, v.nota_id, n.numero_nota, n.emissor
     FROM espiao_notas_vinculos v
     JOIN espiao_notas n ON n.id = v.nota_id
     WHERE v.empresa_id = $1 AND v.sienge_titulo_id = ANY($2::int[]) AND v.nota_id <> $3`,
    [nota.empresa_id, titulosSienge.map((t) => t.id), notaId]
  );
  const vinculadoPorTitulo = new Map(vinculados.map((v) => [v.sienge_titulo_id, v]));

  const titulos = titulosSienge
    .map((titulo) => {
      const credor = credores.get(titulo.creditorId) || resumirCredor(null, titulo.creditorId);
      const outraNota = vinculadoPorTitulo.get(titulo.id);
      return {
        id: titulo.id,
        documentoIdentificacao: (titulo.documentIdentificationId || '').trim(),
        documentoNumero: titulo.documentNumber,
        dataEmissao: titulo.issueDate,
        valor: titulo.totalInvoiceAmount,
        parcelas: titulo.installmentsNumber,
        observacao: titulo.notes || null,
        cadastradoPor: titulo.registeredBy || null,
        fornecedor: credor,
        ...conferirTitulo(titulo, credor, nota, documentoEmissor),
        vinculadoAOutraNota: outraNota
          ? { notaId: outraNota.nota_id, numero: outraNota.numero_nota, emissor: outraNota.emissor }
          : null,
      };
    })
    // Mais chances primeiro: quantas hipóteses conferem (3 → 0), depois o
    // peso de cada uma, depois o mais recente.
    .sort(
      (a, b) =>
        b.pontuacao - a.pontuacao ||
        pesoConferencia(b.conferencia) - pesoConferencia(a.conferencia) ||
        String(b.dataEmissao).localeCompare(String(a.dataEmissao)) ||
        b.id - a.id
    );

  return {
    configurado: true,
    nota: notaResumo,
    vinculoAtual,
    parametros: { codigoDocumento: codigo, dataInicio, dataFim, tenant: credenciais.tenant },
    consultadoEm: new Date().toISOString(),
    titulos,
  };
}

// Grava (ou troca) o vínculo da nota. O título é buscado de novo no Sienge
// aqui — o retrato gravado vem da fonte, nunca do que o navegador mandou.
async function vincular(notaId, tituloId, usuarioId) {
  const nota = await getNota(notaId);
  const credenciais = await getCredenciais(nota.empresa_id);

  const titulo = await siengeGet(credenciais, `/bills/${tituloId}`, 'o título');
  if (!titulo) throw erro(404, `O título ${tituloId} não foi encontrado no Sienge.`);
  // Na hora de gravar, o credor vem sempre fresco do Sienge (não do cache).
  const credor =
    titulo.creditorId != null ? await buscarCredorNoSienge(credenciais, titulo.creditorId) : resumirCredor(null, null);

  const { rows: conflito } = await pool.query(
    `SELECT n.numero_nota, n.emissor
     FROM espiao_notas_vinculos v JOIN espiao_notas n ON n.id = v.nota_id
     WHERE v.empresa_id = $1 AND v.sienge_titulo_id = $2 AND v.nota_id <> $3`,
    [nota.empresa_id, titulo.id, notaId]
  );
  if (conflito[0]) {
    throw erro(
      409,
      `O título ${titulo.id} já está vinculado à nota ${conflito[0].numero_nota || '—'} (${conflito[0].emissor || 'emissor não informado'}).`
    );
  }

  try {
    await pool.query(
      `INSERT INTO espiao_notas_vinculos
         (nota_id, empresa_id, sienge_titulo_id, documento_identificacao, documento_numero, data_emissao, valor,
          credor_id, credor_nome, credor_documento, vinculado_por, vinculado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (nota_id) DO UPDATE SET
         sienge_titulo_id = EXCLUDED.sienge_titulo_id,
         documento_identificacao = EXCLUDED.documento_identificacao,
         documento_numero = EXCLUDED.documento_numero,
         data_emissao = EXCLUDED.data_emissao,
         valor = EXCLUDED.valor,
         credor_id = EXCLUDED.credor_id,
         credor_nome = EXCLUDED.credor_nome,
         credor_documento = EXCLUDED.credor_documento,
         vinculado_por = EXCLUDED.vinculado_por,
         vinculado_em = NOW()`,
      [
        notaId,
        nota.empresa_id,
        titulo.id,
        (titulo.documentIdentificationId || '').trim() || null,
        titulo.documentNumber || null,
        titulo.issueDate || null,
        titulo.totalInvoiceAmount ?? null,
        credor.id,
        credor.nome,
        credor.documento,
        usuarioId,
      ]
    );
  } catch (err) {
    // Duas pessoas vinculando o mesmo título ao mesmo tempo: a checagem acima
    // passa pras duas, e o UNIQUE (empresa_id, sienge_titulo_id) barra a segunda.
    if (err.code === '23505') throw erro(409, `O título ${titulo.id} acabou de ser vinculado a outra nota.`);
    throw err;
  }
  return getVinculo(notaId);
}

async function desvincular(notaId) {
  await pool.query('DELETE FROM espiao_notas_vinculos WHERE nota_id = $1', [notaId]);
}

// Varredura em lote: pra cada nota ativa da empresa ainda sem vínculo
// (não inativada, não cancelada, no período), procura o título que confere
// nas 3 hipóteses (CNPJ + data + nº — ver conferirTitulo) e vincula SÓ
// quando o casamento é inequívoco:
// - a nota tem exatamente 1 título 3/3; e
// - esse título não é 3/3 de nenhuma outra nota; e
// - o título ainda não está vinculado a nada.
// O resto fica de fora e volta no relatório (ambíguos). `simular: true` só
// calcula, sem gravar. Os títulos vêm do Sienge nesta mesma chamada — o
// retrato gravado é o que o Sienge devolveu agora.
// `aoProgredir(tipo, dados)` (opcional) recebe o andamento de cada tipo de
// nota ('NFE'/'NFSE') pro log da varredura (ver vinculacaoAutomatica.js):
// { status: 'carregando'|'sucesso'|'ignorado'|'sem_configuracao', etapa,
//   paginaAtual, totalPaginas, codigo, titulos, notas }.
async function vincularAutomaticamente(
  empresaId,
  { dataInicio, dataFim, usuarioId = null, simular = true, aoProgredir = () => {} }
) {
  const credenciais = await getCredenciais(empresaId);
  const { rows: notas } = await pool.query(
    `SELECT id, tipo, chave_acesso, numero_nota, emissor,
            to_char(data_emissao, 'YYYY-MM-DD"T"HH24:MI:SS') AS data_emissao
     FROM espiao_notas n
     WHERE empresa_id = $1 AND inativa = FALSE AND apenas_resumo = FALSE
       AND situacao_categoria IS DISTINCT FROM 'cancelada'
       AND data_emissao >= $2 AND data_emissao <= $3
       AND NOT EXISTS (SELECT 1 FROM espiao_notas_vinculos v WHERE v.nota_id = n.id)`,
    [empresaId, dataInicio, `${dataFim} 23:59:59`]
  );
  const { rows: jaVinculados } = await pool.query(
    'SELECT sienge_titulo_id FROM espiao_notas_vinculos WHERE empresa_id = $1',
    [empresaId]
  );
  const titulosOcupados = new Set(jaVinculados.map((r) => r.sienge_titulo_id));

  const relatorio = { notasAnalisadas: notas.length, porTipo: {}, vinculos: [], ambiguos: [], semConfiguracao: [] };
  const propostas = []; // { nota, titulo, credor }

  for (const tipo of ['NFE', 'NFSE']) {
    const notasDoTipo = notas.filter((n) => n.tipo === tipo);
    if (notasDoTipo.length === 0) {
      aoProgredir(tipo, { status: 'ignorado', notas: 0 });
      continue;
    }
    const codigo = await getCodigoDocumento(empresaId, tipo);
    if (!codigo) {
      relatorio.semConfiguracao.push(tipo);
      aoProgredir(tipo, { status: 'sem_configuracao', notas: notasDoTipo.length });
      continue;
    }
    aoProgredir(tipo, { status: 'carregando', etapa: 'Títulos do contas a pagar', codigo, notas: notasDoTipo.length });
    const titulos = await buscarTodosTitulos(credenciais, {
      codigo,
      dataInicio,
      dataFim,
      atualizar: true,
      onPagina: (p) => aoProgredir(tipo, { status: 'carregando', etapa: 'Títulos do contas a pagar', ...p }),
    });
    aoProgredir(tipo, { status: 'carregando', etapa: 'Fornecedores', paginaAtual: undefined, totalPaginas: undefined });
    const credores = await buscarCredores(
      credenciais,
      titulos.map((t) => t.creditorId),
      ({ buscados, aBuscar }) =>
        aoProgredir(tipo, { status: 'carregando', etapa: 'Fornecedores', paginaAtual: buscados, totalPaginas: aBuscar })
    );
    relatorio.porTipo[tipo] = { codigo, notas: notasDoTipo.length, titulos: titulos.length };
    aoProgredir(tipo, {
      status: 'sucesso',
      etapa: undefined,
      paginaAtual: undefined,
      totalPaginas: undefined,
      titulos: titulos.length,
    });

    // Índice por (CNPJ do credor, data, nº) — as 3 hipóteses de uma vez.
    const chave = (doc, data, numero) => `${soDigitos(doc)}|${String(data || '').slice(0, 10)}|${numeroNormalizado(numero)}`;
    const porChave = new Map();
    for (const titulo of titulos) {
      if (titulosOcupados.has(titulo.id)) continue;
      const credor = credores.get(titulo.creditorId);
      if (!credor?.documento || !numeroNormalizado(titulo.documentNumber)) continue;
      const k = chave(credor.documento, titulo.issueDate, titulo.documentNumber);
      if (!porChave.has(k)) porChave.set(k, []);
      porChave.get(k).push({ titulo, credor });
    }

    for (const nota of notasDoTipo) {
      const documentoEmissor = documentoEmissorDaChave(nota.tipo, nota.chave_acesso);
      if (!documentoEmissor || !numeroNormalizado(nota.numero_nota)) continue;
      const candidatos = porChave.get(chave(documentoEmissor, nota.data_emissao, nota.numero_nota)) || [];
      if (candidatos.length === 1) propostas.push({ nota, ...candidatos[0] });
      else if (candidatos.length > 1) {
        relatorio.ambiguos.push({
          motivo: 'nota com mais de um título 3/3',
          notaId: nota.id,
          numero: nota.numero_nota,
          emissor: nota.emissor,
          titulos: candidatos.map((c) => c.titulo.id),
        });
      }
    }
  }

  // Um título que casa 3/3 com mais de uma nota não é vinculado a nenhuma.
  const notasPorTitulo = new Map();
  propostas.forEach((p) => notasPorTitulo.set(p.titulo.id, [...(notasPorTitulo.get(p.titulo.id) || []), p]));
  const inequivocas = [];
  for (const [tituloId, lista] of notasPorTitulo) {
    if (lista.length === 1) inequivocas.push(lista[0]);
    else {
      relatorio.ambiguos.push({
        motivo: 'título 3/3 de mais de uma nota',
        tituloId,
        notas: lista.map((p) => ({ notaId: p.nota.id, numero: p.nota.numero_nota, emissor: p.nota.emissor })),
      });
    }
  }

  relatorio.vinculos = inequivocas.map(({ nota, titulo, credor }) => ({
    notaId: nota.id,
    tipo: nota.tipo,
    numero: nota.numero_nota,
    emissor: nota.emissor,
    dataEmissao: nota.data_emissao.slice(0, 10),
    tituloId: titulo.id,
    documento: `${(titulo.documentIdentificationId || '').trim()} ${titulo.documentNumber}`,
    valor: titulo.totalInvoiceAmount,
    fornecedor: credor.nome,
  }));
  if (simular) return relatorio;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { nota, titulo, credor } of inequivocas) {
      await client.query(
        `INSERT INTO espiao_notas_vinculos
           (nota_id, empresa_id, sienge_titulo_id, documento_identificacao, documento_numero, data_emissao, valor,
            credor_id, credor_nome, credor_documento, vinculado_por, vinculado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
        [
          nota.id,
          empresaId,
          titulo.id,
          (titulo.documentIdentificationId || '').trim() || null,
          titulo.documentNumber || null,
          titulo.issueDate || null,
          titulo.totalInvoiceAmount ?? null,
          credor.id,
          credor.nome,
          credor.documento,
          usuarioId,
        ]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return relatorio;
}

module.exports = { listTitulosParaNota, vincular, desvincular, documentoEmissorDaChave, vincularAutomaticamente };
