const ExcelJS = require('exceljs');
const pool = require('../../config/db');
const repassesCef = require('./repassesCef.service');
const empresasService = require('../empresas/empresas.service');
const zapiService = require('../integracoes-zapi/zapi.service');
const saldosService = require('../saldo-contas-bancarias/saldos.service');
const { estaNaHora, proximaExecucao } = require('../monitor-integracoes/tempo');

// Comunicado "Repasses CEF" por WhatsApp — mesmo padrão do comunicado de saldos
// (comunicarSaldos.service.js): texto curto com os números que importam + Excel anexo.
// O texto foca nos dois gargalos: contratos que ainda não viraram assinatura e contratos
// retidos em assinatura (ainda sem registro). O Excel traz todas as etapas, uma aba cada,
// com o rastreio acumulado dos documentos (reserva → contrato → contrato Caixa → registro).
// Clientes = os mesmos dos buckets do Kanban (mesmas consultas e filtros).

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Faixas de tempo dos contratos retidos em assinatura — 60+ dias ganham bolinha de alerta.
const FAIXAS_ASSINATURA = [
  { rotulo: 'Até 29 dias', min: 0, max: 29, marcador: '' },
  { rotulo: '30 a 59 dias', min: 30, max: 59, marcador: '' },
  { rotulo: '60 a 89 dias', min: 60, max: 89, marcador: '🟡 ' },
  { rotulo: '90 dias ou mais', min: 90, max: Infinity, marcador: '🔴 ' },
];

function nomeExibicaoEmpresa(empresa) {
  return empresa?.nome_fantasia?.trim() || empresa?.razao_social || '';
}

function numero(valor) {
  return Number(valor || 0).toLocaleString('pt-BR');
}

function moeda(valor) {
  return `R$ ${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// DATE chega do pg como texto 'AAAA-MM-DD' (ver config/db.js) e já é o dia gravado — passa
// direto, sem virar Date (new Date('AAAA-MM-DD') é meia-noite UTC e os getters locais abaixo
// voltariam um dia em UTC−3). TIMESTAMP chega como Date no fuso do servidor — só o calendário
// importa.
function dataIso(valor) {
  if (!valor) return null;
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasDesde(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  const agora = new Date();
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.max(0, Math.round((hoje - Date.UTC(a, m - 1, d)) / 86400000));
}

// Data pro Excel: meia-noite UTC do dia, pra célula mostrar exatamente o dia certo.
function dataExcel(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function media(valores) {
  const v = valores.filter((x) => x != null);
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

function soma(lista, campo) {
  return lista.reduce((s, x) => s + (Number(x[campo]) || 0), 0);
}

async function nomesDosCentros(empresaId) {
  const { rows } = await pool.query(
    `SELECT sienge_id::text AS id, COALESCE(NULLIF(TRIM(apelido), ''), TRIM(name)) AS nome
     FROM centros_custo_sienge WHERE empresa_id = $1`,
    [empresaId]
  );
  return new Map(rows.map((r) => [r.id, r.nome]));
}

// Rastreio dos documentos: datas da reserva, dados do contrato Sienge (data de emissão —
// o contract_date do Sienge só repete a data da reserva — e valor) e o valor retido pela
// Caixa, que vem do EPR importado no Portal das Construtoras (epr_mutuarios.valor_retido,
// coluna "VR RETIDO"), ligado pelo Nº Contrato Caixa (contrato_mutuario).
async function rastreio(empresaId) {
  const [{ rows: reservas }, { rows: contratos }, { rows: epr }] = await Promise.all([
    pool.query('SELECT idreserva, data_cad FROM construtor_vendas_reservas WHERE empresa_id = $1', [empresaId]),
    pool.query(
      `SELECT number, financial_institution_number, COALESCE(issue_date, contract_date) AS data_contrato, value
       FROM sie_sales_contracts
       WHERE empresa_id = $1 AND situation IS DISTINCT FROM 'Cancelado'`,
      [empresaId]
    ),
    pool.query('SELECT contrato_mutuario, valor_retido FROM epr_mutuarios WHERE empresa_id = $1', [empresaId]),
  ]);
  const valorRetido = new Map(epr.map((m) => [m.contrato_mutuario, m.valor_retido != null ? Number(m.valor_retido) : null]));
  const dataReserva = new Map(reservas.map((r) => [String(r.idreserva), dataIso(r.data_cad)]));
  const contratoPorCaixa = new Map(
    contratos.filter((c) => c.financial_institution_number).map((c) => [c.financial_institution_number, c])
  );
  return { dataReserva, contratoPorCaixa, valorRetido };
}

// Uma linha por cliente em cada etapa, já com o rastreio acumulado e a situação do SLA.
async function montarResumo(empresaId) {
  const [empresa, sla, nomes, trilha, reservas, contratos, assinaturas, registros, atualizacao] = await Promise.all([
    empresasService.getById(empresaId),
    repassesCef.getSlaMacroEtapas(empresaId),
    nomesDosCentros(empresaId),
    rastreio(empresaId),
    repassesCef.listReservas(empresaId),
    repassesCef.listContratos(empresaId),
    repassesCef.listAssinaturas(empresaId),
    repassesCef.listRegistros(empresaId),
    pool.query('SELECT max(criado_em) AS sienge FROM sie_sales_contracts WHERE empresa_id = $1', [empresaId]),
  ]);

  const base = (x, macro, dataEntrada) => {
    const dataEtapa = dataIso(dataEntrada);
    const dias = diasDesde(dataEtapa);
    const limite = macro === 'REGISTRO' ? null : sla[macro];
    const dataMicro = dataIso(x.ultima_microetapa_data);
    return {
      macro,
      centro: nomes.get(String(x.centro_custo_sienge_id)) || String(x.empreendimento || '').trim(),
      cliente: String(x.titular_nome || '').trim() || null,
      idreserva: x.idreserva ?? null,
      dataReserva: x.idreserva != null ? trilha.dataReserva.get(String(x.idreserva)) || null : null,
      dias: macro === 'REGISTRO' ? null : dias,
      sla: limite,
      vencido: limite != null && dias != null && dias > limite,
      microEtapa: x.ultima_microetapa_nome || null,
      diasMicroEtapa: diasDesde(dataMicro),
    };
  };

  const doExtrato = (u, macro) => {
    const ctr = trilha.contratoPorCaixa.get(u.numero_contrato_unidade);
    return {
      ...base(u, macro, macro === 'REGISTRO' ? u.data_registro : u.data_assinatura_contrato),
      numeroContrato: u.numero_contrato || ctr?.number || null,
      dataContrato: dataIso(ctr?.data_contrato),
      valor: ctr?.value != null ? Number(ctr.value) : null,
      // undefined = contrato Caixa sem EPR importado (diferente de retido zero).
      valorRetido: trilha.valorRetido.has(u.numero_contrato_unidade) ? trilha.valorRetido.get(u.numero_contrato_unidade) : undefined,
      contratoCaixa: u.numero_contrato_unidade,
      dataAssinatura: dataIso(u.data_assinatura_contrato),
      dataRegistro: dataIso(u.data_registro),
    };
  };

  return {
    empresa: nomeExibicaoEmpresa(empresa),
    sla,
    atualizadoEm: atualizacao.rows[0]?.sienge || null,
    reserva: reservas.map((r) => ({
      ...base(r, 'VENDA', r.data_entrada_etapa),
      valor: r.valor_venda != null ? Number(r.valor_venda) : null,
    })),
    contrato: contratos.map((c) => ({
      ...base(c, 'CONTRATO', c.data_entrada_etapa),
      numeroContrato: c.number,
      dataContrato: dataIso(c.data_entrada_etapa),
      valor: c.valor != null ? Number(c.valor) : null,
    })),
    assinatura: assinaturas.map((u) => doExtrato(u, 'ASSINATURA')),
    registro: registros.map((u) => doExtrato(u, 'REGISTRO')),
  };
}

function blocoSla(lista, sla) {
  if (sla == null) return ['_SLA da etapa não cadastrado (aba Máscaras)_'];
  const vencidos = lista.filter((c) => c.vencido).length;
  return [`🟢 ${numero(lista.length - vencidos)} no SLA`, `🔴 ${numero(vencidos)} com SLA vencido _(SLA ${numero(sla)} dias)_`];
}

function montarMensagem(resumo, nomeDestinatario) {
  const { empresa, sla, contrato, assinatura } = resumo;
  const primeiroNome = String(nomeDestinatario || '').trim().split(/\s+/)[0];
  const dataHoje = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date());

  const linhas = [
    `*[ REPASSES CEF ]* · *${empresa}*`,
    `_Posição de ${dataHoje}_`,
    '',
    `Olá${primeiroNome ? `, ${primeiroNome}` : ''}! Segue o resumo do repasse.`,
    '',
    '📝 *Contratos que não viraram assinatura*',
    `💰 ${moeda(soma(contrato, 'valor'))} | ${numero(contrato.length)} contratos`,
    ...blocoSla(contrato, sla.CONTRATO),
    `⏱️ Tempo médio: ${numero(media(contrato.map((c) => c.dias)))} dias`,
    '',
    '✍️ *Contratos retidos (em assinatura)*',
    `💰 ${moeda(soma(assinatura, 'valorRetido'))} retidos | ${numero(assinatura.length)} contratos`,
    ...blocoSla(assinatura, sla.ASSINATURA),
    `⏱️ Tempo médio: ${numero(media(assinatura.map((c) => c.dias)))} dias`,
  ];
  for (const faixa of FAIXAS_ASSINATURA) {
    const daFaixa = assinatura.filter((c) => c.dias != null && c.dias >= faixa.min && c.dias <= faixa.max);
    linhas.push(`* ${faixa.marcador}${faixa.rotulo}: ${moeda(soma(daFaixa, 'valorRetido'))} | qtd ${numero(daFaixa.length)}`);
  }
  linhas.push('', '📎 Detalhe por cliente na planilha anexa', '', '_Comunicado automático enviado pelo Horizon Finanças._');
  return linhas.join('\n');
}

// Colunas de cada aba — empilhadas: cada etapa repete as colunas das anteriores e acrescenta
// as suas (Reserva → Contrato → Contrato Caixa/Assinatura → Registro).
const COL = {
  centro: { header: 'Empreendimento', key: 'centro', width: 22 },
  cliente: { header: 'Cliente', key: 'cliente', width: 40 },
  idreserva: { header: 'Nº Reserva', key: 'idreserva', width: 11 },
  dataReserva: { header: 'Data da Reserva', key: 'dataReserva', width: 15, data: true },
  numeroContrato: { header: 'Nº Contrato Sienge', key: 'numeroContrato', width: 22 },
  dataContrato: { header: 'Data do Contrato', key: 'dataContrato', width: 15, data: true },
  valorVenda: { header: 'Valor da Venda', key: 'valor', width: 16, moeda: true },
  valor: { header: 'Valor do Contrato', key: 'valor', width: 16, moeda: true },
  valorRetido: { header: 'Valor Retido (EPR)', key: 'valorRetido', width: 17, moeda: true },
  contratoCaixa: { header: 'Nº Contrato Caixa', key: 'contratoCaixa', width: 17 },
  dataAssinatura: { header: 'Data da Assinatura', key: 'dataAssinatura', width: 17, data: true },
  dataRegistro: { header: 'Data do Registro', key: 'dataRegistro', width: 15, data: true },
  dias: { header: 'Dias na etapa', key: 'dias', width: 13, inteiro: true },
  sla: { header: 'SLA da etapa', key: 'sla', width: 12, inteiro: true },
  situacao: { header: 'SLA', key: 'situacao', width: 12 },
  microEtapa: { header: 'Micro etapa atual', key: 'microEtapa', width: 34 },
  diasMicroEtapa: { header: 'Dias parado na micro etapa', key: 'diasMicroEtapa', width: 16, inteiro: true },
};

const ABAS = [
  {
    nome: 'Reserva',
    chave: 'reserva',
    colunas: ['centro', 'cliente', 'idreserva', 'dataReserva', 'valorVenda', 'dias', 'sla', 'situacao', 'microEtapa', 'diasMicroEtapa'],
  },
  {
    nome: 'Contrato',
    chave: 'contrato',
    colunas: [
      'centro', 'cliente', 'idreserva', 'dataReserva', 'numeroContrato', 'dataContrato', 'valor',
      'dias', 'sla', 'situacao', 'microEtapa', 'diasMicroEtapa',
    ],
  },
  {
    nome: 'Assinatura',
    chave: 'assinatura',
    colunas: [
      'centro', 'cliente', 'idreserva', 'dataReserva', 'numeroContrato', 'dataContrato', 'valor', 'valorRetido',
      'contratoCaixa', 'dataAssinatura', 'dias', 'sla', 'situacao', 'microEtapa', 'diasMicroEtapa',
    ],
  },
  {
    nome: 'Registro',
    chave: 'registro',
    colunas: [
      'centro', 'cliente', 'idreserva', 'dataReserva', 'numeroContrato', 'dataContrato', 'valor', 'valorRetido',
      'contratoCaixa', 'dataAssinatura', 'dataRegistro', 'microEtapa', 'diasMicroEtapa',
    ],
  },
];

async function gerarExcel(resumo) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Horizon Finanças';
  for (const aba of ABAS) {
    const sheet = workbook.addWorksheet(aba.nome, { views: [{ state: 'frozen', ySplit: 1 }] });
    const colunas = aba.colunas.map((k) => COL[k]);
    sheet.columns = colunas.map(({ header, key, width }) => ({ header, key, width }));

    // Mais tempo parado na etapa primeiro (no Registro, o registro mais antigo primeiro).
    const linhas = [...resumo[aba.chave]].sort((a, b) =>
      aba.chave === 'registro'
        ? String(a.dataRegistro || '').localeCompare(String(b.dataRegistro || ''))
        : (b.dias ?? -1) - (a.dias ?? -1)
    );
    for (const c of linhas) {
      const valores = {};
      for (const col of colunas) {
        const k = col.key;
        if (k === 'situacao') valores[k] = c.sla == null ? '' : c.vencido ? 'Vencido' : 'Em dia';
        else valores[k] = col.data ? dataExcel(c[k]) : c[k] ?? null;
      }
      const row = sheet.addRow(valores);
      if (c.vencido) row.getCell('situacao').font = { color: { argb: 'FFC62828' }, bold: true };
    }

    colunas.forEach((col) => {
      if (col.data) sheet.getColumn(col.key).numFmt = 'dd/mm/yyyy';
      if (col.moeda) sheet.getColumn(col.key).numFmt = '"R$" #,##0.00';
      if (col.inteiro) sheet.getColumn(col.key).numFmt = '#,##0';
    });
    const cabecalho = sheet.getRow(1);
    cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cabecalho.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cabecalho.alignment = { vertical: 'middle', wrapText: true };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
  }
  return workbook.xlsx.writeBuffer();
}

// Sem extensão de propósito: a Z-API já acrescenta ".xlsx" pelo endpoint send-document/xlsx
// (com a extensão aqui o arquivo chegava como "...xlsx.xlsx").
function nomeArquivo() {
  const hoje = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date());
  return `Repasses CEF - ${hoje}`;
}

// Envia pra 1 telefone numa mensagem só: a planilha com o texto do comunicado como legenda.
// `resumo`/`buffer` podem vir prontos (disparo pra vários destinatários monta 1 vez só).
async function enviarComunicado(empresaId, zapiIntegracaoId, { nome, telefone }, pronto = {}) {
  const resumo = pronto.resumo || (await montarResumo(empresaId));
  const buffer = pronto.buffer || (await gerarExcel(resumo));
  const mensagem = montarMensagem(resumo, nome);

  await zapiService.enviarDocumento(zapiIntegracaoId, {
    telefone,
    documentoBase64: Buffer.from(buffer).toString('base64'),
    legenda: mensagem,
    extensao: 'xlsx',
    mimeType: MIME_XLSX,
    nomeArquivo: nomeArquivo(),
  });
  return {
    mensagem,
    totais: Object.fromEntries(ABAS.map((a) => [a.nome, resumo[a.chave].length])),
  };
}

// ---------------------------------------------------------------------
// Configuração do envio (aba Configurações da tela Repasses CEF) — mesmo padrão do
// "Comunicar Saldos": conexão Z-API + destinatários, e aqui também o dia da semana e o
// horário do envio semanal.
// ---------------------------------------------------------------------

function erro(status, message) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

const formatoAgendamento = (config) => ({
  frequencia: 'semanal',
  ativo: config.zapi_integracao_id != null && config.dia_semana != null && config.horario != null,
  dia_semana: config.dia_semana,
  horario: config.horario,
  ultima_agendada_em: config.ultimo_envio_em,
});

async function getConfig(empresaId) {
  const [elegiveis, { rows: selecionados }, { rows: config }] = await Promise.all([
    saldosService.listUsuariosElegiveisComunicar(empresaId),
    pool.query('SELECT usuario_id FROM repasses_cef_comunicar_usuarios WHERE empresa_id = $1', [empresaId]),
    pool.query(
      `SELECT zapi_integracao_id, dia_semana, to_char(horario, 'HH24:MI') AS horario, ultimo_envio_em
       FROM repasses_cef_comunicar_config WHERE empresa_id = $1`,
      [empresaId]
    ),
  ]);
  const c = config[0] || {};
  const agendamento = formatoAgendamento(c);
  return {
    elegiveis,
    selecionados: selecionados.map((r) => r.usuario_id),
    zapiIntegracaoId: c.zapi_integracao_id ?? null,
    diaSemana: c.dia_semana ?? null,
    horario: c.horario ?? null,
    ultimoEnvioEm: c.ultimo_envio_em ?? null,
    // 'YYYY-MM-DD HH:MM' (Brasília) — só quando conexão, dia e horário estão preenchidos.
    proximoEnvio: agendamento.ativo && selecionados.length > 0 ? proximaExecucao(agendamento) : null,
  };
}

async function salvarConfig(empresaId, { usuarioIds, zapiIntegracaoId, diaSemana, horario }) {
  const elegiveis = await saldosService.listUsuariosElegiveisComunicar(empresaId);
  const idsElegiveis = new Set(elegiveis.map((u) => u.id));
  if (usuarioIds.some((id) => !idsElegiveis.has(id))) {
    throw erro(400, 'Um ou mais usuários selecionados não têm acesso a esta empresa.');
  }
  if (zapiIntegracaoId !== null) {
    const { rows } = await pool.query('SELECT 1 FROM integracoes_zapi WHERE id = $1 AND empresa_id = $2', [
      zapiIntegracaoId,
      empresaId,
    ]);
    if (!rows[0]) throw erro(400, 'Conexão Z-API inválida para esta empresa.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM repasses_cef_comunicar_usuarios WHERE empresa_id = $1', [empresaId]);
    if (usuarioIds.length) {
      await client.query(
        'INSERT INTO repasses_cef_comunicar_usuarios (empresa_id, usuario_id) SELECT $1, unnest($2::int[])',
        [empresaId, usuarioIds]
      );
    }
    // Ao mudar dia/horário, um envio que já aconteceu hoje continua contando (não reenvia).
    await client.query(
      `INSERT INTO repasses_cef_comunicar_config (empresa_id, zapi_integracao_id, dia_semana, horario, atualizado_em)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (empresa_id) DO UPDATE SET
         zapi_integracao_id = EXCLUDED.zapi_integracao_id,
         dia_semana = EXCLUDED.dia_semana,
         horario = EXCLUDED.horario,
         atualizado_em = NOW()`,
      [empresaId, zapiIntegracaoId, diaSemana, horario]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return getConfig(empresaId);
}

// Dispara o comunicado pra todos os destinatários da empresa (monta números e planilha
// 1 vez só). Nunca lança — cada falha vira um item em `falhas`, como no Comunicar Saldos.
async function dispararParaDestinatarios(empresaId) {
  const prefixo = `[comunicar-repasses] empresa ${empresaId}:`;
  const { rows: config } = await pool.query(
    'SELECT zapi_integracao_id FROM repasses_cef_comunicar_config WHERE empresa_id = $1',
    [empresaId]
  );
  const zapiIntegracaoId = config[0]?.zapi_integracao_id;
  if (!zapiIntegracaoId) return { status: 'sem_conexao', enviados: [], falhas: [] };

  const { rows: destinatarios } = await pool.query(
    `SELECT u.id, u.nome, u.telefone_ddd, u.telefone_numero
     FROM usuarios u
     JOIN repasses_cef_comunicar_usuarios c ON c.usuario_id = u.id
     WHERE c.empresa_id = $1 AND u.ativo = TRUE`,
    [empresaId]
  );
  if (destinatarios.length === 0) return { status: 'sem_destinatario', enviados: [], falhas: [] };

  const resumo = await montarResumo(empresaId);
  const buffer = await gerarExcel(resumo);

  const enviados = [];
  const falhas = [];
  for (const dest of destinatarios) {
    try {
      if (!dest.telefone_ddd || !dest.telefone_numero) {
        throw new Error(`usuário "${dest.nome}" (id ${dest.id}) sem telefone cadastrado`);
      }
      await enviarComunicado(
        empresaId,
        zapiIntegracaoId,
        { nome: dest.nome, telefone: `${dest.telefone_ddd}${dest.telefone_numero}` },
        { resumo, buffer }
      );
      enviados.push({ nome: dest.nome });
    } catch (err) {
      console.error(`${prefixo} destinatário "${dest.nome}": ${err.message}`);
      falhas.push({ nome: dest.nome, motivo: err.message });
    }
  }
  console.log(`${prefixo} comunicado enviado para ${enviados.length} de ${destinatarios.length} destinatário(s).`);
  return { status: 'enviado', enviados, falhas };
}

// Chamado a cada minuto pelo agendador do Monitor de Integrações: dispara o comunicado das
// empresas cujo dia da semana/horário já chegou e que ainda não receberam hoje. Marca o
// envio ANTES de disparar, pra um tick seguinte nunca repetir o mesmo dia.
async function verificarAgendamentos() {
  const { rows } = await pool.query(
    `SELECT empresa_id, zapi_integracao_id, dia_semana, to_char(horario, 'HH24:MI') AS horario, ultimo_envio_em
     FROM repasses_cef_comunicar_config
     WHERE zapi_integracao_id IS NOT NULL AND dia_semana IS NOT NULL AND horario IS NOT NULL`
  );
  for (const config of rows) {
    if (!estaNaHora(formatoAgendamento(config))) continue;
    await pool.query('UPDATE repasses_cef_comunicar_config SET ultimo_envio_em = $2 WHERE empresa_id = $1', [
      config.empresa_id,
      new Date().toISOString(),
    ]);
    try {
      await dispararParaDestinatarios(config.empresa_id);
    } catch (err) {
      console.error(`[comunicar-repasses] empresa ${config.empresa_id}: falha no envio agendado:`, err.message);
    }
  }
}

module.exports = {
  montarResumo,
  montarMensagem,
  gerarExcel,
  enviarComunicado,
  getConfig,
  salvarConfig,
  dispararParaDestinatarios,
  verificarAgendamentos,
};
