// Lista canônica das telas do sistema, usada no cadastro de usuário pra
// montar o checklist de "telas que possui acesso" (perfil Básico) — o
// código de cada tela é a própria rota, igual ao que já existe no menu
// lateral (frontend/src/layout/Sidebar.jsx). Se uma tela nova for
// adicionada ao menu, adicione aqui também.
//
// Home não entra nessa lista: todo usuário sempre tem acesso a ela,
// independente de permissão ou do que for marcado aqui (ver temAcessoATela
// em utils/permissoes.js).
export const TELAS_SISTEMA = [
  {
    grupo: 'Cadastros',
    telas: [
      { codigo: '/cadastros/empresas', label: 'Empresas' },
      { codigo: '/cadastros/usuarios', label: 'Usuários' },
      { codigo: '/cadastros/mascaras', label: 'Máscaras' },
      { codigo: '/cadastros/centros-de-custo', label: 'Centros de Custos' },
      { codigo: '/cadastros/planos-financeiros', label: 'Planos Financeiros' },
      { codigo: '/cadastros/periodos', label: 'Períodos' },
      { codigo: '/cadastros/mapa-de-unidades', label: 'Mapa de Unidades' },
      // Contas Bancárias virou uma aba de "Saldo Contas Bancárias" (grupo Operações) — quem
      // precisa cadastrar/editar contas agora usa aquela permissão.
    ],
  },
  {
    grupo: 'Operações',
    telas: [
      { codigo: '/operacoes/projecoes-financeiras', label: 'Projeções Financeiras' },
      { codigo: '/operacoes/curva-de-vendas', label: 'Curva de Vendas' },
      { codigo: '/operacoes/curva-de-obras', label: 'Curva de Obras' },
      { codigo: '/operacoes/espiao-nfe-nfse', label: 'Espião NFe / NFSe' },
      { codigo: '/operacoes/saldo-contas-bancarias', label: 'Saldo Contas Bancárias' },
      { codigo: '/operacoes/repasses-cef', label: 'Repasses CEF' },
      { codigo: '/operacoes/gestao-de-cobrancas', label: 'Gestão de Cobranças' },
    ],
  },
  {
    grupo: 'Integrações',
    telas: [
      { codigo: '/integracoes/portal-das-construtoras', label: 'Portal das Construtoras' },
      { codigo: '/integracoes/prevision', label: 'Prevision' },
      { codigo: '/integracoes/sienge', label: 'Sienge' },
      { codigo: '/integracoes/construtor-de-vendas', label: 'Construtor de Vendas' },
      { codigo: '/integracoes/certificados-digitais', label: 'Certificados Digitais' },
      { codigo: '/integracoes/conta-azul', label: 'Conta Azul' },
      { codigo: '/integracoes/contas-bancarias', label: 'Convênios Bancários' },
      { codigo: '/integracoes/z-api', label: 'Whatsapp Z-API' },
      { codigo: '/integracoes/email', label: 'Email' },
      { codigo: '/integracoes/mcp', label: 'MCP' },
    ],
  },
];

export const TODOS_CODIGOS_TELAS = TELAS_SISTEMA.flatMap((grupo) => grupo.telas.map((t) => t.codigo));
