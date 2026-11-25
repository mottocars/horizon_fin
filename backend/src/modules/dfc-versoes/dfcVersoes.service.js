const pool = require('../../config/db');
const fotos = require('./fotos');
const matriz = require('../matriz-alcadas/matrizAlcadas.service');

// Operações > DFC Construtoras > aba Versões (database/migrations/2026-11-26-dfc-versoes.sql) — a mesma lógica das
// versões da DRE (dre-versoes/dreVersoes.service.js), pedida pelo usuário em 25/11/2026:
//   - Sem versão aberta, nada da DFC pode ser alterado (contexto.js recusa) e todo mundo lê a última salva.
//   - Gerar nova versão (NOVA): o realizado vai até o último mês fechado (corte = mês anterior ao de hoje) e,
//     enquanto a versão estiver aberta, é o de hoje (o Monitor de Integrações continua atualizando o extrato).
//   - Editar última versão (EDICAO): o realizado fica o da versão editada (a mesma cópia e o mesmo corte).
//   - Abrir uma versão volta a configuração da DFC ao que está na versão de onde ela sai; excluir a versão
//     aberta volta tudo ao que estava nela (inclusive o Orçamento gerado nela).
//   - O Orçamento (aba Projeções) é gerado dentro da versão aberta ("Gerar orçamento") e fica cravado ao salvar.
//   - Salvar: registra o que mudou fora da DFC desde a versão de onde saiu; tira as cópias (configuração +
//     Orçamento e, na NOVA, o realizado); mantém só as 10 últimas salvas (nunca a publicada).
//   - A primeira versão (INICIAL) é criada já salva e aprovada pelo "Sistema", com o estado do dia, no primeiro
//     acesso à DFC.
//   - Aprovação (Cadastros › Matriz de Alçadas › DFC › Aprovador): a versão salva fica aguardando o Aprovador; só a
//     última salva pode ser aprovada ou reprovada; a PUBLICADA (dashboard Fluxo de Caixa, MCP, Excel do dashboard,
//     Impacto DFC da Reforma Tributária) é a última aprovada. Sem Aprovador, a versão é publicada ao salvar.
// Tudo aqui roda no pool base (public), fora de qualquer contexto de versão.

const db = pool.base;
const LIMITE = 10;
const CLASSIFICACAO = 'DFC';

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
  aprovada_por_nome, aprovada_em, reprovada_por, reprovada_por_nome, reprovada_em, reprovacao_motivo`;

// A publicada: a última salva E aprovada (sem nenhuma aprovada, a última salva).
const publicadaDe = (vs) => vs.find((v) => v.status === 'FECHADA' && v.aprovada_em) || vs.find((v) => v.status === 'FECHADA');

async function versoesDa(empresaId, cliente = db) {
  const { rows } = await cliente.query(`SELECT ${COLS} FROM dfc_versoes WHERE empresa_id = $1 ORDER BY numero DESC`, [empresaId]);
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
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1), $2)', ['dfc_versao', empresaId]);
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
    `INSERT INTO dfc_versao_alteracoes (versao_id, modulo, usuario_id, usuario_nome, criado_em, descricao, detalhes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [versaoId, modulo, usuarioId, usuarioNome, new Date(), descricao, detalhes]
  );
}

// O contexto de leitura/gravação de uma versão: config/db.js usa o `searchPath`; o resto da DFC lê `dfc`
// ({ versao, modo, corte }) — num campo próprio, pra não se confundir com o contexto das versões da DRE (que usa
// `versao`, `modo` e `corte` no topo).
function contextoDa(empresaId, v) {
  const dfc = { empresaId, versao: v, modo: v.status === 'ABERTA' ? 'trabalho' : 'leitura', corte: v.corte };
  if (v.status === 'ABERTA') return { sistema: 'dfc', dfc, searchPath: v.foto_realizado ? `${v.foto_realizado},public` : null };
  return { sistema: 'dfc', dfc, searchPath: `${v.foto_config},${v.foto_realizado},public` };
}

// ------------------------------------------------------------------------------------- versão inicial

const temVersao = new Set();

async function garantirInicial(empresaId) {
  if (temVersao.has(empresaId)) return;
  const { rows } = await db.query('SELECT 1 FROM dfc_versoes WHERE empresa_id = $1 LIMIT 1', [empresaId]);
  if (rows[0]) {
    temVersao.add(empresaId);
    return;
  }
  await transacao(empresaId, async (c) => {
    const { rows: ja } = await c.query('SELECT 1 FROM dfc_versoes WHERE empresa_id = $1 LIMIT 1', [empresaId]);
    if (ja[0]) return;
    const agora = new Date();
    const corte = mesAnterior();
    const { rows: v } = await c.query(
      `INSERT INTO dfc_versoes (empresa_id, numero, status, origem, corte, aberta_por_nome, aberta_em, fechada_por_nome, fechada_em,
                                aprovada_por_nome, aprovada_em)
       VALUES ($1, 1, 'FECHADA', 'INICIAL', $2, 'Sistema', $3, 'Sistema', $3, 'Sistema', $3) RETURNING id`,
      [empresaId, corte, agora]
    );
    const id = v[0].id;
    // As gerações do Orçamento feitas antes das versões da DFC ficam na versão 1.
    await c.query('UPDATE dfc_orcamento_versoes SET dfc_versao_id = $2 WHERE empresa_id = $1 AND dfc_versao_id IS NULL', [empresaId, id]);
    const fc = await fotos.copiarConfig(c, id, empresaId);
    const fr = await fotos.copiarRealizado(c, id, empresaId);
    await c.query('UPDATE dfc_versoes SET foto_config = $2, foto_realizado = $3 WHERE id = $1', [id, fc, fr]);
    await registrarEvento(c, id, {
      usuarioNome: 'Sistema',
      descricao: `Versão 1 criada pelo sistema com a DFC de ${dataBR(agora)} (realizado até ${mesBR(corte)}), já aprovada.`,
    });
  });
  temVersao.add(empresaId);
}

// --------------------------------------------------------------------------------------- contexto

// `pedido`: 'atual' (a aberta; sem ela, a última salva), 'publicada' (a última aprovada) ou o número.
async function resolver(empresaId, pedido = 'atual') {
  await garantirInicial(empresaId);
  const vs = await versoesDa(empresaId);
  const aberta = vs.find((v) => v.status === 'ABERTA');
  const ultimaSalva = vs.find((v) => v.status === 'FECHADA');
  let v;
  if (typeof pedido === 'number') {
    v = vs.find((x) => x.numero === pedido);
    if (!v) throw erro(404, `Versão ${pedido} da DFC não encontrada (ficam guardadas só as ${LIMITE} últimas).`);
  } else if (pedido === 'publicada') v = publicadaDe(vs);
  else v = aberta || ultimaSalva;
  return contextoDa(empresaId, v);
}

// ----------------------------------------------------------------------------- abrir / salvar / excluir

async function abrir(empresaId, origem, usuarioId) {
  if (!['NOVA', 'EDICAO'].includes(origem)) throw erro(400, 'Escolha Gerar nova versão ou Editar última versão.');
  await garantirInicial(empresaId);
  const nome = await nomeDe(usuarioId);
  const r = await transacao(empresaId, async (c) => {
    const vs = await versoesDa(empresaId, c);
    const aberta = vs.find((v) => v.status === 'ABERTA');
    if (aberta) throw erro(409, `A versão ${aberta.numero} da DFC já está aberta (por ${aberta.aberta_por_nome || 'alguém'}). Salve ou exclua ela antes.`);
    const base = vs.find((v) => v.status === 'FECHADA');
    const corte = origem === 'NOVA' ? mesAnterior() : base.corte;
    const numero = vs[0].numero + 1;
    const agora = new Date();
    const { rows } = await c.query(
      `INSERT INTO dfc_versoes (empresa_id, numero, status, origem, corte, base_id, foto_realizado, aberta_por, aberta_por_nome, aberta_em)
       VALUES ($1, $2, 'ABERTA', $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [empresaId, numero, origem, corte, base.id, origem === 'EDICAO' ? base.foto_realizado : null, usuarioId, nome, agora]
    );
    // Reabre já reconfigurado: a configuração e o Orçamento da DFC voltam ao que está na versão de onde esta sai.
    await fotos.restaurar(c, base.foto_config, empresaId);
    await registrarEvento(c, rows[0].id, {
      usuarioId,
      usuarioNome: nome,
      descricao:
        origem === 'NOVA'
          ? `Abriu a versão ${numero} com "Gerar nova versão", a partir da versão ${base.numero}: realizado até ${mesBR(corte)}, atualizado pelo Monitor de Integrações enquanto ela estiver aberta. Gere o orçamento na aba Projeções antes de salvar.`
          : `Abriu a versão ${numero} com "Editar última versão", a partir da versão ${base.numero}: realizado congelado como na versão ${base.numero} (até ${mesBR(corte)}).`,
    });
    return { numero };
  });
  return { ...r, ...(await listar(empresaId, usuarioId)) };
}

// O que mudou fora da DFC (cadastro de centros e plano de contas do Sienge, pela DRE, pelo Cadastro ou pela
// sincronização; contas bancárias novas) entre a versão de onde a aberta saiu e agora. A natureza alterada pela
// própria aba Centros Custos da DFC já tem carimbo (`naturezaPelaDfc`).
async function foraDaDfc(c, base, naturezaPelaDfc) {
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
    if (x.natureza !== x.natureza_antes && !naturezaPelaDfc.has(Number(x.id))) partes.push(`Tipo ${tipo(x.natureza_antes)} → ${tipo(x.natureza)}`);
    if (partes.length) eventos.push({ modulo: 'centros-custos', descricao: `${rot}: ${partes.join('; ')}.`, detalhes: { centro_id: Number(x.id) } });
  });
  const lista = (xs, f) => `${xs.slice(0, 15).map(f).join('; ')}${xs.length > 15 ? `; e mais ${xs.length - 15}` : ''}`;
  const { rows: contas } = await c.query(
    `SELECT COALESCE(a.sienge_id, s.sienge_id) AS id, a.name AS nome, s.name AS nome_antes,
            a.sienge_id IS NULL AS removida, s.sienge_id IS NULL AS nova
       FROM (SELECT * FROM public.planos_financeiros_sienge WHERE empresa_id = $1) a
       FULL JOIN ${sc}.planos_financeiros_sienge s ON s.sienge_id = a.sienge_id
      WHERE a.sienge_id IS NULL OR s.sienge_id IS NULL OR a.name IS DISTINCT FROM s.name
      ORDER BY 1`,
    [base.empresa_id]
  );
  const novas = contas.filter((x) => x.nova);
  const removidas = contas.filter((x) => x.removida);
  const renomeadas = contas.filter((x) => !x.nova && !x.removida);
  if (novas.length) eventos.push({ modulo: 'plano-contas', descricao: `Contas novas no plano de contas do Sienge (${novas.length}): ${lista(novas, (x) => `${x.id} ${x.nome}`)}.` });
  if (removidas.length) eventos.push({ modulo: 'plano-contas', descricao: `Contas que saíram do plano de contas do Sienge (${removidas.length}): ${lista(removidas, (x) => `${x.id} ${x.nome_antes}`)}.` });
  if (renomeadas.length) {
    eventos.push({
      modulo: 'plano-contas',
      descricao: `Contas renomeadas no plano de contas do Sienge (${renomeadas.length}): ${lista(renomeadas, (x) => `${x.id} "${x.nome_antes}" → "${x.nome}"`)}.`,
    });
  }
  const { rows: bancarias } = await c.query(
    `SELECT a.numero_conta, a.nome, a.company_name
       FROM public.contas_bancarias_sienge a
       LEFT JOIN ${sc}.contas_bancarias_sienge s ON s.company_id = a.company_id AND s.numero_conta = a.numero_conta
      WHERE a.empresa_id = $1 AND s.numero_conta IS NULL
      ORDER BY a.company_name, a.numero_conta`,
    [base.empresa_id]
  );
  if (bancarias.length) {
    eventos.push({
      modulo: 'contas-correntes',
      descricao: `Contas bancárias novas no Sienge (${bancarias.length}): ${lista(bancarias, (x) => `${x.numero_conta} ${x.nome || ''}`.trim())}.`,
    });
  }
  return eventos.map((e) => ({ ...e, descricao: `Alterado fora da DFC — ${e.descricao}` }));
}

// Centros cuja natureza (Tipo) foi alterada pela aba Centros Custos da DFC na versão `versaoId`.
async function naturezasPelaDfc(cliente, versaoId) {
  const { rows } = await cliente.query(
    `SELECT DISTINCT (detalhes->>'centro_id')::int AS id FROM dfc_versao_alteracoes
      WHERE versao_id = $1 AND modulo = 'centros-custos' AND usuario_id IS NOT NULL AND detalhes ? 'natureza'`,
    [versaoId]
  );
  return new Set(rows.map((r) => r.id).filter(Boolean));
}

// O Orçamento gerado na versão `versaoId` (aba Projeções › Gerar orçamento): a última geração, ou null.
async function geracaoDa(versaoId, cliente = db) {
  const { rows } = await cliente.query(
    `SELECT g.criado_em, u.nome AS usuario, g.inclusoes, g.alteracoes, g.exclusoes
       FROM dfc_orcamento_versoes g LEFT JOIN usuarios u ON u.id = g.usuario_id
      WHERE g.dfc_versao_id = $1 ORDER BY g.numero DESC LIMIT 1`,
    [versaoId]
  );
  return rows[0] || null;
}

async function salvar(empresaId, usuarioId) {
  const vs = await versoesDa(empresaId);
  const aberta = vs.find((v) => v.status === 'ABERTA');
  if (!aberta) throw erro(404, 'Não há versão aberta da DFC para salvar.');
  const nome = await nomeDe(usuarioId);
  const removidas = [];
  const r = await transacao(empresaId, async (c) => {
    const [v] = (await versoesDa(empresaId, c)).filter((x) => x.status === 'ABERTA');
    if (!v || v.id !== aberta.id) throw erro(409, 'A versão aberta mudou. Recarregue a tela.');
    const [base] = v.base_id ? (await versoesDa(empresaId, c)).filter((x) => x.id === v.base_id) : [];
    if (base?.foto_config) {
      const eventos = await foraDaDfc(c, base, await naturezasPelaDfc(c, v.id));
      for (const e of eventos) await registrarEvento(c, v.id, e);
    }
    const fc = await fotos.copiarConfig(c, v.id, empresaId);
    const fr = v.origem === 'NOVA' ? await fotos.copiarRealizado(c, v.id, empresaId) : v.foto_realizado;
    const agora = new Date();
    await c.query(
      `UPDATE dfc_versoes SET status = 'FECHADA', foto_config = $2, foto_realizado = $3, fechada_por = $4, fechada_por_nome = $5, fechada_em = $6
        WHERE id = $1`,
      [v.id, fc, fr, usuarioId, nome, agora]
    );
    const geracao = await geracaoDa(v.id, c);
    const sobreOrcamento = geracao
      ? `Orçamento gerado em ${dataBR(geracao.criado_em)}${geracao.usuario ? ` por ${geracao.usuario}` : ''}`
      : `Orçamento não foi gerado nesta versão (ficou o da versão ${base?.numero ?? '—'})`;
    // Aprovação (Matriz de Alçadas): com Aprovador, a versão espera por ele; sem, é publicada ao salvar.
    const aprovador = await matriz.usuarioDo(empresaId, CLASSIFICACAO, 'APROVADOR');
    if (aprovador) {
      await registrarEvento(c, v.id, {
        usuarioId,
        usuarioNome: nome,
        descricao: `Salvou a versão ${v.numero} (${sobreOrcamento}): aguardando a aprovação de ${aprovador.nome} (Matriz de Alçadas) para ser publicada.`,
      });
    } else {
      await c.query('UPDATE dfc_versoes SET aprovada_por = $2, aprovada_por_nome = $3, aprovada_em = $4 WHERE id = $1', [v.id, usuarioId, nome, agora]);
      await registrarEvento(c, v.id, {
        usuarioId,
        usuarioNome: nome,
        descricao: `Salvou a versão ${v.numero} (${sobreOrcamento}) e ela foi publicada: a empresa não tem Aprovador da DFC na Matriz de Alçadas.`,
      });
    }
    // Só as 10 últimas salvas — e nunca a publicada (a última aprovada), mesmo que seja mais antiga.
    const publicada = publicadaDe(await versoesDa(empresaId, c));
    const { rows: velhas } = await c.query(
      `SELECT id, numero, foto_config, foto_realizado FROM dfc_versoes WHERE empresa_id = $1 AND status = 'FECHADA' AND id <> $2
        ORDER BY numero DESC OFFSET ${LIMITE}`,
      [empresaId, publicada.id]
    );
    for (const x of velhas) {
      // As gerações do Orçamento da versão apagada continuam (o Orçamento consolidado aponta pra elas): só
      // perdem o vínculo com a versão (SET NULL).
      await c.query('DELETE FROM dfc_versoes WHERE id = $1', [x.id]);
      await fotos.apagar(c, x.foto_config);
      const { rows: usa } = await c.query('SELECT 1 FROM dfc_versoes WHERE foto_realizado = $1 LIMIT 1', [x.foto_realizado]);
      if (!usa[0]) await fotos.apagar(c, x.foto_realizado);
      removidas.push(x);
    }
    return { numero: v.numero, removidas: removidas.map((x) => x.numero), aguardando: aprovador ? aprovador.nome : null };
  });
  removidas.forEach((x) => {
    pool.descartarCaminhos(x.foto_config);
    pool.descartarCaminhos(x.foto_realizado);
  });
  // Workflows (Operações › Workflows): versão salva; sem Aprovador, ela já foi publicada — versão aprovada também.
  const workflows = require('../workflows/workflows.service');
  workflows.disparar(empresaId, 'DFC_VERSAO_SALVA', { versao: r.numero, usuario_id: usuarioId });
  if (!r.aguardando) workflows.disparar(empresaId, 'DFC_VERSAO_APROVADA', { versao: r.numero, usuario_id: usuarioId });
  return { ...r, ...(await listar(empresaId, usuarioId)) };
}

// Aprova a última versão salva (só o Aprovador da DFC na Matriz de Alçadas): ela passa a ser a publicada.
async function aprovar(empresaId, usuarioId) {
  const aprovador = await matriz.usuarioDo(empresaId, CLASSIFICACAO, 'APROVADOR');
  if (!aprovador) throw erro(400, 'A empresa não tem Aprovador da DFC na Matriz de Alçadas (Cadastros).');
  if (aprovador.id !== usuarioId) throw erro(403, `Só ${aprovador.nome} (Aprovador da DFC na Matriz de Alçadas) pode aprovar a versão.`);
  const nome = await nomeDe(usuarioId);
  const r = await transacao(empresaId, async (c) => {
    const v = (await versoesDa(empresaId, c)).find((x) => x.status === 'FECHADA');
    if (!v || v.aprovada_em || v.reprovada_em) throw erro(409, 'Não há versão da DFC aguardando aprovação (só a última versão salva pode ser aprovada).');
    await c.query('UPDATE dfc_versoes SET aprovada_por = $2, aprovada_por_nome = $3, aprovada_em = $4 WHERE id = $1', [v.id, usuarioId, nome, new Date()]);
    await registrarEvento(c, v.id, {
      usuarioId,
      usuarioNome: nome,
      descricao: `Aprovou a versão ${v.numero}: ela passa a ser a publicada (dashboard Fluxo de Caixa, MCP, Excel do dashboard e Impacto DFC da Reforma Tributária).`,
    });
    return { numero: v.numero };
  });
  require('../workflows/workflows.service').disparar(empresaId, 'DFC_VERSAO_APROVADA', { versao: r.numero, usuario_id: usuarioId });
  return { ...r, ...(await listar(empresaId, usuarioId)) };
}

// Reprova a última versão salva (só o Aprovador), com o motivo: ela não é publicada e, pra corrigir, o
// responsável edita a última versão e salva de novo.
async function reprovar(empresaId, usuarioId, motivo) {
  const texto = String(motivo || '').trim();
  if (!texto) throw erro(400, 'Escreva o motivo da reprovação.');
  const aprovador = await matriz.usuarioDo(empresaId, CLASSIFICACAO, 'APROVADOR');
  if (!aprovador) throw erro(400, 'A empresa não tem Aprovador da DFC na Matriz de Alçadas (Cadastros).');
  if (aprovador.id !== usuarioId) throw erro(403, `Só ${aprovador.nome} (Aprovador da DFC na Matriz de Alçadas) pode reprovar a versão.`);
  const nome = await nomeDe(usuarioId);
  const r = await transacao(empresaId, async (c) => {
    const v = (await versoesDa(empresaId, c)).find((x) => x.status === 'FECHADA');
    if (!v || v.aprovada_em || v.reprovada_em) throw erro(409, 'Não há versão da DFC aguardando aprovação (só a última versão salva pode ser reprovada).');
    await c.query(
      'UPDATE dfc_versoes SET reprovada_por = $2, reprovada_por_nome = $3, reprovada_em = $4, reprovacao_motivo = $5 WHERE id = $1',
      [v.id, usuarioId, nome, new Date(), texto.slice(0, 2000)]
    );
    await registrarEvento(c, v.id, { usuarioId, usuarioNome: nome, descricao: `Reprovou a versão ${v.numero}: ${texto.slice(0, 2000)}` });
    return { numero: v.numero };
  });
  require('../workflows/workflows.service').disparar(empresaId, 'DFC_VERSAO_REPROVADA', { versao: r.numero, usuario_id: usuarioId });
  return { ...r, ...(await listar(empresaId, usuarioId)) };
}

async function excluir(empresaId, usuarioId) {
  const nome = await nomeDe(usuarioId);
  const r = await transacao(empresaId, async (c) => {
    const vs = await versoesDa(empresaId, c);
    const v = vs.find((x) => x.status === 'ABERTA');
    if (!v) throw erro(404, 'Não há versão aberta da DFC para excluir.');
    const base = vs.find((x) => x.id === v.base_id) || vs.find((x) => x.status === 'FECHADA');
    const naturezaDe = [...(await naturezasPelaDfc(c, v.id))];
    await fotos.restaurar(c, base.foto_config, empresaId, { naturezaDe });
    // As gerações do Orçamento feitas nela (e o log delas) saem — o Orçamento consolidado já voltou ao da versão
    // base (restaurar). Trava: nenhum valor do Orçamento pode continuar apontando pra elas.
    const { rows: presos } = await c.query(
      `SELECT count(*)::int AS n FROM dfc_orcamento_valores o JOIN dfc_orcamento_versoes g ON g.id = o.versao_id WHERE g.dfc_versao_id = $1`,
      [v.id]
    );
    if (presos[0].n) throw erro(409, 'O Orçamento não voltou ao da versão base. Nada foi excluído — recarregue a tela e tente de novo.');
    await c.query('DELETE FROM dfc_orcamento_versoes WHERE dfc_versao_id = $1', [v.id]);
    await c.query('DELETE FROM dfc_versoes WHERE id = $1', [v.id]);
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
// salva quando ainda não foi aprovada; `aprovador` = o da Matriz de Alçadas; `orcamento` = a geração do
// Orçamento na versão aberta (aba Projeções › Gerar orçamento), ou null.
async function listar(empresaId, usuarioId = null) {
  await garantirInicial(empresaId);
  const { rows } = await db.query(
    `SELECT v.id, v.numero, v.status, v.origem, to_char(v.corte, 'YYYY-MM-DD') AS corte, v.base_id, b.numero AS base_numero,
            v.foto_realizado, v.foto_config, v.aberta_por, v.aberta_por_nome, v.aberta_em, v.fechada_por, v.fechada_por_nome,
            v.fechada_em, v.aprovada_por, v.aprovada_por_nome, v.aprovada_em, v.reprovada_por_nome, v.reprovada_em, v.reprovacao_motivo,
            (SELECT count(*)::int FROM dfc_versao_alteracoes a WHERE a.versao_id = v.id) AS alteracoes
       FROM dfc_versoes v LEFT JOIN dfc_versoes b ON b.id = v.base_id
      WHERE v.empresa_id = $1 ORDER BY v.numero DESC`,
    [empresaId]
  );
  const versoes = await Promise.all(
    rows.map(async (v) => ({
      ...v,
      tamanho_bytes: (await fotos.tamanho(db, v.foto_config)) + (v.origem === 'EDICAO' ? 0 : await fotos.tamanho(db, v.foto_realizado)),
    }))
  );
  const aberta = versoes.find((v) => v.status === 'ABERTA') || null;
  const ultimaSalva = versoes.find((v) => v.status === 'FECHADA') || null;
  const pendente = ultimaSalva && !ultimaSalva.aprovada_em && !ultimaSalva.reprovada_em ? ultimaSalva : null;
  const reprovada = ultimaSalva && ultimaSalva.reprovada_em && !aberta ? ultimaSalva : null;
  const aprovador = await matriz.usuarioDo(empresaId, CLASSIFICACAO, 'APROVADOR');
  return {
    limite: LIMITE,
    proximo_corte: mesAnterior(),
    aberta,
    publicada: publicadaDe(versoes) || null,
    pendente,
    reprovada,
    aprovador,
    pode_aprovar: Boolean(pendente && aprovador && aprovador.id === usuarioId),
    orcamento: aberta ? await geracaoDa(aberta.id) : null,
    versoes,
  };
}

// Cabeçalho do dashboard Fluxo de Caixa: a versão publicada (a última aprovada), quem a fechou (o Responsável),
// quem a aprovou (o Aprovador, com a data e hora) e os Colaboradores (todo usuário com alteração carimbada nela).
async function cabecalhoPublicada(empresaId) {
  await garantirInicial(empresaId);
  const v = publicadaDe(await versoesDa(empresaId));
  if (!v) return null;
  const { rows: colab } = await db.query(
    `SELECT usuario_id, COUNT(*)::int AS alteracoes, MIN(criado_em) AS primeira, MAX(criado_em) AS ultima
       FROM dfc_versao_alteracoes WHERE versao_id = $1 AND usuario_id IS NOT NULL
      GROUP BY usuario_id ORDER BY COUNT(*) DESC, MIN(criado_em)`,
    [v.id]
  );
  const ids = [...new Set([v.aberta_por, v.fechada_por, v.aprovada_por, ...colab.map((c) => c.usuario_id)].filter(Boolean))];
  const { rows: us } = ids.length
    ? await db.query('SELECT id, nome, avatar_url, email, telefone_ddd, telefone_numero FROM usuarios WHERE id = ANY($1::int[])', [ids])
    : { rows: [] };
  const porId = new Map(us.map((u) => [u.id, u]));
  const pessoa = (id, nome) => (id && porId.get(id) ? { ...porId.get(id) } : { id: null, nome: nome || 'Sistema', avatar_url: null, email: null, telefone_ddd: null, telefone_numero: null });
  return {
    numero: v.numero,
    origem: v.origem,
    corte: v.corte.slice(0, 7),
    aberta_em: v.aberta_em,
    fechada_em: v.fechada_em,
    abriu: pessoa(v.aberta_por, v.aberta_por_nome),
    fechou: pessoa(v.fechada_por, v.fechada_por_nome),
    aprovador: pessoa(v.aprovada_por, v.aprovada_por_nome || v.fechada_por_nome),
    aprovado_em: v.aprovada_em || v.fechada_em,
    colaboradores: colab.map((c) => {
      const { email, telefone_ddd: _d, telefone_numero: _n, ...p } = pessoa(c.usuario_id); // eslint-disable-line no-unused-vars
      return { ...p, alteracoes: c.alteracoes, primeira: c.primeira, ultima: c.ultima };
    }),
  };
}

async function alteracoes(empresaId, numero) {
  const { rows: v } = await db.query('SELECT id FROM dfc_versoes WHERE empresa_id = $1 AND numero = $2', [empresaId, numero]);
  if (!v[0]) throw erro(404, `Versão ${numero} da DFC não encontrada.`);
  const { rows } = await db.query(
    `SELECT id, modulo, usuario_id, usuario_nome, criado_em, descricao, detalhes
       FROM dfc_versao_alteracoes WHERE versao_id = $1 ORDER BY criado_em DESC, id DESC`,
    [v[0].id]
  );
  return rows;
}

module.exports = {
  LIMITE,
  CLASSIFICACAO,
  mesAnterior,
  resolver,
  garantirInicial,
  contextoDa,
  abrir,
  salvar,
  aprovar,
  reprovar,
  excluir,
  listar,
  alteracoes,
  cabecalhoPublicada,
  nomeDe,
  geracaoDa,
};
