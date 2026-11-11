const { ferramenta } = require('../dfc/tools/comum');
const desempenho = require('../../relatorio-desempenho-cobranca/desempenhoCobranca.service');
const { z, r2, dataSchema, CANAL_NOME, pct, periodo, resolverUsuario, resolverCliente } = require('./base');

// cobranca_desempenho — o relatório Relatórios › Desempenho da Cobrança (mesmo service da tela), resumido
// por atendente em cada aba, com a lista das parcelas se pedir.

const ABAS = {
  pagas: 'Parcelas Pagas (pagamento dentro do período)',
  abertas: 'Parcelas em Aberto (vencimento dentro do período, em aberto no fim dele)',
  distribuidas: 'Parcelas Distribuídas (cada dia de distribuição dentro do período)',
};

function resumir(linhas) {
  const porAtendente = new Map();
  for (const l of linhas) {
    const k = l.atendente;
    const a =
      porAtendente.get(k) || {
        atendente: k,
        parcelas: 0,
        clientes: new Set(),
        valor: 0,
        feitas: 0,
        devidas: 0,
        canais: { whatsapp: [0, 0], email: [0, 0], ligacao: [0, 0] },
        soma_atraso: 0,
        sem_interacao: 0,
      };
    a.parcelas++;
    a.clientes.add(l.clientId);
    a.valor += l.valor || 0;
    a.feitas += l.interacoesFeitas;
    a.devidas += l.interacoesDevidas;
    for (const c of Object.keys(a.canais)) {
      a.canais[c][0] += l.interacoesPorCanal[c][0];
      a.canais[c][1] += l.interacoesPorCanal[c][1];
    }
    a.soma_atraso += l.diasAtraso || 0;
    if (!l.ultimaInteracao) a.sem_interacao++;
    porAtendente.set(k, a);
  }
  return [...porAtendente.values()]
    .map((a) => ({
      atendente: a.atendente,
      parcelas: a.parcelas,
      clientes: a.clientes.size,
      valor: r2(a.valor),
      interacoes_feitas: a.feitas,
      interacoes_devidas: a.devidas,
      pct_cumprido: pct(a.feitas, a.devidas),
      por_canal: Object.fromEntries(
        Object.entries(a.canais)
          .filter(([, v]) => v[1])
          .map(([c, v]) => [CANAL_NOME[c], { feitas: v[0], devidas: v[1], pct: pct(v[0], v[1]) }])
      ),
      dias_atraso_medio: a.parcelas ? r2(a.soma_atraso / a.parcelas) : null,
      parcelas_sem_nenhuma_interacao_dela: a.sem_interacao,
    }))
    .sort((x, y) => y.valor - x.valor);
}

const desempenhoTool = {
  name: 'cobranca_desempenho',
  description:
    'Relatório Desempenho da Cobrança (Relatórios), com as mesmas regras e números da tela: por atendente, em cada aba (Parcelas Pagas, ' +
    'Parcelas em Aberto, Parcelas Distribuídas), quantas parcelas e clientes, valor, interações feitas × devidas (total e por canal, com %), ' +
    'atraso médio e parcelas sem nenhuma interação dela. Com `listar`, traz as parcelas (cliente, centro, vencimento, etapa, pagamento, ' +
    'valor, interações, última interação). Sem datas = do dia 1º do mês até hoje. Regras completas no cobranca_guia (seção 11).',
  inputSchema: {
    data_inicio: dataSchema.optional(),
    data_fim: dataSchema.optional(),
    aba: z.enum(['pagas', 'abertas', 'distribuidas']).optional().describe('Só uma aba (padrão: as 3).'),
    atendente: z.string().optional().describe('Só deste atendente (id ou parte do nome).'),
    cliente: z.string().optional().describe('Só deste cliente (client_id ou parte do nome).'),
    listar: z.boolean().default(false).describe('Traz a lista das parcelas.'),
    limite: z.coerce.number().int().min(1).max(500).default(100).describe('Máximo de parcelas na lista.'),
  },
  handler: ferramenta(async (empresaId, { data_inicio, data_fim, aba, atendente, cliente, listar = false, limite = 100 }) => {
    const p = await periodo(empresaId, { data_inicio, data_fim });
    const [usuario, cli] = await Promise.all([resolverUsuario(empresaId, atendente), cliente ? resolverCliente(empresaId, cliente) : null]);
    const { hoje, parcelas } = await desempenho.getDesempenho(empresaId, { dataInicio: p.de, dataFim: p.ate });
    const filtradas = parcelas.filter(
      (l) => (!aba || l.aba === aba) && (!usuario || String(l.usuarioId) === String(usuario.id)) && (!cli || String(l.clientId) === String(cli.client_id))
    );
    const abas = (aba ? [aba] : Object.keys(ABAS)).map((k) => {
      const linhas = filtradas.filter((l) => l.aba === k);
      const tot = resumir(linhas.map((l) => ({ ...l, atendente: 'TOTAL' })))[0] || null;
      return { aba: ABAS[k], total: tot, por_atendente: resumir(linhas) };
    });
    const resp = { periodo: { de: p.de, ate: p.ate, hoje }, abas };
    if (listar) {
      resp.parcelas = filtradas.slice(0, limite).map((l) => ({
        aba: l.aba,
        atendente: l.atendente,
        cliente: `${l.clientId} ${l.cliente}`,
        centro: l.centroCusto,
        parcela: `${l.billId}/${l.installmentId} (nº ${l.parcela})`,
        condicao: l.condicao,
        vencimento: l.vencimento,
        ...(l.aba === 'distribuidas' ? { distribuida_em: l.dataDistribuicao, etapa: l.etapa } : {}),
        pagamento: l.dataPagamento,
        dias_atraso: l.diasAtraso,
        valor: r2(l.valor),
        interacoes: `${l.interacoesFeitas}/${l.interacoesDevidas}`,
        ultima_interacao: l.ultimaInteracao,
        dias_desde_ultima: l.diasUltimaInteracao,
      }));
      resp.parcelas_total = filtradas.length;
    }
    return resp;
  }),
};

module.exports = { desempenhoTool };
