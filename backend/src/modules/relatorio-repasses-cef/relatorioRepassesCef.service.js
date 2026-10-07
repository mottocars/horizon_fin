const pool = require('../../config/db');
const repassesCef = require('../repasses-cef/repassesCef.service');

// Ordem fixa das macro etapas (mesma de frontend/src/config/macroEtapasRepasses.js) —
// `value` é o código gravado em mascara_itens.grupo e em
// repasses_cef_historico_microetapas.macro_etapa.
const MACRO_ETAPAS = [
  { value: 'VENDA', label: 'Reserva' },
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'ASSINATURA', label: 'Assinatura' },
  { value: 'REGISTRO', label: 'Registro' },
];

// Colunas DATE/TIMESTAMP chegam do pg como Date no fuso do servidor (meia-noite local pra
// DATE) — por isso as partes de calendário são lidas no fuso local, nunca via toISOString
// (que poderia voltar um dia).
function dataIso(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Dias corridos entre a data (só calendário) e hoje.
function diasDesde(iso) {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split('-').map(Number);
  const agora = new Date();
  const hoje = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.max(0, Math.round((hoje - Date.UTC(ano, mes - 1, dia)) / 86400000));
}

// Última micro etapa registrada de cada reserva DENTRO de cada macro etapa — diferente do
// card do Kanban (ULTIMA_MICROETAPA_LATERAL, que pega a última de qualquer macro): no
// relatório o cliente fica agrupado debaixo da macro em que está, então só vale micro etapa
// daquela macro. Chave: `${idreserva}|${macro}`.
async function ultimasMicroEtapasPorMacro(empresaId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (h.idreserva, h.macro_etapa)
            h.idreserva, h.macro_etapa, h.mascara_item_id, h.data_movimentacao
     FROM repasses_cef_historico_microetapas h
     WHERE h.empresa_id = $1
     ORDER BY h.idreserva, h.macro_etapa, h.data_movimentacao DESC, h.id DESC`,
    [empresaId]
  );
  const mapa = new Map();
  for (const r of rows) {
    mapa.set(`${r.idreserva}|${r.macro_etapa}`, { id: r.mascara_item_id, data: dataIso(r.data_movimentacao) });
  }
  return mapa;
}

// Nome exibido de cada centro de custo no relatório: o apelido do cadastro (Cadastros →
// Centros de Custo) e, sem apelido, o nome que vem do Sienge.
async function listNomesCentros(empresaId) {
  const { rows } = await pool.query(
    `SELECT sienge_id, COALESCE(NULLIF(TRIM(apelido), ''), TRIM(name)) AS nome
     FROM centros_custo_sienge
     WHERE empresa_id = $1`,
    [empresaId]
  );
  return new Map(rows.map((r) => [String(r.sienge_id), r.nome]));
}

async function listMicroEtapas(empresaId) {
  const { rows } = await pool.query(
    `SELECT id, grupo AS macro, sequencia, descricao, sla_dias
     FROM mascara_itens
     WHERE empresa_id = $1 AND tipo = 'REPASSES'
     ORDER BY grupo, sequencia`,
    [empresaId]
  );
  return rows;
}

// Matriz do relatório Repasses CEF: uma linha por cliente, na etapa em que ele está HOJE no
// Kanban (mesmas consultas dos buckets — mesmos filtros de Centro de Custo "Lançamento" e de
// Tipo de Venda/Situação salvos em "Configurar Filtros de Visualização"), já com a micro
// etapa atual dentro daquela macro (ou 0 — "Sem etapa registrada"), dias na etapa, dias na
// micro etapa e o SLA da micro etapa. O agrupamento Centro de Custo → Macro → Micro é
// montado no frontend.
async function getMatriz(empresaId) {
  const [nomeCentro, reservas, contratos, assinaturas, registros, ultimas, microEtapas] = await Promise.all([
    listNomesCentros(empresaId),
    repassesCef.listReservas(empresaId),
    repassesCef.listContratos(empresaId),
    repassesCef.listAssinaturas(empresaId),
    repassesCef.listRegistros(empresaId),
    ultimasMicroEtapasPorMacro(empresaId),
    listMicroEtapas(empresaId),
  ]);

  const microPorId = new Map(microEtapas.map((m) => [m.id, m]));

  function montar(macro, item, { codigo, documento, dataEtapa }) {
    const centroId = item.centro_custo_sienge_id != null ? String(item.centro_custo_sienge_id) : null;
    const ultima = item.idreserva != null ? ultimas.get(`${item.idreserva}|${macro}`) : null;
    const micro = ultima ? microPorId.get(ultima.id) : null;
    const dataIsoEtapa = dataIso(dataEtapa);
    return {
      centroId: centroId ?? `nome:${item.empreendimento}`,
      centroNome: (centroId && nomeCentro.get(centroId)) || (item.empreendimento || 'Sem centro de custo').trim(),
      macro,
      microId: micro ? micro.id : 0,
      idreserva: item.idreserva ?? null,
      codigo,
      cliente: (item.titular_nome || '').trim() || null,
      documento,
      dataEtapa: dataIsoEtapa,
      // Registro é a etapa final do repasse — não há prazo correndo, então não conta dias.
      diasEtapa: macro === 'REGISTRO' ? null : diasDesde(dataIsoEtapa),
      dataMicroEtapa: micro ? ultima.data : null,
      diasMicroEtapa: micro ? diasDesde(ultima.data) : null,
      slaMicroEtapa: micro ? micro.sla_dias : null,
    };
  }

  const clientes = [
    ...reservas.map((r) =>
      montar('VENDA', r, { codigo: String(r.idreserva), documento: String(r.idreserva), dataEtapa: r.data_cad })
    ),
    // Contrato sem reserva de origem ligada (só aparece quando nenhum filtro de Tipo de
    // Venda/Situação está ativo) — o número do contrato no Sienge faz o papel de código.
    ...contratos.map((c) =>
      montar('CONTRATO', c, {
        codigo: c.idreserva != null ? String(c.idreserva) : c.number,
        documento: c.number,
        dataEtapa: c.contract_date,
      })
    ),
    ...assinaturas.map((u) =>
      montar('ASSINATURA', u, {
        codigo: String(u.idreserva),
        documento: u.numero_contrato_unidade,
        dataEtapa: u.data_assinatura_contrato,
      })
    ),
    ...registros.map((u) =>
      montar('REGISTRO', u, {
        codigo: String(u.idreserva),
        documento: u.numero_contrato_unidade,
        dataEtapa: u.data_registro,
      })
    ),
  ];

  return {
    macroEtapas: MACRO_ETAPAS,
    microEtapas: microEtapas.map((m) => ({
      id: m.id,
      macro: m.macro,
      sequencia: m.sequencia,
      descricao: (m.descricao || '').trim(),
      slaDias: m.sla_dias,
    })),
    clientes,
  };
}

module.exports = { getMatriz };
