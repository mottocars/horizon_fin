const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const env = require('../config/env');

async function seed() {
  const senhaHash = await bcrypt.hash(env.seedUser.senha, 10);

  // Master não precisa de empresa vinculada (acesso total, sem restrição) —
  // por isso não insere nada em usuarios_empresas aqui. primeiro_acesso já
  // nasce FALSE porque é um usuário de bootstrap (sem celular cadastrado
  // pra "confirmar", por exemplo) — não passa pela tela de primeiro acesso.
  await pool.query(
    `INSERT INTO usuarios (nome, email, username, senha_hash, permissao, primeiro_acesso)
     VALUES ($1, $2, $3, $4, 'MASTER', FALSE)
     ON CONFLICT (username) DO NOTHING`,
    [env.seedUser.nome, env.seedUser.email, env.seedUser.username, senhaHash]
  );

  console.log('Usuário Master pronto:');
  console.log(`  usuário: ${env.seedUser.username}`);
  console.log(`  senha: ${env.seedUser.senha}`);

  await pool.end();
}

seed().catch((err) => {
  console.error('Erro ao rodar seed:', err);
  process.exit(1);
});
