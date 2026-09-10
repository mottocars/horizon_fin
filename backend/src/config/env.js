require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3001,
  // Executável do Python usado pra gerar DANFE/DANFSe oficiais (brazilfiscalreport)
  // — 'python3' é o padrão certo pro container Docker (Linux); em dev no Windows,
  // defina PYTHON_BIN=python no .env se o comando 'python3' não existir na máquina.
  pythonBin: process.env.PYTHON_BIN || 'python3',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  mcp: {
    // Domínio público de verdade do backend (quem expõe é o Nginx do host
    // na VPS — ver docker-compose.yml) — usado só pra montar a URL completa
    // exibida em Integrações > MCP. Sem isso configurado em produção, a URL
    // ficaria com o endereço interno (127.0.0.1), inútil pro Claude
    // conectar de fora.
    publicBaseUrl: process.env.MCP_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`,
  },
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  seedUser: {
    nome: process.env.SEED_USER_NAME || 'Administrador',
    email: process.env.SEED_USER_EMAIL || 'admin@horizonfin.com',
    username: process.env.SEED_USER_USERNAME || 'admin',
    senha: process.env.SEED_USER_PASSWORD || '123456',
  },
};
