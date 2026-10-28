require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3001,
  // Executável do Python usado pra gerar DANFE/DANFSe oficiais (brazilfiscalreport)
  // — 'python3' é o padrão certo pro container Docker (Linux); em dev no Windows,
  // defina PYTHON_BIN=python no .env se o comando 'python3' não existir na máquina.
  pythonBin: process.env.PYTHON_BIN || 'python3',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  // false no ambiente de desenvolvimento local: não sobe os agendadores (Espião NF-e e Monitor
  // de Integrações). Sem a variável (produção), continuam ligados.
  agendadoresAtivos: process.env.AGENDADORES_ATIVOS !== 'false',
  // false no ambiente de desenvolvimento local: os alertas de segurança continuam sendo gravados
  // (Métricas de Uso), mas não mandam WhatsApp — os testes locais com navegador automatizado e
  // scripts gerariam alerta de verdade no celular. Sem a variável (produção), manda.
  alertasSegurancaWhatsapp: process.env.ALERTAS_SEGURANCA_WHATSAPP !== 'false',
  mcp: {
    // Domínio público de verdade do backend (quem expõe é o Nginx do host
    // na VPS — ver docker-compose.yml) — usado só pra montar a URL completa
    // exibida em Integrações > MCP. Sem isso configurado em produção, a URL
    // ficaria com o endereço interno (127.0.0.1), inútil pro Claude
    // conectar de fora.
    publicBaseUrl: process.env.MCP_PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`,
  },
  apiHorizon: {
    // Endereço público da API Horizon (sem o /v1) — monta o linkXml das notas. Produção:
    // API_HORIZON_PUBLIC_URL=https://api.horizonhub.com.br (o Nginx do host entrega /v1/ para
    // /api/v1/ deste backend).
    publicUrl: (process.env.API_HORIZON_PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}/api`).replace(/\/$/, ''),
    // Origens que podem chamar a API pelo navegador (o "Testar" da documentação). Em produção a
    // documentação fica no mesmo domínio da API; em dev, o Vite de api-docs/ (porta 5182).
    origensDocs: (process.env.API_HORIZON_DOCS_ORIGINS || 'http://localhost:5182,https://api.horizonhub.com.br')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },
  itau: {
    // Chave AES-256-GCM (32 bytes, em hex de 64 caracteres ou base64) que criptografa a chave
    // privada, o client_secret e a resposta bruta das conexões API Itaú. Só existe aqui (env) —
    // nunca no código nem no banco. Perdê-la torna os certificados gravados inutilizáveis.
    // Lida na hora (getter) pra os testes poderem definir a variável depois do require.
    get encryptionKey() {
      return process.env.ITAU_ENCRYPTION_KEY || '';
    },
    // Endereço da API de Extrato Conta Corrente do Itaú (ver integracoes-itau/itau.sts.js) —
    // vazio usa o padrão do código. Placeholders: {statementId}, {dataInicio}, {dataFim}.
    extratoUrl: process.env.ITAU_EXTRATO_URL || '',
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
