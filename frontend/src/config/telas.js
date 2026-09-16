// Catálogo das telas "de primeiro nível" do sistema — usado tanto pro
// título/subtítulo do Topbar (ver AppShell) quanto pra normalizar qual tela
// foi acessada nos logs de uso (ver hooks/useLogAcesso.js): uma rota de
// detalhe como /cadastros/empresas/42 é sempre registrada como pertencendo
// à tela /cadastros/empresas, e não como uma tela própria por empresa —
// senão o ranking de Métricas de Uso ficaria fragmentado por registro em
// vez de agregado por tela.
export const TELAS_SISTEMA = {
  '/': { title: 'Home', subtitle: 'Visão geral das suas atividades' },
  '/meu-perfil': { title: 'Meu Perfil', subtitle: 'Altere seus dados de acesso' },
  '/operacoes/projecoes-financeiras': { title: 'Projeções Financeiras', subtitle: 'Operações — Projeções Financeiras' },
  '/operacoes/curva-de-vendas': { title: 'Curva de Vendas', subtitle: 'Operações — Curva de Vendas' },
  '/operacoes/curva-de-obras': { title: 'Curva de Obras', subtitle: 'Operações — Curva de Obras' },
  '/operacoes/espiao-nfe-nfse': { title: 'Espião NFe / NFSe', subtitle: 'Operações — Espião NFe / NFSe' },
  '/operacoes/saldo-contas-bancarias': { title: 'Saldo Contas Bancárias', subtitle: 'Operações — Saldo Contas Bancárias' },
  '/operacoes/repasses-cef': { title: 'Repasses CEF', subtitle: 'Operações — Repasses CEF' },
  '/operacoes/gestao-de-cobrancas': { title: 'Gestão de Cobranças', subtitle: 'Operações — Gestão de Cobranças' },
  '/cadastros/empresas': { title: 'Empresas', subtitle: 'Cadastros — Empresas' },
  '/cadastros/usuarios': { title: 'Usuários', subtitle: 'Cadastros — Usuários' },
  '/cadastros/mascaras': { title: 'Máscaras', subtitle: 'Cadastros — Máscaras' },
  '/cadastros/centros-de-custo': { title: 'Centros de Custos', subtitle: 'Cadastros — Centros de Custos' },
  '/cadastros/planos-financeiros': { title: 'Planos Financeiros', subtitle: 'Cadastros — Planos Financeiros' },
  '/cadastros/periodos': { title: 'Períodos', subtitle: 'Cadastros — Períodos' },
  '/cadastros/mapa-de-unidades': { title: 'Mapa de Unidades', subtitle: 'Cadastros — Mapa de Unidades' },
  '/cadastros/contas-bancarias': { title: 'Contas Bancárias', subtitle: 'Cadastros — Contas Bancárias' },
  '/integracoes/portal-das-construtoras': { title: 'Portal das Construtoras', subtitle: 'Integrações — Portal das Construtoras' },
  '/integracoes/sienge': { title: 'Sienge', subtitle: 'Integrações — Sienge' },
  '/integracoes/prevision': { title: 'Prevision', subtitle: 'Integrações — Prevision' },
  '/integracoes/construtor-de-vendas': { title: 'Construtor de Vendas', subtitle: 'Integrações — Construtor de Vendas' },
  '/integracoes/certificados-digitais': { title: 'Certificados Digitais', subtitle: 'Integrações — Certificados Digitais' },
  '/integracoes/conta-azul': { title: 'Conta Azul', subtitle: 'Integrações — Conta Azul' },
  '/integracoes/contas-bancarias': { title: 'Contas Bancárias', subtitle: 'Integrações — Contas Bancárias' },
  '/integracoes/z-api': { title: 'Whatsapp Z-API', subtitle: 'Integrações — Whatsapp Z-API' },
  '/integracoes/email': { title: 'Email', subtitle: 'Integrações — Email' },
  '/integracoes/mcp': { title: 'MCP', subtitle: 'Integrações — MCP' },
  '/relatorios/metricas-de-uso': { title: 'Métricas de Uso', subtitle: 'Relatórios — Métricas de Uso' },
};

// Acha, entre as chaves de TELAS_SISTEMA, a mais específica (mais longa)
// que é prefixo do pathname — assim /cadastros/empresas/42/editar (ou
// qualquer rota de detalhe futura) sempre resolve pra tela-mãe
// /cadastros/empresas, nunca pra Home (que bateria em tudo como prefixo
// vazio se não fosse tratada à parte).
export function resolveTelaCanonica(pathname) {
  let melhor = null;
  for (const chave of Object.keys(TELAS_SISTEMA)) {
    const bate = chave === '/' ? pathname === '/' : (pathname === chave || pathname.startsWith(`${chave}/`));
    if (bate && (!melhor || chave.length > melhor.length)) melhor = chave;
  }
  return melhor;
}
