const pool = require('../../config/db');
const etapasService = require('../etapas-centro-custo/etapasCentroCusto.service');

// O cronograma de cada obra É o Histórico de Etapas do centro de custo (centro_custo_etapas_historico
// — pedido do usuário): uma linha por etapa da máscara Etapas do Centro de Custo, com data_inicio e
// data_fim. Editado na aba Histórico de Etapas do cadastro do centro (Cadastros > Centros de Custos —
// também aberto em janela pela aba Centros de Custos de Cronogramas Obras, que só lista). Editar não
// grava aqui na hora: a alteração fica pendente e só entra quando uma nova versão do cronograma é
// gravada (cronogramaVersoes.service.js), que aplica as pendências com aplicarDatas.
//
// As etapas vão em sequência: a duração de uma etapa é o tempo até o início da seguinte (meses; na
// última, anos até o fim dela). A data_fim continua gravada porque outras telas leem (Curva de
// Vendas usa o fim da Entrega, Curva de Obras o período de "Obras"): é a véspera do início da etapa
// seguinte e, na última, o término (início + os anos informados).

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

function vespera(data) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Histórico do centro (ou de todos, sem siengeId): Map sienge_id -> { inicios: {etapaId: data},
// fins: {etapaId: data} }.
async function historicoPorCentro(empresaId, siengeId = null, db = pool) {
  const { rows } = await db.query(
    `SELECT sienge_id, mascara_item_id, data_inicio, data_fim FROM centro_custo_etapas_historico
      WHERE empresa_id = $1 AND ($2::int IS NULL OR sienge_id = $2)
      ORDER BY data_inicio ASC`,
    [empresaId, siengeId]
  );
  const porCentro = new Map();
  rows.forEach((r) => {
    if (!porCentro.has(r.sienge_id)) porCentro.set(r.sienge_id, { inicios: {}, fins: {} });
    const c = porCentro.get(r.sienge_id);
    c.inicios[r.mascara_item_id] = r.data_inicio;
    c.fins[r.mascara_item_id] = r.data_fim;
  });
  return porCentro;
}

// Formato da tela: datas = início de cada etapa, fins = fim gravado (a tela usa quando falta o
// início da seguinte — histórico antigo), data_termino = fim da última etapa.
function cronogramaDoCentro(historico, etapas) {
  const h = historico || { inicios: {}, fins: {} };
  const ultima = etapas[etapas.length - 1];
  return { datas: h.inicios, fins: h.fins, data_termino: (ultima && h.fins[ultima.id]) || null };
}

// Regra de Atraso da Construção da empresa (aba Configurações — cronograma_config), pros Gantts
// pintarem os meses em atraso da etapa da construção: null sem regra ou sem a etapa. A conta dos
// meses fica na tela (cronogramaObras.js); daqui vai, na regra de planejamento, o dia em que a curva
// S de base do Prevision (na visão do orçamento escolhida no cadastro do centro) chega a 100% pela
// primeira vez — Map sienge_id -> data.
async function atrasoDaEmpresa(empresaId, db = pool) {
  const { rows } = await db.query(
    `SELECT atraso_regra, atraso_meses, atraso_sistema, atraso_etapa_id, atraso_cor FROM cronograma_config
      WHERE empresa_id = $1 AND atraso_regra IS NOT NULL AND atraso_etapa_id IS NOT NULL`,
    [empresaId]
  );
  const c = rows[0];
  if (!c) return { atraso: null, base100: new Map() };
  const atraso = { regra: c.atraso_regra, meses: c.atraso_meses, sistema: c.atraso_sistema, etapaId: c.atraso_etapa_id, cor: c.atraso_cor };
  if (c.atraso_regra !== 'PLANEJAMENTO') return { atraso, base100: new Map() };
  const { rows: curvas } = await db.query(
    `SELECT s.sienge_id, MIN(s.data) AS data
       FROM prevision_dashboard_scurve s
       JOIN centros_custo_sienge c ON c.empresa_id = s.empresa_id AND c.sienge_id = s.sienge_id
        AND s.primary_view = c.prevision_primary_view
      WHERE s.empresa_id = $1 AND s.base >= 1
      GROUP BY s.sienge_id`,
    [empresaId]
  );
  return { atraso, base100: new Map(curvas.map((r) => [r.sienge_id, r.data])) };
}

// Lista (só leitura) da aba Centros de Custos de Cronogramas Obras: as etapas da empresa (máscara
// Etapas do Centro de Custo, na ordem) e todos os centros de custo dela — mesma lista e ordem da aba
// Centros Custos da DFC (dfcCentros.service.js) —, cada um com Tipo, VGV, nº de unidades e o
// cronograma. Vai junto a regra de atraso (atrasoDaEmpresa) e, por centro, `prevision_base_100`.
// `db`: a conexão de uma transação aberta (a gravação de uma versão tira o retrato com ela).
async function list(empresaId, db = pool) {
  const etapas = await etapasService.list(empresaId, db);
  const { rows: centros } = await db.query(
    `SELECT sienge_id, name, apelido, status, natureza, valor_geral_vendas, numero_unidades FROM centros_custo_sienge
      WHERE empresa_id = $1
      ORDER BY sienge_id::text ASC`,
    [empresaId]
  );
  const historico = await historicoPorCentro(empresaId, null, db);
  const { atraso, base100 } = await atrasoDaEmpresa(empresaId, db);
  return {
    etapas,
    atraso,
    centros: centros.map((c) => ({
      ...c,
      ...cronogramaDoCentro(historico.get(c.sienge_id), etapas),
      prevision_base_100: base100.get(c.sienge_id) || null,
    })),
  };
}

// Grava os inícios que mudaram (data null apaga a etapa do histórico) e, se veio, o término (fim da
// última etapa). Depois recalcula a data_fim só das etapas vizinhas ao que mudou — a anterior e a
// própria —, pra não mexer no resto do histórico. Devolve o cronograma do centro como ficou.
// Roda dentro da transação de quem chama (`client`): a gravação de uma versão aplica as pendências
// de todas as obras numa transação só, e a prévia das pendências aplica e desfaz (ROLLBACK).
async function aplicarDatas(client, empresaId, siengeId, { datas, dataTermino }) {
  const { rows: centro } = await client.query(
    'SELECT 1 FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, siengeId]
  );
  if (!centro[0]) throw erro(404, 'Centro de custo não encontrado.');

  const etapas = await etapasService.list(empresaId, client);
  const posicao = new Map(etapas.map((e, i) => [e.id, i]));
  if (datas.some((d) => !posicao.has(d.etapa_id))) {
    throw erro(409, 'As etapas foram alteradas em outro lugar. Recarregue a tela e tente de novo.');
  }

  // 1) inícios. Se o início novo passar do fim gravado, o fim sai (a CHECK fim >= início não
  //    deixaria gravar) — o passo 2 recalcula.
  for (const { etapa_id: etapaId, data } of datas) {
    if (data === null) {
      await client.query(
        'DELETE FROM centro_custo_etapas_historico WHERE empresa_id = $1 AND sienge_id = $2 AND mascara_item_id = $3',
        [empresaId, siengeId, etapaId]
      );
      continue;
    }
    const { rowCount } = await client.query(
      `UPDATE centro_custo_etapas_historico
          SET data_inicio = $4, data_fim = CASE WHEN data_fim < $4::date THEN NULL ELSE data_fim END
        WHERE empresa_id = $1 AND sienge_id = $2 AND mascara_item_id = $3`,
      [empresaId, siengeId, etapaId, data]
    );
    if (!rowCount) {
      await client.query(
        `INSERT INTO centro_custo_etapas_historico (sienge_id, empresa_id, mascara_item_id, data_inicio)
         VALUES ($1, $2, $3, $4)`,
        [siengeId, empresaId, etapaId, data]
      );
    }
  }

  // 2) fins das etapas afetadas.
  const afetadas = new Set();
  datas.forEach((d) => {
    const i = posicao.get(d.etapa_id);
    afetadas.add(i);
    if (i > 0) afetadas.add(i - 1);
  });
  if (dataTermino !== undefined && etapas.length) afetadas.add(etapas.length - 1);

  const h = (await historicoPorCentro(empresaId, siengeId, client)).get(siengeId) || { inicios: {}, fins: {} };
  for (const i of afetadas) {
    const etapa = etapas[i];
    const inicio = h.inicios[etapa.id];
    if (!inicio) continue;
    let fim;
    if (i === etapas.length - 1) {
      fim = dataTermino !== undefined ? dataTermino : h.fins[etapa.id];
    } else {
      const seguinte = h.inicios[etapas[i + 1].id];
      // Sem início na seguinte, fica o fim que já estava (histórico antigo).
      fim = seguinte ? vespera(seguinte) : h.fins[etapa.id];
    }
    if (fim && fim < inicio) fim = null; // seguinte antes desta: sem fim até acertar as datas
    await client.query(
      `UPDATE centro_custo_etapas_historico SET data_fim = $4
        WHERE empresa_id = $1 AND sienge_id = $2 AND mascara_item_id = $3 AND data_fim IS DISTINCT FROM $4::date`,
      [empresaId, siengeId, etapa.id, fim ?? null]
    );
  }

  const final = (await historicoPorCentro(empresaId, siengeId, client)).get(siengeId);
  return { sienge_id: siengeId, ...cronogramaDoCentro(final, etapas) };
}

module.exports = { list, aplicarDatas, historicoPorCentro, cronogramaDoCentro };
