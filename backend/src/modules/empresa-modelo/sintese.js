const A = require('./anonimizador');
const C = require('./config');
const { inserirLote } = require('./banco');
const { inserir } = require('./operacional');

// ---------------------------------------------------------------------------------------
// Módulos que a empresa de origem não usa e que a empresa modelo precisa mostrar: Saldo das
// Contas (histórico diário), Gestão de Cobranças (motor de risco, régua, templates,
// registros), Repasses CEF (reservas do Construtor de Vendas, vínculos, microetapas), EPR e o
// Plano de Voo da Home. Tudo montado a partir dos próprios dados (já anonimizados) da
// empresa modelo — nada de outra empresa, exceto os VALORES de saldo das contas Itaú, que são
// os reais das contas espelhadas (decisão do usuário, 05/11/2026).
// ---------------------------------------------------------------------------------------

const iso = (d) => d.toISOString().slice(0, 10);
const somarDias = (dataIso, n) => {
  const d = new Date(`${dataIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
function hojeSP() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
function diasUteis(ate, quantidade) {
  const lista = [];
  let d = ate;
  while (lista.length < quantidade) {
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) lista.push(d);
    d = somarDias(d, -1);
  }
  return lista.reverse();
}
function rnd(semente) {
  const h = A.hash(`rnd:${semente}`);
  return h.readUInt32BE(0) / 0xffffffff;
}
const arred = (v) => Math.round(v * 100) / 100;

// ─── Saldo das Contas Bancárias ─────────────────────────────────────────────────────────

async function sintetizarSaldos(ctx) {
  ctx.log('Saldo das contas bancárias (histórico diário)');
  const { client, modelo: m } = ctx;
  const ontem = somarDias(hojeSP(), -1);
  const dias = diasUteis(ontem, 45);
  const inicio = dias[0];

  const { rows: contas } = await client.query(
    `SELECT numero_conta, company_id, nome, tipo_convenio, conta_enriquecida, digito, agencia_enriquecida,
            codigo_cedente_extrato, codigo_cedente_cobranca, classificacao_id, projeta_dfc
     FROM contas_bancarias_sienge WHERE empresa_id = $1 AND projeta_saldo AND classificacao_id IS NOT NULL`,
    [m]
  );
  // Saldo pelo extrato do Sienge (contas da construtora): saldo acumulado até cada dia.
  const { rows: mov } = await client.query(
    // mesmo sinal do DFC (dfc-saldos): saída do Sienge vem positiva com type 'Expense'
    `SELECT company_id, numero_conta, date::text AS data,
            SUM(CASE WHEN lower(type) IN ('expense', 'despesa', 'saida', 'saída', 'debit', 'debito', 'débito') THEN -ABS(value)
                     WHEN lower(type) IN ('income', 'receita', 'entrada', 'credit', 'credito', 'crédito') THEN ABS(value)
                     ELSE COALESCE(value, 0) END)::float AS valor
     FROM sie_extrato_contas WHERE empresa_id = $1 GROUP BY 1, 2, 3 ORDER BY 3`,
    [m]
  );
  const porConta = new Map();
  for (const r of mov) {
    const k = `${r.company_id}|${r.numero_conta}`;
    if (!porConta.has(k)) porConta.set(k, []);
    porConta.get(k).push(r);
  }
  const saldoAte = (k, data) => {
    let s = 0;
    for (const r of porConta.get(k) || []) {
      if (r.data > data) break;
      s += r.valor;
    }
    return arred(s);
  };

  // Itaú: valores reais das contas espelhadas, pelos saldos já gravados na empresa de origem.
  const valoresItau = new Map(); // `${company}|${conta}|${data}` → {saldo, origem}
  for (const it of ctx.itau || []) {
    const { rows } = await client.query(
      `SELECT s.data::text AS data, s.saldo::float AS saldo, s.origem
       FROM conexoes_itau o
       JOIN contas_bancarias_sienge cb ON cb.empresa_id = o.empresa_id
        AND LTRIM(cb.agencia_enriquecida, '0') = LTRIM(o.agencia, '0') AND LTRIM(cb.conta_enriquecida, '0') = LTRIM(o.conta, '0') AND cb.digito = o.dac
       JOIN saldos_contas_bancarias s ON s.empresa_id = cb.empresa_id AND s.company_id = cb.company_id AND s.numero_conta = cb.numero_conta
       WHERE o.id = $1 AND s.data >= $2`,
      [it.origem, inicio]
    );
    for (const r of rows) valoresItau.set(`${it.companyId}|${it.numeroConta}|${r.data}`, r);
  }
  const conexaoPorConta = new Map((ctx.itau || []).map((i) => [`${i.companyId}|${i.numeroConta}`, i]));

  // Clientes com parcelas para compor a cobrança do dia (VanPix).
  const { rows: pagadores } = await client.query(
    `SELECT DISTINCT ON (client_id) client_id, client_name, company_id, original_amount::float AS valor
     FROM sie_income WHERE empresa_id = $1 AND original_amount BETWEEN 300 AND 15000 ORDER BY client_id, due_date DESC`,
    [m]
  );

  const linhas = [];
  for (const c of contas) {
    const k = `${c.company_id}|${c.numero_conta}`;
    let anterior = null;
    const temExtrato = porConta.has(k);
    const base = temExtrato ? null : 20000 + rnd(`base:${k}`) * 380000;
    for (const [i, data] of dias.entries()) {
      let saldo;
      let origem = 'MANUAL';
      let fonte = null;
      let composicao = null;
      let saldoCobranca = null;
      const conta = `${c.conta_enriquecida || c.numero_conta}${c.digito ? `-${c.digito}` : ''}`;
      if (c.tipo_convenio === 'ITAU') {
        const v = valoresItau.get(`${k}|${data}`);
        const conexao = conexaoPorConta.get(k);
        if (v) {
          saldo = arred(v.saldo);
          origem = v.origem === 'HERDADO' ? 'HERDADO' : 'API';
          fonte = origem === 'API' ? 'ITAU' : null;
          composicao = origem === 'API' ? { extrato: { conta: `${c.agencia_enriquecida} / ${conta}`, fonte: 'ITAU', valor: saldo, conexao: conexao?.nome, posicao: `${data}T06:05:00-03:00` } } : null;
        } else if (anterior !== null) {
          saldo = anterior;
          origem = 'HERDADO';
        } else continue;
      } else {
        saldo = temExtrato ? saldoAte(k, data) : arred(base * (0.85 + 0.3 * rnd(`${k}:${data}`)));
        if (c.tipo_convenio === 'VANPIX') {
          const dataFech = i > 0 ? dias[i - 1] : somarDias(data, -1);
          const titulos = [];
          const n = Math.floor(rnd(`ncob:${k}:${data}`) * 4);
          for (let t = 0; t < n; t += 1) {
            const p = pagadores[Math.floor(rnd(`pag:${k}:${data}:${t}`) * pagadores.length)];
            if (!p) break;
            titulos.push({
              banco: ['104', '341', '237', '001', '033'][t % 5],
              canal: '04',
              juros: 0,
              pagador: p.client_name,
              documento: String(60000 + Math.floor(rnd(`doc:${k}:${data}:${t}`) * 9000)),
              valorPago: arred(p.valor),
              dataCredito: data,
              nossoNumero: `14000000000${String(Math.floor(rnd(`nn:${k}:${data}:${t}`) * 999999)).padStart(6, '0')}`,
              valorTitulo: arred(p.valor),
              dataOcorrencia: dataFech,
            });
          }
          saldoCobranca = arred(titulos.reduce((s, t) => s + t.valorPago, 0));
          origem = 'API';
          fonte = 'VANPIX';
          composicao = {
            extrato: { conta, fonte: 'VANPIX', valor: saldo, apelido: c.codigo_cedente_extrato, dataFechamento: dataFech },
            ...(titulos.length ? { cobranca: { de: data, ate: data, valor: saldoCobranca, apelido: c.codigo_cedente_cobranca, titulos } } : {}),
          };
          saldo = arred(saldo + saldoCobranca);
        } else if (c.tipo_convenio === 'CNAB_MANUAL') {
          origem = 'API';
          fonte = 'CNAB';
          composicao = { extrato: { conta, fonte: 'CNAB', valor: saldo } };
        } else if (anterior !== null && rnd(`herda:${k}:${data}`) < 0.3) {
          saldo = anterior;
          origem = 'HERDADO';
        }
      }
      anterior = saldo;
      linhas.push({
        empresa_id: m,
        company_id: c.company_id,
        numero_conta: c.numero_conta,
        data,
        saldo,
        origem,
        fonte,
        saldo_cobranca: saldoCobranca,
        composicao,
        atualizado_por: ctx.equipe[4],
      });
    }
  }
  await inserirLote(client, ctx.meta, 'saldos_contas_bancarias', linhas);
  ctx.log(`  saldos_contas_bancarias: ${linhas.length} (${contas.length} contas × ${dias.length} dias úteis)`);

  // Períodos (dias) encerrados + quem encerrou a rotina.
  const periodos = dias.map((data) => ({
    empresa_id: m,
    data,
    status: 'ENCERRADO',
    aberto_por: ctx.equipe[4],
    aberto_em: `${data}T09:10:00-03:00`,
    encerrado_por: ctx.equipe[0],
    encerrado_em: `${data}T10:40:00-03:00`,
  }));
  await inserirLote(client, ctx.meta, 'saldos_periodos', periodos);
  const { rows: per } = await client.query('SELECT id, data::text AS data FROM saldos_periodos WHERE empresa_id = $1', [m]);
  await inserirLote(
    client,
    ctx.meta,
    'saldos_rotinas_encerramentos',
    per.flatMap((p) => [ctx.equipe[4], ctx.equipe[1]].map((u, j) => ({ periodo_id: p.id, usuario_id: u, encerrado_em: `${p.data}T10:${j ? '25' : '05'}:00-03:00` })))
  );

  // Bloqueios (contas garantidas/bloqueadas) e configurações da tela.
  const garantidas = contas.filter((c) => [ctx.classificacoes.garantida, ctx.classificacoes.bloqueada].includes(c.classificacao_id));
  const bloqueios = [];
  for (const c of garantidas.slice(0, 4)) {
    for (const data of dias.slice(-10)) bloqueios.push({ empresa_id: m, company_id: c.company_id, numero_conta: c.numero_conta, data, valor: arred(15000 + rnd(`bl:${c.numero_conta}`) * 85000), registrado_por: ctx.equipe[4] });
  }
  await inserirLote(client, ctx.meta, 'saldos_bloqueios', bloqueios);
  await inserir(ctx, 'saldos_rotinas_config', { empresa_id: m, gerar_rotinas: true, dividir_por: 'BANCO', atualizado_por: ctx.equipe[0] }, null);
  await inserir(ctx, 'saldos_rotinas_responsaveis', { empresa_id: m, tipo: 'BANCO', chave: '104', usuario_id: ctx.equipe[4] }, null);
  await inserir(ctx, 'saldos_rotinas_responsaveis', { empresa_id: m, tipo: 'BANCO', chave: '341', usuario_id: ctx.equipe[1] }, null);
  await inserir(ctx, 'saldos_comunicar_config', { empresa_id: m, zapi_integracao_id: ctx.integ.zapi }, null);
  for (const u of [ctx.equipe[0], ctx.equipe[1]]) await inserir(ctx, 'saldos_comunicar_usuarios', { empresa_id: m, usuario_id: u }, null);
}

// ─── Gestão de Cobranças ───────────────────────────────────────────────────────────────

const TEMPLATES = [
  ['D-3', 'Lembrete gentil', true, 'Olá, @nome_cliente! Tudo bem?\n\nPassando para lembrar que a parcela do seu imóvel no *@centro_custo* vence em *@vencimento*, daqui a 3 dias.\n\nValor: @valor\n\nSe já programou o pagamento, desconsidere esta mensagem. Qualquer dúvida, estamos à disposição.\n\nEquipe de Relacionamento HZN Construtora'],
  ['D+1', 'Cordial – pode ter sido esquecimento', true, 'Olá, @nome_cliente! Tudo bem?\n\nIdentificamos que a parcela com vencimento em *@vencimento*, no valor de @valor, ainda consta em aberto.\n\nPode ter sido apenas um esquecimento — segue o boleto atualizado para facilitar.\n\nEquipe de Relacionamento HZN Construtora'],
  ['D+5', 'Firme – alerta de encargos', true, 'Olá, @nome_cliente.\n\nA parcela vencida em *@vencimento* continua em aberto e já está com *5 dias de atraso*.\n\nLembramos que, conforme o contrato, incidem multa e juros sobre o valor. Regularize hoje e evite encargos maiores.\n\nEquipe de Cobrança HZN Construtora'],
  ['D+16', 'Firme – cobra posicionamento com prazo', true, 'Olá, @nome_cliente.\n\nAté o momento não identificamos o pagamento da parcela vencida em *@vencimento* e não recebemos retorno às nossas mensagens.\n\nPedimos um posicionamento em até 48 horas para evitarmos as próximas etapas de cobrança.\n\nEquipe de Cobrança HZN Construtora'],
  ['D+30', 'Duro – aviso de negativação + proposta', true, '*AVISO DE DÉBITO EM ATRASO – 30 DIAS*\n\nSr.(a) @nome_cliente,\n\nSeu contrato referente à unidade do *@centro_custo* está com *30 dias de atraso*, com valor atualizado de @valor.\n\nTemos condições especiais de negociação válidas por 5 dias. Após esse prazo, o débito poderá ser encaminhado aos órgãos de proteção ao crédito.\n\nDepartamento de Cobrança HZN Construtora'],
];
const ETAPAS_REGUA = {
  novo: [['D-3', -3, true, true, true], ['D+1', 1], ['D+5', 5]],
  bom: [['D-3', -3], ['D+1', 1], ['D+5', 5]],
  duvidoso: [['D-3', -3], ['D+1', 1], ['D+5', 5], ['D+16', 16]],
  mau: [['D-3', -3], ['D+1', 1], ['D+5', 5], ['D+16', 16], ['D+30', 30]],
  inad: [['D+16', 16], ['D+30', 30], ['D+45', 45], ['D+60', 60], ['D+90', 90]],
};
const DESCRICOES_CONTATO = [
  'Cliente informou que vai pagar até sexta-feira.',
  'Mensagem entregue e visualizada; sem resposta até o momento.',
  'Cliente pediu a segunda via do boleto — enviada por WhatsApp.',
  'Ligação não atendida; deixado recado na caixa postal.',
  'Cliente solicitou proposta de parcelamento do atraso.',
  'Pagamento agendado pelo cliente para o próximo dia útil.',
  'Cliente alegou que já pagou; solicitado comprovante.',
  'Contato com o cônjuge, que ficou de repassar o aviso.',
  'Acordo de pagamento em duas vezes registrado.',
  'Cliente em viagem; retorno combinado para a próxima semana.',
];

async function sintetizarCobranca(ctx) {
  ctx.log('Gestão de Cobranças (motor de risco, régua e registros)');
  const { client, modelo: m, equipe } = ctx;
  const versao = (
    await inserir(ctx, 'motor_risco_versoes', {
      empresa_id: m,
      versao: 1,
      tolerancia_dias: 3,
      janela_observacao_meses: 24,
      gatilho_reincidencia_dias: 10,
      minimo_parcelas: 3,
      dia_recalculo: 1,
      trava_subida_parcelas: 6,
      dias_vencidos_regua_cobranca: 15,
      corte_bom_pagador: 75,
      corte_pagador_duvidoso: 45,
      criado_por_usuario_id: equipe[0],
    })
  ).id;
  for (const [indicador, n0, n100, peso] of [['pct_em_dia', 50, 100, 30], ['atraso_medio', 30, 0, 25], ['maior_atraso', 90, 0, 15], ['reincidencia', 5, 0, 20], ['relacionamento', 0, 60, 10]]) {
    await inserir(ctx, 'motor_risco_indicadores', { versao_id: versao, indicador, nota_0: n0, nota_100: n100, peso }, null);
  }
  const template = {};
  for (const [nome, descricao, boleto, corpo] of TEMPLATES) {
    template[nome] = (await inserir(ctx, 'comunicacao_templates', { empresa_id: m, nome, descricao, assunto: `HZN Construtora — ${descricao}`, corpo, enviar_boleto: boleto, clusters: ['novo', 'bom', 'duvidoso', 'mau', 'inad'] })).id;
  }
  for (const [cluster, etapas] of Object.entries(ETAPAS_REGUA)) {
    for (const [nome, dias, wpp = true, email = false, lig = false] of etapas) {
      await inserir(ctx, 'regua_cobranca_etapas', {
        empresa_id: m,
        cluster,
        nome,
        dias,
        canal_whatsapp: wpp,
        canal_email: email || cluster === 'inad',
        canal_ligacao: lig || dias >= 16,
        template_id: template[nome] || template['D+30'],
        responsavel_usuario_id: dias >= 16 ? equipe[5] : equipe[2],
        ativa: true,
        rotina_habilitada: true,
      }, null);
    }
    await inserir(ctx, 'regua_cobranca_horario_disparo', { empresa_id: m, cluster, horario: '09:00', zapi_integracao_id: ctx.integ.zapi, email_integracao_id: ctx.integ.email }, null);
  }
  // Tipos de pagamento cobrados pela régua = condições de pagamento do Sienge da própria empresa
  // (o financiamento bancário não é cobrado do cliente).
  const { rows: tipos } = await client.query(
    `SELECT DISTINCT TRIM(payment_term_description) AS d FROM sie_income
     WHERE empresa_id = $1 AND payment_term_description IS NOT NULL AND payment_term_description !~* 'financiamento|cef'`,
    [m]
  );
  for (const { d } of tipos) {
    await inserir(ctx, 'regua_cobranca_tipos_pagamento', { empresa_id: m, descricao: d, criado_por: equipe[2] }, null);
  }
  // 'visualizar': a tela monta a mensagem, ninguém recebe nada (e o envio da empresa modelo é simulado).
  await inserir(ctx, 'regua_cobranca_comunicacao_automatica', { empresa_id: m, ativa: false, tipo: 'visualizar' }, null);
  await inserir(ctx, 'regua_cobranca_distribuicao_config', { empresa_id: m, modo: 'automatica', dias_liberacao: 7, atualizado_por: equipe[2] }, null);
  for (const u of [equipe[2], equipe[5], equipe[4]]) {
    await inserir(ctx, 'regua_cobranca_distribuicao_participantes', { empresa_id: m, usuario_id: u, entrou_em: somarDias(hojeSP(), -60) }, null);
  }

  // Registros de contato dos últimos 60 dias nas parcelas vencidas.
  const { rows: vencidas } = await client.query(
    `SELECT bill_id, installment_id, due_date::text AS venc FROM sie_income
     WHERE empresa_id = $1 AND corrected_balance_amount > 0 AND due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 120
     ORDER BY due_date DESC LIMIT 400`,
    [m]
  );
  const registros = [];
  for (const [i, v] of vencidas.entries()) {
    const n = 1 + Math.floor(rnd(`nreg:${v.bill_id}:${v.installment_id}`) * 3);
    for (let j = 0; j < n; j += 1) {
      const dias = 1 + Math.floor(rnd(`dreg:${i}:${j}`) * 50);
      const data = somarDias(v.venc, dias) > somarDias(hojeSP(), -1) ? somarDias(hojeSP(), -1 - j) : somarDias(v.venc, dias);
      const canal = ['whatsapp', 'ligacao', 'whatsapp', 'email', null][Math.floor(rnd(`creg:${i}:${j}`) * 5)];
      registros.push({
        empresa_id: m,
        bill_id: v.bill_id,
        installment_id: v.installment_id,
        tipo: canal === 'whatsapp' && j === 0 ? 'automatico' : 'manual',
        usuario_id: [equipe[2], equipe[5], equipe[4]][(i + j) % 3],
        canal,
        descricao: DESCRICOES_CONTATO[Math.floor(rnd(`txt:${i}:${j}`) * DESCRICOES_CONTATO.length)],
        data_registro: data,
        criado_em: `${data}T${String(9 + ((i + j) % 8)).padStart(2, '0')}:${String((i * 7 + j * 13) % 60).padStart(2, '0')}:00-03:00`,
      });
    }
  }
  await inserirLote(client, ctx.meta, 'regua_cobranca_historico_registros', registros);
  ctx.log(`  regua_cobranca_historico_registros: ${registros.length}`);
}

// ─── Repasses CEF (Construtor de Vendas + Sienge + Caixa) e EPR ─────────────────────────

const MICROETAPAS = {
  VENDA: [['Análise Gerencial', 1], ['Ajuste de Proposta', 1], ['Plano Aprovado', 1], ['Contrato de Compra e Venda Gerado', 2], ['Contrato Enviado Para Assinatura', 1], ['Envio Sienge', 1]],
  CONTRATO: [['Vendido', 5], ['Preparando dossiê', 7], ['Conforme/Pendente', 5], ['Aguardando minuta CEF', 10], ['Minuta CEF Emitida', 30], ['Aguardando Assinatura do contrato CEF', 10], ['Pendente de assinatura no contrato HZN', 5], ['Distrato', null]],
  ASSINATURA: [['Contrato CEF Assinado', 1], ['Aguardando Solicitação de ITBI', 2], ['Aguardando Guia de ITBI', 10], ['Aguardando Pagamento de ITBI', 5], ['Aguardando Certidão de ITBI', 7], ['Aguardando Entrada no Cartório', 2], ['Entrada no Cartório', 2], ['Prenotação', 10], ['Cartório Exigência', 15], ['Cartório Exigência Cumprida', 10], ['Aguardando Registro', 10], ['Registrado', 5]],
  REGISTRO: [['Finalizado Repassado', null]],
};

async function sintetizarRepasses(ctx) {
  ctx.log('Repasses CEF (reservas, contratos, microetapas) e EPR');
  const { client, modelo: m, equipe } = ctx;
  // Máscara de microetapas (aba Máscaras do Repasses).
  const micro = {};
  for (const [grupo, itens] of Object.entries(MICROETAPAS)) {
    micro[grupo] = [];
    for (const [i, [descricao, sla]] of itens.entries()) {
      const id = (await inserir(ctx, 'mascara_itens', { empresa_id: m, tipo: 'REPASSES', grupo, sequencia: i + 1, descricao, sla_dias: sla })).id;
      micro[grupo].push({ id, descricao });
    }
  }
  for (const [macro, sla] of [['VENDA', 5], ['CONTRATO', 30], ['ASSINATURA', 45]]) {
    await inserir(ctx, 'repasses_cef_sla_macro', { empresa_id: m, macro_etapa: macro, sla_dias: sla }, null);
  }
  await inserir(ctx, 'repasses_cef_filtros_reserva', { empresa_id: m, tipovenda: ['Financiada'], situacao: ['Analise Gerencial', 'Ajustes da proposta', 'Plano Aprovado', 'Contrato de Compra e Venda Gerado', 'Envio Sienge', 'Vendida'] }, null);
  for (const [campo, valor, cor] of [['tipovenda', '', '#3b82f6'], ['tipovenda', 'Direta ou à Vista', '#10b981'], ['tipovenda', 'Financiada', '#f59e0b'], ['situacao', 'Analise Gerencial', '#3b82f6'], ['situacao', 'Ajustes da proposta', '#6366f1'], ['situacao', 'Plano Aprovado', '#0ea5e9'], ['situacao', 'Contrato de Compra e Venda Gerado', '#14b8a6'], ['situacao', 'Envio Sienge', '#8b5cf6'], ['situacao', 'Vendida', '#16a34a'], ['situacao', 'Cancelada', '#9ca3af'], ['situacao', 'Distrato', '#ef4444']]) {
    await inserir(ctx, 'repasses_cef_cores_reserva', { empresa_id: m, campo, valor, cor }, null);
  }
  await inserir(ctx, 'repasses_cef_comunicar_config', { empresa_id: m, zapi_integracao_id: ctx.integ.zapi, dia_semana: 1, horario: '08:00' }, null);
  for (const u of [equipe[0], equipe[3]]) await inserir(ctx, 'repasses_cef_comunicar_usuarios', { empresa_id: m, usuario_id: u }, null);

  // Obras já lançadas ganham código do Construtor de Vendas.
  const { rows: lancadas } = await client.query(
    `SELECT DISTINCT c.sienge_id, c.name, c.codigo_contrato_caixa FROM centros_custo_sienge c
     JOIN centro_custo_etapas_historico h ON h.empresa_id = c.empresa_id AND h.sienge_id = c.sienge_id AND h.data_inicio <= CURRENT_DATE
     JOIN mascara_itens mi ON mi.id = h.mascara_item_id AND mi.descricao = 'Lançamento'
     WHERE c.empresa_id = $1`,
    [m]
  );
  for (const c of lancadas) {
    await client.query('UPDATE centros_custo_sienge SET codigo_construtor_vendas = $3 WHERE empresa_id = $1 AND sienge_id = $2', [m, c.sienge_id, `HZN${String(c.sienge_id).padStart(3, '0')}`]);
  }
  const codigoCv = new Map(lancadas.map((c) => [Number(c.sienge_id), `HZN${String(c.sienge_id).padStart(3, '0')}`]));
  const nomeObra = new Map(lancadas.map((c) => [Number(c.sienge_id), c.name]));

  // Unidades do extrato Caixa ↔ contratos pelo titular (nomes fictícios coerentes entre os dois).
  const { rows: unidadesCaixa } = await client.query(
    `SELECT id, contrato_empreendimento, numero_contrato_unidade, nome_mutuario, data_assinatura_contrato::text AS assinatura,
            data_inclusao_dados_registro_cri::text AS registro
     FROM extrato_unidades WHERE empresa_id = $1`,
    [m]
  );
  const { rows: contratos } = await client.query(
    `SELECT c.sienge_contract_id, c.enterprise_id, c.value::float AS valor, c.contract_date::date::text AS data, c.issue_date::date::text AS emissao,
            c.financial_institution_number AS fin, c.situation,
            (SELECT name FROM sie_sales_contracts_customers cc WHERE cc.empresa_id = c.empresa_id AND cc.sienge_contract_id = c.sienge_contract_id ORDER BY main DESC NULLS LAST, id LIMIT 1) AS cliente,
            (SELECT customer_id FROM sie_sales_contracts_customers cc WHERE cc.empresa_id = c.empresa_id AND cc.sienge_contract_id = c.sienge_contract_id ORDER BY main DESC NULLS LAST, id LIMIT 1) AS cliente_id,
            (SELECT name FROM sie_sales_contracts_units u WHERE u.empresa_id = c.empresa_id AND u.sienge_contract_id = c.sienge_contract_id ORDER BY main DESC NULLS LAST LIMIT 1) AS unidade
     FROM sie_sales_contracts c WHERE c.empresa_id = $1 AND c.enterprise_id = ANY($2::bigint[])`,
    [m, lancadas.map((c) => c.sienge_id)]
  );
  // Na origem os números do contrato na Caixa não casam entre o contrato do Sienge e a unidade
  // do extrato; na empresa modelo a unidade é ligada ao contrato do mesmo titular (o mesmo CPF
  // gera o mesmo nome fictício nas duas bases), na mesma obra — e o resto fica sem número.
  const obraDoContratoCaixa = new Map(lancadas.filter((c) => c.codigo_contrato_caixa).map((c) => [c.codigo_contrato_caixa, Number(c.sienge_id)]));
  const unidadePorTitular = new Map();
  for (const u of unidadesCaixa) {
    const obra = obraDoContratoCaixa.get(u.contrato_empreendimento);
    if (obra) unidadePorTitular.set(`${obra}|${A.normalizar(u.nome_mutuario)}`, u);
  }
  for (const c of contratos) {
    const u = unidadePorTitular.get(`${Number(c.enterprise_id)}|${A.normalizar(c.cliente)}`);
    const fin = u && c.situation !== 'Cancelado' ? u.numero_contrato_unidade : null;
    if (u && fin) unidadePorTitular.delete(`${Number(c.enterprise_id)}|${A.normalizar(c.cliente)}`);
    if (fin !== c.fin) {
      await client.query('UPDATE sie_sales_contracts SET financial_institution_number = $3 WHERE empresa_id = $1 AND sienge_contract_id = $2', [m, c.sienge_contract_id, fin]);
      c.fin = fin;
    }
  }
  const unidadePorFin = new Map(unidadesCaixa.map((u) => [u.numero_contrato_unidade, u]));
  const recente = somarDias(hojeSP(), -150);

  // Reserva de origem de cada contrato (Construtor de Vendas) + vínculo manual.
  const { rows: docs } = await client.query(`SELECT id, cpf, cnpj, email FROM sie_customers WHERE empresa_id = $1`, [m]);
  const docCliente = new Map(docs.map((d) => [String(d.id), d]));
  const corretores = ['IMOBILIÁRIA HORIZONTE PRIME', 'VISTA NOVA NEGÓCIOS IMOBILIÁRIOS', 'HZN VENDAS (EQUIPE PRÓPRIA)', 'PORTAL SUL IMÓVEIS'];
  const reservas = [];
  const vinculos = [];
  const historico = [];
  let idreserva = 70000;
  const hoje = hojeSP();
  for (const c of contratos) {
    idreserva += 1;
    const financiada = Boolean(c.fin) || ((c.emissao || c.data) >= recente && rnd(`fin:${c.sienge_contract_id}`) < 0.7);
    const dCad = somarDias(c.data, -(3 + Math.floor(rnd(`cad:${c.sienge_contract_id}`) * 20)));
    const doc = docCliente.get(String(c.cliente_id)) || {};
    reservas.push({
      empresa_id: m,
      idreserva,
      referencia: `R${idreserva}`,
      referencia_data: `${dCad}T10:00:00-03:00`,
      ativo: 'S',
      data_cad: `${dCad}T10:00:00-03:00`,
      codigointerno: `HZN-R${idreserva}`,
      numero_venda: String(idreserva),
      aprovada: 'S',
      data_venda: `${c.data}T15:00:00-03:00`,
      situacao: c.situation === 'Cancelado' ? 'Distrato' : 'Vendida',
      situacao_comercial: 'Vendida',
      idempreendimento: Number(c.enterprise_id),
      codigointerno_empreendimento: codigoCv.get(Number(c.enterprise_id)),
      empreendimento: nomeObra.get(Number(c.enterprise_id)),
      unidade: c.unidade,
      bloco: 'ÚNICO',
      etapa: 'ETAPA 1',
      venda: 'S',
      idcliente: Number(c.cliente_id) || null,
      documento_cliente: doc.cpf || doc.cnpj || null,
      cliente: c.cliente,
      email: doc.email || null,
      cidade: 'Volta Redonda',
      corretor: A.nomePessoa(`corretor:${idreserva % 7}`, idreserva % 2 ? 'F' : 'M'),
      imobiliaria: corretores[idreserva % corretores.length],
      valor_contrato: c.valor,
      valor_financiamento: financiada ? arred(c.valor * 0.72) : null,
      valor_fgts: financiada ? arred(c.valor * 0.05) : null,
      tipovenda: financiada ? 'Financiada' : 'Direta ou à Vista',
      tipo_reserva: 'Padrão',
      data_contrato: `${c.data}T15:00:00-03:00`,
      nome_usuario: 'Patrícia Moura',
    });
    vinculos.push({ empresa_id: m, idreserva, sienge_contract_id: c.sienge_contract_id, usuario_id: equipe[3] });

    // microetapas: Contrato (financiadas sem unidade Caixa) ou Assinatura (com unidade, sem registro)
    if (!financiada || c.situation === 'Cancelado') continue;
    const unidade = c.fin ? unidadePorFin.get(c.fin) : null;
    if (unidade?.registro) {
      // já registrada no cartório: a última movimentação é a do Registro
      historico.push({ empresa_id: m, idreserva, centro_custo_sienge_id: Number(c.enterprise_id), macro_etapa: 'REGISTRO', mascara_item_id: micro.REGISTRO[0].id, data_movimentacao: unidade.registro, descricao: 'Matrícula registrada e repasse concluído.', usuario_id: equipe[3] });
      continue;
    }
    const base = c.emissao || c.data;
    const passos = unidade ? micro.ASSINATURA : micro.CONTRATO.filter((x) => x.descricao !== 'Distrato');
    const qtd = 1 + Math.floor(rnd(`qtd:${c.sienge_contract_id}`) * (unidade ? 6 : 5));
    let d = unidade?.assinatura || base;
    for (let p = 0; p < qtd && p < passos.length; p += 1) {
      d = somarDias(d, 2 + Math.floor(rnd(`dpasso:${c.sienge_contract_id}:${p}`) * 12));
      if (d > hoje) break;
      historico.push({
        empresa_id: m,
        idreserva,
        centro_custo_sienge_id: Number(c.enterprise_id),
        macro_etapa: unidade ? 'ASSINATURA' : 'CONTRATO',
        mascara_item_id: passos[p].id,
        data_movimentacao: d,
        descricao: p === 0 ? 'Documentação recebida e conferida.' : null,
        usuario_id: equipe[3],
      });
    }
  }

  // Funil comercial: reservas recentes ainda sem contrato (bucket Reserva).
  const situacoes = ['Analise Gerencial', 'Ajustes da proposta', 'Plano Aprovado', 'Contrato de Compra e Venda Gerado', 'Envio Sienge'];
  const { rows: livres } = await client.query(
    `SELECT u.sienge_unit_id, u.enterprise_id, u.name, u.sale_value_price::float AS preco FROM sie_units u
     WHERE u.empresa_id = $1 AND u.enterprise_id = ANY($2::bigint[]) AND u.commercial_stock = 'D' ORDER BY u.enterprise_id, u.name`,
    [m, lancadas.map((c) => c.sienge_id)]
  );
  const funil = livres.length ? livres : contratos.slice(0, 20).map((c) => ({ enterprise_id: c.enterprise_id, name: c.unidade, preco: c.valor }));
  for (let i = 0; i < Math.min(24, funil.length); i += 1) {
    const u = funil[(i * 7) % funil.length];
    idreserva += 1;
    const dCad = somarDias(hoje, -(1 + Math.floor(rnd(`fcad:${i}`) * 35)));
    const situacao = situacoes[Math.floor(rnd(`fsit:${i}`) * situacoes.length)];
    const cliente = A.nomePessoa(`lead:${i}`, i % 2 ? 'F' : 'M');
    reservas.push({
      empresa_id: m,
      idreserva,
      referencia: `R${idreserva}`,
      ativo: 'S',
      data_cad: `${dCad}T11:00:00-03:00`,
      codigointerno: `HZN-R${idreserva}`,
      situacao,
      situacao_comercial: 'Em negociação',
      idempreendimento: Number(u.enterprise_id),
      codigointerno_empreendimento: codigoCv.get(Number(u.enterprise_id)),
      empreendimento: nomeObra.get(Number(u.enterprise_id)),
      unidade: u.name,
      bloco: 'ÚNICO',
      venda: 'N',
      documento_cliente: A.cpfDe(A.hash(`lead-cpf:${i}`)),
      cliente,
      email: A.email(`lead${i}@x`, cliente),
      cidade: 'Volta Redonda',
      corretor: A.nomePessoa(`corretor:${i % 7}`, i % 2 ? 'F' : 'M'),
      imobiliaria: corretores[i % corretores.length],
      valor_contrato: arred(u.preco || 380000 + rnd(`fval:${i}`) * 250000),
      tipovenda: rnd(`ftipo:${i}`) < 0.75 ? 'Financiada' : 'Direta ou à Vista',
      tipo_reserva: 'Padrão',
      nome_usuario: 'Patrícia Moura',
    });
    const passos = micro.VENDA;
    const alvo = Math.max(1, situacoes.indexOf(situacao) + 1);
    let d = dCad;
    for (let p = 0; p < alvo && p < passos.length; p += 1) {
      d = somarDias(d, 1 + Math.floor(rnd(`fpasso:${i}:${p}`) * 3));
      if (d > hoje) break;
      historico.push({ empresa_id: m, idreserva, centro_custo_sienge_id: Number(u.enterprise_id), macro_etapa: 'VENDA', mascara_item_id: passos[p].id, data_movimentacao: d, descricao: null, usuario_id: equipe[3] });
    }
  }
  await inserirLote(client, ctx.meta, 'construtor_vendas_reservas', reservas);
  await inserirLote(client, ctx.meta, 'repasses_cef_vinculos_contrato', vinculos);
  await inserirLote(client, ctx.meta, 'repasses_cef_historico_microetapas', historico);
  ctx.log(`  construtor_vendas_reservas: ${reservas.length} · vínculos: ${vinculos.length} · microetapas: ${historico.length}`);

  // EPR (Portal das Construtoras): extrato de recursos por contrato Caixa, com os mutuários.
  const { rows: emps } = await client.query('SELECT contrato_empreendimento, nome_empreendimento FROM extrato_empreendimentos WHERE empresa_id = $1', [m]);
  for (const e of emps) {
    const mut = unidadesCaixa.filter((u) => u.contrato_empreendimento === e.contrato_empreendimento);
    await inserir(ctx, 'epr_empreendimentos', {
      empresa_id: m,
      contrato_mestre_obra: e.contrato_empreendimento,
      arquivo_original: `EPR_${e.contrato_empreendimento}.pdf`,
      nome_empreendimento: e.nome_empreendimento,
      uno: '07058',
      unidade_financeira: '7',
      data_inicio_obra: '2025-04-01',
      data_fim_obra: '2027-09-30',
      data_emissao_extrato: somarDias(hoje, -12),
      quantidade_mutuarios: mut.length,
      enviado_por_usuario_id: equipe[3],
    }, null);
    await inserirLote(
      client,
      ctx.meta,
      'epr_mutuarios',
      mut.map((u, i) => ({
        empresa_id: m,
        contrato_mestre_obra: e.contrato_empreendimento,
        contrato_mutuario: u.numero_contrato_unidade,
        nome_mutuario: u.nome_mutuario,
        uno: '07058',
        orr: '025',
        to_codigo: '5',
        cod: '009',
        data_assinatura: u.assinatura,
        tipo_unidade: ['A1', 'A2', 'A5', 'E', 'F'][i % 5],
        garantia_automatica: i % 3 === 0 ? '1' : '0',
        data_inclusao_contrato: u.assinatura,
        valor_retido: arred(4000 + rnd(`ret:${u.id}`) * 18000),
        valor_amortizado: arred(rnd(`amo:${u.id}`) * 9000),
        amortizado: rnd(`amo2:${u.id}`) < 0.4,
      }))
    );
  }
}

// ─── Home: Plano de Voo ─────────────────────────────────────────────────────────────────

async function sintetizarPlanoDeVoo(ctx) {
  ctx.log('Home: plano de voo e atividades da equipe');
  const { modelo: m, equipe } = ctx;
  const plano = (await inserir(ctx, 'projetos_planos', { empresa_id: m, nome: 'Gestão 360 HZN — 2026/2027', criador_id: equipe[0], criado_em: new Date(), atualizado_em: new Date() })).id;
  for (const u of equipe) await inserir(ctx, 'projetos_planos_membros', { plano_id: plano, usuario_id: u }, null);
  const macros = ['Fechamento mensal · D+5 lança / D+10 apresenta', 'Fluxo de caixa projetado por SPE', 'Régua de cobrança e inadimplência', 'Repasses CEF sem gargalo', 'Orçamento 2027 por obra'];
  const macroIds = [];
  for (const [i, nome] of macros.entries()) macroIds.push((await inserir(ctx, 'projetos_macros', { plano_id: plano, nome, ordem: i + 1, criado_em: new Date() })).id);
  const hoje = hojeSP();
  const cards = [
    [0, 'Conciliar saldos bancários de outubro', 'Fechar a conciliação de todas as contas e registrar os bloqueios judiciais.', -20, -5, 'FINALIZADO', 4],
    [0, 'Apresentar DRE de outubro à diretoria', 'Resultado por obra, POC e comparação com o orçamento.', -3, 4, 'PROGRESSO', 1],
    [1, 'Revisar premissas de vendas do HZN Linha do Horizonte', 'Velocidade de vendas e ticket médio para a projeção CEF.', -10, 6, 'PROGRESSO', 1],
    [1, 'Atualizar curva de desembolso do HZN Poente', 'Usar a ficha de desembolso do Sienge e o avanço físico do Prevision.', 2, 15, 'AGUARDANDO', 3],
    [2, 'Ajustar régua do cluster duvidoso', 'Incluir ligação no D+16 e template com proposta de acordo.', -7, 1, 'PROGRESSO', 2],
    [2, 'Mutirão de negociação — clientes acima de 60 dias', 'Lista gerada pela distribuição automática.', 3, 20, 'AGUARDANDO', 5],
    [3, 'Destravar 6 contratos parados em Minuta CEF', 'Cobrar a agência e o correspondente bancário.', -4, 3, 'PROGRESSO', 3],
    [3, 'Registrar contratos assinados do HZN Nascente', 'Acompanhar ITBI e entrada no cartório.', 1, 25, 'AGUARDANDO', 3],
    [4, 'Coletar orçamento 2027 com os engenheiros de obra', 'Planilha orçamentária por centro de custo.', 5, 30, 'AGUARDANDO', 0],
  ];
  for (const [mi, assunto, descricao, ini, fim, status, resp] of cards) {
    await inserir(ctx, 'projetos_cards', {
      empresa_id: m,
      assunto,
      descricao,
      data_inicio: somarDias(hoje, ini),
      data_fim: somarDias(hoje, fim),
      responsavel_id: equipe[resp],
      criador_id: equipe[0],
      status,
      finalizado_em: status === 'FINALIZADO' ? `${somarDias(hoje, fim)}T17:00:00-03:00` : null,
      concluido_em: status === 'FINALIZADO' ? `${somarDias(hoje, fim)}T17:00:00-03:00` : null,
      macro_id: macroIds[mi],
      criado_em: `${somarDias(hoje, ini - 2)}T09:00:00-03:00`,
      atualizado_em: new Date(),
    }, null);
  }
}

module.exports = { sintetizarSaldos, sintetizarCobranca, sintetizarRepasses, sintetizarPlanoDeVoo };
