#!/usr/bin/env node
// Cria as 2 primeiras novidades (Cadastros › Novidades) com os GIFs desta pasta — rodar uma vez,
// depois da migration database/migrations/2026-11-17-novidades.sql. Não recria nem altera uma
// novidade que já existe com o mesmo nome (pode rodar de novo sem duplicar).
//
// Público (o mesmo pensamento do cadastro, calculado com os dados do banco):
//   1. Seleção em massa → em cada empresa que usa a Gestão de Cobranças (tem etapa na Régua), os
//      usuários com a tela Gestão de Cobranças liberada;
//   2. Redistribuir     → em cada empresa, os Usuários Administradores da Gestão de Cobranças.
// Master vê todas as novidades de qualquer jeito.
//
// Uso (na pasta backend):  node scripts/novidades-iniciais.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

const TELA_COBRANCAS = '/operacoes/gestao-de-cobrancas';

const NOVIDADES = [
  {
    nome: 'Seleção em massa de clientes na gestão de cobrança',
    arquivo: 'selecao-em-massa.gif',
    descricao: [
      'Cobre todos os títulos de um cliente com um só gesto. Na Rotina, segure o clique na caixinha do WhatsApp, do e-mail ou da ligação e arraste pelos títulos do cliente: o Horizon reúne tudo em uma única mensagem, com cada título, parcela, vencimento e o total em aberto.',
      '',
      'O cliente recebe uma cobrança clara, e cada título fica registrado no Histórico de Etapas como se tivesse sido cobrado um a um.',
      '',
      '- Uma mensagem no lugar de seis: menos ruído para o cliente, menos cliques para a equipe',
      '- Só entram títulos do mesmo cliente, então não há risco de misturar cobranças',
      '- Texto próprio, sem boleto, editável na aba Comunicação',
    ].join('\n'),
    publico: async () => {
      const { rows } = await pool.query(
        `SELECT ue.empresa_id, array_agg(u.id ORDER BY u.id) AS usuario_ids
         FROM usuarios u
         JOIN usuarios_empresas ue ON ue.usuario_id = u.id
         WHERE u.ativo AND u.permissao <> 'MASTER' AND $1 = ANY(u.telas_permitidas)
           AND EXISTS (SELECT 1 FROM regua_cobranca_etapas e WHERE e.empresa_id = ue.empresa_id)
         GROUP BY ue.empresa_id ORDER BY ue.empresa_id`,
        [TELA_COBRANCAS]
      );
      return rows;
    },
  },
  {
    nome: 'Redistribuir clientes por atendente para administradores',
    arquivo: 'redistribuir.gif',
    descricao: [
      'Mude o atendente de um cliente em dois cliques. Quando um cliente precisa de outra pessoa, por uma negociação especial, uma troca de carteira ou uma atendente sobrecarregada, clique em ⇄ na linha dele na Rotina e escolha quem assume.',
      '',
      'A carteira e as tarefas de hoje em diante mudam na hora, e o que já foi feito continua no histórico de quem atendeu.',
      '',
      '- Exclusivo para os administradores da Gestão de Cobranças e usuários Master',
      '- Respeita férias: atendente pausada não aparece para escolha',
      '- Cada troca fica registrada no histórico da distribuição',
    ].join('\n'),
    publico: async () => {
      const { rows } = await pool.query(
        `SELECT a.empresa_id, array_agg(u.id ORDER BY u.id) AS usuario_ids
         FROM cobranca_administradores a JOIN usuarios u ON u.id = a.usuario_id
         WHERE u.ativo
         GROUP BY a.empresa_id ORDER BY a.empresa_id`
      );
      return rows;
    },
  },
];

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [i, n] of NOVIDADES.entries()) {
      const { rows: existe } = await client.query('SELECT id FROM novidades WHERE nome = $1', [n.nome]);
      if (existe.length) {
        console.log(`Já existe: "${n.nome}" (id ${existe[0].id}) — mantida como está.`);
        continue;
      }
      const buffer = fs.readFileSync(path.join(__dirname, 'novidades-iniciais', n.arquivo));
      // A 1ª um segundo antes da 2ª: a janela ao entrar mostra na ordem em que foram lançadas.
      const { rows } = await client.query(
        `INSERT INTO novidades (nome, descricao, publico, midia, midia_tipo, midia_nome, midia_tamanho, criado_em, atualizado_em)
         VALUES ($1, $2, 'EMPRESAS', $3, 'image/gif', $4, $5, NOW() - make_interval(secs => $6), NOW() - make_interval(secs => $6))
         RETURNING id`,
        [n.nome, n.descricao, buffer, n.arquivo, buffer.length, NOVIDADES.length - i]
      );
      const id = rows[0].id;
      const publico = await n.publico();
      for (const p of publico) {
        await client.query('INSERT INTO novidades_empresas (novidade_id, empresa_id, todos_usuarios) VALUES ($1, $2, FALSE)', [id, p.empresa_id]);
        await client.query(
          `INSERT INTO novidades_usuarios (novidade_id, empresa_id, usuario_id) SELECT $1, $2, x FROM unnest($3::int[]) AS x`,
          [id, p.empresa_id, p.usuario_ids]
        );
      }
      const pessoas = publico.reduce((s, p) => s + p.usuario_ids.length, 0);
      console.log(`Criada: "${n.nome}" (id ${id}) — ${pessoas} usuário(s) em ${publico.length} empresa(s), além dos Masters.`);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
