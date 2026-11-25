const pool = require('../../config/db');
const env = require('../../config/env');
const zapiService = require('../integracoes-zapi/zapi.service');
const empresasService = require('../empresas/empresas.service');
const saldosService = require('../saldo-contas-bancarias/saldos.service');
const matriz = require('../matriz-alcadas/matrizAlcadas.service');
const { GATILHOS, DESTINATARIOS, MODELOS } = require('./catalogo');

// Operações > Workflows (database/migrations/2026-11-19-workflows.sql e -dre-reprovacao-workflow-topicos.sql): por
// empresa, automações com TÓPICOS (passos) GATILHO → AÇÃO. Quem gera o evento chama `disparar(empresaId, gatilho,
// contexto)` DEPOIS de concluir (não espera: roda em segundo plano); cada tópico daquele gatilho, dos workflows
// ativos, roda e grava uma execução (workflow_execucoes, com o índice do tópico) com o resultado por destinatário. A ação de hoje: WhatsApp pela conexão Z-API escolhida, com a mensagem digitada
// (variáveis {chave} trocadas por destinatário) e, se pedido, o Excel de auditoria da DRE da versão anexo.

const db = pool.base;
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesExtenso = (iso) => (iso ? `${MESES[Number(String(iso).slice(5, 7)) - 1]}/${String(iso).slice(0, 4)}` : '');
const dataHora = (d) =>
  new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const primeiroNome = (nome = '') => String(nome).trim().split(/\s+/)[0] || nome;
const telefoneDe = (u) => (u.telefone_ddd && u.telefone_numero ? `${u.telefone_ddd}${u.telefone_numero}` : null);

// {chave} → valor (chave desconhecida fica como está, pra a pessoa ver que digitou errado).
const preencher = (texto, valores) => String(texto || '').replace(/\{(\w+)\}/g, (m, k) => (valores[k] !== undefined && valores[k] !== null ? String(valores[k]) : m));

// ---------------------------------------------------------------------------------------- cadastro

async function conexoesZapi(empresaId) {
  const { rows } = await db.query('SELECT id, nome_conexao AS nome FROM integracoes_zapi WHERE empresa_id = $1 AND ativo ORDER BY nome_conexao', [empresaId]);
  return rows;
}

async function opcoes(empresaId) {
  const [conexoes, usuarios] = await Promise.all([conexoesZapi(empresaId), saldosService.listUsuariosElegiveisComunicar(empresaId)]);
  return {
    gatilhos: Object.entries(GATILHOS).map(([id, g]) => ({ id, rotulo: g.rotulo, descricao: g.descricao, variaveis: g.variaveis })),
    destinatarios: Object.entries(DESTINATARIOS).map(([id, d]) => ({ id, rotulo: d.rotulo })),
    modelos: MODELOS,
    conexoes,
    usuarios,
  };
}

async function listar(empresaId) {
  const { rows } = await db.query(
    `SELECT w.id, w.nome, w.passos, w.ativo, w.criado_em, w.atualizado_em, c.nome AS criado_por, a.nome AS atualizado_por,
            (SELECT row_to_json(e) FROM (SELECT x.status, x.iniciado_em, x.resultado, x.passo, x.gatilho FROM workflow_execucoes x
                                          WHERE x.workflow_id = w.id ORDER BY x.iniciado_em DESC LIMIT 1) e) AS ultima_execucao
       FROM workflows w
       LEFT JOIN usuarios c ON c.id = w.criado_por
       LEFT JOIN usuarios a ON a.id = w.atualizado_por
      WHERE w.empresa_id = $1
      ORDER BY w.nome`,
    [empresaId]
  );
  const ids = [...new Set(rows.flatMap((w) => w.passos.flatMap((p) => p.acao?.destinatarios?.usuarios || [])))];
  const [{ rows: us }, conexoes] = await Promise.all([
    ids.length ? db.query('SELECT id, nome FROM usuarios WHERE id = ANY($1::int[])', [ids]) : { rows: [] },
    db.query('SELECT id, nome_conexao AS nome FROM integracoes_zapi WHERE empresa_id = $1', [empresaId]).then((r) => r.rows),
  ]);
  const nome = new Map(us.map((u) => [u.id, u.nome]));
  const conexao = new Map(conexoes.map((c) => [c.id, c.nome]));
  return rows.map((w) => ({
    ...w,
    passos: w.passos.map((p) => ({
      ...p,
      gatilho_rotulo: GATILHOS[p.gatilho]?.rotulo || p.gatilho,
      conexao: conexao.get(Number(p.acao?.conexao_id)) || null,
      destinatarios_nomes: (p.acao?.destinatarios?.usuarios || []).map((id) => nome.get(id)).filter(Boolean),
    })),
  }));
}

// Confere e normaliza um tópico (gatilho + ação) que vem da tela; `n` = o número dele (pras mensagens).
async function validarPasso(empresaId, passo, n, cache) {
  const onde = `Tópico ${n}: `;
  const { gatilho, acao } = passo || {};
  if (!GATILHOS[gatilho]) throw erro(400, `${onde}escolha o gatilho.`);
  if (!acao || acao.tipo !== 'WHATSAPP') throw erro(400, `${onde}ação inválida.`);
  const conexaoId = Number(acao.conexao_id) || null;
  if (!conexaoId) throw erro(400, `${onde}escolha a conexão de WhatsApp (Z-API) que vai enviar.`);
  if (!cache.conexoes.some((c) => c.id === conexaoId)) throw erro(400, `${onde}a conexão escolhida não é desta empresa ou está inativa.`);
  const modo = acao.destinatarios?.modo;
  if (!DESTINATARIOS[modo]) throw erro(400, `${onde}escolha quem recebe.`);
  let usuarios = [];
  if (modo === 'USUARIOS') {
    usuarios = [...new Set((acao.destinatarios.usuarios || []).map(Number).filter(Boolean))];
    if (!usuarios.length) throw erro(400, `${onde}escolha ao menos um usuário para receber.`);
    if (usuarios.some((id) => !cache.usuarios.has(id))) throw erro(400, `${onde}há usuário escolhido sem acesso a esta empresa.`);
  }
  if (!String(acao.mensagem || '').trim()) throw erro(400, `${onde}escreva a mensagem.`);
  return {
    gatilho,
    acao: {
      tipo: 'WHATSAPP',
      conexao_id: conexaoId,
      destinatarios: { modo, usuarios },
      mensagem: String(acao.mensagem).slice(0, 4000),
      anexar_excel_dre: Boolean(acao.anexar_excel_dre),
    },
  };
}

async function validar(empresaId, { nome, passos }) {
  if (!String(nome || '').trim()) throw erro(400, 'Dê um nome ao workflow.');
  if (!Array.isArray(passos) || !passos.length) throw erro(400, 'Inclua ao menos um tópico.');
  if (passos.length > 20) throw erro(400, 'No máximo 20 tópicos por workflow.');
  const cache = {
    conexoes: await conexoesZapi(empresaId),
    usuarios: new Set((await saldosService.listUsuariosElegiveisComunicar(empresaId)).map((u) => u.id)),
  };
  const normalizados = [];
  for (let i = 0; i < passos.length; i += 1) normalizados.push(await validarPasso(empresaId, passos[i], i + 1, cache));
  return { nome: String(nome).trim().slice(0, 120), passos: normalizados };
}

async function criar(empresaId, dados, usuarioId) {
  const w = await validar(empresaId, dados);
  const agora = new Date();
  const { rows } = await db.query(
    `INSERT INTO workflows (empresa_id, nome, passos, ativo, criado_por, criado_em, atualizado_por, atualizado_em)
     VALUES ($1, $2, $3, TRUE, $4, $5, $4, $5) RETURNING id`,
    [empresaId, w.nome, JSON.stringify(w.passos), usuarioId, agora]
  );
  return { id: rows[0].id, workflows: await listar(empresaId) };
}

async function atualizar(empresaId, id, dados, usuarioId) {
  const w = await validar(empresaId, dados);
  const { rowCount } = await db.query(
    `UPDATE workflows SET nome = $3, passos = $4, atualizado_por = $5, atualizado_em = $6 WHERE empresa_id = $1 AND id = $2`,
    [empresaId, id, w.nome, JSON.stringify(w.passos), usuarioId, new Date()]
  );
  if (!rowCount) throw erro(404, 'Workflow não encontrado.');
  return { workflows: await listar(empresaId) };
}

async function definirAtivo(empresaId, id, ativo, usuarioId) {
  const { rowCount } = await db.query('UPDATE workflows SET ativo = $3, atualizado_por = $4, atualizado_em = $5 WHERE empresa_id = $1 AND id = $2', [
    empresaId,
    id,
    Boolean(ativo),
    usuarioId,
    new Date(),
  ]);
  if (!rowCount) throw erro(404, 'Workflow não encontrado.');
  return { workflows: await listar(empresaId) };
}

async function excluir(empresaId, id) {
  const { rowCount } = await db.query('DELETE FROM workflows WHERE empresa_id = $1 AND id = $2', [empresaId, id]);
  if (!rowCount) throw erro(404, 'Workflow não encontrado.');
  return { workflows: await listar(empresaId) };
}

async function execucoes(empresaId, { limite = 100 } = {}) {
  const { rows } = await db.query(
    `SELECT x.id, x.workflow_id, w.nome AS workflow, x.passo, x.gatilho, x.contexto, x.status, x.resultado, x.iniciado_em, x.concluido_em
       FROM workflow_execucoes x JOIN workflows w ON w.id = x.workflow_id
      WHERE x.empresa_id = $1 ORDER BY x.iniciado_em DESC LIMIT $2`,
    [empresaId, limite]
  );
  return rows.map((r) => ({ ...r, gatilho_rotulo: GATILHOS[r.gatilho]?.rotulo || r.gatilho }));
}

// ---------------------------------------------------------------------------------------- execução

// O evento da DRE: a versão (`contexto.versao` = número) e os valores das variáveis.
async function dadosDaDre(empresaId, gatilho, contexto) {
  const { rows } = await db.query(
    `SELECT numero, to_char(corte, 'YYYY-MM-DD') AS corte, fechada_por, fechada_por_nome, aprovada_por_nome, reprovada_por_nome,
            reprovacao_motivo
       FROM dre_versoes WHERE empresa_id = $1 AND numero = $2`,
    [empresaId, contexto.versao]
  );
  const v = rows[0];
  if (!v) throw new Error(`versão ${contexto.versao} da DRE não encontrada`);
  const [empresa, aprovador] = await Promise.all([empresasService.getById(empresaId), matriz.usuarioDo(empresaId, 'DRE', 'APROVADOR')]);
  return {
    versao: v,
    aprovador,
    valores: {
      empresa: empresa?.nome_fantasia?.trim() || empresa?.razao_social || '',
      versao: v.numero,
      realizado_ate: mesExtenso(v.corte),
      responsavel: v.fechada_por_nome || '',
      aprovador: v.aprovada_por_nome || aprovador?.nome || '',
      data: dataHora(contexto.em || new Date()),
      motivo: v.reprovacao_motivo || '',
      reprovador: v.reprovada_por_nome || '',
      link: GATILHOS[gatilho].link(env.frontendUrl.replace(/\/+$/, ''), empresaId),
    },
  };
}

// O Excel de auditoria da DRE da versão (a mesma exportação da tela), do ano do realizado: jan a dez.
async function excelDaDre(empresaId, numero, corte, usuarioId) {
  const versoes = require('../dre-versoes/dreVersoes.service');
  const excel = require('../dre-exportacao/exportacao.isolada'); // worker: não trava o sistema
  const ctx = await versoes.resolver(empresaId, Number(numero));
  const ano = corte.slice(0, 4);
  return pool.comContexto(ctx, () =>
    excel.gerar(empresaId, { de: `${ano}-01-01`, ate: `${ano}-12-31`, centros: [], projecao: { fonte: 'atual' } }, usuarioId)
  );
}

async function executar(w, indice, gatilho, contexto) {
  const iniciado = new Date();
  const { rows } = await db.query(
    `INSERT INTO workflow_execucoes (workflow_id, empresa_id, passo, gatilho, contexto, status, iniciado_em)
     VALUES ($1, $2, $3, $4, $5, 'EXECUTANDO', $6) RETURNING id`,
    [w.id, w.empresa_id, indice, gatilho, contexto, iniciado]
  );
  const execId = rows[0].id;
  const terminar = (status, resultado) =>
    db.query('UPDATE workflow_execucoes SET status = $2, resultado = $3, concluido_em = $4 WHERE id = $1', [execId, status, resultado, new Date()]);
  try {
    const { acao } = w.passos[indice];
    const d = await dadosDaDre(w.empresa_id, gatilho, contexto);
    // Quem recebe.
    let ids = [];
    if (acao.destinatarios.modo === 'APROVADOR') {
      if (!d.aprovador) return terminar('IGNORADO', { motivo: 'A empresa não tem Aprovador da DRE na Matriz de Alçadas.', enviados: [], falhas: [] });
      ids = [d.aprovador.id];
    } else if (acao.destinatarios.modo === 'RESPONSAVEL') {
      if (!d.versao.fechada_por) return terminar('IGNORADO', { motivo: 'A versão não tem um usuário responsável (foi salva pelo sistema).', enviados: [], falhas: [] });
      ids = [d.versao.fechada_por];
    } else ids = acao.destinatarios.usuarios || [];
    const { rows: us } = ids.length
      ? await db.query('SELECT id, nome, telefone_ddd, telefone_numero FROM usuarios WHERE id = ANY($1::int[]) AND ativo', [ids])
      : { rows: [] };
    if (!us.length) return terminar('IGNORADO', { motivo: 'Nenhum destinatário ativo.', enviados: [], falhas: [] });
    // O anexo, montado uma vez só.
    let anexo = null;
    if (acao.anexar_excel_dre) {
      const { buffer, nome } = await excelDaDre(w.empresa_id, d.versao.numero, d.versao.corte, contexto.usuario_id || w.criado_por);
      anexo = { base64: Buffer.from(buffer).toString('base64'), nome: nome.replace(/\.xlsx$/i, ` - Versão ${d.versao.numero}.xlsx`) };
    }
    const enviados = [];
    const falhas = [];
    for (const u of us) {
      try {
        const telefone = telefoneDe(u);
        if (!telefone) throw new Error('sem telefone no cadastro do usuário');
        const mensagem = preencher(acao.mensagem, { ...d.valores, destinatario: primeiroNome(u.nome) });
        if (anexo) {
          await zapiService.enviarDocumento(acao.conexao_id, {
            telefone,
            documentoBase64: anexo.base64,
            legenda: mensagem,
            extensao: 'xlsx',
            mimeType: MIME_XLSX,
            nomeArquivo: anexo.nome,
          });
        } else {
          await zapiService.enviarMensagemTexto(acao.conexao_id, { telefone, mensagem });
        }
        enviados.push({ nome: u.nome });
      } catch (e) {
        falhas.push({ nome: u.nome, motivo: e.message });
      }
    }
    const status = !falhas.length ? 'SUCESSO' : enviados.length ? 'PARCIAL' : 'ERRO';
    return terminar(status, { enviados, falhas, anexo: anexo ? anexo.nome : null });
  } catch (e) {
    console.error(`[workflows] workflow ${w.id}:`, e.message);
    return terminar('ERRO', { motivo: e.message, enviados: [], falhas: [] });
  }
}

// Chamado por quem gera o evento, depois de concluir. Não espera nem lança: roda em segundo plano, fora de
// qualquer contexto de versão da DRE.
function disparar(empresaId, gatilho, contexto = {}) {
  const ctx = { ...contexto, em: contexto.em || new Date().toISOString() };
  setImmediate(async () => {
    try {
      const { rows } = await db.query('SELECT * FROM workflows WHERE empresa_id = $1 AND ativo ORDER BY id', [empresaId]);
      for (const w of rows) {
        for (let i = 0; i < w.passos.length; i += 1) {
          if (w.passos[i].gatilho === gatilho) await executar(w, i, gatilho, ctx);
        }
      }
    } catch (e) {
      console.error(`[workflows] disparar ${gatilho} (empresa ${empresaId}):`, e.message);
    }
  });
}

module.exports = { opcoes, listar, criar, atualizar, definirAtivo, excluir, execucoes, disparar, preencher };
