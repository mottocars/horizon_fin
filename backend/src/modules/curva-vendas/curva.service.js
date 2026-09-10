const pool = require('../../config/db');
const periodosService = require('../periodos/periodos.service');

function round2(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function chave(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function gerarEixoMeses(inicio, fim) {
  const meses = [];
  let ano = inicio.ano;
  let mes = inicio.mes;
  while (ano < fim.ano || (ano === fim.ano && mes <= fim.mes)) {
    meses.push({ ano, mes });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return meses;
}

function mesAtualChave() {
  const hoje = new Date();
  return chave(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1);
}

async function listCentros(empresaId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT c.sienge_id, c.name
     FROM centros_custo_sienge c
     JOIN centro_custo_etapas_historico hl
       ON hl.sienge_id = c.sienge_id AND hl.empresa_id = c.empresa_id AND hl.data_inicio IS NOT NULL
     JOIN mascara_itens ml
       ON ml.id = hl.mascara_item_id AND ml.tipo = 'ETAPAS_CENTRO_CUSTO' AND ml.descricao = 'Lançamento'
     JOIN centro_custo_etapas_historico he
       ON he.sienge_id = c.sienge_id AND he.empresa_id = c.empresa_id AND he.data_fim IS NOT NULL
     JOIN mascara_itens me
       ON me.id = he.mascara_item_id AND me.tipo = 'ETAPAS_CENTRO_CUSTO' AND me.descricao = 'Entrega'
     WHERE c.empresa_id = $1
     ORDER BY c.name ASC`,
    [empresaId]
  );
  return rows;
}

async function getCurva(empresaId, siengeId) {
  const { rows: centroRows } = await pool.query(
    'SELECT sienge_id, name FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, siengeId]
  );
  const centro = centroRows[0];
  if (!centro) {
    const err = new Error('Centro de custo não encontrado.');
    err.status = 404;
    err.expose = true;
    throw err;
  }

  const { rows: etapaRows } = await pool.query(
    `SELECT
       (SELECT MIN(h.data_inicio) FROM centro_custo_etapas_historico h
          JOIN mascara_itens m ON m.id = h.mascara_item_id
          WHERE m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.empresa_id = $1 AND m.descricao = 'Lançamento'
            AND h.empresa_id = $1 AND h.sienge_id = $2) AS data_inicio_lancamento,
       (SELECT MAX(h.data_fim) FROM centro_custo_etapas_historico h
          JOIN mascara_itens m ON m.id = h.mascara_item_id
          WHERE m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.empresa_id = $1 AND m.descricao = 'Entrega'
            AND h.empresa_id = $1 AND h.sienge_id = $2) AS data_fim_entrega`,
    [empresaId, siengeId]
  );
  const dataInicioLancamento = etapaRows[0]?.data_inicio_lancamento || null;
  const dataFimEntrega = etapaRows[0]?.data_fim_entrega || null;

  if (!dataInicioLancamento || !dataFimEntrega) {
    return {
      vinculado: false,
      motivo: 'Este centro de custo não tem range de Lançamento até Entrega cadastrado em Histórico de Etapas.',
    };
  }

  const { rows: vgvRows } = await pool.query(
    `SELECT SUM(COALESCE(contract_sale_value, sale_value_price, 0)) AS vgv_total
     FROM unidades_sienge
     WHERE empresa_id = $1 AND enterprise_id = $2`,
    [empresaId, siengeId]
  );
  const vgvTotal = round2(Number(vgvRows[0]?.vgv_total || 0));

  // Total de unidades do centro de custo (independente do status atual) —
  // é o "100%" usado como ponto de partida do histórico: antes de qualquer
  // venda, nenhum mês teve unidade vendida, então o número disponível
  // daquele mês é o total do centro.
  const { rows: totalUnidadesRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM unidades_sienge WHERE empresa_id = $1 AND enterprise_id = $2`,
    [empresaId, siengeId]
  );
  const totalUnidadesCentro = totalUnidadesRows[0]?.total || 0;

  // Unidades já reservadas para o Previsto de algum mês (escolhidas na janela
  // de unidades disponíveis) — uma unidade só pode estar alocada a um mês.
  const { rows: alocacoesRows } = await pool.query(
    `SELECT ano, mes, sienge_unit_id FROM curva_vendas_previsto_unidades
     WHERE empresa_id = $1 AND sienge_id = $2`,
    [empresaId, siengeId]
  );
  const alocadoPorMes = new Map();
  for (const row of alocacoesRows) {
    const k = chave(row.ano, row.mes);
    if (!alocadoPorMes.has(k)) alocadoPorMes.set(k, 0);
    alocadoPorMes.set(k, alocadoPorMes.get(k) + 1);
  }
  const totalAlocado = alocacoesRows.length;

  // Cada linha de unidades_sienge que tem contract_date é exatamente a
  // unidade vendida naquele contrato — então, ao somar o valor do contrato
  // por mês, também sabemos quantas (e quais) unidades venderam naquele mês.
  const { rows: contratosRows } = await pool.query(
    `SELECT to_char(contract_date, 'YYYY-MM') AS ano_mes,
            SUM(contract_sale_value) AS valor,
            COUNT(*)::int AS qtd_unidades
     FROM unidades_sienge
     WHERE empresa_id = $1 AND enterprise_id = $2
       AND contract_situation = 'Emitido' AND contract_date IS NOT NULL
     GROUP BY to_char(contract_date, 'YYYY-MM')`,
    [empresaId, siengeId]
  );
  const contratosPorMes = new Map();
  const unidadesVendidasPorMes = new Map();
  for (const row of contratosRows) {
    contratosPorMes.set(row.ano_mes, round2(Number(row.valor || 0)));
    unidadesVendidasPorMes.set(row.ano_mes, row.qtd_unidades);
  }

  const { rows: previstoRows } = await pool.query(
    `SELECT ano, mes, valor_previsto FROM curva_vendas_previsto_manual
     WHERE empresa_id = $1 AND sienge_id = $2`,
    [empresaId, siengeId]
  );
  const previstoPorMes = new Map();
  for (const row of previstoRows) {
    previstoPorMes.set(chave(row.ano, row.mes), round2(Number(row.valor_previsto)));
  }

  const inicio = { ano: new Date(dataInicioLancamento).getUTCFullYear(), mes: new Date(dataInicioLancamento).getUTCMonth() + 1 };
  const fim = { ano: new Date(dataFimEntrega).getUTCFullYear(), mes: new Date(dataFimEntrega).getUTCMonth() + 1 };
  const eixo = gerarEixoMeses(inicio, fim);

  const chaveMesAtual = mesAtualChave();

  const dentroDoPeriodoAberto = await periodosService.estaDentroDoPeriodoAberto(empresaId);

  let acumulado = 0;
  let unidadesVendidasAcumulado = 0;
  const curva = eixo.map(({ ano, mes }) => {
    const valorContrato = contratosPorMes.get(chave(ano, mes)) || 0;
    acumulado += valorContrato;
    const realizado = vgvTotal > 0 ? round2((acumulado / vgvTotal) * 100) : 0;

    // Mês passado: já aconteceu, mostra o realizado (vendidas), nunca editável.
    // Previsto só pode ser ajustado manualmente a partir do mês atual
    // (inclusive) em diante, e somente enquanto a data de hoje estiver dentro
    // do range do período aberto da empresa (o range delimita QUANDO se pode
    // editar, não quais meses ficam abertos).
    const passado = chave(ano, mes) < chaveMesAtual;
    const previstoBloqueado = passado || !dentroDoPeriodoAberto;
    const previsto = previstoPorMes.get(chave(ano, mes)) ?? 0;

    const unidadesVendidasNoMes = unidadesVendidasPorMes.get(chave(ano, mes)) || 0;
    unidadesVendidasAcumulado += unidadesVendidasNoMes;

    // Disponíveis (só faz sentido no mês atual/futuro): total do centro,
    // menos as unidades já vendidas (contrato Emitido) até aquele mês, menos
    // as que já estão reservadas para OUTROS meses do Previsto (as
    // reservadas para este mesmo mês continuam contando nele).
    const baseDisponivel = totalUnidadesCentro - unidadesVendidasAcumulado;
    const alocadasNesteMes = alocadoPorMes.get(chave(ano, mes)) || 0;
    const unidadesDisponiveisCount = baseDisponivel - (totalAlocado - alocadasNesteMes);

    return {
      ano,
      mes,
      valorContrato,
      previsto,
      previstoBloqueado,
      passado,
      realizado,
      // Mês passado mostra quantas unidades venderam NAQUELE mês; mês atual
      // ou futuro (editável ou não) mostra quantas ainda estão disponíveis.
      unidadesCount: passado ? unidadesVendidasNoMes : unidadesDisponiveisCount,
    };
  });

  return {
    vinculado: true,
    centro: { sienge_id: centro.sienge_id, name: centro.name },
    dataInicioLancamento,
    dataFimEntrega,
    vgvTotal,
    curva,
  };
}

async function listUnidadesDisponiveis(empresaId, siengeId, ano, mes) {
  // Só entram unidades com status Disponível (D) ou Reserva Técnica (R) —
  // unidades Vendidas (V) não aparecem mais aqui. Só marca como
  // "selecionável" quem não está reservada para OUTRO mês do Previsto.
  const { rows } = await pool.query(
    `SELECT u.sienge_unit_id, u.name, u.floor, u.property_type, u.commercial_stock,
            COALESCE(u.contract_sale_value, u.sale_value_price, 0) AS valor,
            EXISTS (
              SELECT 1 FROM curva_vendas_previsto_unidades a
              WHERE a.empresa_id = u.empresa_id AND a.sienge_id = u.enterprise_id
                AND a.sienge_unit_id = u.sienge_unit_id AND a.ano = $3 AND a.mes = $4
            ) AS alocada_neste_mes,
            EXISTS (
              SELECT 1 FROM curva_vendas_previsto_unidades a2
              WHERE a2.empresa_id = u.empresa_id AND a2.sienge_id = u.enterprise_id
                AND a2.sienge_unit_id = u.sienge_unit_id
                AND NOT (a2.ano = $3 AND a2.mes = $4)
            ) AS alocada_em_outro_mes
     FROM unidades_sienge u
     WHERE u.empresa_id = $1 AND u.enterprise_id = $2 AND u.commercial_stock IN ('D', 'R')
     ORDER BY u.name ASC`,
    [empresaId, siengeId, ano, mes]
  );
  return rows.map((r) => ({
    ...r,
    selecionavel: !r.alocada_em_outro_mes,
  }));
}

async function listUnidadesVendidasNoMes(empresaId, siengeId, ano, mes) {
  const { rows } = await pool.query(
    `SELECT sienge_unit_id, name, floor, property_type, commercial_stock,
            COALESCE(contract_sale_value, sale_value_price, 0) AS valor
     FROM unidades_sienge
     WHERE empresa_id = $1 AND enterprise_id = $2
       AND contract_situation = 'Emitido'
       AND to_char(contract_date, 'YYYY-MM') = $3
     ORDER BY name ASC`,
    [empresaId, siengeId, chave(ano, mes)]
  );
  return rows;
}

async function validarMesEditavel(empresaId, ano, mes) {
  if (chave(ano, mes) < mesAtualChave()) {
    const err = new Error('Só é possível ajustar o previsto a partir do mês atual.');
    err.status = 400;
    err.expose = true;
    throw err;
  }

  const dentroDoPeriodoAberto = await periodosService.estaDentroDoPeriodoAberto(empresaId);
  if (!dentroDoPeriodoAberto) {
    const err = new Error('Só é possível editar enquanto a data de hoje estiver dentro do período aberto da empresa.');
    err.status = 400;
    err.expose = true;
    throw err;
  }
}

async function salvarPrevisto(empresaId, siengeId, { ano, mes, valorPrevisto }, usuarioId) {
  await validarMesEditavel(empresaId, ano, mes);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Ajuste manual do valor libera as unidades que estavam reservadas para
    // este mês (elas voltam a ficar disponíveis para outros meses).
    await client.query(
      'DELETE FROM curva_vendas_previsto_unidades WHERE empresa_id = $1 AND sienge_id = $2 AND ano = $3 AND mes = $4',
      [empresaId, siengeId, ano, mes]
    );
    await client.query(
      `INSERT INTO curva_vendas_previsto_manual (empresa_id, sienge_id, ano, mes, valor_previsto, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (empresa_id, sienge_id, ano, mes)
       DO UPDATE SET valor_previsto = EXCLUDED.valor_previsto, usuario_id = EXCLUDED.usuario_id, atualizado_em = NOW()`,
      [empresaId, siengeId, ano, mes, valorPrevisto, usuarioId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function salvarPrevistoPorUnidades(empresaId, siengeId, { ano, mes, unitIds }, usuarioId) {
  await validarMesEditavel(empresaId, ano, mes);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      'DELETE FROM curva_vendas_previsto_unidades WHERE empresa_id = $1 AND sienge_id = $2 AND ano = $3 AND mes = $4',
      [empresaId, siengeId, ano, mes]
    );

    let valorPrevisto = 0;
    if (unitIds.length > 0) {
      for (const unitId of unitIds) {
        await client.query(
          `INSERT INTO curva_vendas_previsto_unidades (empresa_id, sienge_id, ano, mes, sienge_unit_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [empresaId, siengeId, ano, mes, unitId]
        );
      }

      const { rows: somaRows } = await client.query(
        `SELECT SUM(COALESCE(contract_sale_value, sale_value_price, 0)) AS soma
         FROM unidades_sienge
         WHERE empresa_id = $1 AND enterprise_id = $2 AND sienge_unit_id = ANY($3::bigint[])`,
        [empresaId, siengeId, unitIds]
      );
      valorPrevisto = round2(Number(somaRows[0]?.soma || 0));
    }

    await client.query(
      `INSERT INTO curva_vendas_previsto_manual (empresa_id, sienge_id, ano, mes, valor_previsto, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (empresa_id, sienge_id, ano, mes)
       DO UPDATE SET valor_previsto = EXCLUDED.valor_previsto, usuario_id = EXCLUDED.usuario_id, atualizado_em = NOW()`,
      [empresaId, siengeId, ano, mes, valorPrevisto, usuarioId]
    );

    await client.query('COMMIT');
    return { valorPrevisto };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listCentros,
  getCurva,
  salvarPrevisto,
  listUnidadesDisponiveis,
  listUnidadesVendidasNoMes,
  salvarPrevistoPorUnidades,
};
