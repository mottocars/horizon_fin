const USUARIOS_NOVO = '/cadastros/usuarios/novo';

// Master enxerga todas as telas. Básico só enxerga as telas explicitamente
// marcadas em telas_permitidas — exceto a Home, que todo usuário sempre tem
// acesso, independente de permissão ou seleção. Se liberarem "Usuários" pra
// um Básico, ele passa a poder listar, criar e editar usuários normalmente
// (sem exceção adicional aqui).
// Páginas próprias (rota separada) que pertencem a uma aba restrita de outra
// tela: valem as regras daquela aba (ver podeVerAba).
const PAGINAS_DE_ABA = [
  // Detalhe da conta — aba Contas Bancárias do Saldo Contas Bancárias.
  { prefixo: '/cadastros/contas-bancarias/', tela: '/operacoes/saldo-contas-bancarias', nivel: 'ADMINISTRADOR' },
  // "Como funciona a distribuição" — aba Régua de Cobrança.
  {
    prefixo: '/operacoes/gestao-de-cobrancas/distribuicao-automatica',
    tela: '/operacoes/gestao-de-cobrancas',
    nivel: 'ADMINISTRADOR',
  },
];

export function temAcessoATela(user, pathname) {
  if (!user) return false;
  if (pathname === '/' || pathname === '/meu-perfil') return true;
  if (user.permissao === 'MASTER') return true;

  const paginaDeAba = PAGINAS_DE_ABA.find((p) => pathname.startsWith(p.prefixo));
  if (paginaDeAba) {
    return temAcessoATela(user, paginaDeAba.tela) && podeVerAba(user, paginaDeAba.tela, paginaDeAba.nivel);
  }

  const telas = user.telas_permitidas || [];
  return telas.some((codigo) => pathname === codigo || pathname.startsWith(`${codigo}/`));
}

// Usada nas telas onde o botão de criar usuário aparece — segue a mesma
// regra de acesso à tela de Usuários (se ele acessa, ele cria).
export function podeCriarUsuario(user) {
  return temAcessoATela(user, USUARIOS_NOVO);
}

// Nível do usuário dentro de uma tela liberada: Comum ou Administrador
// (marcado no cadastro do usuário, em telas_administrador). Master é
// Administrador de tudo. O que o Administrador pode a mais é decidido em
// cada tela — o backend confere a mesma regra (acesso.middleware.js).
export function ehAdministradorDaTela(user, codigo) {
  if (!user) return false;
  if (user.permissao === 'MASTER') return true;
  return (user.telas_administrador || []).includes(codigo);
}

// Abas restritas dentro de uma tela: a aba declara `nivel: 'ADMINISTRADOR'`
// (Administrador da tela, ou Master) ou `nivel: 'MASTER'` (só Master); sem
// `nivel`, todo mundo que acessa a tela vê. O backend barra as mesmas
// operações (ver acesso.middleware.js::exigirAdministradorDaTela).
export function podeVerAba(user, codigoTela, nivel) {
  if (!nivel) return true;
  if (nivel === 'MASTER') return user?.permissao === 'MASTER';
  return ehAdministradorDaTela(user, codigoTela);
}

// Filtra a lista de abas (formato de components/Tabs.jsx) pelo nível do
// usuário e tira os divisores que sobrarem sozinhos (no começo, no fim ou
// dois seguidos).
export function filtrarAbas(user, codigoTela, abas) {
  const visiveis = abas.filter((aba) => aba.divider || podeVerAba(user, codigoTela, aba.nivel));
  return visiveis.filter(
    (aba, i) => !aba.divider || (i > 0 && i < visiveis.length - 1 && !visiveis[i + 1].divider)
  );
}
