const pool = require('../../config/db');
const bancosService = require('../bancos/bancos.service');
const saldosService = require('./saldos.service');

// ---------------------------------------------------------------------------------------
// Parâmetro "Gerar Rotinas" de Saldo Contas Bancárias. Com ele ligado:
//   - as contas da grade (classificadas + projetando saldo + ativas) são divididas entre
//     responsáveis, por CLASSIFICAÇÃO ou por BANCO (saldos_rotinas_responsaveis);
//   - cada responsável vê, na aba Rotinas, só as próprias contas e lança o saldo delas no
//     período aberto (não abre/encerra período por lá);
//   - cada responsável encerra a própria rotina; o período só pode ser encerrado (cadeado de
//     Saldos das Contas) depois que TODOS os envolvidos encerraram (assertPodeEncerrarPeriodo).
// "Envolvido" = responsável por ao menos 1 conta na divisão ativa. Item sem responsável não
// trava nada — as contas dele só ficam fora das rotinas (lançadas em Saldos das Contas).
// ---------------------------------------------------------------------------------------

const TIPOS = ['CLASSIFICACAO', 'BANCO'];

function erro(status, message, code) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  if (code) e.code = code;
  return e;
}

async function getConfig(empresaId) {
  const { rows } = await pool.query('SELECT gerar_rotinas, dividir_por FROM saldos_rotinas_config WHERE empresa_id = $1', [
    empresaId,
  ]);
  return { gerar: Boolean(rows[0]?.gerar_rotinas), dividirPor: rows[0]?.dividir_por || 'CLASSIFICACAO' };
}

// Contas que entram nas rotinas: as mesmas da grade de Saldos das Contas (classificada +
// projetando saldo), só as ativas — conta inativa não tem saldo novo pra lançar.
async function contasDaRotina(empresaId) {
  const { rows } = await pool.query(
    `SELECT c.company_id, c.numero_conta, c.classificacao, c.banco_nome, ${saldosService.BANCO_EFETIVO_SQL} AS banco_codigo
     FROM contas_bancarias_sienge c
     WHERE c.empresa_id = $1 AND c.classificacao IS NOT NULL AND c.projeta_saldo = TRUE AND c.status = 'ENABLED'`,
    [empresaId]
  );
  return rows;
}

const chaveDaConta = (conta, tipo) => (tipo === 'BANCO' ? conta.banco_codigo || '' : conta.classificacao);

async function nomesBancos() {
  try {
    return new Map((await bancosService.listarTodosComLogo()).map((b) => [b.codigo, b]));
  } catch {
    return new Map(); // lista oficial fora do ar: segue com o nome que o Sienge mandou
  }
}

// Itens de cada divisão, com a quantidade de contas: TODAS as classificações cadastradas da
// empresa (mesmo sem conta, pra já deixar o responsável definido) e os bancos que aparecem nas
// contas da grade.
async function itensDasDivisoes(empresaId, contas) {
  const contagem = (tipo) => {
    const mapa = new Map();
    for (const c of contas) {
      const chave = chaveDaConta(c, tipo);
      if (chave) mapa.set(chave, (mapa.get(chave) || 0) + 1);
    }
    return mapa;
  };
  const porClassificacao = contagem('CLASSIFICACAO');
  const porBanco = contagem('BANCO');

  const { rows: classificacoes } = await pool.query(
    'SELECT nome FROM classificacoes_bancarias WHERE empresa_id = $1 ORDER BY nome',
    [empresaId]
  );
  const nomesClassificacao = new Set(classificacoes.map((c) => c.nome));
  // Conta classificada com um nome que não existe mais no cadastro (renomeado) — entra igual,
  // senão ficaria sem responsável possível.
  for (const nome of porClassificacao.keys()) nomesClassificacao.add(nome);

  const oficiais = await nomesBancos();
  const nomeSienge = new Map(contas.filter((c) => c.banco_codigo).map((c) => [c.banco_codigo, c.banco_nome]));

  return {
    CLASSIFICACAO: [...nomesClassificacao]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((nome) => ({ chave: nome, nome, contas: porClassificacao.get(nome) || 0 })),
    BANCO: [...porBanco.keys()]
      .map((codigo) => ({
        chave: codigo,
        nome: oficiais.get(codigo)?.nome || nomeSienge.get(codigo) || codigo,
        logo: oficiais.get(codigo)?.logo || null,
        contas: porBanco.get(codigo),
      }))
      .sort((a, b) => b.contas - a.contas || a.nome.localeCompare(b.nome, 'pt-BR')),
  };
}

async function responsaveisPorTipo(empresaId) {
  const { rows } = await pool.query(
    'SELECT tipo, chave, usuario_id FROM saldos_rotinas_responsaveis WHERE empresa_id = $1',
    [empresaId]
  );
  const mapas = { CLASSIFICACAO: new Map(), BANCO: new Map() };
  for (const r of rows) mapas[r.tipo]?.set(r.chave, r.usuario_id);
  return mapas;
}

// ─── configuração (aba Configurações) ────────────────────────────────────────────────────

async function getConfigCompleta(empresaId) {
  const [config, contas, elegiveis, responsaveis] = await Promise.all([
    getConfig(empresaId),
    contasDaRotina(empresaId),
    saldosService.listUsuariosElegiveisComunicar(empresaId),
    responsaveisPorTipo(empresaId),
  ]);
  const itens = await itensDasDivisoes(empresaId, contas);
  const comResponsavel = (tipo) => itens[tipo].map((i) => ({ ...i, usuarioId: responsaveis[tipo].get(i.chave) ?? null }));
  return {
    gerar: config.gerar,
    dividirPor: config.dividirPor,
    elegiveis,
    classificacoes: comResponsavel('CLASSIFICACAO'),
    bancos: comResponsavel('BANCO'),
  };
}

// Substitui a configuração inteira. `responsaveis` = { CLASSIFICACAO: [{chave, usuarioId}], BANCO: [...] }
// (usuarioId null = sem responsável). Revalida no servidor que todo usuário escolhido tem acesso
// à empresa — não confia só no combobox da tela.
async function salvarConfig(empresaId, usuarioId, { gerar, dividirPor, responsaveis }) {
  const elegiveis = new Set((await saldosService.listUsuariosElegiveisComunicar(empresaId)).map((u) => u.id));
  const linhas = [];
  for (const tipo of TIPOS) {
    for (const { chave, usuarioId: responsavel } of responsaveis[tipo] || []) {
      if (responsavel === null || responsavel === undefined) continue;
      if (!elegiveis.has(responsavel)) throw erro(400, 'Um ou mais responsáveis não têm acesso a esta empresa.');
      linhas.push({ tipo, chave, usuarioId: responsavel });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO saldos_rotinas_config (empresa_id, gerar_rotinas, dividir_por, atualizado_por, atualizado_em)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (empresa_id) DO UPDATE SET gerar_rotinas = EXCLUDED.gerar_rotinas, dividir_por = EXCLUDED.dividir_por,
         atualizado_por = EXCLUDED.atualizado_por, atualizado_em = NOW()`,
      [empresaId, gerar, dividirPor, usuarioId]
    );
    await client.query('DELETE FROM saldos_rotinas_responsaveis WHERE empresa_id = $1', [empresaId]);
    if (linhas.length) {
      await client.query(
        `INSERT INTO saldos_rotinas_responsaveis (empresa_id, tipo, chave, usuario_id)
         SELECT $1, t.tipo, t.chave, t.usuario_id FROM unnest($2::text[], $3::text[], $4::int[]) AS t(tipo, chave, usuario_id)`,
        [empresaId, linhas.map((l) => l.tipo), linhas.map((l) => l.chave), linhas.map((l) => l.usuarioId)]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return getConfigCompleta(empresaId);
}

// ─── andamento das rotinas ───────────────────────────────────────────────────────────────

async function periodoAberto(empresaId) {
  const { rows } = await pool.query(
    `SELECT id, TO_CHAR(data, 'YYYY-MM-DD') AS data FROM saldos_periodos WHERE empresa_id = $1 AND status = 'ABERTO'`,
    [empresaId]
  );
  return rows[0] || null;
}

// Cada conta da rotina com o responsável dela na divisão ativa.
async function contasComResponsavel(empresaId, config) {
  const [contas, responsaveis] = await Promise.all([contasDaRotina(empresaId), responsaveisPorTipo(empresaId)]);
  const mapa = responsaveis[config.dividirPor];
  return contas.map((c) => ({ ...c, usuarioId: mapa.get(chaveDaConta(c, config.dividirPor)) ?? null }));
}

// Situação das rotinas no período aberto: quem é responsável pelo quê, quantas contas cada um
// já tem com saldo no dia e quem já encerrou. `minha` = a do usuário logado (null se ele não é
// responsável por nada).
async function getStatus(empresaId, usuarioId) {
  const config = await getConfig(empresaId);
  if (!config.gerar) return { gerar: false, dividirPor: config.dividirPor, periodo: null, responsaveis: [], minha: null, semResponsavel: 0 };

  const [periodo, contas] = await Promise.all([periodoAberto(empresaId), contasComResponsavel(empresaId, config)]);

  let preenchidas = new Set();
  let encerramentos = new Map();
  if (periodo) {
    const [{ rows: saldos }, { rows: enc }] = await Promise.all([
      pool.query('SELECT company_id, numero_conta FROM saldos_contas_bancarias WHERE empresa_id = $1 AND data = $2', [
        empresaId,
        periodo.data,
      ]),
      pool.query('SELECT usuario_id, encerrado_em FROM saldos_rotinas_encerramentos WHERE periodo_id = $1', [periodo.id]),
    ]);
    preenchidas = new Set(saldos.map((s) => `${s.company_id}|${s.numero_conta}`));
    encerramentos = new Map(enc.map((e) => [e.usuario_id, e.encerrado_em]));
  }

  const oficiais = config.dividirPor === 'BANCO' ? await nomesBancos() : new Map();
  const porUsuario = new Map();
  let semResponsavel = 0;
  for (const c of contas) {
    if (c.usuarioId === null) {
      semResponsavel += 1;
      continue;
    }
    if (!porUsuario.has(c.usuarioId)) porUsuario.set(c.usuarioId, { itens: new Set(), contas: 0, preenchidas: 0 });
    const u = porUsuario.get(c.usuarioId);
    u.itens.add(config.dividirPor === 'BANCO' ? oficiais.get(c.banco_codigo)?.nome || c.banco_nome || c.banco_codigo : c.classificacao);
    u.contas += 1;
    if (preenchidas.has(`${c.company_id}|${c.numero_conta}`)) u.preenchidas += 1;
  }

  const ids = [...porUsuario.keys()];
  const { rows: usuarios } = ids.length
    ? await pool.query('SELECT id, nome FROM usuarios WHERE id = ANY($1::int[])', [ids])
    : { rows: [] };
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));

  const responsaveis = ids
    .map((id) => {
      const u = porUsuario.get(id);
      const encerradoEm = encerramentos.get(id) || null;
      return {
        usuarioId: id,
        nome: nomes.get(id) || `Usuário ${id}`,
        itens: [...u.itens].sort((a, b) => a.localeCompare(b, 'pt-BR')),
        contas: u.contas,
        preenchidas: u.preenchidas,
        encerrada: Boolean(encerradoEm),
        encerradoEm,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return {
    gerar: true,
    dividirPor: config.dividirPor,
    periodo: periodo?.data || null,
    responsaveis,
    minha: responsaveis.find((r) => r.usuarioId === usuarioId) || null,
    semResponsavel,
  };
}

// ─── saldos do responsável (aba Rotinas) ─────────────────────────────────────────────────

async function contasDoUsuario(empresaId, usuarioId) {
  const config = await getConfig(empresaId);
  if (!config.gerar) throw erro(400, 'As rotinas não estão ativas para esta empresa.');
  const contas = await contasComResponsavel(empresaId, config);
  return contas.filter((c) => c.usuarioId === usuarioId);
}

async function getSaldosRotina(empresaId, usuarioId, { dataInicio, dataFim }) {
  const contas = await contasDoUsuario(empresaId, usuarioId);
  if (contas.length === 0) return { contas: [] };
  return saldosService.getSaldos(empresaId, {
    dataInicio,
    dataFim,
    companyIds: [],
    classificacoes: [],
    bancos: [],
    contas: contas.map((c) => `${c.company_id}:${c.numero_conta}`),
  });
}

async function assertRotinaAberta(empresaId, usuarioId) {
  const periodo = await periodoAberto(empresaId);
  if (!periodo) throw erro(409, 'Nenhum período está aberto. Aguarde a abertura em Saldos das Contas.');
  const { rowCount } = await pool.query(
    'SELECT 1 FROM saldos_rotinas_encerramentos WHERE periodo_id = $1 AND usuario_id = $2',
    [periodo.id, usuarioId]
  );
  if (rowCount) throw erro(409, 'Sua rotina deste período já foi encerrada. Reabra a rotina para alterar algum saldo.');
  return periodo;
}

// Grava só contas do próprio responsável, com a rotina dele aberta (o resto das regras — dia
// aberto, valores — é o mesmo salvarSaldos de Saldos das Contas).
async function salvarSaldosRotina(empresaId, usuarioId, itens) {
  await assertRotinaAberta(empresaId, usuarioId);
  const permitidas = new Set((await contasDoUsuario(empresaId, usuarioId)).map((c) => `${c.company_id}|${c.numero_conta}`));
  if (itens.some((i) => !permitidas.has(`${i.company_id}|${i.numero_conta}`))) {
    throw erro(403, 'Uma ou mais contas não fazem parte da sua rotina.');
  }
  return saldosService.salvarSaldos(empresaId, usuarioId, itens);
}

async function encerrarRotina(empresaId, usuarioId) {
  const periodo = await assertRotinaAberta(empresaId, usuarioId);
  if ((await contasDoUsuario(empresaId, usuarioId)).length === 0) {
    throw erro(400, 'Você não é responsável por nenhuma conta nas rotinas desta empresa.');
  }
  await pool.query(
    `INSERT INTO saldos_rotinas_encerramentos (periodo_id, usuario_id, encerrado_em) VALUES ($1, $2, $3)
     ON CONFLICT (periodo_id, usuario_id) DO NOTHING`,
    [periodo.id, usuarioId, new Date()]
  );
  return getStatus(empresaId, usuarioId);
}

async function reabrirRotina(empresaId, usuarioId) {
  const periodo = await periodoAberto(empresaId);
  if (!periodo) throw erro(409, 'Nenhum período está aberto.');
  await pool.query('DELETE FROM saldos_rotinas_encerramentos WHERE periodo_id = $1 AND usuario_id = $2', [periodo.id, usuarioId]);
  return getStatus(empresaId, usuarioId);
}

// Trava do cadeado: com rotinas ligadas, o período só encerra depois de todos os envolvidos.
async function assertPodeEncerrarPeriodo(empresaId, usuarioId) {
  const status = await getStatus(empresaId, usuarioId);
  if (!status.gerar) return;
  const pendentes = status.responsaveis.filter((r) => !r.encerrada);
  if (pendentes.length) {
    const err = erro(
      409,
      `O período só pode ser encerrado depois que todos encerrarem a rotina. Pendente: ${pendentes.map((p) => p.nome).join(', ')}.`,
      'ROTINAS_PENDENTES'
    );
    throw err;
  }
}

module.exports = {
  getConfigCompleta,
  salvarConfig,
  getStatus,
  getSaldosRotina,
  salvarSaldosRotina,
  encerrarRotina,
  reabrirRotina,
  assertPodeEncerrarPeriodo,
  TIPOS,
};
