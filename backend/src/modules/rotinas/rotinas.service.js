const fs = require('fs');
const path = require('path');
const pool = require('../../config/db');
const { getLimiteVigente, getDataSistema, substituirVariaveisTemplate } = require('../regua-cobranca/reguaCobranca.service');
const usuariosService = require('../usuarios/usuarios.service');

const CLUSTERS_VALIDOS = ['novo', 'bom', 'duvidoso', 'mau', 'inad'];
const ORIGIN_ID_PADRAO = 'CO';
const UM_DIA_MS = 24 * 60 * 60 * 1000;

// Mesmo diretório físico de regua-cobranca-historico/historicoCliente.service.js
// — os registros de "ligação realizada" marcados aqui são as MESMAS linhas
// de regua_cobranca_historico_registros que aparecem no Histórico de Etapas
// da parcela (ver HistoricoParcelaModal.jsx): marcar na Rotina também fica
// registrado pra sempre na história daquela parcela, não é um estado à parte.
const ANEXOS_UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'regua-cobranca-historico');

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

// Mesmos helpers de data UTC-safe duplicados em todo módulo de régua/
// cobrança (mesma convenção de não compartilhar entre módulos).
function inicioDoDiaUTC(data) {
  const d = new Date(data);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function diasEntre(dataMenor, dataMaior) {
  return Math.round((inicioDoDiaUTC(dataMaior).getTime() - inicioDoDiaUTC(dataMenor).getTime()) / UM_DIA_MS);
}

function somarDias(data, dias) {
  const d = inicioDoDiaUTC(data);
  return new Date(d.getTime() + dias * UM_DIA_MS);
}

function paraIso(data) {
  return data.toISOString().slice(0, 10);
}

// Master e Administrador enxergam a rotina de qualquer usuário (Administrador
// OU Básico) desta empresa — pra Master acompanhar o time, ou pra um
// Administrador ver a rotina de um Básico que ele supervisiona. Básico só
// vê a própria: `usuarioIdFiltro` é ignorado pra ele, nunca um jeito de
// espiar a rotina de outra pessoa. O alvo escolhido precisa realmente ter
// esta empresa vinculada e não ser Master (mesma regra de
// reguaCobranca.service.js::garantirResponsavelElegivel — Master nunca é
// atribuível como responsável de etapa nenhuma, então nunca teria rotina
// própria de verdade).
async function resolverUsuarioAlvo(empresaId, solicitanteId, usuarioIdFiltro) {
  const solicitante = await usuariosService.getById(solicitanteId);
  const podeFiltrar = solicitante?.permissao === 'MASTER' || solicitante?.permissao === 'ADMINISTRADOR';
  if (!podeFiltrar || !usuarioIdFiltro) return solicitanteId;

  const { rows } = await pool.query(
    `SELECT 1 FROM usuarios u
     JOIN usuarios_empresas ue ON ue.usuario_id = u.id
     WHERE u.id = $1 AND ue.empresa_id = $2 AND u.permissao <> 'MASTER'`,
    [usuarioIdFiltro, empresaId]
  );
  if (rows.length === 0) {
    throw badRequest('Usuário inválido para filtrar a rotina desta empresa.');
  }
  return usuarioIdFiltro;
}

// Rotina diária de 1 responsável: pra cada etapa ATIVA, LIBERADA PRA ROTINA
// (`rotina_habilitada`) e atribuída a ELE (`responsavel_usuario_id`), acha
// as parcelas que ENTRARAM nela (due_date + etapa.dias) dentro do intervalo
// [dataInicio, dataFim] — o dia em que uma etapa é alcançada é o dia em que
// o disparo dela aconteceria (ver historicoCliente.service.js::
// montarTimelineParcela, mesma conta). Sem responsável nenhuma etapa
// aparece — "Rotinas" é a lista pessoal de quem está logado, não uma visão
// geral de todo mundo.
async function listRotinas(empresaId, usuarioId, { dataInicio, dataFim, costCenterIds } = {}) {
  // `template_corpo`/`template_assunto` só entram aqui pra montar a prévia
  // de WhatsApp/e-mail de cada item (ver mensagemWhatsapp/mensagemEmail
  // abaixo) — a mesma etapa que decide o canal já carrega o texto de
  // verdade que seria enviado.
  const { rows: etapasRows } = await pool.query(
    `SELECT e.id, e.cluster, e.nome, e.dias, e.canal_whatsapp, e.canal_email, e.canal_ligacao,
            t.corpo AS template_corpo, t.assunto AS template_assunto
     FROM regua_cobranca_etapas e
     LEFT JOIN comunicacao_templates t ON t.id = e.template_id
     WHERE e.empresa_id = $1 AND e.ativa = true AND e.rotina_habilitada = true AND e.dias IS NOT NULL
       AND e.responsavel_usuario_id = $2
     ORDER BY e.cluster, e.dias ASC`,
    [empresaId, usuarioId]
  );
  if (etapasRows.length === 0) return [];

  const etapasPorCluster = {};
  for (const e of etapasRows) (etapasPorCluster[e.cluster] ??= []).push(e);

  const limite = await getLimiteVigente(empresaId);

  const { rows: clusterRows } = await pool.query(
    'SELECT client_id, cluster FROM cobranca_clientes_clusters WHERE empresa_id = $1',
    [empresaId]
  );
  const clusterPorCliente = new Map(clusterRows.map((r) => [String(r.client_id), r.cluster]));

  const params = [empresaId, ORIGIN_ID_PADRAO];
  let filtroCentro = '';
  if (Array.isArray(costCenterIds) && costCenterIds.length > 0) {
    params.push(costCenterIds);
    filtroCentro = ` AND cat.cost_center_id = ANY($${params.length}::bigint[])`;
  }

  // Mesmo universo "Lançamento" de gestao-parcelas.service.js::
  // buscarLinhasClassificadas — parcela × centro de custo, 1 linha por
  // combinação. `sie_customers_comunicar` é o flag "Comunicar" da aba
  // Clientes — sem linha, comunicado por padrão (`COALESCE(..., TRUE)`,
  // mesmo padrão de customers.service.js::getResumoPorCentroCusto).
  // Cliente com o flag desligado não entra na Rotina de ninguém.
  // ORDER BY é necessário mesmo sem paginação: o agrupamento Centro de
  // Custo → Cliente logo abaixo usa `Map` (preserva ordem de inserção), que
  // segue a ordem de `rows` — sem isso, o Postgres não garante a mesma
  // ordem entre 2 chamadas idênticas, e a lista da Rotina reembaralhava
  // sozinha a cada `carregar()` (ex.: depois de confirmar um WhatsApp),
  // fazendo a posição de rolagem do usuário não corresponder mais às
  // mesmas linhas de antes.
  const { rows } = await pool.query(
    `SELECT si.bill_id, si.installment_id, si.client_id, si.client_name, si.due_date,
            si.document_identification_name, si.document_number, si.installment_number,
            si.corrected_balance_amount, cat.cost_center_id, cat.cost_center_name
     FROM sie_income si
     JOIN sie_income_categorias cat
       ON cat.bill_id = si.bill_id AND cat.installment_id = si.installment_id AND cat.empresa_id = si.empresa_id
     JOIN centro_custo_etapas_historico h
       ON h.sienge_id = cat.cost_center_id AND h.empresa_id = cat.empresa_id AND h.data_inicio IS NOT NULL
     JOIN mascara_itens m
       ON m.id = h.mascara_item_id AND m.tipo = 'ETAPAS_CENTRO_CUSTO' AND m.descricao = 'Lançamento'
     LEFT JOIN sie_customers_comunicar com
       ON com.empresa_id = si.empresa_id AND com.client_id = si.client_id
     WHERE si.empresa_id = $1 AND si.origin_id = $2 AND si.corrected_balance_amount <> 0
       AND COALESCE(com.comunicar, TRUE) = TRUE${filtroCentro}
     ORDER BY cat.cost_center_name, si.client_name, si.bill_id, si.installment_id`,
    params
  );

  const { data_efetiva: hoje } = await getDataSistema(empresaId);

  // 1 item por (parcela, etapa) cuja data de entrada caia no intervalo
  // pedido — uma mesma parcela pode gerar vários itens se o intervalo
  // cobrir a entrada em mais de 1 etapa (ex.: intervalo de 1 mês inteiro).
  const itens = [];
  for (const row of rows) {
    const diasSigned = diasEntre(row.due_date, hoje);
    const clusterCliente = clusterPorCliente.get(String(row.client_id)) || 'novo';
    const cluster = diasSigned > limite ? 'inad' : clusterCliente;

    const etapas = etapasPorCluster[cluster];
    if (!etapas) continue; // nenhuma etapa deste cluster é deste responsável

    for (const etapa of etapas) {
      const data = paraIso(somarDias(row.due_date, etapa.dias));
      if (data < dataInicio || data > dataFim) continue;

      // Prévia de verdade do que seria enviado — mesma substituição usada
      // no envio real (ver historicoCliente.service.js::registrarObservacao,
      // que recalcula essa MESMA string na hora de mandar pela Z-API, pra
      // nunca existir divergência entre o que a pessoa vê aqui e o que sai).
      // Sem template configurado, não tem o que mostrar — o modal trata
      // esse caso (ver RegistrarComunicacaoModal.jsx).
      const variaveisTemplate = {
        nomeCliente: row.client_name,
        centroCusto: row.cost_center_name,
        vencimento: row.due_date,
        valor: row.corrected_balance_amount,
      };
      const mensagemWhatsapp =
        etapa.canal_whatsapp && etapa.template_corpo
          ? substituirVariaveisTemplate(etapa.template_corpo, variaveisTemplate)
          : null;
      // Mesma ideia da prévia de WhatsApp acima, só que pro e-mail — o
      // assunto só existe pra este canal (ver historicoCliente.service.js::
      // registrarObservacao, onde o mesmo texto vira o header de verdade).
      const mensagemEmail =
        etapa.canal_email && etapa.template_corpo
          ? substituirVariaveisTemplate(etapa.template_corpo, variaveisTemplate)
          : null;
      const assuntoEmail =
        etapa.canal_email && etapa.template_assunto
          ? substituirVariaveisTemplate(etapa.template_assunto, variaveisTemplate)
          : null;

      itens.push({
        bill_id: row.bill_id,
        installment_id: row.installment_id,
        client_id: row.client_id,
        client_name: row.client_name,
        cost_center_id: row.cost_center_id,
        cost_center_name: row.cost_center_name,
        cluster,
        etapa_id: etapa.id,
        etapa_nome: etapa.nome,
        etapa_dias: etapa.dias,
        canal_whatsapp: etapa.canal_whatsapp,
        canal_email: etapa.canal_email,
        canal_ligacao: etapa.canal_ligacao,
        due_date: row.due_date,
        document_identification_name: row.document_identification_name,
        document_number: row.document_number,
        installment_number: row.installment_number,
        valor: row.corrected_balance_amount,
        mensagem_whatsapp: mensagemWhatsapp,
        mensagem_email: mensagemEmail,
        assunto_email: assuntoEmail,
        data,
      });
    }
  }

  if (itens.length === 0) return [];

  // Ordem pedida pro usuário: dentro de um mesmo centro de custo, etapa mais
  // crítica primeiro (etapa.dias mais alto = mais dias de atraso desde o
  // vencimento = mais perto de virar Mau pagador/execução — mesma leitura
  // de "D+N" já usada em compararEtapas no frontend); empatado na etapa,
  // pior cluster primeiro (CLUSTERS_VALIDOS já é a escala de "novo" ao mais
  // grave, "inad" — índice mais alto = pior); empatado também no cluster, o
  // maior valor em aberto primeiro. Sem cliente como critério de
  // ordenação — a tela não tem cabeçalho por cliente (é só uma coluna),
  // então itens de clientes diferentes podem ficar intercalados livremente.
  itens.sort(
    (a, b) =>
      b.etapa_dias - a.etapa_dias ||
      CLUSTERS_VALIDOS.indexOf(b.cluster) - CLUSTERS_VALIDOS.indexOf(a.cluster) ||
      b.valor - a.valor
  );

  // Status de cada canal nesta data: existe algum registro (manual — a
  // ligação marcada aqui mesmo — ou automático, quando existir um disparo
  // de verdade) com aquele canal, pra aquela parcela, naquela data exata.
  const { rows: registros } = await pool.query(
    `SELECT bill_id, installment_id, canal, data_registro::text AS data_registro
     FROM regua_cobranca_historico_registros
     WHERE empresa_id = $1 AND canal IS NOT NULL AND data_registro BETWEEN $2 AND $3`,
    [empresaId, dataInicio, dataFim]
  );
  const feitos = new Set(registros.map((r) => `${r.bill_id}|${r.installment_id}|${r.canal}|${r.data_registro}`));
  const feito = (item, canal) => feitos.has(`${item.bill_id}|${item.installment_id}|${canal}|${item.data}`);

  // Tentativas de envio que FALHARAM de verdade (hoje só WhatsApp, ver
  // historicoCliente.service.js::registrarObservacao) — é o que distingue
  // "erro" de "pendente" na tela (ver RotinasTab.jsx::CheckboxCanal). Uma
  // linha já `feito()` nunca aparece aqui também (o próprio registro de
  // sucesso apaga a falha anterior), mas o `!feito()` no cálculo abaixo é
  // uma segunda garantia, sem depender só disso.
  const { rows: falhas } = await pool.query(
    `SELECT bill_id, installment_id, canal, data_registro::text AS data_registro, mensagem_erro
     FROM regua_cobranca_envios_falhos
     WHERE empresa_id = $1 AND data_registro BETWEEN $2 AND $3`,
    [empresaId, dataInicio, dataFim]
  );
  const falhasPorChave = new Map(
    falhas.map((f) => [`${f.bill_id}|${f.installment_id}|${f.canal}|${f.data_registro}`, f.mensagem_erro])
  );
  const mensagemFalha = (item, canal) => falhasPorChave.get(`${item.bill_id}|${item.installment_id}|${canal}|${item.data}`);

  // Agrupa só por Centro de Custo — a lista de itens de cada um já sai na
  // ordem definida acima (etapa mais crítica, depois maior valor), com o
  // cliente de cada linha embutido no próprio item (a tela nunca teve um
  // cabeçalho por cliente, só uma coluna).
  const centros = new Map();
  for (const item of itens) {
    const chaveCentro = String(item.cost_center_id);
    if (!centros.has(chaveCentro)) {
      centros.set(chaveCentro, { cost_center_id: item.cost_center_id, cost_center_name: item.cost_center_name, itens: [] });
    }
    centros.get(chaveCentro).itens.push({
      bill_id: item.bill_id,
      installment_id: item.installment_id,
      client_id: item.client_id,
      client_name: item.client_name,
      cluster: item.cluster,
      etapa_id: item.etapa_id,
      etapa_nome: item.etapa_nome,
      due_date: item.due_date,
      document_identification_name: item.document_identification_name,
      document_number: item.document_number,
      installment_number: item.installment_number,
      valor: item.valor,
      mensagem_whatsapp: item.mensagem_whatsapp,
      mensagem_email: item.mensagem_email,
      assunto_email: item.assunto_email,
      data: item.data,
      canal_whatsapp: item.canal_whatsapp,
      canal_email: item.canal_email,
      canal_ligacao: item.canal_ligacao,
      whatsapp_enviado: item.canal_whatsapp && feito(item, 'whatsapp'),
      email_enviado: item.canal_email && feito(item, 'email'),
      ligacao_realizada: item.canal_ligacao && feito(item, 'ligacao'),
      whatsapp_erro: Boolean(item.canal_whatsapp && !feito(item, 'whatsapp') && mensagemFalha(item, 'whatsapp')),
      whatsapp_erro_mensagem: item.canal_whatsapp ? mensagemFalha(item, 'whatsapp') || null : null,
      email_erro: Boolean(item.canal_email && !feito(item, 'email') && mensagemFalha(item, 'email')),
      email_erro_mensagem: item.canal_email ? mensagemFalha(item, 'email') || null : null,
    });
  }

  // Centro de custo com mais títulos a verificar primeiro (critério 1 do
  // usuário) — dentro de cada centro, a ordem dos itens já vem certa desde
  // o sort acima, então não precisa reordenar de novo aqui.
  return [...centros.values()]
    .map((centro) => ({
      cost_center_id: centro.cost_center_id,
      cost_center_name: centro.cost_center_name,
      total_itens: centro.itens.length,
      itens: centro.itens,
    }))
    .sort((a, b) => b.total_itens - a.total_itens || (a.cost_center_name || '').localeCompare(b.cost_center_name || '', 'pt-BR'));
}

// Marcar (o check virar verde) não é responsabilidade deste módulo: a
// Rotina abre o mesmo formulário de "Registrar observação" do Histórico de
// Etapas (POST /regua-cobranca-historico/registros, com o canal certo e
// data = a data da própria etapa) — pede a observação de verdade, não só
// um flag vazio. Vale pra Ligação sempre, e pra WhatsApp/E-mail também
// quando a empresa está com "Ativar Comunicação Automática" desligada (ver
// reguaCobranca.service.js::getComunicacaoAutomatica) — sem disparo
// automático de verdade rodando, alguém precisa confirmar que mandou.
// Aqui só sobra o inverso: desmarcar remove QUALQUER registro deste canal
// nesta parcela, nesta data exata (não só o que a própria Rotina criou) —
// é a mesma "fonte da verdade" que o check mostra, então desmarcar precisa
// realmente zerá-la, mesmo que o registro tenha sido criado por outra tela
// (Histórico de Etapas). Remove os anexos do disco também, não só a linha
// do banco.
async function desmarcarCanal(empresaId, { billId, installmentId, data, canal }) {
  const { rows: registros } = await pool.query(
    `SELECT id FROM regua_cobranca_historico_registros
     WHERE empresa_id = $1 AND bill_id = $2 AND installment_id = $3 AND canal = $4 AND data_registro = $5`,
    [empresaId, billId, installmentId, canal, data]
  );
  if (registros.length === 0) return;

  const ids = registros.map((r) => r.id);
  const { rows: anexos } = await pool.query(
    'SELECT arquivo_armazenado FROM regua_cobranca_historico_anexos WHERE registro_id = ANY($1::int[])',
    [ids]
  );
  for (const anexo of anexos) {
    fs.unlink(path.join(ANEXOS_UPLOADS_DIR, anexo.arquivo_armazenado), () => {});
  }
  await pool.query('DELETE FROM regua_cobranca_historico_registros WHERE id = ANY($1::int[])', [ids]);
}

module.exports = {
  CLUSTERS_VALIDOS,
  resolverUsuarioAlvo,
  listRotinas,
  desmarcarCanal,
};
