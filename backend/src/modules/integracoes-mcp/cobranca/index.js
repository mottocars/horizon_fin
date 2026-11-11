const guia = require('./guia');
const { configuracaoTool } = require('./configuracao');
const { clustersTool, clienteTool } = require('./clientes');
const { rotinaTool, parcelaTool } = require('./rotina');
const { distribuicaoTool } = require('./distribuicao');
const { desempenhoTool } = require('./desempenho');
const { carteiraTool } = require('./carteira');
const { atividadesTool } = require('./atividades');
const sql = require('./sql');

// Ferramentas do módulo GESTÃO DE COBRANÇAS do conector Horizon (só leitura), fechadas sobre a empresa do
// conector: as regras (guia) e a configuração, os clusters e o Motor de Risco, cada cliente e cada parcela,
// a Rotina, a distribuição, a Gestão das Parcelas, o relatório Desempenho da Cobrança, o que aconteceu num
// período e o SQL de leitura nas views mcp_* da cobrança. Todas usam os MESMOS services das telas.
const TOOLS_COBRANCA = [
  guia,
  configuracaoTool,
  clustersTool,
  clienteTool,
  parcelaTool,
  rotinaTool,
  distribuicaoTool,
  carteiraTool,
  desempenhoTool,
  atividadesTool,
  sql.descrever,
  sql.consultar,
];

module.exports = { TOOLS_COBRANCA };
