const pool = require('../../config/db');
const { getDataSistema, listResponsaveis } = require('./reguaCobranca.service');
const { proximaExecucao } = require('../monitor-integracoes/tempo');

// Distribuição da Rotina de Cobrança (Configurações Globais da Régua):
//   etapa      = cada etapa tem o seu responsável (regua_cobranca_etapas.
//                responsavel_usuario_id) — o jeito de sempre;
//   automatica = os clientes da Rotina de cada dia são repartidos entre os
//                atendentes cadastrados, uma vez por dia (Monitor de
//                Integrações, rotina 'cobranca_distribuicao'), e o resultado
//                fica gravado em regua_cobranca_distribuicao_itens.
//
// A regra (explicada pro usuário em DistribuicaoExplicacaoPage.jsx — as
// duas precisam andar juntas):
//   1. Continuidade: cliente com dono na carteira continua com ele. A
//      unidade é o CLIENTE: todas as parcelas dele no dia vão pra mesma
//      pessoa.
//   2. Os demais são separados por faixa (a etapa da régua da parcela mais
//      grave do cliente no dia), da mais grave pra mais leve.
//   3. Em cada faixa, primeiro QUANTOS: cada vaga vai pra quem tem menos
//      clientes nessa faixa hoje e, empatado, menos clientes no total hoje.
//   4. Depois QUAIS: do maior pro menor valor, cada cliente vai pra quem
//      ainda tem vaga e está com a menor média de valor por dia trabalhado
//      no mês.
//   5. O resultado é gravado; quem recebe um cliente novo vira o dono dele
//      na carteira. Sai da carteira com `dias_liberacao` dias sem aparecer
//      na Rotina.

const MODOS = ['etapa', 'automatica'];
const DIAS_LIBERACAO_PADRAO = 10;
// "Repassar parte da carteira" (Redistribuir hoje) só move cliente sem
// contato manual registrado nestes últimos dias — não interrompe negociação
// em andamento.
const DIAS_SEM_CONTATO_REPASSE = 7;
const CLUSTERS_GRAVIDADE = ['novo', 'bom', 'duvidoso', 'mau', 'inad'];
const CLUSTER_NOME = { novo: 'Novo cliente', bom: 'Bom pagador', duvidoso: 'Pagador duvidoso', mau: 'Mau pagador', inad: 'Inadimplência' };
const ROTINA_MONITOR = 'cobranca_distribuicao';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// Datas sempre como texto 'YYYY-MM-DD' (o pg devolve DATE como objeto Date
// no fuso do servidor — por isso todo SELECT de data aqui faz ::text).
function somarDiasIso(iso, dias) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const inicioDoMes = (iso) => `${iso.slice(0, 8)}01`;
const pausadoNoDia = (participante, data) => Boolean(participante.pausado_ate && participante.pausado_ate >= data);
const moeda = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

async function hoje(empresaId) {
  return (await getDataSistema(empresaId)).data_efetiva;
}

async function registrarLog(db, empresaId, acao, descricao, usuarioId) {
  await db.query(
    `INSERT INTO regua_cobranca_distribuicao_log (empresa_id, acao, descricao, usuario_id, criado_em)
     VALUES ($1, $2, $3, $4, $5)`,
    [empresaId, acao, descricao, usuarioId || null, new Date().toISOString()]
  );
}

// ─── configuração ──────────────────────────────────────────────────────────

async function getConfig(empresaId, db = pool) {
  const { rows } = await db.query(
    'SELECT modo, dias_liberacao FROM regua_cobranca_distribuicao_config WHERE empresa_id = $1',
    [empresaId]
  );
  return { modo: rows[0]?.modo ?? 'etapa', dias_liberacao: rows[0]?.dias_liberacao ?? DIAS_LIBERACAO_PADRAO };
}

async function salvarConfig(empresaId, { modo, diasLiberacao }, usuarioId) {
  const atual = await getConfig(empresaId);
  const novo = {
    modo: modo ?? atual.modo,
    dias_liberacao: diasLiberacao ?? atual.dias_liberacao,
  };
  await pool.query(
    `INSERT INTO regua_cobranca_distribuicao_config (empresa_id, modo, dias_liberacao, atualizado_por, atualizado_em)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (empresa_id) DO UPDATE SET modo = EXCLUDED.modo, dias_liberacao = EXCLUDED.dias_liberacao,
       atualizado_por = EXCLUDED.atualizado_por, atualizado_em = EXCLUDED.atualizado_em`,
    [empresaId, novo.modo, novo.dias_liberacao, usuarioId, new Date().toISOString()]
  );
  if (novo.modo !== atual.modo) {
    await registrarLog(
      pool,
      empresaId,
      'modo',
      novo.modo === 'automatica' ? 'Distribuição automática ligada.' : 'Voltou para "Responsável por etapa".',
      usuarioId
    );
  }
  if (novo.dias_liberacao !== atual.dias_liberacao) {
    await registrarLog(pool, empresaId, 'liberacao', `Liberação da carteira alterada para ${novo.dias_liberacao} dias.`, usuarioId);
  }
  return novo;
}

// ─── atendentes ────────────────────────────────────────────────────────────

async function carregarParticipantes(empresaId, db = pool) {
  const { rows } = await db.query(
    `SELECT p.usuario_id, u.nome, p.pausado_ate::text AS pausado_ate, p.entrou_em::text AS entrou_em,
            p.placar_herdado_de, p.herdado_em::text AS herdado_em, h.nome AS herdado_de_nome
     FROM regua_cobranca_distribuicao_participantes p
     JOIN usuarios u ON u.id = p.usuario_id
     LEFT JOIN usuarios h ON h.id = p.placar_herdado_de
     WHERE p.empresa_id = $1
     ORDER BY u.nome`,
    [empresaId]
  );
  return rows;
}

// Mesma governança do Responsável de etapa: só usuário (não Master, ativo)
// com esta empresa no cadastro — ver reguaCobranca.service.js::listResponsaveis.
async function garantirElegivel(empresaId, usuarioId) {
  const elegiveis = await listResponsaveis(empresaId);
  const usuario = elegiveis.find((u) => String(u.id) === String(usuarioId));
  if (!usuario) throw badRequest('O atendente precisa ser um usuário ativo (não Master) com esta empresa no cadastro.');
  return usuario;
}

async function garantirParticipante(empresaId, usuarioId, db = pool) {
  const { rows } = await db.query(
    `SELECT u.nome FROM regua_cobranca_distribuicao_participantes p JOIN usuarios u ON u.id = p.usuario_id
     WHERE p.empresa_id = $1 AND p.usuario_id = $2`,
    [empresaId, usuarioId]
  );
  if (!rows[0]) throw badRequest('Este usuário não está na lista de atendentes.');
  return rows[0];
}

async function adicionarParticipante(empresaId, usuarioId, autorId) {
  const usuario = await garantirElegivel(empresaId, usuarioId);
  const data = await hoje(empresaId);
  const { rowCount } = await pool.query(
    `INSERT INTO regua_cobranca_distribuicao_participantes (empresa_id, usuario_id, entrou_em)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [empresaId, usuarioId, data]
  );
  if (rowCount) await registrarLog(pool, empresaId, 'entrada', `${usuario.nome} entrou na distribuição.`, autorId);
}

// Sai da lista. A carteira dele fica gravada até a próxima distribuição: os
// clientes que aparecerem na Rotina voltam pra distribuição como
// "liberados" (ver distribuirDia). O que já foi distribuído pra ele hoje
// só muda de dono com "Redistribuir hoje".
async function removerParticipante(empresaId, usuarioId, autorId) {
  const { nome } = await garantirParticipante(empresaId, usuarioId);
  await pool.query('DELETE FROM regua_cobranca_distribuicao_participantes WHERE empresa_id = $1 AND usuario_id = $2', [
    empresaId,
    usuarioId,
  ]);
  await registrarLog(pool, empresaId, 'saida', `${nome} saiu da distribuição.`, autorId);
}

// Pausa (férias) até `ate`, inclusive — `null` retoma. Os clientes dele que
// aparecerem nesse período são atendidos por outros como "cobertura", sem
// sair da carteira dele.
async function pausarParticipante(empresaId, usuarioId, ate, autorId) {
  const { nome } = await garantirParticipante(empresaId, usuarioId);
  if (ate && ate < (await hoje(empresaId))) throw badRequest('A data de volta não pode estar no passado.');
  await pool.query(
    'UPDATE regua_cobranca_distribuicao_participantes SET pausado_ate = $3 WHERE empresa_id = $1 AND usuario_id = $2',
    [empresaId, usuarioId, ate || null]
  );
  const [ano, mes, dia] = (ate || '').split('-');
  await registrarLog(
    pool,
    empresaId,
    ate ? 'pausa' : 'retomada',
    ate ? `${nome} pausado(a) até ${dia}/${mes}/${ano}.` : `${nome} voltou à distribuição.`,
    autorId
  );
}

// Substituição: a vaga continua, só muda a pessoa. O novo atendente herda a
// carteira inteira e o placar do mês do anterior (senão, começando do zero,
// ele receberia prioridade nos clientes novos mesmo já com a carteira
// cheia). O que o anterior JÁ trabalhou hoje continua com ele (o histórico
// mostra quem fez); o resto do dia passa pro novo.
async function substituirParticipante(empresaId, deId, paraId, autorId) {
  if (String(deId) === String(paraId)) throw badRequest('Escolha uma pessoa diferente para substituir.');
  const de = await garantirParticipante(empresaId, deId);
  const para = await garantirElegivel(empresaId, paraId);
  const data = await hoje(empresaId);

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const { rowCount: jaEsta } = await db.query(
      'SELECT 1 FROM regua_cobranca_distribuicao_participantes WHERE empresa_id = $1 AND usuario_id = $2',
      [empresaId, paraId]
    );
    if (jaEsta) throw badRequest(`${para.nome} já está na lista de atendentes.`);

    await db.query('DELETE FROM regua_cobranca_distribuicao_participantes WHERE empresa_id = $1 AND usuario_id = $2', [
      empresaId,
      deId,
    ]);
    await db.query(
      `INSERT INTO regua_cobranca_distribuicao_participantes (empresa_id, usuario_id, entrou_em, placar_herdado_de, herdado_em)
       VALUES ($1, $2, $3, $4, $3)`,
      [empresaId, paraId, data, deId]
    );
    const { rowCount: clientes } = await db.query(
      'UPDATE regua_cobranca_carteira SET usuario_id = $3, desde = $4 WHERE empresa_id = $1 AND usuario_id = $2',
      [empresaId, deId, paraId, data]
    );

    const trabalhados = await clientesTrabalhadosHoje(db, empresaId, data);
    const { rows: doDia } = await db.query(
      `SELECT client_id::text FROM regua_cobranca_distribuicao_itens WHERE empresa_id = $1 AND data = $2 AND usuario_id = $3`,
      [empresaId, data, deId]
    );
    const passar = doDia.map((r) => r.client_id).filter((c) => !trabalhados.has(c));
    if (passar.length) {
      await db.query(
        `UPDATE regua_cobranca_distribuicao_itens SET usuario_id = $4, motivo = 'transferido', gerado_em = $5
         WHERE empresa_id = $1 AND data = $2 AND client_id = ANY($3::bigint[])`,
        [empresaId, data, passar, paraId, new Date().toISOString()]
      );
    }
    // A presença de hoje (dia trabalhado) passa junto — senão o dia contaria
    // 2 vezes no placar herdado.
    const { rowCount: estavaHoje } = await db.query(
      'DELETE FROM regua_cobranca_distribuicao_presencas WHERE empresa_id = $1 AND data = $2 AND usuario_id = $3',
      [empresaId, data, deId]
    );
    if (estavaHoje) {
      await db.query(
        `INSERT INTO regua_cobranca_distribuicao_presencas (empresa_id, data, usuario_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [empresaId, data, paraId]
      );
    }
    await registrarLog(
      db,
      empresaId,
      'substituicao',
      `${para.nome} substituiu ${de.nome}: ${clientes} cliente(s) da carteira e ${passar.length} da Rotina de hoje passaram para ${para.nome}.`,
      autorId
    );
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

// ─── clientes do dia ───────────────────────────────────────────────────────

// Gravidade de um item da Rotina: Inadimplência antes de tudo, depois a
// etapa mais avançada (mais dias), depois o pior cluster.
function gravidade(item) {
  return [item.cluster === 'inad' ? 1 : 0, item.etapa_dias, CLUSTERS_GRAVIDADE.indexOf(item.cluster)];
}

function compararGravidade(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// Clientes que estão na Rotina de `data` — exatamente os mesmos itens que a
// tela da Rotina mostra (rotinas.service.js::calcularItens), agrupados por
// cliente: valor/títulos somam as parcelas distintas do cliente no dia (uma
// parcela rateada em 2 centros de custo conta 1 vez só) e a faixa é a etapa
// da parcela mais grave.
async function clientesDoDia(empresaId, data) {
  // require tardio: rotinas.service.js também usa este módulo.
  const rotinas = require('../rotinas/rotinas.service');
  const etapas = await rotinas.carregarEtapasRotina(empresaId, null);
  const itens = await rotinas.calcularItens(empresaId, etapas, { dataInicio: data, dataFim: data });

  const porCliente = new Map();
  for (const item of itens) {
    const chave = String(item.client_id);
    if (!porCliente.has(chave)) {
      porCliente.set(chave, { client_id: chave, nome: item.client_name, parcelas: new Map(), faixa: null, gravidade: null });
    }
    const c = porCliente.get(chave);
    c.parcelas.set(`${item.bill_id}|${item.installment_id}`, Number(item.valor) || 0);
    const g = gravidade(item);
    if (!c.gravidade || compararGravidade(g, c.gravidade) > 0) {
      c.gravidade = g;
      c.faixa = { chave: String(item.etapa_id), rotulo: `${CLUSTER_NOME[item.cluster]} · ${item.etapa_nome}` };
    }
  }
  return [...porCliente.values()].map((c) => ({
    client_id: c.client_id,
    nome: c.nome,
    faixa: c.faixa,
    gravidade: c.gravidade,
    parcelas: c.parcelas,
    valor: [...c.parcelas.values()].reduce((s, v) => s + v, 0),
    titulos: c.parcelas.size,
  }));
}

// Clientes com contato MANUAL registrado hoje (WhatsApp/e-mail/ligação
// confirmados na Rotina ou no Histórico) — "já trabalhados": nunca mudam de
// dono numa redistribuição.
async function clientesTrabalhadosHoje(db, empresaId, data) {
  const { rows } = await db.query(
    `SELECT DISTINCT si.client_id::text AS client_id
     FROM regua_cobranca_historico_registros r
     JOIN sie_income si ON si.empresa_id = r.empresa_id AND si.bill_id = r.bill_id AND si.installment_id = r.installment_id
     WHERE r.empresa_id = $1 AND r.data_registro = $2 AND r.tipo = 'manual'`,
    [empresaId, data]
  );
  return new Set(rows.map((r) => r.client_id));
}

// Placar do mês ANTES de `data`: valor recebido e dias trabalhados (dias em
// que participou da distribuição) por atendente, somando o placar herdado
// numa substituição feita neste mês.
async function carregarPlacar(db, empresaId, data, participantes) {
  const inicio = inicioDoMes(data);
  const [{ rows: valores }, { rows: dias }] = await Promise.all([
    db.query(
      `SELECT usuario_id::text, SUM(valor)::float AS valor FROM regua_cobranca_distribuicao_itens
       WHERE empresa_id = $1 AND data >= $2 AND data < $3 GROUP BY usuario_id`,
      [empresaId, inicio, data]
    ),
    db.query(
      `SELECT usuario_id::text, COUNT(*)::int AS dias FROM regua_cobranca_distribuicao_presencas
       WHERE empresa_id = $1 AND data >= $2 AND data < $3 GROUP BY usuario_id`,
      [empresaId, inicio, data]
    ),
  ]);
  const bruto = new Map();
  for (const v of valores) bruto.set(v.usuario_id, { valor: v.valor, dias: 0 });
  for (const d of dias) bruto.set(d.usuario_id, { valor: bruto.get(d.usuario_id)?.valor ?? 0, dias: d.dias });

  const placar = new Map();
  for (const p of participantes) {
    const proprio = bruto.get(String(p.usuario_id)) || { valor: 0, dias: 0 };
    const herdado =
      p.placar_herdado_de && p.herdado_em && p.herdado_em >= inicio ? bruto.get(String(p.placar_herdado_de)) : null;
    placar.set(String(p.usuario_id), {
      valor: proprio.valor + (herdado?.valor ?? 0),
      dias: proprio.dias + (herdado?.dias ?? 0),
    });
  }
  return placar;
}

// "Repassar parte da carteira": move clientes de quem tem a maior carteira
// pra quem tem a menor, até a diferença ficar em no máximo 1 — só clientes
// sem contato manual nos últimos DIAS_SEM_CONTATO_REPASSE dias (sem
// negociação em andamento), os de contato mais antigo primeiro. Só entre
// atendentes ativos hoje (pausado não dá nem recebe).
async function equilibrarCarteiras(db, empresaId, data, ativos, carteira) {
  const { rows } = await db.query(
    `SELECT c.client_id::text AS client_id, c.usuario_id::text AS usuario_id, MAX(r.data_registro)::text AS ultimo_contato
     FROM regua_cobranca_carteira c
     LEFT JOIN sie_income si ON si.empresa_id = c.empresa_id AND si.client_id = c.client_id
     LEFT JOIN regua_cobranca_historico_registros r
       ON r.empresa_id = c.empresa_id AND r.bill_id = si.bill_id AND r.installment_id = si.installment_id AND r.tipo = 'manual'
     WHERE c.empresa_id = $1
     GROUP BY c.client_id, c.usuario_id`,
    [empresaId]
  );
  const limite = somarDiasIso(data, -DIAS_SEM_CONTATO_REPASSE);
  const porDono = new Map(ativos.map((p) => [p, []]));
  for (const r of rows) if (porDono.has(r.usuario_id)) porDono.get(r.usuario_id).push(r);
  const movivel = (r) => !r.ultimo_contato || r.ultimo_contato < limite;
  for (const lista of porDono.values()) {
    lista.sort((a, b) => (a.ultimo_contato || '').localeCompare(b.ultimo_contato || ''));
  }

  const movidos = new Set();
  const semMovivel = new Set();
  for (;;) {
    const candidatos = ativos.filter((p) => !semMovivel.has(p));
    if (candidatos.length < 2) break;
    const ordem = [...ativos].sort((a, b) => porDono.get(a).length - porDono.get(b).length);
    const menor = ordem[0];
    const maior = [...candidatos].sort((a, b) => porDono.get(b).length - porDono.get(a).length)[0];
    if (porDono.get(maior).length - porDono.get(menor).length <= 1) break;
    const idx = porDono.get(maior).findIndex(movivel);
    if (idx < 0) {
      semMovivel.add(maior);
      continue;
    }
    const [cliente] = porDono.get(maior).splice(idx, 1);
    porDono.get(menor).push(cliente);
    carteira.set(cliente.client_id, menor);
    movidos.add(cliente.client_id);
  }

  if (movidos.size) {
    const ids = [...movidos];
    await db.query(
      `UPDATE regua_cobranca_carteira c SET usuario_id = x.usuario_id, desde = $2
       FROM unnest($3::bigint[], $4::int[]) AS x(client_id, usuario_id)
       WHERE c.empresa_id = $1 AND c.client_id = x.client_id`,
      [empresaId, data, ids, ids.map((id) => Number(carteira.get(id)))]
    );
  }
  return movidos;
}

// ─── a distribuição ────────────────────────────────────────────────────────

// Distribui a Rotina de HOJE (data do sistema, fuso BR).
//   redistribuir = false (Monitor de Integrações, agendada ou "Atualizar
//     agora"): incremental — quem já recebeu cliente hoje continua com ele;
//     só os clientes ainda sem dono hoje (ex.: entraram depois de uma
//     atualização da base) são distribuídos.
//   redistribuir = true ("Redistribuir hoje"): refaz o dia com a equipe
//     atual. Só o que já foi trabalhado hoje (contato manual registrado)
//     fica com quem trabalhou.
//   equilibrarCarteiras = true: antes de redistribuir, repassa parte das
//     carteiras maiores pras menores (ver equilibrarCarteiras).
async function distribuirDia(empresaId, { redistribuir = false, equilibrar = false, usuarioId = null } = {}) {
  const cfg = await getConfig(empresaId);
  if (cfg.modo !== 'automatica') {
    throw badRequest('A distribuição automática não está ligada nesta empresa (Régua de Cobrança > Configurações Globais).');
  }
  const data = await hoje(empresaId);
  const participantes = await carregarParticipantes(empresaId);
  const ativos = participantes.filter((p) => !pausadoNoDia(p, data)).map((p) => String(p.usuario_id));
  if (ativos.length === 0) throw badRequest('Nenhum atendente ativo para receber a distribuição.');
  const pausados = new Set(participantes.filter((p) => pausadoNoDia(p, data)).map((p) => String(p.usuario_id)));
  const participa = new Set(participantes.map((p) => String(p.usuario_id)));
  const nomePor = new Map(participantes.map((p) => [String(p.usuario_id), p.nome]));

  const clientes = await clientesDoDia(empresaId, data);

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Uma distribuição por empresa de cada vez (agendada x botão).
    await db.query('SELECT pg_advisory_xact_lock(7301, $1)', [empresaId]);

    // Liberação: cliente sem aparecer na Rotina há mais de `dias_liberacao`
    // dias sai da carteira — na próxima vez que aparecer, é cliente novo.
    const { rowCount: liberados } = await db.query(
      `DELETE FROM regua_cobranca_carteira WHERE empresa_id = $1 AND ultima_aparicao < ($2::date - $3::int)`,
      [empresaId, data, cfg.dias_liberacao]
    );

    const { rows: cart } = await db.query(
      'SELECT client_id::text, usuario_id::text FROM regua_cobranca_carteira WHERE empresa_id = $1',
      [empresaId]
    );
    const carteira = new Map(cart.map((r) => [r.client_id, r.usuario_id]));

    const transferidos = redistribuir && equilibrar ? await equilibrarCarteiras(db, empresaId, data, ativos, carteira) : new Set();

    const { rows: exist } = await db.query(
      `SELECT client_id::text, usuario_id::text, motivo FROM regua_cobranca_distribuicao_itens WHERE empresa_id = $1 AND data = $2`,
      [empresaId, data]
    );
    const existentes = new Map(exist.map((r) => [r.client_id, r]));
    const trabalhados = await clientesTrabalhadosHoje(db, empresaId, data);
    const placar = await carregarPlacar(db, empresaId, data, participantes);

    // Carga de hoje por atendente ativo.
    const carga = new Map(ativos.map((p) => [p, { qtd: 0, valor: 0, faixa: new Map() }]));
    const somar = (p, c) => {
      const h = carga.get(p);
      if (!h) return;
      h.qtd++;
      h.valor += c.valor;
      h.faixa.set(c.faixa.chave, (h.faixa.get(c.faixa.chave) || 0) + 1);
    };
    const media = (p) => {
      const pl = placar.get(p) || { valor: 0, dias: 0 };
      return (pl.valor + carga.get(p).valor) / (pl.dias + 1);
    };

    const decisoes = []; // { cliente, usuario, motivo, mantido }
    const livres = [];
    for (const c of clientes) {
      const ex = existentes.get(c.client_id);
      const manter = ex && (trabalhados.has(c.client_id) || (!redistribuir && participa.has(ex.usuario_id)));
      if (manter) {
        somar(ex.usuario_id, c);
        decisoes.push({ cliente: c, usuario: ex.usuario_id, motivo: ex.motivo, mantido: true });
        continue;
      }
      const dono = carteira.get(c.client_id);
      if (dono && carga.has(dono)) {
        somar(dono, c);
        decisoes.push({ cliente: c, usuario: dono, motivo: transferidos.has(c.client_id) ? 'transferido' : 'continuidade' });
        continue;
      }
      livres.push({ cliente: c, motivo: dono && pausados.has(dono) ? 'cobertura' : dono ? 'liberado' : 'novo' });
    }

    // Faixas, da mais grave pra mais leve.
    const faixas = new Map();
    for (const l of livres) {
      const f = l.cliente.faixa.chave;
      if (!faixas.has(f)) faixas.set(f, { gravidade: l.cliente.gravidade, lista: [] });
      faixas.get(f).lista.push(l);
    }
    const ordemFaixas = [...faixas.entries()].sort((a, b) => compararGravidade(b[1].gravidade, a[1].gravidade));

    for (const [chaveFaixa, { lista }] of ordemFaixas) {
      lista.sort((a, b) => b.cliente.valor - a.cliente.valor);
      // 1º QUANTOS.
      const cota = new Map(ativos.map((p) => [p, 0]));
      const qtdFaixa = (p) => (carga.get(p).faixa.get(chaveFaixa) || 0) + cota.get(p);
      const qtdTotal = (p) => carga.get(p).qtd + cota.get(p);
      for (let i = 0; i < lista.length; i++) {
        const p = [...ativos].sort(
          (a, b) => qtdFaixa(a) - qtdFaixa(b) || qtdTotal(a) - qtdTotal(b) || media(a) - media(b) || Number(a) - Number(b)
        )[0];
        cota.set(p, cota.get(p) + 1);
      }
      // 2º QUAIS.
      for (const l of lista) {
        const p = ativos.filter((x) => cota.get(x) > 0).sort((a, b) => media(a) - media(b) || Number(a) - Number(b))[0];
        cota.set(p, cota.get(p) - 1);
        somar(p, l.cliente);
        decisoes.push({ cliente: l.cliente, usuario: p, motivo: l.motivo });
      }
    }

    // ── gravação ──
    const agora = new Date().toISOString();
    const idsHoje = clientes.map((c) => c.client_id);
    // Cliente que saiu da Rotina de hoje (pagou, base atualizada) e não foi
    // trabalhado: sai da distribuição do dia.
    await db.query(
      `DELETE FROM regua_cobranca_distribuicao_itens
       WHERE empresa_id = $1 AND data = $2 AND NOT (client_id = ANY($3::bigint[])) AND NOT (client_id = ANY($4::bigint[]))`,
      [empresaId, data, idsHoje, [...trabalhados]]
    );
    if (decisoes.length) {
      await db.query(
        `INSERT INTO regua_cobranca_distribuicao_itens (empresa_id, data, client_id, usuario_id, motivo, faixa, valor, titulos, gerado_em)
         SELECT $1, $2, x.client_id, x.usuario_id, x.motivo, x.faixa, x.valor, x.titulos, $3
         FROM unnest($4::bigint[], $5::int[], $6::text[], $7::text[], $8::numeric[], $9::int[])
           AS x(client_id, usuario_id, motivo, faixa, valor, titulos)
         ON CONFLICT (empresa_id, data, client_id) DO UPDATE SET
           gerado_em = CASE WHEN regua_cobranca_distribuicao_itens.usuario_id = EXCLUDED.usuario_id
                            THEN regua_cobranca_distribuicao_itens.gerado_em ELSE EXCLUDED.gerado_em END,
           usuario_id = EXCLUDED.usuario_id, motivo = EXCLUDED.motivo, faixa = EXCLUDED.faixa,
           valor = EXCLUDED.valor, titulos = EXCLUDED.titulos`,
        [
          empresaId,
          data,
          agora,
          decisoes.map((d) => d.cliente.client_id),
          decisoes.map((d) => Number(d.usuario)),
          decisoes.map((d) => d.motivo),
          decisoes.map((d) => d.cliente.faixa.rotulo),
          decisoes.map((d) => d.cliente.valor),
          decisoes.map((d) => d.cliente.titulos),
        ]
      );
    }

    // Carteira: quem recebeu (fora cobertura) vira/continua dono; cobertura
    // só renova a última aparição na carteira do dono pausado.
    const paraCarteira = decisoes.filter((d) => d.motivo !== 'cobertura' && participa.has(d.usuario));
    if (paraCarteira.length) {
      await db.query(
        `INSERT INTO regua_cobranca_carteira (empresa_id, client_id, usuario_id, desde, ultima_aparicao)
         SELECT $1, x.client_id, x.usuario_id, $2, $2 FROM unnest($3::bigint[], $4::int[]) AS x(client_id, usuario_id)
         ON CONFLICT (empresa_id, client_id) DO UPDATE SET
           desde = CASE WHEN regua_cobranca_carteira.usuario_id = EXCLUDED.usuario_id
                        THEN regua_cobranca_carteira.desde ELSE EXCLUDED.desde END,
           usuario_id = EXCLUDED.usuario_id, ultima_aparicao = EXCLUDED.ultima_aparicao`,
        [empresaId, data, paraCarteira.map((d) => d.cliente.client_id), paraCarteira.map((d) => Number(d.usuario))]
      );
    }
    const coberturas = decisoes.filter((d) => d.motivo === 'cobertura').map((d) => d.cliente.client_id);
    if (coberturas.length) {
      await db.query(
        'UPDATE regua_cobranca_carteira SET ultima_aparicao = $2 WHERE empresa_id = $1 AND client_id = ANY($3::bigint[])',
        [empresaId, data, coberturas]
      );
    }

    await db.query('DELETE FROM regua_cobranca_distribuicao_presencas WHERE empresa_id = $1 AND data = $2', [empresaId, data]);
    await db.query(
      `INSERT INTO regua_cobranca_distribuicao_presencas (empresa_id, data, usuario_id)
       SELECT $1, $2, x FROM unnest($3::int[]) AS x`,
      [empresaId, data, ativos.map(Number)]
    );

    // Resumo (vai pro log e pro histórico do Monitor).
    const porAtendente = new Map();
    const porMotivo = {};
    for (const d of decisoes) {
      const a = porAtendente.get(d.usuario) || { clientes: 0, valor: 0 };
      a.clientes++;
      a.valor += d.cliente.valor;
      porAtendente.set(d.usuario, a);
      porMotivo[d.motivo] = (porMotivo[d.motivo] || 0) + 1;
    }
    const nomeMotivo = {
      continuidade: 'continuidade',
      novo: 'novo(s)',
      liberado: 'liberado(s) da carteira',
      cobertura: 'cobertura',
      transferido: 'transferido(s)',
    };
    const partes = [...porAtendente.entries()]
      .map(([u, a]) => `${nomePor.get(u) || 'Usuário removido'} ${a.clientes} (${moeda(a.valor)})`)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const motivos = Object.entries(porMotivo).map(([m, q]) => `${q} ${nomeMotivo[m]}`);
    let resumo =
      decisoes.length === 0
        ? 'Nenhum cliente na Rotina de hoje.'
        : `${decisoes.length} cliente(s) distribuído(s) — ${partes.join(' · ')}. ${motivos.join(', ')}.`;
    if (liberados) resumo += ` ${liberados} cliente(s) liberado(s) da carteira por ${cfg.dias_liberacao} dias sem aparecer.`;
    if (transferidos.size) resumo += ` ${transferidos.size} cliente(s) repassado(s) para equilibrar as carteiras.`;

    // Execução incremental sem nada novo (ex.: o Monitor rodou de novo no
    // mesmo dia) não polui o registro de mudanças.
    const alterados = decisoes.filter((d) => !d.mantido).length;
    if (!redistribuir && alterados === 0 && decisoes.length > 0) {
      resumo = `Nada novo para distribuir: os ${decisoes.length} cliente(s) de hoje já estavam distribuídos.`;
    } else {
      await registrarLog(db, empresaId, redistribuir ? 'redistribuicao' : 'distribuicao', resumo, usuarioId);
    }
    await db.query('COMMIT');
    return { data, resumo };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}

// ─── leitura (Rotina, Gestão das Parcelas, painel) ─────────────────────────

// Donos de cada cliente num período: o que foi gravado em cada dia e a
// carteira atual (previsão pros dias ainda não distribuídos) — ver
// rotinas.service.js::listRotinas.
async function donosNoPeriodo(empresaId, dataInicio, dataFim) {
  const [{ rows: dias }, { rows: cart }, participantes] = await Promise.all([
    pool.query(
      `SELECT data::text AS data, client_id::text AS client_id, usuario_id, motivo FROM regua_cobranca_distribuicao_itens
       WHERE empresa_id = $1 AND data BETWEEN $2 AND $3`,
      [empresaId, dataInicio, dataFim]
    ),
    pool.query('SELECT client_id::text AS client_id, usuario_id FROM regua_cobranca_carteira WHERE empresa_id = $1', [empresaId]),
    carregarParticipantes(empresaId),
  ]);
  const porUsuario = new Map(participantes.map((p) => [String(p.usuario_id), p]));
  const carteira = new Map(cart.map((r) => [r.client_id, r.usuario_id]));
  return {
    porDia: new Map(dias.map((r) => [`${r.data}|${r.client_id}`, { usuario_id: r.usuario_id, motivo: r.motivo }])),
    // Previsão pra um dia ainda não distribuído: o dono da carteira, desde
    // que continue atendente e não esteja pausado naquele dia (senão o
    // cliente vai pra distribuição — "A distribuir").
    previsto(clientId, data) {
      const dono = carteira.get(String(clientId));
      const p = dono && porUsuario.get(String(dono));
      return p && !pausadoNoDia(p, data) ? dono : null;
    },
  };
}

// Dono de cada cliente na carteira (Distribuição automática) — `null` no
// modo "Responsável por etapa". Usado pela coluna/filtro "Responsável" da
// Gestão das Parcelas.
async function mapaDonosCarteira(empresaId) {
  const { modo } = await getConfig(empresaId);
  if (modo !== 'automatica') return null;
  const { rows } = await pool.query(
    `SELECT c.client_id::text AS client_id, c.usuario_id, u.nome FROM regua_cobranca_carteira c
     JOIN usuarios u ON u.id = c.usuario_id WHERE c.empresa_id = $1`,
    [empresaId]
  );
  return new Map(rows.map((r) => [r.client_id, { usuario_id: r.usuario_id, nome: r.nome }]));
}

// Tudo que o bloco "Distribuição da Rotina" das Configurações Globais
// mostra: modo, atendentes com carteira/hoje/média do mês, situação da
// distribuição de hoje, horário no Monitor e as últimas mudanças.
async function getPainel(empresaId) {
  const config = await getConfig(empresaId);
  const data = await hoje(empresaId);
  const inicio = inicioDoMes(data);
  const [participantes, elegiveisTodos] = await Promise.all([carregarParticipantes(empresaId), listResponsaveis(empresaId)]);

  const [carteiras, doDia, mes, presencas, orfaos, agendamento, ultimaExecucao, log] = await Promise.all([
    pool.query(
      'SELECT usuario_id::text, COUNT(*)::int AS clientes FROM regua_cobranca_carteira WHERE empresa_id = $1 GROUP BY usuario_id',
      [empresaId]
    ),
    pool.query(
      `SELECT usuario_id::text, COUNT(*)::int AS clientes, SUM(valor)::float AS valor, SUM(titulos)::int AS titulos,
              MAX(gerado_em) AS gerado_em
       FROM regua_cobranca_distribuicao_itens WHERE empresa_id = $1 AND data = $2 GROUP BY usuario_id`,
      [empresaId, data]
    ),
    pool.query(
      `SELECT usuario_id::text, SUM(valor)::float AS valor FROM regua_cobranca_distribuicao_itens
       WHERE empresa_id = $1 AND data >= $2 AND data <= $3 GROUP BY usuario_id`,
      [empresaId, inicio, data]
    ),
    pool.query(
      `SELECT usuario_id::text, COUNT(*)::int AS dias, BOOL_OR(data = $3) AS hoje FROM regua_cobranca_distribuicao_presencas
       WHERE empresa_id = $1 AND data >= $2 AND data <= $3 GROUP BY usuario_id`,
      [empresaId, inicio, data]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS clientes FROM regua_cobranca_carteira c
       WHERE c.empresa_id = $1 AND NOT EXISTS (
         SELECT 1 FROM regua_cobranca_distribuicao_participantes p WHERE p.empresa_id = c.empresa_id AND p.usuario_id = c.usuario_id)`,
      [empresaId]
    ),
    pool.query(
      `SELECT ativo, frequencia, to_char(horario, 'HH24:MI') AS horario, dia_semana, dia_mes, ultima_agendada_em
       FROM monitor_integracoes_agendamentos WHERE empresa_id = $1 AND rotina = $2`,
      [empresaId, ROTINA_MONITOR]
    ),
    pool.query(
      `SELECT status, iniciado_em, finalizado_em, resumo, erro FROM monitor_integracoes_execucoes
       WHERE empresa_id = $1 AND rotina = $2 ORDER BY iniciado_em DESC LIMIT 1`,
      [empresaId, ROTINA_MONITOR]
    ),
    pool.query(
      `SELECT l.acao, l.descricao, l.criado_em, u.nome AS usuario_nome FROM regua_cobranca_distribuicao_log l
       LEFT JOIN usuarios u ON u.id = l.usuario_id WHERE l.empresa_id = $1 ORDER BY l.criado_em DESC LIMIT 12`,
      [empresaId]
    ),
  ]);

  const porUsuario = (rows) => new Map(rows.map((r) => [r.usuario_id, r]));
  const cart = porUsuario(carteiras.rows);
  const dia = porUsuario(doDia.rows);
  const valorMes = porUsuario(mes.rows);
  const dias = porUsuario(presencas.rows);

  const lista = participantes.map((p) => {
    const id = String(p.usuario_id);
    const herdou = p.placar_herdado_de && p.herdado_em && p.herdado_em >= inicio ? String(p.placar_herdado_de) : null;
    const valor = (valorMes.get(id)?.valor ?? 0) + (herdou ? valorMes.get(herdou)?.valor ?? 0 : 0);
    const diasTrab = (dias.get(id)?.dias ?? 0) + (herdou ? dias.get(herdou)?.dias ?? 0 : 0);
    return {
      usuario_id: p.usuario_id,
      nome: p.nome,
      entrou_em: p.entrou_em,
      pausado_ate: pausadoNoDia(p, data) ? p.pausado_ate : null,
      herdado_de_nome: herdou ? p.herdado_de_nome : null,
      carteira: cart.get(id)?.clientes ?? 0,
      hoje: { clientes: dia.get(id)?.clientes ?? 0, valor: dia.get(id)?.valor ?? 0, titulos: dia.get(id)?.titulos ?? 0 },
      mes: { valor, dias: diasTrab, media: diasTrab ? valor / diasTrab : 0 },
    };
  });

  const participa = new Set(participantes.map((p) => String(p.usuario_id)));
  const ativosHoje = participantes.filter((p) => !pausadoNoDia(p, data)).map((p) => String(p.usuario_id));
  const presentesHoje = [...dias.entries()].filter(([, d]) => d.hoje).map(([u]) => u);
  const distribuida = doDia.rows.length > 0 || presentesHoje.length > 0;
  const geradoEm = doDia.rows.reduce((max, r) => (!max || r.gerado_em > max ? r.gerado_em : max), null);
  const equipeMudou =
    distribuida &&
    (ativosHoje.length !== presentesHoje.length || ativosHoje.some((u) => !presentesHoje.includes(u)));

  // Clientes de hoje ainda sem dono gravado (entraram depois da distribuição).
  let semDistribuicao = 0;
  let totalHoje = doDia.rows.reduce((s, r) => s + r.clientes, 0);
  if (config.modo === 'automatica') {
    const clientes = await clientesDoDia(empresaId, data);
    const { rows: gravados } = await pool.query(
      'SELECT client_id::text FROM regua_cobranca_distribuicao_itens WHERE empresa_id = $1 AND data = $2',
      [empresaId, data]
    );
    const gravadosSet = new Set(gravados.map((r) => r.client_id));
    semDistribuicao = clientes.filter((c) => !gravadosSet.has(c.client_id)).length;
    totalHoje = Math.max(totalHoje, clientes.length);
  }

  const ag = agendamento.rows[0];
  const ult = ultimaExecucao.rows[0];
  return {
    config,
    data,
    participantes: lista,
    elegiveis: elegiveisTodos.filter((u) => !participa.has(String(u.id))).map((u) => ({ id: u.id, nome: u.nome })),
    hoje: {
      distribuida,
      gerado_em: geradoEm,
      total_clientes: totalHoje,
      sem_distribuicao: semDistribuicao,
      equipe_mudou: equipeMudou,
    },
    carteira_sem_atendente: orfaos.rows[0]?.clientes ?? 0,
    agendamento: ag
      ? { ativo: ag.ativo, frequencia: ag.frequencia, horario: ag.horario, proxima_execucao: proximaExecucao(ag) }
      : null,
    ultima_execucao: ult
      ? { status: ult.status, iniciado_em: ult.iniciado_em, finalizado_em: ult.finalizado_em, resumo: ult.resumo, erro: ult.erro }
      : null,
    log: log.rows,
  };
}

// Disponibilidade da rotina no Monitor de Integrações (null = pode rodar).
async function motivoIndisponivel(empresaId) {
  const { modo } = await getConfig(empresaId);
  if (modo !== 'automatica') {
    return 'A distribuição automática está desligada (Gestão de Cobranças > Régua de Cobrança > Configurações Globais).';
  }
  const { rowCount } = await pool.query(
    'SELECT 1 FROM regua_cobranca_distribuicao_participantes WHERE empresa_id = $1 LIMIT 1',
    [empresaId]
  );
  return rowCount ? null : 'Cadastre os atendentes da distribuição (Régua de Cobrança > Configurações Globais).';
}

module.exports = {
  MODOS,
  ROTINA_MONITOR,
  getConfig,
  salvarConfig,
  adicionarParticipante,
  removerParticipante,
  pausarParticipante,
  substituirParticipante,
  distribuirDia,
  donosNoPeriodo,
  mapaDonosCarteira,
  getPainel,
  motivoIndisponivel,
};
