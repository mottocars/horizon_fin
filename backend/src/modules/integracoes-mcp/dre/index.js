const guia = require('./guia');
const { demonstrativoTool, explicar } = require('./demonstrativo');
const { painelTool, pocTool, simularTool } = require('./painel');
const { lancamentos, unidadesTool, fora, auditoria } = require('./auditoria');

// Ferramentas do módulo DRE GERENCIAL do conector Horizon (só leitura), fechadas sobre a empresa do
// conector: a DRE (motor de dre-demonstrativo), a memória de cálculo e as bases (as do Excel de auditoria,
// dre-exportacao) e o dashboard Demonstração do Resultado (painelDre/modelo, cópia gerada da tela).
const TOOLS_DRE = [guia, demonstrativoTool, explicar, pocTool, lancamentos, unidadesTool, fora, auditoria, painelTool, simularTool];

module.exports = { TOOLS_DRE };
