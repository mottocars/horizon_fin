const { ferramenta } = require('../dfc/tools/comum');
const gestaoParcelas = require('../../gestao-parcelas/gestaoParcelas.service');
const { z, r2, CLUSTER_NOME, STATUS_PARCELA, isoDe, resolverCentros, resolverUsuario, resolverCliente } = require('./base');

// cobranca_carteira — a aba Gestão das Parcelas (mesmo service da tela: buscarParcelasComCluster), com
// os mesmos 3 valores do Nível 1 (Pago = valor original das pagas; Vencido = saldo das inadimplentes;
// A vencer = saldo do resto em aberto), agrupada como o usuário pedir.

const AGRUPAR = {
  centro: (l) => `${l.cost_center_id} ${l.cost_center_name}`,
  cluster: (l) => CLUSTER_NOME[l.cluster] || 'Novo cliente',
  status: (l) => STATUS_PARCELA[l.status],
  etapa: (l) => (l.saldo_aberto !== 0 ? `${l.status === 'inadimplente' ? 'Inadimplência' : CLUSTER_NOME[l.cluster] || 'Novo cliente'} · ${l.etapa_nome || 'antes da 1ª etapa'}` : 'Paga (sem etapa)'),
  responsavel: (l) => (l.saldo_aberto !== 0 ? l.etapa_responsavel_nome || 'Sem responsável / a distribuir' : 'Paga (sem responsável)'),
  cliente: (l) => `${l.client_id} ${l.client_name}`,
  tipo_pagamento: (l) => (l.payment_term_description || '').trim() || '(sem tipo)',
  mes_vencimento: (l) => isoDe(l.due_date).slice(0, 7),
};

const carteiraTool = {
  name: 'cobranca_carteira',
  description:
    'Aba Gestão das Parcelas: a carteira do universo da cobrança (pagas e em aberto), com os mesmos números da tela — Pago (valor original ' +
    'das parcelas pagas), Vencido (saldo das inadimplentes, D acima do limite) e A vencer (saldo do resto em aberto, inclusive vencidas ' +
    'dentro do limite) — mais clientes e parcelas, agrupada por centro, cluster, status, etapa atual da régua, responsável (etapa ou dono ' +
    'na carteira), cliente, tipo de pagamento ou mês de vencimento. Filtros: centros, status, responsável, cliente/busca por nome.',
  inputSchema: {
    agrupar: z.enum(Object.keys(AGRUPAR)).default('centro'),
    centros: z.array(z.string()).optional().describe('Centros de custo (id ou parte do nome).'),
    status: z.array(z.enum(['em_dia', 'atraso', 'inadimplente', 'a_vencer'])).optional().describe('Filtro "Tipo de Parcela" da tela.'),
    responsavel: z.string().optional().describe('Só as parcelas em aberto deste responsável (id ou parte do nome).'),
    cliente: z.string().optional().describe('client_id ou parte do nome.'),
    limite: z.coerce.number().int().min(1).max(300).default(60).describe('Máximo de grupos.'),
  },
  handler: ferramenta(async (empresaId, { agrupar = 'centro', centros, status, responsavel, cliente, limite = 60 }) => {
    const [costCenterIds, usuario, cli] = await Promise.all([
      resolverCentros(empresaId, centros),
      resolverUsuario(empresaId, responsavel),
      cliente ? resolverCliente(empresaId, cliente) : null,
    ]);
    let linhas = await gestaoParcelas.buscarParcelasComCluster(empresaId, {
      costCenterIds,
      search: cli ? cli.nome : undefined,
      statusParcela: status,
      responsavelIds: usuario ? [usuario.id] : undefined,
    });
    if (cli) linhas = linhas.filter((l) => String(l.client_id) === String(cli.client_id));
    const chave = AGRUPAR[agrupar];
    const grupos = new Map();
    const tot = { parcelas: 0, clientes: new Set(), pago: 0, vencido: 0, a_vencer: 0 };
    for (const l of linhas) {
      const k = chave(l);
      const g = grupos.get(k) || { grupo: k, parcelas: 0, clientes: new Set(), pago: 0, vencido: 0, a_vencer: 0 };
      for (const alvo of [g, tot]) {
        alvo.parcelas++;
        alvo.clientes.add(String(l.client_id));
        if (l.status === 'em_dia' || l.status === 'atraso') alvo.pago += l.valor_original;
        else if (l.status === 'inadimplente') alvo.vencido += l.saldo_aberto;
        else alvo.a_vencer += l.saldo_aberto;
      }
      grupos.set(k, g);
    }
    const fmt = (g) => ({ ...(g.grupo ? { grupo: g.grupo } : {}), parcelas: g.parcelas, clientes: g.clientes.size, pago: r2(g.pago), vencido: r2(g.vencido), a_vencer: r2(g.a_vencer) });
    const lista = [...grupos.values()].sort((a, b) => b.vencido - a.vencido || b.a_vencer - a.a_vencer).map(fmt);
    return {
      agrupado_por: agrupar,
      observacao:
        'Parcela rateada em 2 centros conta nos 2 (como na tela). Pago = valor original da parcela (não o recebido). Responsável: o da etapa atual (modo por etapa) ou o dono do cliente na carteira (Distribuição automática).',
      total: fmt(tot),
      grupos: lista.slice(0, limite),
      grupos_total: lista.length,
    };
  }),
};

module.exports = { carteiraTool };
