const pool = require('../../../config/db');
const { z, falha, r2 } = require('../dfc/tools/comum');
const { getDataSistema } = require('../../regua-cobranca/reguaCobranca.service');

// Utilidades do módulo GESTÃO DE COBRANÇAS do conector Horizon: datas (texto AAAA-MM-DD, fuso BR — a
// mesma "data de hoje" da Rotina), moeda, rótulos e a resolução de cliente/atendente/centro por id ou nome.

const dataSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD.');
const ORIGIN_ID = 'CO';

const CLUSTER_NOME = {
  novo: 'Novo cliente',
  bom: 'Bom pagador',
  duvidoso: 'Pagador duvidoso',
  mau: 'Mau pagador',
  inad: 'Inadimplência',
};
const CANAL_NOME = { whatsapp: 'WhatsApp', email: 'E-mail', ligacao: 'Ligação' };
const MOTIVO_DISTRIBUICAO = {
  continuidade: 'Continuidade (já era da carteira dela)',
  novo: 'Novo (sem dono na carteira)',
  liberado: 'Liberado da carteira (o dono saiu da distribuição)',
  cobertura: 'Cobertura (o dono estava pausado/férias)',
  transferido: 'Transferido (substituição de atendente ou repasse para equilibrar carteiras)',
};
const STATUS_PARCELA = {
  em_dia: 'Paga em dia',
  atraso: 'Paga com atraso',
  inadimplente: 'Inadimplente',
  a_vencer: 'Em aberto (a vencer ou vencida dentro do limite)',
};

const br = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : null);
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const quando = (v) =>
  v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : null;
// Colunas TIMESTAMP sem fuso gravadas pelo NOW() do banco (relógio do Postgres em hora de Brasília): o
// driver monta o Date no fuso do processo, então os getters locais devolvem a hora gravada, sem conversão.
const horaLocal = (v) => {
  if (!v) return null;
  const d = new Date(v);
  const p2 = (n) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
const pct = (feitas, devidas) => (devidas ? r2((feitas / devidas) * 100) : null);
const isoDe = (v) => {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return new Date(v).toISOString().slice(0, 10);
};

function somarDias(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

async function hoje(empresaId) {
  return (await getDataSistema(empresaId)).data_efetiva;
}

// Período: sem nada, do dia 1º do mês até hoje. Limite de dias por consulta (as contas são em memória).
async function periodo(empresaId, { data_inicio, data_fim } = {}, maxDias = 370) {
  const h = await hoje(empresaId);
  const ate = data_fim || (data_inicio && data_inicio > h ? data_inicio : h);
  const de = data_inicio || `${ate.slice(0, 8)}01`;
  if (ate < de) throw falha('A data final precisa ser igual ou depois da inicial.');
  if (diasEntre(de, ate) + 1 > maxDias) throw falha(`Período grande demais: no máximo ${maxDias} dias por consulta.`);
  return { de, ate, hoje: h };
}

async function nomeEmpresa(empresaId) {
  const { rows } = await pool.query(`SELECT COALESCE(NULLIF(nome_fantasia, ''), razao_social) AS nome FROM empresas WHERE id = $1`, [empresaId]);
  return rows[0]?.nome || `Empresa ${empresaId}`;
}

async function nomesUsuarios(ids) {
  const lista = [...new Set((ids || []).filter((x) => x != null).map(Number))];
  if (!lista.length) return new Map();
  const { rows } = await pool.query('SELECT id, nome FROM usuarios WHERE id = ANY($1::int[])', [lista]);
  return new Map(rows.map((r) => [String(r.id), r.nome]));
}

// Cliente por client_id do Sienge ou parte do nome (cadastro de clientes, clusters ou contas a receber).
async function resolverCliente(empresaId, valor) {
  const t = String(valor ?? '').trim();
  if (!t) throw falha('Informe o cliente (client_id do Sienge ou parte do nome).');
  if (/^\d+$/.test(t)) {
    const { rows } = await pool.query(
      `SELECT client_id::text AS client_id, MAX(client_name) AS nome FROM sie_income
        WHERE empresa_id = $1 AND client_id = $2 AND origin_id = $3 GROUP BY client_id`,
      [empresaId, t, ORIGIN_ID]
    );
    if (rows[0]) return rows[0];
    const { rows: cad } = await pool.query('SELECT id::text AS client_id, name AS nome FROM sie_customers WHERE empresa_id = $1 AND id = $2', [
      empresaId,
      t,
    ]);
    if (cad[0]) return cad[0];
    throw falha(`Cliente ${t} não encontrado no contas a receber desta empresa.`);
  }
  const { rows } = await pool.query(
    `SELECT client_id::text AS client_id, MAX(client_name) AS nome
       FROM sie_income WHERE empresa_id = $1 AND origin_id = $2 AND client_name ILIKE $3
      GROUP BY client_id ORDER BY MAX(client_name) LIMIT 20`,
    [empresaId, ORIGIN_ID, `%${t}%`]
  );
  const exato = rows.filter((r) => (r.nome || '').toLowerCase() === t.toLowerCase());
  if (exato.length === 1) return exato[0];
  if (!rows.length) throw falha(`Nenhum cliente com "${t}" no nome no contas a receber desta empresa.`);
  if (rows.length > 1) {
    throw falha(`"${t}" corresponde a vários clientes: ${rows.map((r) => `${r.client_id} ${r.nome}`).join('; ')}. Use o client_id.`);
  }
  return rows[0];
}

// Atendente/usuário por id ou parte do nome — entre os usuários desta empresa e os que aparecem na
// cobrança dela (registros, distribuição, etapas), inclusive quem já saiu.
async function resolverUsuario(empresaId, valor) {
  const t = String(valor ?? '').trim();
  if (!t) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.nome FROM usuarios u
      WHERE u.id IN (
        SELECT usuario_id FROM usuarios_empresas WHERE empresa_id = $1
        UNION SELECT usuario_id FROM regua_cobranca_historico_registros WHERE empresa_id = $1 AND usuario_id IS NOT NULL
        UNION SELECT usuario_id FROM regua_cobranca_distribuicao_itens WHERE empresa_id = $1
        UNION SELECT responsavel_usuario_id FROM regua_cobranca_etapas WHERE empresa_id = $1 AND responsavel_usuario_id IS NOT NULL
      )`,
    [empresaId]
  );
  if (/^\d+$/.test(t)) {
    const u = rows.find((r) => String(r.id) === t);
    if (!u) throw falha(`Usuário ${t} não encontrado nesta empresa.`);
    return u;
  }
  const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const alvo = sem(t);
  const exato = rows.filter((r) => sem(r.nome) === alvo);
  const achados = exato.length ? exato : rows.filter((r) => sem(r.nome).includes(alvo));
  if (!achados.length) throw falha(`Nenhum usuário com "${t}" no nome nesta empresa.`);
  if (achados.length > 1) throw falha(`"${t}" corresponde a vários usuários: ${achados.map((r) => `${r.id} ${r.nome}`).join('; ')}. Use o id.`);
  return achados[0];
}

// Centros de custo por id ou parte do nome — só os do universo da cobrança (com a etapa "Lançamento").
async function resolverCentros(empresaId, lista) {
  if (!lista || !lista.length) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT c.sienge_id, c.name FROM centros_custo_sienge c
       JOIN centro_custo_etapas_historico h ON h.sienge_id = c.sienge_id AND h.empresa_id = c.empresa_id AND h.data_inicio IS NOT NULL
       JOIN mascara_itens m ON m.id = h.mascara_item_id AND m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.descricao = 'Lançamento'
      WHERE c.empresa_id = $1`,
    [empresaId]
  );
  return lista.map((item) => {
    const t = String(item).trim();
    if (/^\d+$/.test(t)) {
      const c = rows.find((r) => String(r.sienge_id) === t);
      if (!c) throw falha(`Centro de custo ${t} não está no universo da cobrança (sem a etapa "Lançamento" no Histórico de Etapas).`);
      return Number(c.sienge_id);
    }
    const alvo = t.toLowerCase();
    const exato = rows.filter((r) => r.name.toLowerCase() === alvo);
    const achados = exato.length ? exato : rows.filter((r) => r.name.toLowerCase().includes(alvo));
    if (!achados.length) throw falha(`Nenhum centro de custo da cobrança com "${t}" no nome.`);
    if (achados.length > 1) throw falha(`"${t}" corresponde a vários centros: ${achados.map((r) => `${r.sienge_id} ${r.name}`).join('; ')}. Use o id.`);
    return Number(achados[0].sienge_id);
  });
}

// Rotinas do Monitor de Integrações que alimentam a cobrança, na ordem em que devem rodar.
const ROTINAS_COBRANCA = [
  ['cobranca_clientes', 'Clientes (Sienge) — cadastro, telefones e e-mails usados no envio'],
  ['cobranca_base', 'Base do contas a receber (Sienge) — parcelas, saldos e recebimentos (base de tudo)'],
  ['cobranca_clusters', 'Recálculo dos clusters — aplica a versão vigente do Motor de Risco'],
  ['cobranca_distribuicao', 'Distribuição da Rotina de Cobrança — reparte os clientes do dia entre os atendentes'],
];
const FREQ = { diaria: 'diária', semanal: 'semanal', mensal: 'mensal' };

async function situacaoRotinas(empresaId) {
  const chaves = ROTINAS_COBRANCA.map(([c]) => c);
  const [{ rows: ag }, { rows: ex }] = await Promise.all([
    pool.query(
      `SELECT rotina, ativo, frequencia, to_char(horario, 'HH24:MI') AS horario, dia_semana, dia_mes
         FROM monitor_integracoes_agendamentos WHERE empresa_id = $1 AND rotina = ANY($2)`,
      [empresaId, chaves]
    ),
    pool.query(
      `SELECT DISTINCT ON (rotina) rotina, status, iniciado_em, finalizado_em, resumo, erro
         FROM monitor_integracoes_execucoes WHERE empresa_id = $1 AND rotina = ANY($2)
        ORDER BY rotina, iniciado_em DESC`,
      [empresaId, chaves]
    ),
  ]);
  const { rows: sucesso } = await pool.query(
    `SELECT rotina, MAX(iniciado_em) AS em FROM monitor_integracoes_execucoes
      WHERE empresa_id = $1 AND rotina = ANY($2) AND status = 'sucesso' GROUP BY rotina`,
    [empresaId, chaves]
  );
  return ROTINAS_COBRANCA.map(([chave, nome]) => {
    const a = ag.find((x) => x.rotina === chave);
    const e = ex.find((x) => x.rotina === chave);
    const s = sucesso.find((x) => x.rotina === chave);
    return {
      rotina: chave,
      nome,
      agendamento: a?.ativo
        ? `${FREQ[a.frequencia] || a.frequencia} às ${a.horario}${a.frequencia === 'mensal' && a.dia_mes ? ` (dia ${a.dia_mes})` : ''}`
        : 'SEM agendamento ativo (só roda se alguém clicar)',
      ultimo_sucesso: quando(s?.em) || 'nunca',
      ultima_execucao: e
        ? { status: e.status, iniciou: quando(e.iniciado_em), terminou: quando(e.finalizado_em), resumo: e.resumo, erro: e.erro }
        : null,
    };
  });
}

module.exports = {
  z,
  falha,
  r2,
  dataSchema,
  ORIGIN_ID,
  CLUSTER_NOME,
  CANAL_NOME,
  MOTIVO_DISTRIBUICAO,
  STATUS_PARCELA,
  br,
  brl,
  quando,
  horaLocal,
  pct,
  isoDe,
  somarDias,
  diasEntre,
  hoje,
  periodo,
  nomeEmpresa,
  nomesUsuarios,
  resolverCliente,
  resolverUsuario,
  resolverCentros,
  situacaoRotinas,
};
