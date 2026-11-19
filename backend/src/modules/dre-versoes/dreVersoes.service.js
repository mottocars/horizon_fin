const pool = require('../../config/db');
const fotos = require('./fotos');
const matriz = require('../matriz-alcadas/matrizAlcadas.service');

// Operações > DRE Construtoras > aba Versões (database/migrations/2026-11-19-dre-versoes.sql). A DRE é
// publicada por versão:
//   - Sem versão aberta, nada da DRE pode ser alterado (contexto.js recusa) e todo mundo lê a última salva.
//   - Gerar nova versão (NOVA): o realizado vai até o último mês fechado (corte = mês anterior ao de hoje)
//     e, enquanto a versão estiver aberta, é o de hoje (o Monitor de Integrações continua atualizando).
//   - Editar última versão (EDICAO): o realizado fica o da versão editada (a mesma cópia e o mesmo corte).
//   - Abrir uma versão volta a configuração da DRE ao que está na versão de onde ela sai ("reabre já
//     reconfigurado"); excluir a versão aberta volta tudo ao que estava nela.
//   - Salvar: recusa se houver projeção não concluída; registra o que mudou fora da DRE desde a versão de
//     onde saiu; tira as cópias (configuração e, na NOVA, o realizado) e guarda o projetado; mantém só as
//     10 últimas salvas.
//   - A primeira versão (INICIAL) é criada já salva, com o estado do dia, no primeiro acesso à DRE.
//   - Aprovação (Cadastros › Matriz de Alçadas › DRE › Aprovador): a versão salva fica aguardando o Aprovador;
//     só a última salva pode ser aprovada, e a PUBLICADA (dashboard, MCP, Excel do dashboard, Reforma
//     Tributária) é a última aprovada. Sem Aprovador na matriz, a versão é publicada ao salvar.
// Tudo aqui roda no pool base (public), fora de qualquer contexto de versão.

const db = pool.base;
const LIMITE = 10;

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const hojeBrasil = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

// O último mês fechado ('AAAA-MM-01'): o anterior ao mês de hoje.
function mesAnterior() {
  const [a, m] = hojeBrasil().split('-').map(Number);
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, '0')}-01`;
}

const mesBR = (iso) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dataBR = (d) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

const COLS = `id, empresa_id, numero, status, origem, to_char(corte, 'YYYY-MM-DD') AS corte, base_id, foto_realizado,
  foto_config, aberta_por, aberta_por_nome, aberta_em, fechada_por, fechada_por_nome, fechada_em, aprovada_por,
  aprovada_por_nome, aprovada_em`;

// A publicada: a última salva E aprovada (sem nenhuma aprovada, a última salva).
const publicadaDe = (vs) => vs.find((v) => v.status === 'FECHADA' && v.aprovada_em) || vs.find((v) => v.status === 'FECHADA');

async function versoesDa(empresaId, cliente = db) {
  const { rows } = await cliente.query(`SELECT ${COLS} FROM dre_versoes WHERE empresa_id = $1 ORDER BY numero DESC`, [empresaId]);
  return rows;
}

async function nomeDe(usuarioId, cliente = db) {
  if (!usuarioId) return null;
  const { rows } = await cliente.query('SELECT nome FROM usuarios WHERE id = $1', [usuarioId]);
  return rows[0]?.nome || null;
}

// Transação com a trava da empresa (uma operação de versão por vez).
async function transacao(empresaId, fn) {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1), $2)', ['dre_versao', empresaId]);
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

async function registrarEvento(cliente, versaoId, { usuarioId = null, usuarioNome = null, modulo = 'versoes', descricao, detalhes = null }) {
  await cliente.query(
    `INSERT INTO dre_versao_alteracoes (versao_id, modulo, usuario_id, usuario_nome, criado_em, descricao, detalhes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [versaoId, modulo, usuarioId, usuarioNome, new Date(), descricao, detalhes]
  );
}

// O contexto de leitura/gravação de uma versão (config/db.js usa o searchPath; o motor da DRE, o corte).
function contextoDa(empresaId, v) {
  if (v.status === 'ABERTA') {
    return { empresaId, versao: v, modo: 'trabalho', corte: v.corte, searchPath: v.foto_realizado ? `${v.foto_realizado},public` : null };
  }
  return { empresaId, versao: v, modo: 'leitura', corte: v.corte, searchPath: `${v.foto_config},${v.foto_realizado},public` };
}

// ------------------------------------------------------------------------------------- versão inicial

const temVersao = new Set();

async function garantirInicial(empresaId) {
  if (temVersao.has(empresaId)) return;
  const { rows } = await db.query('SELECT 1 FROM dre_versoes WHERE empresa_id = $1 LIMIT 1', [empresaId]);
  if (rows[0]) {
    temVersao.add(empresaId);
    return;
  }
  const criada = await transacao(empresaId, async (c) => {
    const { rows: ja } = await c.query('SELECT 1 FROM dre_versoes WHERE empresa_id = $1 LIMIT 1', [empresaId]);
    if (ja[0]) return null;
    const agora = new Date();
    const corte = mesAnterior();
    const { rows: v } = await c.query(
      `INSERT INTO dre_versoes (empresa_id, numero, status, origem, corte, aberta_por_nome, aberta_em, fechada_por_nome, fechada_em,
                                aprovada_por_nome, aprovada_em)
       VALUES ($1, 1, 'FECHADA', 'INICIAL', $2, 'Sistema', $3, 'Sistema', $3, 'Sistema', $3) RETURNING id`,
      [empresaId, corte, agora]
    );
    const id = v[0].id;
    const fc = await fotos.copiarConfig(c, id, empresaId);
    const fr = await fotos.copiarRealizado(c, id, empresaId);
    await c.query('UPDATE dre_versoes SET foto_config = $2, foto_realizado = $3 WHERE id = $1', [id, fc, fr]);
    await registrarEvento(c, id, {
      usuarioNome: 'Sistema',
      descricao: `Versão 1 criada pelo sistema com a DRE de ${dataBR(agora)} (realizado até ${mesBR(corte)}).`,
    });
    return id;
  });
  temVersao.add(empresaId);
  if (criada) {
    const [v] = (await versoesDa(empresaId)).filter((x) => x.id === criada);
    await pool.comContexto(contextoDa(empresaId, v), () => gravarProjetado(db, empresaId, v)).catch((e) => {
      console.error('[dre-versoes] projetado da versão inicial:', e.message);
    });
  }
}

// --------------------------------------------------------------------------------------- contexto

// `pedido`: 'atual' (a aberta; sem ela, a última salva), 'publicada' (a última salva) ou o número.
async function resolver(empresaId, pedido = 'atual') {
  await garantirInicial(empresaId);
  const vs = await versoesDa(empresaId);
  const aberta = vs.find((v) => v.status === 'ABERTA');
  const publicada = publicadaDe(vs);
  let v;
  if (typeof pedido === 'number') {
    v = vs.find((x) => x.numero === pedido);
    if (!v) throw erro(404, `Versão ${pedido} não encontrada (ficam guardadas só as ${LIMITE} últimas).`);
  } else if (pedido === 'publicada') v = publicada;
  else v = aberta || publicada;
  return contextoDa(empresaId, v);
}

// ------------------------------------------------------------------------------------- projetado

// O projetado da versão (do mês seguinte ao corte em diante), por centro e mês — de onde vem o "Projetado"
// dos meses que fecharem depois (dreProjecoes.service.projetado). Roda dentro do contexto da versão.
async function projetadoDaVersao(empresaId, versao) {
  const projecoes = require('../dre-projecoes/dreProjecoes.service');
  const f = await projecoes.orcamentosDaFonte(empresaId, {});
  const corte = versao.corte.slice(0, 7);
  const linhas = [];
  f.orcamentos.forEach((o) => {
    const { meses, valores } = o.mensal || {};
    (meses || []).forEach((mes, i) => {
      if (mes <= corte) return;
      linhas.push({ centro_id: o.centro_id, mes, valores: Object.fromEntries(Object.entries(valores).map(([mid, vs]) => [mid, vs[i]])) });
    });
  });
  return linhas;
}

async function gravarLinhasProjetado(cliente, versaoId, linhas) {
  await cliente.query('DELETE FROM dre_versao_projetado WHERE versao_id = $1', [versaoId]);
  if (!linhas.length) return;
  await cliente.query(
    `INSERT INTO dre_versao_projetado (versao_id, centro_id, mes, valores)
     SELECT $1, (r->>'centro_id')::int, r->>'mes', r->'valores' FROM jsonb_array_elements($2::jsonb) r`,
    [versaoId, JSON.stringify(linhas)]
  );
}

async function gravarProjetado(cliente, empresaId, versao) {
  await gravarLinhasProjetado(cliente, versao.id, await projetadoDaVersao(empresaId, versao));
}

// ----------------------------------------------------------------------------- abrir / salvar / excluir

async function abrir(empresaId, origem, usuarioId) {
  if (!['NOVA', 'EDICAO'].includes(origem)) throw erro(400, 'Escolha Gerar nova versão ou Editar última versão.');
  await garantirInicial(empresaId);
  const nome = await nomeDe(usuarioId);
  const r = await transacao(empresaId, async (c) => {
    const vs = await versoesDa(empresaId, c);
    const aberta = vs.find((v) => v.status === 'ABERTA');
    if (aberta) throw erro(409, `A versão ${aberta.numero} já está aberta (por ${aberta.aberta_por_nome || 'alguém'}). Salve ou exclua ela antes.`);
    const base = vs.find((v) => v.status === 'FECHADA');
    const corte = origem === 'NOVA' ? mesAnterior() : base.corte;
    const numero = vs[0].numero + 1;
    const agora = new Date();
    const { rows } = await c.query(
      `INSERT INTO dre_versoes (empresa_id, numero, status, origem, corte, base_id, foto_realizado, aberta_por, aberta_por_nome, aberta_em)
       VALUES ($1, $2, 'ABERTA', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [empresaId, numero, origem, corte, base.id, origem === 'EDICAO' ? base.foto_realizado : null, usuarioId, nome, agora]
    );
    // Reabre já reconfigurado: a configuração da DRE volta ao que está na versão de onde esta sai.
    await fotos.restaurar(c, base.foto_config, empresaId);
    await registrarEvento(c, rows[0].id, {
      usuarioId,
      usuarioNome: nome,
      descricao:
        origem === 'NOVA'
          ? `Abriu a versão ${numero} com "Gerar nova versão", a partir da versão ${base.numero}: realizado até ${mesBR(corte)}, atualizado pelo Monitor de Integrações enquanto ela estiver aberta.`
          : `Abriu a versão ${numero} com "Editar última versão", a partir da versão ${base.numero}: realizado congelado como na versão ${base.numero} (até ${mesBR(corte)}).`,
    });
    return { numero };
  });
  return { ...r, ...(await listar(empresaId, usuarioId)) };
}

// O que mudou fora da DRE (cadastro de centros e plano de contas do Sienge, pela DFC, pelo Cadastro ou pela
// sincronização) entre a versão de onde a aberta saiu e agora. A natureza alterada pela própria aba
// Centros Custos da DRE já tem carimbo (`naturezaPelaDre`).
async function foraDaDre(c, base, naturezaPelaDre) {
  const sc = base.foto_config;
  const { rows: centros } = await c.query(
    `SELECT COALESCE(a.sienge_id, s.sienge_id) AS id, a.name AS nome, s.name AS nome_antes,
            NULLIF(TRIM(a.apelido), '') AS apelido, NULLIF(TRIM(s.apelido), '') AS apelido_antes,
            a.natureza, s.natureza AS natureza_antes, a.sienge_id IS NULL AS removido, s.sienge_id IS NULL AS novo
       FROM (SELECT * FROM public.centros_custo_sienge WHERE empresa_id = $1) a
       FULL JOIN ${sc}.centros_custo_sienge s ON s.sienge_id = a.sienge_id
      WHERE a.sienge_id IS NULL OR s.sienge_id IS NULL
         OR a.name IS DISTINCT FROM s.name OR NULLIF(TRIM(a.apelido), '') IS DISTINCT FROM NULLIF(TRIM(s.apelido), '')
         OR a.natureza IS DISTINCT FROM s.natureza
      ORDER BY 1`,
    [base.empresa_id]
  );
  const tipo = (n) => ({ OBRA: 'Obra', ADMINISTRATIVO: 'Administrativo' }[n] || 'sem tipo');
  const eventos = [];
  centros.forEach((x) => {
    const rot = `${x.id} - ${x.apelido || x.nome || x.apelido_antes || x.nome_antes}`;
    if (x.novo) return eventos.push({ modulo: 'centros-custos', descricao: `Centro de custo novo no cadastro: ${rot}.` });
    if (x.removido) return eventos.push({ modulo: 'centros-custos', descricao: `Centro de custo saiu do cadastro: ${rot}.` });
    const partes = [];
    if (x.nome !== x.nome_antes) partes.push(`nome "${x.nome_antes}" → "${x.nome}"`);
    if (x.apelido !== x.apelido_antes) partes.push(`apelido "${x.apelido_antes || '(vazio)'}" → "${x.apelido || '(vazio)'}"`);
    if (x.natureza !== x.natureza_antes && !naturezaPelaDre.has(Number(x.id))) partes.push(`Tipo ${tipo(x.natureza_antes)} → ${tipo(x.natureza)}`);
    if (partes.length) eventos.push({ modulo: 'centros-custos', descricao: `${rot}: ${partes.join('; ')}.`, detalhes: { centro_id: Number(x.id) } });
  });
  const { rows: contas } = await c.query(
    `SELECT COALESCE(a.sienge_id, s.sienge_id) AS id, a.name AS nome, s.name AS nome_antes,
            a.sienge_id IS NULL AS removida, s.sienge_id IS NULL AS nova
       FROM (SELECT * FROM public.planos_financeiros_sienge WHERE empresa_id = $1) a
       FULL JOIN ${sc}.planos_financeiros_sienge s ON s.sienge_id = a.sienge_id
      WHERE a.sienge_id IS NULL OR s.sienge_id IS NULL OR a.name IS DISTINCT FROM s.name
      ORDER BY 1`,
    [base.empresa_id]
  );
  const lista = (xs, f) => `${xs.slice(0, 15).map(f).join('; ')}${xs.length > 15 ? `; e mais ${xs.length - 15}` : ''}`;
  const novas = contas.filter((x) => x.nova);
  const removidas = contas.filter((x) => x.removida);
  const renomeadas = contas.filter((x) => !x.nova && !x.removida);
  if (novas.length) eventos.push({ modulo: 'plano-de-contas', descricao: `Contas novas no plano de contas do Sienge (${novas.length}): ${lista(novas, (x) => `${x.id} ${x.nome}`)}.` });
  if (removidas.length) eventos.push({ modulo: 'plano-de-contas', descricao: `Contas que saíram do plano de contas do Sienge (${removidas.length}): ${lista(removidas, (x) => `${x.id} ${x.nome_antes}`)}.` });
  if (renomeadas.length) {
    eventos.push({
      modulo: 'plano-de-contas',
      descricao: `Contas renomeadas no plano de contas do Sienge (${renomeadas.length}): ${lista(renomeadas, (x) => `${x.id} "${x.nome_antes}" → "${x.nome}"`)}.`,
    });
  }
  return eventos.map((e) => ({ ...e, descricao: `Alterado fora da DRE — ${e.descricao}` }));
}

// Centros cuja natureza (Tipo) foi alterada pela aba Centros Custos da DRE na versão `versaoId`.
async function naturezasPelaDre(cliente, versaoId) {
  const { rows } = await cliente.query(
    `SELECT DISTINCT (detalhes->>'centro_id')::int AS id FROM dre_versao_alteracoes
      WHERE versao_id = $1 AND modulo = 'centros-custos' AND usuario_id IS NOT NULL AND detalhes->>'campo' = 'natureza'`,
    [versaoId]
  );
  return new Set(rows.map((r) => r.id));
}

async function salvar(empresaId, usuarioId) {
  const vs = await versoesDa(empresaId);
  const aberta = vs.find((v) => v.status === 'ABERTA');
  if (!aberta) throw erro(404, 'Não há versão aberta para salvar.');
  const { rows: pendentes } = await db.query(
    `SELECT COALESCE(NULLIF(TRIM(c.apelido), ''), c.name) AS nome
       FROM dre_projecao_orcamentos o
       JOIN centros_custo_sienge c ON c.empresa_id = o.empresa_id AND c.sienge_id = o.centro_id
      WHERE o.empresa_id = $1 AND o.versao_id IS NULL AND o.status <> 'CONCLUIDO'
      ORDER BY c.dre_ordem NULLS LAST, c.sienge_id`,
    [empresaId]
  );
  if (pendentes.length) {
    throw erro(
      400,
      `Existem projeções não concluídas: ${pendentes.map((p) => p.nome).join(', ')}. Conclua ou descarte cada uma na aba Projeções antes de salvar a versão.`
    );
  }
  // O projetado é lido antes, no contexto da própria versão aberta (o que vai ficar na cópia).
  const linhasProjetado = await pool.comContexto(contextoDa(empresaId, aberta), () => projetadoDaVersao(empresaId, aberta));
  const nome = await nomeDe(usuarioId);
  const removidas = [];
  const r = await transacao(empresaId, async (c) => {
    const [v] = (await versoesDa(empresaId, c)).filter((x) => x.status === 'ABERTA');
    if (!v || v.id !== aberta.id) throw erro(409, 'A versão aberta mudou. Recarregue a tela.');
    const [base] = v.base_id ? (await versoesDa(empresaId, c)).filter((x) => x.id === v.base_id) : [];
    if (base?.foto_config) {
      const eventos = await foraDaDre(c, base, await naturezasPelaDre(c, v.id));
      for (const e of eventos) await registrarEvento(c, v.id, e);
    }
    const fc = await fotos.copiarConfig(c, v.id, empresaId);
    const fr = v.origem === 'NOVA' ? await fotos.copiarRealizado(c, v.id, empresaId) : v.foto_realizado;
    await gravarLinhasProjetado(c, v.id, linhasProjetado);
    const agora = new Date();
    await c.query(
      `UPDATE dre_versoes SET status = 'FECHADA', foto_config = $2, foto_realizado = $3, fechada_por = $4, fechada_por_nome = $5, fechada_em = $6
        WHERE id = $1`,
      [v.id, fc, fr, usuarioId, nome, agora]
    );
    // Aprovação (Matriz de Alçadas): com Aprovador, a versão espera por ele; sem, é publicada ao salvar.
    const aprovador = await matriz.usuarioDo(empresaId, 'DRE', 'APROVADOR');
    if (aprovador) {
      await registrarEvento(c, v.id, {
        usuarioId,
        usuarioNome: nome,
        descricao: `Salvou a versão ${v.numero}: aguardando a aprovação de ${aprovador.nome} (Matriz de Alçadas) para ser publicada.`,
      });
    } else {
      await c.query('UPDATE dre_versoes SET aprovada_por = $2, aprovada_por_nome = $3, aprovada_em = $4 WHERE id = $1', [v.id, usuarioId, nome, agora]);
      await registrarEvento(c, v.id, {
        usuarioId,
        usuarioNome: nome,
        descricao: `Salvou a versão ${v.numero} e ela foi publicada: a empresa não tem Aprovador da DRE na Matriz de Alçadas.`,
      });
    }
    // Só as 10 últimas salvas — e nunca a publicada (a última aprovada), mesmo que seja mais antiga.
    const publicada = publicadaDe(await versoesDa(empresaId, c));
    const { rows: velhas } = await c.query(
      `SELECT id, numero, foto_config, foto_realizado FROM dre_versoes WHERE empresa_id = $1 AND status = 'FECHADA' AND id <> $2
        ORDER BY numero DESC OFFSET ${LIMITE}`,
      [empresaId, publicada.id]
    );
    for (const x of velhas) {
      await c.query('DELETE FROM dre_versoes WHERE id = $1', [x.id]);
      await fotos.apagar(c, x.foto_config);
      const { rows: usa } = await c.query('SELECT 1 FROM dre_versoes WHERE foto_realizado = $1 LIMIT 1', [x.foto_realizado]);
      if (!usa[0]) await fotos.apagar(c, x.foto_realizado);
      removidas.push(x);
    }
    return { numero: v.numero, removidas: removidas.map((x) => x.numero), aguardando: aprovador ? aprovador.nome : null };
  });
  removidas.forEach((x) => pool.descartarCaminhos(x.foto_config));
  // Workflows (Operações › Workflows): versão salva; sem Aprovador, ela já foi publicada — versão aprovada também.
  const workflows = require('../workflows/workflows.service');
  workflows.disparar(empresaId, 'DRE_VERSAO_SALVA', { versao: r.numero, usuario_id: usuarioId });
  if (!r.aguardando) workflows.disparar(empresaId, 'DRE_VERSAO_APROVADA', { versao: r.numero, usuario_id: usuarioId });
  return { ...r, ...(await listar(empresaId, usuarioId)) };
}

// Aprova a última versão salva (só o Aprovador da DRE na Matriz de Alçadas): ela passa a ser a publicada.
async function aprovar(empresaId, usuarioId) {
  const aprovador = await matriz.usuarioDo(empresaId, 'DRE', 'APROVADOR');
  if (!aprovador) throw erro(400, 'A empresa não tem Aprovador da DRE na Matriz de Alçadas (Cadastros).');
  if (aprovador.id !== usuarioId) throw erro(403, `Só ${aprovador.nome} (Aprovador da DRE na Matriz de Alçadas) pode aprovar a versão.`);
  const nome = await nomeDe(usuarioId);
  const r = await transacao(empresaId, async (c) => {
    const v = (await versoesDa(empresaId, c)).find((x) => x.status === 'FECHADA');
    if (!v || v.aprovada_em) throw erro(409, 'Não há versão aguardando aprovação (só a última versão salva pode ser aprovada).');
    await c.query('UPDATE dre_versoes SET aprovada_por = $2, aprovada_por_nome = $3, aprovada_em = $4 WHERE id = $1', [v.id, usuarioId, nome, new Date()]);
    await registrarEvento(c, v.id, {
      usuarioId,
      usuarioNome: nome,
      descricao: `Aprovou a versão ${v.numero}: ela passa a ser a publicada (dashboards, MCP, Excel do dashboard e Reforma Tributária).`,
    });
    return { numero: v.numero };
  });
  // Workflows (Operações › Workflows): versão aprovada (a nova publicada).
  require('../workflows/workflows.service').disparar(empresaId, 'DRE_VERSAO_APROVADA', { versao: r.numero, usuario_id: usuarioId });
  return { ...r, ...(await listar(empresaId, usuarioId)) };
}

async function excluir(empresaId, usuarioId) {
  const nome = await nomeDe(usuarioId);
  const r = await transacao(empresaId, async (c) => {
    const vs = await versoesDa(empresaId, c);
    const v = vs.find((x) => x.status === 'ABERTA');
    if (!v) throw erro(404, 'Não há versão aberta para excluir.');
    const base = vs.find((x) => x.id === v.base_id) || vs.find((x) => x.status === 'FECHADA');
    const naturezaDe = [...(await naturezasPelaDre(c, v.id))];
    await fotos.restaurar(c, base.foto_config, empresaId, { naturezaDe });
    await c.query('DELETE FROM dre_versoes WHERE id = $1', [v.id]);
    // O rastro fica na versão de onde ela saiu.
    await registrarEvento(c, base.id, {
      usuarioId,
      usuarioNome: nome,
      descricao: `Excluiu o rascunho da versão ${v.numero} (aberto por ${v.aberta_por_nome || 'alguém'} em ${dataBR(v.aberta_em)}): tudo voltou ao que está na versão ${base.numero}.`,
    });
    return { numero: v.numero };
  });
  return { ...r, ...(await listar(empresaId, usuarioId)) };
}

// ------------------------------------------------------------------------------------------ leitura

// `usuarioId`: quem pede (pra saber se pode aprovar). `publicada` = a última aprovada; `pendente` = a última
// salva quando ainda não foi aprovada; `aprovador` = o da Matriz de Alçadas.
async function listar(empresaId, usuarioId = null) {
  await garantirInicial(empresaId);
  const { rows } = await db.query(
    `SELECT v.id, v.numero, v.status, v.origem, to_char(v.corte, 'YYYY-MM-DD') AS corte, v.base_id, b.numero AS base_numero,
            v.foto_realizado, v.foto_config, v.aberta_por, v.aberta_por_nome, v.aberta_em, v.fechada_por, v.fechada_por_nome,
            v.fechada_em, v.aprovada_por, v.aprovada_por_nome, v.aprovada_em,
            (SELECT count(*)::int FROM dre_versao_alteracoes a WHERE a.versao_id = v.id) AS alteracoes
       FROM dre_versoes v LEFT JOIN dre_versoes b ON b.id = v.base_id
      WHERE v.empresa_id = $1 ORDER BY v.numero DESC`,
    [empresaId]
  );
  const versoes = await Promise.all(
    rows.map(async (v) => ({
      ...v,
      tamanho_bytes: (await fotos.tamanho(db, v.foto_config)) + (v.origem === 'EDICAO' ? 0 : await fotos.tamanho(db, v.foto_realizado)),
    }))
  );
  const ultimaSalva = versoes.find((v) => v.status === 'FECHADA') || null;
  const pendente = ultimaSalva && !ultimaSalva.aprovada_em ? ultimaSalva : null;
  const aprovador = await matriz.usuarioDo(empresaId, 'DRE', 'APROVADOR');
  return {
    limite: LIMITE,
    proximo_corte: mesAnterior(),
    aberta: versoes.find((v) => v.status === 'ABERTA') || null,
    publicada: publicadaDe(versoes) || null,
    pendente,
    aprovador,
    pode_aprovar: Boolean(pendente && aprovador && aprovador.id === usuarioId),
    versoes,
  };
}

// Cabeçalho do dashboard Demonstração do Resultado: a versão publicada (a última aprovada), quem a abriu e quem a
// fechou (o Responsável), quem a aprovou (o Aprovador, com a data e hora) e
// os Colaboradores (todo usuário com alguma alteração carimbada nela), com a foto (avatar_url) de cada um.
async function cabecalhoPublicada(empresaId) {
  await garantirInicial(empresaId);
  const v = publicadaDe(await versoesDa(empresaId));
  if (!v) return null;
  const { rows: colab } = await db.query(
    `SELECT usuario_id, COUNT(*)::int AS alteracoes, MIN(criado_em) AS primeira, MAX(criado_em) AS ultima
       FROM dre_versao_alteracoes WHERE versao_id = $1 AND usuario_id IS NOT NULL
      GROUP BY usuario_id ORDER BY COUNT(*) DESC, MIN(criado_em)`,
    [v.id]
  );
  const ids = [...new Set([v.aberta_por, v.fechada_por, v.aprovada_por, ...colab.map((c) => c.usuario_id)].filter(Boolean))];
  const { rows: us } = ids.length
    ? await db.query('SELECT id, nome, avatar_url, email, telefone_ddd, telefone_numero FROM usuarios WHERE id = ANY($1::int[])', [ids])
    : { rows: [] };
  const porId = new Map(us.map((u) => [u.id, u]));
  // Usuário apagado ou o "Sistema" (versão inicial): só o nome gravado na versão.
  const pessoa = (id, nome) => (id && porId.get(id) ? { ...porId.get(id) } : { id: null, nome: nome || 'Sistema', avatar_url: null, email: null, telefone_ddd: null, telefone_numero: null });
  const abriu = pessoa(v.aberta_por, v.aberta_por_nome);
  const fechou = pessoa(v.fechada_por, v.fechada_por_nome);
  return {
    numero: v.numero,
    origem: v.origem,
    corte: v.corte.slice(0, 7),
    aberta_em: v.aberta_em,
    fechada_em: v.fechada_em,
    abriu,
    fechou,
    aprovador: pessoa(v.aprovada_por, v.aprovada_por_nome || v.fechada_por_nome),
    aprovado_em: v.aprovada_em || v.fechada_em,
    // Contato (e-mail e telefone) só do Responsável e do Aprovador — a lista de colaboradores mostra nome e foto.
    colaboradores: colab.map((c) => {
      const { email, telefone_ddd: _d, telefone_numero: _n, ...p } = pessoa(c.usuario_id); // eslint-disable-line no-unused-vars
      return { ...p, alteracoes: c.alteracoes, primeira: c.primeira, ultima: c.ultima };
    }),
  };
}

async function alteracoes(empresaId, numero) {
  const { rows: v } = await db.query('SELECT id FROM dre_versoes WHERE empresa_id = $1 AND numero = $2', [empresaId, numero]);
  if (!v[0]) throw erro(404, `Versão ${numero} não encontrada.`);
  const { rows } = await db.query(
    `SELECT id, modulo, usuario_id, usuario_nome, criado_em, descricao, detalhes
       FROM dre_versao_alteracoes WHERE versao_id = $1 ORDER BY criado_em DESC, id DESC`,
    [v[0].id]
  );
  return rows;
}

module.exports = {
  LIMITE,
  mesAnterior,
  resolver,
  garantirInicial,
  contextoDa,
  abrir,
  salvar,
  aprovar,
  excluir,
  listar,
  alteracoes,
  cabecalhoPublicada,
  nomeDe,
};
