const pool = require('../../config/db');
const env = require('../../config/env');
const etapasService = require('../etapas-centro-custo/etapasCentroCusto.service');
const empresasService = require('../empresas/empresas.service');
const zapiService = require('../integracoes-zapi/zapi.service');
const cronograma = require('./cronogramaCentros.service');
const cronogramaExcel = require('./cronogramaExcel.service');

// Versionamento do cronograma de obras (pedido do usuário — ver
// database/migrations/2026-10-21-cronograma-versoes.sql):
// - Salvar as datas das etapas de uma obra (aba Histórico de Etapas do cadastro do centro, também
//   aberta em janela pela aba Centros de Custos de Cronogramas Obras) só guarda a alteração como
//   pendente (guardarPendencia). O Histórico de Etapas — o cronograma, o dashboard e tudo o mais que
//   lê as datas — continua na versão anterior.
// - Gravar uma nova versão (gravarVersao) aplica as pendências de todas as obras numa transação só,
//   numera a versão, guarda o retrato do cronograma e manda o comunicado de WhatsApp aos
//   destinatários da aba Configurações (conexão Z-API de cronograma_config): o que mudou, a planilha
//   do cronograma novo anexa e o link do dashboard — mesmo formato dos comunicados de Repasses CEF e
//   de Saldos (comunicarRepasses.service.js), só que disparado na gravação, não num horário.

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// pg_advisory_xact_lock(CHAVE_TRAVA, empresa): duas gravações ao mesmo tempo não pegam o mesmo
// número nem aplicam a mesma pendência duas vezes.
const CHAVE_TRAVA = 7301;
// Legenda do documento no WhatsApp: passou disso, as obras que não couberem vão só na planilha.
const LIMITE_LEGENDA = 1000;

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const nomeDoCentro = (c) => String(c.apelido || '').trim() || String(c.name || '').trim();
const VAZIO = { inicios: {}, fins: {} };

// ---------------------------------------------------------------------------------------
// Pendências
// ---------------------------------------------------------------------------------------

// Soma a edição às pendências da obra. O que voltou a ficar igual ao cronograma em vigor deixa de
// ser pendência; sem nada pendente, a linha sai.
async function guardarPendencia(empresaId, siengeId, { datas, dataTermino }, usuarioId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: centro } = await client.query(
      'SELECT 1 FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2',
      [empresaId, siengeId]
    );
    if (!centro[0]) throw erro(404, 'Centro de custo não encontrado.');
    const etapas = await etapasService.list(empresaId, client);
    const ids = new Set(etapas.map((e) => e.id));
    if (datas.some((d) => !ids.has(d.etapa_id))) {
      throw erro(409, 'As etapas foram alteradas em outro lugar. Recarregue a tela e tente de novo.');
    }

    const oficial = (await cronograma.historicoPorCentro(empresaId, siengeId, client)).get(siengeId) || VAZIO;
    const { rows: atual } = await client.query(
      'SELECT datas, termino_alterado, data_termino FROM cronograma_pendencias WHERE empresa_id = $1 AND sienge_id = $2 FOR UPDATE',
      [empresaId, siengeId]
    );
    const p = atual[0] || { datas: {}, termino_alterado: false, data_termino: null };

    const novas = { ...p.datas };
    datas.forEach(({ etapa_id: etapaId, data }) => {
      novas[etapaId] = data;
    });
    for (const k of Object.keys(novas)) {
      if (!ids.has(Number(k)) || (novas[k] ?? null) === (oficial.inicios[k] ?? null)) delete novas[k];
    }
    let terminoAlterado = p.termino_alterado;
    let termino = p.data_termino;
    if (dataTermino !== undefined) {
      terminoAlterado = true;
      termino = dataTermino;
    }
    const ultima = etapas[etapas.length - 1];
    if (terminoAlterado && (termino ?? null) === ((ultima && oficial.fins[ultima.id]) ?? null)) terminoAlterado = false;

    const pendente = Object.keys(novas).length > 0 || terminoAlterado;
    if (!pendente) {
      await client.query('DELETE FROM cronograma_pendencias WHERE empresa_id = $1 AND sienge_id = $2', [empresaId, siengeId]);
    } else {
      await client.query(
        `INSERT INTO cronograma_pendencias (empresa_id, sienge_id, datas, termino_alterado, data_termino, atualizado_por, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (empresa_id, sienge_id) DO UPDATE SET
           datas = EXCLUDED.datas,
           termino_alterado = EXCLUDED.termino_alterado,
           data_termino = EXCLUDED.data_termino,
           atualizado_por = EXCLUDED.atualizado_por,
           atualizado_em = NOW()`,
        [empresaId, siengeId, JSON.stringify(novas), terminoAlterado, terminoAlterado ? termino : null, usuarioId]
      );
    }
    await client.query('COMMIT');
    return { sienge_id: siengeId, pendente };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Aplica as pendências da empresa no Histórico de Etapas, dentro da transação `client` (quem chama
// confirma ou desfaz), e devolve o que mudou de fato, obra a obra e etapa a etapa.
async function aplicarPendencias(client, empresaId) {
  const { rows: pendencias } = await client.query(
    `SELECT p.sienge_id, p.datas, p.termino_alterado, p.data_termino, p.atualizado_em,
            u.nome AS atualizado_por, c.name, c.apelido
       FROM cronograma_pendencias p
       JOIN centros_custo_sienge c ON c.empresa_id = p.empresa_id AND c.sienge_id = p.sienge_id
       LEFT JOIN usuarios u ON u.id = p.atualizado_por
      WHERE p.empresa_id = $1
      ORDER BY COALESCE(NULLIF(TRIM(c.apelido), ''), TRIM(c.name))`,
    [empresaId]
  );
  if (!pendencias.length) return [];
  const etapas = await etapasService.list(empresaId, client);
  const ids = new Set(etapas.map((e) => e.id));
  const antes = await cronograma.historicoPorCentro(empresaId, null, client);
  for (const p of pendencias) {
    await cronograma.aplicarDatas(client, empresaId, p.sienge_id, {
      datas: Object.entries(p.datas)
        .filter(([k]) => ids.has(Number(k))) // etapa que saiu da máscara depois da edição
        .map(([k, v]) => ({ etapa_id: Number(k), data: v })),
      dataTermino: p.termino_alterado ? p.data_termino : undefined,
    });
  }
  const depois = await cronograma.historicoPorCentro(empresaId, null, client);
  return pendencias
    .map((p) => {
      const a = antes.get(p.sienge_id) || VAZIO;
      const d = depois.get(p.sienge_id) || VAZIO;
      const mudancas = etapas
        .map((e, i) => ({
          etapa_id: e.id,
          etapa: e.descricao,
          ultima: i === etapas.length - 1,
          inicio_antes: a.inicios[e.id] || null,
          inicio_depois: d.inicios[e.id] || null,
          fim_antes: a.fins[e.id] || null,
          fim_depois: d.fins[e.id] || null,
        }))
        .filter((m) => m.inicio_antes !== m.inicio_depois || m.fim_antes !== m.fim_depois);
      return {
        sienge_id: p.sienge_id,
        nome: nomeDoCentro(p),
        atualizado_por: p.atualizado_por,
        atualizado_em: p.atualizado_em,
        etapas: mudancas,
      };
    })
    .filter((o) => o.etapas.length);
}

// Conexão de disparo e destinatários do comunicado (aba Configurações).
async function destinatariosDoComunicado(empresaId) {
  const [{ rows: config }, { rows: usuarios }] = await Promise.all([
    pool.query(
      `SELECT c.zapi_integracao_id, z.nome_conexao FROM cronograma_config c
         LEFT JOIN integracoes_zapi z ON z.id = c.zapi_integracao_id AND z.ativo
        WHERE c.empresa_id = $1`,
      [empresaId]
    ),
    pool.query(
      `SELECT u.id, u.nome, u.telefone_ddd, u.telefone_numero FROM usuarios u
         JOIN cronograma_comunicar_usuarios c ON c.usuario_id = u.id
        WHERE c.empresa_id = $1 AND u.ativo = TRUE
        ORDER BY u.nome`,
      [empresaId]
    ),
  ]);
  const c = config[0];
  return {
    zapiIntegracaoId: c?.nome_conexao ? c.zapi_integracao_id : null,
    conexao: c?.nome_conexao || null,
    destinatarios: usuarios.map((u) => ({
      id: u.id,
      nome: u.nome,
      telefone: u.telefone_ddd && u.telefone_numero ? `${u.telefone_ddd}${u.telefone_numero}` : null,
    })),
  };
}

async function nomeDoUsuario(usuarioId) {
  const { rows } = await pool.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]);
  return rows[0]?.nome || null;
}

async function nomeDaEmpresa(empresaId) {
  const empresa = await empresasService.getById(empresaId);
  return empresa?.nome_fantasia?.trim() || empresa?.razao_social || '';
}

const linkDashboard = (empresaId) => `${env.frontendUrl.replace(/\/+$/, '')}/dashboards/cronogramas-obras?empresa_id=${empresaId}`;

// As pendências como vão ficar (aplica e desfaz — a mesma conta da gravação de verdade), com quem
// recebe o comunicado e a prévia da mensagem — pra tela mostrar antes de gravar.
async function listarPendencias(empresaId, usuarioId) {
  const client = await pool.connect();
  let alteracoes;
  try {
    await client.query('BEGIN');
    alteracoes = await aplicarPendencias(client, empresaId);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
  const [comunicado, empresa, usuario, { rows: ultima }] = await Promise.all([
    destinatariosDoComunicado(empresaId),
    nomeDaEmpresa(empresaId),
    nomeDoUsuario(usuarioId),
    pool.query('SELECT COALESCE(MAX(numero), 0) + 1 AS numero FROM cronograma_versoes WHERE empresa_id = $1', [empresaId]),
  ]);
  const previa = alteracoes.length
    ? montarMensagem({
        empresa,
        versao: { numero: ultima[0].numero, criado_em: new Date(), criado_por_nome: usuario, observacao: null, alteracoes },
        nomeDestinatario: comunicado.destinatarios[0]?.nome || usuario,
        link: linkDashboard(empresaId),
      })
    : null;
  return {
    alteracoes,
    proximaVersao: ultima[0].numero,
    comunicado: {
      conexao: comunicado.conexao,
      destinatarios: comunicado.destinatarios.map((d) => ({ nome: d.nome, semTelefone: !d.telefone })),
      previa,
      nomeArquivo: `${nomeArquivo(ultima[0].numero)}.xlsx`,
    },
  };
}

async function descartarPendencia(empresaId, siengeId) {
  const { rowCount } = await pool.query('DELETE FROM cronograma_pendencias WHERE empresa_id = $1 AND sienge_id = $2', [
    empresaId,
    siengeId,
  ]);
  if (!rowCount) throw erro(404, 'Essa obra não tem alteração pendente.');
}

// ---------------------------------------------------------------------------------------
// Versões
// ---------------------------------------------------------------------------------------

const COLUNAS_VERSAO = `v.id, v.empresa_id, v.numero, v.observacao, v.alteracoes, v.comunicado, v.criado_em,
  u.nome AS criado_por_nome`;

async function getVersao(empresaId, versaoId, { comCronograma = false } = {}) {
  const { rows } = await pool.query(
    `SELECT ${COLUNAS_VERSAO}${comCronograma ? ', v.cronograma' : ''}
       FROM cronograma_versoes v LEFT JOIN usuarios u ON u.id = v.criado_por
      WHERE v.empresa_id = $1 AND v.id = $2`,
    [empresaId, versaoId]
  );
  if (!rows[0]) throw erro(404, 'Versão não encontrada.');
  return rows[0];
}

async function listarVersoes(empresaId) {
  const { rows } = await pool.query(
    `SELECT ${COLUNAS_VERSAO}
       FROM cronograma_versoes v LEFT JOIN usuarios u ON u.id = v.criado_por
      WHERE v.empresa_id = $1
      ORDER BY v.numero DESC`,
    [empresaId]
  );
  return rows;
}

// Aplica as pendências, numera a versão e guarda o retrato do cronograma (as obras, como a lista de
// /cronograma-centros) numa transação só; depois manda o comunicado e anota o resultado na versão.
async function gravarVersao(empresaId, usuarioId, observacao) {
  const client = await pool.connect();
  let versaoId;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [CHAVE_TRAVA, empresaId]);
    const alteracoes = await aplicarPendencias(client, empresaId);
    if (!alteracoes.length) throw erro(409, 'Não há alteração pendente para gravar.');
    await client.query('DELETE FROM cronograma_pendencias WHERE empresa_id = $1', [empresaId]);
    const retrato = await cronograma.list(empresaId, client);
    const { rows: ultima } = await client.query(
      'SELECT COALESCE(MAX(numero), 0) + 1 AS numero FROM cronograma_versoes WHERE empresa_id = $1',
      [empresaId]
    );
    const { rows } = await client.query(
      `INSERT INTO cronograma_versoes (empresa_id, numero, observacao, alteracoes, cronograma, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        empresaId,
        ultima[0].numero,
        observacao || null,
        JSON.stringify(alteracoes),
        JSON.stringify({ etapas: retrato.etapas, atraso: retrato.atraso, centros: retrato.centros.filter((c) => c.natureza === 'OBRA') }),
        usuarioId,
      ]
    );
    versaoId = rows[0].id;
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const versao = await getVersao(empresaId, versaoId, { comCronograma: true });
  const comunicado = await dispararComunicado(empresaId, versao);
  await pool.query('UPDATE cronograma_versoes SET comunicado = $2 WHERE id = $1', [versaoId, JSON.stringify(comunicado)]);
  const { cronograma: _retrato, ...resumo } = versao;
  return { ...resumo, comunicado };
}

// ---------------------------------------------------------------------------------------
// Comunicado
// ---------------------------------------------------------------------------------------

const dataBr = (iso) => (iso ? iso.split('-').reverse().join('/') : 'sem data');
const plural = (n, um, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

// Uma linha por etapa que mudou de início (e o término da última). O fim das outras etapas sai do
// início da seguinte, então já está dito na linha da seguinte.
function linhasDaObra(obra) {
  return obra.etapas
    .map((m) => {
      const partes = [];
      if (m.inicio_antes !== m.inicio_depois) partes.push(`início ${dataBr(m.inicio_antes)} ➜ ${dataBr(m.inicio_depois)}`);
      if (m.ultima && m.fim_antes !== m.fim_depois) partes.push(`término ${dataBr(m.fim_antes)} ➜ ${dataBr(m.fim_depois)}`);
      return partes.length ? `• ${m.etapa}: ${partes.join(' · ')}` : null;
    })
    .filter(Boolean);
}

function montarMensagem({ empresa, versao, nomeDestinatario, link }) {
  const primeiroNome = String(nomeDestinatario || '').trim().split(/\s+/)[0];
  const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(
    new Date(versao.criado_em)
  );
  const obras = versao.alteracoes;
  const cabeca = [
    `*[ CRONOGRAMA DE OBRAS ]* · *${empresa}*`,
    `_Versão ${versao.numero} · ${quando}_`,
    '',
    `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! O cronograma das obras foi atualizado${versao.criado_por_nome ? ` por ${versao.criado_por_nome}` : ''}.`,
    '',
    `🏗️ *${plural(obras.length, 'obra alterada', 'obras alteradas')}*`,
  ];
  const pe = [
    ...(versao.observacao ? ['', `📝 _${versao.observacao}_`] : []),
    '',
    '📎 Cronograma completo na planilha anexa',
    '',
    `🔗 Ver no dashboard: ${link}`,
    '',
    '_Comunicado automático enviado pelo Horizon Finanças._',
  ];
  const tamanho = (linhas) => linhas.join('\n').length;
  const corpo = [];
  let i = 0;
  for (; i < obras.length; i++) {
    const bloco = ['', `*${obras[i].nome}*`, ...linhasDaObra(obras[i])];
    const resto = obras.length - i - 1;
    const aviso = resto ? ['', `_… e mais ${plural(resto, 'obra', 'obras')} — veja a aba Alterações da planilha._`] : [];
    if (i > 0 && tamanho([...cabeca, ...corpo, ...bloco, ...aviso, ...pe]) > LIMITE_LEGENDA) break;
    corpo.push(...bloco);
  }
  if (i < obras.length) corpo.push('', `_… e mais ${plural(obras.length - i, 'obra', 'obras')} — veja a aba Alterações da planilha._`);
  return [...cabeca, ...corpo, ...pe].join('\n');
}

// Sem extensão: a Z-API já acrescenta ".xlsx" (send-document/xlsx) — ver comunicarRepasses.service.js.
const nomeArquivo = (numero) => `Cronograma de Obras - Versão ${numero}`;

// Manda a versão pra todos os destinatários (planilha montada 1 vez só). Nunca lança: cada falha
// vira um item em `falhas`, como nos comunicados de Repasses CEF e de Saldos.
async function dispararComunicado(empresaId, versao) {
  const prefixo = `[comunicar-cronograma] empresa ${empresaId}, versão ${versao.numero}:`;
  try {
    const { zapiIntegracaoId, destinatarios } = await destinatariosDoComunicado(empresaId);
    if (!zapiIntegracaoId) return { status: 'sem_conexao', enviados: [], falhas: [] };
    if (!destinatarios.length) return { status: 'sem_destinatario', enviados: [], falhas: [] };

    const empresa = await nomeDaEmpresa(empresaId);
    const buffer = await cronogramaExcel.gerar({ empresa, versao, link: linkDashboard(empresaId) });
    const documentoBase64 = Buffer.from(buffer).toString('base64');
    const resultados = await Promise.allSettled(
      destinatarios.map(async (dest) => {
        if (!dest.telefone) throw new Error(`usuário "${dest.nome}" sem telefone cadastrado`);
        await zapiService.enviarDocumento(zapiIntegracaoId, {
          telefone: dest.telefone,
          documentoBase64,
          legenda: montarMensagem({ empresa, versao, nomeDestinatario: dest.nome, link: linkDashboard(empresaId) }),
          extensao: 'xlsx',
          mimeType: MIME_XLSX,
          nomeArquivo: nomeArquivo(versao.numero),
        });
      })
    );
    const enviados = [];
    const falhas = [];
    resultados.forEach((r, i) => {
      if (r.status === 'fulfilled') enviados.push({ nome: destinatarios[i].nome });
      else {
        const motivo = r.reason?.message || String(r.reason);
        console.error(`${prefixo} destinatário "${destinatarios[i].nome}": ${motivo}`);
        falhas.push({ nome: destinatarios[i].nome, motivo });
      }
    });
    console.log(`${prefixo} comunicado enviado para ${enviados.length} de ${destinatarios.length} destinatário(s).`);
    return { status: 'enviado', enviados, falhas };
  } catch (err) {
    console.error(`${prefixo} falha no comunicado:`, err.message);
    return { status: 'erro', motivo: err.message, enviados: [], falhas: [] };
  }
}

// Uma versão com o retrato do cronograma — o filtro "Mudanças da versão" do Gantt (a aba
// Cronogramas e o dashboard) mostra como as obras alteradas eram antes e como ficaram.
async function detalheDaVersao(empresaId, versaoId) {
  return getVersao(empresaId, versaoId, { comCronograma: true });
}

// A planilha do cronograma em vigor (botão de exportar do dashboard): a mesma do comunicado, com as
// obras de agora e, nas abas Alterações e Versão, a última versão gravada (sem versão, só o cronograma).
async function excelAtual(empresaId) {
  const [retrato, { rows }] = await Promise.all([
    cronograma.list(empresaId),
    pool.query(
      `SELECT ${COLUNAS_VERSAO} FROM cronograma_versoes v LEFT JOIN usuarios u ON u.id = v.criado_por
        WHERE v.empresa_id = $1 ORDER BY v.numero DESC LIMIT 1`,
      [empresaId]
    ),
  ]);
  const ultima = rows[0] || { numero: null, alteracoes: [], criado_em: null, criado_por_nome: null, observacao: null };
  const versao = {
    ...ultima,
    exportadaEm: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date()),
    cronograma: { etapas: retrato.etapas, atraso: retrato.atraso, centros: retrato.centros.filter((c) => c.natureza === 'OBRA') },
  };
  const buffer = await cronogramaExcel.gerar({ empresa: await nomeDaEmpresa(empresaId), versao, link: linkDashboard(empresaId) });
  return { buffer, nomeArquivo: ultima.numero ? `${nomeArquivo(ultima.numero)}.xlsx` : 'Cronograma de Obras.xlsx' };
}

async function excelDaVersao(empresaId, versaoId) {
  const versao = await getVersao(empresaId, versaoId, { comCronograma: true });
  const buffer = await cronogramaExcel.gerar({ empresa: await nomeDaEmpresa(empresaId), versao, link: linkDashboard(empresaId) });
  return { buffer, nomeArquivo: `${nomeArquivo(versao.numero)}.xlsx` };
}

module.exports = {
  guardarPendencia,
  listarPendencias,
  descartarPendencia,
  listarVersoes,
  gravarVersao,
  detalheDaVersao,
  excelDaVersao,
  excelAtual,
  montarMensagem,
};
