const T = require('../../config/telas');

// Módulos do conector Horizon (escopo HORIZON, /api/mcp/dfc/<token>, login do Horizon via OAuth): um
// conector só, e o Claude ganha as ferramentas de cada módulo marcado no cadastro (Integrações > MCP).
// Quem entra só recebe os módulos cujas telas tem liberadas (MASTER recebe todos). Altera Orçamento
// inclui a leitura do DFC (sem ela não dá pra escolher o que alterar).
const MODULOS = {
  DFC: {
    titulo: 'DFC CONSTRUTORAS',
    descricao: 'Leitura do DFC Construtoras (fluxo de caixa): realizado, projetado, saldos, Projeção CEF e as bases.',
    tela: T.DFC,
  },
  DFC_ORCAMENTO: {
    titulo: 'DFC CONSTRUTORAS (ALTERA ORÇAMENTO)',
    descricao: 'Inclui o DFC e permite inserir/atualizar valores do Orçamento (só HORIZON - INFORMADO) e salvar a versão.',
    tela: T.DFC,
    inclui: ['DFC'],
  },
  SALDOS_CONTAS: {
    titulo: 'SALDO DAS CONTAS BANCÁRIAS',
    descricao: 'Leitura do Saldo Contas Bancárias: saldos por conta e dia, totais, bloqueios, cheque especial, classificações e automações.',
    tela: T.SALDOS,
  },
  AGING: {
    titulo: 'AGING LIST (CONTAS A PAGAR E A RECEBER)',
    descricao:
      'Leitura do Aging List (dashboard Econômico Financeiro): contas a receber e a pagar em aberto por faixa, inadimplência, baixas já feitas e a projeção do caixa com o saldo das contas bancárias.',
    tela: T.ECONOMICO_FINANCEIRO,
  },
};

const CODIGOS = Object.keys(MODULOS);

// Valida, completa as dependências e ordena (ordem do catálogo).
function normalizarModulos(lista) {
  const marcados = new Set((lista || []).filter((m) => MODULOS[m]));
  for (const m of [...marcados]) for (const dep of MODULOS[m].inclui || []) marcados.add(dep);
  return CODIGOS.filter((m) => marcados.has(m));
}

// Módulos do conector que o usuário pode usar (pelas telas liberadas no cadastro dele).
function modulosDoUsuario(usuario, modulosConector) {
  if (usuario.permissao === 'MASTER') return normalizarModulos(modulosConector);
  const telas = usuario.telas_permitidas || [];
  return normalizarModulos(modulosConector).filter((m) => telas.includes(MODULOS[m].tela));
}

module.exports = { MODULOS, CODIGOS, normalizarModulos, modulosDoUsuario };
