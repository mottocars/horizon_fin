const { Pool, types } = require('pg');
const env = require('./env');

// Coluna DATE (OID 1082) volta como o texto cru do banco ('AAAA-MM-DD'), não
// como Date. Sem isto o driver cria um Date à meia-noite do fuso do servidor
// e o JSON vira '2026-08-10T00:00:00.000Z' — que o navegador no Brasil
// (UTC−3) mostra como 09/08. DATE não tem fuso: o que está no banco é o que
// o sistema inteiro usa e mostra. TIMESTAMP/TIMESTAMPTZ continuam como Date.
types.setTypeParser(1082, (valor) => valor);

const pool = new Pool(env.db);

module.exports = pool;
