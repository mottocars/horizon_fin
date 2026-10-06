// Códigos das telas do sistema — os mesmos gravados em
// usuarios.telas_permitidas (perfil Básico) e listados no cadastro de
// usuário (frontend/src/config/telasSistema.js). Usados pelo exigirTela
// de server.js. Tela nova no menu: adicionar aqui e lá.
module.exports = {
  EMPRESAS: '/cadastros/empresas',
  USUARIOS: '/cadastros/usuarios',
  MASCARAS: '/cadastros/mascaras',
  CENTROS_CUSTO: '/cadastros/centros-de-custo',
  PLANOS_FINANCEIROS: '/cadastros/planos-financeiros',

  DRE: '/operacoes/dre-gerencial',
  ESPIAO: '/operacoes/espiao-nfe-nfse',
  SALDOS: '/operacoes/saldo-contas-bancarias',
  REPASSES: '/operacoes/repasses-cef',
  COBRANCAS: '/operacoes/gestao-de-cobrancas',

  MONITOR: '/integracoes/monitor',
  PORTAL: '/integracoes/portal-das-construtoras',
  PREVISION: '/integracoes/prevision',
  SIENGE: '/integracoes/sienge',
  CONSTRUTOR_VENDAS: '/integracoes/construtor-de-vendas',
  CERTIFICADOS: '/integracoes/certificados-digitais',
  CONVENIOS: '/integracoes/contas-bancarias',
  ZAPI: '/integracoes/z-api',
  EMAIL: '/integracoes/email',
  MCP: '/integracoes/mcp',
  ACTIOON: '/integracoes/actioon',
  BANCO_DADOS: '/integracoes/banco-dados',

  METRICAS: '/relatorios/metricas-de-uso',
  MASA: '/relatorios/empreendimentos-masa',
  ACERVO_NOTAS: '/relatorios/notas-pendentes',
  EXTRATOS: '/relatorios/extratos-bancarios',
};
