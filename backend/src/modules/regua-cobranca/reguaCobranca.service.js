const pool = require('../../config/db');

const CLUSTERS_VALIDOS = ['novo', 'bom', 'duvidoso', 'mau', 'inad'];

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// Mesma leitura que cobrancaClusters.service.js::getVersaoVigente faz (maior
// `versao` da empresa), só que aqui só interessa o parâmetro que delimita a
// régua — os outros campos (tolerância, janela, cortes etc.) não têm nada a
// ver com régua de cobrança.
async function getLimiteVigente(empresaId) {
  const { rows } = await pool.query(
    `SELECT dias_vencidos_regua_cobranca FROM motor_risco_versoes
     WHERE empresa_id = $1 ORDER BY versao DESC LIMIT 1`,
    [empresaId]
  );
  if (!rows[0]) {
    throw badRequest('Configure e publique uma versão do Motor de Risco desta empresa antes de configurar a régua de cobrança.');
  }
  return rows[0].dias_vencidos_regua_cobranca;
}

// Os 4 clusters do score cobrem de D-90 até a própria fronteira (inclusive);
// a régua de Inadimplência começa só no dia seguinte a ela, até D+365 — tem
// que bater exatamente com a regra de classificação de verdade (ver
// gestao-parcelas.service.js/rotinas.service.js: `diasSigned > limite ?
// 'inad' : clusterCliente`, sempre com `>` estrito). Uma parcela no dia
// exato da fronteira ainda pertence ao cluster de score do cliente, nunca
// à Inadimplência — por isso o limite superior do score inclui `limite` e o
// inferior da Inadimplência começa em `limite + 1`, não em `limite`.
function limitesDias(cluster, limite) {
  return cluster === 'inad' ? { min: limite + 1, max: 365 } : { min: -90, max: limite };
}

function clamp(valor, min, max) {
  return Math.max(min, Math.min(max, Math.round(valor)));
}

const SELECT_ETAPA = `
  SELECT e.id, e.empresa_id, e.cluster, e.nome, e.dias, e.canal_whatsapp, e.canal_email, e.canal_ligacao,
         e.template_id, t.nome AS template_nome, e.responsavel_usuario_id, u.nome AS responsavel_nome,
         e.ativa, e.rotina_habilitada, e.criado_em, e.atualizado_em
  FROM regua_cobranca_etapas e
  LEFT JOIN usuarios u ON u.id = e.responsavel_usuario_id
  LEFT JOIN comunicacao_templates t ON t.id = e.template_id
`;

async function listEtapas(empresaId, cluster) {
  const { rows } = await pool.query(
    `${SELECT_ETAPA} WHERE e.empresa_id = $1 AND e.cluster = $2 ORDER BY e.dias ASC, e.id ASC`,
    [empresaId, cluster]
  );
  return rows;
}

// Versão enxuta de listEtapas — só id/nome/dias, sem os LEFT JOINs de
// usuário/template (desnecessários aqui) — usada por gestao-parcelas para
// achar em qual etapa cada parcela cai (ver
// gestaoParcelas.service.js::buscarLinhasClassificadas). Só etapas ativas E
// com `dias` já preenchido entram na conta: uma etapa inativa ou ainda em
// branco não tem faixa nenhuma pra "possuir" um dia (mesmo critério do
// faixaAtiva do frontend, ver ReguaCobranca/constantes.js).
async function listEtapasAtivasPorCluster(empresaId, cluster) {
  const { rows } = await pool.query(
    `SELECT id, nome, dias FROM regua_cobranca_etapas
     WHERE empresa_id = $1 AND cluster = $2 AND ativa = true AND dias IS NOT NULL
     ORDER BY dias ASC`,
    [empresaId, cluster]
  );
  return rows;
}

// Mesmo escopo de listEtapasAtivasPorCluster (só ativas, com `dias`
// preenchido), mas trazendo também o responsável, os canais configurados e
// o template vinculado — usada por gestao-parcelas pra mostrar, ao lado do
// nome de cada etapa, quem responde por ela, por qual canal ela dispara e
// permitir pré-visualizar a mensagem de verdade (ver
// GestaoParcelas/GestaoParcelasTab.jsx).
async function listEtapasComComunicacao(empresaId, cluster) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nome, e.dias, e.canal_whatsapp, e.canal_email, e.canal_ligacao,
            e.responsavel_usuario_id, u.nome AS responsavel_nome,
            t.id AS template_id, t.nome AS template_nome, t.assunto AS template_assunto,
            t.corpo AS template_corpo, t.enviar_boleto AS template_enviar_boleto
     FROM regua_cobranca_etapas e
     LEFT JOIN usuarios u ON u.id = e.responsavel_usuario_id
     LEFT JOIN comunicacao_templates t ON t.id = e.template_id
     WHERE e.empresa_id = $1 AND e.cluster = $2 AND e.ativa = true AND e.dias IS NOT NULL
     ORDER BY e.dias ASC`,
    [empresaId, cluster]
  );
  return rows;
}

// Resumo pra carregar a tela toda numa chamada só: a fronteira vigente, a
// contagem de etapas ativas por cluster (pro badge de cada aba) e o maior
// "dias" já registrado na régua de Inadimplência — é o que define até onde
// o desenho da régua vai (ver ReguaVisual.jsx no frontend: a régua de
// inadimplência sempre aparece no desenho dos outros clusters, indo até 10
// dias além dessa última etapa).
async function getResumo(empresaId) {
  const limite = await getLimiteVigente(empresaId);

  const { rows } = await pool.query(
    `SELECT cluster, COUNT(*) FILTER (WHERE ativa)::int AS total_ativas
     FROM regua_cobranca_etapas WHERE empresa_id = $1 GROUP BY cluster`,
    [empresaId]
  );
  const contagemPorCluster = { novo: 0, bom: 0, duvidoso: 0, mau: 0, inad: 0 };
  for (const row of rows) contagemPorCluster[row.cluster] = row.total_ativas;

  const { rows: maiorInadRows } = await pool.query(
    `SELECT MAX(dias) AS maior FROM regua_cobranca_etapas WHERE empresa_id = $1 AND cluster = 'inad'`,
    [empresaId]
  );
  const maiorDiaInad = maiorInadRows[0].maior;

  return {
    limite,
    contagem_por_cluster: contagemPorCluster,
    maior_dia_inad: maiorDiaInad == null ? null : Number(maiorDiaInad),
  };
}

// Governança: só pode ser responsável por uma etapa quem tem a empresa da
// régua registrada no cadastro (usuarios_empresas) — e nunca um usuário
// Master (acesso total a tudo, não é "o responsável" de nada específico).
// Validado aqui, não só escondido no combobox do front (ver
// listResponsaveis abaixo) — uma chamada direta à API não pode contornar a
// regra.
async function garantirResponsavelElegivel(empresaId, responsavelUsuarioId) {
  if (!responsavelUsuarioId) return;
  const { rows } = await pool.query(
    `SELECT 1 FROM usuarios u
     JOIN usuarios_empresas ue ON ue.usuario_id = u.id
     WHERE u.id = $1 AND ue.empresa_id = $2 AND u.permissao <> 'MASTER'`,
    [responsavelUsuarioId, empresaId]
  );
  if (rows.length === 0) {
    throw badRequest('O responsável precisa ser um usuário (não Master) com esta empresa registrada no cadastro.');
  }
}

// Governança equivalente pro Template: só pode ser escolhido um template da
// biblioteca de Comunicação (aba própria) que seja desta empresa E que
// tenha este cluster marcado em `clusters` — do contrário a etapa estaria
// disparando uma mensagem que a régua desse cluster nem deveria oferecer.
// Validado aqui (não só no combobox do front, que já filtra por cluster em
// EtapasTabela.jsx) pelo mesmo motivo de garantirResponsavelElegivel: uma
// chamada direta à API não pode contornar a regra.
async function garantirTemplateElegivel(empresaId, cluster, templateId) {
  if (!templateId) return;
  const { rows } = await pool.query(
    `SELECT 1 FROM comunicacao_templates
     WHERE id = $1 AND empresa_id = $2 AND $3 = ANY(clusters)`,
    [templateId, empresaId, cluster]
  );
  if (rows.length === 0) {
    throw badRequest('O template precisa ser desta empresa e estar autorizado para este cluster.');
  }
}

// Usuários elegíveis pra serem responsáveis por uma etapa desta empresa —
// mesma regra de garantirResponsavelElegivel acima, usada pra popular o
// combobox "Responsável".
// `apenasAtribuidos` restringe a quem tem de fato uma rotina pra mostrar —
// é o filtro "Responsável" da aba Rotinas (Gestão de Cobranças): no modo
// "Responsável por etapa", quem está registrado como responsável em alguma
// etapa; na "Distribuição automática", quem é atendente da distribuição ou
// já recebeu clientes nela (pra continuar dando pra ver o histórico de quem
// saiu). Ver distribuicao.service.js.
async function listResponsaveis(empresaId, { apenasAtribuidos = false } = {}) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome FROM usuarios u
     JOIN usuarios_empresas ue ON ue.usuario_id = u.id
     WHERE ue.empresa_id = $1 AND u.permissao <> 'MASTER' AND u.ativo = TRUE
       AND ($2::boolean = FALSE OR (
         CASE WHEN COALESCE((SELECT modo FROM regua_cobranca_distribuicao_config WHERE empresa_id = $1), 'etapa') = 'automatica'
         THEN EXISTS (SELECT 1 FROM regua_cobranca_distribuicao_participantes p WHERE p.empresa_id = $1 AND p.usuario_id = u.id)
           OR EXISTS (SELECT 1 FROM regua_cobranca_distribuicao_itens d WHERE d.empresa_id = $1 AND d.usuario_id = u.id)
         ELSE EXISTS (SELECT 1 FROM regua_cobranca_etapas e WHERE e.empresa_id = $1 AND e.responsavel_usuario_id = u.id)
         END
       ))
     ORDER BY u.nome ASC`,
    [empresaId, apenasAtribuidos]
  );
  return rows;
}

// Nasce em branco (nome, dias, template, responsável) e inativa — o
// usuário preenche e liga a etapa quando decidir que ela está pronta (ver
// EtapasTabela.jsx: esses 4 campos ficam em âmbar enquanto vazios, igual
// ao Motor de Risco, e viram azul assim que preenchidos). Sem sugestão
// automática de `dias` (o protótipo chutava um valor, última etapa + 5) —
// preenchia a etapa "por baixo dos panos" e a pessoa podia nem perceber
// que já tinha configurado algo sem querer, contradizendo o "sempre em
// branco" pedido.
async function criarEtapa(empresaId, cluster, dados = {}) {
  await garantirResponsavelElegivel(empresaId, dados.responsavel_usuario_id);
  await garantirTemplateElegivel(empresaId, cluster, dados.template_id);

  let dias = null;
  if (dados.dias !== undefined && dados.dias !== null) {
    const limite = await getLimiteVigente(empresaId);
    const lim = limitesDias(cluster, limite);
    dias = clamp(dados.dias, lim.min, lim.max);
  }

  const { rows } = await pool.query(
    `INSERT INTO regua_cobranca_etapas
       (empresa_id, cluster, nome, dias, canal_whatsapp, canal_email, canal_ligacao, template_id, responsavel_usuario_id, ativa, rotina_habilitada)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      empresaId,
      cluster,
      dados.nome ?? '',
      dias,
      dados.canal_whatsapp ?? true,
      dados.canal_email ?? false,
      dados.canal_ligacao ?? false,
      dados.template_id || null,
      dados.responsavel_usuario_id || null,
      dados.ativa ?? false,
      dados.rotina_habilitada ?? false,
    ]
  );

  const { rows: criada } = await pool.query(`${SELECT_ETAPA} WHERE e.id = $1`, [rows[0].id]);
  return criada[0];
}

const CAMPOS_ATUALIZAVEIS = {
  nome: 'nome',
  dias: 'dias',
  canal_whatsapp: 'canal_whatsapp',
  canal_email: 'canal_email',
  canal_ligacao: 'canal_ligacao',
  template_id: 'template_id',
  responsavel_usuario_id: 'responsavel_usuario_id',
  ativa: 'ativa',
  rotina_habilitada: 'rotina_habilitada',
};

async function atualizarEtapa(id, dados = {}) {
  const { rows: existentes } = await pool.query(
    'SELECT empresa_id, cluster FROM regua_cobranca_etapas WHERE id = $1',
    [id]
  );
  const etapa = existentes[0];
  if (!etapa) return null;

  const campos = [];
  const params = [];

  if (dados.dias !== undefined) {
    if (dados.dias === null) {
      // Campo limpo de volta pro estado "em branco" (âmbar) — não existe
      // um "dia clampado" pra ausência de valor, só grava NULL mesmo.
      params.push(null);
    } else {
      const limite = await getLimiteVigente(etapa.empresa_id);
      const lim = limitesDias(etapa.cluster, limite);
      params.push(clamp(dados.dias, lim.min, lim.max));
    }
    campos.push(`dias = $${params.length}`);
  }
  if (dados.responsavel_usuario_id !== undefined) {
    await garantirResponsavelElegivel(etapa.empresa_id, dados.responsavel_usuario_id);
  }
  if (dados.template_id !== undefined) {
    await garantirTemplateElegivel(etapa.empresa_id, etapa.cluster, dados.template_id);
  }
  for (const [chave, coluna] of Object.entries(CAMPOS_ATUALIZAVEIS)) {
    if (chave === 'dias' || dados[chave] === undefined) continue;
    params.push(chave === 'nome' ? dados[chave] || 'Nova etapa' : dados[chave]);
    campos.push(`${coluna} = $${params.length}`);
  }
  if (campos.length === 0) {
    const { rows } = await pool.query(`${SELECT_ETAPA} WHERE e.id = $1`, [id]);
    return rows[0] || null;
  }

  params.push(id);
  await pool.query(`UPDATE regua_cobranca_etapas SET ${campos.join(', ')} WHERE id = $${params.length}`, params);

  const { rows } = await pool.query(`${SELECT_ETAPA} WHERE e.id = $1`, [id]);
  return rows[0] || null;
}

async function removerEtapa(id) {
  const { rowCount } = await pool.query('DELETE FROM regua_cobranca_etapas WHERE id = $1', [id]);
  return rowCount > 0;
}

// Parâmetros de disparo diário — 1 por empresa+cluster: horário + qual
// conexão Z-API e qual conexão de e-mail disparam as mensagens deste
// cluster (ver ConfiguracoesGlobaisPainel.jsx). Sem linha = 09:00 e nenhuma
// conexão selecionada. `pg` devolve TIME como string "HH:MM:SS"; corta pros
// 5 primeiros caracteres porque o campo (e o <input type="time">) só
// trabalha com HH:MM, sem segundos. Sempre retorna os 5 clusters, mesmo
// sem linha gravada pra algum deles, pra tabela da modal nunca ficar com
// buraco.
async function listParametrosDisparo(empresaId) {
  const { rows } = await pool.query(
    `SELECT cluster, horario, zapi_integracao_id, email_integracao_id
     FROM regua_cobranca_horario_disparo WHERE empresa_id = $1`,
    [empresaId]
  );
  const porCluster = Object.fromEntries(rows.map((r) => [r.cluster, r]));
  return CLUSTERS_VALIDOS.map((cluster) => {
    const r = porCluster[cluster];
    return {
      cluster,
      horario: r ? r.horario.slice(0, 5) : '09:00',
      zapi_integracao_id: r?.zapi_integracao_id ?? null,
      email_integracao_id: r?.email_integracao_id ?? null,
    };
  });
}

async function salvarParametroDisparo(empresaId, cluster, dados) {
  await pool.query(
    `INSERT INTO regua_cobranca_horario_disparo (empresa_id, cluster, horario, zapi_integracao_id, email_integracao_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (empresa_id, cluster) DO UPDATE SET
       horario = EXCLUDED.horario,
       zapi_integracao_id = EXCLUDED.zapi_integracao_id,
       email_integracao_id = EXCLUDED.email_integracao_id,
       atualizado_em = NOW()`,
    [empresaId, cluster, dados.horario, dados.zapi_integracao_id ?? null, dados.email_integracao_id ?? null]
  );
  const parametros = await listParametrosDisparo(empresaId);
  return parametros.find((p) => p.cluster === cluster);
}

// "Hoje" no fuso horário brasileiro, sem depender do fuso do servidor.
function dataAtualBrasil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// "Data de hoje" usada pela régua/Rotina. O parâmetro "Data do sistema"
// (data fictícia pra testes) foi retirado das Configurações Globais — é
// sempre a data real no fuso BR. A tabela regua_cobranca_data_sistema
// ficou no banco, mas não é mais lida. Mantém o formato antigo
// ({ data_efetiva }) pra não mexer em quem já usa.
async function getDataSistema(empresaId) {
  const hoje = dataAtualBrasil();
  return { usar_data_real: true, data_ficticia: null, data_efetiva: hoje };
}

// "Tipo de Comunicação" (Configurações Globais) — 1 por empresa:
//   automatica = envio nos horários agendados (Rotina só mostra o status);
//   visualizar = na Rotina, o responsável abre a mensagem e clica Enviar;
//   copiar     = na Rotina, o responsável copia o conteúdo e manda pelo
//                próprio WhatsApp (nada sai pela Z-API/SMTP — ver
//                historicoCliente.service.js::registrarObservacao).
// Sem linha = 'visualizar'. `ativa` continua na resposta (= automatica) só
// por compatibilidade com quem ainda lê o formato antigo.
const TIPOS_COMUNICACAO = ['automatica', 'visualizar', 'copiar'];

async function getComunicacaoAutomatica(empresaId) {
  const { rows } = await pool.query(
    'SELECT tipo FROM regua_cobranca_comunicacao_automatica WHERE empresa_id = $1',
    [empresaId]
  );
  const tipo = rows[0]?.tipo ?? 'visualizar';
  return { tipo, ativa: tipo === 'automatica' };
}

async function salvarComunicacaoAutomatica(empresaId, tipo) {
  await pool.query(
    `INSERT INTO regua_cobranca_comunicacao_automatica (empresa_id, tipo, ativa)
     VALUES ($1, $2, $3)
     ON CONFLICT (empresa_id) DO UPDATE SET tipo = EXCLUDED.tipo, ativa = EXCLUDED.ativa, atualizado_em = NOW()`,
    [empresaId, tipo, tipo === 'automatica']
  );
  return getComunicacaoAutomatica(empresaId);
}

// "Tipos de Pagamentos para Cobrança" (Configurações Globais): só parcelas
// cujo tipo de pagamento do Sienge (sie_income.payment_term_description)
// está na lista da empresa entram na cobrança — Gestão das Parcelas, Rotina
// e relatório Desempenho da Cobrança usam esta mesma condição no WHERE (o
// alias da sie_income precisa ser `si`). Sem nenhum tipo escolhido, nenhuma
// parcela entra (pedido do usuário: começa tudo à esquerda, e tipo novo que
// aparecer no Sienge fica de fora até alguém incluir). TRIM dos dois lados
// da comparação: o Sienge manda alguns tipos com espaço sobrando ('ATO  ').
const CONDICAO_TIPO_PAGAMENTO = `EXISTS (
       SELECT 1 FROM regua_cobranca_tipos_pagamento tp
       WHERE tp.empresa_id = si.empresa_id AND tp.descricao = TRIM(si.payment_term_description)
     )`;

// Todos os tipos que existem na base da empresa (mais os já escolhidos que
// sumiram da base, pra continuarem visíveis e poderem ser tirados), com a
// quantidade de parcelas e de parcelas em aberto de cada um — o número
// ajuda a decidir o que mover. `selecionados` = os que estão à direita.
async function getTiposPagamento(empresaId) {
  const [{ rows: tipos }, { rows: escolhidos }] = await Promise.all([
    pool.query(
      `SELECT TRIM(payment_term_description) AS descricao,
              COUNT(*)::int AS parcelas,
              COUNT(*) FILTER (WHERE corrected_balance_amount <> 0)::int AS abertas
       FROM sie_income
       WHERE empresa_id = $1 AND origin_id = 'CO' AND NULLIF(TRIM(payment_term_description), '') IS NOT NULL
       GROUP BY 1`,
      [empresaId]
    ),
    pool.query('SELECT descricao FROM regua_cobranca_tipos_pagamento WHERE empresa_id = $1', [empresaId]),
  ]);
  const porDescricao = new Map(tipos.map((t) => [t.descricao, t]));
  for (const { descricao } of escolhidos) {
    if (!porDescricao.has(descricao)) porDescricao.set(descricao, { descricao, parcelas: 0, abertas: 0 });
  }
  return {
    tipos: [...porDescricao.values()].sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')),
    selecionados: escolhidos.map((e) => e.descricao),
  };
}

// Grava a lista inteira de uma vez (a tela manda o lado direito completo a
// cada movimento) — apaga e regrava numa transação só.
async function salvarTiposPagamento(empresaId, descricoes, usuarioId) {
  const unicas = [...new Set(descricoes.map((d) => String(d).trim()).filter(Boolean))];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM regua_cobranca_tipos_pagamento WHERE empresa_id = $1', [empresaId]);
    if (unicas.length > 0) {
      await client.query(
        `INSERT INTO regua_cobranca_tipos_pagamento (empresa_id, descricao, criado_por)
         SELECT $1, d, $3 FROM UNNEST($2::text[]) AS d`,
        [empresaId, unicas, usuarioId ?? null]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return getTiposPagamento(empresaId);
}

// Qual conexão Z-API dispara este cluster — configurada em Configurações
// Globais (ver ConfiguracoesGlobaisPainel.jsx). Sem linha (cluster nunca
// configurado) ou zapi_integracao_id NULL = nenhuma conexão escolhida.
async function getZapiIntegracaoDoCluster(empresaId, cluster) {
  const { rows } = await pool.query(
    'SELECT zapi_integracao_id FROM regua_cobranca_horario_disparo WHERE empresa_id = $1 AND cluster = $2',
    [empresaId, cluster]
  );
  return rows[0]?.zapi_integracao_id || null;
}

// Mesma ideia de getZapiIntegracaoDoCluster acima, pra qual conexão de
// e-mail dispara este cluster.
async function getEmailIntegracaoDoCluster(empresaId, cluster) {
  const { rows } = await pool.query(
    'SELECT email_integracao_id FROM regua_cobranca_horario_disparo WHERE empresa_id = $1 AND cluster = $2',
    [empresaId, cluster]
  );
  return rows[0]?.email_integracao_id || null;
}

function formatarDataBR(data) {
  if (!data) return '';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(data));
}

function formatarMoedaBR(valor) {
  if (valor == null) return '';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Substitui @nome_cliente/@centro_custo/@vencimento/@valor pelo dado REAL
// da parcela — mesma lista de variáveis da biblioteca de Comunicação (ver
// frontend Comunicacao/constantes.js::VARS), só que aqui com o valor de
// verdade, não o de exemplo usado na pré-visualização de template. Usada
// tanto pra montar a prévia mostrada na Rotina do dia (ver
// rotinas.service.js) quanto pro envio de verdade via Z-API (ver
// regua-cobranca-historico/historicoCliente.service.js::
// registrarObservacao) — o MESMO texto nos dois lugares, pra garantir que
// o que a pessoa vê antes de marcar o check é exatamente o que sai.
function substituirVariaveisTemplate(texto, { nomeCliente, centroCusto, vencimento, valor } = {}) {
  const valores = {
    nome_cliente: nomeCliente || '',
    centro_custo: centroCusto || '',
    vencimento: formatarDataBR(vencimento),
    valor: formatarMoedaBR(valor),
  };
  return String(texto || '').replace(/@([a-z_]+)/g, (trecho, chave) => (chave in valores ? valores[chave] : trecho));
}

module.exports = {
  CLUSTERS_VALIDOS,
  getLimiteVigente,
  listEtapasAtivasPorCluster,
  listEtapasComComunicacao,
  limitesDias,
  getResumo,
  listEtapas,
  listResponsaveis,
  criarEtapa,
  atualizarEtapa,
  removerEtapa,
  listParametrosDisparo,
  salvarParametroDisparo,
  getDataSistema,
  TIPOS_COMUNICACAO,
  getComunicacaoAutomatica,
  salvarComunicacaoAutomatica,
  CONDICAO_TIPO_PAGAMENTO,
  getTiposPagamento,
  salvarTiposPagamento,
  getZapiIntegracaoDoCluster,
  getEmailIntegracaoDoCluster,
  substituirVariaveisTemplate,
};
