const pool = require('../../config/db');
const env = require('../../config/env');
const zapiService = require('../integracoes-zapi/zapi.service');
const { paisDoIp } = require('../../utils/paisDoIp');

// Alertas de atividade suspeita: quem detecta é a vigilancia.js; aqui cada
// sinal vira um episódio na tabela alertas_seguranca e, no primeiro sinal
// do episódio, um WhatsApp pro Bruno Motta pela conexão "Comunicação
// Oficial" da HORIZON. Sinais iguais (mesma `chave`) dentro do intervalo de
// silêncio só somam ocorrências — um script fazendo mil chamadas gera 1
// mensagem, não mil.

// Pelo nome (não pelo id): o Bruno é o usuário 1 na produção e o 2 no banco
// local. Na dúvida entre dois com o mesmo nome, vai pro Master.
const NOME_DESTINATARIO = 'bruno motta';
// Teto de mensagens por hora, pro caso de um ataque com muitos IPs/usuários
// gerar muitos episódios diferentes ao mesmo tempo. Passou disso, o episódio
// fica só gravado (e aparece em Métricas de Uso).
const MAX_MENSAGENS_POR_HORA = 15;
const INTERVALO_GRAVACAO_MS = 30 * 1000;

function horaBrasil(data = new Date()) {
  return data
    .toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(',', ' às');
}

function nomePais(codigo) {
  if (!codigo) return null;
  if (codigo === 'LOCAL') return 'rede interna';
  try {
    return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(codigo) || codigo;
  } catch {
    return codigo;
  }
}

function duracaoTexto(ms) {
  const horas = Math.round(ms / 3600000);
  if (horas >= 1) return horas === 1 ? '1 hora' : `${horas} horas`;
  return `${Math.round(ms / 60000)} minutos`;
}

async function destinatario() {
  const { rows } = await pool.query(
    `SELECT id, nome, telefone_ddd, telefone_numero
     FROM usuarios
     WHERE LOWER(TRIM(nome)) = $1 AND ativo
     ORDER BY (permissao = 'MASTER') DESC, id
     LIMIT 1`,
    [NOME_DESTINATARIO]
  );
  return rows[0] || null;
}

async function dadosUsuario(id) {
  if (!id) return null;
  const { rows } = await pool.query('SELECT nome, username FROM usuarios WHERE id = $1', [id]);
  return rows[0] || null;
}

function montarMensagem(alerta, usuario, silencioMs) {
  const pais = nomePais(alerta.pais);
  const quem = usuario
    ? `${usuario.nome} (${usuario.username})`
    : alerta.username
      ? `login digitado "${alerta.username}"`
      : 'sem login (não identificado)';
  return [
    '*[ ALERTA DE SEGURANÇA ]*',
    `_${horaBrasil()}_`,
    '',
    'Atividade suspeita no Horizon:',
    `*${alerta.titulo}*`,
    '',
    `👤 Quem: ${quem}`,
    ...(alerta.ip ? [`🌐 IP: ${alerta.ip}${pais ? ` (${pais})` : ''}`] : []),
    ...(alerta.userAgent ? [`🖥️ Cliente: ${alerta.userAgent.slice(0, 120)}`] : []),
    ...(alerta.rota ? [`🔗 Chamada: ${alerta.rota}`] : []),
    ...(alerta.detalhe ? ['', alerta.detalhe] : []),
    '',
    `Sinais iguais ficam em silêncio por ${duracaoTexto(silencioMs)}. Histórico em Relatórios > Métricas de Uso.`,
    '',
    '_Alerta automático enviado pelo Horizon Finanças._',
  ].join('\n');
}

async function enviarWhatsapp(alerta, silencioMs) {
  if (!env.alertasSegurancaWhatsapp) return { enviado: false, erro: 'Envio por WhatsApp desligado neste ambiente (ALERTAS_SEGURANCA_WHATSAPP=false).' };

  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM alertas_seguranca
     WHERE whatsapp_enviado AND criado_em > NOW() - INTERVAL '1 hour'`
  );
  if (rows[0].total >= MAX_MENSAGENS_POR_HORA) {
    return { enviado: false, erro: `Limite de ${MAX_MENSAGENS_POR_HORA} alertas por hora atingido — só gravado.` };
  }

  const integracaoId = await zapiService.conexaoOficialId();
  if (!integracaoId) return { enviado: false, erro: 'Conexão Z-API "Comunicação Oficial" da HORIZON não encontrada ou inativa.' };
  const para = await destinatario();
  if (!para?.telefone_ddd || !para?.telefone_numero) {
    return { enviado: false, erro: 'Bruno Motta sem celular cadastrado (ou inativo).' };
  }

  const usuario = await dadosUsuario(alerta.usuarioId);
  // DDI montado aqui (e não pelo "completa o 55" do zapi.service), que
  // confundiria um DDD 55 com o DDI — mesmo cuidado do primeiro acesso.
  const telefone = `55${String(para.telefone_ddd).replace(/\D/g, '')}${String(para.telefone_numero).replace(/\D/g, '')}`;
  try {
    await zapiService.enviarMensagemTexto(integracaoId, { telefone, mensagem: montarMensagem(alerta, usuario, silencioMs) });
    return { enviado: true, erro: null };
  } catch (err) {
    return { enviado: false, erro: String(err.message || err).slice(0, 500) };
  }
}

// chave → { id, ate, pendente } — episódio aberto. `id` null enquanto o
// INSERT/consulta ainda não voltou (sinais que chegam nesse meio-tempo
// ficam em `pendente` e são somados depois).
const episodios = new Map();

async function abrirEpisodio(entrada, alerta, silencioMs) {
  // Depois de reiniciar o backend (deploy), retoma o episódio que já estava
  // aberto em vez de mandar outra mensagem.
  const { rows: abertos } = await pool.query(
    `SELECT id, EXTRACT(EPOCH FROM criado_em)::float * 1000 AS criado_ms
     FROM alertas_seguranca
     WHERE chave = $1 AND criado_em > NOW() - make_interval(secs => $2)
     ORDER BY criado_em DESC
     LIMIT 1`,
    [alerta.chave, silencioMs / 1000]
  );
  if (abertos[0]) {
    entrada.id = abertos[0].id;
    entrada.ate = abertos[0].criado_ms + silencioMs;
    entrada.pendente += 1;
    return;
  }

  const pais = alerta.ip ? paisDoIp(alerta.ip) : null;
  const registro = { ...alerta, pais };
  const { rows } = await pool.query(
    `INSERT INTO alertas_seguranca (motivo, titulo, chave, usuario_id, username, ip, pais, user_agent, rota, detalhe)
     VALUES ($1, $2, $3, (SELECT id FROM usuarios WHERE id = $4), $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      alerta.motivo,
      alerta.titulo.slice(0, 200),
      alerta.chave.slice(0, 200),
      // Subconsulta acima: usuário já excluído (token antigo dele) fica sem vínculo em vez de quebrar a FK.
      Number.isInteger(alerta.usuarioId) ? alerta.usuarioId : null,
      alerta.username ? String(alerta.username).slice(0, 150) : null,
      alerta.ip || null,
      pais,
      alerta.userAgent || null,
      alerta.rota ? alerta.rota.slice(0, 300) : null,
      alerta.detalhe || null,
    ]
  );
  entrada.id = rows[0].id;

  const envio = await enviarWhatsapp(registro, silencioMs);
  if (!envio.enviado) console.warn(`[alertas-seguranca] #${entrada.id} ${alerta.titulo}: WhatsApp não enviado — ${envio.erro}`);
  await pool.query('UPDATE alertas_seguranca SET whatsapp_enviado = $1, whatsapp_erro = $2 WHERE id = $3', [
    envio.enviado,
    envio.erro,
    entrada.id,
  ]);
}

// alerta = { motivo, titulo, chave, usuarioId?, username?, ip?, userAgent?, rota?, detalhe? }
// silencioMs = por quanto tempo sinais com a mesma chave não geram outra mensagem.
// Nunca lança erro nem segura a requisição: roda em segundo plano.
function alertar(alerta, silencioMs) {
  try {
    const agora = Date.now();
    const atual = episodios.get(alerta.chave);
    if (atual && atual.ate > agora) {
      atual.pendente += 1;
      return;
    }
    const entrada = { id: null, ate: agora + silencioMs, pendente: 0 };
    episodios.set(alerta.chave, entrada);
    abrirEpisodio(entrada, alerta, silencioMs).catch((err) => {
      console.error('[alertas-seguranca] falha ao registrar alerta:', err.message);
    });
  } catch (err) {
    console.error('[alertas-seguranca] falha ao registrar alerta:', err.message);
  }
}

async function gravarOcorrencias() {
  const agora = Date.now();
  for (const [chave, entrada] of episodios) {
    if (entrada.id && entrada.pendente > 0) {
      const n = entrada.pendente;
      entrada.pendente = 0;
      try {
        await pool.query('UPDATE alertas_seguranca SET ocorrencias = ocorrencias + $1, ultimo_em = NOW() WHERE id = $2', [
          n,
          entrada.id,
        ]);
      } catch (err) {
        entrada.pendente += n;
        console.error('[alertas-seguranca] falha ao somar ocorrências:', err.message);
      }
    }
    // Episódio vencido sai da memória (o que não chegou a gravar — id null por erro no banco — também).
    if (entrada.ate <= agora && (entrada.id === null || entrada.pendente === 0)) episodios.delete(chave);
  }
}

setInterval(gravarOcorrencias, INTERVALO_GRAVACAO_MS).unref();

// Pra Métricas de Uso. $3 = empresas de quem consulta (NULL = Master): quem
// não é Master só vê os alertas dos usuários das próprias empresas — os
// alertas sem usuário (varredura, força bruta) ficam só pro Master.
async function listar({ dataInicio, dataFim }, empresaIds = null) {
  const { rows } = await pool.query(
    `SELECT a.id, a.motivo, a.titulo, a.usuario_id, u.nome AS usuario_nome, a.username, a.ip, a.pais,
            a.user_agent, a.rota, a.detalhe, a.ocorrencias, a.whatsapp_enviado, a.whatsapp_erro,
            a.criado_em, a.ultimo_em
     FROM alertas_seguranca a
     LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.criado_em::date BETWEEN $1 AND $2
       AND ($3::int[] IS NULL OR a.usuario_id IN (SELECT ue.usuario_id FROM usuarios_empresas ue WHERE ue.empresa_id = ANY($3::int[])))
     ORDER BY a.criado_em DESC
     LIMIT 300`,
    [dataInicio, dataFim, empresaIds]
  );
  return rows;
}

module.exports = { alertar, listar, gravarOcorrencias, montarMensagem };
