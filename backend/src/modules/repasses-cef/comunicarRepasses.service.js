const ExcelJS = require('exceljs');
const pool = require('../../config/db');
const repassesCef = require('./repassesCef.service');
const empresasService = require('../empresas/empresas.service');
const zapiService = require('../integracoes-zapi/zapi.service');

// Comunicado "Repasses CEF" por WhatsApp: retrato das macro etapas Reserva, Contrato e
// Assinatura (Registro fica de fora — é a etapa final), rankeado do mais urgente ao menos
// urgente, com base no SLA da macro etapa cadastrado na aba Máscaras. Mesmo padrão do
// comunicado de saldos (comunicarSaldos.service.js): texto + Excel anexo pela Z-API.

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const LINK_RELATORIO = 'financas.horizonhub.com.br/relatorios/repasses-cef';
const MAX_NOMES_POR_BLOCO = 3;

// Ordem do comunicado = ordem de gravidade (pedido do usuário): Contrato → Assinatura é o
// gargalo principal, depois a Assinatura, e a Reserva por último.
const ETAPAS = [
  { macro: 'CONTRATO', titulo: 'CONTRATO → ASSINATURA', rotulo: 'Contrato', plural: 'contratos', doc: 'Contrato Sienge' },
  { macro: 'ASSINATURA', titulo: 'ASSINATURA', rotulo: 'Assinatura', plural: 'assinados na Caixa', doc: 'Contrato Caixa' },
  { macro: 'VENDA', titulo: 'RESERVA → CONTRATO', rotulo: 'Reserva', plural: 'reservas', doc: 'Código da reserva' },
];

const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function nomeExibicaoEmpresa(empresa) {
  return empresa?.nome_fantasia?.trim() || empresa?.razao_social || '';
}

function numero(valor) {
  return Number(valor || 0).toLocaleString('pt-BR');
}

function capitalizar(palavra) {
  return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
}

// "NATALIA ARAUJO TOUZA DOS SANTOS" → "Natalia A. T. S." — o texto pode cair em grupo de
// WhatsApp; o nome completo fica só no Excel anexo.
function abreviarNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return 'Cliente não informado';
  const [primeiro, ...resto] = partes;
  const iniciais = resto.filter((p) => !CONECTIVOS.has(p.toLowerCase())).map((p) => `${p.charAt(0).toUpperCase()}.`);
  return [capitalizar(primeiro), ...iniciais].join(' ');
}

// "SOLAR DAS FLORES" → "Solar das Flores", "OASIS II" → "Oasis II" (numeral romano fica).
function nomeCentroCurto(nome) {
  return String(nome || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => {
      if (/^[IVX]+$/.test(p)) return p;
      if (i > 0 && CONECTIVOS.has(p.toLowerCase())) return p.toLowerCase();
      return capitalizar(p);
    })
    .join(' ');
}

// Colunas DATE/TIMESTAMP chegam como Date no fuso do servidor — compara só o calendário.
function diasDesde(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const agora = new Date();
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.max(0, Math.round((hoje - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000));
}

function dataHoraBR(valor) {
  if (!valor) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(valor));
}

function dataPorExtenso() {
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
  return fmt.format(new Date());
}

async function nomesDosCentros(empresaId) {
  const { rows } = await pool.query(
    `SELECT sienge_id::text AS id, COALESCE(NULLIF(TRIM(apelido), ''), TRIM(name)) AS nome
     FROM centros_custo_sienge WHERE empresa_id = $1`,
    [empresaId]
  );
  return new Map(rows.map((r) => [r.id, r.nome]));
}

// Situação de cada cliente frente ao SLA da macro etapa: no prazo, perto (a partir de 80%
// do SLA) ou fora. Fora até 2× o SLA = ainda dá pra destravar cobrando; acima de 2× = parado
// há tempo demais, provável problema de cadastro (distrato não cancelado, falta de vínculo).
function classificar(dias, sla) {
  if (sla == null || dias == null) return 'sem_sla';
  if (dias > 2 * sla) return 'travado';
  if (dias > sla) return 'fora';
  if (dias >= sla * 0.8) return 'perto';
  return 'no_prazo';
}

// Monta os números do comunicado (sem texto) — reaproveita as mesmas consultas do Kanban,
// então bate exatamente com o que está na tela.
async function montarResumo(empresaId) {
  const [empresa, sla, nomes, reservas, contratos, assinaturas] = await Promise.all([
    empresasService.getById(empresaId),
    repassesCef.getSlaMacroEtapas(empresaId),
    nomesDosCentros(empresaId),
    repassesCef.listReservas(empresaId),
    repassesCef.listContratos(empresaId),
    repassesCef.listAssinaturas(empresaId),
  ]);

  const montar = (macro, x, dataEntrada, documento) => {
    const dias = diasDesde(dataEntrada);
    const limite = sla[macro];
    return {
      macro,
      centro: nomes.get(String(x.centro_custo_sienge_id)) || String(x.empreendimento || '').trim(),
      cliente: String(x.titular_nome || '').trim() || null,
      documento: documento != null ? String(documento) : null,
      dias,
      sla: limite,
      situacao: classificar(dias, limite),
      microEtapa: x.ultima_microetapa_nome || null,
      diasMicroEtapa: diasDesde(x.ultima_microetapa_data),
    };
  };

  const clientes = [
    ...contratos.map((x) => montar('CONTRATO', x, x.data_entrada_etapa, x.number)),
    ...assinaturas.map((x) => montar('ASSINATURA', x, x.data_assinatura_contrato, x.numero_contrato_unidade)),
    ...reservas.map((x) => montar('VENDA', x, x.data_entrada_etapa, x.idreserva)),
  ];

  const { rows: ritmo } = await pool.query(
    `SELECT
       (SELECT count(*) FROM sie_sales_contracts
        WHERE empresa_id = $1 AND situation IS DISTINCT FROM 'Cancelado'
          AND COALESCE(issue_date, contract_date) >= CURRENT_DATE - 30)::int AS contratos_emitidos,
       (SELECT count(*) FROM extrato_unidades
        WHERE empresa_id = $1 AND data_assinatura_contrato >= CURRENT_DATE - 30)::int AS assinaturas,
       (SELECT max(criado_em) FROM sie_sales_contracts WHERE empresa_id = $1) AS sienge_atualizado`,
    [empresaId]
  );

  return { empresa: nomeExibicaoEmpresa(empresa), sla, clientes, ritmo: ritmo[0] };
}

const ehFora = (c) => c.situacao === 'fora' || c.situacao === 'travado';

function linhaCliente(c, complemento = '') {
  return `• ${c.documento || '—'} · ${abreviarNome(c.cliente)} · ${nomeCentroCurto(c.centro)} · ${numero(c.dias)}d${complemento}`;
}

function contarPor(lista, chave) {
  const mapa = new Map();
  for (const item of lista) mapa.set(chave(item), (mapa.get(chave(item)) || 0) + 1);
  return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

// Ação sugerida pela micro etapa atual de um cliente fora do SLA — só pros casos em que a
// própria micro etapa já denuncia o problema.
function acaoPelaMicro(macro, micro) {
  const m = String(micro || '').toLowerCase();
  if (m.includes('distrato')) return macro === 'ASSINATURA' ? 'confirmar e baixar' : 'cancelar no Sienge';
  if (macro === 'CONTRATO' && m.includes('assinado')) return 'vincular o Nº Contrato Caixa';
  return null;
}

function blocoEtapa(etapa, numeroBloco, lista, sla) {
  const linhas = [];
  const fora = lista.filter(ehFora);
  const perto = lista.filter((c) => c.situacao === 'perto');
  const noPrazo = lista.filter((c) => c.situacao === 'no_prazo');

  linhas.push(`*${numeroBloco} ${etapa.titulo}*${sla != null ? ` · SLA ${numero(sla)} dias` : ' · _sem SLA cadastrado_'}`);
  if (lista.length === 0) {
    linhas.push('Nenhum cliente nesta etapa.');
    return linhas;
  }
  if (sla == null) {
    linhas.push(`${numero(lista.length)} ${etapa.plural} · cadastre o SLA na aba Máscaras pra medir o atraso.`);
    return linhas;
  }
  linhas.push(
    `${numero(lista.length)} ${etapa.plural} · 🔴 ${numero(fora.length)} fora · 🟡 ${numero(perto.length)} perto · 🟢 ${numero(noPrazo.length)} no prazo`
  );

  const destravar = lista.filter((c) => c.situacao === 'fora').sort((a, b) => b.dias - a.dias);
  const travados = lista.filter((c) => c.situacao === 'travado').sort((a, b) => b.dias - a.dias);

  // Etapa pequena (até 5 fora): lista direto, sem dividir em destravar/revisar.
  if (fora.length > 0 && fora.length <= 5) {
    linhas.push('');
    for (const c of [...fora].sort((a, b) => b.dias - a.dias).slice(0, MAX_NOMES_POR_BLOCO)) {
      const acao = acaoPelaMicro(etapa.macro, c.microEtapa);
      const micro = c.microEtapa ? ` · _${c.microEtapa}_` : '';
      linhas.push(linhaCliente(c, `${micro}${acao ? ` → ${acao}` : ''}`));
    }
    if (fora.length > MAX_NOMES_POR_BLOCO) linhas.push(`_+${fora.length - MAX_NOMES_POR_BLOCO} no anexo_`);
  } else if (fora.length > 5) {
    if (destravar.length > 0) {
      linhas.push('');
      linhas.push(`⚡ *Destravar agora* · ${numero(destravar.length)} entre ${numero(sla)} e ${numero(2 * sla)} dias`);
      const [centroTop, qtdTop] = contarPor(destravar, (c) => c.centro)[0];
      if (qtdTop >= 3 && qtdTop * 2 >= destravar.length) {
        // Onde esse lote está parado: até 2 micro etapas mais comuns (ou "sem micro etapa").
        const doCentro = destravar.filter((c) => c.centro === centroTop);
        const micros = contarPor(doCentro, (c) => c.microEtapa || '').slice(0, 2);
        const detalhe = micros
          .map(([micro, qtd]) => {
            const quem = qtd === doCentro.length ? 'todos' : numero(qtd);
            return micro ? `${quem} em _${micro}_` : `${quem} sem micro etapa registrada`;
          })
          .join(', ');
        linhas.push(`${numero(qtdTop)} são do *${nomeCentroCurto(centroTop)}* (${detalhe}).`);
      }
      for (const c of destravar.slice(0, MAX_NOMES_POR_BLOCO)) linhas.push(linhaCliente(c));
      if (destravar.length > MAX_NOMES_POR_BLOCO) linhas.push(`_+${destravar.length - MAX_NOMES_POR_BLOCO} no anexo_`);
    }
    if (travados.length > 0) {
      linhas.push('');
      linhas.push(`🧹 *Revisar cadastro* · ${numero(travados.length)} com mais de ${numero(2 * sla)} dias`);
      linhas.push(
        contarPor(travados, (c) => c.centro)
          .map(([centro, qtd]) => `${nomeCentroCurto(centro)} ${qtd}`)
          .join(' · ')
      );
      const porAcao = contarPor(
        travados.filter((c) => acaoPelaMicro(etapa.macro, c.microEtapa)),
        (c) => `${c.microEtapa}|${acaoPelaMicro(etapa.macro, c.microEtapa)}`
      );
      for (const [chave, qtd] of porAcao) {
        const [micro, acao] = chave.split('|');
        linhas.push(`• ${qtd} ${qtd === 1 ? 'marcado' : 'marcados'} como _${micro}_ → ${acao}`);
      }
    }
  }

  // Ainda no prazo, mas vence nos próximos 15 dias.
  const vencendo = lista
    .filter((c) => (c.situacao === 'perto' || c.situacao === 'no_prazo') && sla - c.dias <= 15)
    .sort((a, b) => b.dias - a.dias);
  if (vencendo.length > 0) {
    linhas.push('');
    linhas.push('⏳ *Vencem nos próximos 15 dias*');
    for (const c of vencendo.slice(0, MAX_NOMES_POR_BLOCO)) {
      const faltam = sla - c.dias;
      linhas.push(linhaCliente(c, '').replace(/ · [\d.]+d$/, ` · vence ${faltam === 0 ? 'hoje' : `em ${faltam}d`}`));
    }
    if (vencendo.length > MAX_NOMES_POR_BLOCO) linhas.push(`_+${vencendo.length - MAX_NOMES_POR_BLOCO} no anexo_`);
  }

  // Etapa com tudo fora e travado há muito tempo (caso típico da Reserva): resume em 1 linha.
  if (fora.length > 5 && destravar.length === 0 && travados.length === fora.length) {
    const minimo = Math.min(...travados.map((c) => c.dias));
    const maximo = Math.max(...travados.map((c) => c.dias));
    const quem = fora.length === lista.length ? `Todas as ${numero(fora.length)}` : `As ${numero(fora.length)} fora`;
    linhas.splice(2, linhas.length - 2, `${quem} estão paradas há muito tempo (${numero(minimo)} a ${numero(maximo)} dias).`);
    if (etapa.macro === 'VENDA') linhas.push('→ Cancelar no CV ou vincular o contrato pelo _Nº Contrato Sienge_.');
  }

  return linhas;
}

function montarMensagem(resumo, nomeDestinatario) {
  const { empresa, sla, clientes, ritmo } = resumo;
  const porMacro = Object.fromEntries(ETAPAS.map((e) => [e.macro, clientes.filter((c) => c.macro === e.macro)]));
  const comSla = clientes.filter((c) => c.sla != null);
  const totalFora = comSla.filter(ehFora).length;

  const linhas = ['*[ REPASSES CEF ]*', `*${empresa}* · ${dataPorExtenso()}`, ''];
  linhas.push(`Olá, ${String(nomeDestinatario || '').split(' ')[0] || 'tudo bem'}! Retrato do repasse hoje, do mais urgente ao menos urgente.`);
  linhas.push('');

  if (totalFora > 0) {
    const gargalo = ETAPAS.map((e) => ({ e, fora: porMacro[e.macro].filter(ehFora).length }))
      .sort((a, b) => b.fora - a.fora)[0];
    linhas.push(`🔴 *${numero(totalFora)} de ${numero(comSla.length)} clientes estão fora do SLA da etapa.*`);
    linhas.push(
      `O gargalo é *${gargalo.e.titulo}*: ${numero(gargalo.fora)} de ${numero(porMacro[gargalo.e.macro].length)} passaram dos ${numero(sla[gargalo.e.macro])} dias.`
    );
  } else {
    linhas.push('🟢 *Nenhum cliente fora do SLA da etapa.*');
  }

  ETAPAS.forEach((etapa, i) => {
    linhas.push('', '━━━━━━━━━━━━━━');
    linhas.push(...blocoEtapa(etapa, ['1️⃣', '2️⃣', '3️⃣'][i], porMacro[etapa.macro], sla[etapa.macro]));
  });

  const ranking = contarPor(comSla.filter(ehFora), (c) => c.centro).slice(0, 3);
  if (ranking.length > 0) {
    linhas.push('', '━━━━━━━━━━━━━━', '🏗️ *Mais clientes fora do SLA*');
    ranking.forEach(([centro, qtd], i) => {
      const total = comSla.filter((c) => c.centro === centro).length;
      linhas.push(`${i + 1}. ${nomeCentroCurto(centro)} — ${numero(qtd)} de ${numero(total)}`);
    });
  }

  linhas.push('', '📈 *Ritmo dos últimos 30 dias*');
  linhas.push(`${numero(ritmo.contratos_emitidos)} contratos emitidos × ${numero(ritmo.assinaturas)} assinaturas na Caixa`);
  if (ritmo.contratos_emitidos > ritmo.assinaturas * 2) linhas.push('_A fila do Contrato está crescendo._');

  linhas.push('', '📎 Lista completa no Excel anexo', `🔗 ${LINK_RELATORIO}`, '');
  const atualizado = dataHoraBR(ritmo.sienge_atualizado);
  linhas.push(`_Comunicado automático · Horizon Finanças${atualizado ? ` · Sienge atualizado em ${atualizado}` : ''}_`);
  return linhas.join('\n');
}

const SITUACAO_LABEL = {
  travado: 'Fora do SLA (mais de 2× — revisar cadastro)',
  fora: 'Fora do SLA',
  perto: 'Perto do SLA',
  no_prazo: 'No prazo',
  sem_sla: 'Sem SLA',
};
const ORDEM_SITUACAO = { travado: 0, fora: 1, perto: 2, no_prazo: 3, sem_sla: 4 };

// Excel anexo: 1 linha por cliente (nome completo aqui), do mais urgente ao menos urgente.
async function gerarExcel(resumo) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Horizon Finanças';
  const sheet = workbook.addWorksheet('Repasses CEF', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Etapa', key: 'etapa', width: 12 },
    { header: 'Situação', key: 'situacao', width: 40 },
    { header: 'Empreendimento', key: 'centro', width: 24 },
    { header: 'Nº (Reserva / Contrato Sienge / Contrato Caixa)', key: 'documento', width: 26 },
    { header: 'Cliente', key: 'cliente', width: 42 },
    { header: 'Dias na etapa', key: 'dias', width: 14 },
    { header: 'SLA da etapa', key: 'sla', width: 13 },
    { header: 'Dias acima do SLA', key: 'acima', width: 17 },
    { header: 'Micro etapa atual', key: 'micro', width: 34 },
    { header: 'Dias na micro etapa', key: 'diasMicro', width: 18 },
  ];
  const ordemEtapa = Object.fromEntries(ETAPAS.map((e, i) => [e.macro, i]));
  const rotulo = Object.fromEntries(ETAPAS.map((e) => [e.macro, e.rotulo]));
  const linhas = [...resumo.clientes].sort(
    (a, b) =>
      ordemEtapa[a.macro] - ordemEtapa[b.macro] ||
      ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] ||
      (b.dias ?? -1) - (a.dias ?? -1)
  );
  for (const c of linhas) {
    const row = sheet.addRow({
      etapa: rotulo[c.macro],
      situacao: SITUACAO_LABEL[c.situacao],
      centro: c.centro,
      documento: c.documento,
      cliente: c.cliente,
      dias: c.dias,
      sla: c.sla,
      acima: c.sla != null && c.dias != null && c.dias > c.sla ? c.dias - c.sla : null,
      micro: c.microEtapa,
      diasMicro: c.diasMicroEtapa,
    });
    if (ehFora(c)) row.getCell('situacao').font = { color: { argb: 'FFC62828' }, bold: true };
  }
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  sheet.autoFilter = { from: 'A1', to: 'J1' };
  ['dias', 'sla', 'acima', 'diasMicro'].forEach((k) => {
    sheet.getColumn(k).numFmt = '#,##0';
  });
  return workbook.xlsx.writeBuffer();
}

// Envia o comunicado pra 1 telefone: texto primeiro (a legenda de documento no WhatsApp é
// curta demais pra ele) e depois o Excel com uma legenda curta.
async function enviarComunicado(empresaId, zapiIntegracaoId, { nome, telefone }) {
  const resumo = await montarResumo(empresaId);
  const mensagem = montarMensagem(resumo, nome);
  const buffer = await gerarExcel(resumo);
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

  await zapiService.enviarMensagemTexto(zapiIntegracaoId, { telefone, mensagem });
  await zapiService.enviarDocumento(zapiIntegracaoId, {
    telefone,
    documentoBase64: Buffer.from(buffer).toString('base64'),
    legenda: `📎 Repasses CEF · ${resumo.empresa} · lista completa`,
    extensao: 'xlsx',
    mimeType: MIME_XLSX,
    nomeArquivo: `repasses-cef_${hoje}.xlsx`,
  });
  return { mensagem, clientes: resumo.clientes.length };
}

module.exports = { montarResumo, montarMensagem, gerarExcel, enviarComunicado };
