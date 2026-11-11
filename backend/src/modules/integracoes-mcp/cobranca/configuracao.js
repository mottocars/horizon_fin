const pool = require('../../../config/db');
const { ferramenta } = require('../dfc/tools/comum');
const reguaService = require('../../regua-cobranca/reguaCobranca.service');
const distribuicao = require('../../regua-cobranca/distribuicao.service');
const { z, CLUSTER_NOME, quando, horaLocal, situacaoRotinas, nomeEmpresa } = require('./base');

// cobranca_configuracao — como a cobrança DESTA empresa está configurada hoje: Motor de Risco (versão
// vigente e as anteriores), Régua de Cobrança (etapas por cluster), Tipo de Comunicação, horários e
// conexões de envio, templates, Tipos de Pagamento, Distribuição da Rotina e as rotinas do Monitor.
// `lerConfiguracao` também alimenta o cobranca_guia.

const ORDEM_CLUSTERS = ['novo', 'bom', 'duvidoso', 'mau', 'inad'];
const TIPO_COMUNICACAO = {
  automatica: 'Comunicação Automática',
  visualizar: 'Visualizar antes de enviar',
  copiar: 'Copiar conteúdo para envio manual',
};
const INDICADOR_NOME = {
  pct_em_dia: 'Parcelas pagas em dia (%)',
  atraso_medio: 'Atraso médio (dias)',
  maior_atraso: 'Maior atraso (dias)',
  reincidencia: 'Reincidência (parcelas acima do gatilho)',
  relacionamento: 'Tempo de relacionamento (meses)',
};
const PARAMETRO_NOME = {
  tolerancia_dias: 'Tolerância de "em dia" (dias)',
  janela_observacao_meses: 'Janela de observação (meses)',
  gatilho_reincidencia_dias: 'Gatilho de reincidência (dias)',
  minimo_parcelas: 'Mínimo de parcelas vencidas para ter score',
  trava_subida_parcelas: 'Trava de subida (parcelas seguidas em dia para melhorar)',
  dias_vencidos_regua_cobranca: 'Dias vencidos para a régua (limite da Inadimplência / regra dura)',
  dia_recalculo: 'Dia de virada da competência (mes_referencia)',
  corte_bom_pagador: 'Bom pagador a partir de (score)',
  corte_pagador_duvidoso: 'Pagador duvidoso a partir de (score)',
};

async function motorRisco(empresaId) {
  const { rows: versoes } = await pool.query(
    `SELECT v.id, v.versao, v.criado_em, u.nome AS criado_por, v.tolerancia_dias, v.janela_observacao_meses,
            v.gatilho_reincidencia_dias, v.minimo_parcelas, v.dia_recalculo, v.trava_subida_parcelas,
            v.dias_vencidos_regua_cobranca, v.corte_bom_pagador, v.corte_pagador_duvidoso
       FROM motor_risco_versoes v LEFT JOIN usuarios u ON u.id = v.criado_por_usuario_id
      WHERE v.empresa_id = $1 ORDER BY v.versao DESC`,
    [empresaId]
  );
  if (!versoes.length) return null;
  const { rows: inds } = await pool.query(
    'SELECT versao_id, indicador, nota_0::float, nota_100::float, peso::float FROM motor_risco_indicadores WHERE versao_id = ANY($1::int[]) ORDER BY id',
    [versoes.map((v) => v.id)]
  );
  const montar = (v) => ({
    versao: v.versao,
    criada_em: horaLocal(v.criado_em),
    criada_por: v.criado_por || null,
    parametros: Object.fromEntries(Object.keys(PARAMETRO_NOME).map((k) => [k, v[k]])),
    indicadores: inds
      .filter((i) => i.versao_id === v.id)
      .map((i) => ({ indicador: i.indicador, nome: INDICADOR_NOME[i.indicador] || i.indicador, nota_0: i.nota_0, nota_100: i.nota_100, peso: i.peso })),
  });
  const lista = versoes.map(montar);
  // O que mudou de uma versão para a anterior (só parâmetros/indicadores diferentes).
  const mudancas = [];
  for (let i = 0; i < lista.length - 1; i++) {
    const nova = lista[i];
    const ant = lista[i + 1];
    const dif = [];
    for (const k of Object.keys(PARAMETRO_NOME)) {
      if (String(nova.parametros[k]) !== String(ant.parametros[k])) dif.push(`${PARAMETRO_NOME[k]}: ${ant.parametros[k]} → ${nova.parametros[k]}`);
    }
    for (const ind of nova.indicadores) {
      const a = ant.indicadores.find((x) => x.indicador === ind.indicador);
      if (!a) continue;
      for (const c of ['nota_0', 'nota_100', 'peso']) if (a[c] !== ind[c]) dif.push(`${ind.nome} ${c}: ${a[c]} → ${ind[c]}`);
    }
    mudancas.push({ de: ant.versao, para: nova.versao, em: nova.criada_em, por: nova.criada_por, mudou: dif.length ? dif : ['nada (versão salva sem mudança)'] });
  }
  return { vigente: lista[0], versoes_anteriores: lista.slice(1).map((v) => ({ versao: v.versao, criada_em: v.criada_em, criada_por: v.criada_por })), mudancas, legenda: PARAMETRO_NOME };
}

async function regua(empresaId) {
  const { rows } = await pool.query(
    `SELECT e.id, e.cluster, e.nome, e.dias, e.canal_whatsapp, e.canal_email, e.canal_ligacao, e.ativa, e.rotina_habilitada,
            t.nome AS template, t.enviar_boleto, u.nome AS responsavel, e.atualizado_em
       FROM regua_cobranca_etapas e
       LEFT JOIN comunicacao_templates t ON t.id = e.template_id
       LEFT JOIN usuarios u ON u.id = e.responsavel_usuario_id
      WHERE e.empresa_id = $1 ORDER BY e.cluster, e.dias NULLS LAST, e.id`,
    [empresaId]
  );
  return ORDEM_CLUSTERS.map((c) => ({
    cluster: c,
    nome: CLUSTER_NOME[c],
    etapas: rows
      .filter((r) => r.cluster === c)
      .map((r) => {
        const canais = [r.canal_whatsapp && 'WhatsApp', r.canal_email && 'E-mail', r.canal_ligacao && 'Ligação'].filter(Boolean);
        const situacao = !r.ativa ? 'INATIVA (ignorada em tudo)' : r.dias == null ? 'SEM DIAS (ignorada em tudo)' : r.rotina_habilitada ? 'ativa e na Rotina' : 'ativa, mas FORA da Rotina (vale só para a Gestão das Parcelas)';
        return {
          id: r.id,
          etapa: r.nome || '(sem nome)',
          dia: r.dias == null ? null : `D${r.dias >= 0 ? '+' : ''}${r.dias}`,
          dias: r.dias,
          canais,
          template: r.template ? `${r.template}${r.enviar_boleto ? ' (manda o boleto)' : ''}` : null,
          responsavel_da_etapa: r.responsavel,
          situacao,
          alterada_em: horaLocal(r.atualizado_em),
        };
      }),
  }));
}

async function comunicacao(empresaId) {
  const [{ tipo }, parametros, { rows: zapi }, { rows: email }, { rows: templates }] = await Promise.all([
    reguaService.getComunicacaoAutomatica(empresaId),
    reguaService.listParametrosDisparo(empresaId),
    pool.query('SELECT id, nome_conexao, ativo FROM integracoes_zapi WHERE empresa_id = $1', [empresaId]),
    pool.query('SELECT id, nome_conexao, email, ativo FROM integracoes_email WHERE empresa_id = $1', [empresaId]),
    pool.query(
      `SELECT t.id, t.nome, t.descricao, t.assunto, t.corpo, t.enviar_boleto, t.clusters, t.atualizado_em,
              (SELECT COUNT(*)::int FROM regua_cobranca_etapas e WHERE e.template_id = t.id) AS etapas_usando
         FROM comunicacao_templates t WHERE t.empresa_id = $1 ORDER BY t.nome`,
      [empresaId]
    ),
  ]);
  const nomeZapi = (id) => {
    const z1 = zapi.find((x) => x.id === id);
    return z1 ? `${z1.nome_conexao}${z1.ativo ? '' : ' (INATIVA)'}` : null;
  };
  const nomeEmail = (id) => {
    const e = email.find((x) => x.id === id);
    return e ? `${e.nome_conexao} <${e.email}>${e.ativo ? '' : ' (INATIVA)'}` : null;
  };
  return {
    tipo,
    tipo_nome: TIPO_COMUNICACAO[tipo],
    por_cluster: parametros.map((p) => ({
      cluster: p.cluster,
      nome: CLUSTER_NOME[p.cluster],
      horario: p.horario,
      conexao_whatsapp: nomeZapi(p.zapi_integracao_id) || 'nenhuma escolhida',
      conexao_email: nomeEmail(p.email_integracao_id) || 'nenhuma escolhida',
    })),
    templates: templates.map((t) => ({
      id: t.id,
      nome: t.nome,
      descricao: t.descricao || null,
      clusters: (t.clusters || []).map((c) => CLUSTER_NOME[c] || c),
      assunto: t.assunto || null,
      corpo: t.corpo,
      manda_boleto: t.enviar_boleto,
      etapas_usando: t.etapas_usando,
      alterado_em: horaLocal(t.atualizado_em),
    })),
  };
}

async function tiposPagamento(empresaId) {
  const { tipos, selecionados } = await reguaService.getTiposPagamento(empresaId);
  const sel = new Set(selecionados);
  const { rows: quem } = await pool.query(
    `SELECT tp.descricao, tp.criado_em, u.nome FROM regua_cobranca_tipos_pagamento tp LEFT JOIN usuarios u ON u.id = tp.criado_por WHERE tp.empresa_id = $1`,
    [empresaId]
  );
  return {
    entram_na_cobranca: tipos
      .filter((t) => sel.has(t.descricao))
      .map((t) => ({ tipo: t.descricao, parcelas: t.parcelas, em_aberto: t.abertas, incluido_em: quando(quem.find((q) => q.descricao === t.descricao)?.criado_em), por: quem.find((q) => q.descricao === t.descricao)?.nome || null })),
    ficam_fora: tipos.filter((t) => !sel.has(t.descricao)).map((t) => ({ tipo: t.descricao, parcelas: t.parcelas, em_aberto: t.abertas })),
  };
}

async function distribuicaoConfig(empresaId) {
  const painel = await distribuicao.getPainel(empresaId);
  return {
    modo: painel.config.modo === 'automatica' ? 'Distribuição automática' : 'Responsável por etapa',
    dias_liberacao_carteira: painel.config.dias_liberacao,
    atendentes: painel.participantes.map((p) => ({
      id: p.usuario_id,
      nome: p.nome,
      entrou_em: p.entrou_em,
      pausado_ate: p.pausado_ate,
      herdou_placar_de: p.herdado_de_nome,
      clientes_na_carteira: p.carteira,
    })),
    podem_entrar: painel.elegiveis.map((e) => e.nome),
    clientes_na_carteira_de_quem_saiu: painel.carteira_sem_atendente,
    agendamento_no_monitor: painel.agendamento
      ? { ativo: painel.agendamento.ativo, frequencia: painel.agendamento.frequencia, horario: painel.agendamento.horario, proxima: quando(painel.agendamento.proxima_execucao) }
      : 'não agendada',
  };
}

async function lerConfiguracao(empresaId, secoes = ['motor_risco', 'regua', 'comunicacao', 'tipos_pagamento', 'distribuicao', 'monitor']) {
  const quer = new Set(secoes);
  const [empresa, mr, rg, com, tp, dist, mon, limite] = await Promise.all([
    nomeEmpresa(empresaId),
    quer.has('motor_risco') ? motorRisco(empresaId) : null,
    quer.has('regua') ? regua(empresaId) : null,
    quer.has('comunicacao') ? comunicacao(empresaId) : null,
    quer.has('tipos_pagamento') ? tiposPagamento(empresaId) : null,
    quer.has('distribuicao') ? distribuicaoConfig(empresaId) : null,
    quer.has('monitor') ? situacaoRotinas(empresaId) : null,
    reguaService.getLimiteVigente(empresaId).catch(() => null),
  ]);
  const r = { empresa, limite_inadimplencia_dias: limite };
  if (quer.has('motor_risco')) r.motor_risco = mr || 'Nenhuma versão do Motor de Risco publicada — sem ela a régua, a Rotina e os clusters não funcionam.';
  if (rg) r.regua = rg;
  if (com) r.comunicacao = com;
  if (tp) r.tipos_pagamento = tp;
  if (dist) r.distribuicao = dist;
  if (mon) r.monitor = mon;
  return r;
}

const SECOES = ['motor_risco', 'regua', 'comunicacao', 'tipos_pagamento', 'distribuicao', 'monitor'];

const configuracaoTool = {
  name: 'cobranca_configuracao',
  description:
    'Como a Gestão de Cobranças DESTA empresa está configurada agora, com o detalhe completo: Motor de Risco (versão vigente com todos os ' +
    'parâmetros e os 5 indicadores com nota 0/nota 100/peso, versões anteriores e o que mudou de uma para outra, quem salvou), Régua de ' +
    'Cobrança (etapas de cada cluster: dia D±N, canais, template, responsável da etapa, ativa/na Rotina), Comunicação (tipo de comunicação, ' +
    'horário e conexões de WhatsApp/e-mail por cluster, templates com o texto), Tipos de Pagamento que entram e que ficam fora (com quantas ' +
    'parcelas), Distribuição da Rotina (modo, atendentes, pausas, carteiras, agendamento) e as rotinas do Monitor de Integrações (agendamento, ' +
    'último sucesso, erro). Use `secoes` para pedir só uma parte.',
  inputSchema: {
    secoes: z.array(z.enum(SECOES)).optional().describe(`Partes a trazer (padrão: todas): ${SECOES.join(', ')}.`),
  },
  handler: ferramenta(async (empresaId, { secoes }) => lerConfiguracao(empresaId, secoes && secoes.length ? secoes : SECOES)),
};

module.exports = { configuracaoTool, lerConfiguracao, TIPO_COMUNICACAO, INDICADOR_NOME, PARAMETRO_NOME };
