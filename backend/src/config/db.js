const { AsyncLocalStorage } = require('async_hooks');
const { Pool, types } = require('pg');
const env = require('./env');

// Coluna DATE (OID 1082) volta como o texto cru do banco ('AAAA-MM-DD'), não
// como Date. Sem isto o driver cria um Date à meia-noite do fuso do servidor
// e o JSON vira '2026-08-10T00:00:00.000Z' — que o navegador no Brasil
// (UTC−3) mostra como 09/08. DATE não tem fuso: o que está no banco é o que
// o sistema inteiro usa e mostra. TIMESTAMP/TIMESTAMPTZ continuam como Date.
types.setTypeParser(1082, (valor) => valor);

const base = new Pool(env.db);

// Versões da DRE (modules/dre-versoes): uma versão salva guarda a cópia das tabelas que a DRE lê num
// schema próprio do Postgres. Um pedido que roda "dentro" de uma versão (contexto.js, via
// AsyncLocalStorage) usa um pool cujo search_path põe esses schemas na frente do public — as MESMAS
// consultas do sistema passam a ler a cópia (as tabelas que não estão na cópia continuam vindo do
// public). Fora de um contexto, tudo segue no pool de sempre.
const contexto = new AsyncLocalStorage();
const pools = new Map();

function poolDoCaminho(searchPath) {
  let p = pools.get(searchPath);
  if (!p) {
    p = new Pool({ ...env.db, max: 4, idleTimeoutMillis: 30000, options: `-c search_path=${searchPath}` });
    // Conexão ociosa derrubada (ex.: schema apagado ao excluir a versão) não pode derrubar o processo.
    p.on('error', () => {});
    pools.set(searchPath, p);
  }
  return p;
}

function poolAtual() {
  const caminho = contexto.getStore()?.searchPath;
  return caminho ? poolDoCaminho(caminho) : base;
}

const pool = {
  query: (...args) => poolAtual().query(...args),
  connect: (...args) => poolAtual().connect(...args),
  end: () => Promise.all([base.end(), ...[...pools.values()].map((p) => p.end())]),
  // O pool de sempre (public), ignorando o contexto — pra gravar/ler o que é da versão em si.
  base,
  // Roda `fn` dentro de um contexto ({ searchPath, ... }); `contextoAtual()` lê o contexto do pedido.
  comContexto: (store, fn) => contexto.run(store, fn),
  contextoAtual: () => contexto.getStore() || null,
  // Ao apagar uma versão: fecha as conexões que apontam pros schemas dela.
  descartarCaminhos(schema) {
    [...pools.keys()]
      .filter((k) => k.split(',').includes(schema))
      .forEach((k) => {
        pools.get(k).end().catch(() => {});
        pools.delete(k);
      });
  },
};

module.exports = pool;
