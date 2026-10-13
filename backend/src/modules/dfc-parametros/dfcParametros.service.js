const pool = require('../../config/db');

const CAMPOS = [
  'cto',
  'valor_financiamento_pj',
  'numero_unidades',
  'ticket_medio_avaliacao_pf',
  'pct_coeficiente_garantia',
  'pct_amortizacao_pj',
  'data_demanda_minima',
  'taxa_juros_mes',
  'data_inicio_ciclo',
  'data_fim_ciclo',
  'qtd_vendas_mes',
  'tempo_assinatura_registro_meses',
];

// Parâmetros fixos (pedido do usuário): quando a obra tem Código Contrato Caixa (aba Centros
// Custos) e há DCD importado desse contrato (CIWEB / Portal das Construtoras), estes campos vêm
// do DCD — e o ticket médio vem do Geral dos Empreendimentos — e não podem ser editados.
const FIXOS_DO_DCD = {
  cto: 'valor_custo_obra', // Vr Custo Obra
  valor_financiamento_pj: 'valor_financiamento_pj', // Vr Financiamento (PJ)
  numero_unidades: 'quantidade_unidades', // Qtd Unidades
  data_demanda_minima: 'data_termino_suspensiva', // Dt Término Suspensiva
  data_inicio_ciclo: 'data_assinatura', // Data de Assinatura
  data_fim_ciclo: 'data_termino_obra_atual', // Dt Término Obra Atual
};
const CAMPOS_DATA = ['data_demanda_minima', 'data_inicio_ciclo', 'data_fim_ciclo'];

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

// NUMERIC chega do pg como texto ("1234.50"); DATE como 'AAAA-MM-DD' (ver config/db.js).
function normalizar(campo, valor) {
  if (valor === null || valor === undefined) return null;
  if (CAMPOS_DATA.includes(campo)) return String(valor).slice(0, 10);
  return Number(valor);
}

// Os valores fixos de uma obra, a partir do Contrato Caixa dela. Só vale com DCD importado do
// contrato (sem DCD, nada é fixo — nem o ticket médio). Campo sem valor no DCD continua editável.
// Ticket médio = média de "Valor de Financiamento" das unidades do Geral, sem o primeiro contrato
// por "Data de Assinatura do contrato" (é o contrato da própria construtora, de valor muito maior).
async function fonteFixos(empresaId, siengeId, db = pool) {
  const { rows: centro } = await db.query(
    'SELECT codigo_contrato_caixa FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2',
    [empresaId, siengeId]
  );
  const contrato = centro[0]?.codigo_contrato_caixa || null;
  const vazio = { contrato, dcd: null, geral: null, fixos: {}, origens: {} };
  if (!contrato) return vazio;

  const { rows: dcd } = await db.query(
    `SELECT nome_empreendimento, atualizado_em, ${Object.values(FIXOS_DO_DCD).join(', ')}
       FROM dcd_contratos WHERE empresa_id = $1 AND numero_contrato = $2`,
    [empresaId, contrato]
  );
  if (!dcd[0]) return vazio;

  const fixos = {};
  const origens = {};
  Object.entries(FIXOS_DO_DCD).forEach(([campo, coluna]) => {
    const v = normalizar(campo, dcd[0][coluna]);
    if (v !== null) {
      fixos[campo] = v;
      origens[campo] = 'DCD';
    }
  });

  const { rows: geral } = await db.query(
    `SELECT e.atualizado_em,
            (SELECT ROUND(AVG(x.valor_financiamento), 2)
               FROM (SELECT u.valor_financiamento,
                            ROW_NUMBER() OVER (ORDER BY u.data_assinatura_contrato ASC, u.id ASC) AS ordem
                       FROM extrato_unidades u
                      WHERE u.empresa_id = e.empresa_id
                        AND u.contrato_empreendimento = e.contrato_empreendimento
                        AND u.data_assinatura_contrato IS NOT NULL) x
              WHERE x.ordem > 1 AND x.valor_financiamento IS NOT NULL) AS ticket_medio
       FROM extrato_empreendimentos e
      WHERE e.empresa_id = $1 AND e.contrato_empreendimento = $2`,
    [empresaId, contrato]
  );
  if (geral[0]?.ticket_medio !== null && geral[0]?.ticket_medio !== undefined) {
    fixos.ticket_medio_avaliacao_pf = Number(geral[0].ticket_medio);
    origens.ticket_medio_avaliacao_pf = 'GERAL';
  }

  return {
    contrato,
    dcd: { nome_empreendimento: dcd[0].nome_empreendimento, atualizado_em: dcd[0].atualizado_em },
    geral: geral[0] ? { atualizado_em: geral[0].atualizado_em } : null,
    fixos,
    origens,
  };
}

// Obras da empresa que projetam DFC (na aba Centros Custos: Tipo = Obra e "Projeta DFC" marcado —
// pedido do usuário), pro filtro "Centro de Custo" e pro resumo da aba Parâmetros, com a versão
// vigente dos parâmetros de cada uma (null = nenhum parâmetro registrado ainda).
// `numero_unidades` do cadastro do centro serve de sugestão no primeiro preenchimento.
async function listCentros(empresaId) {
  const { rows } = await pool.query(
    `SELECT c.sienge_id, c.name, c.numero_unidades,
            v.versao AS versao_vigente, v.criado_em AS versao_criada_em
       FROM centros_custo_sienge c
       LEFT JOIN LATERAL (
         SELECT p.versao, p.criado_em FROM dfc_parametros_versoes p
          WHERE p.empresa_id = c.empresa_id AND p.sienge_id = c.sienge_id
          ORDER BY p.versao DESC
          LIMIT 1
       ) v ON TRUE
      WHERE c.empresa_id = $1 AND c.natureza = 'OBRA' AND c.projeta_dfc
      ORDER BY c.sienge_id::text ASC`,
    [empresaId]
  );
  return rows;
}

// Versões do empreendimento, mais recente primeiro — alimenta o combobox "Versão".
async function listVersoes(empresaId, siengeId) {
  const { rows } = await pool.query(
    `SELECT v.id, v.versao, v.origem, v.criado_em, u.nome AS criado_por_nome
       FROM dfc_parametros_versoes v
       LEFT JOIN usuarios u ON u.id = v.criado_por_usuario_id
      WHERE v.empresa_id = $1 AND v.sienge_id = $2
      ORDER BY v.versao DESC`,
    [empresaId, siengeId]
  );
  return rows;
}

async function getVersao(empresaId, siengeId, versao, db = pool) {
  const { rows } = await db.query(
    `SELECT v.id, v.empresa_id, v.sienge_id, v.versao, ${CAMPOS.map((c) => `v.${c}`).join(', ')},
            v.origem, v.criado_em, u.nome AS criado_por_nome
       FROM dfc_parametros_versoes v
       LEFT JOIN usuarios u ON u.id = v.criado_por_usuario_id
      WHERE v.empresa_id = $1 AND v.sienge_id = $2 AND v.versao = $3`,
    [empresaId, siengeId, versao]
  );
  return rows[0] || null;
}

// Cria a próxima versão do empreendimento (MAX(versao) + 1 — nunca sobrescreve), mesmo esquema
// de motorRisco.service.js::criarVersao — mas, diferente de lá, recusa uma versão idêntica à
// vigente. Os campos fixos (fonteFixos) sempre saem do DCD/Geral, não do que veio da tela — é o
// que garante que não dá pra editá-los nem batendo direto na API.
async function criarVersao(empresaId, siengeId, usuarioId, dadosRecebidos, origem = 'MANUAL') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Trava o centro de custo: confere que ele é da empresa e serializa duas gravações
    // simultâneas do mesmo empreendimento (nunca duas linhas com o mesmo número de versão).
    const { rows: centro } = await client.query(
      'SELECT natureza, projeta_dfc FROM centros_custo_sienge WHERE empresa_id = $1 AND sienge_id = $2 FOR UPDATE',
      [empresaId, siengeId]
    );
    if (!centro[0]) throw erro(404, 'Centro de custo não encontrado nesta empresa.');
    if (centro[0].natureza !== 'OBRA' || !centro[0].projeta_dfc) {
      throw erro(400, 'Parâmetros só para centros de custo do tipo Obra com "Projeta DFC" marcado (aba Centros Custos).');
    }

    const { fixos } = await fonteFixos(empresaId, siengeId, client);
    const dados = { ...dadosRecebidos, ...fixos };
    if (dados.data_fim_ciclo <= dados.data_inicio_ciclo) {
      throw erro(400, 'A Data Fim do Ciclo precisa ser depois da Data Início do Ciclo.');
    }

    const { rows: maxRows } = await client.query(
      'SELECT COALESCE(MAX(versao), 0) + 1 AS proxima FROM dfc_parametros_versoes WHERE empresa_id = $1 AND sienge_id = $2',
      [empresaId, siengeId]
    );
    const proxima = maxRows[0].proxima;

    // Só gera versão nova se algum parâmetro mudou em relação à vigente (pedido do usuário).
    if (proxima > 1) {
      const vigente = await getVersao(empresaId, siengeId, proxima - 1, client);
      const igual = CAMPOS.every((c) => normalizar(c, dados[c]) === normalizar(c, vigente[c]));
      if (igual) throw erro(409, 'Nenhum parâmetro foi alterado em relação à versão vigente.');
    }

    await client.query(
      `INSERT INTO dfc_parametros_versoes (empresa_id, sienge_id, versao, ${CAMPOS.join(', ')}, origem, criado_por_usuario_id)
       VALUES ($1, $2, $3, ${CAMPOS.map((_, i) => `$${i + 4}`).join(', ')}, $${CAMPOS.length + 4}, $${CAMPOS.length + 5})`,
      [empresaId, siengeId, proxima, ...CAMPOS.map((c) => dados[c]), origem, usuarioId]
    );

    const criada = await getVersao(empresaId, siengeId, proxima, client);
    await client.query('COMMIT');
    return criada;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Chamado depois de importar um DCD ou um Geral (dcd.controller.js / extrato.controller.js):
// cada obra com esse Contrato Caixa que já tem parâmetros ganha uma versão nova — os campos
// editáveis copiados da vigente, os fixos atualizados pelo arquivo novo (pedido do usuário).
// Obra ainda sem nenhuma versão fica de fora (os editáveis estariam em branco): o usuário
// preenche e publica a primeira na tela, já com os fixos vindos do arquivo. Nunca derruba a
// importação — erro aqui só vai pro log.
async function versionarPorImportacao(empresaId, contratos, usuarioId, origem) {
  const lista = [...new Set((contratos || []).filter(Boolean).map(String))];
  if (lista.length === 0) return [];
  const criadas = [];
  try {
    const { rows: obras } = await pool.query(
      `SELECT c.sienge_id, MAX(p.versao) AS vigente
         FROM centros_custo_sienge c
         JOIN dfc_parametros_versoes p ON p.empresa_id = c.empresa_id AND p.sienge_id = c.sienge_id
        WHERE c.empresa_id = $1 AND c.codigo_contrato_caixa = ANY($2::text[])
          AND c.natureza = 'OBRA' AND c.projeta_dfc
        GROUP BY c.sienge_id`,
      [empresaId, lista]
    );
    for (const obra of obras) {
      const vigente = await getVersao(empresaId, obra.sienge_id, obra.vigente);
      const dados = Object.fromEntries(CAMPOS.map((c) => [c, normalizar(c, vigente[c])]));
      try {
        const nova = await criarVersao(empresaId, obra.sienge_id, usuarioId, dados, origem);
        criadas.push({ sienge_id: obra.sienge_id, versao: nova.versao });
      } catch (err) {
        // 409 = o arquivo novo não mudou nenhum valor fixo — nada a versionar.
        if (err.status !== 409) {
          console.error(`[dfc-parametros] versão automática (${origem}) do centro ${obra.sienge_id} falhou:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error(`[dfc-parametros] versionamento automático (${origem}) falhou:`, err.message);
  }
  return criadas;
}

module.exports = {
  listCentros,
  listVersoes,
  getVersao,
  criarVersao,
  fonteFixos,
  versionarPorImportacao,
};
