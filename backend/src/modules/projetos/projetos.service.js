const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../../config/db');
const { agoraSP } = require('../monitor-integracoes/tempo');
const saldosService = require('../saldo-contas-bancarias/saldos.service');

// ---------------------------------------------------------------------------------------
// Home > Plano de Voo — Kanban de atividades.
//   Buckets: AGUARDANDO, PROGRESSO, ATRASADO, CONCLUIDO, FINALIZADO. "Atrasado" não é gravado:
//   um card em Aguardando/Progresso cuja data fim esperada já passou (calendário de Brasília)
//   está atrasado — calculado em toda leitura, então "vai sozinho" pra lá sem rotina agendada.
//   Concluído (entregue pelo responsável, aguardando o criador) e Finalizado nunca atrasam.
//   Regras (pedido do usuário):
//   - só o CRIADOR edita o card (campos) e exclui;
//   - criador e responsável comentam e anexam;
//   - só o RESPONSÁVEL move (Aguardando, Progresso, Concluído); de Atrasado só sai pra
//     Concluído; ninguém arrasta pra Atrasado (é automático);
//   - só o CRIADOR finaliza, a partir de Concluído.
//   Visões: "minhas" = cards em que sou o responsável (criados por mim pra mim ou por outros
//   pra mim); "equipe" = cards que eu criei pra outras pessoas.
// ---------------------------------------------------------------------------------------

const UPLOADS_DIR = path.join(__dirname, '..', '..', '..', 'uploads', 'projetos');
// O que o responsável pode escolher arrastando (Finalizado é só pelo criador, via finalizar).
const MOVIMENTO_RESPONSAVEL = ['AGUARDANDO', 'PROGRESSO', 'CONCLUIDO'];
const ROTULO = { AGUARDANDO: 'Aguardando', PROGRESSO: 'Progresso', ATRASADO: 'Atrasado', CONCLUIDO: 'Concluído', FINALIZADO: 'Finalizado' };

function erro(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

const hoje = () => agoraSP().data;

function bucketDe(card, dataHoje = hoje()) {
  // Concluído e Finalizado nunca atrasam: o trabalho já foi entregue.
  if (card.status === 'FINALIZADO' || card.status === 'CONCLUIDO') return card.status;
  if (card.data_fim < dataHoje) return 'ATRASADO';
  return card.status;
}

async function registrar(cardId, usuarioId, acao, detalhe = null, client = pool) {
  await client.query(
    'INSERT INTO projetos_historico (card_id, usuario_id, acao, detalhe, criado_em) VALUES ($1, $2, $3, $4, $5)',
    [cardId, usuarioId, acao, detalhe ? String(detalhe).slice(0, 300) : null, new Date()]
  );
}

// Quem pode ser responsável num card da empresa: todo Master + quem tem a empresa no cadastro.
async function responsaveisElegiveis(empresaId) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.avatar_url
     FROM usuarios u
     WHERE u.ativo = TRUE
       AND (u.permissao = 'MASTER' OR EXISTS (
             SELECT 1 FROM usuarios_empresas ue WHERE ue.usuario_id = u.id AND ue.empresa_id = $1))
     ORDER BY u.nome`,
    [empresaId]
  );
  return rows;
}

const CAMPOS_CARD = `
  c.id, c.empresa_id, COALESCE(NULLIF(e.nome_fantasia, ''), e.razao_social) AS empresa_nome,
  c.assunto, c.descricao, TO_CHAR(c.data_inicio, 'YYYY-MM-DD') AS data_inicio, TO_CHAR(c.data_fim, 'YYYY-MM-DD') AS data_fim,
  c.responsavel_id, c.criador_id, c.status, c.concluido_em, c.finalizado_em, c.criado_em, c.atualizado_em`;

async function usuariosDe(ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  const { rows } = await pool.query('SELECT id, nome, avatar_url FROM usuarios WHERE id = ANY($1::int[])', [unicos]);
  return Object.fromEntries(rows.map((u) => [u.id, { id: u.id, nome: u.nome, avatar_url: u.avatar_url || null }]));
}

async function listar(usuarioId, { visao, empresaId }) {
  const params = [usuarioId];
  let filtro = visao === 'equipe' ? 'c.criador_id = $1 AND c.responsavel_id <> $1' : 'c.responsavel_id = $1';
  if (empresaId) {
    params.push(empresaId);
    filtro += ` AND c.empresa_id = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_CARD},
            (SELECT COUNT(*)::int FROM projetos_comentarios m WHERE m.card_id = c.id) AS comentarios,
            (SELECT COUNT(*)::int FROM projetos_anexos a WHERE a.card_id = c.id) AS anexos
     FROM projetos_cards c JOIN empresas e ON e.id = c.empresa_id
     WHERE ${filtro}
     ORDER BY c.data_fim, c.id`,
    params
  );
  const dataHoje = hoje();
  const cards = rows.map((c) => ({ ...c, bucket: bucketDe(c, dataHoje) }));
  const usuarios = await usuariosDe(cards.flatMap((c) => [c.responsavel_id, c.criador_id]));
  return { hoje: dataHoje, cards, usuarios };
}

async function carregar(id) {
  const { rows } = await pool.query(`SELECT ${CAMPOS_CARD} FROM projetos_cards c JOIN empresas e ON e.id = c.empresa_id WHERE c.id = $1`, [
    id,
  ]);
  return rows[0] || null;
}

// Só criador e responsável enxergam o card (404 pros demais — não revela que existe).
async function carregarVisivel(id, usuarioId) {
  const card = await carregar(id);
  if (!card || (card.criador_id !== usuarioId && card.responsavel_id !== usuarioId)) throw erro(404, 'Atividade não encontrada.');
  return card;
}

function permissoes(card, usuarioId) {
  const criador = card.criador_id === usuarioId;
  const responsavel = card.responsavel_id === usuarioId;
  return {
    editar: criador,
    excluir: criador,
    mover: responsavel && card.status !== 'FINALIZADO',
    finalizar: criador && card.status === 'CONCLUIDO',
    devolver: criador && card.status === 'CONCLUIDO',
    comentar: criador || responsavel,
    anexar: criador || responsavel,
  };
}

async function obter(id, usuarioId) {
  const card = await carregarVisivel(id, usuarioId);
  const [{ rows: comentarios }, { rows: anexos }, { rows: historico }] = await Promise.all([
    pool.query('SELECT id, usuario_id, texto, criado_em FROM projetos_comentarios WHERE card_id = $1 ORDER BY criado_em, id', [id]),
    pool.query(
      'SELECT id, usuario_id, nome_original, mime, tamanho, criado_em FROM projetos_anexos WHERE card_id = $1 ORDER BY criado_em, id',
      [id]
    ),
    pool.query('SELECT id, usuario_id, acao, detalhe, criado_em FROM projetos_historico WHERE card_id = $1 ORDER BY criado_em DESC, id DESC', [id]),
  ]);
  const usuarios = await usuariosDe([
    card.responsavel_id,
    card.criador_id,
    ...comentarios.map((c) => c.usuario_id),
    ...anexos.map((a) => a.usuario_id),
    ...historico.map((h) => h.usuario_id),
  ]);
  return {
    card: { ...card, bucket: bucketDe(card) },
    comentarios,
    anexos,
    historico,
    usuarios,
    permissoes: permissoes(card, usuarioId),
  };
}

async function validarDados(usuarioId, dados) {
  await saldosService.assertAcessoEmpresa(usuarioId, dados.empresa_id);
  if (dados.data_fim < dados.data_inicio) throw erro(400, 'A data fim esperada não pode ser antes da data de início.');
  const elegiveis = await responsaveisElegiveis(dados.empresa_id);
  if (!elegiveis.some((u) => u.id === dados.responsavel_id)) throw erro(400, 'O responsável escolhido não tem acesso a esta empresa.');
}

async function criar(usuarioId, dados) {
  await validarDados(usuarioId, dados);
  const agora = new Date();
  const { rows } = await pool.query(
    `INSERT INTO projetos_cards (empresa_id, assunto, descricao, data_inicio, data_fim, responsavel_id, criador_id, status, criado_em, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'AGUARDANDO', $8, $8) RETURNING id`,
    [dados.empresa_id, dados.assunto, dados.descricao || null, dados.data_inicio, dados.data_fim, dados.responsavel_id, usuarioId, agora]
  );
  await registrar(rows[0].id, usuarioId, 'CRIOU');
  return obter(rows[0].id, usuarioId);
}

const brData = (iso) => iso.split('-').reverse().join('/');

async function atualizar(id, usuarioId, dados) {
  const atual = await carregarVisivel(id, usuarioId);
  if (atual.criador_id !== usuarioId) throw erro(403, 'Só quem criou a atividade pode editá-la.');
  await validarDados(usuarioId, dados);

  const mudancas = [];
  if (dados.assunto !== atual.assunto) mudancas.push('assunto');
  if ((dados.descricao || '') !== (atual.descricao || '')) mudancas.push('descrição');
  if (dados.empresa_id !== atual.empresa_id) mudancas.push('empresa');
  if (dados.data_inicio !== atual.data_inicio) mudancas.push(`início para ${brData(dados.data_inicio)}`);
  if (dados.data_fim !== atual.data_fim) mudancas.push(`fim esperado para ${brData(dados.data_fim)}`);
  if (dados.responsavel_id !== atual.responsavel_id) {
    const nomes = await usuariosDe([dados.responsavel_id]);
    mudancas.push(`responsável para ${nomes[dados.responsavel_id]?.nome || 'outro usuário'}`);
  }
  if (!mudancas.length) return obter(id, usuarioId);

  await pool.query(
    `UPDATE projetos_cards SET empresa_id = $1, assunto = $2, descricao = $3, data_inicio = $4, data_fim = $5,
       responsavel_id = $6, atualizado_em = $7 WHERE id = $8`,
    [dados.empresa_id, dados.assunto, dados.descricao || null, dados.data_inicio, dados.data_fim, dados.responsavel_id, new Date(), id]
  );
  await registrar(id, usuarioId, 'EDITOU', `Alterou ${mudancas.join(', ')}`);
  // Trocou o responsável e o editor deixou de enxergar? Ele é o criador — sempre enxerga.
  return obter(id, usuarioId);
}

async function excluir(id, usuarioId) {
  const atual = await carregarVisivel(id, usuarioId);
  if (atual.criador_id !== usuarioId) throw erro(403, 'Só quem criou a atividade pode excluí-la.');
  await pool.query('DELETE FROM projetos_cards WHERE id = $1', [id]);
  fs.rm(path.join(UPLOADS_DIR, String(id)), { recursive: true, force: true }, () => {});
}

// Movimentação entre buckets (arrastar no quadro). Só o responsável, e só entre Aguardando,
// Progresso e Concluído — Finalizado é decisão do criador (finalizar). De Atrasado só sai pra
// Concluído; fora de Concluído, com a data fim vencida, a atividade voltaria a atrasar.
async function mover(id, usuarioId, destino) {
  const atual = await carregarVisivel(id, usuarioId);
  if (atual.responsavel_id !== usuarioId) throw erro(403, 'Só o responsável pela atividade pode movê-la.');
  if (destino === 'ATRASADO') throw erro(400, 'Atrasado é automático: a atividade vai pra lá sozinha quando passa da data fim esperada.');
  if (destino === 'FINALIZADO') throw erro(403, 'Só quem criou a atividade pode finalizá-la (a partir de Concluído).');
  if (!MOVIMENTO_RESPONSAVEL.includes(destino)) throw erro(400, 'Bucket inválido.');

  const dataHoje = hoje();
  const origem = bucketDe(atual, dataHoje);
  if (origem === destino) return obter(id, usuarioId);
  if (origem === 'FINALIZADO') throw erro(400, 'Esta atividade já foi finalizada.');
  if (origem === 'ATRASADO' && destino !== 'CONCLUIDO') {
    throw erro(400, 'Uma atividade atrasada só pode ir para Concluído.');
  }
  if (destino !== 'CONCLUIDO' && atual.data_fim < dataHoje) {
    throw erro(400, 'A data fim esperada já passou — fora de Concluído, a atividade fica em Atrasado.');
  }

  await pool.query('UPDATE projetos_cards SET status = $1, concluido_em = $2, atualizado_em = $3 WHERE id = $4', [
    destino,
    destino === 'CONCLUIDO' ? new Date() : null,
    new Date(),
    id,
  ]);
  await registrar(id, usuarioId, 'MOVEU', `${ROTULO[origem]} → ${ROTULO[destino]}`);
  return obter(id, usuarioId);
}

// Devolver: o criador não aprova o que foi concluído e manda de volta pro responsável. Volta
// pra Progresso — e, se a data fim já passou, cai sozinho em Atrasado (bucket calculado).
async function devolver(id, usuarioId) {
  const atual = await carregarVisivel(id, usuarioId);
  if (atual.criador_id !== usuarioId) throw erro(403, 'Só quem criou a atividade pode devolvê-la.');
  if (atual.status !== 'CONCLUIDO') throw erro(400, 'Só dá pra devolver uma atividade que está em Concluído.');
  await pool.query("UPDATE projetos_cards SET status = 'PROGRESSO', concluido_em = NULL, atualizado_em = $1 WHERE id = $2", [new Date(), id]);
  const destino = bucketDe({ ...atual, status: 'PROGRESSO' });
  await registrar(id, usuarioId, 'DEVOLVEU', `Concluído → ${ROTULO[destino]}`);
  return obter(id, usuarioId);
}

// Finalizar: só o criador, e só o que o responsável já concluiu.
async function finalizar(id, usuarioId) {
  const atual = await carregarVisivel(id, usuarioId);
  if (atual.criador_id !== usuarioId) throw erro(403, 'Só quem criou a atividade pode finalizá-la.');
  if (atual.status !== 'CONCLUIDO') throw erro(400, 'Só dá pra finalizar uma atividade que está em Concluído.');
  await pool.query("UPDATE projetos_cards SET status = 'FINALIZADO', finalizado_em = $1, atualizado_em = $1 WHERE id = $2", [new Date(), id]);
  await registrar(id, usuarioId, 'MOVEU', 'Concluído → Finalizado');
  return obter(id, usuarioId);
}

async function comentar(id, usuarioId, texto) {
  const card = await carregarVisivel(id, usuarioId);
  if (!permissoes(card, usuarioId).comentar) throw erro(403, 'Você não pode comentar nesta atividade.');
  await pool.query('INSERT INTO projetos_comentarios (card_id, usuario_id, texto, criado_em) VALUES ($1, $2, $3, $4)', [
    id,
    usuarioId,
    texto,
    new Date(),
  ]);
  return obter(id, usuarioId);
}

async function excluirComentario(id, comentarioId, usuarioId) {
  await carregarVisivel(id, usuarioId);
  const { rowCount } = await pool.query('DELETE FROM projetos_comentarios WHERE id = $1 AND card_id = $2 AND usuario_id = $3', [
    comentarioId,
    id,
    usuarioId,
  ]);
  if (!rowCount) throw erro(403, 'Só quem escreveu o comentário pode excluí-lo.');
  return obter(id, usuarioId);
}

// `arquivos` = req.files do multer (gravados em pasta temporária) — move pra pasta do card.
async function anexar(id, usuarioId, arquivos) {
  const card = await carregarVisivel(id, usuarioId);
  if (!permissoes(card, usuarioId).anexar) throw erro(403, 'Você não pode anexar arquivos nesta atividade.');
  if (!arquivos?.length) throw erro(400, 'Nenhum arquivo enviado.');
  const pasta = path.join(UPLOADS_DIR, String(id));
  fs.mkdirSync(pasta, { recursive: true });
  for (const arq of arquivos) {
    // multer entrega o nome original em latin1 — volta pra UTF-8 (acentos).
    const nome = Buffer.from(arq.originalname, 'latin1').toString('utf8');
    const armazenado = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(nome).toLowerCase().slice(0, 12)}`;
    fs.copyFileSync(arq.path, path.join(pasta, armazenado));
    fs.unlink(arq.path, () => {});
    await pool.query(
      `INSERT INTO projetos_anexos (card_id, usuario_id, nome_original, arquivo_armazenado, mime, tamanho, criado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, usuarioId, nome.slice(0, 255), armazenado, arq.mimetype || null, arq.size, new Date()]
    );
    await registrar(id, usuarioId, 'ANEXOU', nome);
  }
  return obter(id, usuarioId);
}

async function arquivoDoAnexo(id, anexoId, usuarioId) {
  await carregarVisivel(id, usuarioId);
  const { rows } = await pool.query('SELECT * FROM projetos_anexos WHERE id = $1 AND card_id = $2', [anexoId, id]);
  if (!rows[0]) throw erro(404, 'Anexo não encontrado.');
  const caminho = path.join(UPLOADS_DIR, String(id), rows[0].arquivo_armazenado);
  if (!fs.existsSync(caminho)) throw erro(404, 'O arquivo deste anexo não está mais disponível.');
  return { caminho, nome: rows[0].nome_original, mime: rows[0].mime };
}

async function excluirAnexo(id, anexoId, usuarioId) {
  const card = await carregarVisivel(id, usuarioId);
  const { rows } = await pool.query('SELECT * FROM projetos_anexos WHERE id = $1 AND card_id = $2', [anexoId, id]);
  const anexo = rows[0];
  if (!anexo) throw erro(404, 'Anexo não encontrado.');
  if (anexo.usuario_id !== usuarioId && card.criador_id !== usuarioId) throw erro(403, 'Só quem enviou o anexo ou o criador da atividade pode excluí-lo.');
  await pool.query('DELETE FROM projetos_anexos WHERE id = $1', [anexoId]);
  fs.unlink(path.join(UPLOADS_DIR, String(id), anexo.arquivo_armazenado), () => {});
  await registrar(id, usuarioId, 'REMOVEU_ANEXO', anexo.nome_original);
  return obter(id, usuarioId);
}

module.exports = {
  devolver,
  finalizar,
  listar,
  obter,
  criar,
  atualizar,
  excluir,
  mover,
  comentar,
  excluirComentario,
  anexar,
  arquivoDoAnexo,
  excluirAnexo,
  responsaveisElegiveis,
  bucketDe,
};
