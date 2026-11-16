const crypto = require('crypto');
const pool = require('../../config/db');

// Cadastros › Formulários (tabelas formularios / formularios_respostas — ver
// database/migrations/2026-11-16-formularios.sql). Três modalidades:
//   PUBLICO             → link /f/<token_publico>, sem login (rotas em publico.routes.js);
//   PRIVADO             → janela ao entrar no sistema, pode fechar (volta a cada entrada);
//   PRIVADO_OBRIGATORIO → janela ao entrar no sistema, sem fechar até responder.
// Cada formulário é de uma empresa (formularios.empresa_id): o cadastro trabalha sempre dentro da empresa
// escolhida na tela (rotas /:empresaId/...), e o público-alvo dos privados são os usuários dela.
// As duas privadas são servidas ao usuário logado por meus.routes.js.
//
// Perguntas (JSON em formularios.perguntas), cada uma com `id` estável gerado na tela:
//   { id, tipo, titulo, descricao, obrigatoria, opcoes: [{ id, texto }], outro, escala: { min, max, rotulo_min, rotulo_max } }
// Respostas (JSON em formularios_respostas.respostas), por id da pergunta:
//   TEXTO_CURTO / TEXTO_LONGO        → 'texto'
//   MULTIPLA_ESCOLHA / LISTA         → { opcao: '<id>' } ou { outro: 'texto' }
//   CAIXAS_SELECAO                   → { opcoes: ['<id>', ...], outro: 'texto' | null }
//   ESCALA_LINEAR / AVALIACAO / NUMERO → número
//   DATA                             → 'AAAA-MM-DD'
//   SECAO                            → (só título/descrição, sem resposta)

const TIPOS = [
  'TEXTO_CURTO',
  'TEXTO_LONGO',
  'MULTIPLA_ESCOLHA',
  'CAIXAS_SELECAO',
  'LISTA',
  'ESCALA_LINEAR',
  'AVALIACAO',
  'DATA',
  'NUMERO',
  'SECAO',
];
const TIPOS_COM_OPCOES = ['MULTIPLA_ESCOLHA', 'CAIXAS_SELECAO', 'LISTA'];
const MODALIDADES_PRIVADAS = ['PRIVADO', 'PRIVADO_OBRIGATORIO'];
const LIMITE_TEXTO_CURTO = 500;
const LIMITE_TEXTO_LONGO = 5000;

// "Hoje" no Brasil — a produção roda em UTC.
const HOJE_SQL = `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const texto = (v, max) => String(v ?? '').slice(0, max);

function novoToken() {
  return crypto.randomBytes(16).toString('base64url');
}

// ---------------------------------------------------------------------------------------------
// Perguntas: normaliza o que veio da tela (tira campos estranhos, corta textos, garante ids).
// ---------------------------------------------------------------------------------------------

function normalizarEscala(tipo, escala) {
  const e = escala || {};
  if (tipo === 'AVALIACAO') {
    const max = Math.min(10, Math.max(3, Math.round(Number(e.max) || 5)));
    return { min: 1, max, rotulo_min: '', rotulo_max: '' };
  }
  const min = Number(e.min) === 0 ? 0 : 1;
  const max = Math.min(10, Math.max(2, Math.round(Number(e.max) || 5)));
  return { min, max, rotulo_min: texto(e.rotulo_min, 60), rotulo_max: texto(e.rotulo_max, 60) };
}

function normalizarPerguntas(lista) {
  if (!Array.isArray(lista)) throw erro(400, 'Perguntas inválidas.');
  if (lista.length > 200) throw erro(400, 'Um formulário pode ter no máximo 200 perguntas.');
  const vistos = new Set();
  return lista.map((p) => {
    const tipo = TIPOS.includes(p?.tipo) ? p.tipo : 'TEXTO_CURTO';
    let id = texto(p?.id, 40).trim();
    if (!id || vistos.has(id)) id = crypto.randomBytes(6).toString('hex');
    vistos.add(id);
    const pergunta = {
      id,
      tipo,
      titulo: texto(p?.titulo, 500),
      descricao: texto(p?.descricao, 2000),
      obrigatoria: tipo === 'SECAO' ? false : Boolean(p?.obrigatoria),
    };
    if (TIPOS_COM_OPCOES.includes(tipo)) {
      const ids = new Set();
      pergunta.opcoes = (Array.isArray(p?.opcoes) ? p.opcoes : []).slice(0, 100).map((o) => {
        let oid = texto(o?.id, 40).trim();
        if (!oid || ids.has(oid)) oid = crypto.randomBytes(5).toString('hex');
        ids.add(oid);
        return { id: oid, texto: texto(o?.texto, 300) };
      });
      pergunta.outro = tipo !== 'LISTA' && Boolean(p?.outro);
    }
    if (tipo === 'ESCALA_LINEAR' || tipo === 'AVALIACAO') pergunta.escala = normalizarEscala(tipo, p?.escala);
    return pergunta;
  });
}

// O que impede de publicar (lista de problemas; vazia = pode publicar).
function problemasParaPublicar(f) {
  const problemas = [];
  if (!String(f.titulo || '').trim()) problemas.push('Dê um título ao formulário.');
  const perguntas = (f.perguntas || []).filter((p) => p.tipo !== 'SECAO');
  if (perguntas.length === 0) problemas.push('Inclua ao menos uma pergunta.');
  (f.perguntas || []).forEach((p, i) => {
    const n = `Pergunta ${i + 1}`;
    if (p.tipo !== 'SECAO' && !String(p.titulo || '').trim()) problemas.push(`${n}: falta o enunciado.`);
    if (TIPOS_COM_OPCOES.includes(p.tipo)) {
      const validas = (p.opcoes || []).filter((o) => String(o.texto || '').trim());
      if (validas.length === 0 && !p.outro) problemas.push(`${n}: inclua ao menos uma opção.`);
      if (validas.length !== (p.opcoes || []).length) problemas.push(`${n}: há opção sem texto.`);
    }
  });
  if (MODALIDADES_PRIVADAS.includes(f.modalidade)) {
    if (f.publico_alvo === 'USUARIOS' && (f.usuario_ids || []).length === 0) problemas.push('Escolha os usuários do público-alvo.');
  }
  return problemas;
}

// ---------------------------------------------------------------------------------------------
// Respostas: confere cada pergunta e devolve só o que vale gravar.
// ---------------------------------------------------------------------------------------------

function vazio(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'object' && !Array.isArray(v)) {
    if ('opcoes' in v) return (v.opcoes || []).length === 0 && !String(v.outro || '').trim();
    return !v.opcao && !String(v.outro || '').trim();
  }
  return false;
}

function validarRespostas(perguntas, recebidas) {
  const entrada = recebidas && typeof recebidas === 'object' && !Array.isArray(recebidas) ? recebidas : {};
  const saida = {};
  const erros = {};
  for (const p of perguntas) {
    if (p.tipo === 'SECAO') continue;
    const bruto = entrada[p.id];
    let valor;
    try {
      valor = converterResposta(p, bruto);
    } catch (e) {
      erros[p.id] = e.message;
      continue;
    }
    if (vazio(valor)) {
      if (p.obrigatoria) erros[p.id] = 'Esta pergunta é obrigatória.';
      continue;
    }
    saida[p.id] = valor;
  }
  if (Object.keys(erros).length > 0) {
    const e = erro(400, 'Confira as respostas destacadas.');
    e.campos = erros;
    throw e;
  }
  return saida;
}

function converterResposta(p, v) {
  if (v === null || v === undefined || v === '') return null;
  const opcoes = new Set((p.opcoes || []).map((o) => o.id));
  switch (p.tipo) {
    case 'TEXTO_CURTO':
      return texto(v, LIMITE_TEXTO_CURTO).trim();
    case 'TEXTO_LONGO':
      return texto(v, LIMITE_TEXTO_LONGO).trim();
    case 'MULTIPLA_ESCOLHA':
    case 'LISTA': {
      if (typeof v !== 'object') throw new Error('Resposta inválida.');
      if (v.outro !== undefined && v.outro !== null && p.outro) {
        const outro = texto(v.outro, LIMITE_TEXTO_CURTO).trim();
        return outro ? { outro } : null;
      }
      if (!v.opcao) return null;
      if (!opcoes.has(String(v.opcao))) throw new Error('Opção inválida.');
      return { opcao: String(v.opcao) };
    }
    case 'CAIXAS_SELECAO': {
      if (typeof v !== 'object') throw new Error('Resposta inválida.');
      const marcadas = [...new Set((Array.isArray(v.opcoes) ? v.opcoes : []).map(String))];
      if (marcadas.some((id) => !opcoes.has(id))) throw new Error('Opção inválida.');
      const outro = p.outro && v.outro ? texto(v.outro, LIMITE_TEXTO_CURTO).trim() : '';
      return { opcoes: marcadas, outro: outro || null };
    }
    case 'ESCALA_LINEAR':
    case 'AVALIACAO': {
      const n = Number(v);
      const { min, max } = p.escala || { min: 1, max: 5 };
      if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Escolha um valor de ${min} a ${max}.`);
      return n;
    }
    case 'NUMERO': {
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || Math.abs(n) > 1e15) throw new Error('Informe um número válido.');
      return n;
    }
    case 'DATA': {
      const s = String(v);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw new Error('Informe uma data válida.');
      return s;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------------------------

const CAMPOS = `f.id, f.empresa_id, f.titulo, f.descricao, f.modalidade, f.status, f.perguntas, f.cor_tema, f.mensagem_final,
  f.publico_alvo, f.usuario_ids, f.anonimo, f.uma_resposta_por_pessoa,
  f.inicio_em::text AS inicio_em, f.fim_em::text AS fim_em, f.token_publico, f.publicado_em,
  f.criado_em, f.atualizado_em,
  (SELECT COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) FROM empresas e WHERE e.id = f.empresa_id) AS empresa_nome`;

// Usuário "da empresa": vinculado a ela (usuarios_empresas). `f` = alias da tabela formularios.
const SQL_DA_EMPRESA = `EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = f.empresa_id)`;
// Quem é público-alvo de um formulário privado (usuários ativos):
//   TODOS    → os usuários vinculados à empresa do formulário (Master sem vínculo fica de fora);
//   USUARIOS → os escolhidos, desde que ainda sejam da empresa (ou Master, que pode ser escolhido).
const SQL_PUBLICO_ALVO = `
  u.ativo AND (
    (f.publico_alvo = 'TODOS' AND ${SQL_DA_EMPRESA})
    OR (f.publico_alvo = 'USUARIOS' AND u.id = ANY(f.usuario_ids) AND (u.permissao = 'MASTER' OR ${SQL_DA_EMPRESA}))
  )`;

async function listar(empresaId, { busca, status, modalidade }) {
  const params = [empresaId];
  const cond = ['f.empresa_id = $1'];
  if (busca) {
    params.push(`%${busca}%`);
    cond.push(`(f.titulo ILIKE $${params.length} OR f.descricao ILIKE $${params.length})`);
  }
  if (status) {
    params.push(status);
    cond.push(`f.status = $${params.length}`);
  }
  if (modalidade) {
    params.push(modalidade);
    cond.push(`f.modalidade = $${params.length}`);
  }
  const { rows } = await pool.query(
    `SELECT f.id, f.titulo, f.descricao, f.modalidade, f.status, f.cor_tema, f.publico_alvo,
            f.inicio_em::text AS inicio_em, f.fim_em::text AS fim_em, f.token_publico, f.atualizado_em,
            jsonb_array_length(f.perguntas) AS qtd_itens,
            (SELECT COUNT(*) FROM jsonb_array_elements(f.perguntas) p WHERE p->>'tipo' <> 'SECAO')::int AS qtd_perguntas,
            (SELECT COUNT(*) FROM formularios_respostas r WHERE r.formulario_id = f.id)::int AS qtd_respostas,
            (SELECT MAX(r.enviado_em) FROM formularios_respostas r WHERE r.formulario_id = f.id) AS ultima_resposta,
            CASE WHEN f.modalidade <> 'PUBLICO'
                 THEN (SELECT COUNT(*) FROM usuarios u WHERE ${SQL_PUBLICO_ALVO})::int END AS qtd_destinatarios,
            cu.nome AS criado_por_nome
     FROM formularios f
     LEFT JOIN usuarios cu ON cu.id = f.criado_por
     WHERE ${cond.join(' AND ')}
     ORDER BY CASE f.status WHEN 'PUBLICADO' THEN 0 WHEN 'RASCUNHO' THEN 1 ELSE 2 END, f.atualizado_em DESC`,
    params
  );
  return rows;
}

// Um formulário da empresa (de outra empresa = "não encontrado").
async function obter(empresaId, id) {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS},
            (SELECT COUNT(*) FROM formularios_respostas r WHERE r.formulario_id = f.id)::int AS qtd_respostas
     FROM formularios f WHERE f.id = $1 AND f.empresa_id = $2`,
    [id, empresaId]
  );
  if (!rows[0]) throw erro(404, 'Formulário não encontrado.');
  return rows[0];
}

// Formulário novo já nasce com uma pergunta de múltipla escolha — como no Google Forms.
async function criar(empresaId, usuarioId, dados = {}) {
  const perguntas = normalizarPerguntas(
    dados.perguntas || [
      {
        tipo: 'MULTIPLA_ESCOLHA',
        titulo: '',
        obrigatoria: false,
        opcoes: [{ texto: 'Opção 1' }],
      },
    ]
  );
  const { rows } = await pool.query(
    `INSERT INTO formularios (titulo, descricao, modalidade, perguntas, token_publico, criado_por, atualizado_por, cor_tema, empresa_id)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $6, $7, $8) RETURNING id`,
    [
      texto(dados.titulo || 'Formulário sem título', 200),
      texto(dados.descricao, 5000),
      ['PUBLICO', ...MODALIDADES_PRIVADAS].includes(dados.modalidade) ? dados.modalidade : 'PUBLICO',
      JSON.stringify(perguntas),
      novoToken(),
      usuarioId,
      dados.cor_tema || '#2563eb',
      empresaId,
    ]
  );
  return obter(empresaId, rows[0].id);
}

async function salvar(empresaId, id, usuarioId, d) {
  const atual = await obter(empresaId, id);
  const perguntas = d.perguntas !== undefined ? normalizarPerguntas(d.perguntas) : atual.perguntas;
  const novo = {
    titulo: d.titulo !== undefined ? texto(d.titulo, 200) : atual.titulo,
    descricao: d.descricao !== undefined ? texto(d.descricao, 5000) : atual.descricao,
    modalidade: d.modalidade ?? atual.modalidade,
    cor_tema: d.cor_tema ?? atual.cor_tema,
    mensagem_final: d.mensagem_final !== undefined ? texto(d.mensagem_final, 2000) : atual.mensagem_final,
    publico_alvo: d.publico_alvo ?? atual.publico_alvo,
    usuario_ids: d.usuario_ids ?? atual.usuario_ids,
    anonimo: d.anonimo ?? atual.anonimo,
    uma_resposta_por_pessoa: d.uma_resposta_por_pessoa ?? atual.uma_resposta_por_pessoa,
    inicio_em: d.inicio_em !== undefined ? d.inicio_em || null : atual.inicio_em,
    fim_em: d.fim_em !== undefined ? d.fim_em || null : atual.fim_em,
    perguntas,
  };
  if (novo.inicio_em && novo.fim_em && novo.fim_em < novo.inicio_em) throw erro(400, 'O fim do período é antes do início.');
  // Publicado continua publicado só se ainda estiver completo (senão o público veria um formulário quebrado).
  if (atual.status === 'PUBLICADO') {
    const problemas = problemasParaPublicar(novo);
    if (problemas.length) throw erro(400, `Formulário publicado não pode ficar incompleto: ${problemas[0]}`);
  }
  await pool.query(
    `UPDATE formularios SET titulo = $2, descricao = $3, modalidade = $4, cor_tema = $5, mensagem_final = $6,
            publico_alvo = $7, usuario_ids = $8::int[], anonimo = $9,
            uma_resposta_por_pessoa = $10, inicio_em = $11::date, fim_em = $12::date, perguntas = $13::jsonb,
            atualizado_por = $14, atualizado_em = NOW()
     WHERE id = $1`,
    [
      id,
      novo.titulo,
      novo.descricao,
      novo.modalidade,
      novo.cor_tema,
      novo.mensagem_final,
      novo.publico_alvo,
      novo.usuario_ids,
      novo.anonimo,
      novo.uma_resposta_por_pessoa,
      novo.inicio_em,
      novo.fim_em,
      JSON.stringify(perguntas),
      usuarioId,
    ]
  );
  return obter(empresaId, id);
}

async function alterarStatus(empresaId, id, usuarioId, status) {
  const atual = await obter(empresaId, id);
  if (status === 'PUBLICADO') {
    const problemas = problemasParaPublicar(atual);
    if (problemas.length) {
      const e = erro(400, problemas[0]);
      e.problemas = problemas;
      throw e;
    }
  }
  await pool.query(
    `UPDATE formularios SET status = $2::varchar, atualizado_por = $3, atualizado_em = NOW(),
            publicado_em = CASE WHEN $2::varchar = 'PUBLICADO' AND publicado_em IS NULL THEN NOW() ELSE publicado_em END
     WHERE id = $1`,
    [id, status, usuarioId]
  );
  return obter(empresaId, id);
}

async function duplicar(empresaId, id, usuarioId) {
  const f = await obter(empresaId, id);
  const { rows } = await pool.query(
    `INSERT INTO formularios (titulo, descricao, modalidade, perguntas, cor_tema, mensagem_final, publico_alvo,
                              empresa_id, usuario_ids, anonimo, uma_resposta_por_pessoa, token_publico,
                              criado_por, atualizado_por)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9::int[], $10, $11, $12, $13, $13) RETURNING id`,
    [
      texto(`${f.titulo} (cópia)`, 200),
      f.descricao,
      f.modalidade,
      JSON.stringify(f.perguntas),
      f.cor_tema,
      f.mensagem_final,
      f.publico_alvo,
      empresaId,
      f.usuario_ids,
      f.anonimo,
      f.uma_resposta_por_pessoa,
      novoToken(),
      usuarioId,
    ]
  );
  return obter(empresaId, rows[0].id);
}

async function excluir(empresaId, id) {
  const { rowCount } = await pool.query('DELETE FROM formularios WHERE id = $1 AND empresa_id = $2', [id, empresaId]);
  if (!rowCount) throw erro(404, 'Formulário não encontrado.');
}

// Gera um link público novo (o antigo deixa de funcionar).
async function novoLink(empresaId, id, usuarioId) {
  await obter(empresaId, id);
  await pool.query(
    'UPDATE formularios SET token_publico = $2, atualizado_por = $3, atualizado_em = NOW() WHERE id = $1',
    [id, novoToken(), usuarioId]
  );
  return obter(empresaId, id);
}

// Resultados: respostas + (formulário privado) a lista do público-alvo com quem já respondeu.
async function resultados(empresaId, id) {
  const f = await obter(empresaId, id);
  const { rows: respostas } = await pool.query(
    `SELECT r.id, r.respostas, r.origem, r.enviado_em, r.usuario_id, u.nome AS usuario_nome
     FROM formularios_respostas r
     LEFT JOIN usuarios u ON u.id = r.usuario_id
     WHERE r.formulario_id = $1
     ORDER BY r.enviado_em DESC`,
    [id]
  );
  let destinatarios = null;
  if (MODALIDADES_PRIVADAS.includes(f.modalidade)) {
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.username, u.avatar_url, r.enviado_em AS respondido_em,
              COALESCE((SELECT string_agg(COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social), ', ' ORDER BY e.nome_fantasia)
                        FROM usuarios_empresas ue JOIN empresas e ON e.id = ue.empresa_id
                        WHERE ue.usuario_id = u.id), '') AS empresas
       FROM formularios f
       JOIN usuarios u ON ${SQL_PUBLICO_ALVO}
       LEFT JOIN formularios_respostas r ON r.formulario_id = f.id AND r.usuario_id = u.id
       WHERE f.id = $1
       ORDER BY r.enviado_em IS NULL DESC, u.nome`,
      [id]
    );
    destinatarios = rows;
  }
  // Anônimo: sem nome e sem horário (só o dia) — com o horário daria para cruzar a resposta com a lista de
  // quem respondeu. A ordem também deixa de ser a de envio.
  const anonimo = f.anonimo && f.modalidade !== 'PUBLICO';
  const diaBr = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const lista = respostas.map((r) => ({
    id: r.id,
    origem: r.origem,
    enviado_em: anonimo ? null : r.enviado_em,
    enviado_dia: anonimo ? diaBr(r.enviado_em) : r.enviado_em,
    usuario_nome: anonimo ? null : r.usuario_nome,
    respostas: r.respostas,
  }));
  if (anonimo) lista.sort((a, b) => b.enviado_dia.localeCompare(a.enviado_dia) || a.id - b.id);
  return {
    formulario: f,
    respostas: lista,
    destinatarios: destinatarios
      ? destinatarios.map((d) => ({ ...d, respondeu: Boolean(d.respondido_em), respondido_em: anonimo ? null : d.respondido_em }))
      : null,
  };
}

async function excluirResposta(empresaId, formularioId, respostaId) {
  await obter(empresaId, formularioId);
  const { rowCount } = await pool.query('DELETE FROM formularios_respostas WHERE id = $1 AND formulario_id = $2', [
    respostaId,
    formularioId,
  ]);
  if (!rowCount) throw erro(404, 'Resposta não encontrada.');
}

// Usuários que podem ser escolhidos no público-alvo: os ativos vinculados à empresa e os Master.
async function usuariosParaPublicoAlvo(empresaId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.username, u.permissao
     FROM usuarios u
     WHERE u.ativo
       AND (u.permissao = 'MASTER'
            OR EXISTS (SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = $1))
     ORDER BY u.nome`,
    [empresaId]
  );
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Usuário logado: formulários privados que ele ainda precisa responder.
// ---------------------------------------------------------------------------------------------

const CAMPOS_RESPONDER = `f.id, f.titulo, f.descricao, f.modalidade, f.perguntas, f.cor_tema, f.mensagem_final, f.anonimo,
  COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_nome`;

async function pendentesDoUsuario(usuarioId) {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_RESPONDER}
     FROM formularios f
     JOIN empresas e ON e.id = f.empresa_id
     JOIN usuarios u ON u.id = $1
     WHERE f.status = 'PUBLICADO'
       AND f.modalidade IN ('PRIVADO', 'PRIVADO_OBRIGATORIO')
       AND (f.inicio_em IS NULL OR f.inicio_em <= ${HOJE_SQL})
       AND (f.fim_em IS NULL OR f.fim_em >= ${HOJE_SQL})
       AND ${SQL_PUBLICO_ALVO}
       AND NOT EXISTS (SELECT 1 FROM formularios_respostas r WHERE r.formulario_id = f.id AND r.usuario_id = $1)
     ORDER BY (f.modalidade = 'PRIVADO_OBRIGATORIO') DESC, f.publicado_em ASC NULLS LAST, f.id`,
    [usuarioId]
  );
  return rows;
}

async function responderComoUsuario(formularioId, usuarioId, respostas, meta) {
  const pendentes = await pendentesDoUsuario(usuarioId);
  const f = pendentes.find((p) => p.id === formularioId);
  if (!f) throw erro(409, 'Este formulário não está mais aguardando a sua resposta.');
  const valores = validarRespostas(f.perguntas, respostas);
  try {
    await pool.query(
      `INSERT INTO formularios_respostas (formulario_id, usuario_id, respostas, origem, ip, user_agent)
       VALUES ($1, $2, $3::jsonb, 'SISTEMA', $4, $5)`,
      [formularioId, usuarioId, JSON.stringify(valores), meta.ip, meta.userAgent]
    );
  } catch (e) {
    if (e.code === '23505') throw erro(409, 'Você já respondeu este formulário.');
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Link público
// ---------------------------------------------------------------------------------------------

async function situacaoPublica(token) {
  const { rows } = await pool.query(
    `SELECT f.id, f.titulo, f.descricao, f.modalidade, f.status, f.perguntas, f.cor_tema, f.mensagem_final,
            f.uma_resposta_por_pessoa, f.inicio_em::text AS inicio_em, f.fim_em::text AS fim_em,
            ${HOJE_SQL}::text AS hoje,
            COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_nome, e.logo AS empresa_logo
     FROM formularios f JOIN empresas e ON e.id = f.empresa_id
     WHERE f.token_publico = $1`,
    [token]
  );
  const f = rows[0];
  if (!f || f.modalidade !== 'PUBLICO' || f.status === 'RASCUNHO') throw erro(404, 'Formulário não encontrado.');
  let indisponivel = null;
  if (f.status === 'ENCERRADO') indisponivel = 'ENCERRADO';
  else if (f.inicio_em && f.inicio_em > f.hoje) indisponivel = 'NAO_INICIADO';
  else if (f.fim_em && f.fim_em < f.hoje) indisponivel = 'ENCERRADO';
  return { f, indisponivel };
}

async function obterPublico(token) {
  const { f, indisponivel } = await situacaoPublica(token);
  const base = {
    titulo: f.titulo,
    descricao: f.descricao,
    cor_tema: f.cor_tema,
    inicio_em: f.inicio_em,
    fim_em: f.fim_em,
    empresa_nome: f.empresa_nome,
    empresa_logo: f.empresa_logo,
  };
  if (indisponivel) return { ...base, indisponivel };
  return {
    ...base,
    id: f.id,
    perguntas: f.perguntas,
    mensagem_final: f.mensagem_final,
    uma_resposta_por_pessoa: f.uma_resposta_por_pessoa,
  };
}

async function responderPublico(token, respostas, meta) {
  const { f, indisponivel } = await situacaoPublica(token);
  if (indisponivel) throw erro(410, 'Este formulário não está aceitando respostas.');
  const valores = validarRespostas(f.perguntas, respostas);
  await pool.query(
    `INSERT INTO formularios_respostas (formulario_id, usuario_id, respostas, origem, ip, user_agent)
     VALUES ($1, NULL, $2::jsonb, 'PUBLICO', $3, $4)`,
    [f.id, JSON.stringify(valores), meta.ip, meta.userAgent]
  );
  return { mensagem_final: f.mensagem_final };
}

module.exports = {
  TIPOS,
  listar,
  obter,
  criar,
  salvar,
  alterarStatus,
  duplicar,
  excluir,
  novoLink,
  resultados,
  excluirResposta,
  usuariosParaPublicoAlvo,
  pendentesDoUsuario,
  responderComoUsuario,
  obterPublico,
  responderPublico,
};
