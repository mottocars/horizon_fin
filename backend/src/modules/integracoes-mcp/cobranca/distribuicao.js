const pool = require('../../../config/db');
const { ferramenta } = require('../dfc/tools/comum');
const distribuicao = require('../../regua-cobranca/distribuicao.service');
const { z, r2, dataSchema, MOTIVO_DISTRIBUICAO, quando, periodo, resolverCliente, resolverUsuario } = require('./base');

// cobranca_distribuicao — a Distribuição da Rotina: o painel das Configurações Globais (atendentes, carteira,
// hoje, média do mês, agendamento, última execução), o resultado gravado dia a dia por atendente, o log de
// mudanças e, para um cliente, cada dia em que foi distribuído e por quê.

const distribuicaoTool = {
  name: 'cobranca_distribuicao',
  description:
    'Distribuição automática da Rotina entre os atendentes: modo, atendentes (entrada, pausa, herança de placar), carteira de cada um, ' +
    'o que recebeu hoje (clientes, títulos, valor), valor e dias trabalhados no mês e a média por dia (que decide quem recebe os maiores ' +
    'valores), clientes de hoje ainda sem dono, agendamento e última execução no Monitor; o resultado gravado dia a dia no período por ' +
    'atendente e por motivo (continuidade, novo, liberado, cobertura, transferido); o log de mudanças (quem ligou, incluiu, pausou, ' +
    'substituiu, redistribuiu); e, com `cliente`, cada dia em que ele foi distribuído, para quem, por quê e de quem é na carteira. ' +
    'Sem datas = do dia 1º do mês até hoje.',
  inputSchema: {
    data_inicio: dataSchema.optional(),
    data_fim: dataSchema.optional(),
    atendente: z.string().optional().describe('Só deste atendente (id ou parte do nome) no dia a dia.'),
    cliente: z.string().optional().describe('client_id ou parte do nome: a distribuição dele dia a dia.'),
  },
  handler: ferramenta(async (empresaId, { data_inicio, data_fim, atendente, cliente }) => {
    const p = await periodo(empresaId, { data_inicio, data_fim });
    const [painel, usuario] = await Promise.all([distribuicao.getPainel(empresaId), resolverUsuario(empresaId, atendente)]);
    const params = [empresaId, p.de, p.ate];
    let filtroU = '';
    if (usuario) {
      params.push(usuario.id);
      filtroU = ` AND d.usuario_id = $${params.length}`;
    }
    const [{ rows: dias }, { rows: log }] = await Promise.all([
      pool.query(
        `SELECT d.data::text AS data, u.nome, d.motivo, COUNT(*)::int AS clientes, SUM(d.titulos)::int AS titulos, SUM(d.valor)::float AS valor
           FROM regua_cobranca_distribuicao_itens d JOIN usuarios u ON u.id = d.usuario_id
          WHERE d.empresa_id = $1 AND d.data BETWEEN $2 AND $3${filtroU}
          GROUP BY 1, 2, 3 ORDER BY 1, 2`,
        params
      ),
      pool.query(
        `SELECT l.acao, l.descricao, l.criado_em, u.nome FROM regua_cobranca_distribuicao_log l LEFT JOIN usuarios u ON u.id = l.usuario_id
          WHERE l.empresa_id = $1 AND (l.criado_em AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3 ORDER BY l.criado_em`,
        [empresaId, p.de, p.ate]
      ),
    ]);
    const porDia = new Map();
    const porAtendente = new Map();
    for (const r of dias) {
      const k = `${r.data}|${r.nome}`;
      const d = porDia.get(k) || { data: r.data, atendente: r.nome, clientes: 0, titulos: 0, valor: 0, motivos: {} };
      d.clientes += r.clientes;
      d.titulos += r.titulos;
      d.valor = r2(d.valor + r.valor);
      d.motivos[r.motivo] = (d.motivos[r.motivo] || 0) + r.clientes;
      porDia.set(k, d);
      const a = porAtendente.get(r.nome) || { atendente: r.nome, dias_com_clientes: new Set(), clientes_dia: 0, valor: 0, motivos: {} };
      a.dias_com_clientes.add(r.data);
      a.clientes_dia += r.clientes;
      a.valor = r2(a.valor + r.valor);
      a.motivos[r.motivo] = (a.motivos[r.motivo] || 0) + r.clientes;
      porAtendente.set(r.nome, a);
    }
    const resp = {
      modo: painel.config.modo === 'automatica' ? 'Distribuição automática' : 'Responsável por etapa (a distribuição não roda)',
      dias_liberacao_carteira: painel.config.dias_liberacao,
      hoje: {
        data: painel.data,
        ja_distribuido: painel.hoje.distribuida,
        gerado_em: quando(painel.hoje.gerado_em),
        clientes_na_rotina: painel.hoje.total_clientes,
        clientes_ainda_sem_dono: painel.hoje.sem_distribuicao,
        equipe_mudou_desde_a_distribuicao: painel.hoje.equipe_mudou,
      },
      atendentes: painel.participantes.map((x) => ({
        nome: x.nome,
        entrou_em: x.entrou_em,
        pausado_ate: x.pausado_ate,
        herdou_placar_de: x.herdado_de_nome,
        clientes_na_carteira: x.carteira,
        hoje: { clientes: x.hoje.clientes, titulos: x.hoje.titulos, valor: r2(x.hoje.valor) },
        mes: { valor_distribuido: r2(x.mes.valor), dias_trabalhados: x.mes.dias, media_por_dia: r2(x.mes.media) },
      })),
      clientes_na_carteira_de_quem_saiu: painel.carteira_sem_atendente,
      monitor: {
        agendamento: painel.agendamento
          ? `${painel.agendamento.ativo ? 'ATIVO' : 'DESLIGADO'} — ${painel.agendamento.frequencia} às ${painel.agendamento.horario}${painel.agendamento.ativo ? `, próxima ${quando(painel.agendamento.proxima_execucao)}` : ''}`
          : 'não agendada (só roda pelo botão)',
        ultima_execucao: painel.ultima_execucao
          ? { status: painel.ultima_execucao.status, iniciou: quando(painel.ultima_execucao.iniciado_em), resumo: painel.ultima_execucao.resumo, erro: painel.ultima_execucao.erro }
          : 'nunca rodou',
      },
      periodo: { de: p.de, ate: p.ate },
      no_periodo_por_atendente: [...porAtendente.values()].map((a) => ({
        atendente: a.atendente,
        dias_com_clientes: a.dias_com_clientes.size,
        clientes_dia: a.clientes_dia,
        valor_distribuido: a.valor,
        motivos: a.motivos,
      })),
      dia_a_dia: [...porDia.values()],
      legenda_motivos: MOTIVO_DISTRIBUICAO,
      log: log.map((l) => ({ quando: quando(l.criado_em), acao: l.acao, por: l.nome || 'Monitor (agendado)', descricao: l.descricao })),
    };
    if (cliente) {
      const c = await resolverCliente(empresaId, cliente);
      const [{ rows: itens }, { rows: cart }] = await Promise.all([
        pool.query(
          `SELECT d.data::text AS data, u.nome, d.motivo, d.faixa, d.valor::float, d.titulos, d.gerado_em FROM regua_cobranca_distribuicao_itens d
             JOIN usuarios u ON u.id = d.usuario_id WHERE d.empresa_id = $1 AND d.client_id = $2 AND d.data BETWEEN $3 AND $4 ORDER BY d.data`,
          [empresaId, c.client_id, p.de, p.ate]
        ),
        pool.query(
          `SELECT u.nome, c.desde::text, c.ultima_aparicao::text FROM regua_cobranca_carteira c JOIN usuarios u ON u.id = c.usuario_id
            WHERE c.empresa_id = $1 AND c.client_id = $2`,
          [empresaId, c.client_id]
        ),
      ]);
      resp.cliente = {
        client_id: c.client_id,
        nome: c.nome,
        carteira: cart[0]
          ? `De ${cart[0].nome} desde ${cart[0].desde} (última vez na Rotina: ${cart[0].ultima_aparicao}; sai da carteira se passar ${painel.config.dias_liberacao} dias sem aparecer)`
          : 'Sem dono na carteira',
        dias: itens.map((i) => ({
          data: i.data,
          atendente: i.nome,
          motivo: MOTIVO_DISTRIBUICAO[i.motivo] || i.motivo,
          faixa: i.faixa,
          valor_no_dia: r2(i.valor),
          titulos: i.titulos,
          gravado_em: quando(i.gerado_em),
        })),
      };
    }
    return resp;
  }),
};

module.exports = { distribuicaoTool };
