const { guia } = require('./guia');
const { carteira } = require('./carteira');
const { obraTool } = require('./obra');
const { avancoTool, curvasTool } = require('./avanco');
const { versoesTool } = require('./versoes');
const { alertasTool } = require('./alertas');

// Ferramentas do módulo OBRA 360º do conector Horizon (só leitura), fechadas sobre a empresa do
// conector: o dashboard Obra 360º — Carteira de obras (cronograma, etapas, VGV, unidades, atraso,
// versões) e Avanço das Obras (PLS da Caixa, Curva S PLS e Curva S de Obras). Usam as MESMAS contas das
// telas e do Excel (cronograma-centros/*, dfc-avancos/avancoObras.js).
const TOOLS_OBRAS = [guia, carteira, obraTool, avancoTool, curvasTool, versoesTool, alertasTool];

module.exports = { TOOLS_OBRAS };
