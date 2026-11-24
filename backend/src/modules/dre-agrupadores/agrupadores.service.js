const pool = require('../../config/db');

// Agrupadores da DRE (Operações › DRE Gerencial › Centros Custos — pedido de 23/11/2026): um agrupador junta
// centros de custo numa OBRA ÚNICA (ex.: EASY = EASY 1 + EASY 2; JD AMALIA = o centro definitivo + o
// provisório que tem as unidades). A DRE, a POC, a Projeção, o dashboard e o MCP são montados pelas
// "unidades da DRE": cada agrupador e cada centro fora de agrupador (database/migrations/2026-11-23-dre-agrupadores.sql).
//
// Regras (decisões do usuário):
//   - Obra única: o motor da DRE (demonstrativo.service.carregar) funde os dados dos centros do agrupador
//     antes de calcular — POC de Receita = custo somado ÷ orçamento somado; POC de Despesa = fração vendida
//     do conjunto; CIV, estornos e RET sobre o conjunto.
//   - "Realiza DRE" é do agrupador: todo centro dentro dele tem o mesmo valor (gravado também em
//     centros_custo_sienge.realiza_dre — as abas por centro, como Unidades, Correções e Plano Contas, seguem
//     lendo de lá).
//   - O centro PRINCIPAL dá o id do agrupador no motor (colunas e filtros da DRE, Projeção, Projetado das
//     versões) e é o dono do orçamento da Projeção do agrupador.
//   - Fração ideal: o Sienge dá a fração de cada unidade NO EMPREENDIMENTO dela (soma 1 por centro). No
//     agrupador com unidades em mais de um centro, a fração de cada unidade vira fração × peso do centro,
//     peso = unidades do centro ÷ unidades do agrupador (assim o conjunto soma 1).
// Versões da DRE antigas (antes dos agrupadores) têm as tabelas vazias: cada centro é uma unidade.

const ORDEM = 'c.dre_ordem ASC NULLS LAST, c.sienge_id ASC';

function erro(status, message, extra = {}) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  Object.assign(e, extra);
  return e;
}

// Natureza do agrupador: Obra se algum centro for Obra; senão a dos centros.
function naturezaDoGrupo(membros) {
  if (membros.some((m) => m.natureza === 'OBRA')) return 'OBRA';
  if (membros.some((m) => m.natureza === 'ADMINISTRATIVO')) return 'ADMINISTRATIVO';
  return null;
}

// As unidades da DRE na ordem da aba Centros Custos (cada agrupador na posição do primeiro centro dele, no meio
// dos centros fora de agrupador):
// [{ id, nome, rotulo, natureza, agrupador_id, agrupador, centros: [ids], membros: [{ id, nome, rotulo, natureza }] }].
// Só as com "Realiza DRE" (`soObras`: só as de natureza Obra). `id` = o sienge_id do centro (ou do principal do agrupador).
async function unidades(empresaId, { soObras = false } = {}) {
  const { rows } = await pool.query(
    `SELECT c.sienge_id::int AS id, c.name AS nome, COALESCE(NULLIF(TRIM(c.apelido), ''), c.name) AS rotulo, c.natureza,
            a.id AS agrupador_id, a.nome AS agrupador, COALESCE(ac.principal, FALSE) AS principal
       FROM centros_custo_sienge c
       LEFT JOIN dre_agrupadores_centros ac ON ac.empresa_id = c.empresa_id AND ac.centro_id = c.sienge_id
       LEFT JOIN dre_agrupadores a ON a.id = ac.agrupador_id
      WHERE c.empresa_id = $1 AND c.realiza_dre
      ORDER BY ${ORDEM}`,
    [empresaId]
  );
  // Principal de cada agrupador (sem principal marcado — não deveria acontecer —, o primeiro na ordem).
  const principal = new Map();
  rows.forEach((r) => {
    if (r.agrupador_id !== null && !principal.has(r.agrupador_id)) principal.set(r.agrupador_id, r.id);
  });
  rows.forEach((r) => {
    if (r.agrupador_id !== null && r.principal) principal.set(r.agrupador_id, r.id);
  });
  const lista = [];
  const doGrupo = new Map();
  rows.forEach((r) => {
    const membro = { id: r.id, nome: r.nome, rotulo: r.rotulo, natureza: r.natureza };
    if (r.agrupador_id === null) {
      lista.push({ ...membro, agrupador_id: null, agrupador: null, centros: [r.id], membros: [membro] });
      return;
    }
    if (!doGrupo.has(r.agrupador_id)) {
      const u = { id: principal.get(r.agrupador_id), nome: r.agrupador, rotulo: r.agrupador, natureza: null, agrupador_id: r.agrupador_id, agrupador: r.agrupador, centros: [], membros: [] };
      doGrupo.set(r.agrupador_id, u);
      lista.push(u);
    }
    const u = doGrupo.get(r.agrupador_id);
    u.centros.push(r.id);
    u.membros.push(membro);
  });
  doGrupo.forEach((u) => {
    u.natureza = naturezaDoGrupo(u.membros);
  });
  // A ordem livre da aba Centros Custos (pedido do usuário, 24/11/2026 — antes os agrupadores vinham sempre primeiro):
  // cada agrupador na posição do primeiro centro dele, no meio dos centros fora de agrupador.
  return soObras ? lista.filter((u) => u.natureza === 'OBRA') : lista;
}

// Centro (ou unidade) → id da unidade da DRE.
function mapaDe(lista) {
  const m = new Map();
  lista.forEach((u) => u.centros.forEach((c) => m.set(c, u.id)));
  return m;
}

// Ids pedidos (centros ou unidades, como vierem de um filtro, do MCP, de um filtro salvo) → ids das unidades,
// sem repetir. Id que não é de nenhuma unidade da DRE fica como veio (não traz nada, como antes).
function resolver(lista, ids = []) {
  const mapa = mapaDe(lista);
  return [...new Set((ids || []).map(Number).map((id) => mapa.get(id) ?? id))];
}

// Todos os centros das unidades `ids` (sem `ids`: de todas).
function centrosDe(lista, ids = null) {
  const alvo = ids ? new Set(resolver(lista, ids)) : null;
  return lista.filter((u) => !alvo || alvo.has(u.id)).flatMap((u) => u.centros);
}

// A unidade da DRE de um id (centro ou unidade), ou null.
function unidadeDe(lista, id) {
  const alvo = mapaDe(lista).get(Number(id));
  return alvo === undefined ? null : lista.find((u) => u.id === alvo) || null;
}

// Junta as linhas de várias análises de unidades (dre-unidades/unidades.service.listar, uma por centro) numa
// só, com id da unidade da DRE. Mais de um centro com unidades: fração ideal × peso do centro (unidades do
// centro ÷ unidades do agrupador). Cada linha guarda de qual centro veio (`centro_origem`).
function fundirUnidades(id, partes) {
  if (partes.length === 1 && partes[0].id === id) return partes[0];
  const total = partes.reduce((s, p) => s + (p.total_unidades || 0), 0);
  const comUnidades = partes.filter((p) => (p.total_unidades || 0) > 0).length;
  const pesoDe = (p) => (comUnidades > 1 && total > 0 ? (p.total_unidades || 0) / total : 1);
  const clusters = { vendidas: [], distratadas: [], permuta: [], disponiveis: [] };
  let fracao = 0;
  partes.forEach((p) => {
    const peso = pesoDe(p);
    fracao += (p.fracao_ideal || 0) * peso;
    Object.keys(clusters).forEach((k) => {
      (p.clusters[k] || []).forEach((l) => {
        clusters[k].push({ ...l, fracao_ideal: (l.fracao_ideal || 0) * peso, centro_origem: p.id, ...(peso !== 1 ? { peso_centro: peso } : {}) });
      });
    });
  });
  const ordenar = (linhas) =>
    linhas.sort(
      (a, b) =>
        (a.unidade || '').localeCompare(b.unidade || '', 'pt-BR', { numeric: true }) || String(a.data || '').localeCompare(String(b.data || ''))
    );
  return {
    id,
    nome: partes[0].nome,
    total_unidades: total,
    fracao_ideal: fracao,
    receita_distrato: partes.reduce((s, p) => s + (p.receita_distrato || 0), 0),
    despesa_distrato: partes.reduce((s, p) => s + (p.despesa_distrato || 0), 0),
    clusters: Object.fromEntries(Object.entries(clusters).map(([k, v]) => [k, ordenar(v)])),
    centros_origem: partes.map((p) => p.id),
  };
}

// Orçamento da obra (aba Orçamento, versões por data de início, por centro) somado por unidade: em cada data
// em que algum centro muda de versão, o total = soma do orçamento vigente de cada centro nela.
function fundirOrcamentos(orcamentos, mapa) {
  const porUnidade = new Map();
  orcamentos.forEach((o) => {
    const u = mapa.get(Number(o.centro_id)) ?? Number(o.centro_id);
    if (!porUnidade.has(u)) porUnidade.set(u, new Map());
    const centros = porUnidade.get(u);
    if (!centros.has(o.centro_id)) centros.set(o.centro_id, []);
    centros.get(o.centro_id).push({ inicio: o.inicio, total: Number(o.total) || 0 });
  });
  const saida = [];
  porUnidade.forEach((centros, u) => {
    const datas = [...new Set([...centros.values()].flatMap((vs) => vs.map((v) => v.inicio)))].sort();
    const listas = [...centros.values()].map((vs) => [...vs].sort((a, b) => a.inicio.localeCompare(b.inicio)));
    datas.forEach((d) => {
      const total = listas.reduce((s, vs) => s + (vs.filter((v) => v.inicio <= d).pop()?.total || 0), 0);
      saida.push({ centro_id: u, inicio: d, total });
    });
  });
  return saida;
}

// Os dados crus do motor da DRE (demonstrativo.service.carregar) por unidade da DRE: as análises de unidades
// fundidas, e a correção, os custos do Financeiro e o orçamento da obra com o id da unidade.
function fundir({ unidadesCentros, corr, custos, orcamentos }, lista) {
  const mapa = mapaDe(lista);
  const para = (id) => mapa.get(Number(id)) ?? Number(id);
  const grupos = new Map();
  unidadesCentros.forEach((c) => {
    const u = para(c.id);
    if (!grupos.has(u)) grupos.set(u, []);
    grupos.get(u).push(c);
  });
  return {
    unidadesCentros: [...grupos.entries()].map(([u, partes]) => fundirUnidades(u, partes)),
    corr: corr.map((r) => ({ ...r, centro_id: para(r.centro_id) })),
    custos: custos.map((r) => ({ ...r, centro_id: para(r.centro_id) })),
    orcamentos: fundirOrcamentos(orcamentos, mapa),
  };
}

// ------------------------------------------------------------------------------------- aba Centros Custos

// Os agrupadores da empresa, com os centros de cada um (na ordem da DRE) e o principal.
async function listarAgrupadores(empresaId, db = pool) {
  const [{ rows: grupos }, { rows: membros }] = await Promise.all([
    db.query('SELECT id, nome, realiza_dre FROM dre_agrupadores WHERE empresa_id = $1 ORDER BY id', [empresaId]),
    db.query(
      `SELECT ac.agrupador_id, ac.centro_id, ac.principal
         FROM dre_agrupadores_centros ac JOIN centros_custo_sienge c ON c.empresa_id = ac.empresa_id AND c.sienge_id = ac.centro_id
        WHERE ac.empresa_id = $1 ORDER BY ${ORDEM}`,
      [empresaId]
    ),
  ]);
  return grupos.map((g) => {
    const doGrupo = membros.filter((m) => m.agrupador_id === g.id);
    return {
      id: g.id,
      nome: g.nome,
      realiza_dre: g.realiza_dre,
      principal_id: doGrupo.find((m) => m.principal)?.centro_id ?? doGrupo[0]?.centro_id ?? null,
      centros: doGrupo.map((m) => m.centro_id),
    };
  });
}

async function transacao(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

function nomeValido(nome) {
  const n = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!n) throw erro(400, 'Informe o nome do agrupador.');
  if (n.length > 120) throw erro(400, 'O nome do agrupador pode ter no máximo 120 caracteres.');
  return n;
}

async function nomeLivre(db, empresaId, nome, ignorarId = null) {
  const { rows } = await db.query(
    'SELECT 1 FROM dre_agrupadores WHERE empresa_id = $1 AND lower(nome) = lower($2) AND id IS DISTINCT FROM $3',
    [empresaId, nome, ignorarId]
  );
  if (rows[0]) throw erro(400, `Já existe um agrupador "${nome}".`);
}

async function obterAgrupador(db, empresaId, id) {
  const { rows } = await db.query('SELECT id, nome, realiza_dre FROM dre_agrupadores WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
  if (!rows[0]) throw erro(404, 'Agrupador não encontrado.');
  return rows[0];
}

async function criar(empresaId, { nome }) {
  const n = nomeValido(nome);
  return transacao(async (db) => {
    await nomeLivre(db, empresaId, n);
    const { rows } = await db.query('INSERT INTO dre_agrupadores (empresa_id, nome) VALUES ($1, $2) RETURNING id', [empresaId, n]);
    return (await listarAgrupadores(empresaId, db)).find((g) => g.id === rows[0].id);
  });
}

// `patch`: { nome?, realiza_dre? }. O Realiza DRE vale pra todos os centros dentro dele.
async function atualizar(empresaId, id, patch) {
  return transacao(async (db) => {
    const antes = await obterAgrupador(db, empresaId, id);
    if (patch.nome !== undefined) {
      const n = nomeValido(patch.nome);
      await nomeLivre(db, empresaId, n, id);
      await db.query('UPDATE dre_agrupadores SET nome = $3, atualizado_em = now() WHERE empresa_id = $1 AND id = $2', [empresaId, id, n]);
    }
    if (patch.realiza_dre !== undefined) {
      await db.query('UPDATE dre_agrupadores SET realiza_dre = $3, atualizado_em = now() WHERE empresa_id = $1 AND id = $2', [
        empresaId,
        id,
        Boolean(patch.realiza_dre),
      ]);
      await db.query(
        `UPDATE centros_custo_sienge c SET realiza_dre = $3
           FROM dre_agrupadores_centros ac
          WHERE ac.empresa_id = $1 AND ac.agrupador_id = $2 AND c.empresa_id = ac.empresa_id AND c.sienge_id = ac.centro_id`,
        [empresaId, id, Boolean(patch.realiza_dre)]
      );
    }
    const depois = (await listarAgrupadores(empresaId, db)).find((g) => g.id === id);
    return { antes, depois };
  });
}

// Exclui o agrupador: os centros voltam a ser centros soltos (com o Realiza DRE que tinham nele); a
// projeção do agrupador fica com o centro principal.
async function excluir(empresaId, id) {
  return transacao(async (db) => {
    const antes = (await listarAgrupadores(empresaId, db)).find((g) => g.id === id);
    if (!antes) throw erro(404, 'Agrupador não encontrado.');
    await db.query('DELETE FROM dre_agrupadores WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
    // A projeção do agrupador fica com o principal, agora sozinho: tem de ser revisada.
    if (antes.principal_id && antes.centros.length > 1) await projecaoParaRevisar(db, empresaId, antes.principal_id);
    return antes;
  });
}

// O rascunho da Projeção de um centro (a Projeção da DRE tem um orçamento por unidade da DRE).
async function projecaoDe(db, empresaId, centroId) {
  const { rows } = await db.query(
    `SELECT o.id, o.centro_id, o.status, to_char(o.ciclo_inicio, 'YYYY-MM') AS ciclo_inicio, to_char(o.ciclo_fim, 'YYYY-MM') AS ciclo_fim,
            COALESCE(NULLIF(TRIM(c.apelido), ''), c.name) AS centro
       FROM dre_projecao_orcamentos o JOIN centros_custo_sienge c ON c.empresa_id = o.empresa_id AND c.sienge_id = o.centro_id
      WHERE o.empresa_id = $1 AND o.centro_id = $2 AND o.versao_id IS NULL`,
    [empresaId, centroId]
  );
  return rows[0] || null;
}

// Os dados do agrupador mudaram (entrou ou saiu centro): a projeção dele volta pra Em andamento, pra ser
// revisada e concluída de novo (até lá o Projetado é calculado na hora, com as premissas informadas).
async function projecaoParaRevisar(db, empresaId, centroId) {
  await db.query(
    `UPDATE dre_projecao_orcamentos SET status = 'EM_ANDAMENTO', resultado = NULL, concluido_em = NULL, atualizado_em = now()
      WHERE empresa_id = $1 AND centro_id = $2 AND versao_id IS NULL`,
    [empresaId, centroId]
  );
}

// Move a projeção de um centro pra outro (o novo principal). O destino não pode ter rascunho (só o principal tem).
async function moverProjecao(db, empresaId, de, para) {
  await db.query('DELETE FROM dre_projecao_orcamentos WHERE empresa_id = $1 AND centro_id = $2 AND versao_id IS NULL', [empresaId, para]);
  await db.query('UPDATE dre_projecao_orcamentos SET centro_id = $3 WHERE empresa_id = $1 AND centro_id = $2 AND versao_id IS NULL', [
    empresaId,
    de,
    para,
  ]);
}

// Põe o centro no agrupador `agrupadorId` (null = tira de agrupador). Devolve o que mudou, pro carimbo:
// { centro, de, para, principal, projecao_descartada, projecao_movida }.
// Projeção (decisão do usuário): a projeção do centro passa pro agrupador; se o agrupador e o centro tiverem
// projeção, `projecaoFica` (o centro cuja projeção fica) é obrigatório — sem ele, 409 com as duas opções.
async function mover(empresaId, centroId, agrupadorId, { projecaoFica = null } = {}) {
  return transacao(async (db) => {
    const { rows: cc } = await db.query(
      `SELECT c.sienge_id::int AS id, COALESCE(NULLIF(TRIM(c.apelido), ''), c.name) AS nome, c.natureza, c.realiza_dre,
              ac.agrupador_id, COALESCE(ac.principal, FALSE) AS principal
         FROM centros_custo_sienge c
         LEFT JOIN dre_agrupadores_centros ac ON ac.empresa_id = c.empresa_id AND ac.centro_id = c.sienge_id
        WHERE c.empresa_id = $1 AND c.sienge_id = $2`,
      [empresaId, centroId]
    );
    const centro = cc[0];
    if (!centro) throw erro(404, 'Centro de custo não encontrado.');
    const de = centro.agrupador_id;
    const para = agrupadorId === null || agrupadorId === undefined ? null : Number(agrupadorId);
    const res = { centro, de: null, para: null, principal: null, projecao_descartada: null, projecao_movida: null };
    if (de === para) return res;
    const grupos = await listarAgrupadores(empresaId, db);
    res.de = de !== null ? grupos.find((g) => g.id === de) : null;
    res.para = para !== null ? grupos.find((g) => g.id === para) : null;
    if (para !== null && !res.para) throw erro(404, 'Agrupador não encontrado.');

    // Agrupador de destino: Tipo compatível e a escolha da projeção.
    let principalNovo = null;
    if (res.para) {
      const membros = res.para.centros;
      if (membros.length) {
        const { rows: nat } = await db.query(
          `SELECT DISTINCT natureza FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = ANY($2::int[]) AND natureza IS NOT NULL`,
          [empresaId, membros]
        );
        const tipos = new Set(nat.map((r) => r.natureza));
        if (centro.natureza && tipos.size && !tipos.has(centro.natureza)) {
          throw erro(400, `${centro.nome} é ${centro.natureza === 'OBRA' ? 'Obra' : 'Administrativo'} e o agrupador ${res.para.nome} junta centros do outro Tipo. Um agrupador só junta centros do mesmo Tipo.`);
        }
      }
      const principalAtual = res.para.principal_id;
      const projCentro = await projecaoDe(db, empresaId, centro.id);
      const projGrupo = principalAtual ? await projecaoDe(db, empresaId, principalAtual) : null;
      if (!principalAtual) principalNovo = centro.id;
      else if (projCentro && !projGrupo) principalNovo = centro.id;
      else if (projCentro && projGrupo) {
        const fica = projecaoFica === null || projecaoFica === undefined ? null : Number(projecaoFica);
        if (fica !== centro.id && fica !== principalAtual) {
          throw erro(409, `${centro.nome} e o agrupador ${res.para.nome} têm projeção. Escolha qual fica.`, {
            dados: { escolher_projecao: [projGrupo, projCentro].map((p) => ({ ...p, agrupador: p.centro_id === principalAtual ? res.para.nome : null })) },
          });
        }
        if (fica === centro.id) {
          await db.query('DELETE FROM dre_projecao_orcamentos WHERE empresa_id = $1 AND centro_id = $2 AND versao_id IS NULL', [empresaId, principalAtual]);
          res.projecao_descartada = projGrupo;
          principalNovo = centro.id;
        } else {
          await db.query('DELETE FROM dre_projecao_orcamentos WHERE empresa_id = $1 AND centro_id = $2 AND versao_id IS NULL', [empresaId, centro.id]);
          res.projecao_descartada = projCentro;
        }
      }
    }

    // Sai do agrupador de origem: se era o principal, o próximo centro (na ordem) assume, levando a projeção.
    if (res.de) {
      await db.query('DELETE FROM dre_agrupadores_centros WHERE empresa_id = $1 AND centro_id = $2', [empresaId, centro.id]);
      const restantes = res.de.centros.filter((c) => c !== centro.id);
      if (restantes.length) {
        if (res.de.principal_id === centro.id) {
          await db.query('UPDATE dre_agrupadores_centros SET principal = TRUE WHERE empresa_id = $1 AND centro_id = $2', [empresaId, restantes[0]]);
          if (await projecaoDe(db, empresaId, centro.id)) {
            await moverProjecao(db, empresaId, centro.id, restantes[0]);
            res.projecao_movida = { de: centro.id, para: restantes[0] };
          }
          await projecaoParaRevisar(db, empresaId, restantes[0]);
        } else {
          await projecaoParaRevisar(db, empresaId, res.de.principal_id);
        }
      }
    }

    // Entra no agrupador de destino, com o Realiza DRE dele.
    if (res.para) {
      if (principalNovo !== null && res.para.principal_id) {
        await db.query('UPDATE dre_agrupadores_centros SET principal = FALSE WHERE empresa_id = $1 AND agrupador_id = $2', [empresaId, para]);
      }
      await db.query(
        'INSERT INTO dre_agrupadores_centros (empresa_id, centro_id, agrupador_id, principal) VALUES ($1, $2, $3, $4)',
        [empresaId, centro.id, para, principalNovo === centro.id]
      );
      await db.query('UPDATE centros_custo_sienge SET realiza_dre = $3 WHERE empresa_id = $1 AND sienge_id = $2', [
        empresaId,
        centro.id,
        res.para.realiza_dre,
      ]);
      res.principal = principalNovo ?? res.para.principal_id;
      // A projeção do agrupador (agora com mais um centro) tem de ser revisada.
      if (res.para.centros.length) await projecaoParaRevisar(db, empresaId, res.principal);
    }
    return res;
  });
}

module.exports = {
  unidades,
  mapaDe,
  resolver,
  centrosDe,
  unidadeDe,
  fundir,
  fundirUnidades,
  fundirOrcamentos,
  listarAgrupadores,
  criar,
  atualizar,
  excluir,
  mover,
  erro,
};
