const pool = require('../../config/db');
const etapasService = require('../etapas-centro-custo/etapasCentroCusto.service');

// O cronograma de cada obra É o Histórico de Etapas do centro de custo (centro_custo_etapas_historico
// — pedido do usuário): uma linha por etapa da máscara Etapas do Centro de Custo, com data_inicio e
// data_fim. Editado na aba Centros de Custos de Cronogramas Obras e na aba Histórico de Etapas do
// cadastro do centro (Cadastros > Centros de Custos) — as duas gravam por updateDatas.
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

// As etapas da empresa (máscara Etapas do Centro de Custo, na ordem) e todos os centros de custo
// dela — mesma lista e ordem da aba Centros Custos da DFC (dfcCentros.service.js) —, cada um com o
// Tipo e o cronograma.
async function list(empresaId) {
  const etapas = await etapasService.list(empresaId);
  const { rows: centros } = await pool.query(
    `SELECT sienge_id, name, apelido, status, natureza FROM centros_custo_sienge
      WHERE empresa_id = $1
      ORDER BY sienge_id::text ASC`,
    [empresaId]
  );
  const historico = await historicoPorCentro(empresaId);
  return { etapas, centros: centros.map((c) => ({ ...c, ...cronogramaDoCentro(historico.get(c.sienge_id), etapas) })) };
}

// Tipo do centro — a MESMA coluna da aba Centros Custos da DFC e do cadastro do centro de custo:
// mudar aqui muda lá. Só o Tipo (o resto da classificação da DFC não é desta tela).
async function updateNatureza(empresaId, siengeId, natureza) {
  const { rows } = await pool.query(
    `UPDATE centros_custo_sienge SET natureza = $3
      WHERE empresa_id = $1 AND sienge_id = $2
      RETURNING sienge_id, natureza`,
    [empresaId, siengeId, natureza]
  );
  return rows[0] || null;
}

// Grava os inícios que mudaram (data null apaga a etapa do histórico) e, se veio, o término (fim da
// última etapa). Depois recalcula a data_fim só das etapas vizinhas ao que mudou — a anterior e a
// própria —, pra não mexer no resto do histórico. Devolve o cronograma do centro como ficou.
async function updateDatas(empresaId, siengeId, { datas, dataTermino }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
    await client.query('COMMIT');
    return { sienge_id: siengeId, ...cronogramaDoCentro(final, etapas) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { list, updateNatureza, updateDatas };
