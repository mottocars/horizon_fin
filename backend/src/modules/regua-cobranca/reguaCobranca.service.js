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
async function listResponsaveis(empresaId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome FROM usuarios u
     JOIN usuarios_empresas ue ON ue.usuario_id = u.id
     WHERE ue.empresa_id = $1 AND u.permissao <> 'MASTER' AND u.ativo = TRUE
     ORDER BY u.nome ASC`,
    [empresaId]
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

// "Hoje" no fuso horário brasileiro, sem depender do fuso do servidor —
// usado como fallback (usar_data_real) e como valor de teste quando a
// empresa não desligou a opção (ver getDataSistema abaixo).
function dataAtualBrasil() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

// Parametrização da "data de hoje" usada pelos disparos — 1 por empresa.
// Sem linha = usar_data_real true. `data_efetiva` é a data que os disparos
// devem de fato considerar como hoje: a real (fuso BR) ou a fictícia
// configurada, conforme a flag.
async function getDataSistema(empresaId) {
  const { rows } = await pool.query(
    'SELECT usar_data_real, data_ficticia::text AS data_ficticia FROM regua_cobranca_data_sistema WHERE empresa_id = $1',
    [empresaId]
  );
  const row = rows[0];
  const usarDataReal = row ? row.usar_data_real : true;
  const dataFicticia = row?.data_ficticia || null;
  return {
    usar_data_real: usarDataReal,
    data_ficticia: dataFicticia,
    data_efetiva: usarDataReal ? dataAtualBrasil() : dataFicticia || dataAtualBrasil(),
  };
}

async function salvarDataSistema(empresaId, dados) {
  await pool.query(
    `INSERT INTO regua_cobranca_data_sistema (empresa_id, usar_data_real, data_ficticia)
     VALUES ($1, $2, $3)
     ON CONFLICT (empresa_id) DO UPDATE SET
       usar_data_real = EXCLUDED.usar_data_real,
       data_ficticia = EXCLUDED.data_ficticia,
       atualizado_em = NOW()`,
    [empresaId, dados.usar_data_real, dados.data_ficticia || null]
  );
  return getDataSistema(empresaId);
}

// Flag "Ativar Comunicação Automática" (Configurações Globais) — 1 por
// empresa. Sem linha = desligada (nasce desligada, mesmo critério de
// `rotina_habilitada`). Enquanto desligada, a Rotina do dia trata
// WhatsApp/E-mail como checkbox manual do responsável, igual à Ligação
// (ver rotinas.service.js::listRotinas — o flag em si não filtra nada lá,
// é lido direto pelo frontend pra decidir COMO desenhar as 2 colunas).
async function getComunicacaoAutomatica(empresaId) {
  const { rows } = await pool.query(
    'SELECT ativa FROM regua_cobranca_comunicacao_automatica WHERE empresa_id = $1',
    [empresaId]
  );
  return { ativa: rows[0]?.ativa ?? false };
}

async function salvarComunicacaoAutomatica(empresaId, ativa) {
  await pool.query(
    `INSERT INTO regua_cobranca_comunicacao_automatica (empresa_id, ativa)
     VALUES ($1, $2)
     ON CONFLICT (empresa_id) DO UPDATE SET ativa = EXCLUDED.ativa, atualizado_em = NOW()`,
    [empresaId, ativa]
  );
  return getComunicacaoAutomatica(empresaId);
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
  salvarDataSistema,
  getComunicacaoAutomatica,
  salvarComunicacaoAutomatica,
  getZapiIntegracaoDoCluster,
  getEmailIntegracaoDoCluster,
  substituirVariaveisTemplate,
};
